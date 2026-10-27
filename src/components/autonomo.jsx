import React, { useState, useMemo } from "react";
import { eur, parseAmount } from "../lib/utils.js";
import { CUOTAS, cuotaPorId, tramoPara, coincideCuota, porcentajesPorDefecto, configPorDefecto, resumenTrimestre } from "../lib/autonomo.js";
import { usarCierreFuera, OpcionMenu } from "./ui.jsx";

/* Sí / No con el mismo aspecto que el resto de interruptores de Ajustes */
function SiNo({ valor, onChange, etiqueta }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 6px" }}>{etiqueta}</p>
      <div className="cg-toggle" role="radiogroup" aria-label={etiqueta}>
        <button type="button" className={valor === true ? "on" : ""} role="radio" aria-checked={valor === true} onClick={() => onChange(true)}>Sí</button>
        <button type="button" className={valor === false ? "on" : ""} role="radio" aria-checked={valor === false} onClick={() => onChange(false)}>No</button>
      </div>
    </div>
  );
}

/* Desplegable con filtro: se escribe y se va acotando, o se toca directamente */
export function SelectorCuota({ valor, onChange, propuestaId }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const ref = usarCierreFuera(abierto, () => setAbierto(false));
  const actual = cuotaPorId(valor);
  const visibles = CUOTAS.filter((c) => coincideCuota(c, texto));
  const elegir = (c) => { onChange(c.id); setAbierto(false); setTexto(""); };
  return (
    <div className="cg-menuwrap cg-selector" ref={ref} style={{ position: "relative" }}>
      <input className="cg-input" placeholder={actual ? `${actual.label} · ${actual.cuota} €/mes` : "Escribe o elige…"}
        value={abierto ? texto : (actual ? `${actual.label} · ${actual.cuota} €/mes` : "")}
        onFocus={() => { setAbierto(true); setTexto(""); }}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); }}
        onKeyDown={(e) => { if (e.key === "Enter" && visibles.length === 1) elegir(visibles[0]); }}
        aria-label="Cuota de autónomo" aria-expanded={abierto} />
      {abierto && (
        <div className="cg-menu cg-menu-selector" role="listbox" aria-label="Cuota de autónomo" style={{ top: 48, width: "100%" }}>
          {visibles.length === 0 && <div className="cg-menu-sec">Nada coincide</div>}
          {visibles.map((c) => (
            <OpcionMenu key={c.id} marcada={c.id === valor} onClick={() => elegir(c)}>
              {c.label} · <b>{c.cuota} €/mes</b>
              {c.id === propuestaId && c.id !== "plana" && <span style={{ color: "var(--muted)", fontSize: 11 }}> · según tus ingresos</span>}
            </OpcionMenu>
          ))}
        </div>
      )}
    </div>
  );
}

/* Apartado de Ajustes. cfg = data.autonomo; onSave recibe la config completa; onDesactivar apaga. */
export function AjustesAutonomo({ cfg, onSave, onDesactivar, mediaMensual }) {
  const base = cfg || configPorDefecto();
  const [borrador, setBorrador] = useState(() => ({ ...configPorDefecto(), ...base }));
  const [editando, setEditando] = useState(!base.activo);
  const [quiereGestoria, setQuiereGestoria] = useState(() => (base.gestoria || 0) > 0);
  const [gestoriaTxt, setGestoriaTxt] = useState(() => (base.gestoria ? String(base.gestoria) : ""));
  const [umbralTxt, setUmbralTxt] = useState(() => String(base.umbral ?? 2000));
  const propuesta = useMemo(() => tramoPara(mediaMensual), [mediaMensual]);

  const set = (k, v) => setBorrador((b) => ({ ...b, [k]: v }));
  const responder = (k, v) => {
    const siguiente = { ...borrador, [k]: v };
    if (k === "clientesEspana" && v === false) { siguiente.retencion = false; siguiente.nuevoAutonomo = false; }
    if (k === "retencion" && v === false) siguiente.nuevoAutonomo = false;
    const pct = porcentajesPorDefecto(siguiente);
    setBorrador({ ...siguiente, ivaPct: pct.ivaPct, irpfPct: pct.irpfPct });
  };

  const cuotaLista = borrador.cuotaId != null;
  const gestoriaOk = !quiereGestoria || (parseAmount(gestoriaTxt) > 0);
  const umbralOk = !isNaN(parseAmount(umbralTxt)) && parseAmount(umbralTxt) >= 0;
  const puedeGuardar = cuotaLista && gestoriaOk && umbralOk;

  const guardar = () => {
    if (!puedeGuardar) return;
    onSave({
      ...borrador,
      activo: true,
      gestoria: quiereGestoria ? parseAmount(gestoriaTxt) : 0,
      umbral: parseAmount(umbralTxt),
      ivaPct: Number(borrador.ivaPct) || 0,
      irpfPct: Number(borrador.irpfPct) || 0,
    });
    setEditando(false);
  };

  if (!editando && base.activo) {
    const c = cuotaPorId(base.cuotaId);
    return (
      <div className="cg-autonomo">
        <p className="cg-hint">
          De cada ingreso de {eur(base.umbral)} € o más, la app aparta un <b>{base.irpfPct} %</b> para IRPF
          {base.ivaPct > 0 ? <> y separa el <b>{base.ivaPct} %</b> de IVA</> : <>, sin IVA (clientes fuera de España)</>}.
          {c && <> Cuota: {c.label}, {c.cuota} €/mes.</>}
          {base.gestoria > 0 && <> Gestoría: {eur(base.gestoria)} €/mes.</>}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="cg-ghost" onClick={() => setEditando(true)}>Cambiar respuestas o porcentajes</button>
          <button className="cg-ghost danger" onClick={onDesactivar}>Ya no soy autónomo</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cg-autonomo">
      <p className="cg-hint">
        Responde y la app propone los porcentajes que te corresponden. Luego puedes cambiarlos.
        Es una reserva prudente para que no te pille el trimestre, no la liquidación: esa la hace tu gestoría.
      </p>

      <SiNo etiqueta="¿Tus clientes están en España?" valor={borrador.clientesEspana} onChange={(v) => responder("clientesEspana", v)} />
      {borrador.clientesEspana === true && (
        <SiNo etiqueta="¿Tus clientes te retienen IRPF en las facturas?" valor={borrador.retencion} onChange={(v) => responder("retencion", v)} />
      )}
      {borrador.clientesEspana === true && borrador.retencion === true && (
        <SiNo etiqueta="¿Llevas menos de tres años como autónomo?" valor={borrador.nuevoAutonomo} onChange={(v) => responder("nuevoAutonomo", v)} />
      )}

      <div style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 6px" }}>¿Cuál es tu cuota de autónomo?</p>
        <SelectorCuota valor={borrador.cuotaId} onChange={(id) => set("cuotaId", id)} propuestaId={propuesta.id} />
        {!cuotaLista && mediaMensual > 0 && (
          <p className="cg-hint" style={{ marginTop: 6 }}>
            Con tus ingresos de los últimos meses te tocaría <b>{propuesta.label}</b> ({propuesta.cuota} €/mes).{" "}
            <button type="button" className="cg-link" onClick={() => set("cuotaId", propuesta.id)}>Usar ese</button>
          </p>
        )}
      </div>

      <SiNo etiqueta="¿Quieres anotar ya el gasto mensual de la gestoría?" valor={quiereGestoria} onChange={setQuiereGestoria} />
      {quiereGestoria && (
        <div style={{ marginBottom: 14, width: 160 }}>
          <label className="cg-lab" htmlFor="cg-gestoria">Gestoría €/mes</label>
          <input id="cg-gestoria" className="cg-input num" inputMode="decimal" placeholder="0,00" value={gestoriaTxt} onChange={(e) => setGestoriaTxt(e.target.value)} />
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginBottom: 14 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>Porcentajes y umbral (propuestos, editables)</h3>
        <div className="cg-row">
          <div className="cg-field">
            <label className="cg-lab" htmlFor="cg-iva">IVA %</label>
            <input id="cg-iva" className="cg-input num" inputMode="decimal" value={borrador.ivaPct} onChange={(e) => set("ivaPct", e.target.value)} />
          </div>
          <div className="cg-field">
            <label className="cg-lab" htmlFor="cg-irpf">Reserva IRPF %</label>
            <input id="cg-irpf" className="cg-input num" inputMode="decimal" value={borrador.irpfPct} onChange={(e) => set("irpfPct", e.target.value)} />
          </div>
          <div className="cg-field">
            <label className="cg-lab" htmlFor="cg-umbral">Desde €</label>
            <input id="cg-umbral" className="cg-input num" inputMode="decimal" value={umbralTxt} onChange={(e) => setUmbralTxt(e.target.value)} />
          </div>
        </div>
        <p className="cg-hint" style={{ marginTop: 6, marginBottom: 0 }}>
          "Desde" es el importe a partir del cual un ingreso cuenta como facturación: los pequeños (un bizum, una devolución) no reparten nada.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="cg-btn" style={{ width: "auto" }} disabled={!puedeGuardar} onClick={guardar}>Guardar</button>
        {base.activo && <button className="cg-ghost" onClick={() => setEditando(false)}>Cancelar</button>}
      </div>
    </div>
  );
}

/* Tarjeta de la pestaña Ingresos: lo reservado en el trimestre en curso */
export function ImpuestosTrimestreCard({ months, cfg, hoyISO }) {
  const r = useMemo(() => resumenTrimestre(months, cfg, hoyISO), [months, cfg, hoyISO]);
  const [abierto, setAbierto] = useState(false);
  const pagoTxt = new Date(r.pago + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" });
  return (
    <div className="cg-card cg-impuestos">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 className="cg-title">Impuestos del {r.etiqueta}</h2>
        <span style={{ fontFamily: "var(--mono)", fontSize: 15 }}>{eur(r.impuestos)} €</span>
      </div>
      {r.filas.length === 0 ? (
        <p className="cg-hint" style={{ marginTop: 4, marginBottom: 0 }}>
          Aún no hay ingresos de {eur(cfg.umbral)} € o más este trimestre. Cuando los anotes, aquí verás cuánto apartar.
        </p>
      ) : (
        <>
          <p className="cg-hint" style={{ marginTop: 4 }}>
            Has facturado {eur(r.ingresado)} €. Aparta <b>{eur(r.irpf)} €</b> para IRPF
            {r.iva > 0 && <> y <b>{eur(r.iva)} €</b> de IVA</>}. El trimestre se paga el {pagoTxt}
            {r.diasHastaPago >= 0 ? <>, en {r.diasHastaPago} {r.diasHastaPago === 1 ? "día" : "días"}.</> : <>.</>}
          </p>
          <button type="button" className="cg-link" onClick={() => setAbierto((v) => !v)}>
            {abierto ? "Ocultar el detalle" : `Ver el detalle de ${r.filas.length} ${r.filas.length === 1 ? "ingreso" : "ingresos"}`}
          </button>
          {abierto && (
            <div style={{ marginTop: 8 }}>
              {r.filas.map((f) => (
                <div key={f.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line)", fontSize: 13 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</div>
                    <div className="cg-meta">{new Date(f.date + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · de {eur(f.amount)} €: {eur(f.reparto.impuestos)} € a impuestos, {eur(f.reparto.tuyo)} € tuyos</div>
                  </div>
                  <span style={{ fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>{eur(f.reparto.impuestos)} €</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <p className="cg-meta" style={{ marginTop: 10, marginBottom: 0 }}>Reserva orientativa. La liquidación exacta la hace tu gestoría.</p>
    </div>
  );
}
