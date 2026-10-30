/* ── Panel de Rodrigo para "Lo he perdido todo" ──
   Entra firmando con su llave maestra (que pega en el momento y no se guarda en ningún sitio).
   Aprobar = abrir la pieza A con la llave maestra y volver a cifrarla para el dispositivo que la
   pidió. Rodrigo nunca ve la llave de datos ni los gastos de nadie. */
import { api } from "./cuenta.js";
import { firmarAdmin, resellarParaDispositivo, nuevoPar, maestraATexto } from "./recuperacion.js";

async function firmado(maestra, accion) {
  const ts = Date.now();
  return { ts, sig: await firmarAdmin(maestra, `${accion}:${ts}`) };
}

export async function listarPeticiones(base, maestra) {
  return api(base, "/admin/recoveries", { body: await firmado(maestra, "lista") });
}

export async function aprobarPeticion(base, maestra, p) {
  if (!p.a || !p.devicePub) throw new Error("aun-no");
  const sello = await resellarParaDispositivo(maestra, p.a, p.devicePub);
  return api(base, "/admin/approve", { body: { id: p.id, sello, ...(await firmado(maestra, `aprobar-${p.id}`)) } });
}

/* crear la llave maestra (una sola vez): la privada, como texto para el gestor de contraseñas;
   la pública, para la app y el servidor */
export async function crearLlaveMaestra() {
  const par = await nuevoPar();
  return { textoPrivado: maestraATexto(par.privada), publica: par.publica };
}
