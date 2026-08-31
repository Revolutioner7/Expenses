import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import App from "../src/App.jsx";

const CATS = [
  { id: "super", name: "Supermercado", emoji: "🛒", color: "#2C6B5E", budget: null, bucket: "necesidad" },
  { id: "ocio", name: "Ocio", emoji: "🎬", color: "#7A5C86", budget: null, bucket: "deseo" },
  { id: "comerfuera", name: "Comer fuera", emoji: "🍽️", color: "#C2703A", budget: null, bucket: "deseo" },
  { id: "ahorro", name: "Fondo de ahorro", emoji: "🐷", color: "#2F7D6B", budget: null, bucket: "ahorro" },
];

let root, div, fetchCalls;

function seedStorage(seedData, opts = {}) {
  const disco = {};
  if (seedData) disco["cuaderno-gastos-v1"] = JSON.stringify(seedData);
  if (opts.seedOnboard) disco["cosecha-onboarding-v1"] = JSON.stringify(opts.seedOnboard);
  window.storage = {
    get: async (k) => (disco[k] == null ? null : { value: disco[k] }),
    set: async (k, v) => { disco[k] = v; return {}; },
  };
  return disco;
}

async function montar(seedData, opts = {}) {
  if (opts.standalone) window.navigator.standalone = true;
  fetchCalls = [];
  global.fetch = (...args) => { fetchCalls.push(args); return Promise.resolve({ ok: true }); };
  const disco = seedStorage(seedData, opts);
  await act(async () => {
    root.render(React.createElement(App));
    await new Promise((r) => setTimeout(r, 250));
  });
  return disco;
}

const click = (el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const setVal = (el, v) => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const txt = () => document.body.textContent;

beforeEach(() => {
  div = document.createElement("div");
  div.id = "root";
  document.body.appendChild(div);
  root = createRoot(div);
  window.navigator.standalone = false;
});

afterEach(() => {
  act(() => root.unmount());
  document.body.removeChild(div);
  vi.unstubAllGlobals();
});

describe("arranque y navegación", () => {
  it("muestra 'Cosecha', no 'Cuaderno'", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [{ id: "i1", label: "Nómina", amount: 2000, date: "2026-08-01" }] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(txt()).toContain("Cosecha");
    expect(txt()).not.toContain("Cuaderno");
  });

  it("no tiene barra de colores, sí caja de coach", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(document.querySelector(".cg-bar")).toBeNull();
    expect(document.querySelector(".cg-coachbox")).not.toBeNull();
  });

  it("todas las pestañas se abren sin errores", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    for (const nombre of ["Resumen", "Fijos", "Metas", "Ajustes", "Mes"]) {
      await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === nombre)); });
      expect(txt().length).toBeGreaterThan(0);
    }
  });
});

describe("motor de coach", () => {
  it("candidata de progreso de meta no depende del historial del mes anterior", async () => {
    const seed = {
      version: 8, categories: CATS, learned: {}, recurring: [],
      metas: [{ id: "m1", tipo: "objetivo", name: "Viaje", total: 1000, categoryId: "ahorro", plazoMeses: 5, creadoEl: "2026-06-01" }],
      months: {
        "2026-07": { expenses: [{ id: "p1", name: "Comunidad", amount: 100, categoryId: "super", date: "2026-07-02", time: null, fixed: true }], incomes: [] },
        "2026-08": {
          expenses: [{ id: "ah1", name: "Aporte", amount: 500, categoryId: "ahorro", date: "2026-08-05", time: "10:00" }],
          incomes: [{ id: "i1", label: "Nómina", amount: 2000, date: "2026-08-01" }],
        },
      },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    const caja = document.querySelector(".cg-coachbox")?.textContent || "";
    expect(caja).toContain("50%");
    expect(caja).toContain("Viaje");
    expect(caja).not.toMatch(/\d{3,}%/); // no debe repetirse el disparate del 1703%
  });
});

describe("Metas", () => {
  it("crea la meta con categoría dedicada, y enlaza mensualidad con meses", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [{ id: "i1", label: "Nómina", amount: 2500, date: "2026-08-01" }] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });

    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "+ Nueva")); });
    await act(async () => { setVal(document.getElementById("cg-metaname"), "Coche"); });
    await act(async () => { setVal(document.getElementById("cg-metatotal"), "1000"); });
    await act(async () => { setVal(document.getElementById("cg-metacuota"), "100"); });
    expect(document.getElementById("cg-metaplazo").value).toBe("10");

    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Crear meta")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
    expect(txt()).toContain("Coche");
    expect(txt()).toContain("0%");
  });
});

describe("patrón ver más / ver menos", () => {
  it("colapsa a 3 y 'ver menos' aparece dos veces al expandir", async () => {
    const seed = {
      version: 8,
      categories: [...CATS,
        { id: "c5", name: "Transporte", emoji: "🚌", color: "#3F7C8C", budget: null, bucket: "necesidad" },
        { id: "c6", name: "Salud", emoji: "💊", color: "#A63A2E", budget: null, bucket: "necesidad" },
      ],
      learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    const limitesCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Límites Categorías"));
    expect(limitesCard.querySelectorAll(".cg-item").length).toBe(3);

    const btnVerMas = [...limitesCard.querySelectorAll(".cg-vermas")].find((b) => b.textContent.startsWith("Ver más"));
    await act(async () => { click(btnVerMas); });
    const vermenos = [...document.querySelectorAll(".cg-vermas")].filter((b) => b.textContent === "Ver menos").length;
    expect(vermenos).toBeGreaterThanOrEqual(2);
  });
});

describe("onboarding", () => {
  it("usuario nuevo ve la pantalla de instalación", async () => {
    await montar(null, {});
    expect(txt()).toContain("Cómo instalar");
  });

  it("usuario existente nunca ve el onboarding, ve el aviso no bloqueante", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, {});
    expect(txt()).not.toContain("Cómo instalar");
    expect(txt()).not.toContain("He leído y acepto");
    expect(txt()).toContain("Novedad en esta actualización");
  });
});

describe("Ajuste de saldo", () => {
  it("corrige el disponible sin tocar gastado, ahorrado ni categorías", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [{ id: "e1", name: "Compra", amount: 100, categoryId: "super", date: "2026-08-05", time: "10:00" }],
        incomes: [{ id: "i1", label: "Nómina", amount: 2000, date: "2026-08-01" }],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });

    const disponibleAntes = document.querySelector(".cg-big").textContent;
    expect(disponibleAntes.replace(/\s/g, "")).toContain("1.900"); // 2000 - 100

    await act(async () => { setVal(document.getElementById("cg-ajuste-valor"), "-25"); });
    await act(async () => { setVal(document.getElementById("cg-ajuste-nota"), "Efectivo sin anotar"); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Guardar ajuste")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Mes")); });
    const disponibleDespues = document.querySelector(".cg-big").textContent;
    expect(disponibleDespues.replace(/\s/g, "")).toContain("1.875"); // 1900 - 25

    // el gasto sigue siendo 100, no 125 — el ajuste no cuenta como gasto
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Resumen")); });
    expect(txt()).toContain("100,00");
    expect(txt()).not.toContain("125,00");
  });

  it("muestra el ajuste activo con su nota, y no aparece ninguno si no se ha guardado", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    expect(txt()).not.toContain("Ajuste activo este mes");

    await act(async () => { setVal(document.getElementById("cg-ajuste-valor"), "10"); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Guardar ajuste")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(txt()).toContain("Ajuste activo este mes");
  });

  it("la explicación larga solo se ve al tocar el icono de información", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    expect(txt()).not.toContain("ninguna app de este tipo lo hace sin conectarse");
    await act(async () => { click(document.querySelector('button[aria-label="Más información sobre el ajuste de saldo"]')); });
    expect(txt()).toContain("ninguna app de este tipo lo hace sin conectarse");
  });
});

describe("Fijos: categorías colapsadas y buscador", () => {
  it("el selector de categoría al editar un fijo usa el patrón de siempre (4 + Nueva + ver más)", async () => {
    const seed = {
      version: 8,
      categories: [...CATS,
        { id: "c5", name: "Transporte", emoji: "🚌", color: "#3F7C8C", budget: null, bucket: "necesidad" },
        { id: "c6", name: "Salud", emoji: "💊", color: "#A63A2E", budget: null, bucket: "necesidad" },
      ],
      learned: {},
      recurring: [{ id: "f1", kind: "gasto", name: "Alquiler", categoryId: "super", amount: 700, day: 1, every: 1, auto: true }],
      metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Fijos")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "+ Nuevo")); });
    const nombresCategorias = ["Supermercado", "Ocio", "Comer fuera", "Fondo de ahorro", "Transporte", "Salud"];
    const chipsCategoria = [...document.querySelectorAll(".cg-chip")].filter((c) => nombresCategorias.some((n) => c.textContent.includes(n)));
    expect(chipsCategoria.length).toBe(4);
    expect(document.querySelector(".cg-vermas")).not.toBeNull();
  });

  it("busca fijos dados de alta por nombre y por categoría", async () => {
    const seed = {
      version: 8, categories: CATS, learned: {},
      recurring: [
        { id: "f1", kind: "gasto", name: "Alquiler", categoryId: "super", amount: 700, day: 1, every: 1, auto: true },
        { id: "f2", kind: "gasto", name: "Netflix", categoryId: "ocio", amount: 15, day: 5, every: 1, auto: true },
      ],
      metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Fijos")); });

    const input = document.querySelector('input[aria-label="Buscar fijos"]');
    await act(async () => { setVal(input, "ocio"); }); // busca por categoría, no por nombre
    expect(txt()).toContain("Netflix");
    const filasAlquiler = [...document.querySelectorAll(".cg-item")].filter((el) => el.textContent.includes("Alquiler"));
    expect(filasAlquiler.length).toBe(0);
  });

  it("busca también en el histórico de meses anteriores, no solo en los dados de alta", async () => {
    const seed = {
      version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: {
        "2026-07": { expenses: [{ id: "e1", name: "Comunidad", amount: 80, categoryId: "super", date: "2026-07-02", time: null, fixed: true }], incomes: [] },
        "2026-08": { expenses: [], incomes: [] },
      },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Fijos")); });

    const input = document.querySelector('input[aria-label="Buscar fijos"]');
    await act(async () => { setVal(input, "comunidad"); });
    expect(txt()).toContain("Histórico");
    expect(txt()).toContain("Comunidad");
  });

  it("con el buscador vacío, la vista vuelve a la normal (3 + ver más)", async () => {
    const seed = {
      version: 8, categories: CATS, learned: {},
      recurring: [
        { id: "f1", kind: "gasto", name: "Alquiler", categoryId: "super", amount: 700, day: 1, every: 1, auto: true },
        { id: "f2", kind: "gasto", name: "Luz", categoryId: "super", amount: 60, day: 5, every: 1, auto: true },
        { id: "f3", kind: "gasto", name: "Internet", categoryId: "super", amount: 40, day: 5, every: 1, auto: true },
        { id: "f4", kind: "gasto", name: "Netflix", categoryId: "ocio", amount: 15, day: 5, every: 1, auto: true },
      ],
      metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Fijos")); });
    const fijosCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Gastos e ingresos fijos"));
    expect(fijosCard.querySelectorAll(".cg-item").length).toBe(3);
  });
});

describe("Metas: viabilidad y checklist", () => {
  const seedConMargen = (metasIniciales = []) => ({
    version: 8,
    categories: [...CATS,
      { id: "vivienda", name: "Vivienda", emoji: "🏠", color: "#1E4E45", budget: null, bucket: "necesidad" },
    ],
    learned: {},
    recurring: [
      { id: "f1", kind: "ingreso", name: "Nómina", categoryId: null, amount: 2000, day: 1, every: 1, auto: true },
      { id: "f2", kind: "gasto", name: "Alquiler", categoryId: "vivienda", amount: 1200, day: 1, every: 1, auto: true },
    ],
    metas: metasIniciales,
    months: {
      "2026-08": {
        expenses: [
          { id: "e1", name: "Cine", amount: 300, categoryId: "ocio", date: "2026-08-05", time: "10:00" },
          { id: "e2", name: "Restaurantes", amount: 100, categoryId: "comerfuera", date: "2026-08-06", time: "10:00" },
        ],
        incomes: [{ id: "i1", label: "Nómina", amount: 2000, date: "2026-08-01" }],
      },
    },
  });

  it("variante A (sí cabe recortando): el total sale antes que la lista, y aceptar guarda el checklist", async () => {
    await montar(seedConMargen(), { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "+ Nueva")); });
    await act(async () => { setVal(document.getElementById("cg-metaname"), "Coche"); });
    await act(async () => { setVal(document.getElementById("cg-metatotal"), "10000"); });
    // margen = 2000-1200-400(historico variable, aquí 0 al no haber mes anterior)=800; cuota 1000 -> faltan 200,
    // Ocio (300) solo ya cubre el hueco
    await act(async () => { setVal(document.getElementById("cg-metacuota"), "1000"); });

    const caja = txt();
    const idxTotal = caja.indexOf("tendrías");
    const idxOcio = caja.indexOf("🎬 Ocio");
    expect(idxTotal).toBeGreaterThan(-1);
    expect(idxOcio).toBeGreaterThan(-1);
    expect(idxTotal).toBeLessThan(idxOcio); // el total aparece ANTES que la lista

    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Crear meta")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(txt()).toContain("Gastos a reducir");
    expect(txt()).toContain("Ocio");
  });

  it("variante B (no cabe ni recortando todo): dos caminos, 'alargar' aplica directo", async () => {
    await montar(seedConMargen(), { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "+ Nueva")); });
    await act(async () => { setVal(document.getElementById("cg-metaname"), "Viaje caro"); });
    await act(async () => { setVal(document.getElementById("cg-metatotal"), "24000"); });
    // cuota deseada 2000 -> faltan 1200, pero deseo total es solo 400 (300+100): no cubre
    await act(async () => { setVal(document.getElementById("cg-metacuota"), "2000"); });

    expect(txt()).toContain("Reducir gastos y mensualidad");
    expect(txt()).toContain("Alargar a");
    // margen con recorte máximo = 800+400=1200; plazo = ceil(24000-0 / 1200) = 20. Sin recorte: plazo=ceil(24000/800)=30
    const btnAlargar = [...document.querySelectorAll("button")].find((b) => b.textContent.startsWith("Poner"));
    expect(btnAlargar).toBeTruthy();
    await act(async () => { click(btnAlargar); });
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(txt()).toContain("30 meses");
  });

  it("la opción combinada muestra todo el deseo y aplica plazo+cuota recalculados", async () => {
    await montar(seedConMargen(), { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "+ Nueva")); });
    await act(async () => { setVal(document.getElementById("cg-metaname"), "Viaje caro"); });
    await act(async () => { setVal(document.getElementById("cg-metatotal"), "24000"); });
    await act(async () => { setVal(document.getElementById("cg-metacuota"), "2000"); });

    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Ver esta opción")); });
    expect(txt()).toContain("Comer fuera"); // el deseo entero, no solo el necesario
    expect(txt()).toContain("20 mes"); // plazo combinado calculado

    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Aplicar esta opción")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(txt()).toContain("20 meses");
    expect(txt()).toContain("Gastos a reducir");
  });

  it("checklist: lo pendiente se ve siempre; lo recién marcado se ve tachado en la misma sesión; en un montaje nuevo ya está recogido tras Detalles", async () => {
    const seed = seedConMargen([{
      id: "m1", tipo: "objetivo", name: "Coche", total: 10000, categoryId: "ahorro", plazoMeses: 10, creadoEl: "2026-08-01",
      recortesPendientes: [
        { categoryId: "ocio", nombre: "Ocio", emoji: "🎬", monto: 300, hecho: false },
        { categoryId: "comerfuera", nombre: "Comer fuera", emoji: "🍽️", monto: 100, hecho: false },
      ],
    }]);
    const { disco } = await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    expect(txt()).toContain("Ocio");
    expect(txt()).toContain("Comer fuera");

    // marcar "Ocio" como reducido
    const checkOcio = [...document.querySelectorAll('button[aria-label="Marcar Ocio como reducido"]')][0];
    await act(async () => { click(checkOcio); });
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    // en la MISMA sesión, sigue visible, tachado
    expect(txt()).toContain("Ocio");
    expect(txt()).not.toContain("Detalles");

    // "reabrir" la app (nuevo montaje) desde los mismos datos persistidos
    root.render(null);
    const div2 = document.createElement("div"); div2.id = "root2"; document.body.appendChild(div2);
    const root2 = createRoot(div2);
    await act(async () => {
      root2.render(React.createElement(App));
      await new Promise((r) => setTimeout(r, 250));
    });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    expect(txt()).toContain("Comer fuera"); // pendiente, sigue visible
    expect(txt()).toContain("Detalles"); // lo ya reducido se recogió
    act(() => root2.unmount());
    document.body.removeChild(div2);
  });
});

describe("Vista por ciclo de nómina", () => {
  it("con día de cobro puesto, el disponible cuenta desde el ciclo, no del mes natural", async () => {
    vi.setSystemTime(new Date(2026, 7, 15)); // 15 de agosto de 2026 -> ciclo 27 jul - 26 ago (día cobro 27)
    const seed = {
      version: 8, categories: CATS, learned: {}, recurring: [], metas: [], diaCobro: 27,
      months: {
        "2026-07": {
          incomes: [{ id: "i0", label: "Nómina", amount: 2000, date: "2026-07-27" }], // dentro del ciclo
          expenses: [{ id: "e0", name: "Antes del ciclo", amount: 999, categoryId: "super", date: "2026-07-20", time: "10:00" }], // fuera
        },
        "2026-08": {
          incomes: [],
          expenses: [
            { id: "e1", name: "Dentro del ciclo", amount: 100, categoryId: "super", date: "2026-08-05", time: "10:00" },
            { id: "e2", name: "Después del ciclo", amount: 999, categoryId: "super", date: "2026-08-27", time: "10:00" }, // fuera
          ],
        },
      },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(txt()).toContain("ciclo");
    // disponible del ciclo: 2000 (nómina 27 jul) - 100 (gasto 5 ago) = 1900, NO 999+999 de fuera del ciclo
    expect(document.querySelector(".cg-big").textContent.replace(/\s/g, "")).toContain("1.900");
    const cabecera = document.querySelector(".cg-sub").textContent;
    expect(cabecera).not.toContain("999");
    expect(cabecera).toContain("2.000,00 recibido");
    expect(cabecera).toContain("100,00 gastado");
    // Movimientos, en cambio, sí sigue mostrando TODO el mes de calendario — a propósito, sin filtrar por ciclo
    expect(txt()).toContain("Después del ciclo");
    vi.useRealTimers();
  });

  it("sin día de cobro puesto, sigue por mes natural de toda la vida", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { incomes: [{ id: "i1", label: "Nómina", amount: 2000, date: "2026-08-01" }], expenses: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(txt()).not.toContain("· ciclo");
  });
});

describe("Worker / contador anónimo", () => {
  it("no llama a fetch mientras WORKER_URL sea el de relleno", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { standalone: true, seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await new Promise((r) => setTimeout(r, 100));
    expect(fetchCalls.length).toBe(0);
  });
});
