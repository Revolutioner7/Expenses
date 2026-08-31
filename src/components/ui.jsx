import React, { useState, useEffect } from "react";

export const EyeIcon = ({ off }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {off ? (
      <>
        <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.6 6.6A18.5 18.5 0 0 0 2 12s3 8 10 8a9.1 9.1 0 0 0 5.4-1.6" />
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <line x1="2" y1="2" x2="22" y2="22" />
      </>
    ) : (
      <>
        <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

/* ── lista que colapsa a 3 elementos, con "ver más" y "ver menos" (este último aparece
   dos veces cuando está expandida: donde estaba "ver más", y al final de la lista) ── */
export function ExpandableList({ items, expanded, onToggle, renderItem }) {
  const visible = expanded ? items : items.slice(0, 3);
  const restCount = items.length - 3;
  return (
    <>
      {visible.map(renderItem)}
      {items.length > 3 && (
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <button className="cg-vermas" onClick={onToggle}>
            {expanded ? "Ver menos" : `Ver más (${restCount})`}
          </button>
        </div>
      )}
      {expanded && items.length > 3 && (
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <button className="cg-vermas" onClick={onToggle}>Ver menos</button>
        </div>
      )}
    </>
  );
}

/* ── caja de coach: mensaje de ánimo, reutilizable en Mes y Resumen ── */
export function CoachBox({ msg }) {
  return (
    <div className="cg-coachbox">
      <div className="cg-coachicon"><i className="ti ti-trending-up" aria-hidden="true"></i></div>
      <span>{msg}</span>
    </div>
  );
}

/* ── tarjeta de aviso para quien ya usaba la app antes de esta actualización: no bloquea nada,
   solo informa y ofrece dejar el email de forma opcional ── */
export function AvisoActualizacionCard({ onClose }) {
  const [email, setEmail] = useState("");
  return (
    <div className="cg-card cg-pending">
      <h2 className="cg-title">Novedad en esta actualización</h2>
      <p className="cg-hint" style={{ marginBottom: 10 }}>
        Ahora Cosecha manda una señal anónima para saber cuánta gente la usa — sin contraseñas ni
        datos de tus gastos. Por favor, por motivos de seguridad y satisfacción, registra tu email.
        Nunca se comparte con terceros.
      </p>
      <input className="cg-input" type="email" placeholder="tu@email.com (opcional)"
        value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="cg-btn" style={{ flex: 1 }} onClick={() => onClose(email.trim())}>Guardar</button>
        <button className="cg-ghost" onClick={() => onClose("")}>Ahora no</button>
      </div>
    </div>
  );
}

/* ── ajuste de saldo: corrige un pequeño descuadre puntual, sin que cuente como gasto ── */
export function AjusteSaldoCard({ ajuste, onSave }) {
  const [valor, setValor] = useState(ajuste?.valor != null ? String(ajuste.valor).replace(".", ",") : "");
  const [nota, setNota] = useState(ajuste?.nota || "");
  const [showInfo, setShowInfo] = useState(false);

  const parse = (s) => {
    const t = String(s || "").trim().replace(",", ".");
    const v = parseFloat(t);
    return isNaN(v) ? NaN : Math.round(v * 100) / 100;
  };
  const valorNum = parse(valor);

  const guardar = () => {
    if (isNaN(valorNum)) return;
    onSave({ valor: valorNum, nota: nota.trim() || null });
  };

  return (
    <div className="cg-card">
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <h2 className="cg-title" style={{ margin: 0 }}>Ajuste de saldo</h2>
        <button onClick={() => setShowInfo((v) => !v)} aria-label="Más información sobre el ajuste de saldo"
          style={{ border: 0, background: "transparent", padding: 2, cursor: "pointer", display: "flex", color: "var(--muted)" }}>
          <i className="ti ti-info-circle" style={{ fontSize: 15 }} aria-hidden="true"></i>
        </button>
      </div>
      <p className="cg-hint" style={{ marginBottom: showInfo ? 8 : 14 }}>
        Usa esto para ajustar un saldo restante o sobrante a final de mes.
      </p>
      {showInfo && (
        <p className="cg-hint" style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 12px", marginBottom: 14, lineHeight: 1.5 }}>
          Es normal que el disponible no cuadre al céntimo con tu cuenta real — ninguna app de
          este tipo lo hace sin conectarse directamente al banco. Esto corrige solo el número
          final; no cuenta como gasto ni afecta a tus categorías ni a las medias.
        </p>
      )}

      <label className="cg-lab" htmlFor="cg-ajuste-valor">Diferencia</label>
      <input id="cg-ajuste-valor" className="cg-input num" inputMode="decimal" placeholder="0,00"
        value={valor} onChange={(e) => setValor(e.target.value)} style={{ marginBottom: 10 }} />

      <label className="cg-lab" htmlFor="cg-ajuste-nota">Nota (opcional)</label>
      <input id="cg-ajuste-nota" className="cg-input" placeholder="Efectivo sin anotar, redondeo…"
        value={nota} onChange={(e) => setNota(e.target.value)} style={{ marginBottom: 14 }} />

      <button className="cg-btn" onClick={guardar} disabled={isNaN(valorNum)}>Guardar ajuste</button>

      {ajuste && (
        <div style={{ borderTop: "0.5px solid var(--line)", marginTop: 14, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12.5 }}>Ajuste activo este mes{ajuste.nota ? ` · ${ajuste.nota}` : ""}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: ajuste.valor < 0 ? "var(--red)" : "var(--pine)" }}>
            {ajuste.valor >= 0 ? "+" : ""}{ajuste.valor.toFixed(2).replace(".", ",")} €
          </span>
        </div>
      )}
    </div>
  );
}

/* ── fila de una meta, con su checklist de reducciones si tiene ── */
export function MetaRow({ meta, cat, aportado, onOpen, onToggleRecorte }) {
  const [yaVistos] = useState(() => new Set((meta.recortesPendientes || []).filter((r) => r.hecho).map((r) => r.categoryId)));
  const [detallesAbierto, setDetallesAbierto] = useState(false);

  const pct = meta.total > 0 ? Math.min(100, (aportado / meta.total) * 100) : 0;
  const cuota = meta.plazoMeses > 0 ? Math.max(0, meta.total - aportado) / meta.plazoMeses : null;
  const fraseMeta =
    pct >= 100 ? "¡Conseguida! 🎉" :
    pct >= 75 ? "Ya casi lo tienes" :
    pct >= 50 ? "Vas a mitad de camino" :
    pct >= 25 ? "Buen ritmo, sigue así" :
    pct > 0 ? "Ya has empezado" : null;

  const items = meta.recortesPendientes || [];
  const pendientes = items.filter((r) => !r.hecho);
  const hechosNuevos = items.filter((r) => r.hecho && !yaVistos.has(r.categoryId));
  const hechosViejos = items.filter((r) => r.hecho && yaVistos.has(r.categoryId));
  const visibles = [...pendientes, ...hechosNuevos];
  const eurFmt = (n) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="cg-catrow">
      <button style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }} onClick={() => onOpen(meta)}>
        <div className="cg-catline">
          <span>{cat?.emoji || (meta.tipo === "objetivo" ? "🎯" : "🤝")}</span>
          <span style={{ fontWeight: 500 }}>{meta.name}</span>
          <span className="cg-pct" style={{ fontFamily: "var(--mono)" }}>{pct.toFixed(0)}%</span>
        </div>
        <div className="cg-track">
          <div className="cg-fill" style={{ width: `${pct}%`, background: meta.tipo === "objetivo" ? "#D99A2B" : "var(--pine)" }} />
        </div>
        <div className="cg-meta">
          {eurFmt(aportado)} € de {eurFmt(meta.total)} € {meta.tipo === "objetivo" ? "ahorrado" : "pagado"}
          {cuota != null ? ` · ${eurFmt(cuota)} €/mes · ${meta.plazoMeses} ${meta.plazoMeses === 1 ? "mes" : "meses"}` : ""}
        </div>
        {fraseMeta && (
          <div style={{ fontSize: 12, color: "#8B6A1F", marginTop: 4, fontWeight: 500 }}>{fraseMeta}</div>
        )}
      </button>

      {items.length > 0 && (
        <div style={{ borderTop: "0.5px solid var(--line)", marginTop: 8, paddingTop: 8 }}>
          <p style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 6px" }}>
            Gastos a reducir
          </p>
          {visibles.map((r) => (
            <div key={r.categoryId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
              <button
                onClick={() => onToggleRecorte(meta.id, r.categoryId)}
                aria-label={r.hecho ? `Marcar ${r.nombre} como pendiente` : `Marcar ${r.nombre} como reducido`}
                style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0, padding: 0,
                  border: r.hecho ? "none" : "1.5px solid var(--line)",
                  background: r.hecho ? "var(--pine)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}>
                {r.hecho && <i className="ti ti-check" style={{ fontSize: 12, color: "#fff" }} aria-hidden="true"></i>}
              </button>
              <span style={{ fontSize: 12.5, flex: 1, color: r.hecho ? "var(--muted)" : "var(--ink)", textDecoration: r.hecho ? "line-through" : "none" }}>
                {r.emoji} {r.nombre}
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>{eurFmt(r.monto)} €/mes</span>
            </div>
          ))}

          {hechosViejos.length > 0 && (
            <>
              {detallesAbierto && hechosViejos.map((r) => (
                <div key={r.categoryId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, background: "var(--pine)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <i className="ti ti-check" style={{ fontSize: 12, color: "#fff" }} aria-hidden="true"></i>
                  </div>
                  <span style={{ fontSize: 12.5, flex: 1, color: "var(--muted)", textDecoration: "line-through" }}>{r.emoji} {r.nombre}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>{eurFmt(r.monto)} €/mes</span>
                </div>
              ))}
              <div style={{ textAlign: "center", marginTop: 4 }}>
                <button className="cg-vermas" onClick={() => setDetallesAbierto((v) => !v)}>
                  {detallesAbierto ? "Ocultar detalles" : "Detalles"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── hoja modal ── */
export function Sheet({ children, onClose, title }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="cg-scrim" onClick={onClose}>
      <div className="cg-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 className="cg-title" style={{ margin: 0 }}>{title}</h3>
          <button className="cg-navbtn" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
