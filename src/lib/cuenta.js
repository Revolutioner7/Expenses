/* ── Cuentas de Dineriko: cifrado y sincronización en el dispositivo ──
   Nada de lo que sale de aquí hacia el servidor se puede leer sin la contraseña del usuario
   o su código de recuperación.

   Contraseña ──PBKDF2 600.000──▶ maestra ──HKDF──┬─▶ authKey (la prueba que se manda para entrar)
                                                   └─▶ kek     (envuelve la llave de datos, nunca sale)
   Código de recuperación ──HKDF──┬─▶ recAuth
                                  └─▶ recKek
   Llave de datos (DEK, aleatoria) ──HKDF──▶ llave de nombres (HMAC de las claves de cada registro)

   Cada gasto, ingreso, categoría, fijo o meta es un registro aparte, cifrado con la DEK.
   Así dos dispositivos pueden anotar a la vez sin pisarse. */

export const ITER_CUENTA = 600000;
const te = new TextEncoder();
const td = new TextDecoder();

const b64 = (buf) => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const b64url = (buf) => b64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const salAleatoria = () => b64url(crypto.getRandomValues(new Uint8Array(16)));

async function hkdf(material, info, uso) {
  const base = await crypto.subtle.importKey("raw", material, "HKDF", false, ["deriveBits", "deriveKey"]);
  const params = { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: te.encode(info) };
  if (uso === "bits") return new Uint8Array(await crypto.subtle.deriveBits(params, base, 256));
  if (uso === "hmac") return crypto.subtle.deriveKey(params, base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
  return crypto.subtle.deriveKey(params, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/* ── contraseña ── */
export async function derivarDeContrasena(contrasena, sal, iter = ITER_CUENTA) {
  const base = await crypto.subtle.importKey("raw", te.encode(contrasena), "PBKDF2", false, ["deriveBits"]);
  const maestra = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: unb64(sal), iterations: iter, hash: "SHA-256" }, base, 256));
  return {
    authKey: b64url(await hkdf(maestra, "dineriko-cuenta-auth-v1", "bits")),
    kek: await hkdf(maestra, "dineriko-cuenta-kek-v1", "aes"),
  };
}

/* ── código de recuperación: 20 bytes al azar en base32 de Crockford (sin I, L, O ni U,
   para que no se confundan al copiarlo a mano), en grupos de 4 ── */
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function generarCodigo() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = 0, valor = 0, s = "";
  for (const b of bytes) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { s += B32[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return s.match(/.{4}/g).join("-");
}
export function normalizarCodigo(c) {
  return String(c || "").toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}
export const codigoValido = (c) => normalizarCodigo(c).length === 32 && [...normalizarCodigo(c)].every((ch) => B32.includes(ch));
export async function derivarDeCodigo(codigo) {
  const material = te.encode("dineriko-codigo:" + normalizarCodigo(codigo));
  return {
    recAuth: b64url(await hkdf(material, "dineriko-recuperacion-auth-v1", "bits")),
    recKek: await hkdf(material, "dineriko-recuperacion-kek-v1", "aes"),
  };
}

/* ── llave de datos ── */
export const nuevaDEK = () => crypto.getRandomValues(new Uint8Array(32)); // bytes en bruto
export async function envolver(dekBytes, kek) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, dekBytes)) };
}
export async function desenvolver(w, kek) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(w.iv) }, kek, unb64(w.ct)));
}
export async function llavesDeDatos(dekBytes) {
  const aes = await crypto.subtle.importKey("raw", dekBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const nombres = await hkdf(dekBytes, "dineriko-nombres-v1", "hmac");
  return { aes, nombres };
}
async function nombreServidor(llaves, logica) {
  return b64url(await crypto.subtle.sign("HMAC", llaves.nombres, te.encode(logica))).slice(0, 43);
}
async function cifrar(llaves, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, llaves.aes, te.encode(JSON.stringify(obj)));
  return b64(iv) + "." + b64(ct);
}
async function descifrar(llaves, v) {
  const [iv, ct] = v.split(".");
  return JSON.parse(td.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, llaves.aes, unb64(ct))));
}

/* ── de los datos de la app a registros sueltos, y de vuelta ──
   Lo que es de este dispositivo y no se sincroniza: la propia sesión (_cuenta) y la fecha de la
   última copia de seguridad (cada dispositivo guarda sus copias). */
const LOCALES = new Set(["_cuenta", "lastBackupAt"]);
const LISTAS = { categories: "cat", recurring: "rec", metas: "meta" };

export function aplanar(data) {
  const r = {};
  const cfg = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (LOCALES.has(k) || k === "months" || k === "learned" || LISTAS[k]) continue;
    cfg[k] = v;
  }
  r.cfg = cfg;
  if (data?.learned) r.learned = data.learned;
  for (const [campo, pre] of Object.entries(LISTAS)) {
    (data?.[campo] || []).forEach((x, i) => { if (x && x.id != null) r[`${pre}:${x.id}`] = { ...x, _o: i }; });
  }
  for (const [mk, m] of Object.entries(data?.months || {})) {
    const { expenses, incomes, ...resto } = m || {};
    r[`m:${mk}`] = resto;
    (expenses || []).forEach((e, i) => { if (e?.id != null) r[`e:${mk}:${e.id}`] = { ...e, _o: i }; });
    (incomes || []).forEach((e, i) => { if (e?.id != null) r[`i:${mk}:${e.id}`] = { ...e, _o: i }; });
  }
  return r;
}

const porOrden = (a, b) => (a._o ?? 0) - (b._o ?? 0);
const sinOrden = ({ _o, ...x }) => x;

export function reconstruir(registros, locales = {}) {
  const data = { ...(registros.cfg || {}) };
  if (registros.learned) data.learned = registros.learned;
  for (const [campo, pre] of Object.entries(LISTAS)) {
    data[campo] = Object.entries(registros).filter(([k]) => k.startsWith(pre + ":")).map(([, v]) => v).sort(porOrden).map(sinOrden);
  }
  const months = {};
  const mes = (mk) => (months[mk] ||= { expenses: [], incomes: [] });
  for (const [k, v] of Object.entries(registros)) {
    if (k.startsWith("m:")) Object.assign(mes(k.slice(2)), v);
    else if (k.startsWith("e:") || k.startsWith("i:")) {
      const mk = k.slice(2, 9);
      mes(mk)[k[0] === "e" ? "expenses" : "incomes"].push(v);
    }
  }
  for (const m of Object.values(months)) {
    m.expenses = m.expenses.sort(porOrden).map(sinOrden);
    m.incomes = m.incomes.sort(porOrden).map(sinOrden);
    if (!m.applied) m.applied = {};
  }
  data.months = months;
  for (const [k, v] of Object.entries(locales)) if (v !== undefined) data[k] = v;
  return data;
}

/* huella corta de un registro, para saber qué ha cambiado desde la última sincronización */
export function huella(v) {
  const s = JSON.stringify(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + "." + s.length.toString(36);
}

/* ── conversación con el servidor ── */
export class ErrorCuenta extends Error {
  constructor(codigo, status) { super(codigo); this.codigo = codigo; this.status = status; }
}
export async function api(base, ruta, { token, body, method } = {}) {
  let r;
  try {
    r = await fetch(base + ruta, {
      method: method || (body ? "POST" : "GET"),
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: "Bearer " + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ErrorCuenta("sin-conexion", 0);
  }
  let datos = {};
  try { datos = await r.json(); } catch (e) {}
  if (!r.ok) throw new ErrorCuenta(datos.error || "error", r.status);
  return datos;
}

/* ── altas y entradas. Todas devuelven la sesión que se guarda en el dispositivo:
   { email, token, dek (base64), rev, base } ── */
export async function crearCuenta(base, email, contrasena) {
  const sal = salAleatoria();
  const { authKey, kek } = await derivarDeContrasena(contrasena, sal);
  const codigo = generarCodigo();
  const { recAuth, recKek } = await derivarDeCodigo(codigo);
  const dek = nuevaDEK();
  const wrapped = { pass: await envolver(dek, kek), rec: await envolver(dek, recKek) };
  const { token } = await api(base, "/auth/register", { body: { email, salt: sal, iter: ITER_CUENTA, authKey, recAuth, wrapped } });
  return { sesion: { email: email.trim().toLowerCase(), token, dek: b64(dek), rev: 0, base: {} }, codigo };
}

export async function entrarCuenta(base, email, contrasena) {
  const { salt, iter } = await api(base, "/auth/prelogin", { body: { email } });
  const { authKey, kek } = await derivarDeContrasena(contrasena, salt, iter);
  const { token, wrapped } = await api(base, "/auth/login", { body: { email, authKey } });
  let dek;
  try { dek = await desenvolver(wrapped.pass, kek); } catch (e) { throw new ErrorCuenta("credenciales", 401); }
  return { email: email.trim().toLowerCase(), token, dek: b64(dek), rev: 0, base: {} };
}

/* contraseña olvidada: con el código se abre la llave de datos y se envuelve con la contraseña nueva */
export async function recuperarConCodigo(base, email, codigo, nuevaContrasena) {
  const { recAuth, recKek } = await derivarDeCodigo(codigo);
  const primero = await api(base, "/auth/recover", { body: { email, recAuth, salt: salAleatoria(), iter: ITER_CUENTA, authKey: "x".repeat(43) } });
  let dek;
  try { dek = await desenvolver(primero.wrapped.rec, recKek); } catch (e) { throw new ErrorCuenta("credenciales", 401); }
  const sal = salAleatoria();
  const { authKey, kek } = await derivarDeContrasena(nuevaContrasena, sal);
  const { token } = await api(base, "/auth/recover", {
    body: { email, recAuth, salt: sal, iter: ITER_CUENTA, authKey, wrappedPass: await envolver(dek, kek) },
  });
  return { email: email.trim().toLowerCase(), token, dek: b64(dek), rev: 0, base: {} };
}

export async function salirCuenta(base, sesion) {
  try { await api(base, "/auth/logout", { token: sesion.token, body: {} }); } catch (e) {}
}

export async function borrarCuenta(base, sesion, contrasena) {
  const { salt, iter } = await api(base, "/auth/prelogin", { body: { email: sesion.email } });
  const { authKey } = await derivarDeContrasena(contrasena, salt, iter);
  await api(base, "/account/delete", { token: sesion.token, body: { authKey } });
}

/* ── sincronizar: baja lo nuevo del servidor, lo mezcla con lo local y sube lo cambiado aquí.
   Regla de mezcla, registro a registro:
   · cambiado solo en el servidor → se coge el del servidor
   · cambiado solo aquí → se sube
   · cambiado en los dos → gana el más reciente (lo de aquí cuenta con la hora de esta sincronización)
   Devuelve { data, sesion, cambios } con los datos ya mezclados y la sesión actualizada. ── */
export async function sincronizar(baseUrl, sesion, data, { ahora = Date.now(), tamLote = 500 } = {}) {
  const llaves = await llavesDeDatos(unb64(sesion.dek));
  const locales = Object.fromEntries([...LOCALES].filter((k) => k !== "_cuenta").map((k) => [k, data?.[k]]));
  const actual = aplanar(data);
  const base = sesion.base || {};

  // 1. lo cambiado aquí desde la última vez
  const cambiadosAqui = new Set();
  for (const [k, v] of Object.entries(actual)) if (base[k] !== huella(v)) cambiadosAqui.add(k);
  for (const k of Object.keys(base)) if (!(k in actual)) cambiadosAqui.add(k);

  // 2. bajar lo nuevo del servidor, página a página
  let rev = sesion.rev || 0;
  const remotos = {};
  for (;;) {
    const r = await api(baseUrl, `/sync?since=${rev}`, { token: sesion.token });
    for (const it of r.items) {
      let p;
      try { p = await descifrar(llaves, it.v); } catch (e) { continue; } // algo que no es nuestro: se ignora
      if (!p || typeof p.k !== "string") continue;
      const prev = remotos[p.k];
      if (!prev || (p.t || 0) >= (prev.t || 0)) remotos[p.k] = p;
    }
    rev = r.rev;
    if (!r.more) break;
  }

  // 3. mezclar
  const primeraVez = (sesion.rev || 0) === 0 && Object.keys(base).length === 0;
  const mezcla = { ...actual };
  const subir = new Set(cambiadosAqui);
  let cambios = 0;
  for (const [k, p] of Object.entries(remotos)) {
    const remotoEsIgual = p.d ? !(k in actual) : (k in actual && huella(actual[k]) === huella(p.v));
    if (remotoEsIgual) { subir.delete(k); continue; }
    // primera sincronización de este dispositivo (acaba de entrar en la cuenta): lo de la cuenta manda,
    // y de lo de aquí solo se sube lo que la cuenta no tiene
    const ganaRemoto = primeraVez || !cambiadosAqui.has(k) || (p.t || 0) > ahora;
    if (!ganaRemoto) continue;
    subir.delete(k);
    if (p.d) delete mezcla[k]; else mezcla[k] = p.v;
    cambios++;
  }

  // 4. subir lo de aquí, en lotes
  const lista = [...subir];
  for (let i = 0; i < lista.length; i += tamLote) {
    const changes = [];
    for (const k of lista.slice(i, i + tamLote)) {
      const borrado = !(k in mezcla);
      const v = await cifrar(llaves, borrado ? { k, t: ahora, d: true } : { k, t: ahora, v: mezcla[k] });
      changes.push({ k: await nombreServidor(llaves, k), v, d: borrado ? 1 : 0 });
    }
    await api(baseUrl, "/sync", { token: sesion.token, body: { changes } });
  }

  // el cursor se queda en lo último que se bajó: lo subido vuelve la próxima vez, pero idéntico, y no hace nada
  const datos = cambios > 0 ? reconstruir(mezcla, locales) : data;
  // la base se calcula sobre lo que queda de verdad en el dispositivo (el orden puede renumerarse al mezclar)
  const nuevaBase = Object.fromEntries(Object.entries(aplanar(datos)).map(([k, v]) => [k, huella(v)]));
  return { data: datos, sesion: { ...sesion, rev, base: nuevaBase, ultimaSync: ahora }, cambios, subidos: lista.length };
}
