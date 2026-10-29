/* ── Entrar con Apple o Google: comprobar que el "carné" (id_token) es auténtico ──
   Apple y Google firman un token con su clave privada. Aquí se comprueba la firma con sus claves
   públicas, que se publican en una dirección fija, y que el token es para Dineriko, reciente y
   con el email verificado. El token solo dice quién es la persona: no abre ningún dato. */

const FUENTES = {
  apple: { jwks: "https://appleid.apple.com/auth/keys", emisores: ["https://appleid.apple.com"], audiencias: "APPLE_AUDIENCES" },
  google: { jwks: "https://www.googleapis.com/oauth2/v3/certs", emisores: ["https://accounts.google.com", "accounts.google.com"], audiencias: "GOOGLE_AUDIENCES" },
};
export const PROVEEDORES = Object.keys(FUENTES);
const MARGEN_S = 120; // relojes que no van exactamente a la par

const te = new TextEncoder();
const td = new TextDecoder();
const deB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export class FalloIdentidad extends Error {
  constructor(motivo) { super(motivo); this.motivo = motivo; }
}

/* claves públicas, guardadas un rato en memoria; si llega un kid desconocido (rotación) se vuelven a pedir */
const cache = {};
async function claves(env, prov, kid) {
  if (env.TEST_JWKS) return JSON.parse(env.TEST_JWKS).keys; // solo en las pruebas locales (.dev.vars)
  const c = cache[prov];
  const fresca = c && Date.now() - c.at < 6 * 3600000;
  if (fresca && c.keys.some((k) => k.kid === kid)) return c.keys;
  if (c && Date.now() - c.at < 60000) return c.keys; // no machacar a Apple/Google si alguien manda kids inventados
  const r = await fetch(FUENTES[prov].jwks, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!r.ok) throw new FalloIdentidad("jwks");
  const { keys } = await r.json();
  cache[prov] = { keys, at: Date.now() };
  return keys;
}

export const audienciasDe = (env, prov) => (env[FUENTES[prov].audiencias] || "").split(",").map((s) => s.trim()).filter(Boolean);

/* devuelve { sub, email } o lanza FalloIdentidad */
export async function verificarToken(env, prov, token, nonce) {
  const fuente = FUENTES[prov];
  if (!fuente) throw new FalloIdentidad("proveedor");
  const audiencias = audienciasDe(env, prov);
  if (audiencias.length === 0) throw new FalloIdentidad("proveedor-sin-configurar");
  if (typeof token !== "string" || token.length > 8192) throw new FalloIdentidad("token");
  const partes = token.split(".");
  if (partes.length !== 3) throw new FalloIdentidad("token");
  let cab, datos;
  try {
    cab = JSON.parse(td.decode(deB64url(partes[0])));
    datos = JSON.parse(td.decode(deB64url(partes[1])));
  } catch (e) { throw new FalloIdentidad("token"); }
  if (cab.alg !== "RS256" || typeof cab.kid !== "string") throw new FalloIdentidad("token");

  const jwk = (await claves(env, prov, cab.kid)).find((k) => k.kid === cab.kid);
  if (!jwk) throw new FalloIdentidad("firma");
  const clave = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", clave, deB64url(partes[2]), te.encode(partes[0] + "." + partes[1]));
  if (!ok) throw new FalloIdentidad("firma");

  const ahora = Math.floor(Date.now() / 1000);
  if (!fuente.emisores.includes(datos.iss)) throw new FalloIdentidad("emisor");
  const aud = Array.isArray(datos.aud) ? datos.aud : [datos.aud];
  if (!aud.some((a) => audiencias.includes(a))) throw new FalloIdentidad("audiencia");
  if (!(datos.exp > ahora - MARGEN_S)) throw new FalloIdentidad("caducado");
  if (datos.iat && datos.iat > ahora + MARGEN_S) throw new FalloIdentidad("token");
  if (typeof datos.sub !== "string" || !datos.sub || datos.sub.length > 255) throw new FalloIdentidad("token");

  // el nonce lo genera el dispositivo para cada intento: así un token ajeno no sirve para otra petición.
  // Apple en iPhone lo guarda pasado por SHA-256; en la web, tal cual.
  if (typeof nonce !== "string" || nonce.length < 16 || nonce.length > 128) throw new FalloIdentidad("nonce");
  const resumen = hex(await crypto.subtle.digest("SHA-256", te.encode(nonce)));
  if (datos.nonce !== nonce && datos.nonce !== resumen) throw new FalloIdentidad("nonce");

  const verificado = datos.email_verified === true || datos.email_verified === "true";
  const email = typeof datos.email === "string" && verificado ? datos.email.trim().toLowerCase() : null;
  return { sub: datos.sub, email };
}
