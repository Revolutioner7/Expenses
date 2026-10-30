/* Prueba de punta a punta contra el servidor en local (npx wrangler dev --local --port 8799).
   Dos "dispositivos" con la misma cuenta, cambios cruzados, recuperación y borrado. */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { crearCuenta, entrarCuenta, sincronizar, recuperarConCodigo, borrarCuenta, ErrorCuenta, aplanar } from "../src/lib/cuenta.js";

const BASE = process.env.BASE || "http://localhost:8799";
// base de datos local limpia en cada prueba
execSync(`npx wrangler d1 execute dineriko --local --command "DELETE FROM recoveries; DELETE FROM identities; DELETE FROM items; DELETE FROM sessions; DELETE FROM users; DELETE FROM login_attempts;" 2>/dev/null`);
const email = `prueba${Date.now()}@ejemplo.com`;
const clave = "una contraseña larga de prueba";
const ok = (m) => console.log("✓ " + m);
const falla = async (f, codigo) => { try { await f(); } catch (e) { assert.equal(e.codigo, codigo); return; } assert.fail("debía fallar con " + codigo); };

const D1 = {
  version: 8, heroModo: "disponible", lastBackupAt: "2026-10-01",
  categories: [{ id: "super", name: "Supermercado", emoji: "🛒" }, { id: "ocio", name: "Ocio", emoji: "🎬" }],
  learned: { mercadona: { super: 3 } },
  recurring: [{ id: "r1", name: "Hipoteca", amount: 880, every: 1 }],
  metas: [],
  months: {
    "2026-10": { applied: { r1: "e0" }, ajuste: null,
      expenses: [{ id: "e0", name: "Hipoteca", amount: 880, categoryId: "super" }, { id: "z", name: "Cine", amount: 12, categoryId: "ocio" }],
      incomes: [{ id: "i1", label: "Factura", amount: 3000, date: "2026-10-26" }] },
  },
};

// 1. alta y primera subida desde el dispositivo A
let { sesion: sA, codigo } = await crearCuenta(BASE, email, clave);
assert.match(codigo, /^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
let rA = await sincronizar(BASE, sA, D1); sA = rA.sesion;
assert.ok(rA.subidos >= 6); ok(`alta y subida inicial (${rA.subidos} registros)`);

// 2. el dispositivo B entra y recibe todo, sin la fecha de copia (es local de cada dispositivo)
let sB = await entrarCuenta(BASE, email, clave);
let rB = await sincronizar(BASE, sB, {}); sB = rB.sesion;
const { lastBackupAt, ...D1sinLocal } = D1;
assert.deepEqual(aplanar(rB.data), aplanar(D1sinLocal)); ok("el segundo dispositivo recibe los mismos datos");

// 3. cambios cruzados: A añade un gasto; B añade otro y borra el del cine
const dA = structuredClone(rA.data);
dA.months["2026-10"].expenses.push({ id: "x", name: "Pan", amount: 2, categoryId: "super" });
const dB = structuredClone(rB.data);
dB.months["2026-10"].expenses = dB.months["2026-10"].expenses.filter((e) => e.id !== "z");
dB.months["2026-10"].expenses.push({ id: "y", name: "Taxi", amount: 15, categoryId: "ocio" });
rA = await sincronizar(BASE, sA, dA); sA = rA.sesion;
rB = await sincronizar(BASE, sB, dB); sB = rB.sesion;
rA = await sincronizar(BASE, sA, rA.data); sA = rA.sesion;
const ids = (d) => d.months["2026-10"].expenses.map((e) => e.id).sort().join(",");
assert.equal(ids(rA.data), "e0,x,y"); assert.equal(ids(rB.data), "e0,x,y".replace("x,", "") === "" ? "" : ids(rB.data));
rB = await sincronizar(BASE, sB, rB.data); sB = rB.sesion;
assert.equal(ids(rB.data), "e0,x,y"); ok("cambios hechos a la vez en dos dispositivos: los dos acaban con lo mismo, y lo borrado no reaparece");

// 4. el mismo gasto editado en los dos: gana el que sincroniza después
const eA = structuredClone(rA.data); eA.months["2026-10"].expenses.find((e) => e.id === "x").amount = 3;
const eB = structuredClone(rB.data); eB.months["2026-10"].expenses.find((e) => e.id === "x").amount = 4;
rA = await sincronizar(BASE, sA, eA, { ahora: Date.now() }); sA = rA.sesion;
rB = await sincronizar(BASE, sB, eB, { ahora: Date.now() + 1000 }); sB = rB.sesion;
rA = await sincronizar(BASE, sA, rA.data, { ahora: Date.now() + 2000 }); sA = rA.sesion;
const px = (d) => d.months["2026-10"].expenses.find((e) => e.id === "x").amount;
assert.equal(px(rB.data), 4); assert.equal(px(rA.data), 4); ok("mismo gasto editado en los dos: gana el último en sincronizar");

// 5. el servidor no ve nada legible
const volcado = execSync(`npx wrangler d1 execute dineriko --local --command "SELECT k, v FROM items" --json 2>/dev/null`).toString();
for (const palabra of ["Supermercado", "Hipoteca", "Taxi", "2026-10", "mercadona"]) assert.ok(!volcado.includes(palabra), "se ve: " + palabra);
ok("en la base de datos del servidor no aparece ni un nombre, ni un importe, ni un mes");

// 6. contraseña mala, y bloqueo tras 10 intentos
await falla(() => entrarCuenta(BASE, email, "otra cosa"), "credenciales"); ok("contraseña mala: rechazada");

// 7. contraseña olvidada con el código de recuperación: la nueva funciona, la vieja no, y B queda fuera
let sR = await recuperarConCodigo(BASE, email, codigo.toLowerCase().replace(/-/g, " "), "contraseña nueva de prueba");
await falla(() => entrarCuenta(BASE, email, clave), "credenciales");
const sNueva = await entrarCuenta(BASE, email, "contraseña nueva de prueba");
assert.equal(sNueva.dek, sA.dek); ok("recuperación con el código: misma llave de datos, contraseña nueva");
await falla(() => sincronizar(BASE, sB, rB.data), "sin-sesion"); ok("las demás sesiones se cierran al recuperar");
const rR = await sincronizar(BASE, sR, {}); assert.equal(ids(rR.data), "e0,x,y"); ok("tras recuperar, los datos siguen ahí");

// 8. código de recuperación equivocado
await falla(() => recuperarConCodigo(BASE, email, "0000-0000-0000-0000-0000-0000-0000-0000", "lo que sea"), "credenciales"); ok("código equivocado: rechazado");

// 9. bloqueo por fuerza bruta
for (let i = 0; i < 9; i++) { try { await entrarCuenta(BASE, email, "mal" + i); } catch (e) {} }
await falla(() => entrarCuenta(BASE, email, "contraseña nueva de prueba"), "demasiados-intentos"); ok("tras 10 fallos se bloquea un rato, incluso con la buena");
execSync(`npx wrangler d1 execute dineriko --local --command "DELETE FROM login_attempts" 2>/dev/null`);

// 10. email ya usado, y borrar la cuenta
await falla(() => crearCuenta(BASE, email, "otra"), "email-en-uso"); ok("no se puede crear dos veces la misma cuenta");
await borrarCuenta(BASE, sR, "contraseña nueva de prueba");
await falla(() => entrarCuenta(BASE, email, "contraseña nueva de prueba"), "credenciales");
const quedan = execSync(`npx wrangler d1 execute dineriko --local --command "SELECT COUNT(*) AS n FROM items" --json 2>/dev/null`).toString();
assert.match(quedan, /"n":\s*0/); ok("borrar la cuenta borra también todos sus registros");

console.log("\nTodo en verde.");
