import React from "react";
import { PRIVACIDAD, CONTACTO } from "../privacidad.js";

/* convierte el email de contacto y la web de la AEPD en enlaces */
function ConEnlaces({ texto }) {
  const partes = texto.split(/(rodrigoharmat@gmail\.com|www\.aepd\.es)/);
  return partes.map((p, i) =>
    p === CONTACTO ? <a key={i} href={`mailto:${CONTACTO}`}>{p}</a>
      : p === "www.aepd.es" ? <a key={i} href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">{p}</a>
      : <React.Fragment key={i}>{p}</React.Fragment>);
}

export function AvisoPrivacidad() {
  return (
    <div className="cg-privacidad">
      <p className="cg-hint" style={{ marginTop: 0 }}>Última actualización: {PRIVACIDAD.actualizado}</p>
      <div className="cg-privacidad-resumen">
        <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 6px" }}>En resumen</p>
        <ul className="cg-hint" style={{ margin: 0, paddingLeft: 18 }}>
          {PRIVACIDAD.resumen.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>
      {PRIVACIDAD.secciones.map((s) => (
        <section key={s.titulo}>
          <h4 style={{ fontSize: 13, fontWeight: 700, margin: "16px 0 4px" }}>{s.titulo}</h4>
          {s.parrafos.map((p, i) => typeof p === "string"
            ? <p key={i} className="cg-hint"><ConEnlaces texto={p} /></p>
            : <ul key={i} className="cg-hint" style={{ margin: "0 0 12px", paddingLeft: 18 }}>{p.lista.map((l) => <li key={l}><ConEnlaces texto={l} /></li>)}</ul>)}
        </section>
      ))}
    </div>
  );
}
