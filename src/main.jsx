import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { pedirPersistencia } from "./lib/storage.js";

pedirPersistencia();

createRoot(document.getElementById("root")).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      // busca una versión nueva cada vez que la app vuelve a primer plano —
      // así no hace falta cerrarla del todo ni acordarse de nada
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    }).catch(() => {});
  });

  // en cuanto un service worker nuevo toma el control, recarga una sola vez
  // (evita el bucle: si ya recargamos por esto en esta pestaña, no lo repite)
  let yaRecargo = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (yaRecargo) return;
    yaRecargo = true;
    window.location.reload();
  });
}
