/* ── "Lo he perdido todo": la llave de repuesto partida en dos ──
   Al crear la cuenta (si la persona no lo desactiva), el dispositivo:
     1. genera dos piezas al azar, A y S, y una llave de repuesto E = HKDF(A ‖ S);
     2. envuelve la llave de datos con E (wrapped.esc);
     3. cifra A para Rodrigo con su llave maestra pública (solo él, con la privada, la puede abrir);
     4. manda al servidor A cifrada y S tal cual. S solo sale del servidor cuando una petición de
        recuperación ha pasado las 72 horas sin cancelarse y Rodrigo la ha aprobado.
   Para recuperar: el dispositivo nuevo crea un par de llaves de un solo uso; Rodrigo abre A con su
   llave maestra y se la vuelve a cifrar a ese dispositivo (nunca ve la llave de datos); el
   dispositivo junta A y S, saca E y abre la llave de datos.

   Cifrado hacia una llave pública: ECDH P-256 con una llave efímera + HKDF + AES-GCM. */

const te = new TextEncoder();
const b64 = (u) => { let s = ""; for (const c of new Uint8Array(u)) s += String.fromCharCode(c); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const ECDH = { name: "ECDH", namedCurve: "P-256" };

async function aes(material, info) {
  const base = await crypto.subtle.importKey("raw", material, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: te.encode(info) },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/* ── cifrar para una llave pública (JWK) y abrir con la privada ── */
export async function sellar(publicaJwk, bytes) {
  const destino = await crypto.subtle.importKey("jwk", publicaJwk, ECDH, false, []);
  const efimera = await crypto.subtle.generateKey(ECDH, true, ["deriveBits"]);
  const comun = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: destino }, efimera.privateKey, 256));
  const llave = await aes(comun, "dineriko-sello-v1");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, llave, bytes);
  const { x, y } = await crypto.subtle.exportKey("jwk", efimera.publicKey);
  return { e: { x, y }, iv: b64(iv), ct: b64(ct) };
}
export async function abrirSello(privadaJwk, sello) {
  const mia = await crypto.subtle.importKey("jwk", { ...privadaJwk, key_ops: ["deriveBits"] }, ECDH, false, ["deriveBits"]);
  const suya = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: sello.e.x, y: sello.e.y }, ECDH, false, []);
  const comun = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: suya }, mia, 256));
  const llave = await aes(comun, "dineriko-sello-v1");
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sello.iv) }, llave, unb64(sello.ct)));
}

/* par de llaves (el de un solo uso del dispositivo, o la llave maestra de Rodrigo) */
export async function nuevoPar() {
  const par = await crypto.subtle.generateKey(ECDH, true, ["deriveBits"]);
  const publica = await crypto.subtle.exportKey("jwk", par.publicKey);
  const privada = await crypto.subtle.exportKey("jwk", par.privateKey);
  return { publica: { kty: "EC", crv: "P-256", x: publica.x, y: publica.y }, privada: { kty: "EC", crv: "P-256", x: privada.x, y: privada.y, d: privada.d } };
}

/* ── la llave de repuesto ── */
export async function llaveDeRepuesto(piezaA, piezaS) {
  const junta = new Uint8Array(64);
  junta.set(piezaA, 0); junta.set(piezaS, 32);
  return aes(junta, "dineriko-repuesto-v1");
}

/* lo que se genera al activar la recuperación: { wrappedEsc, escrow: { a, s } } */
export async function prepararRepuesto(dekBytes, maestraPublica) {
  const A = crypto.getRandomValues(new Uint8Array(32));
  const S = crypto.getRandomValues(new Uint8Array(32));
  const E = await llaveDeRepuesto(A, S);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedEsc = { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, E, dekBytes)) };
  return { wrappedEsc, escrow: { a: await sellar(maestraPublica, A), s: b64(S) } };
}

/* en el dispositivo que recupera: A (resellada para él por Rodrigo) + S (del servidor) → llave de datos */
export async function abrirConRepuesto(privadaDispositivo, selloParaMi, piezaSb64, wrappedEsc) {
  const A = await abrirSello(privadaDispositivo, selloParaMi);
  const E = await llaveDeRepuesto(A, unb64(piezaSb64));
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(wrappedEsc.iv) }, E, unb64(wrappedEsc.ct)));
}

/* en el panel de Rodrigo: abre A con la llave maestra y la vuelve a cifrar para el dispositivo que la pidió */
export async function resellarParaDispositivo(maestraPrivada, selloA, publicaDispositivo) {
  const A = await abrirSello(maestraPrivada, selloA);
  return sellar(publicaDispositivo, A);
}

/* ── firma del administrador: la misma llave maestra (P-256) firma con ECDSA para entrar al panel ── */
export async function firmarAdmin(maestraPrivada, texto) {
  const k = await crypto.subtle.importKey("jwk", { ...maestraPrivada, key_ops: ["sign"] }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k, te.encode(texto)));
}

/* la llave maestra se guarda como un texto: "dineriko-maestra:" + base64 del JWK privado */
const PREFIJO = "dineriko-maestra:";
export const maestraATexto = (privada) => PREFIJO + btoa(JSON.stringify(privada));
export function textoAMaestra(t) {
  const s = String(t || "").trim();
  if (!s.startsWith(PREFIJO)) throw new Error("maestra-invalida");
  const j = JSON.parse(atob(s.slice(PREFIJO.length)));
  if (j.kty !== "EC" || j.crv !== "P-256" || !j.d) throw new Error("maestra-invalida");
  return j;
}
