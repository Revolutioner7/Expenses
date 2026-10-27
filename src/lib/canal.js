/* ── canal de publicación: estable o beta ──
   La preferencia vive en localStorage a pelo (no en `store`) porque la lee también boot.js,
   antes de que exista React: decide qué bundle cargar. No es dato financiero, no se cifra.
   El desbloqueo (siete toques en la versión) es la única forma de que aparezca el interruptor. */

export const CANAL_KEY = "dineriko-canal";
export const CANAL_DESBLOQUEO_KEY = "dineriko-canal-desbloqueado";
export const TOQUES_PARA_DESBLOQUEAR = 7;

const leer = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
const escribir = (k, v) => {
  try {
    if (v == null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v);
    return true;
  } catch (e) { return false; }
};

/* "beta" o "estable". Cualquier otro valor cuenta como estable. */
export const canalActual = () => (leer(CANAL_KEY) === "beta" ? "beta" : "estable");

export const betaDesbloqueada = () => leer(CANAL_DESBLOQUEO_KEY) === "1";
export const desbloquearBeta = () => escribir(CANAL_DESBLOQUEO_KEY, "1");

/* cambia de canal; quien llama se encarga de recargar la página para que boot.js
   cargue el bundle que toca. Devuelve false si el almacenamiento no está disponible. */
export const cambiarCanal = (canal) => escribir(CANAL_KEY, canal === "beta" ? "beta" : null);
