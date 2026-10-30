/* Prueba local de "Lo he perdido todo", de punta a punta, contra wrangler dev con:
     --var EMAIL_PRUEBA:1 --var ESPERA_PRUEBA_MS:2000 --var RECUPERACION_PUBLICA:'<jwk>'
   (node prueba-recuperacion.mjs claves imprime la orden). Las 72 horas se acortan a 2 segundos
   solo aquí: en el servidor real no hay forma de cambiarlas. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const RUTA = "/tmp/dineriko-maestra-prueba.json";
const { crearLlaveMaestra, listarPeticiones, aprobarPeticion } = await import("../src/lib/admin.js");
const { textoAMaestra } = await import("../src/lib/recuperacion.js");
if (process.argv[2] === "claves") {
  const m = await crearLlaveMaestra();
  writeFileSync(RUTA, JSON.stringify(m));
  console.log(`npx wrangler dev --local --port 8799 --var EMAIL_PRUEBA:1 --var ESPERA_PRUEBA_MS:2000 --var 'RECUPERACION_PUBLICA:${JSON.stringify(m.publica)}'`);
  process.exit(0);
}
const { crearCuenta, entrarCuenta, sincronizar, empezarRecuperacion, estadoRecuperacion, completarRecuperacion,
  infoCuenta, desactivarRecuperacion, activarRecuperacion, ErrorCuenta } = await import("../src/lib/cuenta.js");

const BASE = process.env.BASE || "http://localhost:8799";
execSync(`npx wrangler d1 execute dineriko --local --command "DELETE FROM recoveries; DELETE FROM identities; DELETE FROM items; DELETE FROM sessions; DELETE FROM users; DELETE FROM login_attempts;" 2>/dev/null`);
const { textoPrivado, publica } = JSON.parse(readFileSync(RUTA, "utf8"));
const maestra = textoAMaestra(textoPrivado);
const ok = (m) => console.log("✓ " + m);
const falla = async (f, codigo) => { try { await f(); } catch (e) { assert.equal(e.codigo, codigo); return; } assert.fail("debía fallar con " + codigo); };
const buzon = async () => (await (await fetch(BASE + "/test/emails", { method: "POST", body: "{}" })).json()).emails;
const enlace = (mail) => mail.parrafos.find((p) => p.enlace).enlace;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
await buzon();

const DATOS = { version: 8, categories: [{ id: "c", name: "Casa" }], learned: {}, recurring: [], metas: [],
  months: { "2026-10": { applied: {}, expenses: [{ id: "e", name: "Luz", amount: 60, categoryId: "c" }], incomes: [] } } };

// 1. alta con la recuperación activada (por defecto) y datos subidos
const email = "eva@ejemplo.com";
let { sesion } = await crearCuenta(BASE, email, "contraseña olvidada luego", { maestra: publica });
sesion = (await sincronizar(BASE, sesion, DATOS)).sesion;
assert.equal((await infoCuenta(BASE, sesion)).recuperacion, true);
ok("cuenta creada con la recuperación activada");

// 2. lo pierde todo y lo pide desde un móvil nuevo
let pend = await empezarRecuperacion(BASE, email);
let [m1] = await buzon();
assert.match(m1.asunto, /Confirma/);
assert.equal((await estadoRecuperacion(BASE, pend)).estado, "pendiente");
// un email desconocido responde igual, sin email ni pistas
const fantasma = await empezarRecuperacion(BASE, "nadie@ejemplo.com");
assert.equal((await estadoRecuperacion(BASE, fantasma)).estado, "pendiente");
assert.equal((await buzon()).length, 0);
await falla(() => empezarRecuperacion(BASE, email), "recuperacion-en-curso");
ok("petición creada; un email sin cuenta responde igual; no se pueden abrir dos a la vez");

// 3. abrir el enlace no confirma (los programas de correo lo abren solos); pulsar el botón sí
let r = await fetch(enlace(m1), { redirect: "manual" });
assert.match(await r.text(), /¿Confirmas que eres tú\?/);
assert.equal((await estadoRecuperacion(BASE, pend)).estado, "pendiente");
r = await fetch(enlace(m1), { method: "POST" });
assert.match(await r.text(), /Confirmado/);
const st = await estadoRecuperacion(BASE, pend);
assert.equal(st.estado, "esperando");
const [m2] = await buzon();
assert.match(m2.asunto, /Alguien ha pedido recuperar/);
ok("confirmada con el botón del email; llega el aviso con el enlace para cancelar");

// 4. antes de las "72 horas" Rodrigo no puede aprobar ni ve las piezas
let lista = await listarPeticiones(BASE, maestra);
let p = lista.peticiones.find((x) => x.estado === "esperando");
assert.ok(p && !p.a);
{
  // aunque alguien mande un sello a mano, el servidor no deja aprobar antes de tiempo
  const { firmarAdmin } = await import("../src/lib/recuperacion.js");
  const { api } = await import("../src/lib/cuenta.js");
  const ts = Date.now();
  const sello = { e: { x: "x".repeat(43), y: "y".repeat(43) }, iv: "AAAAAAAAAAAAAAAA", ct: "A".repeat(64) };
  await falla(async () => api(BASE, "/admin/approve", { body: { id: p.id, sello, ts, sig: await firmarAdmin(maestra, `aprobar-${p.id}:${ts}`) } }), "aun-no");
}
ok("la espera no se puede saltar");

// 5. una llave maestra que no es la de Rodrigo no entra al panel
const intrusa = textoAMaestra((await crearLlaveMaestra()).textoPrivado);
await falla(() => listarPeticiones(BASE, intrusa), "admin");
ok("el panel solo abre con la llave maestra de verdad");

// 6. pasada la espera, Rodrigo aprueba y el móvil nuevo termina con contraseña nueva
await espera(2500);
lista = await listarPeticiones(BASE, maestra);
p = lista.peticiones.find((x) => x.estado === "esperando");
assert.ok(p.a && p.devicePub);
await aprobarPeticion(BASE, maestra, p);
const { sesion: nueva, codigo } = await completarRecuperacion(BASE, pend, "contraseña nueva de verdad", publica);
assert.ok(codigo);
const recibido = await sincronizar(BASE, nueva, {});
assert.equal(recibido.data.months["2026-10"].expenses[0].name, "Luz");
const mails = await buzon();
assert.ok(mails.some((m) => /Has recuperado el acceso/.test(m.asunto)));
await falla(() => entrarCuenta(BASE, email, "contraseña olvidada luego"), "credenciales");
await entrarCuenta(BASE, email, "contraseña nueva de verdad");
await falla(() => sincronizar(BASE, sesion, DATOS), "sin-sesion");
assert.ok((await infoCuenta(BASE, nueva)).recuperadaEn);
ok("aprobada tras la espera: el móvil nuevo recupera los datos, la contraseña vieja deja de valer y se cierran las demás sesiones");

// 7. cancelar desde el email
pend = await empezarRecuperacion(BASE, email);
r = await fetch(enlace((await buzon())[0]), { method: "POST" });
const aviso = (await buzon())[0];
r = await fetch(enlace(aviso));
assert.match(await r.text(), /Cancelada/);
assert.equal((await estadoRecuperacion(BASE, pend)).estado, "cancelada");
ok("'No he sido yo' la cancela");

// 8. desactivarla: el botón ya no sirve y se explica por email
await desactivarRecuperacion(BASE, nueva, "contraseña nueva de verdad");
assert.equal((await infoCuenta(BASE, nueva)).recuperacion, false);
pend = await empezarRecuperacion(BASE, email);
const [sinRec] = await buzon();
assert.match(sinRec.parrafos.join(" "), /recuperación desactivada/);
ok("desactivada: nadie puede recuperarla y la persona recibe la explicación");

// 9. volver a activarla pide la contraseña
await falla(() => activarRecuperacion(BASE, nueva, "no es esta", publica), "credenciales");
await activarRecuperacion(BASE, nueva, "contraseña nueva de verdad", publica);
assert.equal((await infoCuenta(BASE, nueva)).recuperacion, true);
ok("activarla y desactivarla pide la contraseña");
console.log("Todo en verde.");
