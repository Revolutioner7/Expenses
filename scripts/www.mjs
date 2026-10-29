/* Monta www/, la carpeta que Capacitor mete dentro de la app de iPhone.
   Son los mismos archivos que publica GitHub Pages, menos lo que solo tiene sentido en la web:
   el service worker (la app ya funciona sin conexión), el manifiesto de instalación y el bundle beta
   (en la app nativa la beta es TestFlight). */
import fs from "fs";
import path from "path";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const destino = path.join(raiz, "www");
const archivos = [
  "index.html", "boot.js", "bundle.js", "styles.css",
  "apple-touch-icon.png", "icon-192.png", "icon-512.png", "hucha-d.png", "gastos-periodicos.png",
  "font-bricolage.woff2", "font-karla.woff2", "font-mono-400.woff2", "font-mono-500.woff2", "font-mono-600.woff2",
];

fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino, { recursive: true });
for (const f of archivos) {
  const origen = path.join(raiz, f);
  if (!fs.existsSync(origen)) { console.error(`Falta ${f}: compila antes con npm run build`); process.exit(1); }
  fs.copyFileSync(origen, path.join(destino, f));
}
// en la app no hay manifiesto ni service worker: se quita su enlace para no dar errores en consola
let html = fs.readFileSync(path.join(destino, "index.html"), "utf8");
html = html.replace(/\s*<link rel="manifest"[^>]*>/, "");
fs.writeFileSync(path.join(destino, "index.html"), html);
console.log(`www/ listo con ${archivos.length} archivos`);
