/* Genera privacidad.html (página pública del Aviso de Privacidad) a partir de src/privacidad.js,
   el mismo texto que enseña la app. Es la dirección que se da al App Store y a Google Play. */
import fs from "fs";
import path from "path";
import { PRIVACIDAD, CONTACTO } from "../src/privacidad.js";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const enlaces = (s) => esc(s)
  .replace(CONTACTO, `<a href="mailto:${CONTACTO}">${CONTACTO}</a>`)
  .replace("www.aepd.es", `<a href="https://www.aepd.es" rel="noopener">www.aepd.es</a>`);
const parrafo = (p) => typeof p === "string" ? `<p>${enlaces(p)}</p>` : `<ul>${p.lista.map((l) => `<li>${enlaces(l)}</li>`).join("")}</ul>`;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aviso de Privacidad · Dineriko</title>
<meta name="description" content="Cómo trata Dineriko tus datos: sin cuenta no salen de tu dispositivo; con cuenta, van cifrados de extremo a extremo.">
<link rel="icon" href="./icon-192.png">
<style>
  @font-face{font-family:'Karla';src:url('./font-karla.woff2') format('woff2');font-weight:200 800;font-display:swap;}
  @font-face{font-family:'Bricolage Grotesque';src:url('./font-bricolage.woff2') format('woff2');font-weight:200 800;font-display:swap;}
  :root{--ink:#101A18;--muted:#5F6F68;--bg:#ECF6EF;--card:#FFFFFF;--line:#DCE8E0;--link:#2F7FAE;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:'Karla',system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.6;}
  main{max-width:720px;margin:0 auto;padding:32px 16px 64px;}
  header{display:flex;align-items:center;gap:12px;margin-bottom:24px}
  header img{width:44px;height:44px;border-radius:12px}
  header a{color:inherit;text-decoration:none;font-family:'Bricolage Grotesque',system-ui,sans-serif;font-weight:700;font-size:20px}
  h1{font-family:'Bricolage Grotesque',system-ui,sans-serif;font-size:clamp(28px,6vw,38px);line-height:1.15;margin:0 0 6px}
  h2{font-family:'Bricolage Grotesque',system-ui,sans-serif;font-size:20px;margin:32px 0 8px}
  .fecha{color:var(--muted);margin:0 0 24px}
  .resumen{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 20px;}
  .resumen strong{display:block;margin-bottom:4px}
  ul{padding-left:20px} li{margin-bottom:6px}
  a{color:var(--link)}
  footer{margin-top:48px;color:var(--muted);font-size:14px}
</style>
</head>
<body>
<main>
  <header><img src="./icon-192.png" alt=""><a href="./">Dineriko</a></header>
  <h1>Aviso de Privacidad</h1>
  <p class="fecha">Última actualización: ${esc(PRIVACIDAD.actualizado)}</p>
  <div class="resumen"><strong>En resumen</strong><ul>${PRIVACIDAD.resumen.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>
  ${PRIVACIDAD.secciones.map((s) => `<section><h2>${esc(s.titulo)}</h2>${s.parrafos.map(parrafo).join("\n")}</section>`).join("\n  ")}
  <footer>Dineriko · <a href="./">dineriko.com</a></footer>
</main>
</body>
</html>
`;
fs.writeFileSync(path.join(raiz, "privacidad.html"), html);
console.log("privacidad.html generado");
