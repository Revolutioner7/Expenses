/* ── almacenamiento (con reserva en memoria si no está disponible) ── */
let memoryStore = {};
export const hasLocal = (() => {
  try { window.localStorage.setItem("__t", "1"); window.localStorage.removeItem("__t"); return true; }
  catch (e) { return false; }
})();

export const store = {
  async get(key) {
    if (window.storage) {
      try { const r = await window.storage.get(key, false); return r ? r.value : null; }
      catch (e) { return null; }
    }
    if (hasLocal) {
      try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }
    return memoryStore[key] ?? null;
  },
  async set(key, value) {
    if (window.storage) {
      try { await window.storage.set(key, value, false); return true; }
      catch (e) { memoryStore[key] = value; return false; }
    }
    if (hasLocal) {
      try { window.localStorage.setItem(key, value); return true; }
      catch (e) { memoryStore[key] = value; return false; }
    }
    memoryStore[key] = value;
    return true;
  },
};

/* en iPhone instalado, pedir que los datos no se puedan desalojar */
export function pedirPersistencia() {
  if (typeof navigator !== "undefined" && navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }
}
