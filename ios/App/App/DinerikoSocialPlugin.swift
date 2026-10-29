import Foundation
import Capacitor
import AuthenticationServices
import CryptoKit
import UIKit

/* Entrar con Apple o Google desde la app de iPhone. Devuelve solo el id_token: quién es la persona.
   Los datos siguen cifrados con el código de Dineriko, que nunca pasa por aquí.
   · Apple: la hoja nativa del sistema (Face ID y la cuenta del iPhone).
   · Google: su página en una ventana segura del sistema (ASWebAuthenticationSession), con PKCE,
     sin SDK de Google dentro de la app. */
@objc(DinerikoSocialPlugin)
public class DinerikoSocialPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding, ASWebAuthenticationPresentationContextProviding {

    public let identifier = "DinerikoSocialPlugin"
    public let jsName = "DinerikoSocial"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "apple", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "google", returnType: CAPPluginReturnPromise),
    ]

    private var llamadaApple: CAPPluginCall?
    private var sesionWeb: ASWebAuthenticationSession?

    private func sha256Hex(_ s: String) -> String {
        SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    private func base64url(_ d: Data) -> String {
        d.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    private func aleatorio(_ n: Int) -> String {
        var b = [UInt8](repeating: 0, count: n)
        _ = SecRandomCopyBytes(kSecRandomDefault, n, &b)
        return base64url(Data(b))
    }
    private func ventana() -> ASPresentationAnchor {
        if let w = bridge?.viewController?.view.window { return w }
        return UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }

    // ── Apple ──
    @objc func apple(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce") else { call.reject("falta-nonce"); return }
        DispatchQueue.main.async {
            let req = ASAuthorizationAppleIDProvider().createRequest()
            req.requestedScopes = [.email]
            req.nonce = self.sha256Hex(nonce) // Apple guarda el resumen; el servidor lo comprueba igual
            let c = ASAuthorizationController(authorizationRequests: [req])
            c.delegate = self
            c.presentationContextProvider = self
            self.llamadaApple = call
            c.performRequests()
        }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
              let datos = cred.identityToken, let token = String(data: datos, encoding: .utf8) else {
            llamadaApple?.reject("sin-token"); llamadaApple = nil; return
        }
        llamadaApple?.resolve(["idToken": token])
        llamadaApple = nil
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if let e = error as? ASAuthorizationError, e.code == .canceled {
            llamadaApple?.reject("cancelado", "1001")
        } else {
            llamadaApple?.reject(error.localizedDescription)
        }
        llamadaApple = nil
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { ventana() }
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { ventana() }

    // ── Google ──
    @objc func google(_ call: CAPPluginCall) {
        guard let clientId = call.getString("clientId"), !clientId.isEmpty, let nonce = call.getString("nonce") else {
            call.reject("faltan-datos"); return
        }
        // "1234-abc.apps.googleusercontent.com" → esquema de vuelta "com.googleusercontent.apps.1234-abc"
        let esquema = "com.googleusercontent.apps." + clientId.replacingOccurrences(of: ".apps.googleusercontent.com", with: "")
        let vuelta = esquema + ":/oauth2redirect"
        let verificador = aleatorio(32)
        let reto = base64url(Data(SHA256.hash(data: Data(verificador.utf8))))
        let estado = aleatorio(16)

        var url = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        url.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: vuelta),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email"),
            URLQueryItem(name: "code_challenge", value: reto),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "nonce", value: nonce),
            URLQueryItem(name: "state", value: estado),
            URLQueryItem(name: "prompt", value: "select_account"),
        ]

        DispatchQueue.main.async {
            let sesion = ASWebAuthenticationSession(url: url.url!, callbackURLScheme: esquema) { [weak self] vueltaUrl, error in
                self?.sesionWeb = nil
                if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                    call.reject("cancelado", "1001"); return
                }
                guard let vueltaUrl = vueltaUrl,
                      let items = URLComponents(url: vueltaUrl, resolvingAgainstBaseURL: false)?.queryItems,
                      items.first(where: { $0.name == "state" })?.value == estado,
                      let codigo = items.first(where: { $0.name == "code" })?.value else {
                    call.reject(error?.localizedDescription ?? "sin-codigo"); return
                }
                self?.canjear(call: call, clientId: clientId, codigo: codigo, verificador: verificador, vuelta: vuelta)
            }
            sesion.presentationContextProvider = self
            self.sesionWeb = sesion
            if !sesion.start() { call.reject("no-se-pudo-abrir") }
        }
    }

    /* el código de un solo uso se cambia por el id_token; con PKCE no hace falta ningún secreto en la app */
    private func canjear(call: CAPPluginCall, clientId: String, codigo: String, verificador: String, vuelta: String) {
        var req = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var cuerpo = URLComponents()
        cuerpo.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "code", value: codigo),
            URLQueryItem(name: "code_verifier", value: verificador),
            URLQueryItem(name: "grant_type", value: "authorization_code"),
            URLQueryItem(name: "redirect_uri", value: vuelta),
        ]
        req.httpBody = (cuerpo.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B").data(using: .utf8)
        URLSession.shared.dataTask(with: req) { datos, _, error in
            guard let datos = datos,
                  let json = try? JSONSerialization.jsonObject(with: datos) as? [String: Any],
                  let token = json["id_token"] as? String else {
                call.reject(error?.localizedDescription ?? "canje-fallido"); return
            }
            call.resolve(["idToken": token])
        }.resume()
    }
}
