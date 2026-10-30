import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

/* Apple/Google simulados: el token "llega" al tocar el botón */
let tokenSimulado = null;
vi.mock("../src/lib/social.js", async (orig) => ({
  ...(await orig()),
  socialDisponible: () => true,
  conseguirToken: async (provider) => {
    if (tokenSimulado === "cancelar") { const e = new Error("cancelado"); e.codigo = "cancelado"; throw e; }
    return { provider, idToken: "tok", nonce: "n".repeat(20) };
  },
}));
const { FormCuenta } = await import("../src/components/cuenta.jsx");
const { pendienteSocial } = await vi.importActual("../src/lib/social.js");

let cont, root;
const pinta = async (el) => { await act(async () => root.render(el)); };
const boton = (t) => [...cont.querySelectorAll("button")].find((b) => b.textContent.trim() === t);
const escribe = async (id, v) => {
  const i = cont.querySelector("#" + id);
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  await act(async () => { set.call(i, v); i.dispatchEvent(new Event("input", { bubbles: true })); });
};
const toca = async (t) => { await act(async () => { boton(t).click(); }); await act(async () => {}); };

beforeEach(() => { cont = document.createElement("div"); document.body.appendChild(cont); root = createRoot(cont); tokenSimulado = null; });
afterEach(() => { act(() => root.unmount()); cont.remove(); });

function social(estado, extra = {}) {
  const llamadas = { crear: [], entrar: [] };
  return {
    llamadas,
    consultar: vi.fn(async () => ({ estado, email: "ana@ejemplo.com", salt: "s", iter: 600000 })),
    crear: vi.fn(async (t, c) => { llamadas.crear.push(c); return { codigo: "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH", terminar: extra.terminar || (() => {}) }; }),
    entrar: vi.fn(async (t, s, c) => { llamadas.entrar.push([s, c.estado]); if (extra.falla) { const e = new Error("x"); e.codigo = extra.falla; throw e; } }),
  };
}

describe("Entrar con Apple o Google", () => {
  it("salen tres botones: Apple, Google y email", async () => {
    await pinta(<FormCuenta modoInicial="crear" onCrear={async () => {}} social={social("nueva")} />);
    expect(boton("Continuar con Google")).toBeTruthy();
    expect(cont.textContent).toContain("Continuar con Apple");
    expect(boton("Continuar con email")).toBeTruthy();
    // el formulario de email no aparece hasta tocar el tercer botón
    expect(cont.querySelector("#cg-cuenta-email")).toBeNull();
    await toca("Continuar con email");
    expect(cont.querySelector("#cg-cuenta-email")).toBeTruthy();
    await toca("Entrar con Apple o Google");
    expect(cont.querySelector("#cg-cuenta-email")).toBeNull();
  });

  it("cuenta nueva: pide elegir el código de Dineriko (dos veces, mínimo 10) y enseña el código de recuperación", async () => {
    const terminar = vi.fn();
    const s = social("nueva", { terminar });
    const listo = vi.fn();
    await pinta(<FormCuenta modoInicial="crear" onCrear={async () => {}} social={s} onCancelar={listo} />);
    await toca("Continuar con Google");
    expect(cont.textContent).toContain("Elige tu código de Dineriko");
    expect(cont.textContent).toContain("Google confirma que eres tú");
    await escribe("cg-social-pass", "corto");
    expect(cont.textContent).toContain("mínimo 10");
    await escribe("cg-social-pass", "mi frase de dineriko");
    await escribe("cg-social-pass2", "mi frase de dineriko");
    await toca("Crear cuenta");
    expect(s.llamadas.crear).toEqual(["mi frase de dineriko"]);
    expect(cont.textContent).toContain("Tu código de recuperación");
    expect(terminar).not.toHaveBeenCalled();
    await act(async () => { cont.querySelector("input[type=checkbox]").click(); });
    await toca("Listo");
    expect(terminar).toHaveBeenCalled();
    expect(listo).toHaveBeenCalledWith("listo");
  });

  it("cuenta que ya existe: pide solo el código y entra", async () => {
    const s = social("existe");
    await pinta(<FormCuenta social={s} onEntrar={async () => {}} />);
    await toca("Continuar con Google");
    expect(cont.textContent).toContain("Hola de nuevo");
    expect(cont.querySelector("#cg-social-pass2")).toBeNull();
    await escribe("cg-social-pass", "mi frase de dineriko");
    await toca("Entrar");
    expect(s.llamadas.entrar).toEqual([["mi frase de dineriko", "existe"]]);
  });

  it("ya había cuenta con ese email: pide su contraseña para unirla", async () => {
    const s = social("vincular");
    await pinta(<FormCuenta social={s} onEntrar={async () => {}} />);
    await toca("Continuar con Apple");
    expect(cont.textContent).toContain("Con ana@ejemplo.com ya hay una cuenta");
    await escribe("cg-social-pass", "la contraseña de siempre");
    await toca("Unir y entrar");
    expect(s.llamadas.entrar).toEqual([["la contraseña de siempre", "vincular"]]);
  });

  it("código equivocado: mensaje claro; 'Lo he olvidado' lleva a recuperar con el email ya puesto", async () => {
    const s = social("existe", { falla: "credenciales" });
    await pinta(<FormCuenta social={s} onEntrar={async () => {}} onRecuperar={async () => {}} />);
    await toca("Continuar con Google");
    await escribe("cg-social-pass", "no es este");
    await toca("Entrar");
    expect(cont.textContent).toContain("incorrectos");
    await toca("Lo he olvidado");
    expect(cont.textContent).toContain("Contraseña nueva");
    expect(cont.querySelector("#cg-cuenta-email").value).toBe("ana@ejemplo.com");
  });

  it("si el permiso de Google ha caducado, vuelve al principio para tocar el botón otra vez", async () => {
    const s = social("existe", { falla: "identidad" });
    await pinta(<FormCuenta social={s} onEntrar={async () => {}} />);
    await toca("Continuar con Google");
    await escribe("cg-social-pass", "lo que sea");
    await toca("Entrar");
    expect(boton("Continuar con Google")).toBeTruthy();
    expect(cont.textContent).toContain("No hemos podido confirmar que eres tú");
  });

  it("si la persona cancela en Google, no sale ningún error", async () => {
    tokenSimulado = "cancelar";
    await pinta(<FormCuenta social={social("nueva")} onEntrar={async () => {}} />);
    await toca("Continuar con Google");
    expect(boton("Continuar con Google")).toBeTruthy();
    expect(cont.querySelector(".cg-cuenta-error")).toBeNull();
  });

  it("al volver de Google en la misma pestaña, retoma donde estaba", async () => {
    const s = social("existe");
    await pinta(<FormCuenta social={s} socialPendiente={{ provider: "google", idToken: "tok", nonce: "n".repeat(20) }} onEntrar={async () => {}} />);
    await act(async () => {});
    expect(s.consultar).toHaveBeenCalled();
    expect(cont.textContent).toContain("Hola de nuevo");
  });
});

describe("Vuelta de Apple/Google en la misma pestaña", () => {
  beforeEach(() => sessionStorage.clear());
  it("solo se acepta el token del intento que hizo esta pestaña, y una sola vez", () => {
    sessionStorage.setItem("dineriko-oauth-intento", JSON.stringify({ state: "abc.r.x.google", nonce: "nnn", provider: "google", at: Date.now() }));
    sessionStorage.setItem("dineriko-oauth", JSON.stringify({ state: "abc.r.x.google", idToken: "tok" }));
    expect(pendienteSocial()).toEqual({ provider: "google", idToken: "tok", nonce: "nnn" });
    expect(pendienteSocial()).toBeNull();
    sessionStorage.setItem("dineriko-oauth-intento", JSON.stringify({ state: "abc.r.x.google", nonce: "nnn", provider: "google", at: Date.now() }));
    sessionStorage.setItem("dineriko-oauth", JSON.stringify({ state: "otro.r.x.google", idToken: "tok" }));
    expect(pendienteSocial()).toBeNull();
  });
});
