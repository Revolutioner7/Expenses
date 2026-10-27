import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import App from "../src/App.jsx";
import { repartoIngreso, porcentajesPorDefecto, tramoPara, coincideCuota, CUOTAS, resumenTrimestre, trimestreDe, mediaIngresosMensual } from "../src/lib/autonomo.js";

/* ── motor, sin interfaz ── */
describe("Soy autónomo · motor", () => {
  it("clientes fuera de España: sin IVA y reserva del 20 % de IRPF", () => {
    expect(porcentajesPorDefecto({ clientesEspana: false })).toEqual({ ivaPct: 0, irpfPct: 20, retPct: 0 });
  });
  it("clientes en España sin retención: IVA 21 % y 20 % de IRPF", () => {
    expect(porcentajesPorDefecto({ clientesEspana: true, retencion: false })).toEqual({ ivaPct: 21, irpfPct: 20, retPct: 0 });
  });
  it("con retención del 15 %, la reserva de IRPF baja al 5 %; con la del 7 % (nuevos), al 13 %", () => {
    expect(porcentajesPorDefecto({ clientesEspana: true, retencion: true, nuevoAutonomo: false }).irpfPct).toBe(5);
    expect(porcentajesPorDefecto({ clientesEspana: true, retencion: true, nuevoAutonomo: true }).irpfPct).toBe(13);
  });
  it("reparto de un ingreso sin IVA: 3.000 € → 600 € a impuestos, 2.400 € tuyos", () => {
    const r = repartoIngreso(3000, { activo: true, ivaPct: 0, irpfPct: 20, umbral: 2000 });
    expect(r.iva).toBe(0); expect(r.irpf).toBe(600); expect(r.tuyo).toBe(2400);
  });
  it("reparto con IVA incluido en lo recibido: 1.210 € → 210 € de IVA y el IRPF sobre la base de 1.000", () => {
    const r = repartoIngreso(1210, { activo: true, ivaPct: 21, irpfPct: 20, umbral: 1000 });
    expect(r.iva).toBeCloseTo(210, 6); expect(r.base).toBeCloseTo(1000, 6); expect(r.irpf).toBeCloseTo(200, 6);
  });
  it("por debajo del umbral, o con la función apagada, no reparte nada", () => {
    expect(repartoIngreso(300, { activo: true, ivaPct: 0, irpfPct: 20, umbral: 2000 })).toBeNull();
    expect(repartoIngreso(3000, { activo: false, ivaPct: 0, irpfPct: 20, umbral: 2000 })).toBeNull();
  });
  it("hay 16 opciones de cuota: tarifa plana más 15 tramos, y el tramo se propone por rendimiento", () => {
    expect(CUOTAS.length).toBe(16);
    expect(CUOTAS[0].id).toBe("plana"); expect(CUOTAS[0].cuota).toBe(80);
    expect(tramoPara(2500).cuota).toBe(427);
    expect(tramoPara(0).cuota).toBe(205);
    expect(tramoPara(9000).cuota).toBe(607);
  });
  it("el filtro del desplegable encuentra por importe, por tramo y por nombre, con o sin puntos", () => {
    const plana = CUOTAS[0];
    expect(coincideCuota(plana, "80")).toBe(true);
    expect(coincideCuota(plana, "plana")).toBe(true);
    expect(CUOTAS.filter((c) => coincideCuota(c, "1.300")).map((c) => c.id)).toEqual(["t04", "t05"]);
    expect(CUOTAS.filter((c) => coincideCuota(c, "1300")).map((c) => c.id)).toEqual(["t04", "t05"]);
    expect(CUOTAS.filter((c) => coincideCuota(c, "607")).length).toBe(1);
  });
  it("trimestre y fecha de pago: el 4T se paga el 20 de enero del año siguiente", () => {
    expect(trimestreDe("2026-11-05")).toMatchObject({ etiqueta: "4T 2026", pago: "2027-01-20" });
    expect(trimestreDe("2026-02-01")).toMatchObject({ etiqueta: "1T 2026", pago: "2026-04-20" });
  });
  it("el resumen del trimestre suma solo los ingresos sobre el umbral de ese trimestre", () => {
    const months = {
      "2026-10": { incomes: [{ id: "a", label: "Factura", amount: 3000, date: "2026-10-27" }, { id: "b", label: "Bizum", amount: 50, date: "2026-10-20" }] },
      "2026-09": { incomes: [{ id: "c", label: "Nómina", amount: 2500, date: "2026-09-27" }] },
    };
    const r = resumenTrimestre(months, { activo: true, ivaPct: 0, irpfPct: 20, umbral: 2000 }, "2026-10-27");
    expect(r.filas.map((f) => f.id)).toEqual(["a"]);
    expect(r.impuestos).toBe(600);
    expect(r.diasHastaPago).toBe(85);
  });
  it("la media mensual usa los últimos meses cerrados, no el actual", () => {
    const months = { "2026-10": { incomes: [{ amount: 9999 }] }, "2026-09": { incomes: [{ amount: 3000 }] }, "2026-08": { incomes: [{ amount: 1000 }] } };
    expect(mediaIngresosMensual(months, "2026-10-27")).toBe(2000);
  });
});

/* ── interfaz ── */
const CATS = [
  { id: "super", name: "Supermercado", emoji: "🛒", color: "#2C6B5E", budget: null, bucket: "necesidad" },
  { id: "banco", name: "Banco e impuestos", emoji: "🏦", color: "#6B7B8C", budget: null, bucket: "necesidad" },
];
let root, div;
const ONB = { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } };
function seedStorage(seedData, opts = {}) {
  const disco = {};
  if (seedData) disco["cuaderno-gastos-v1"] = JSON.stringify(seedData);
  if (opts.seedOnboard) disco["cosecha-onboarding-v1"] = JSON.stringify(opts.seedOnboard);
  window.storage = { get: async (k) => (disco[k] == null ? null : { value: disco[k] }), set: async (k, v) => { disco[k] = v; return {}; } };
  return disco;
}
async function montar(seedData, opts = {}) {
  global.fetch = () => Promise.resolve({ ok: true });
  const disco = seedStorage(seedData, opts);
  await act(async () => { root.render(React.createElement(App)); await new Promise((r) => setTimeout(r, 250)); });
  return disco;
}
const click = (el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const setVal = (el, v) => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const txt = () => document.body.textContent;
const btn = (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t);
const seed = (extra = {}) => ({ version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
  months: {
    "2026-10": { expenses: [], incomes: [{ id: "i1", label: "Factura Thriviti", amount: 3000, date: "2026-10-26" }, { id: "i2", label: "Bizum", amount: 40, date: "2026-10-20" }] },
    "2026-09": { expenses: [], incomes: [{ id: "i0", label: "Nómina", amount: 2500, date: "2026-09-27" }] },
  }, ...extra });
const irAjustesAutonomo = async () => {
  await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
  await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Soy autónomo"))); });
};
const respuesta = (pregunta, si) => {
  const grupo = [...document.querySelectorAll("[role=radiogroup]")].find((g) => g.getAttribute("aria-label") === pregunta);
  return grupo.querySelector(si ? "button:first-child" : "button:last-child");
};
const guardado = (disco) => JSON.parse(disco["cuaderno-gastos-v1"]);
const esperaGuardado = () => act(async () => { await new Promise((r) => setTimeout(r, 600)); });

describe("Soy autónomo · Ajustes", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 9, 27));
    div = document.createElement("div"); div.id = "root"; document.body.appendChild(div); root = createRoot(div);
    window.localStorage.clear();
  });
  afterEach(() => { act(() => root.unmount()); document.body.removeChild(div); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("si no está activado, Ingresos no enseña la tarjeta de impuestos", async () => {
    await montar(seed(), ONB);
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ingresos")); });
    expect(txt()).not.toContain("Impuestos del");
  });

  it("cuestionario: con clientes fuera de España solo hay una pregunta y propone IVA 0 e IRPF 20", async () => {
    await montar(seed(), ONB);
    await irAjustesAutonomo();
    expect(txt()).toContain("¿Tus clientes están en España?");
    expect(txt()).not.toContain("retienen IRPF");
    await act(async () => { click(respuesta("¿Tus clientes están en España?", false)); });
    expect(txt()).not.toContain("retienen IRPF");
    expect(document.querySelector("#cg-iva").value).toBe("0");
    expect(document.querySelector("#cg-irpf").value).toBe("20");
  });

  it("cuestionario: con clientes en España aparecen las preguntas de retención y de nuevo autónomo, y los porcentajes cambian", async () => {
    await montar(seed(), ONB);
    await irAjustesAutonomo();
    await act(async () => { click(respuesta("¿Tus clientes están en España?", true)); });
    expect(txt()).toContain("retienen IRPF");
    expect(document.querySelector("#cg-iva").value).toBe("21");
    await act(async () => { click(respuesta("¿Tus clientes te retienen IRPF en las facturas?", true)); });
    expect(txt()).toContain("menos de tres años");
    expect(document.querySelector("#cg-irpf").value).toBe("5");
    await act(async () => { click(respuesta("¿Llevas menos de tres años como autónomo?", true)); });
    expect(document.querySelector("#cg-irpf").value).toBe("13");
  });

  it("la cuota se elige escribiendo para filtrar: '80' deja solo la tarifa plana", async () => {
    await montar(seed(), ONB);
    await irAjustesAutonomo();
    const sel = document.querySelector("input[aria-label='Cuota de autónomo']");
    await act(async () => { sel.dispatchEvent(new Event("focus")); setVal(sel, "80"); });
    const opciones = [...document.querySelectorAll("[role=listbox] .cg-menu-opt")];
    expect(opciones.length).toBe(1);
    expect(opciones[0].textContent).toContain("Tarifa plana");
    await act(async () => { click(opciones[0]); });
    expect(sel.value).toContain("Tarifa plana");
  });

  it("propone el tramo según los ingresos de los meses cerrados (2.500 € → de 2.330 a 2.760 €)", async () => {
    await montar(seed(), ONB);
    await irAjustesAutonomo();
    expect(txt()).toContain("De 2.330 a 2.760 €");
    await act(async () => { click(btn("Usar ese")); });
    expect(document.querySelector("input[aria-label='Cuota de autónomo']").value).toContain("427 €/mes");
  });

  it("al guardar se crean los fijos de cuota y gestoría y la tarjeta del trimestre aparece en Ingresos", async () => {
    const disco = await montar(seed(), ONB);
    await irAjustesAutonomo();
    await act(async () => { click(respuesta("¿Tus clientes están en España?", false)); });
    await act(async () => { click(btn("Usar ese")); });
    await act(async () => { click(respuesta("¿Quieres anotar ya el gasto mensual de la gestoría?", true)); });
    await act(async () => { setVal(document.querySelector("#cg-gestoria"), "60"); });
    await act(async () => { click(btn("Guardar")); });
    await esperaGuardado();
    const d = guardado(disco);
    expect(d.autonomo.activo).toBe(true);
    expect(d.autonomo.cuotaId).toBe("t10");
    const fijos = d.recurring.map((r) => [r.name, r.amount]);
    expect(fijos).toContainEqual(["Cuota de autónomo", 427]);
    expect(fijos).toContainEqual(["Gestoría", 60]);
    expect(txt()).toContain("Cambiar respuestas o porcentajes");
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ingresos")); });
    expect(txt()).toContain("Impuestos del 4T 2026");
    expect(txt()).toContain("Aparta 600,00 € para IRPF");
    expect(txt()).toContain("20 de enero");
  });

  it("no deja guardar sin cuota, y el umbral deja fuera los ingresos pequeños", async () => {
    await montar(seed({ autonomo: { activo: true, clientesEspana: false, retencion: false, nuevoAutonomo: false, ivaPct: 0, irpfPct: 20, umbral: 2000, cuotaId: "plana", cuotaFijoId: null, gestoria: 0, gestoriaFijoId: null } }), ONB);
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ingresos")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.startsWith("Ver el detalle"))); });
    expect(txt()).toContain("Factura Thriviti");
    expect(txt()).not.toContain("Bizum · ");
    await irAjustesAutonomo();
    await act(async () => { click(btn("Cambiar respuestas o porcentajes")); });
    expect(btn("Guardar").disabled).toBe(false);
  });

  it("'Ya no soy autónomo' apaga la función y, si se confirma, quita los fijos", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const disco = await montar(seed({ recurring: [{ id: "fq", kind: "gasto", name: "Cuota de autónomo", amount: 80, day: 28, every: 1, auto: false, categoryId: "banco", since: "2026-10", active: true }],
      autonomo: { activo: true, clientesEspana: false, retencion: false, nuevoAutonomo: false, ivaPct: 0, irpfPct: 20, umbral: 2000, cuotaId: "plana", cuotaFijoId: "fq", gestoria: 0, gestoriaFijoId: null } }), ONB);
    await irAjustesAutonomo();
    await act(async () => { click(btn("Ya no soy autónomo")); });
    await esperaGuardado();
    const d = guardado(disco);
    expect(d.autonomo.activo).toBe(false);
    expect(d.recurring.find((r) => r.id === "fq")).toBeUndefined();
  });
});
