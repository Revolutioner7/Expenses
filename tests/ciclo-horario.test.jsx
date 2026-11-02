import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cicloDePago } from "../src/lib/utils.js";

/* El ciclo de nómina debe cerrar el día antes del cobro también cuando en medio
   cae el cambio de hora de marzo (en España ese domingo dura 23 horas). */
describe("ciclo de nómina y cambio de hora", () => {
  let tzAntes;
  beforeAll(() => { tzAntes = process.env.TZ; process.env.TZ = "Europe/Madrid"; });
  afterAll(() => { if (tzAntes === undefined) delete process.env.TZ; else process.env.TZ = tzAntes; });

  it("cobro el 27 en marzo de 2028 (cambio de hora el 26): el ciclo acaba el 26", () => {
    expect(cicloDePago(27, new Date(2028, 2, 10, 12))).toEqual({ inicio: "2028-02-27", fin: "2028-03-26" });
  });
  it("cobro el 26 en marzo de 2029 (cambio de hora el 25): el ciclo acaba el 25", () => {
    expect(cicloDePago(26, new Date(2029, 2, 10, 12))).toEqual({ inicio: "2029-02-26", fin: "2029-03-25" });
  });
  it("el cambio de hora de octubre tampoco mueve el final", () => {
    expect(cicloDePago(26, new Date(2026, 9, 10, 12))).toEqual({ inicio: "2026-09-26", fin: "2026-10-25" });
  });
  it("cruce de año: cobro el 5 con hoy 2 de enero", () => {
    expect(cicloDePago(5, new Date(2027, 0, 2, 12))).toEqual({ inicio: "2026-12-05", fin: "2027-01-04" });
  });
  it("cobro el 1: el ciclo es el mes natural", () => {
    expect(cicloDePago(1, new Date(2027, 1, 15, 12))).toEqual({ inicio: "2027-02-01", fin: "2027-02-28" });
  });
});
