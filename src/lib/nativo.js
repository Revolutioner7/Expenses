/* ── app de iPhone (Capacitor) ──
   Todo lo que cambia cuando Dineriko corre como app nativa y no como web. En la web estas
   funciones no hacen nada o devuelven false, así que dineriko.com se comporta igual que siempre.

   Face ID nativo: dentro de la app no hay passkeys (no hay dominio web), así que el secreto de
   32 bytes que en la web da el passkey (extensión PRF) aquí se genera al azar y se guarda en el
   llavero del iPhone protegido por Face ID (SecAccessControl, biometryCurrentSet). Se usa
   exactamente igual que el secreto PRF: envuelve la clave de los datos (ver crypto.js). */
import { Capacitor } from "@capacitor/core";
import { NativeBiometric, AccessControl } from "@capgo/capacitor-native-biometric";
import { Share } from "@capacitor/share";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { LocalNotifications } from "@capacitor/local-notifications";

export const esNativo = () => {
  try { return Capacitor.isNativePlatform(); } catch (e) { return false; }
};

/* prefijo de los credId que viven en el llavero, para no confundirlos nunca con un passkey */
export const PREFIJO_LLAVERO = "kc:";
const servidor = (credId) => `dineriko.llavero.${credId.slice(PREFIJO_LLAVERO.length)}`;

const b64 = (u) => { let s = ""; for (const c of u) s += String.fromCharCode(c); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/* error con el mismo nombre que da WebAuthn al cancelar, para que el resto de la app no distinga */
const cancelado = () => Object.assign(new Error("cancelado"), { name: "NotAllowedError" });
const esCancelacion = (e) => String(e?.code) === "16" || /cancel/i.test(e?.message || "");

export async function bioDisponibleNativo() {
  try {
    const r = await NativeBiometric.isAvailable();
    return !!r?.isAvailable;
  } catch (e) { return false; }
}

export async function crearSecretoBio() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  const credId = PREFIJO_LLAVERO + id;
  try {
    await NativeBiometric.setCredentials({
      server: servidor(credId), username: "dineriko", password: b64(bytes),
      accessControl: AccessControl.BIOMETRY_CURRENT_SET,
    });
  } catch (e) {
    if (esCancelacion(e)) throw cancelado();
    throw e;
  }
  // se lee una vez para confirmar que Face ID funciona antes de dar la protección por buena
  return { credId, bytes: await obtenerSecretoBio(credId) };
}

export async function obtenerSecretoBio(credId) {
  try {
    const r = await NativeBiometric.getSecureCredentials({ server: servidor(credId), reason: "Abrir Dineriko" });
    const bytes = unb64(r.password);
    if (bytes.length !== 32) throw new Error("secreto-invalido");
    return bytes;
  } catch (e) {
    if (esCancelacion(e)) throw cancelado();
    throw e;
  }
}

export async function borrarSecretoBio(credId) {
  if (!credId?.startsWith(PREFIJO_LLAVERO)) return;
  try { await NativeBiometric.deleteCredentials({ server: servidor(credId) }); } catch (e) {}
}

/* copia de seguridad: se escribe en la caché de la app y se abre la hoja de compartir del iPhone
   (Archivos, iCloud Drive, AirDrop, Mail…). Devuelve true si se compartió, false si se canceló. */
export async function compartirArchivoNativo(nombre, texto) {
  const { uri } = await Filesystem.writeFile({ path: nombre, data: texto, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: nombre, files: [uri] });
    return true;
  } catch (e) {
    if (/cancel/i.test(e?.message || "")) return false;
    throw e;
  }
}

export async function compartirTextoNativo(titulo, texto) {
  try { await Share.share({ title: titulo, text: texto }); return "compartido"; }
  catch (e) { return /cancel/i.test(e?.message || "") ? "cancelado" : "error"; }
}

/* recordatorio diario para anotar gastos: una sola notificación local que se repite a la hora
   elegida. No pasa por ningún servidor: la programa el propio iPhone. */
const ID_RECORDATORIO = 4242;

export async function programarRecordatorio(hora, minuto) {
  const permiso = await LocalNotifications.requestPermissions();
  if (permiso.display !== "granted") return false;
  await LocalNotifications.cancel({ notifications: [{ id: ID_RECORDATORIO }] }).catch(() => {});
  await LocalNotifications.schedule({ notifications: [{
    id: ID_RECORDATORIO,
    title: "Dineriko",
    body: "¿Has gastado algo hoy? Anotarlo son diez segundos.",
    schedule: { on: { hour: hora, minute: minuto }, allowWhileIdle: true },
  }] });
  return true;
}

export async function quitarRecordatorio() {
  try { await LocalNotifications.cancel({ notifications: [{ id: ID_RECORDATORIO }] }); } catch (e) {}
}
