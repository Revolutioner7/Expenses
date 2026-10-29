import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

/* simulacro del iPhone: Capacitor dice "nativo" y los plugins guardan en memoria */
const llavero = new Map();
const llamadas = { share: [], ficheros: [], notis: [], cancel: 0, bioCancelar: false };
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" }, registerPlugin: () => ({}) }));
vi.mock("@capgo/capacitor-native-biometric", () => ({
  AccessControl: { NONE: 0, BIOMETRY_CURRENT_SET: 1 },
  NativeBiometric: {
    isAvailable: async () => ({ isAvailable: true }),
    setCredentials: async (o) => { llavero.set(o.server, { ...o }); },
    getSecureCredentials: async (o) => {
      if (llamadas.bioCancelar) throw Object.assign(new Error("User canceled"), { code: "16" });
      const c = llavero.get(o.server); if (!c) throw Object.assign(new Error("no"), { code: "21" });
      return { username: c.username, password: c.password };
    },
    deleteCredentials: async (o) => { llavero.delete(o.server); },
  },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: async (o) => { llamadas.share.push(o); return {}; } } }));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" }, Encoding: { UTF8: "utf8" },
  Filesystem: { writeFile: async (o) => { llamadas.ficheros.push(o); return { uri: `file:///cache/${o.path}` }; } },
}));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    requestPermissions: async () => ({ display: "granted" }),
    schedule: async (o) => { llamadas.notis.push(o); },
    cancel: async () => { llamadas.cancel++; },
  },
}));

const { default: App } = await import("../src/App.jsx");
const { prfCrear, prfObtener, bioDisponible } = await import("../src/lib/crypto.js");
const { crearCopia } = await import("../src/lib/backup.js");
const { isAppInstalled } = await import("../src/components/onboarding.jsx");

describe("App de iPhone · piezas nativas", () => {
  beforeEach(() => { llavero.clear(); llamadas.share = []; llamadas.ficheros = []; llamadas.notis = []; llamadas.bioCancelar = false; });

  it("Face ID: crea un secreto de 32 bytes en el llavero protegido, y lo recupera igual", async () => {
    expect(await bioDisponible()).toBe(true);
    const { credId, bytes } = await prfCrear();
    expect(credId.startsWith("kc:")).toBe(true);
    expect(bytes.length).toBe(32);
    const [guardado] = [...llavero.values()];
    expect(guardado.accessControl).toBe(1); // BIOMETRY_CURRENT_SET: sin Face ID no se lee
    expect(Array.from(await prfObtener(credId))).toEqual(Array.from(bytes));
  });

  it("Face ID cancelado se traduce al mismo error que en la web (NotAllowedError)", async () => {
    const { credId } = await prfCrear();
    llamadas.bioCancelar = true;
    await expect(prfObtener(credId)).rejects.toMatchObject({ name: "NotAllowedError" });
  });

  it("la copia de seguridad se escribe en la caché y se abre la hoja de compartir con el archivo", async () => {
    const ok = await crearCopia({ version: 8, months: {} });
    expect(ok).toBe(true);
    expect(llamadas.ficheros[0].path).toMatch(/^gastos-copia-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(llamadas.ficheros[0].data).version).toBe(8);
    expect(llamadas.share[0].files[0]).toContain("gastos-copia-");
  });

  it("en la app nativa se considera instalada (no enseña 'añadir a pantalla de inicio')", () => {
    expect(isAppInstalled()).toBe(true);
  });
});

/* ── interfaz en modo iPhone ── */
const CATS = [{ id: "super", name: "Supermercado", emoji: "🛒", color: "#2C6B5E", budget: null, bucket: "necesidad" }];
let root, div;
const click = (el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const txt = () => document.body.textContent;
async function montar(seed) {
  global.fetch = () => Promise.resolve({ ok: true });
  const disco = { "cuaderno-gastos-v1": JSON.stringify(seed), "cosecha-onboarding-v1": JSON.stringify({ done: true, installId: "x", avisoActualizacionVisto: true }) };
  window.storage = { get: async (k) => (disco[k] == null ? null : { value: disco[k] }), set: async (k, v) => { disco[k] = v; return {}; } };
  await act(async () => { root.render(React.createElement(App)); await new Promise((r) => setTimeout(r, 250)); });
  return disco;
}
const seed = () => ({ version: 8, categories: CATS, learned: {}, recurring: [], metas: [], months: { "2026-10": { expenses: [], incomes: [] } } });
const abrir = async (titulo) => {
  await act(async () => { click([...document.querySelectorAll(".cg-tab")].find((t) => t.textContent === "Ajustes")); });
  await act(async () => { click([...document.querySelectorAll("button")].find((b) => b.textContent.includes(titulo))); });
};

describe("App de iPhone · Ajustes", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 9, 29));
    div = document.createElement("div"); div.id = "root"; document.body.appendChild(div); root = createRoot(div);
    window.localStorage.clear(); llamadas.notis = [];
  });
  afterEach(() => { act(() => root.unmount()); document.body.removeChild(div); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("no hay canal beta ni 'Buscar actualizaciones': las versiones llegan por la tienda y TestFlight", async () => {
    window.localStorage.setItem("dineriko-canal-desbloqueado", "1");
    await montar(seed());
    await abrir("Ayuda y app");
    expect(txt()).not.toContain("Canal beta");
    expect(txt()).not.toContain("Buscar actualizaciones");
    const version = document.querySelector(".cg-version");
    for (let i = 0; i < 7; i++) await act(async () => { click(version); });
    expect(txt()).not.toContain("Canal beta");
  });

  it("el recordatorio diario se activa, se programa a las 21:00 y se guarda en los datos", async () => {
    const disco = await montar(seed());
    await abrir("Cómo se ve la app");
    expect(txt()).toContain("Recordatorio diario");
    const grupo = document.querySelector(".cg-recordatorio");
    await act(async () => { click([...grupo.querySelectorAll("button")].find((b) => b.textContent === "Activado")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(llamadas.notis.length).toBeGreaterThan(0);
    expect(llamadas.notis[0].notifications[0].schedule.on).toEqual({ hour: 21, minute: 0 });
    expect(JSON.parse(disco["cuaderno-gastos-v1"]).recordatorio).toEqual({ activo: true, hora: "21:00" });
  });
});
