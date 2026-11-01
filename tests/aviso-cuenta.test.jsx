import { describe, it, expect } from "vitest";
import { fechaAviso, tocaAviso, primerUso } from "../src/lib/avisoCuenta.js";

const gastos = (n, desde = "2026-11-01") => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, amount: 1, date: desde }));
const datos = (exp, extra = {}) => ({ months: { "2026-11": { expenses: exp, incomes: [] } }, ...extra });

describe("Aviso a quien no tiene cuenta", () => {
  it("sin nada anotado o con cuenta, nunca", () => {
    expect(fechaAviso({ months: {} })).toBe(null);
    expect(tocaAviso(datos(gastos(30), { _cuenta: { email: "a@b.c" } }), "2027-01-01")).toBe(false);
  });
  it("a los 7 días del primer apunte", () => {
    const d = datos(gastos(3));
    expect(primerUso(d)).toBe("2026-11-01");
    expect(tocaAviso(d, "2026-11-07")).toBe(false);
    expect(tocaAviso(d, "2026-11-08")).toBe(true);
  });
  it("o antes, en cuanto hay 20 gastos (los fijos no cuentan)", () => {
    expect(tocaAviso(datos(gastos(20)), "2026-11-02")).toBe(true);
    expect(tocaAviso(datos([...gastos(19), { id: "f", amount: 1, date: "2026-11-01", fixed: true }]), "2026-11-02")).toBe(false);
  });
  it("después, cada 30 días desde el último aviso", () => {
    const d = datos(gastos(25), { avisoSinCuenta: "2026-11-02" });
    expect(fechaAviso(d)).toBe("2026-12-02");
    expect(tocaAviso(d, "2026-12-01")).toBe(false);
    expect(tocaAviso(d, "2026-12-02")).toBe(true);
  });
});
