/* Prueba local de Apple/Google: firma tokens falsos con una clave de prueba que el servidor local
   acepta porque se le pasa como TEST_JWKS (solo existe en local, nunca en el servidor real).
   Uso: node prueba-social.mjs claves   → escribe la clave de prueba y dice cómo arrancar wrangler
        node prueba-social.mjs          → ejecuta la prueba */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { webcrypto as wc } from "node:crypto";

const RUTA = process.env.CLAVES || "/tmp/dineriko-social-claves.json";
if (process.argv[2] === "claves") {
  const par = await wc.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pub = { ...(await wc.subtle.exportKey("jwk", par.publicKey)), kid: "prueba", alg: "RS256", use: "sig" };
  const priv = await wc.subtle.exportKey("jwk", par.privateKey);
  writeFileSync(RUTA, JSON.stringify({ priv, jwks: { keys: [pub] } }));
  console.log(`npx wrangler dev --local --port 8799 --var 'TEST_JWKS:${JSON.stringify({ keys: [pub] })}' --var GOOGLE_AUDIENCES:cliente-google`);
  process.exit(0);
}

const { crearCuentaSocial, entrarCuentaSocial, consultarSocial, crearCuenta, entrarCuenta, sincronizar, borrarCuenta } = await import("../src/lib/cuenta.js");
const BASE = process.env.BASE || "http://localhost:8799";
execSync(`npx wrangler d1 execute dineriko --local --command "DELETE FROM recoveries; DELETE FROM identities; DELETE FROM items; DELETE FROM sessions; DELETE FROM users; DELETE FROM login_attempts;" 2>/dev/null`);
const { priv } = JSON.parse(readFileSync(RUTA, "utf8"));
const clave = await wc.subtle.importKey("jwk", priv, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
const b64u = (b) => Buffer.from(b).toString("base64url");
const hex = async (s) => Buffer.from(await wc.subtle.digest("SHA-256", new TextEncoder().encode(s))).toString("hex");
async function token(campos) {
  const cab = b64u(JSON.stringify({ alg: "RS256", kid: "prueba", typ: "JWT" }));
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = b64u(JSON.stringify({ iat: ahora, exp: ahora + 600, email_verified: true, ...campos }));
  const firma = await wc.subtle.sign("RSASSA-PKCS1-v1_5", clave, new TextEncoder().encode(cab + "." + cuerpo));
  return cab + "." + cuerpo + "." + b64u(firma);
}
const nonce = () => b64u(wc.getRandomValues(new Uint8Array(18)));
const google = async (sub, email, extra = {}) => { const n = nonce(); return { provider: "google", nonce: n, idToken: await token({ iss: "https://accounts.google.com", aud: "cliente-google", sub, email, nonce: n, ...extra }) }; };
const apple = async (sub, email, extra = {}) => { const n = nonce(); return { provider: "apple", nonce: n, idToken: await token({ iss: "https://appleid.apple.com", aud: "com.dineriko.app", sub, email, nonce: await hex(n), email_verified: "true", ...extra }) }; };
const ok = (m) => console.log("✓ " + m);
const falla = async (f, codigo) => { try { await f(); } catch (e) { assert.equal(e.codigo, codigo); return; } assert.fail("debía fallar con " + codigo); };

const DATOS = { version: 8, categories: [{ id: "c", name: "Casa" }], learned: {}, recurring: [], metas: [],
  months: { "2026-10": { applied: {}, expenses: [{ id: "e", name: "Pan", amount: 1.2, categoryId: "c" }], incomes: [] } } };

// 1. alguien nuevo con Google
let g = await google("g-1", "ana@ejemplo.com");
assert.equal((await consultarSocial(BASE, g)).estado, "nueva");
const codigoDineriko = "mi código de dineriko";
let { sesion: s1, codigo } = await crearCuentaSocial(BASE, await google("g-1", "ana@ejemplo.com"), codigoDineriko);
assert.equal(s1.email, "ana@ejemplo.com"); assert.ok(codigo);
s1 = (await sincronizar(BASE, s1, DATOS)).sesion;
ok("cuenta nueva con Google y primera subida");

// 2. otro dispositivo: Google + código de Dineriko
g = await google("g-1", "ana@ejemplo.com");
const c1 = await consultarSocial(BASE, g);
assert.equal(c1.estado, "existe");
let s2 = await entrarCuentaSocial(BASE, await google("g-1", "ana@ejemplo.com"), codigoDineriko, c1);
assert.equal((await sincronizar(BASE, s2, {})).data.months["2026-10"].expenses[0].name, "Pan");
ok("otro dispositivo entra con Google y el código, y ve los datos");

// 3. código equivocado
await falla(async () => entrarCuentaSocial(BASE, await google("g-1", "ana@ejemplo.com"), "otro código cualquiera", c1), "credenciales");
ok("con el código equivocado no entra");

// 4. también con email y el código de Dineriko, como si fuera una contraseña
await entrarCuenta(BASE, "ana@ejemplo.com", codigoDineriko);
ok("el código de Dineriko vale también como contraseña con el email");

// 5. una cuenta de email que luego entra con Apple (mismo email): se une al poner su contraseña
await crearCuenta(BASE, "luis@ejemplo.com", "contraseña de luis larga");
let a = await apple("a-9", "luis@ejemplo.com");
const c2 = await consultarSocial(BASE, a);
assert.equal(c2.estado, "vincular");
await entrarCuentaSocial(BASE, await apple("a-9", "luis@ejemplo.com"), "contraseña de luis larga", c2);
// Apple a veces no manda el email en entradas posteriores: ya no hace falta, está unida
assert.equal((await consultarSocial(BASE, await apple("a-9", undefined))).estado, "existe");
ok("cuenta de email unida a Apple con su contraseña; después entra aunque Apple no mande el email");

// 6. tokens que no valen
await falla(async () => consultarSocial(BASE, await google("g-1", "ana@ejemplo.com", { aud: "otra-app" })), "identidad");
await falla(async () => consultarSocial(BASE, await google("g-1", "ana@ejemplo.com", { exp: Math.floor(Date.now() / 1000) - 3600 })), "identidad");
await falla(async () => consultarSocial(BASE, await google("g-1", "ana@ejemplo.com", { iss: "https://malo.example" })), "identidad");
await falla(async () => consultarSocial(BASE, { ...(await google("g-1", "ana@ejemplo.com")), nonce: nonce() }), "identidad");
const t = await google("g-1", "ana@ejemplo.com");
await falla(() => consultarSocial(BASE, { ...t, idToken: t.idToken.slice(0, -4) + "AAAA" }), "identidad");
await falla(async () => consultarSocial(BASE, await google("g-2", "nuevo@ejemplo.com", { email_verified: false })), "sin-email");
ok("tokens de otra app, caducados, de otro emisor, con otro nonce, con la firma tocada o sin email verificado: rechazados");

// 7. no se puede crear dos veces la misma identidad, ni robar un email ya registrado
await falla(async () => crearCuentaSocial(BASE, await google("g-1", "ana@ejemplo.com"), "otro código más"), "email-en-uso");
await falla(async () => crearCuentaSocial(BASE, await google("g-3", "luis@ejemplo.com"), "otro código más"), "email-en-uso");
ok("no se duplican cuentas");

// 8. borrar la cuenta con el código de Dineriko borra también la identidad
await borrarCuenta(BASE, s2, codigoDineriko);
assert.equal((await consultarSocial(BASE, await google("g-1", "ana@ejemplo.com"))).estado, "nueva");
ok("borrar la cuenta la quita también de Google");

// 9. callback de Apple en la web: reenvía al origen permitido, nunca a otro
const est = (o) => `abc.p.${Buffer.from(o).toString("base64url")}`;
let r = await fetch(BASE + "/auth/apple/callback", { method: "POST", redirect: "manual", body: new URLSearchParams({ state: est("https://dineriko.com"), id_token: "x.y.z" }) });
assert.equal(r.status, 303); assert.match(r.headers.get("location"), /^https:\/\/dineriko\.com\/oauth\.html#provider=apple&state=.+&id_token=x\.y\.z$/);
r = await fetch(BASE + "/auth/apple/callback", { method: "POST", redirect: "manual", body: new URLSearchParams({ state: est("https://malo.example"), id_token: "x.y.z" }) });
assert.equal(r.status, 400);
ok("Apple en la web: el token vuelve solo a dineriko.com");
console.log("Todo en verde.");
