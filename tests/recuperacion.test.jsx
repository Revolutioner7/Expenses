import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { prepararRepuesto, nuevoPar, resellarParaDispositivo, abrirConRepuesto, maestraATexto, textoAMaestra, sellar, abrirSello } from "../src/lib/recuperacion.js";

/* ── la llave partida ── */
describe("Lo he perdido todo · cifrado", () => {
  it("con la llave maestra y la pieza del servidor, el dispositivo nuevo abre la llave de datos; Rodrigo no la ve", async () => {
    const maestra = await nuevoPar();
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const { wrappedEsc, escrow } = await prepararRepuesto(dek, maestra.publica);
    const dispositivo = await nuevoPar();
    // Rodrigo solo maneja la pieza A, y se la devuelve cifrada al dispositivo
    const sello = await resellarParaDispositivo(maestra.privada, escrow.a, dispositivo.publica);
    const abierta = await abrirConRepuesto(dispositivo.privada, sello, escrow.s, wrappedEsc);
    expect([...abierta]).toEqual([...dek]);
  });
  it("sin la pieza del servidor, o con otro dispositivo, no se abre", async () => {
    const maestra = await nuevoPar();
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const { wrappedEsc, escrow } = await prepararRepuesto(dek, maestra.publica);
    const dispositivo = await nuevoPar(), otro = await nuevoPar();
    const sello = await resellarParaDispositivo(maestra.privada, escrow.a, dispositivo.publica);
    const sOtra = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    await expect(abrirConRepuesto(dispositivo.privada, sello, sOtra, wrappedEsc)).rejects.toBeTruthy();
    await expect(abrirConRepuesto(otro.privada, sello, escrow.s, wrappedEsc)).rejects.toBeTruthy();
  });
  it("la llave maestra se guarda como texto y vuelve igual; un texto cualquiera no vale", async () => {
    const m = await nuevoPar();
    const t = maestraATexto(m.privada);
    expect(t.startsWith("dineriko-maestra:")).toBe(true);
    const s = await sellar(m.publica, new Uint8Array([1, 2, 3]));
    expect([...(await abrirSello(textoAMaestra(t), s))]).toEqual([1, 2, 3]);
    expect(() => textoAMaestra("hola")).toThrow();
  });
});

/* ── en la app ── */
const llamadas = { empezar: [], completar: [] };
let estado = { estado: "pendiente" };
vi.mock("../src/constants.js", async (orig) => ({ ...(await orig()), RECUPERACION_PUBLICA: { kty: "EC", crv: "P-256", x: "x", y: "y" } }));
vi.mock("../src/lib/cuenta.js", async (orig) => ({
  ...(await orig()),
  empezarRecuperacion: async (base, email) => { llamadas.empezar.push(email); return { id: "i".repeat(22), token: "t".repeat(43), email, privada: {} }; },
  estadoRecuperacion: async () => estado,
  completarRecuperacion: async (base, pend, pass) => { llamadas.completar.push(pass); return { sesion: { email: pend.email, token: "nuevo" }, codigo: "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH" }; },
}));
const { FormCuenta } = await import("../src/components/cuenta.jsx");

let cont, root;
const pinta = async (el) => { await act(async () => root.render(el)); await act(async () => {}); };
const boton = (t) => [...cont.querySelectorAll("button")].find((b) => b.textContent.trim() === t);
const escribe = async (id, v) => {
  const i = cont.querySelector("#" + id);
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  await act(async () => { set.call(i, v); i.dispatchEvent(new Event("input", { bubbles: true })); });
};
const toca = async (t) => { await act(async () => { boton(t).click(); }); await act(async () => {}); };
beforeEach(() => { localStorage.clear(); cont = document.createElement("div"); document.body.appendChild(cont); root = createRoot(cont); llamadas.empezar = []; llamadas.completar = []; estado = { estado: "pendiente" }; });
afterEach(() => { act(() => root.unmount()); cont.remove(); });

describe("Lo he perdido todo · en la app", () => {
  it("al crear la cuenta la casilla viene marcada, y si se desmarca se avisa y se respeta", async () => {
    const onCrear = vi.fn(async () => ({ codigo: "X", terminar: () => {} }));
    await pinta(<FormCuenta modoInicial="crear" onCrear={onCrear} />);
    const casilla = [...cont.querySelectorAll("input[type=checkbox]")][0];
    expect(casilla.checked).toBe(true);
    await act(async () => casilla.click());
    expect(cont.textContent).toContain("nadie podrá abrir tus datos");
    await escribe("cg-cuenta-email", "ana@ejemplo.com");
    await escribe("cg-cuenta-pass", "una contraseña larga");
    await escribe("cg-cuenta-pass2", "una contraseña larga");
    await toca("Crear cuenta");
    expect(onCrear).toHaveBeenCalledWith("ana@ejemplo.com", "una contraseña larga", { recuperacion: false });
  });

  it("pedirla, esperar y terminarla: contraseña nueva, código nuevo y la sesión solo al confirmar", async () => {
    const onRecuperada = vi.fn();
    await pinta(<FormCuenta onEntrar={async () => {}} onRecuperar={async () => {}} onRecuperada={onRecuperada} />);
    await toca("Lo he perdido todo");
    expect(cont.textContent).toContain("Esperamos 72 horas");
    await escribe("cg-perdido-email", "ana@ejemplo.com");
    await toca("Pedir la recuperación");
    expect(llamadas.empezar).toEqual(["ana@ejemplo.com"]);
    expect(cont.textContent).toContain("Revisa tu email");
    expect(localStorage.getItem("dineriko-recuperacion")).toBeTruthy();

    // al volver a abrir más tarde, se retoma donde estaba
    act(() => root.unmount()); root = createRoot(cont);
    estado = { estado: "esperando", listaEn: Date.now() + 72 * 3600000 };
    await pinta(<FormCuenta onEntrar={async () => {}} onRecuperada={onRecuperada} />);
    expect(cont.textContent).toContain("Esperando 72 horas");

    estado = { estado: "aprobada", email: "ana@ejemplo.com" };
    await toca("Comprobar ahora");
    expect(cont.textContent).toContain("Ya puedes volver a entrar");
    await escribe("cg-perdido-pass", "otra contraseña larga");
    await escribe("cg-perdido-pass2", "otra contraseña larga");
    await toca("Guardar y entrar");
    expect(llamadas.completar).toEqual(["otra contraseña larga"]);
    expect(cont.textContent).toContain("Tu código de recuperación");
    expect(onRecuperada).not.toHaveBeenCalled();
    await act(async () => cont.querySelector("input[type=checkbox]").click());
    await toca("Listo");
    expect(onRecuperada).toHaveBeenCalledWith({ email: "ana@ejemplo.com", token: "nuevo" });
    expect(localStorage.getItem("dineriko-recuperacion")).toBeNull();
  });

  it("si se canceló desde el email, lo dice y deja empezar de nuevo", async () => {
    localStorage.setItem("dineriko-recuperacion", JSON.stringify({ id: "i", token: "t", email: "ana@ejemplo.com" }));
    estado = { estado: "cancelada" };
    await pinta(<FormCuenta onEntrar={async () => {}} onRecuperada={() => {}} />);
    expect(cont.textContent).toContain("Petición cancelada");
    await toca("Empezar de nuevo");
    expect(cont.textContent).toContain("Pedir la recuperación");
  });
});
