/* ── Servidor de cuentas de Dineriko ──
   Cloudflare Worker + D1. Cifrado de extremo a extremo: el dispositivo deriva de la contraseña
   una "prueba" (authKey) para entrar y, por separado, la llave que abre los datos. Aquí solo llega
   la prueba, y se guarda pasada por HMAC con un secreto del servidor (PEPPER). Los datos llegan
   ya cifrados, con la clave de cada registro también cifrada, así que este servidor no sabe ni
   cuántos gastos hay en un mes.

   Rutas:
     POST /auth/prelogin   { email }                       → { salt, iter }
     POST /auth/register   { email, salt, iter, authKey, recAuth, wrapped } → { token }
     POST /auth/login      { email, authKey }              → { token, wrapped }
     POST /auth/recover    { email, recAuth, salt, iter, authKey, wrappedPass } → { token, wrapped }
     POST /auth/logout                                     → {}
     POST /auth/password   { authKey, salt, iter, newAuthKey, wrappedPass } → {}
     GET  /sync?since=N                                    → { rev, items, more }
     POST /sync            { changes: [{ k, v, d }] }      → { rev }
     POST /account/delete  { authKey }                     → {}
*/

const DIA = 86400000;
const SESION_MS = 365 * DIA;
const MAX_BODY = 1024 * 1024;        // 1 MB por petición
const MAX_VALOR = 64 * 1024;         // 64 KB por registro
const MAX_ITEMS = 50000;             // registros por usuario
const MAX_CAMBIOS = 2000;            // cambios por petición
const PAGINA = 1000;
const MAX_FALLOS = 10;               // intentos fallidos de entrar antes de bloquear 15 minutos
const VENTANA_FALLOS = 15 * 60000;

const te = new TextEncoder();

/* ── utilidades ── */
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n));
const ahora = () => Date.now();

async function hmac(secreto, texto) {
  const k = await crypto.subtle.importKey("raw", te.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, te.encode(texto)));
}
async function sha256(texto) {
  return b64url(await crypto.subtle.digest("SHA-256", te.encode(texto)));
}
/* comparación en tiempo constante, para no dar pistas por lo que tarda */
function igual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

class Fallo extends Error {
  constructor(status, codigo, mensaje) { super(mensaje || codigo); this.status = status; this.codigo = codigo; }
}

const esTexto = (s, min, max) => typeof s === "string" && s.length >= min && s.length <= max;
const esB64 = (s, min, max) => esTexto(s, min, max) && /^[A-Za-z0-9+/_=-]+$/.test(s);
function normalizarEmail(e) {
  if (typeof e !== "string") throw new Fallo(400, "email");
  const n = e.trim().toLowerCase();
  if (n.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n)) throw new Fallo(400, "email");
  return n;
}
function validarEnvuelta(w) {
  if (!w || typeof w !== "object") throw new Fallo(400, "wrapped");
  for (const [k, v] of Object.entries(w)) {
    if (!["pass", "rec"].includes(k) || !v || !esB64(v.iv, 8, 64) || !esB64(v.ct, 16, 512)) throw new Fallo(400, "wrapped");
  }
  return w;
}
const validarIter = (n) => { if (!Number.isInteger(n) || n < 100000 || n > 10000000) throw new Fallo(400, "iter"); return n; };

/* ── CORS: solo la app (web, iPhone y pruebas en local) ── */
function cabecerasCors(req, env) {
  const origen = req.headers.get("Origin") || "";
  const permitidos = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = permitidos.some((p) => origen === p || (p === "http://localhost" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origen)));
  return ok ? {
    "Access-Control-Allow-Origin": origen,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  } : { "Vary": "Origin" };
}
const json = (datos, status, cors) => new Response(JSON.stringify(datos), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors },
});

async function leerJson(req) {
  const largo = Number(req.headers.get("Content-Length") || 0);
  if (largo > MAX_BODY) throw new Fallo(413, "demasiado-grande");
  const texto = await req.text();
  if (texto.length > MAX_BODY) throw new Fallo(413, "demasiado-grande");
  try { return JSON.parse(texto || "{}"); } catch (e) { throw new Fallo(400, "json"); }
}

/* ── sesiones ── */
async function crearSesion(env, userId, req) {
  const token = b64url(aleatorio(32));
  const t = ahora();
  const device = (req.headers.get("User-Agent") || "").slice(0, 120);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, last_used, expires_at, device) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(await sha256(token), userId, t, t, t + SESION_MS, device).run();
  return token;
}
async function usuarioDeSesion(req, env) {
  const h = req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer ([A-Za-z0-9_-]{20,100})$/);
  if (!m) throw new Fallo(401, "sin-sesion");
  const th = await sha256(m[1]);
  const s = await env.DB.prepare("SELECT user_id, expires_at, last_used FROM sessions WHERE token_hash = ?").bind(th).first();
  if (!s || s.expires_at < ahora()) throw new Fallo(401, "sin-sesion");
  // se renueva como mucho una vez al día, para no escribir en cada petición
  if (ahora() - s.last_used > DIA) {
    await env.DB.prepare("UPDATE sessions SET last_used = ?, expires_at = ? WHERE token_hash = ?").bind(ahora(), ahora() + SESION_MS, th).run();
  }
  return { userId: s.user_id, tokenHash: th };
}

/* ── intentos fallidos ── */
async function comprobarBloqueo(env, email) {
  const r = await env.DB.prepare("SELECT fails, first_at FROM login_attempts WHERE email = ?").bind(email).first();
  if (r && r.fails >= MAX_FALLOS && ahora() - r.first_at < VENTANA_FALLOS) throw new Fallo(429, "demasiados-intentos");
}
async function anotarFallo(env, email) {
  const r = await env.DB.prepare("SELECT fails, first_at FROM login_attempts WHERE email = ?").bind(email).first();
  if (!r || ahora() - r.first_at >= VENTANA_FALLOS) {
    await env.DB.prepare("INSERT OR REPLACE INTO login_attempts (email, fails, first_at) VALUES (?, 1, ?)").bind(email, ahora()).run();
  } else {
    await env.DB.prepare("UPDATE login_attempts SET fails = fails + 1 WHERE email = ?").bind(email).run();
  }
}
const limpiarFallos = (env, email) => env.DB.prepare("DELETE FROM login_attempts WHERE email = ?").bind(email).run();

/* ── rutas ── */
async function prelogin(req, env) {
  const { email } = await leerJson(req);
  const e = normalizarEmail(email);
  const u = await env.DB.prepare("SELECT kdf_salt, kdf_iter FROM users WHERE email = ?").bind(e).first();
  if (u) return { salt: u.kdf_salt, iter: u.kdf_iter };
  // email desconocido: una sal falsa pero estable, para no revelar quién tiene cuenta
  const falsa = (await hmac(env.PEPPER, "sal-falsa:" + e)).slice(0, 22);
  return { salt: falsa, iter: 600000 };
}

async function registrar(req, env) {
  const b = await leerJson(req);
  const e = normalizarEmail(b.email);
  if (!esB64(b.salt, 16, 64) || !esB64(b.authKey, 40, 64) || !esB64(b.recAuth, 40, 64)) throw new Fallo(400, "datos");
  validarIter(b.iter);
  const wrapped = validarEnvuelta(b.wrapped);
  if (!wrapped.pass || !wrapped.rec) throw new Fallo(400, "wrapped");
  const existe = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(e).first();
  if (existe) throw new Fallo(409, "email-en-uso");
  const id = b64url(aleatorio(16));
  const t = ahora();
  await env.DB.prepare("INSERT INTO users (id, email, kdf_salt, kdf_iter, auth_hash, rec_hash, wrapped, rev, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)")
    .bind(id, e, b.salt, b.iter, await hmac(env.PEPPER, b.authKey), await hmac(env.PEPPER, b.recAuth), JSON.stringify(wrapped), t, t).run();
  return { token: await crearSesion(env, id, req) };
}

async function entrar(req, env) {
  const b = await leerJson(req);
  const e = normalizarEmail(b.email);
  if (!esB64(b.authKey, 40, 64)) throw new Fallo(400, "datos");
  await comprobarBloqueo(env, e);
  const u = await env.DB.prepare("SELECT id, auth_hash, wrapped FROM users WHERE email = ?").bind(e).first();
  const prueba = await hmac(env.PEPPER, b.authKey);
  if (!u || !igual(prueba, u.auth_hash)) { await anotarFallo(env, e); throw new Fallo(401, "credenciales"); }
  await limpiarFallos(env, e);
  return { token: await crearSesion(env, u.id, req), wrapped: JSON.parse(u.wrapped) };
}

/* contraseña olvidada, con el código de recuperación: el dispositivo ya ha abierto la llave de datos
   con el código y manda la contraseña nueva envuelta. Se cierran las demás sesiones. */
async function recuperar(req, env) {
  const b = await leerJson(req);
  const e = normalizarEmail(b.email);
  if (!esB64(b.recAuth, 40, 64) || !esB64(b.salt, 16, 64) || !esB64(b.authKey, 40, 64)) throw new Fallo(400, "datos");
  validarIter(b.iter);
  await comprobarBloqueo(env, e);
  const u = await env.DB.prepare("SELECT id, rec_hash, wrapped FROM users WHERE email = ?").bind(e).first();
  if (!u || !u.rec_hash || !igual(await hmac(env.PEPPER, b.recAuth), u.rec_hash)) { await anotarFallo(env, e); throw new Fallo(401, "credenciales"); }
  if (!b.wrappedPass) {
    // primer paso: código correcto, se devuelve la llave envuelta para que el dispositivo la abra
    await limpiarFallos(env, e);
    return { wrapped: JSON.parse(u.wrapped) };
  }
  const nueva = validarEnvuelta({ pass: b.wrappedPass }).pass;
  const wrapped = { ...JSON.parse(u.wrapped), pass: nueva };
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET kdf_salt = ?, kdf_iter = ?, auth_hash = ?, wrapped = ?, updated_at = ? WHERE id = ?")
      .bind(b.salt, b.iter, await hmac(env.PEPPER, b.authKey), JSON.stringify(wrapped), ahora(), u.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id),
  ]);
  await limpiarFallos(env, e);
  return { token: await crearSesion(env, u.id, req), wrapped };
}

async function salir(req, env) {
  const { tokenHash } = await usuarioDeSesion(req, env);
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  return {};
}

async function cambiarContrasena(req, env) {
  const { userId, tokenHash } = await usuarioDeSesion(req, env);
  const b = await leerJson(req);
  if (!esB64(b.authKey, 40, 64) || !esB64(b.newAuthKey, 40, 64) || !esB64(b.salt, 16, 64)) throw new Fallo(400, "datos");
  validarIter(b.iter);
  const u = await env.DB.prepare("SELECT auth_hash, wrapped FROM users WHERE id = ?").bind(userId).first();
  if (!u || !igual(await hmac(env.PEPPER, b.authKey), u.auth_hash)) throw new Fallo(401, "credenciales");
  const wrapped = { ...JSON.parse(u.wrapped), pass: validarEnvuelta({ pass: b.wrappedPass }).pass };
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET kdf_salt = ?, kdf_iter = ?, auth_hash = ?, wrapped = ?, updated_at = ? WHERE id = ?")
      .bind(b.salt, b.iter, await hmac(env.PEPPER, b.newAuthKey), JSON.stringify(wrapped), ahora(), userId),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(userId, tokenHash),
  ]);
  return {};
}

async function bajar(req, env, url) {
  const { userId } = await usuarioDeSesion(req, env);
  const since = Math.max(0, Number(url.searchParams.get("since") || 0) | 0);
  const u = await env.DB.prepare("SELECT rev FROM users WHERE id = ?").bind(userId).first();
  const { results } = await env.DB.prepare("SELECT k, v, deleted AS d, rev FROM items WHERE user_id = ? AND rev > ? ORDER BY rev LIMIT ?")
    .bind(userId, since, PAGINA + 1).all();
  const more = results.length > PAGINA;
  const items = more ? results.slice(0, PAGINA) : results;
  // si hay más páginas, el cursor es el último rev devuelto; si no, el rev actual de la cuenta
  return { rev: more ? items[items.length - 1].rev : u.rev, items, more };
}

async function subir(req, env) {
  const { userId } = await usuarioDeSesion(req, env);
  const { changes } = await leerJson(req);
  if (!Array.isArray(changes) || changes.length > MAX_CAMBIOS) throw new Fallo(400, "cambios");
  // los borrados también llevan valor cifrado (la clave lógica), para que el otro dispositivo sepa qué borrar
  for (const c of changes) {
    if (!esB64(c?.k, 8, 100)) throw new Fallo(400, "clave");
    if (!esTexto(c.v, 10, MAX_VALOR)) throw new Fallo(400, "valor");
  }
  if (changes.length === 0) {
    const u = await env.DB.prepare("SELECT rev FROM users WHERE id = ?").bind(userId).first();
    return { rev: u.rev };
  }
  const cuenta = await env.DB.prepare("SELECT COUNT(*) AS n FROM items WHERE user_id = ?").bind(userId).first();
  if (cuenta.n + changes.length > MAX_ITEMS) throw new Fallo(413, "demasiados-registros");
  // un rev nuevo para todo el lote; los borrados se quedan como marca para que no "resuciten" en otro dispositivo
  const u = await env.DB.prepare("UPDATE users SET rev = rev + 1, updated_at = ? WHERE id = ? RETURNING rev").bind(ahora(), userId).first();
  const rev = u.rev;
  const sql = "INSERT INTO items (user_id, k, v, deleted, rev) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, k) DO UPDATE SET v = excluded.v, deleted = excluded.deleted, rev = excluded.rev";
  const lotes = [];
  for (const c of changes) lotes.push(env.DB.prepare(sql).bind(userId, c.k, c.v, c.d ? 1 : 0, rev));
  for (let i = 0; i < lotes.length; i += 100) await env.DB.batch(lotes.slice(i, i + 100));
  return { rev };
}

async function borrarCuenta(req, env) {
  const { userId } = await usuarioDeSesion(req, env);
  const b = await leerJson(req);
  const u = await env.DB.prepare("SELECT auth_hash FROM users WHERE id = ?").bind(userId).first();
  if (!u || !esB64(b.authKey, 40, 64) || !igual(await hmac(env.PEPPER, b.authKey), u.auth_hash)) throw new Fallo(401, "credenciales");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM items WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
  return {};
}

const RUTAS = {
  "POST /auth/prelogin": prelogin,
  "POST /auth/register": registrar,
  "POST /auth/login": entrar,
  "POST /auth/recover": recuperar,
  "POST /auth/logout": salir,
  "POST /auth/password": cambiarContrasena,
  "GET /sync": bajar,
  "POST /sync": subir,
  "POST /account/delete": borrarCuenta,
  "GET /health": async () => ({ ok: true }),
};

export default {
  async fetch(req, env) {
    const cors = cabecerasCors(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    const ruta = RUTAS[`${req.method} ${url.pathname}`];
    if (!ruta) return json({ error: "no-existe" }, 404, cors);
    if (!env.PEPPER || env.PEPPER.length < 32) return json({ error: "servidor-sin-configurar" }, 500, cors);
    try {
      return json(await ruta(req, env, url), 200, cors);
    } catch (e) {
      if (e instanceof Fallo) return json({ error: e.codigo }, e.status, cors);
      console.error(e);
      return json({ error: "interno" }, 500, cors);
    }
  },
};
