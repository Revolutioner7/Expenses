import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import App from "../src/App.jsx";
import { APP_NAME } from "../src/constants.js";

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
  vi.setSystemTime(new Date(2026, 7, 15)); // fecha fija por defecto: 15 de agosto de 2026.
  // Las pruebas que necesiten otra fecha (el ciclo de nómina, por ejemplo) la fijan ellas
  // mismas dentro de su propio test — sigue funcionando igual, solo cambia el punto de partida.
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
  vi.useRealTimers(); // por si una prueba con fecha simulada falla antes de restaurarlo ella misma
});

describe("arranque y navegación", () => {
  it("muestra el nombre configurado (APP_NAME), no 'Cuaderno' ni 'Cosecha' a pelo", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [{ id: "i1", label: "Nómina", amount: 2000, date: "2026-08-01" }] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(txt()).toContain(APP_NAME);
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
    for (const nombre of ["Resumen", "Ingresos", "Metas", "Ajustes", "Gastos"]) {
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
  it("colapsa a 3, y 'ver menos' aparece una sola vez al expandir (no duplicado)", async () => {
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
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Dinero"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Límites Categorías")); });
    const limitesCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Límites Categorías"));
    expect(limitesCard.querySelectorAll(".cg-item").length).toBe(3);

    const btnVerMas = [...limitesCard.querySelectorAll(".cg-vermas")].find((b) => b.textContent.startsWith("Ver más"));
    await act(async () => { click(btnVerMas); });
    const vermenos = [...limitesCard.querySelectorAll(".cg-vermas")].filter((b) => b.textContent === "Ver menos");
    expect(vermenos.length).toBe(1);

    // y al pulsarlo, vuelve a colapsar a 3
    await act(async () => { click(vermenos[0]); });
    expect(limitesCard.querySelectorAll(".cg-item").length).toBe(3);
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
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Dinero"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Ajuste de saldo")); });

    const disponibleAntes = document.querySelector(".cg-big").textContent;
    expect(disponibleAntes.replace(/\s/g, "")).toContain("1.900"); // 2000 - 100

    await act(async () => { setVal(document.getElementById("cg-ajuste-valor"), "-25"); });
    await act(async () => { setVal(document.getElementById("cg-ajuste-nota"), "Efectivo sin anotar"); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Guardar ajuste")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Gastos")); });
    const disponibleDespues = document.querySelector(".cg-big").textContent;
    expect(disponibleDespues.replace(/\s/g, "")).toContain("1.875"); // 1900 - 25

    // el gasto sigue siendo 100, no 125 — el ajuste no cuenta como gasto
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Resumen")); });
    expect(txt()).toContain("100,00");
    expect(txt()).not.toContain("125,00");
  });

  it("muestra el ajuste activo con su nota (texto claro), y no aparece ninguno si no se ha guardado", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Dinero"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Ajuste de saldo")); });
    expect(txt()).not.toContain("diferencia de");

    await act(async () => { setVal(document.getElementById("cg-ajuste-valor"), "10"); });
    await act(async () => { setVal(document.getElementById("cg-ajuste-nota"), "testing"); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Guardar ajuste")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    expect(txt()).toContain("Ajuste guardado"); // el popup breve
    expect(document.getElementById("cg-ajuste-valor").value).toBe(""); // campo limpio, listo para el siguiente
    expect(document.getElementById("cg-ajuste-nota").value).toBe("");
    expect(txt()).toContain("Este mes ha habido una diferencia de");
    expect(txt()).toContain("testing");
  });

  it("quitar el ajuste con la X lo elimina, sin pedir confirmación", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Dinero"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Ajuste de saldo")); });
    await act(async () => { setVal(document.getElementById("cg-ajuste-valor"), "10"); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Guardar ajuste")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(txt()).toContain("Este mes ha habido una diferencia de");

    await act(async () => { click(document.querySelector('button[aria-label="Quitar ajuste"]')); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(txt()).not.toContain("Este mes ha habido una diferencia de");
  });

  it("la explicación larga solo se ve al tocar el icono de información", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Dinero"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Ajuste de saldo")); });
    expect(txt()).not.toContain("ninguna app de este tipo lo hace sin conectarse");
    await act(async () => { click(document.querySelector('button[aria-label="Más información sobre el ajuste de saldo"]')); });
    expect(txt()).toContain("ninguna app de este tipo lo hace sin conectarse");
  });
});

describe("Fijos: forma de pago", () => {
  it("un fijo con forma de pago la traslada al gasto que genera solo cada mes", async () => {
    const seed = {
      version: 8, categories: CATS, learned: {}, metas: [], bancos: [{ id: "b1", name: "CaixaBank" }],
      recurring: [{
        id: "f1", kind: "gasto", name: "Hipoteca", categoryId: "super", amount: 600, day: 1, every: 1, auto: true,
        since: "2026-08", formaPago: "domiciliado", bancoId: "b1",
      }],
      months: { "2026-08": { expenses: [], incomes: [] } },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    // el fijo se anotó solo (auto:true, día 1, ya pasado) — se ve en Resumen bajo domiciliado
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Resumen")); });
    const cardPago = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Gasto por forma de pago"));
    expect(cardPago.textContent).toContain("domiciliado");
    expect(cardPago.textContent).toContain("600,00");
  });

  it("al editar un fijo ya existente, la forma de pago guardada aparece ya marcada", async () => {
    const seed = {
      version: 8, categories: CATS, learned: {}, metas: [], bancos: [{ id: "b1", name: "CaixaBank" }],
      recurring: [{
        id: "f1", kind: "gasto", name: "Netflix", categoryId: "ocio", amount: 15, day: 5, every: 1, auto: true,
        since: "2026-08", formaPago: "bizum",
      }],
      months: { "2026-08": { expenses: [], incomes: [] } },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-toggle button")].find((b) => b.textContent === "Fijos")); });
    await act(async () => { click([...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Netflix"))); });
    const sheet = document.querySelector(".cg-sheet");
    expect(sheet.querySelector(".ti-check")).not.toBeNull(); // algo ya viene marcado
    expect(sheet.textContent).toContain("Bizum");
  });
});

describe("Interruptor de Forma de pago", () => {
  it("en el onboarding, contestar 'No' salta el paso de '¿Cómo pagas normalmente?' del todo, y guarda formaPagoActivada en false", async () => {
    await montar(null, {});
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Entendido, empezar")); });
    await act(async () => { setVal(document.getElementById("cg-onboard-email"), "test@test.com"); });
    await act(async () => { click(document.getElementById("cg-onboard-accept")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Empezar")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Saltar por ahora")); }); // vista, sin elegir nada
    expect(txt()).toContain("¿Te interesa diferenciar cómo se pagan los gastos?");

    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "No")); });
    // salta pago del todo: directo a periodicos, sin ver "¿Cómo pagas normalmente?"
    expect(txt()).not.toContain("¿Cómo pagas normalmente?");
    expect(txt()).toContain("¿Tienes gastos que no se pagan mensualmente?");

    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "No, gracias")); }); // tocar la opción ya termina el inicio
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    // ya en la app, con el interruptor desactivado: no debe verse el selector de forma de pago
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    expect(addCard.textContent).not.toContain("Forma de pago");
  });

  it("en el onboarding, contestar 'Sí' lleva al paso de '¿Cómo pagas normalmente?'", async () => {
    await montar(null, {});
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Entendido, empezar")); });
    await act(async () => { setVal(document.getElementById("cg-onboard-email"), "test@test.com"); });
    await act(async () => { click(document.getElementById("cg-onboard-accept")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Empezar")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Saltar por ahora")); });

    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Sí")); });
    expect(txt()).toContain("¿Cómo pagas normalmente?");
  });


  it("sin el campo definido (usuario ya existente), empieza activado, mostrando el selector normal", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    expect(addCard.textContent).toContain("Forma de pago");
  });

  it("al desactivarlo, desaparece de Nuevo gasto, de Ajustes, y de Resumen", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [{ id: "e1", name: "Compra", amount: 20, categoryId: "super", date: "2026-08-01", time: "10:00", formaPago: "efectivo" }], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Dinero"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Desactivado")); });

    // ya no aparece la tarjeta de "Forma de pago por defecto" en Ajustes
    expect(txt()).not.toContain("Forma de pago por defecto");

    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Gastos")); });
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    expect(addCard.textContent).not.toContain("Forma de pago");

    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Resumen")); });
    expect(txt()).not.toContain("Gasto por forma de pago");
  });

  it("al reactivarlo, el gasto ya guardado con forma de pago conserva su valor, no se perdió al desactivar", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [{ id: "e1", name: "Compra", amount: 20, categoryId: "super", date: "2026-08-01", time: "10:00", formaPago: "efectivo" }], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Dinero"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Desactivado")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Activado")); });

    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Resumen")); });
    expect(txt()).toContain("Gasto por forma de pago");
    expect(txt()).toContain("Efectivo");
  });
});

describe("Gastos periódicos", () => {
  it("migra solas las mini-metas antiguas (categoría dedicada) a la categoría única compartida", async () => {
    const seed = {
      version: 8,
      categories: [...CATS, { id: "seguro-leo-cat", name: "Seguro Leo", emoji: "🐷", color: "#2C6B5E", bucket: "ahorro" }],
      learned: {}, recurring: [
        { id: "f1", kind: "gasto", name: "Seguro Leo", categoryId: "super", amount: 300, day: 1, every: 3, auto: true },
      ],
      // mini-meta "vieja", con su propia categoría dedicada (como se creaban antes del rediseño)
      metas: [{ id: "m1", tipo: "objetivo", name: "Seguro Leo", total: 300, plazoMeses: 3, categoryId: "seguro-leo-cat", fijoId: "f1", cicloDesde: "2026-08-01", recortesPendientes: [] }],
      months: { "2026-08": { expenses: [{ id: "e1", name: "Aporte viejo", amount: 50, categoryId: "seguro-leo-cat", date: "2026-08-05", time: "10:00" }], incomes: [] } },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });

    // la categoría única debe existir ya, y ser seleccionable en Nuevo gasto
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    let btnVerMas = [...addCard.querySelectorAll("button")].find((b) => b.textContent === "Ver más");
    if (btnVerMas) await act(async () => { click(btnVerMas); });
    expect(addCard.textContent).toContain("Gastos periódicos");

    // y la mini-meta ya migrada sigue contando el aporte de 50€ que ya tenía (no se pierde el rastro)
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Gastos periódicos"))); });
    expect(txt()).toContain("50,00 / 300,00");
  });

  it("la barra general de Gastos periódicos muestra el % del mes en conjunto, con celebración al llegar al 100%", async () => {
    const seed = {
      version: 8, categories: [...CATS, { id: "gastos-periodicos-compartida", name: "Gastos periódicos", emoji: "🗓️", color: "#2C6B5E", bucket: "ahorro" }],
      learned: {}, recurring: [
        { id: "f1", kind: "gasto", name: "Seguro del coche", categoryId: "super", amount: 900, day: 1, every: 3, auto: true }, // cuota 300/mes
      ],
      metas: [{ id: "mA", tipo: "objetivo", name: "Seguro del coche", total: 900, plazoMeses: 3, categoryId: "gastos-periodicos-compartida", fijoId: "f1", cicloDesde: "2026-08-01", recortesPendientes: [] }],
      months: { "2026-08": { expenses: [{ id: "e1", name: "Aporte", amount: 150, categoryId: "gastos-periodicos-compartida", date: "2026-08-05", time: "10:00" }], incomes: [] } },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Gastos periódicos"))); });
    // 150 de 300 necesarios este mes -> 50%, sin celebración todavía
    let card = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Este mes, en conjunto"));
    expect(card.textContent).toContain("50%");
    expect(card.textContent).not.toContain("🎉");

    // completo el resto: 150 más, hasta llegar a 300
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Gastos")); });
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    await act(async () => { setVal(addCard.querySelector("#cg-name"), "Aporte 2"); });
    await act(async () => { setVal(addCard.querySelector("#cg-amt"), "150"); });
    let btnVerMas = [...addCard.querySelectorAll("button")].find((b) => b.textContent === "Ver más");
    if (btnVerMas) await act(async () => { click(btnVerMas); });
    const chip = [...addCard.querySelectorAll(".cg-chip")].find((c) => c.textContent.includes("Gastos periódicos"));
    await act(async () => { click(chip); });
    await act(async () => { click([...addCard.querySelectorAll("button")].find((b) => b.textContent === "Añadir gasto")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    card = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Completado este mes"));
    expect(card).not.toBeUndefined();
    expect(card.textContent).toContain("🎉");
  });


  it("la categoría adivinada aparece entre las primeras, sin tener que tocar Ver más", async () => {
    const seed = { version: 8,
      categories: [
        { id: "c1", name: "Cat1", emoji: "1️⃣", color: "#111", bucket: "necesidad" },
        { id: "c2", name: "Cat2", emoji: "2️⃣", color: "#222", bucket: "necesidad" },
        { id: "c3", name: "Cat3", emoji: "3️⃣", color: "#333", bucket: "necesidad" },
        { id: "c4", name: "Cat4", emoji: "4️⃣", color: "#444", bucket: "necesidad" },
        { id: "salud", name: "Salud", emoji: "💊", color: "#555", bucket: "necesidad" },
      ],
      learned: { "farmacia": { "salud": 5 } },
      recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    await act(async () => { setVal(addCard.querySelector("#cg-name"), "Farmacia del centro"); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // Salud, la adivinada, debe estar entre las 4 visibles, sin necesitar tocar nada más
    expect(addCard.textContent).toContain("Salud");
    const chips = [...addCard.querySelectorAll(".cg-chip")];
    expect(chips.length).toBe(5); // 4 categorías visibles + "+ Nueva" (que también lleva la clase cg-chip)
    expect(chips.some((c) => c.textContent.includes("Salud"))).toBe(true);
  });


  it("la necesidad fija de un fijo periódico se prorratea por su periodicidad, no se cuenta entera", async () => {
    const seed = {
      version: 8, categories: CATS, learned: {}, metas: [],
      recurring: [
        // seguro anual de necesidad, 1200€ cada 12 meses -> prorrateado, 100€/mes
        { id: "f1", kind: "gasto", name: "Seguro coche", categoryId: "coche", amount: 1200, day: 1, every: 12, auto: true },
      ],
      months: { "2026-08": { expenses: [], incomes: [{ id: "i1", label: "Nómina", amount: 2000, date: "2026-08-01" }] } },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "+ Nueva")); });
    const sheet = document.querySelector(".cg-sheet");
    await act(async () => { setVal(sheet.querySelector("#cg-metaname"), "Viaje"); });
    await act(async () => { setVal(sheet.querySelector("#cg-metacuota"), "50"); }); // bien holgado si se prorratea bien (100€/mes de necesidad, no 1200€/mes)
    await act(async () => { setVal(sheet.querySelector("#cg-metaplazo"), "6"); });
    expect(sheet.textContent).not.toContain("No cabe del todo");
  });


  it("la categoría 'Gastos periódicos' muestra su logo propio (calendario con flechas), no un emoji de texto", async () => {
    const seed = {
      version: 8,
      categories: [...CATS, { id: "gastos-periodicos-compartida", name: "Gastos periódicos", emoji: "🗓️", color: "#2C6B5E", bucket: "ahorro" }],
      learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    let btnVerMas = [...addCard.querySelectorAll("button")].find((b) => b.textContent === "Ver más");
    if (btnVerMas) await act(async () => { click(btnVerMas); });
    const chip = [...addCard.querySelectorAll(".cg-chip")].find((c) => c.textContent.includes("Gastos periódicos"));
    const img = chip.querySelector("img");
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("./gastos-periodicos.png");
    expect(chip.textContent).not.toContain("🗓️"); // el emoji de texto ya no se muestra para esta categoría

    // y una categoría normal sigue mostrando su emoji de siempre, sin imagen
    const chipNormal = [...addCard.querySelectorAll(".cg-chip")].find((c) => c.textContent.includes("Supermercado"));
    expect(chipNormal.querySelector("img")).toBeNull();
  });


  it("con Repetir cada activo, escribir solo la mensualidad calcula el total solo (sin tocar 'en cuántos meses')", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [{ id: "e1", name: "Nómina extra", amount: 2000, categoryId: "super", date: "2026-08-01", time: "09:00" }], incomes: [{ id: "i1", label: "Nómina", amount: 3000, date: "2026-08-01" }] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "+ Nueva")); });
    const sheet = document.querySelector(".cg-sheet");
    await act(async () => { setVal(sheet.querySelector("#cg-metaname"), "Ahorro mensual"); });
    await act(async () => { click(sheet.querySelector('input[type="checkbox"]')); }); // Repetir cada
    await act(async () => { setVal(sheet.querySelector("#cg-metacuota"), "100"); }); // solo mensualidad, nada más

    // el campo "en cuántos meses" queda deshabilitado, sincronizado con repiteCada (3 por defecto)
    expect(sheet.querySelector("#cg-metaplazo").disabled).toBe(true);
    expect(sheet.querySelector("#cg-metaplazo").value).toBe("3");
    // y ya no dice "no es posible" solo porque el total se quedara en 0 sin calcular
    expect(sheet.textContent).not.toContain("Con tus gastos actuales no es posible");

    await act(async () => { click([...sheet.querySelectorAll("button")].find((b) => b.textContent === "Crear meta")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(txt()).toContain("Ahorro mensual");
  });


  it("el atajo 'Añadir gasto periódico' desde Metas lleva a Nuevo gasto con categoría y nombre ya puestos", async () => {
    const seed = {
      version: 8,
      categories: [...CATS, { id: "gastos-periodicos-compartida", name: "Gastos periódicos", emoji: "🗓️", color: "#2C6B5E", bucket: "ahorro" }],
      learned: {}, recurring: [
        { id: "f1", kind: "gasto", name: "Seguro del coche", categoryId: "super", amount: 900, day: 1, every: 3, auto: true },
      ],
      metas: [{ id: "mA", tipo: "objetivo", name: "Seguro del coche", total: 900, plazoMeses: 3, categoryId: "gastos-periodicos-compartida", fijoId: "f1", cicloDesde: "2026-08-01", recortesPendientes: [] }],
      months: { "2026-08": { expenses: [], incomes: [] } },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Gastos periódicos"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Añadir gasto periódico"))); });

    // ya en Gastos, el formulario de Nuevo gasto trae la categoría y el nombre puestos
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    expect(addCard).not.toBeUndefined();
    expect(document.getElementById("cg-name").value).toBe("Gastos periódicos");
    const chip = [...addCard.querySelectorAll(".cg-chip")].find((c) => c.textContent.includes("Gastos periódicos"));
    expect(chip.className).toContain("on");
  });

  it("tocar el chip 'Gastos periódicos' con el Concepto en blanco lo autocompleta", async () => {
    const seed = {
      version: 8,
      categories: [...CATS, { id: "gastos-periodicos-compartida", name: "Gastos periódicos", emoji: "🗓️", color: "#2C6B5E", bucket: "ahorro" }],
      learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    let btnVerMas = [...addCard.querySelectorAll("button")].find((b) => b.textContent === "Ver más");
    if (btnVerMas) await act(async () => { click(btnVerMas); });
    const chip = [...addCard.querySelectorAll(".cg-chip")].find((c) => c.textContent.includes("Gastos periódicos"));
    await act(async () => { click(chip); });
    expect(document.getElementById("cg-name").value).toBe("Gastos periódicos");
  });


  it("categoría única compartida: un gasto anotado ahí se reparte proporcionalmente entre varias mini-metas", async () => {
    const seed = {
      version: 8,
      categories: [...CATS, { id: "gastos-periodicos-compartida", name: "Gastos periódicos", emoji: "🐷", color: "#2C6B5E", bucket: "ahorro" }],
      learned: {}, recurring: [
        { id: "f1", kind: "gasto", name: "Seguro del coche", categoryId: "super", amount: 900, day: 1, every: 3, auto: true },
        { id: "f2", kind: "gasto", name: "Comunidad", categoryId: "super", amount: 300, day: 1, every: 3, auto: true },
      ],
      metas: [
        // cuota de A: 900/3=300 €/mes; cuota de B: 300/3=100 €/mes; suma=400 €/mes
        { id: "mA", tipo: "objetivo", name: "Seguro del coche", total: 900, plazoMeses: 3, categoryId: "gastos-periodicos-compartida", fijoId: "f1", cicloDesde: "2026-08-01", recortesPendientes: [] },
        { id: "mB", tipo: "objetivo", name: "Comunidad", total: 300, plazoMeses: 3, categoryId: "gastos-periodicos-compartida", fijoId: "f2", cicloDesde: "2026-08-01", recortesPendientes: [] },
      ],
      months: { "2026-08": { expenses: [], incomes: [] } },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });

    // anoto un gasto de 200€ en la categoría única, por el formulario normal de Nuevo gasto
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    await act(async () => { setVal(addCard.querySelector("#cg-name"), "Aporte periódicos"); });
    await act(async () => { setVal(addCard.querySelector("#cg-amt"), "200"); });
    await act(async () => { click([...addCard.querySelectorAll(".cg-chip")].find((c) => c.textContent.includes("Gastos periódicos")) || [...addCard.querySelectorAll("button")].find((b) => b.textContent === "Ver más")); });
    // si estaba detrás de "Ver más", lo busco otra vez ya expandido
    let chipCat = [...addCard.querySelectorAll(".cg-chip")].find((c) => c.textContent.includes("Gastos periódicos"));
    if (chipCat) await act(async () => { click(chipCat); });
    await act(async () => { click([...addCard.querySelectorAll("button")].find((b) => b.textContent === "Añadir gasto")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Gastos periódicos"))); });
    // A: 200 * (300/400) = 150,00 €; B: 200 * (100/400) = 50,00 €
    expect(txt()).toContain("150,00 / 900,00");
    expect(txt()).toContain("50,00 / 300,00");
  });


  it("con la preferencia activada, crear un fijo con periodicidad >1 crea la mini-meta sola, con un aviso breve", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      gastosPeriodicosActivado: true,
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-toggle button")].find((b) => b.textContent === "Fijos")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("+ Nuevo"))); });
    const sheet = document.querySelector(".cg-sheet");
    await act(async () => { setVal(sheet.querySelector("#cg-fname"), "Seguro del coche"); });
    await act(async () => { setVal(sheet.querySelector("#cg-famt"), "1200"); });
    await act(async () => { click([...sheet.querySelectorAll(".cg-chip")].find((c) => c.textContent.includes("Supermercado"))); });
    await act(async () => { click([...sheet.querySelectorAll(".cg-chip")].find((c) => c.textContent === "Anual")); });

    expect(sheet.textContent).not.toContain("¿Apartamos dinero para este gasto?"); // ya no pide confirmación
    await act(async () => { click([...sheet.querySelectorAll("button")].find((b) => b.textContent === "Crear fijo")); });
    expect(sheet.textContent).toContain("Mini-meta creada"); // aviso breve, sin haber pulsado nada más
    expect(sheet.textContent).toContain("100,00"); // 1200/12
    await act(async () => { await new Promise((r) => setTimeout(r, 1500)); }); // se cierra sola

    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    expect(txt()).toContain("Gastos periódicos");
    expect(txt()).toContain("100"); // apartar este mes
  });

  it("no ofrece la mini-meta si la preferencia está desactivada", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      gastosPeriodicosActivado: false,
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-toggle button")].find((b) => b.textContent === "Fijos")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("+ Nuevo"))); });
    const sheet = document.querySelector(".cg-sheet");
    await act(async () => { setVal(sheet.querySelector("#cg-fname"), "Seguro del coche"); });
    await act(async () => { setVal(sheet.querySelector("#cg-famt"), "1200"); });
    await act(async () => { click([...sheet.querySelectorAll(".cg-chip")].find((c) => c.textContent.includes("Supermercado"))); });
    await act(async () => { click([...sheet.querySelectorAll(".cg-chip")].find((c) => c.textContent === "Anual")); });
    expect(sheet.textContent).not.toContain("¿Apartamos dinero para este gasto?");
  });

  it("en Metas, las mini-metas se agrupan bajo una sola tarjeta, con el desglose al desplegar", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], months: { "2026-08": { expenses: [], incomes: [] } },
      metas: [
        { id: "m1", tipo: "objetivo", name: "Seguro del coche", total: 890, plazoMeses: 12, categoryId: "ah1", fijoId: "f1", recortesPendientes: [] },
        { id: "m2", tipo: "objetivo", name: "Gastos de comunidad", total: 153, plazoMeses: 4, categoryId: "ah2", fijoId: "f2", recortesPendientes: [] },
      ],
      categories: [...CATS,
        { id: "ah1", name: "Seguro del coche", emoji: "🐷", color: "#2C6B5E", bucket: "ahorro" },
        { id: "ah2", name: "Gastos de comunidad", emoji: "🐷", color: "#2C6B5E", bucket: "ahorro" },
      ],
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    // colapsada: 890/12 + 153/4 = 74,17 + 38,25 = 112,42
    expect(txt()).toContain("Gastos periódicos");
    expect(txt()).toContain("112");
    expect(txt()).not.toContain("Seguro del coche"); // colapsada, no se ve el desglose todavía

    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Gastos periódicos"))); });
    expect(txt()).toContain("Seguro del coche");
    expect(txt()).toContain("Gastos de comunidad");
    expect(txt()).toContain("890"); // el total, no solo la cuota
  });

  it("al cobrarse de verdad el fijo enlazado, la mini-meta reinicia su progreso (lo aportado antes ya no cuenta)", async () => {
    const seed = {
      version: 8, categories: [...CATS, { id: "ahcoche", name: "Seguro del coche", emoji: "🐷", color: "#2C6B5E", bucket: "ahorro" }],
      learned: {},
      recurring: [{ id: "f1", kind: "gasto", name: "Seguro del coche", categoryId: "super", amount: 900, day: 1, every: 3, auto: true, since: "2026-02" }],
      metas: [{ id: "m1", tipo: "objetivo", name: "Seguro del coche", total: 900, plazoMeses: 3, categoryId: "ahcoche", fijoId: "f1", recortesPendientes: [] }],
      months: {
        "2026-07": { expenses: [{ id: "e1", name: "Aporte", amount: 50, categoryId: "ahcoche", date: "2026-07-15", time: "10:00" }], incomes: [] },
        "2026-08": { expenses: [], incomes: [] },
      },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    // el fijo (every:3, since febrero) toca en agosto (hoy, 15 ago) -> se anota solo al montar,
    // y debería reiniciar la mini-meta: el aporte de julio ya no debería contar
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Gastos periódicos"))); });
    expect(txt()).toContain("0,00 / 900,00"); // no 50,00 / 900,00
  });

  it("el paso nuevo de onboarding aplica gastosPeriodicosActivado y marca el aviso como visto", async () => {
    await montar(null, {});
    // install -> consent
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Entendido, empezar")); });
    // consent -> vista
    await act(async () => { setVal(document.getElementById("cg-onboard-email"), "test@test.com"); });
    await act(async () => { click(document.getElementById("cg-onboard-accept")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Empezar")); });
    // vista -> difpago
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Disponible")); }); // tocar ya avanza
    // difpago -> pago
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Sí")); });
    // pago -> periodicos
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Casi siempre en efectivo"))); }); // tocar ya avanza
    // periodicos -> fin
    expect(txt()).toContain("¿Tienes gastos que no se pagan mensualmente?");
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Sí, ayudadme")); }); // tocar ya termina el inicio
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    // ya en la app: la preferencia quedó activada, así que el aviso para usuarios existentes no debe verse
    expect(txt()).not.toContain("¿Te gustaría que te ayudemos a pagar tus gastos");
  });

  it("el toggle en Ajustes → Dinero cambia gastosPeriodicosActivado", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Dinero"))); });
    await act(async () => { click([...document.querySelectorAll("button")].filter((b) => b.textContent === "Activado")[1]); }); // [1]: el segundo "Activado" de la pantalla es el de Gastos periódicos, el primero es el de Forma de pago

    // ahora, al crear un fijo con periodicidad >1, debería ofrecer la mini-meta
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Gastos")); });
    await act(async () => { click([...document.querySelectorAll(".cg-toggle button")].find((b) => b.textContent === "Fijos")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("+ Nuevo"))); });
    const sheet = document.querySelector(".cg-sheet");
    await act(async () => { setVal(sheet.querySelector("#cg-fname"), "Seguro"); });
    await act(async () => { setVal(sheet.querySelector("#cg-famt"), "600"); });
    await act(async () => { click([...sheet.querySelectorAll(".cg-chip")].find((c) => c.textContent.includes("Supermercado"))); });
    await act(async () => { click([...sheet.querySelectorAll(".cg-chip")].find((c) => c.textContent === "Trimestral")); });
    expect(sheet.textContent).not.toContain("¿Apartamos dinero para este gasto?"); // ya no pide confirmación
    await act(async () => { click([...sheet.querySelectorAll("button")].find((b) => b.textContent === "Crear fijo")); });
    expect(sheet.textContent).toContain("Mini-meta creada");
  });

  it("activar el interruptor con fijos periódicos ya existentes ofrece crearles la mini-meta de golpe", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, metas: [],
      recurring: [
        { id: "f1", kind: "gasto", name: "Seguro del coche", categoryId: "super", amount: 900, day: 1, every: 3, auto: true },
        { id: "f2", kind: "gasto", name: "Comunidad", categoryId: "super", amount: 600, day: 1, every: 6, auto: true },
      ],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Dinero"))); });
    await act(async () => { click([...document.querySelectorAll("button")].filter((b) => b.textContent === "Activado")[1]); }); // [1]: el segundo "Activado" de la pantalla es el de Gastos periódicos, el primero es el de Forma de pago

    const sheet = document.querySelector(".cg-sheet");
    expect(sheet).not.toBeNull();
    expect(sheet.textContent).toContain("Seguro del coche");
    expect(sheet.textContent).toContain("Comunidad");
    await act(async () => { click([...sheet.querySelectorAll("button")].find((b) => b.textContent.includes("Sí, crear"))); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Gastos periódicos"))); });
    expect(txt()).toContain("Seguro del coche");
    expect(txt()).toContain("Comunidad");
  });

  it("si no hay ningún fijo periódico sin mini-meta, activar el interruptor no muestra ninguna oferta", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Dinero"))); });
    await act(async () => { click([...document.querySelectorAll("button")].filter((b) => b.textContent === "Activado")[1]); }); // [1]: el segundo "Activado" de la pantalla es el de Gastos periódicos, el primero es el de Forma de pago
    expect(document.querySelector(".cg-sheet")).toBeNull();
  });

  it("el aviso para usuarios existentes aparece una sola vez y se puede cerrar", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(txt()).toContain("¿Te gustaría que te ayudemos a pagar tus gastos");
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Cerrar" && b.closest(".cg-pending"))); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(txt()).not.toContain("¿Te gustaría que te ayudemos a pagar tus gastos");
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
    await act(async () => { click([...document.querySelectorAll(".cg-toggle button")].find((b) => b.textContent === "Fijos")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "+ Nuevo")); });
    const nombresCategorias = ["Supermercado", "Ocio", "Comer fuera", "Fondo de ahorro", "Transporte", "Salud"];
    const sheet = document.querySelector(".cg-sheet");
    const chipsCategoria = [...sheet.querySelectorAll(".cg-chip")].filter((c) => nombresCategorias.some((n) => c.textContent.includes(n)));
    expect(chipsCategoria.length).toBe(4);
    expect(sheet.querySelector(".cg-vermas")).not.toBeNull();
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
    await act(async () => { click([...document.querySelectorAll(".cg-toggle button")].find((b) => b.textContent === "Fijos")); });

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
    await act(async () => { click([...document.querySelectorAll(".cg-toggle button")].find((b) => b.textContent === "Fijos")); });

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
    await act(async () => { click([...document.querySelectorAll(".cg-toggle button")].find((b) => b.textContent === "Fijos")); });
    const fijosCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Gastos fijos"));
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

  it("la proyección separa fijo de variable: la hipoteca no se multiplica por los días", async () => {
    vi.setSystemTime(new Date(2026, 8, 1)); // 1 de septiembre, 6 días dentro del ciclo (27 ago en adelante)
    const seed = {
      version: 8, categories: CATS, learned: {}, recurring: [], metas: [], diaCobro: 27,
      months: {
        "2026-08": { incomes: [{ id: "i1", label: "Nómina", amount: 2172.81, date: "2026-08-27" }], expenses: [] },
        "2026-09": {
          incomes: [],
          expenses: [
            { id: "e1", name: "Hipoteca", amount: 592.59, categoryId: "super", date: "2026-09-01", time: null, fixed: true },
            { id: "e2", name: "Café", amount: 6, categoryId: "comerfuera", date: "2026-09-01", time: "10:00" }, // variable, no fijo
          ],
        },
      },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Resumen")); });

    const cardTxt = document.querySelector(".cg-stats").parentElement.textContent;
    // variable = 6€ / 1 día transcurrido de ciclo (27 ago es el propio día 1 del ciclo, hoy 1 sept -> 6 días) = 1€/día
    // proyección correcta: 592,59 (fijo, tal cual) + (6/6)*31 (variable proyectado) = 592,59 + 31 = 623,59
    expect(cardTxt).toContain("592,59");
    expect(cardTxt).toContain("623,59");
    // la disparatada de antes (592,59+6=598,59 multiplicado por 31 días = 18.556 y pico) no debe aparecer
    expect(cardTxt).not.toMatch(/18\.\d{3}/);
    vi.useRealTimers();
  });

  it("Resumen y la previsión también usan el ciclo — reproduce el caso real: fijo el día 1, nómina el 27", async () => {
    vi.setSystemTime(new Date(2026, 8, 1)); // 1 de septiembre -> ciclo 27 ago - 26 sept (día cobro 27)
    const seed = {
      version: 8, categories: CATS, learned: {}, recurring: [], metas: [], diaCobro: 27,
      months: {
        "2026-08": {
          incomes: [{ id: "i1", label: "Nómina", amount: 2172.81, date: "2026-08-27" }],
          expenses: [],
        },
        "2026-09": {
          incomes: [],
          expenses: [{ id: "e1", name: "Hipoteca", amount: 1037.73, categoryId: "super", date: "2026-09-01", time: null, fixed: true }],
        },
      },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Resumen")); });

    const cardTxt = document.querySelector(".cg-stats").parentElement.textContent;
    // antes del arreglo: "0,00" recibido y "-1.037,73" en rojo — ahora debe contar la nómina del ciclo
    expect(cardTxt).toContain("2.172,81");
    expect(cardTxt).not.toContain("0,00  €"); // recibido ya no sale en 0
    expect(cardTxt).not.toContain("-1.037,73"); // Queda ya no sale negativo
    // la previsión disparatada del mes (algo del orden de 31.000 €) ya no debe aparecer
    expect(cardTxt).not.toMatch(/3[01]\.\d{3}/);
    vi.useRealTimers();
  });
});

describe("Mes efectivo (avanza al pasar el día de cobro)", () => {
  it("abre directamente en el mes efectivo (el siguiente) cuando hoy ya alcanzó el día de cobro", async () => {
    vi.setSystemTime(new Date(2026, 7, 27)); // 27 de agosto, día de cobro = 27 -> mes efectivo: septiembre
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [], diaCobro: 27,
      months: { "2026-08": { expenses: [], incomes: [] }, "2026-09": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(document.querySelector(".cg-month").textContent.toLowerCase()).toContain("septiembre");
  });

  it("sin día de cobro, sigue abriendo en el mes de calendario de siempre", async () => {
    vi.setSystemTime(new Date(2026, 7, 27));
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(document.querySelector(".cg-month").textContent.toLowerCase()).toContain("agosto");
  });

  it("al volver a primer plano detecta que ya tocaría el mes siguiente, sin recargar la app", async () => {
    vi.setSystemTime(new Date(2026, 7, 20)); // 20 de agosto, todavía no llega al día de cobro (27)
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [], diaCobro: 27,
      months: { "2026-08": { expenses: [], incomes: [] }, "2026-09": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(document.querySelector(".cg-month").textContent.toLowerCase()).toContain("agosto");

    // "pasa" el tiempo sin que la app se recargue: solo cambia el reloj y se simula
    // que la pantalla vuelve a primer plano (visibilitychange), como al desbloquear el móvil
    vi.setSystemTime(new Date(2026, 7, 27));
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });

    expect(document.querySelector(".cg-month").textContent.toLowerCase()).toContain("septiembre");
  });

  it("no interrumpe si la persona ya había navegado a mano a otro mes", async () => {
    vi.setSystemTime(new Date(2026, 7, 20));
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [], diaCobro: 27,
      months: { "2026-07": { expenses: [], incomes: [] }, "2026-08": { expenses: [], incomes: [] }, "2026-09": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });

    // navega a mano a julio (mes anterior), nada que ver con el mes efectivo
    await act(async () => { click(document.querySelector('button[aria-label="Mes anterior"]') || [...document.querySelectorAll(".cg-navbtn")].find((b) => b.textContent === "‹")); });
    expect(document.querySelector(".cg-month").textContent.toLowerCase()).toContain("julio");

    vi.setSystemTime(new Date(2026, 7, 27)); // ahora sí tocaría avanzar el mes efectivo a septiembre
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });

    // sigue en julio: no la interrumpió, porque ya había navegado a mano
    expect(document.querySelector(".cg-month").textContent.toLowerCase()).toContain("julio");
  });
});

describe("Bancos y forma de pago", () => {
  it("un array de bancos vacío (no inexistente) también se rellena con los 15 por defecto", async () => {
    // reproduce el fallo real: bancos: [] explícito, no undefined — antes se quedaba vacío para siempre.
    // Se comprueba a través del editor de un gasto, ya que Ajustes → Bancos se quitó a propósito
    // (si el banco no está en la lista, se añade ahí mismo, no hace falta gestionarlo aparte).
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [], bancos: [],
      months: { "2026-08": { expenses: [{ id: "e1", name: "Compra", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00" }], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Compra"))); });
    const sheetBancos = document.querySelector(".cg-sheet");
    await act(async () => { click([...sheetBancos.querySelectorAll("button")].find((b) => b.textContent.includes("Tarjeta"))); });
    expect(sheetBancos.textContent).toContain("Abanca"); // el primero alfabético, sí visible sin expandir
    expect(sheetBancos.textContent).toContain("Ver más (12)"); // 15 en total, 3 visibles de entrada
  });

  it("un banco añadido desde el buscador de un gasto queda disponible también en otros gastos", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [
          { id: "e1", name: "Compra", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00" },
          { id: "e2", name: "Otra compra", amount: 15, categoryId: "super", date: "2026-08-06", time: "10:00" },
        ], incomes: [],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });

    // se añade "Banco Ficticio" desde el primer gasto (no está en los 15 por defecto)
    await act(async () => { click([...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Compra") && !el.textContent.includes("Otra"))); });
    let sheet1 = document.querySelector(".cg-sheet");
    await act(async () => { click([...sheet1.querySelectorAll("button")].find((b) => b.textContent.includes("Tarjeta"))); });
    const buscador1 = sheet1.querySelector('input[aria-label="Buscar banco"]');
    await act(async () => { setVal(buscador1, "Banco Ficticio"); });
    await act(async () => { click([...sheet1.querySelectorAll("button")].find((b) => b.textContent.includes("Añadir «Banco Ficticio»"))); });
    await act(async () => { click([...sheet1.querySelectorAll("button")].find((b) => b.textContent === "Guardar cambios")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });

    // y ya aparece disponible al abrir el segundo gasto, sin tener que darlo de alta otra vez
    await act(async () => { click([...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Otra compra"))); });
    const sheet2 = document.querySelector(".cg-sheet");
    await act(async () => { click([...sheet2.querySelectorAll("button")].find((b) => b.textContent.includes("Tarjeta"))); });
    const buscador2 = sheet2.querySelector('input[aria-label="Buscar banco"]');
    await act(async () => { setVal(buscador2, "Banco Ficticio"); });
    expect(sheet2.textContent).toContain("Banco Ficticio");
    expect(sheet2.textContent).not.toContain("Añadir «Banco Ficticio»"); // ya existe, no ofrece crearlo de nuevo
  });

  it("marcar un gasto como efectivo o banco no cambia el total gastado ni el disponible", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [], bancos: [{ id: "b1", name: "Banco Ficticio" }],
      months: { "2026-08": {
        expenses: [{ id: "e1", name: "Compra", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00" }],
        incomes: [{ id: "i1", label: "Nómina", amount: 500, date: "2026-08-01" }],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    const disponibleAntes = document.querySelector(".cg-big").textContent;

    await act(async () => { click([...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Compra"))); });
    const sheet2 = document.querySelector(".cg-sheet");
    await act(async () => { click([...sheet2.querySelectorAll("button")].find((b) => b.textContent.includes("Tarjeta"))); });
    await act(async () => { click([...sheet2.querySelectorAll("button")].find((b) => b.textContent === "Banco Ficticio")); });
    await act(async () => { click([...sheet2.querySelectorAll("button")].find((b) => b.textContent === "Guardar cambios")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });

    expect(document.querySelector(".cg-big").textContent).toBe(disponibleAntes); // el disponible no se mueve ni un céntimo
  });

  it("Resumen desglosa el gasto por forma de pago, con 'Sin especificar' para lo no marcado", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [], bancos: [{ id: "b1", name: "CaixaBank" }],
      months: { "2026-08": {
        expenses: [
          { id: "e1", name: "Compra 1", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00", formaPago: "efectivo" },
          { id: "e2", name: "Compra 2", amount: 30, categoryId: "super", date: "2026-08-05", time: "10:00", formaPago: "banco", bancoId: "b1" },
          { id: "e3", name: "Compra 3", amount: 15, categoryId: "super", date: "2026-08-05", time: "10:00" }, // sin marcar
        ],
        incomes: [],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Resumen")); });

    const cardPago = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Gasto por forma de pago"));
    expect(cardPago.textContent).toContain("Efectivo");
    expect(cardPago.textContent).toContain("20,00");
    expect(cardPago.textContent).toContain("CaixaBank");
    expect(cardPago.textContent).toContain("30,00");
    expect(cardPago.textContent).toContain("Sin especificar");
    expect(cardPago.textContent).toContain("15,00");
  });

  it("el buscador de banco deja añadir uno nuevo si no hay ningún resultado, sin salir de donde estás", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [], bancos: [{ id: "b1", name: "CaixaBank" }],
      months: { "2026-08": { expenses: [{ id: "e1", name: "Compra", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00" }], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Compra"))); });
    const sheet3 = document.querySelector(".cg-sheet");
    await act(async () => { click([...sheet3.querySelectorAll("button")].find((b) => b.textContent.includes("Tarjeta"))); });

    const buscador = sheet3.querySelector('input[aria-label="Buscar banco"]');
    await act(async () => { setVal(buscador, "Triodos Bank"); });
    expect(sheet3.textContent).toContain("Añadir «Triodos Bank»");
    await act(async () => { click([...sheet3.querySelectorAll("button")].find((b) => b.textContent.includes("Añadir «Triodos Bank»"))); });

    // se creó y se seleccionó en el mismo paso, sin salir del editor del gasto
    expect(sheet3.textContent).toContain("Triodos Bank");
    await act(async () => { click([...sheet3.querySelectorAll("button")].find((b) => b.textContent === "Guardar cambios")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    // el banco quedó guardado — se confirma en el propio test de arriba
    // ("un banco añadido... queda disponible también en otros gastos")
  });

  it("el formulario rápido de Nuevo gasto SÍ pide forma de pago, con el valor por defecto ya puesto", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [], bancos: [{ id: "b1", name: "CaixaBank" }],
      formaPagoDefecto: "banco", bancoDefectoId: "b1",
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    expect(addCard.textContent).toContain("Forma de pago");
    // ya viene con el banco fijado en Ajustes, sin tener que tocar nada
    expect(addCard.textContent).toContain("CaixaBank");

    // añadir el gasto sin tocar la forma de pago: se guarda con el valor por defecto
    await act(async () => { setVal(document.getElementById("cg-name"), "Compra rápida"); });
    await act(async () => { setVal(document.getElementById("cg-amt"), "12"); });
    await act(async () => { click([...addCard.querySelectorAll(".cg-chip")].find((c) => c.textContent.includes("Supermercado"))); });
    await act(async () => { click([...addCard.querySelectorAll("button")].find((b) => b.textContent === "Añadir gasto")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });

    await act(async () => { click([...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Compra rápida"))); });
    expect(txt()).toContain("CaixaBank"); // se guardó ya con el banco por defecto, sin tocar nada
  });

  it("con forma de pago explícita en Ajustes, el formulario rápido la muestra colapsada con 'Ver más'", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [], bancos: [{ id: "b1", name: "CaixaBank" }],
      formaPagoDefecto: "banco", bancoDefectoId: "b1",
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    // colapsado: no se ve el selector completo (Efectivo/Bizum/Domiciliado), solo el resumen + Ver más
    expect(addCard.textContent).not.toContain("Efectivo");
    expect(addCard.textContent).toContain("CaixaBank");
    const btnVerMas = [...addCard.querySelectorAll("button")].find((b) => b.textContent === "Ver más");
    expect(btnVerMas).not.toBeUndefined();

    await act(async () => { click(btnVerMas); });
    expect(addCard.textContent).toContain("Efectivo"); // ahora sí, desplegado
  });

  it("sin forma de pago explícita en Ajustes (solo la más usada), el selector sale siempre desplegado", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [
        { id: "e1", name: "Compra", amount: 20, categoryId: "super", date: "2026-08-01", time: "10:00", formaPago: "efectivo" },
      ], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    expect(addCard.textContent).toContain("Efectivo");
    expect(addCard.textContent).toContain("Bizum/Transferencia"); // el selector completo, no colapsado
    expect([...addCard.querySelectorAll("button")].some((b) => b.textContent === "Ver más")).toBe(false);
  });

  it("sin nada fijado en Ajustes ni historial, el formulario rápido no marca nada por defecto", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [], bancos: [{ id: "b1", name: "CaixaBank" }],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    // sin nada por defecto, ningún botón debe llevar el icono de check de seleccionado
    expect(addCard.querySelector(".ti-check")).toBeNull();
  });

  it("Bizum es una tercera forma de pago, plana, sin pedir banco", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [
          { id: "e1", name: "Compra 1", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00", formaPago: "bizum" },
        ], incomes: [],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });

    // en Nuevo gasto: elegir Bizum no abre ningún buscador de banco
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    await act(async () => { click([...addCard.querySelectorAll("button")].find((b) => b.textContent.includes("Bizum"))); });
    expect(addCard.querySelector('input[aria-label="Buscar banco"]')).toBeNull();

    // en Resumen, el gasto ya anotado con Bizum sale en su propia fila
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Resumen")); });
    const cardPago = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Gasto por forma de pago"));
    expect(cardPago.textContent).toContain("Bizum");
    expect(cardPago.textContent).toContain("20,00");
  });

  it("Domiciliado sí pide banco, y en Resumen queda distinguido de Tarjeta aunque sea el mismo banco", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [], bancos: [{ id: "b1", name: "CaixaBank" }],
      months: { "2026-08": {
        expenses: [
          { id: "e1", name: "Hipoteca", amount: 600, categoryId: "super", date: "2026-08-01", time: null, formaPago: "domiciliado", bancoId: "b1" },
          { id: "e2", name: "Compra con tarjeta", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00", formaPago: "banco", bancoId: "b1" },
        ], incomes: [],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });

    // en Nuevo gasto: elegir Domiciliado sí abre el buscador de banco, igual que Tarjeta
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    await act(async () => { click([...addCard.querySelectorAll("button")].find((b) => b.textContent.includes("Domiciliado"))); });
    await act(async () => { click([...addCard.querySelectorAll("button")].find((b) => b.textContent === "cambiar")); });
    expect(addCard.querySelector('input[aria-label="Buscar banco"]')).not.toBeNull();

    // en Resumen, el mismo banco aparece dos veces: una como tarjeta, otra como domiciliado, sin mezclarse
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Resumen")); });
    const cardPago = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Gasto por forma de pago"));
    expect(cardPago.textContent).toContain("600,00");
    expect(cardPago.textContent).toContain("20,00");
    expect(cardPago.textContent).toContain("domiciliado");
  });
});

describe("Compartir esta app", () => {
  it("el mensaje incluye la frase nueva y el enlace UNA sola vez, dentro del propio texto", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    let compartido = null;
    Object.defineProperty(navigator, "share", {
      value: (opts) => { compartido = opts; return Promise.resolve(); },
      configurable: true,
    });
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Ayuda y app"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Compartir esta app")); });

    expect(compartido).toBeTruthy();
    expect(compartido.text).toContain("¿Quieres tener tus gastos al día?");
    expect(compartido.text).toContain(APP_NAME);
    expect(compartido.text).toContain(window.location.origin); // el enlace va dentro del propio texto
    expect(compartido.text.split(window.location.origin).length - 1).toBe(1); // y solo una vez
    expect(compartido.url).toBeUndefined(); // sin "url" aparte: iOS pegaba los dos y salía duplicado
    delete navigator.share;
  });

  it("en Android, sin el enlace de Play Store configurado todavía, comparte el enlace normal de la web", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      configurable: true,
    });
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    let copiado = null;
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: (t) => { copiado = t; return Promise.resolve(); } },
      configurable: true,
    });
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Ayuda y app"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Compartir esta app")); });

    expect(copiado).toContain(window.location.origin); // todavía no hay Play Store real, cae al enlace de la web
    expect(copiado).not.toContain("play.google.com");
  });

  it("en iPhone, comparte siempre el enlace normal de la web, nunca el de Play Store", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
      configurable: true,
    });
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    let copiado = null;
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: (t) => { copiado = t; return Promise.resolve(); } },
      configurable: true,
    });
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Ayuda y app"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Compartir esta app")); });

    expect(copiado).toContain(window.location.origin);
    expect(copiado).not.toContain("play.google.com");
  });


  it("sin navigator.share, copia al portapapeles el mensaje completo, no solo la URL suelta", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    let copiado = null;
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: (t) => { copiado = t; return Promise.resolve(); } },
      configurable: true,
    });
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Ayuda y app"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Compartir esta app")); });

    expect(copiado).toContain("¿Quieres tener tus gastos al día?");
    expect(copiado).toContain(window.location.origin);
  });
});

describe("Te has pasado vs Ajustado a la baja", () => {
  it("sigue diciendo 'Te has pasado' cuando el negativo es gasto real, sin ajuste", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [{ id: "e1", name: "Gasto grande", amount: 2000, categoryId: "super", date: "2026-08-05", time: "10:00" }],
        incomes: [{ id: "i1", label: "Nómina", amount: 500, date: "2026-08-01" }],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(txt()).toContain("Te has pasado");
    expect(txt()).not.toContain("Ajustado a la baja");
  });

  it("dice 'Ajustado a la baja' cuando sin gasto real iba positivo, y el ajuste lo pone en negativo", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [{ id: "e1", name: "Gasto normal", amount: 100, categoryId: "super", date: "2026-08-05", time: "10:00" }],
        incomes: [{ id: "i1", label: "Nómina", amount: 150, date: "2026-08-01" }],
        ajuste: { valor: -100, nota: "Efectivo sin anotar" },
      } } };
    // sin ajuste: 150-100=50 (positivo). Con ajuste: 50-100=-50 (negativo) -> por el ajuste, no por gasto real
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(txt()).toContain("Ajustado a la baja");
    expect(txt()).not.toContain("Te has pasado");
  });

  it("si ya iba negativo de por sí y ADEMÁS hay un ajuste negativo, sigue siendo 'Te has pasado'", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [{ id: "e1", name: "Gasto grande", amount: 2000, categoryId: "super", date: "2026-08-05", time: "10:00" }],
        incomes: [{ id: "i1", label: "Nómina", amount: 500, date: "2026-08-01" }],
        ajuste: { valor: -50, nota: null },
      } } };
    // sin ajuste ya era negativo (500-2000=-1500): el ajuste no es la causa, sigue siendo gasto real
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(txt()).toContain("Te has pasado");
    expect(txt()).not.toContain("Ajustado a la baja");
  });
});

describe("Bizum/Transferencia y Sin especificar", () => {
  it("la etiqueta ahora dice Bizum/Transferencia, el valor interno sigue siendo 'bizum'", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    const addCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Nuevo gasto"));
    expect(addCard.textContent).toContain("Bizum/Transferencia");
  });

  it("Sin especificar es clicable: abre la lista, se puede marcar forma de pago, y desaparece de la lista", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [], bancos: [{ id: "b1", name: "CaixaBank" }],
      months: { "2026-08": {
        expenses: [{ id: "e1", name: "Compra sin marcar", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00" }],
        incomes: [],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Resumen")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Sin especificar"))); });

    const sheet = document.querySelector(".cg-sheet");
    expect(sheet.textContent).toContain("Compra sin marcar");
    await act(async () => { click([...sheet.querySelectorAll("button")].find((b) => b.textContent.includes("Compra sin marcar"))); });
    await act(async () => { click([...sheet.querySelectorAll("button")].find((b) => b.textContent === "Efectivo")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    expect(sheet.textContent).not.toContain("Compra sin marcar"); // ya desapareció de la lista
  });
});

describe("Movimientos: selección múltiple (editar/borrar en bloque)", () => {
  it("el botón Editar entra en modo selección, con círculos y Cancelar/contador fijos", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [{ id: "e1", name: "Compra", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00" }],
        incomes: [],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Editar")); });

    expect(txt()).toContain("Cancelar");
    expect(txt()).toContain("Elige apuntes"); // nada seleccionado todavía
    // sin nada seleccionado, no debe verse la barra de Borrar/Editar campos
    expect(txt()).not.toContain("Editar campos");
  });

  it("seleccionar un apunte muestra la barra de Borrar/Editar campos, y Cancelar vuelve a la normalidad", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [{ id: "e1", name: "Compra", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00" }],
        incomes: [],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Editar")); });
    await act(async () => { click([...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Compra"))); });

    expect(txt()).toContain("1 seleccionado");
    expect(txt()).toContain("Editar campos");
    expect(txt()).toContain("Borrar");

    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Cancelar")); });
    expect(txt()).not.toContain("Cancelar");
    expect(txt()).not.toContain("Editar campos");
  });

  it("tocar un apunte ya seleccionado lo deselecciona, sin abrir su editor", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [{ id: "e1", name: "Compra", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00" }],
        incomes: [],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Editar")); });
    const fila = [...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Compra"));
    await act(async () => { click(fila); });
    expect(txt()).toContain("1 seleccionado");
    await act(async () => { click(fila); });
    expect(txt()).toContain("Elige apuntes"); // vuelve a 0, no abrió el editor del gasto
    expect(document.querySelector(".cg-sheet")).toBeNull();
  });

  it("Borrar quita de verdad los apuntes seleccionados", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [
          { id: "e1", name: "Compra 1", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00" },
          { id: "e2", name: "Compra 2", amount: 15, categoryId: "super", date: "2026-08-05", time: "11:00" },
        ],
        incomes: [],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Editar")); });
    await act(async () => { click([...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Compra 1"))); });

    const confirmOriginal = window.confirm;
    window.confirm = () => true;
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Borrar")); });
    window.confirm = confirmOriginal;
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    expect(txt()).not.toContain("Compra 1");
    expect(txt()).toContain("Compra 2"); // el que no se seleccionó, sigue ahí
    expect(txt()).not.toContain("Cancelar"); // el modo se cierra solo tras borrar
  });

  it("Editar campos → Categoría aplica a todos los seleccionados a la vez", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [
          { id: "e1", name: "Compra 1", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00" },
          { id: "e2", name: "Compra 2", amount: 15, categoryId: "super", date: "2026-08-05", time: "11:00" },
        ],
        incomes: [],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Editar")); });
    await act(async () => { click([...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Compra 1"))); });
    await act(async () => { click([...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Compra 2"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Editar campos")); });

    const sheet = document.querySelector(".cg-sheet");
    await act(async () => { click([...sheet.querySelectorAll("button")].find((b) => b.textContent.includes("Categoría"))); });
    await act(async () => { click([...sheet.querySelectorAll(".cg-chip")].find((c) => c.textContent.includes("Ocio"))); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    // los dos gastos ahora deben estar bajo Ocio, no Supermercado
    const filas = [...document.querySelectorAll(".cg-item")].filter((el) => el.textContent.includes("Compra"));
    expect(filas.every((f) => f.textContent.includes("Ocio"))).toBe(true);
  });

  it("Editar campos → Fecha muda el apunte de mes si la fecha nueva cae en otro mes", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [{ id: "e1", name: "Compra", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00" }],
        incomes: [],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Editar")); });
    await act(async () => { click([...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Compra"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Editar campos")); });

    const sheet = document.querySelector(".cg-sheet");
    await act(async () => { click([...sheet.querySelectorAll("button")].find((b) => b.textContent.includes("Fecha"))); });
    await act(async () => { setVal(sheet.querySelector("#cg-bulk-valor"), "2026-09-10"); });
    await act(async () => { click([...sheet.querySelectorAll("button")].find((b) => b.textContent === "Aplicar a los seleccionados")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    // ya no está en agosto…
    expect(txt()).not.toContain("Compra");
    // …y sí está en septiembre
    await act(async () => { click([...document.querySelectorAll(".cg-navbtn")].find((b) => b.textContent === "›")); });
    expect(txt()).toContain("Compra");
  });

  it("en Ingresos, seleccionar y Cambiar fecha va directo al selector, sin menú intermedio", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [],
        incomes: [{ id: "i1", label: "Nómina", amount: 500, date: "2026-08-01" }],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ingresos")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Editar")); });
    await act(async () => { click([...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Nómina"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Cambiar fecha")); });

    const sheet = document.querySelector(".cg-sheet");
    expect(sheet.textContent).not.toContain("Categoría");
    expect(sheet.textContent).not.toContain("Forma de pago");
    expect(sheet.querySelector("#cg-bulk-valor")).not.toBeNull(); // el selector de fecha, directo
  });
});

describe("Fijos: selección múltiple y separación por tipo", () => {
  it("selecciona varios fijos de gasto, cambia la categoría en bloque y borra en bloque", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, metas: [],
      recurring: [
        { id: "f1", kind: "gasto", name: "Netflix", categoryId: "super", amount: 15, day: 1, every: 1, auto: true },
        { id: "f2", kind: "gasto", name: "Spotify", categoryId: "super", amount: 10, day: 1, every: 1, auto: true },
      ],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-toggle button")].find((b) => b.textContent === "Fijos")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Editar")); });
    await act(async () => { click([...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Netflix"))); });
    await act(async () => { click([...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Spotify"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Editar campos")); });

    const sheet = document.querySelector(".cg-sheet");
    await act(async () => { click([...sheet.querySelectorAll("button")].find((b) => b.textContent.includes("Categoría"))); });
    await act(async () => { click([...sheet.querySelectorAll(".cg-chip")].find((c) => c.textContent.includes("Ocio"))); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    const filas = [...document.querySelectorAll(".cg-item")].filter((el) => el.textContent.includes("Netflix") || el.textContent.includes("Spotify"));
    expect(filas.every((f) => f.textContent.includes("Ocio"))).toBe(true);

    // ahora borrar en bloque, sin tener que re-seleccionar (la selección se mantiene tras aplicar)
    const confirmOriginal = window.confirm;
    window.confirm = () => true;
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Borrar")); });
    window.confirm = confirmOriginal;
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(txt()).not.toContain("Netflix");
    expect(txt()).not.toContain("Spotify");
  });

  it("Ingresos tiene su propia alternancia Fijos, mostrando solo reglas de tipo ingreso", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, metas: [],
      recurring: [
        { id: "f1", kind: "gasto", name: "Alquiler", categoryId: "super", amount: 700, day: 1, every: 1, auto: true },
        { id: "f2", kind: "ingreso", name: "Nómina", amount: 2000, day: 27, every: 1, auto: true },
      ],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ingresos")); });
    await act(async () => { click([...document.querySelectorAll(".cg-toggle button")].find((b) => b.textContent === "Fijos")); });
    expect(txt()).toContain("Ingresos fijos");
    expect(txt()).toContain("Nómina");
    expect(txt()).not.toContain("Alquiler");
  });

  it("un fijo nuevo creado desde Ingresos → Fijos empieza ya marcado como ingreso", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ingresos")); });
    await act(async () => { click([...document.querySelectorAll(".cg-toggle button")].find((b) => b.textContent === "Fijos")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "+ Nuevo")); });
    const sheet = document.querySelector(".cg-sheet");
    expect([...sheet.querySelectorAll(".cg-toggle button")].find((b) => b.textContent === "Ingreso").className).toContain("on");
  });
});

describe("Dónde se recibió un ingreso", () => {
  it("el formulario rápido de ingresos permite elegir Efectivo o Cuenta bancaria", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [], bancos: [{ id: "b1", name: "CaixaBank" }],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ingresos")); });
    const card = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Recibido este mes"));
    await act(async () => { click([...card.querySelectorAll("button")].find((b) => b.textContent === "Cuenta bancaria")); });
    expect(card.querySelector('input[aria-label="Buscar banco"]')).not.toBeNull();

    await act(async () => { setVal(card.querySelector("#cg-ilab"), "Nómina"); });
    await act(async () => { setVal(card.querySelector("#cg-iamt"), "2000"); });
    await act(async () => { click([...card.querySelectorAll("button")].find((b) => b.textContent.includes("CaixaBank"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Añadir ingreso")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    expect(txt()).toContain("Nómina");
  });
});

describe("Gastos/Ingresos separados, Fijos como alternancia", () => {
  it("la pestaña Gastos solo muestra gastos en Movimientos, nunca ingresos", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [{ id: "e1", name: "Compra", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00" }],
        incomes: [{ id: "i1", label: "Nómina", amount: 500, date: "2026-08-01" }],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(txt()).toContain("Compra");
    expect(txt()).not.toContain("Nómina");
    expect(txt()).not.toContain("Recibido este mes"); // esa tarjeta ya no vive aquí
  });

  it("la pestaña Ingresos tiene su propia tarjeta de añadir y su propio Movimientos, solo con ingresos", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [{ id: "e1", name: "Compra", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00" }],
        incomes: [{ id: "i1", label: "Nómina", amount: 500, date: "2026-08-01" }],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ingresos")); });
    expect(txt()).toContain("Nómina");
    expect(txt()).not.toContain("Compra");
    expect(txt()).toContain("Recibido este mes");
  });

  it("dentro de Gastos, el toggle Fijos sustituye Movimientos por la lista de reglas, y viceversa", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [
      { id: "f1", kind: "gasto", name: "Alquiler", categoryId: "super", amount: 700, day: 1, every: 1, auto: true },
    ], metas: [],
      months: { "2026-08": { expenses: [{ id: "e1", name: "Compra", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00" }], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(txt()).toContain("Compra");
    expect(txt()).not.toContain("Gastos fijos");

    await act(async () => { click([...document.querySelectorAll(".cg-toggle button")].find((b) => b.textContent === "Fijos")); });
    expect(txt()).toContain("Gastos fijos");
    expect(txt()).toContain("Alquiler");

    await act(async () => { click([...document.querySelectorAll(".cg-toggle button")].find((b) => b.textContent === "Movimientos")); });
    expect(txt()).toContain("Compra");
    expect(txt()).not.toContain("Gastos fijos");
  });

  it("la selección múltiple de Gastos y la de Ingresos son independientes entre sí", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [{ id: "e1", name: "Compra", amount: 20, categoryId: "super", date: "2026-08-05", time: "10:00" }],
        incomes: [{ id: "i1", label: "Nómina", amount: 500, date: "2026-08-01" }],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Editar")); });
    await act(async () => { click([...document.querySelectorAll(".cg-item")].find((el) => el.textContent.includes("Compra"))); });
    expect(txt()).toContain("1 seleccionado");

    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ingresos")); });
    expect(txt()).not.toContain("1 seleccionado"); // el modo de Gastos no se filtra a Ingresos
    expect(txt()).not.toContain("Cancelar"); // Ingresos no está en modo editar
  });
});

describe("Movimientos: no parte un mismo día en dos, ingresos visibles", () => {
  it("un día con muchos apuntes no se divide en dos bloques con el encabezado repetido", async () => {
    vi.setSystemTime(new Date(2026, 8, 1)); // los datos están sembrados en septiembre
    const seed = {
      version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-09": {
        incomes: [{ id: "i1", label: "Bizum Papá", amount: 100, date: "2026-09-01" }],
        expenses: [
          { id: "e1", name: "Hipoteca", amount: 592.59, categoryId: "super", date: "2026-09-01", time: null, fixed: true },
          { id: "e2", name: "Mugendo", amount: 50, categoryId: "super", date: "2026-09-01", time: null, fixed: true },
          { id: "e3", name: "Securitas", amount: 57.98, categoryId: "super", date: "2026-09-01", time: null, fixed: true },
          { id: "e4", name: "Parking", amount: 110, categoryId: "super", date: "2026-09-01", time: null, fixed: true },
          { id: "e5", name: "Glovo Prime", amount: 7.99, categoryId: "super", date: "2026-09-01", time: null, fixed: true },
        ],
      } },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Gastos")); });

    const movCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Movimientos"));
    // el día entra entero de una vez: los 5 gastos del mismo día, sin partir
    expect(movCard.querySelectorAll(".cg-item").length).toBe(5);
    // el encabezado del día no debe repetirse
    const encabezados = [...movCard.querySelectorAll(".cg-day")].filter((d) => d.textContent.includes("sept") || d.textContent.includes("1"));
    expect(encabezados.length).toBe(1);
    // como el día ya trae todo, no debería haber botón de "ver más" (no queda nada más que mostrar)
    expect([...movCard.querySelectorAll(".cg-vermas")].some((b) => b.textContent.startsWith("Ver más"))).toBe(false);

    // el ingreso, aparte, está visible en su propia pestaña
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ingresos")); });
    expect(txt()).toContain("Bizum Papá");
    vi.useRealTimers();
  });

  it("con varios días, si el resto sí cabe fuera del primer bloque, el 'ver más' funciona sin duplicar encabezados", async () => {
    vi.setSystemTime(new Date(2026, 8, 1));
    const seed = {
      version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-09": {
        incomes: [],
        expenses: [
          { id: "e1", name: "Café", amount: 2, categoryId: "super", date: "2026-09-01", time: "10:00" },
          { id: "e2", name: "Comida", amount: 10, categoryId: "super", date: "2026-09-02", time: "10:00" },
          { id: "e3", name: "Cena", amount: 15, categoryId: "super", date: "2026-09-03", time: "10:00" },
          { id: "e4", name: "Cine", amount: 8, categoryId: "ocio", date: "2026-09-04", time: "10:00" },
        ],
      } },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Gastos")); });
    const movCard = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Movimientos"));
    expect(movCard.querySelectorAll(".cg-item").length).toBe(3); // 3 días, 1 apunte cada uno
    const btnVerMas = [...movCard.querySelectorAll(".cg-vermas")].find((b) => b.textContent.startsWith("Ver más"));
    expect(btnVerMas.textContent).toContain("(1)"); // solo queda 1 apunte de verdad, no una cuenta desajustada
    await act(async () => { click(btnVerMas); });
    expect(movCard.querySelectorAll(".cg-item").length).toBe(4);
    expect(movCard.textContent).toContain("Cine");
    vi.useRealTimers();
  });
});

describe("Hero: Disponible vs Gastado", () => {
  it("por defecto (sin heroModo guardado) sigue mostrando Disponible, como siempre", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": {
        expenses: [{ id: "e1", name: "Compra", amount: 100, categoryId: "super", date: "2026-08-05", time: "10:00" }],
        incomes: [{ id: "i1", label: "Nómina", amount: 500, date: "2026-08-01" }],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(txt()).toContain("Disponible");
    expect(document.querySelector(".cg-big").textContent.replace(/\s/g, "")).toContain("400"); // 500-100
  });

  it("en modo Gastado, el número grande es el gasto, no el disponible", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [], heroModo: "gastado",
      months: { "2026-08": {
        expenses: [{ id: "e1", name: "Compra", amount: 100, categoryId: "super", date: "2026-08-05", time: "10:00" }],
        incomes: [{ id: "i1", label: "Nómina", amount: 500, date: "2026-08-01" }],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(txt()).toContain("Gastado este mes");
    expect(document.querySelector(".cg-big").textContent.replace(/\s/g, "")).toContain("100"); // el gasto, no los 400 disponibles
  });

  it("en modo Gastado, si te pasas de gasto, el hero se pinta en salmón igual que en modo Disponible", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [], heroModo: "gastado",
      months: { "2026-08": {
        expenses: [{ id: "e1", name: "Compra grande", amount: 2000, categoryId: "super", date: "2026-08-05", time: "10:00" }],
        incomes: [{ id: "i1", label: "Nómina", amount: 500, date: "2026-08-01" }],
      } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    expect(document.querySelector(".cg-hero").className).toContain("over");
    expect(txt()).toContain("Te has pasado");
  });

  it("en iPhone, 'Cómo instalar' muestra solo las instrucciones de iPhone", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
      configurable: true,
    });
    await montar(null, {}); // sin datos previos: usuario nuevo de verdad, entra en el instalador
    expect(txt()).toContain("Cómo instalar");
    expect(txt()).toContain("iPhone");
    expect(txt()).not.toContain("Android");
  });

  it("en Android, 'Cómo instalar' muestra solo las instrucciones de Android", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      configurable: true,
    });
    await montar(null, {});
    expect(txt()).toContain("Cómo instalar");
    expect(txt()).toContain("Android");
    expect(txt()).not.toContain("iPhone");
  });


  it("se puede cambiar desde Ajustes → Cómo se ve la app", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [{ id: "i1", label: "Nómina", amount: 500, date: "2026-08-01" }] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Cómo se ve la app"))); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Gastado")); });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Gastos")); });
    expect(txt()).toContain("Gastado este mes");
  });
});

describe("Ajustes: acordeón de grupos", () => {
  it("solo un grupo está abierto a la vez", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });

    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Dinero"))); });
    expect(txt()).toContain("Forma de pago por defecto");
    expect(txt()).not.toContain("Copia de seguridad"); // Datos y privacidad, cerrado

    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Datos y privacidad"))); });
    expect(txt()).toContain("Copia de seguridad");
    expect(txt()).not.toContain("Forma de pago por defecto"); // Dinero se cerró solo al abrir el otro
  });

  it("tocar el grupo ya abierto lo cierra", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Dinero"))); });
    expect(txt()).toContain("Forma de pago por defecto");
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Dinero"))); });
    expect(txt()).not.toContain("Forma de pago por defecto");
  });
});

describe("Color del hero: sigue al ciclo, no al mes de calendario", () => {
  it("con ciclo positivo, no se pinta en salmón aunque el mes de calendario a solas fuera negativo", async () => {
    vi.setSystemTime(new Date(2026, 8, 1)); // 1 sept, ciclo 27 ago - 26 sept (día cobro 27)
    const seed = {
      version: 8, categories: CATS, learned: {}, recurring: [], metas: [], diaCobro: 27,
      months: {
        "2026-08": { incomes: [{ id: "i1", label: "Nómina", amount: 2172.81, date: "2026-08-27" }], expenses: [] },
        // en septiembre a solas (sin la nómina, que está en agosto) hay más gasto que ingreso -> "left" de calendario sería negativo
        "2026-09": { incomes: [], expenses: [{ id: "e1", name: "Hipoteca", amount: 592.59, categoryId: "super", date: "2026-09-01", time: null, fixed: true }] },
      },
    };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    // el ciclo da positivo (2172.81-592.59=1580.22), así que el hero NO debe llevar la clase 'over'
    expect(document.querySelector(".cg-hero").className).not.toContain("over");
    expect(txt()).toContain("Disponible");
    expect(txt()).not.toContain("Te has pasado");
    vi.useRealTimers();
  });
});

describe("Fecha en Recibido este mes", () => {
  it("deja cambiar la fecha del ingreso, igual que ya se puede en gastos", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ingresos")); });
    expect(txt()).toContain("Hoy · cambiar fecha");

    const cardIngreso = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Recibido este mes"));
    await act(async () => { click([...cardIngreso.querySelectorAll("button")].find((b) => b.textContent === "Hoy · cambiar fecha")); });
    const inputFecha = document.getElementById("cg-idate");
    expect(inputFecha).toBeTruthy();
    await act(async () => { setVal(inputFecha, "2026-08-15"); });
    await act(async () => { setVal(document.getElementById("cg-ilab"), "Venta"); });
    await act(async () => { setVal(document.getElementById("cg-iamt"), "50"); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Añadir ingreso")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });

    // el ingreso quedó con la fecha elegida, no con la de hoy
    expect(txt()).toContain("Venta");
  });
});

describe("Buscar actualizaciones", () => {
  it("el botón manual llama a reg.update() y recarga la página", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    let updateLlamado = false;
    Object.defineProperty(navigator, "serviceWorker", {
      value: { getRegistration: () => Promise.resolve({ update: () => { updateLlamado = true; return Promise.resolve(); } }) },
      configurable: true,
    });
    const locationOriginal = window.location;
    let reloadLlamado = false;
    Object.defineProperty(window, "location", { value: { ...locationOriginal, reload: () => { reloadLlamado = true; } }, configurable: true });

    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Ayuda y app"))); });
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent === "Buscar actualizaciones");
    expect(btn).toBeTruthy();
    await act(async () => { click(btn); await new Promise((r) => setTimeout(r, 50)); });

    expect(updateLlamado).toBe(true);
    expect(reloadLlamado).toBe(true);
    Object.defineProperty(window, "location", { value: locationOriginal, configurable: true });
    delete navigator.serviceWorker;
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

describe("Preguntas de inicio: opciones que avanzan al tocarlas, flecha de atrás y Saltar", () => {
  const btn = (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t);
  const hastaVista = async () => {
    await montar(null, {});
    await act(async () => { click(btn("Entendido, empezar")); });
    await act(async () => { setVal(document.getElementById("cg-onboard-email"), "test@test.com"); });
    await act(async () => { click(document.getElementById("cg-onboard-accept")); });
    await act(async () => { click(btn("Empezar")); });
  };

  it("en las preguntas de un toque no hay botón Continuar, y tocar una opción pasa a la siguiente", async () => {
    await hastaVista();
    expect(txt()).toContain("Paso 3 de 6");
    expect(btn("Continuar")).toBeUndefined();
    await act(async () => { click(btn("Gasto")); });
    expect(txt()).toContain("Paso 4 de 6");
    expect(btn("Continuar")).toBeUndefined();
  });

  it("la flecha de atrás vuelve a la pregunta anterior y enseña marcada la opción que se había elegido", async () => {
    await hastaVista();
    await act(async () => { click(btn("Disponible")); });
    expect(txt()).toContain("Paso 4 de 6");
    await act(async () => { click(document.querySelector(".cg-onboard-back")); });
    expect(txt()).toContain("Paso 3 de 6");
    expect(btn("Disponible").classList.contains("on")).toBe(true);
    expect(btn("Gasto").classList.contains("on")).toBe(false);
    // y desde el paso 3, atrás vuelve a la pantalla del email sin perder lo escrito
    await act(async () => { click(document.querySelector(".cg-onboard-back")); });
    expect(document.getElementById("cg-onboard-email").value).toBe("test@test.com");
    expect(document.getElementById("cg-onboard-accept").checked).toBe(true);
  });

  it("desde el paso 6, atrás vuelve al 4 si se contestó No (el 5 se saltó entero), y al 5 si se contestó Sí", async () => {
    await hastaVista();
    await act(async () => { click(btn("Gasto")); });
    await act(async () => { click(btn("No")); });
    expect(txt()).toContain("Paso 6 de 6");
    await act(async () => { click(document.querySelector(".cg-onboard-back")); });
    expect(txt()).toContain("Paso 4 de 6");
    await act(async () => { click(btn("Sí")); });
    await act(async () => { click(btn("Casi siempre en efectivo")); });
    expect(txt()).toContain("Paso 6 de 6");
    await act(async () => { click(document.querySelector(".cg-onboard-back")); });
    expect(txt()).toContain("Paso 5 de 6");
    expect(btn("Casi siempre en efectivo").classList.contains("on")).toBe(true);
  });

  it("en el paso 5, solo 'con tarjeta' enseña Continuar (hay que poder elegir banco antes de seguir)", async () => {
    await hastaVista();
    await act(async () => { click(btn("Gasto")); });
    await act(async () => { click(btn("Sí")); });
    expect(btn("Continuar")).toBeUndefined();
    await act(async () => { click(btn("Casi siempre con tarjeta")); });
    expect(txt()).toContain("Paso 5 de 6"); // no avanza sola
    expect(txt()).toContain("Elige tu banco");
    await act(async () => { click(btn("Continuar")); });
    expect(txt()).toContain("Paso 6 de 6");
  });

  it("'Saltar por ahora' es un enlace propio (el que va subrayado) y pasa de pregunta sin guardar respuesta", async () => {
    await hastaVista();
    const saltar = btn("Saltar por ahora");
    expect(saltar.className).toContain("cg-onboard-skiplink");
    await act(async () => { click(saltar); });
    expect(txt()).toContain("Paso 4 de 6");
    await act(async () => { click(document.querySelector(".cg-onboard-back")); });
    expect(btn("Gasto").classList.contains("on")).toBe(false);
    expect(btn("Disponible").classList.contains("on")).toBe(false);
  });

  it("lo elegido con un toque se guarda de verdad al terminar: vista Gasto y gastos periódicos activados", async () => {
    await hastaVista();
    await act(async () => { click(btn("Gasto")); });
    await act(async () => { click(btn("No")); });
    await act(async () => { click(btn("Sí, ayudadme")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(txt()).not.toContain("Paso 6 de 6"); // ya en la app
    expect(txt()).not.toContain("¿Te gustaría que te ayudemos a pagar tus gastos");
  });
});

describe("Retoques del 20 de septiembre", () => {
  it("la pantalla del email dice que son los DETALLES de los gastos los que no salen del dispositivo", async () => {
    await montar(null, {});
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent === "Entendido, empezar")); });
    expect(txt()).toContain("Los detalles de tus gastos nunca salen de este dispositivo");
  });

  it("todos los apartados de Ajustes dejan aire entre su título y su contenido", async () => {
    const seed = { version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
      months: { "2026-08": { expenses: [], incomes: [] } } };
    await montar(seed, { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
    for (const titulo of ["Cómo se ve la app", "Dinero", "Datos y privacidad", "Ayuda y app"]) {
      await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes(titulo))); });
      const body = document.querySelector(".cg-grupo-body");
      expect(body).not.toBeNull();
      expect(parseInt(body.style.paddingTop, 10)).toBeGreaterThan(0);
    }
  });
});

describe("Ordenar y Filtrar con menú propio (v9)", () => {
  const ONB = { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } };
  const gasto = (id, name, amount, categoryId, date, extra = {}) => ({ id, name, amount, categoryId, date, time: "10:00", ...extra });
  const seed = (extra = {}) => ({ version: 8, categories: CATS, learned: {}, recurring: [], metas: [],
    bancos: [{ id: "b1", name: "Banco Uno" }],
    months: { "2026-08": { incomes: [{ id: "i1", label: "Nómina", amount: 1500, date: "2026-08-01" }, { id: "i2", label: "Bizum de Ana", amount: 20, date: "2026-08-05" }],
      expenses: [
        gasto("g1", "Zapatos", 50, "ocio", "2026-08-02", { formaPago: "efectivo" }),
        gasto("g2", "Mercadona", 30, "super", "2026-08-10", { formaPago: "banco", bancoId: "b1" }),
        gasto("g3", "Arroz", 5, "super", "2026-08-12", { formaPago: "efectivo" }),
      ] } }, ...extra });
  const card = (titulo) => [...document.querySelectorAll(".cg-card")].find((c) => c.querySelector("h2")?.textContent === titulo);
  const pill = (c, empieza) => [...c.querySelectorAll(".cg-pill")].find((b) => b.textContent.trim().startsWith(empieza));
  const opt = (c, t) => [...c.querySelectorAll(".cg-menu-opt")].find((b) => b.textContent.trim() === t);
  const nombres = (c) => [...c.querySelectorAll(".cg-name")].map((n) => n.textContent);

  it("ya no hay tres botones de ordenar: una píldora enseña el orden activo, y elegir otro cierra el menú y reordena", async () => {
    await montar(seed(), ONB);
    const c = card("Movimientos");
    expect(c.querySelector(".cg-chips")).toBeNull();
    expect(pill(c, "Más reciente")).toBeTruthy();
    expect(c.querySelector(".cg-menu")).toBeNull();
    await act(async () => { click(pill(c, "Más reciente")); });
    expect([...c.querySelectorAll(".cg-menu-opt")].map((b) => b.textContent.trim())).toEqual(["Más reciente", "Más antiguo", "A-Z"]);
    await act(async () => { click(opt(c, "A-Z")); });
    expect(c.querySelector(".cg-menu")).toBeNull(); // se cierra solo al elegir
    expect(pill(c, "A-Z")).toBeTruthy();
    expect(nombres(c)).toEqual(["Arroz", "Mercadona", "Zapatos"]);
  });

  it("Filtrar deja marcar varias cosas sin cerrarse, cambia el contador y la píldora, y 'Ver todo' lo quita", async () => {
    await montar(seed(), ONB);
    const c = card("Movimientos");
    expect(c.textContent).toContain("3 gastos");
    await act(async () => { click(pill(c, "Filtrar")); });
    expect(c.textContent).toContain("Categoría");
    expect(c.textContent).toContain("Forma de pago");
    await act(async () => { click(opt(c, "🛒 Supermercado")); });
    expect(c.querySelector(".cg-menu")).not.toBeNull(); // sigue abierto para marcar más
    expect(c.textContent).toContain("2 de 3 gastos");
    expect(pill(c, "Filtrar · 1").classList.contains("on")).toBe(true);
    // cruzar con forma de pago: supermercado pagado en efectivo -> solo Arroz
    await act(async () => { click(opt(c, "Efectivo")); });
    expect(c.textContent).toContain("1 de 3 gastos");
    expect(pill(c, "Filtrar · 2")).toBeTruthy();
    expect(nombres(c)).toEqual(["Arroz"]);
    // varias categorías suman: añadir Ocio trae también Zapatos (efectivo)
    await act(async () => { click(opt(c, "🎬 Ocio")); });
    expect(nombres(c).sort()).toEqual(["Arroz", "Zapatos"]);
    await act(async () => { click(opt(c, "Ver todo, sin filtros")); });
    expect(c.querySelector(".cg-menu")).toBeNull();
    expect(c.textContent).toContain("3 gastos");
    expect(c.textContent).not.toContain(" de 3 gastos");
    expect(pill(c, "Filtrar").classList.contains("on")).toBe(false);
  });

  it("tocar fuera cierra el menú, y si el filtro no deja nada lo dice en vez de parecer que faltan gastos", async () => {
    const s = seed(); s.months["2026-08"].expenses.push(gasto("g4", "Cine", 9, "ocio", "2026-08-13", { formaPago: "bizum" }));
    await montar(s, ONB);
    const c = card("Movimientos");
    await act(async () => { click(pill(c, "Filtrar")); });
    await act(async () => { click(opt(c, "🛒 Supermercado")); });
    await act(async () => { click(opt(c, "Bizum/Transferencia")); });
    expect(c.textContent).toContain("Ningún gasto con estos filtros.");
    await act(async () => { document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
    expect(c.querySelector(".cg-menu")).toBeNull();
  });

  it("al salir de la pestaña los filtros se borran solos, pero el orden elegido se conserva", async () => {
    await montar(seed(), ONB);
    let c = card("Movimientos");
    await act(async () => { click(pill(c, "Más reciente")); });
    await act(async () => { click(opt(c, "A-Z")); });
    await act(async () => { click(pill(c, "Filtrar")); });
    await act(async () => { click(opt(c, "🎬 Ocio")); });
    expect(c.textContent).toContain("1 de 3 gastos");
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Resumen")); });
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Gastos")); });
    c = card("Movimientos");
    expect(c.textContent).toContain("3 gastos");
    expect(c.textContent).not.toContain(" de 3 gastos");
    expect(pill(c, "A-Z")).toBeTruthy();
  });

  it("con la forma de pago desactivada en Ajustes, el menú de Filtrar no enseña ese bloque", async () => {
    await montar(seed({ formaPagoActivada: false }), ONB);
    const c = card("Movimientos");
    await act(async () => { click(pill(c, "Filtrar")); });
    expect(c.querySelector(".cg-menu").textContent).toContain("Categoría");
    expect(c.querySelector(".cg-menu").textContent).not.toContain("Forma de pago");
  });

  it("el buscador busca dentro de lo filtrado", async () => {
    await montar(seed(), ONB);
    const c = card("Movimientos");
    await act(async () => { click(pill(c, "Filtrar")); });
    await act(async () => { click(opt(c, "🎬 Ocio")); });
    await act(async () => { document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
    await act(async () => { setVal(c.querySelector('input[aria-label="Buscar movimientos"]'), "Mercadona"); });
    expect(c.textContent).toContain("Nada que se parezca");
  });

  it("Ingresos lleva solo Ordenar (los ingresos no tienen categoría ni forma de pago)", async () => {
    await montar(seed(), ONB);
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ingresos")); });
    const pills = [...document.querySelectorAll(".cg-pill")].map((b) => b.textContent.trim());
    expect(pills).toContain("Más reciente");
    expect(pills.some((t) => t.startsWith("Filtrar"))).toBe(false);
    expect(document.querySelector(".cg-chips .cg-chip.on")).toBeNull();
  });

  it("Gastos fijos: Ordenar conserva sus cuatro opciones y Filtrar reduce la lista", async () => {
    const rec = (id, name, categoryId, extra = {}) => ({ id, kind: "gasto", name, amount: 10, categoryId, day: 5, every: 1, since: "2026-01", auto: true, active: true, ...extra });
    await montar(seed({ recurring: [rec("r1", "Alquiler", "super", { formaPago: "banco", bancoId: "b1" }), rec("r2", "Netflix", "ocio", { formaPago: "efectivo" })] }), ONB);
    await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Fijos")); });
    const c = card("Gastos fijos");
    await act(async () => { click(pill(c, "Próximo cobro")); });
    expect([...c.querySelectorAll(".cg-menu-opt")].map((b) => b.textContent.trim())).toEqual(["Próximo cobro", "Más antiguo", "A-Z", "Periodicidad"]);
    await act(async () => { click(opt(c, "A-Z")); });
    await act(async () => { click(pill(c, "Filtrar")); });
    await act(async () => { click(opt(c, "🎬 Ocio")); });
    expect(nombres(c)).toEqual(["Netflix"]); // "Alquiler" también sale en el texto de ayuda, por eso se miran solo las filas
  });
});

describe("Imágenes propias de categoría (v9)", () => {
  const ONB = { seedOnboard: { done: true, installId: "x", avisoActualizacionVisto: true } };
  const base = (cats) => ({ version: 8, categories: cats, learned: {}, recurring: [], metas: [],
    months: { "2026-08": { incomes: [], expenses: [{ id: "g1", name: "Aparto", amount: 50, categoryId: "ahorro", date: "2026-08-02", time: "10:00" }] } } });

  it("la categoría Ahorro enseña la hucha con la D mientras conserve el cerdito original", async () => {
    await montar(base(CATS), ONB);
    const fila = [...document.querySelectorAll(".cg-item")].find((f) => f.textContent.includes("Aparto"));
    expect(fila.querySelector('img[src="./hucha-d.png"]')).not.toBeNull();
    expect(fila.querySelector(".cg-badge").textContent).not.toContain("🐷");
  });

  it("si alguien ya le había cambiado el emoji a Ahorro, se respeta el suyo", async () => {
    await montar(base(CATS.map((c) => (c.id === "ahorro" ? { ...c, emoji: "💰" } : c))), ONB);
    const fila = [...document.querySelectorAll(".cg-item")].find((f) => f.textContent.includes("Aparto"));
    expect(fila.querySelector("img")).toBeNull();
    expect(fila.querySelector(".cg-badge").textContent).toContain("💰");
  });

  it("Gastos periódicos usa su logo nuevo, también en la tarjeta de Metas (antes un recuadro vacío)", async () => {
    const cats = [...CATS, { id: "gastos-periodicos-compartida", name: "Gastos periódicos", emoji: "", color: "#7EC1E8", budget: null, bucket: "ahorro" }];
    const s = base(cats);
    s.gastosPeriodicosActivado = true;
    s.recurring = [{ id: "r1", kind: "gasto", name: "Seguro", amount: 1200, categoryId: "super", day: 5, every: 12, since: "2026-01", auto: true, active: true }];
    s.metas = [{ id: "m1", tipo: "objetivo", name: "Seguro", total: 1200, categoryId: "gastos-periodicos-compartida", plazoMeses: 12, creadoEl: "2026-08-01", fijoId: "r1", recortesPendientes: [] }];
    await montar(s, ONB);
    await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Metas")); });
    const tarjeta = [...document.querySelectorAll(".cg-card")].find((c) => c.textContent.includes("Gastos periódicos"));
    expect(tarjeta).toBeTruthy();
    expect(tarjeta.querySelector('img[src="./gastos-periodicos.png"]')).not.toBeNull();
  });
});

