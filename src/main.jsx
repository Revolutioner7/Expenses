import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { pedirPersistencia } from "./lib/storage.js";

pedirPersistencia();

createRoot(document.getElementById("root")).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
