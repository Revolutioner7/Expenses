import UIKit
import Capacitor

/* La pantalla de la app. Solo existe para registrar los plugins propios de Dineriko (los que no
   vienen de npm), como el de entrar con Apple o Google. */
class DinerikoViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(DinerikoSocialPlugin())
    }
}
