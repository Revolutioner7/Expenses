/* ── Entrar con Apple o Google: conseguir el "carné" (id_token) ──
   Apple o Google solo confirman quién es la persona. No se carga ningún script suyo en la app
   (podría leer los datos ya descifrados): en la web se abre su página en una ventana aparte y el
   token vuelve por oauth.html; en el iPhone lo hace el propio sistema (plugin nativo DinerikoSocial).

   Devuelve { provider, idToken, nonce } o lanza un error con codigo "cancelado" o "social". */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { API_URL, GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, APPLE_SERVICE_ID } from "../constants.js";
import { esNativo } from "./nativo.js";

const Nativo = registerPlugin("DinerikoSocial");
const CANAL = "dineriko-oauth";
const CADUCA_MS = 10 * 60000;

export class ErrorSocial extends Error {
  constructor(codigo, detalle) { super(codigo); this.codigo = codigo; this.detalle = detalle; }
}

const aleatorio = (n) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64url = (s) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/* qué botones se enseñan: solo los que ya están configurados */
export function socialDisponible(provider) {
  if (provider === "apple") return esNativo() ? Capacitor.getPlatform() === "ios" : !!APPLE_SERVICE_ID && enDominioPropio();
  if (provider === "google") return esNativo() ? !!GOOGLE_IOS_CLIENT_ID : !!GOOGLE_WEB_CLIENT_ID && enDominioPropio();
  return false;
}
/* Apple y Google solo devuelven el token a la dirección registrada (dineriko.com) */
const enDominioPropio = () => typeof location !== "undefined" && /^https:\/\/(www\.)?dineriko\.com$/.test(location.origin);

/* ── web ── */
function urlAutorizacion(provider, state, nonce) {
  const vuelta = `${location.origin}/oauth.html`;
  if (provider === "google") {
    return "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
      client_id: GOOGLE_WEB_CLIENT_ID, redirect_uri: vuelta, response_type: "id_token",
      scope: "openid email", nonce, state, prompt: "select_account",
    });
  }
  // Apple, con el email, solo sabe devolver el token con un formulario: lo recoge el servidor y lo reenvía a oauth.html
  return "https://appleid.apple.com/auth/authorize?" + new URLSearchParams({
    client_id: APPLE_SERVICE_ID, redirect_uri: `${API_URL}/auth/apple/callback`, response_type: "code id_token",
    response_mode: "form_post", scope: "email", nonce, state,
  });
}

/* No se vigila si la ventana se cierra: con las protecciones de Google el navegador la da por
   cerrada aunque siga abierta. La pantalla ofrece "Cancelar", y a los 5 minutos se abandona sola. */
function esperarVentana(state) {
  return new Promise((resolver, rechazar) => {
    let canal = null;
    const fin = (f) => { try { canal?.close(); } catch (e) {} window.removeEventListener("storage", alGuardar); clearTimeout(limite); f(); };
    const recibir = (r) => {
      if (!r || r.state !== state) return;
      fin(() => (r.idToken ? resolver(r.idToken) : rechazar(new ErrorSocial(/denied|cancel/.test(r.error || "") ? "cancelado" : "social"))));
    };
    const alGuardar = (e) => { if (e.key === "dineriko-oauth-popup" && e.newValue) { try { recibir(JSON.parse(e.newValue)); } catch (x) {} } };
    try { canal = new BroadcastChannel(CANAL); canal.onmessage = (e) => recibir(e.data); } catch (e) {}
    window.addEventListener("storage", alGuardar);
    const limite = setTimeout(() => fin(() => rechazar(new ErrorSocial("cancelado"))), 5 * 60000);
  });
}

async function webSocial(provider) {
  const nonce = aleatorio(24);
  const base = `${aleatorio(16)}.%m.${b64url(location.origin)}.${provider}`;
  // la ventana se abre ya, dentro del toque, para que el navegador no la bloquee
  const ventana = window.open("about:blank", "dineriko-oauth", "width=500,height=650");
  if (ventana) {
    const state = base.replace("%m", "p");
    ventana.location.href = urlAutorizacion(provider, state, nonce);
    return { provider, nonce, idToken: await esperarVentana(state) };
  }
  // ventana bloqueada: se va en la misma pestaña y al volver la app lo retoma (ver pendienteSocial)
  const state = base.replace("%m", "r");
  sessionStorage.setItem("dineriko-oauth-intento", JSON.stringify({ state, nonce, provider, at: Date.now() }));
  location.assign(urlAutorizacion(provider, state, nonce));
  return new Promise(() => {}); // la página se va
}

/* al arrancar: si se volvió de Apple/Google en la misma pestaña, el token que quedó pendiente */
export function pendienteSocial() {
  try {
    const r = JSON.parse(sessionStorage.getItem("dineriko-oauth") || "null");
    const intento = JSON.parse(sessionStorage.getItem("dineriko-oauth-intento") || "null");
    sessionStorage.removeItem("dineriko-oauth");
    sessionStorage.removeItem("dineriko-oauth-intento");
    if (!r || !intento || r.state !== intento.state || Date.now() - intento.at > CADUCA_MS || !r.idToken) return null;
    return { provider: intento.provider, idToken: r.idToken, nonce: intento.nonce };
  } catch (e) { return null; }
}

/* ── iPhone ── */
async function nativoSocial(provider) {
  const nonce = aleatorio(24);
  try {
    const r = provider === "apple"
      ? await Nativo.apple({ nonce })
      : await Nativo.google({ clientId: GOOGLE_IOS_CLIENT_ID, nonce });
    if (!r?.idToken) throw new ErrorSocial("social");
    return { provider, idToken: r.idToken, nonce };
  } catch (e) {
    if (e instanceof ErrorSocial) throw e;
    // el detalle (código y mensaje del sistema) se enseña en pequeño para poder diagnosticar
    throw new ErrorSocial(/cancel/i.test(e?.message || "") || String(e?.code) === "1001" ? "cancelado" : "social",
      [e?.code, e?.message].filter(Boolean).join(" · ").slice(0, 200));
  }
}

export function conseguirToken(provider) {
  return esNativo() ? nativoSocial(provider) : webSocial(provider);
}
