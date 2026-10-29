import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { aplanar, reconstruir, generarCodigo, codigoValido, normalizarCodigo, huella } from "../src/lib/cuenta.js";

/* ── piezas puras ── */
describe("Cuentas · piezas", () => {
  it("el código de recuperación tiene 8 grupos de 4 y se acepta escrito a mano (minúsculas, espacios, O por 0)", () => {
    const c = generarCodigo();
    expect(c).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(codigoValido(c.toLowerCase().replace(/-/g, " "))).toBe(true);
    expect(normalizarCodigo("o0il-")).toBe("0011");
  });
  it("aplanar y reconstruir dan los mismos datos, con el orden de las listas, sin la sesión ni la fecha de copia", () => {
    const d = { version: 8, heroModo: "gastado", lastBackupAt: "2026-10-01", _cuenta: { token: "t" },
      categories: [{ id: "b", name: "B" }, { id: "a", name: "A" }], learned: { pan: { a: 1 } }, recurring: [{ id: "r", amount: 1 }], metas: [],
      months: { "2026-10": { applied: { r: "e1" }, expenses: [{ id: "e2", amount: 2 }, { id: "e1", amount: 1 }], incomes: [{ id: "i", amount: 9 }] } } };
    const r = aplanar(d);
    expect(Object.keys(r).some((k) => k.includes("_cuenta"))).toBe(false);
    expect(JSON.stringify(r)).not.toContain("2026-10-01");
    const v = reconstruir(r, { lastBackupAt: "2026-10-01" });
    const { _cuenta, ...esperado } = d;
    expect(v).toEqual(esperado);
  });
  it("la huella cambia si cambia cualquier detalle", () => {
    expect(huella({ a: 1 })).not.toBe(huella({ a: 2 }));
    expect(huella({ a: 1 })).toBe(huella({ a: 1 }));
  });
});

/* ── en la app, con el servidor simulado ── */
const llamadas = { crear: [], entrar: [], sync: 0, borrar: [] };
let syncRespuesta = null;
vi.mock("../src/constants.js", async (orig) => ({ ...(await orig()), API_URL: "https://api.prueba.dev", cuentasDisponibles: () => true }));
vi.mock("../src/lib/cuenta.js", async (orig) => {
  const real = await orig();
  return {
    ...real,
    crearCuenta: async (base, email, pass) => { llamadas.crear.push([email, pass]); return { sesion: { email, token: "t", dek: "d", rev: 0, base: {} }, codigo: "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789" }; },
    entrarCuenta: async (base, email, pass) => {
      llamadas.entrar.push([email, pass]);
      if (pass === "mala") throw new real.ErrorCuenta("credenciales", 401);
      return { email, token: "t", dek: "d", rev: 0, base: {} };
    },
    sincronizar: async (base, sesion, data) => { llamadas.sync++; return syncRespuesta ? syncRespuesta(sesion, data) : { data, sesion: { ...sesion, ultimaSync: Date.now() }, cambios: 0 }; },
    borrarCuenta: async (base, sesion, pass) => { llamadas.borrar.push(pass); },
    salirCuenta: async () => {},
  };
});
const { default: App } = await import("../src/App.jsx");
const { crearCopia } = await import("../src/lib/backup.js");

const CATS = [{ id: "super", name: "Supermercado", emoji: "🛒", color: "#2C6B5E", budget: null, bucket: "necesidad" }];
let root, div;
const click = (el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const setVal = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
const txt = () => document.body.textContent;
const btn = (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t);
const espera = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const seed = (extra = {}) => ({ version: 8, categories: CATS, learned: {}, recurring: [], metas: [], months: { "2026-10": { expenses: [], incomes: [] } }, ...extra });
async function montar(data, onboard = { done: true, installId: "x", avisoActualizacionVisto: true }) {
  global.fetch = () => Promise.resolve({ ok: true });
  const disco = data ? { "cuaderno-gastos-v1": JSON.stringify(data) } : {};
  if (onboard) disco["cosecha-onboarding-v1"] = JSON.stringify(onboard);
  window.storage = { get: async (k) => (disco[k] == null ? null : { value: disco[k] }), set: async (k, v) => { disco[k] = v; return {}; } };
  await act(async () => { root.render(React.createElement(App)); await new Promise((r) => setTimeout(r, 250)); });
  return disco;
}
const abrirCuenta = async () => {
  await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
  await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Tu cuenta"))); });
};
const rellenar = async (pares) => { for (const [id, v] of pares) await act(async () => { setVal(document.getElementById(id), v); }); };

describe("Cuentas · en la app", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 9, 29));
    div = document.createElement("div"); div.id = "root"; document.body.appendChild(div); root = createRoot(div);
    llamadas.crear = []; llamadas.entrar = []; llamadas.sync = 0; llamadas.borrar = []; syncRespuesta = null;
  });
  afterEach(() => { act(() => root.unmount()); document.body.removeChild(div); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("crear cuenta: valida la contraseña, enseña el código, no activa la sesión hasta confirmar que se ha guardado, y sincroniza", async () => {
    const disco = await montar(seed());
    await abrirCuenta();
    expect(txt()).toContain("viven solo en este móvil");
    await act(async () => { click(btn("Crear cuenta")); });
    await rellenar([["cg-cuenta-email", "rodrigo@ejemplo.com"], ["cg-cuenta-pass", "corta"], ["cg-cuenta-pass2", "corta"]]);
    expect(txt()).toContain("mínimo 10 caracteres");
    expect([...document.querySelectorAll("button")].filter((b) => b.textContent === "Crear cuenta").pop().disabled).toBe(true);
    await rellenar([["cg-cuenta-pass", "una frase larga"], ["cg-cuenta-pass2", "una frase larga"]]);
    await act(async () => { click([...document.querySelectorAll(".cg-cuenta-form button.cg-btn")][0]); });
    await espera(50);
    expect(llamadas.crear).toEqual([["rodrigo@ejemplo.com", "una frase larga"]]);
    expect(txt()).toContain("ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789");
    expect(btn("Listo").disabled).toBe(true);
    await act(async () => { click(document.querySelector(".cg-cuenta-codigo input[type=checkbox]")); });
    await act(async () => { click(btn("Listo")); });
    expect(txt()).toContain("rodrigo@ejemplo.com");
    await espera(3200);
    expect(llamadas.sync).toBeGreaterThan(0);
    expect(txt()).toContain("Sincronizado");
    // la sesión se guarda en los datos del dispositivo…
    await espera(600);
    expect(JSON.parse(disco["cuaderno-gastos-v1"])._cuenta.email).toBe("rodrigo@ejemplo.com");
  });

  it("entrar con la contraseña mala enseña un mensaje claro y no entra", async () => {
    await montar(seed());
    await abrirCuenta();
    await act(async () => { click(btn("Ya tengo cuenta")); });
    await rellenar([["cg-cuenta-email", "rodrigo@ejemplo.com"], ["cg-cuenta-pass", "mala"]]);
    await act(async () => { click(btn("Entrar")); });
    await espera(20);
    expect(txt()).toContain("Email o contraseña incorrectos.");
    expect(txt()).not.toContain("Cerrar sesión");
  });

  it("lo que llega del servidor aparece en la app sin tocar nada", async () => {
    syncRespuesta = (sesion, data) => {
      const d = structuredClone(data);
      d.months["2026-10"].expenses.push({ id: "remoto", name: "Gasto del otro móvil", amount: 7, categoryId: "super", date: "2026-10-29" });
      return { data: d, sesion: { ...sesion, ultimaSync: Date.now() }, cambios: 1 };
    };
    await montar(seed({ _cuenta: { email: "a@b.es", token: "t", dek: "d", rev: 3, base: { x: "y" } } }));
    await espera(3200);
    expect(txt()).toContain("Gasto del otro móvil");
  });

  it("borrar la cuenta pide la contraseña y deja los datos en el dispositivo", async () => {
    const disco = await montar(seed({ _cuenta: { email: "a@b.es", token: "t", dek: "d", rev: 3, base: {} } }));
    await abrirCuenta();
    await act(async () => { click(btn("Borrar cuenta")); });
    expect(txt()).toContain("No hay vuelta atrás");
    await rellenar([["cg-borrar-pass", "una frase larga"]]);
    await act(async () => { click(btn("Borrar mi cuenta")); });
    await espera(700);
    expect(llamadas.borrar).toEqual(["una frase larga"]);
    expect(txt()).toContain("Crear cuenta");
    const d = JSON.parse(disco["cuaderno-gastos-v1"]);
    expect(d._cuenta).toBeUndefined();
    expect(d.categories.length).toBe(1);
  });

  it("en el inicio, 'Ya tengo cuenta' entra y se salta las preguntas", async () => {
    await montar(null, null); // primera vez: sin datos ni respuestas guardadas
    if (btn("Hecho")) await act(async () => { click(btn("Hecho")); });
    await act(async () => { click(document.getElementById("cg-onboard-accept")); });
    await act(async () => { click(btn("Ya tengo cuenta")); });
    await rellenar([["cg-cuenta-email", "rodrigo@ejemplo.com"], ["cg-cuenta-pass", "una frase larga"]]);
    await act(async () => { click(btn("Entrar")); });
    await espera(300);
    expect(llamadas.entrar.length).toBe(1);
    expect(txt()).not.toContain("Paso 3 de 6");
    expect(document.querySelector(".cg-tab")).not.toBeNull();
  });

  it("la copia de seguridad nunca lleva la sesión de la cuenta", async () => {
    let escrito = null;
    window.URL.createObjectURL = (blob) => { escrito = blob; return "blob:x"; };
    window.URL.revokeObjectURL = () => {};
    await crearCopia({ version: 8, _cuenta: { token: "secreto", dek: "llave" }, months: {} });
    const texto = await escrito.text();
    expect(texto).not.toContain("secreto");
    expect(texto).not.toContain("llave");
  });
});

describe("Aviso de Privacidad", () => {
  it("cuenta lo que pasa con y sin cuenta, y que el servidor no puede leer los datos", async () => {
    const { PRIVACIDAD } = await import("../src/privacidad.js");
    const todo = JSON.stringify(PRIVACIDAD);
    expect(todo).toContain("cifrados de extremo a extremo");
    expect(todo).toContain("no salen de tu dispositivo");
    expect(todo).toContain("Cloudflare");
    expect(todo).toContain("Borrar cuenta");
    expect(todo).toContain("aepd.es");
    expect(PRIVACIDAD.actualizado).toMatch(/2026/);
  });
});
