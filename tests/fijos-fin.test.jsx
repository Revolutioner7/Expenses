import { describe, it, expect, vi, afterEach } from "vitest";
import { dueIn, pagosRestantes } from "../src/lib/utils.js";
import { autoApplyAll } from "../src/lib/data.js";

const dep = (extra = {}) => ({ id: "dep", kind: "gasto", name: "Depósito", amount: 300, categoryId: "c", day: 5, every: 1, since: "2026-11", hasta: "2027-01", auto: true, active: true, ...extra });

describe("Fijos con fecha de fin", () => {
  afterEach(() => vi.useRealTimers());

  it("toca de noviembre a enero y nunca después", () => {
    expect(["2026-11", "2026-12", "2027-01", "2027-02"].map((k) => dueIn(dep(), k))).toEqual([true, true, true, false]);
    expect(dueIn(dep({ hasta: null }), "2030-05")).toBe(true);
  });
  it("cuenta los pagos que quedan", () => {
    expect(pagosRestantes(dep(), "2026-11")).toBe(3);
    expect(pagosRestantes(dep(), "2027-01")).toBe(1);
    expect(pagosRestantes(dep({ hasta: null }), "2026-11")).toBe(null);
    expect(pagosRestantes(dep({ every: 2, hasta: "2027-03" }), "2026-11")).toBe(3);
  });
  it("se anota el último pago y, pasado su último mes, desaparece sin borrar lo anotado", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2027, 0, 10));
    let d = { categories: [], metas: [{ id: "mm", fijoId: "dep" }, { id: "otra" }], recurring: [dep()], months: {} };
    d = autoApplyAll(d);
    expect(d.recurring.length).toBe(1);
    expect(Object.keys(d.months).sort()).toEqual(["2026-11", "2026-12", "2027-01"]);
    vi.setSystemTime(new Date(2027, 1, 2));
    d = autoApplyAll(d);
    expect(d.recurring.length).toBe(0);
    expect(d.metas.map((m) => m.id)).toEqual(["otra"]);
    expect(d.months["2027-01"].expenses.length).toBe(1);
  });
});
