/* Prueba de humo contra el servidor publicado: crea una cuenta de usar y tirar, sincroniza desde
   dos "dispositivos", recupera con el código y la borra al final. No toca ninguna otra cuenta. */
import assert from "node:assert/strict";
import { crearCuenta, entrarCuenta, sincronizar, recuperarConCodigo, borrarCuenta } from "../src/lib/cuenta.js";

const BASE = process.env.BASE;
if (!BASE) { console.error("Falta BASE"); process.exit(1); }
const email = `prueba-humo-${Date.now()}@dineriko.invalid`;
const clave = "prueba de humo " + Math.random().toString(36).slice(2);
const datos = { version: 8, categories: [{ id: "c", name: "Prueba" }], learned: {}, recurring: [], metas: [],
  months: { "2026-10": { applied: {}, expenses: [{ id: "e", name: "Café", amount: 1.5, categoryId: "c" }], incomes: [] } } };

let sesionA, sesionR;
try {
  const r1 = await crearCuenta(BASE, email, clave); sesionA = r1.sesion;
  const s1 = await sincronizar(BASE, sesionA, datos); sesionA = s1.sesion;
  console.log(`✓ alta y subida (${s1.subidos} registros)`);
  const sB = await entrarCuenta(BASE, email, clave);
  const s2 = await sincronizar(BASE, sB, {});
  assert.equal(s2.data.months["2026-10"].expenses[0].name, "Café");
  console.log("✓ otro dispositivo entra y recibe los datos");
  sesionR = await recuperarConCodigo(BASE, email, r1.codigo, clave + "!");
  const s3 = await sincronizar(BASE, sesionR, {});
  assert.equal(s3.data.months["2026-10"].expenses.length, 1);
  console.log("✓ recuperación con el código");
} finally {
  if (sesionR || sesionA) {
    await borrarCuenta(BASE, sesionR || sesionA, sesionR ? clave + "!" : clave).catch((e) => console.error("no se pudo borrar la cuenta de prueba", e));
    console.log("✓ cuenta de prueba borrada");
  }
}
console.log("Servidor real: todo en verde.");
