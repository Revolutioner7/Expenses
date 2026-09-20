import React, { useState, useEffect, useRef } from "react";
import { APP_NAME } from "../constants.js";
import { fuzzyMatch, uid } from "../lib/utils.js";

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
        Ahora {APP_NAME} manda una señal anónima para saber cuánta gente la usa — sin contraseñas ni
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

export function AvisoGastosPeriodicosCard({ onClose }) {
  return (
    <div className="cg-card cg-pending" style={{ position: "relative" }}>
      <button onClick={onClose} aria-label="Cerrar"
        style={{ position: "absolute", top: 12, right: 12, background: "none", border: 0, fontSize: 18, color: "var(--muted)", cursor: "pointer" }}>
        ×
      </button>
      <div style={{ display: "flex", gap: 10 }}>
        <i className="ti ti-piggy-bank" style={{ fontSize: 20, color: "var(--pine)", flexShrink: 0, marginTop: 2 }} aria-hidden="true"></i>
        <p style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.55, margin: 0, paddingRight: 16 }}>
          ¿Te gustaría que te ayudemos a pagar tus gastos del trimestre, semestre, año, etc. mes a mes?
          Activa la opción en Ajustes → Dinero. ¡Ah, y no te olvides de registrar tus gastos periódicos!
        </p>
      </div>
    </div>
  );
}

/* ── ajuste de saldo: corrige un pequeño descuadre puntual, sin que cuente como gasto ── */
export function AjusteSaldoCard({ ajuste, onSave }) {
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [avisoGuardado, setAvisoGuardado] = useState(null); // { valor, nota } | null

  const parse = (s) => {
    const t = String(s || "").trim().replace(",", ".");
    const v = parseFloat(t);
    return isNaN(v) ? NaN : Math.round(v * 100) / 100;
  };
  const valorNum = parse(valor);

  const guardar = () => {
    if (isNaN(valorNum)) return;
    const notaFinal = nota.trim() || null;
    onSave({ valor: valorNum, nota: notaFinal });
    setAvisoGuardado({ valor: valorNum, nota: notaFinal });
    setValor(""); setNota("");
    setTimeout(() => setAvisoGuardado(null), 2200);
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

      {avisoGuardado && (
        <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--pine)", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <i className="ti ti-check" style={{ fontSize: 15 }} aria-hidden="true"></i>
          Ajuste guardado: {avisoGuardado.valor >= 0 ? "+" : ""}{avisoGuardado.valor.toFixed(2).replace(".", ",")} €
          {avisoGuardado.nota ? ` · ${avisoGuardado.nota}` : ""}
        </p>
      )}

      {ajuste && (
        <div style={{ marginTop: 14 }}>
          <SwipeableRow onDelete={() => onSave(null)}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              borderTop: "0.5px solid var(--line)", padding: "12px 0 0",
            }}>
              <div style={{ flex: 1, paddingRight: 10 }}>
                <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>
                  Este mes ha habido una diferencia de{" "}
                  <b style={{ color: ajuste.valor < 0 ? "var(--red)" : "var(--pine)" }}>
                    {ajuste.valor >= 0 ? "+" : ""}{ajuste.valor.toFixed(2).replace(".", ",")} €
                  </b>{" "}
                  entre tu cuenta y la app{ajuste.nota ? ` · ${ajuste.nota}` : ""}.
                </p>
              </div>
              <button onClick={() => onSave(null)} aria-label="Quitar ajuste"
                style={{ border: 0, background: "transparent", padding: 4, cursor: "pointer", color: "var(--muted)", flexShrink: 0 }}>
                <i className="ti ti-x" style={{ fontSize: 16 }} aria-hidden="true"></i>
              </button>
            </div>
          </SwipeableRow>
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
          <span>{cat ? <CatMark c={cat} size={16} /> : (meta.tipo === "objetivo" ? "🎯" : "🤝")}</span>
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

/* ── Efectivo / Bizum / Tarjeta: iconos reales (nunca emoji, que renderiza distinto según el
   dispositivo), borde grueso + check para marcar selección, no solo color de fondo ── */
export function FormaPagoToggle({ formaPago, onEfectivo, onBizum, onTarjeta, onDomiciliado }) {
  const base = {
    flex: "1 1 calc(50% - 4px)", minWidth: 0, padding: "8px 6px", borderRadius: 10, fontSize: 12.5, textAlign: "center", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 4, color: "var(--ink)",
  };
  const activo = { background: "#EAF0E8", border: "1.5px solid var(--pine)" };
  const inactivo = { background: "var(--card)", border: "1px solid var(--line)" };
  const Check = () => <i className="ti ti-check" style={{ fontSize: 13, color: "var(--pine)" }} aria-hidden="true"></i>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      <button onClick={onEfectivo} style={{ ...base, ...(formaPago === "efectivo" ? activo : inactivo) }}>
        {formaPago === "efectivo" && <Check />}
        <i className="ti ti-cash" style={{ fontSize: 14 }} aria-hidden="true"></i>
        Efectivo
      </button>
      <button onClick={onBizum} style={{ ...base, ...(formaPago === "bizum" ? activo : inactivo) }}>
        {formaPago === "bizum" && <Check />}
        <i className="ti ti-device-mobile" style={{ fontSize: 14 }} aria-hidden="true"></i>
        Bizum/Transferencia
      </button>
      <button onClick={onTarjeta} style={{ ...base, ...(formaPago === "banco" ? activo : inactivo) }}>
        {formaPago === "banco" && <Check />}
        <i className="ti ti-credit-card" style={{ fontSize: 14 }} aria-hidden="true"></i>
        Tarjeta
      </button>
      <button onClick={onDomiciliado} style={{ ...base, ...(formaPago === "domiciliado" ? activo : inactivo) }}>
        {formaPago === "domiciliado" && <Check />}
        <i className="ti ti-repeat" style={{ fontSize: 14 }} aria-hidden="true"></i>
        Domiciliado
      </button>
    </div>
  );
}

/* ── fila que se puede arrastrar a la izquierda para borrar (gastos e ingresos en Movimientos).
   Al completar el arrastre, borra directo, sin confirmar — a propósito, así se pidió. ── */
/* Categorías que llevan imagen propia en vez de emoji:
   - "Gastos periódicos" → calendario con flechas de repetición (gastos-periodicos.png).
   - "Ahorro" por defecto → la hucha con la D (hucha-d.png), SOLO mientras conserve el emoji original
     del cerdito: si alguien ya lo cambió por otro, o lo cambia desde el editor, se respeta el suyo.
   Devuelve la ruta de la imagen, o null si la categoría usa su emoji normal. */
export function imagenDeCategoria(c) {
  if (!c) return null;
  if (c.id === "gastos-periodicos-compartida") return "./gastos-periodicos.png";
  if (c.id === "ahorro" && (c.emoji === "🐷" || !c.emoji)) return "./hucha-d.png";
  return null;
}

/* Muestra la marca de una categoría: su imagen propia si la tiene, o su emoji. La imagen se pinta un
   35% más grande que el tamaño pedido: un emoji llena su caja, un dibujo con aire alrededor no, y al
   mismo tamaño nominal se veía pequeño al lado de los demás. El margen negativo evita que ese extra
   haga más alta la fila o el chip donde va metida. */
export function CatMark({ c, size = 16 }) {
  const img = imagenDeCategoria(c);
  if (img) {
    const px = Math.round(size * 1.35);
    return <img src={img} alt="" style={{ width: px, height: px, objectFit: "contain", display: "inline-block", verticalAlign: "-0.32em", margin: "-4px 0" }} />;
  }
  return <>{c?.emoji || "🏷️"}</>;
}

export function SwipeableRow({ onDelete, disabled, children }) {
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(null);
  const UMBRAL = -96;
  const MAX_ARRASTRE = -160;

  if (disabled) return children;

  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; };
  const onTouchMove = (e) => {
    if (startX.current === null) return;
    const delta = e.touches[0].clientX - startX.current;
    if (delta < 0) { setIsDragging(true); setDragX(Math.max(delta, MAX_ARRASTRE)); }
  };
  const onTouchEnd = () => {
    setIsDragging(false);
    if (dragX <= UMBRAL) onDelete(); else setDragX(0);
    startX.current = null;
  };

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div style={{
        position: "absolute", inset: 0, background: "var(--red)",
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        padding: "0 16px", gap: 6, color: "#fff", fontSize: 13, fontWeight: 600,
        opacity: Math.min(1, Math.abs(dragX) / 60),
      }}>
        <i className="ti ti-trash" style={{ fontSize: 16 }} aria-hidden="true"></i>
        Eliminar
      </div>
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${dragX}px)`, background: "var(--card)",
          transition: isDragging ? "none" : "transform 0.2s ease",
        }}>
        {children}
      </div>
    </div>
  );
}

/* ── grupo colapsable de Ajustes: un acordeón, solo uno abierto a la vez ── */
/* padTop: aire entre la cabecera del apartado y su contenido. 14px por defecto; un apartado cuyo primer
   elemento ya trae su propio relleno (las filas de Dinero) pasa uno menor para que todos se vean igual */
export function GrupoAjustes({ id, icono, titulo, resumen, abierto, onToggle, children, padTop = 14 }) {
  const isOpen = abierto === id;
  return (
    <div className="cg-card" style={{ padding: 0, overflow: "hidden" }}>
      <button onClick={() => onToggle(isOpen ? null : id)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: isOpen ? "#EAF0E8" : "transparent", border: 0, cursor: "pointer", textAlign: "left" }}>
        <i className={`ti ${icono}`} style={{ fontSize: 18, color: isOpen ? "var(--pine)" : "var(--muted)" }} aria-hidden="true"></i>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", flex: 1 }}>{titulo}</span>
        {!isOpen && resumen && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)", textAlign: "right" }}>{resumen}</span>
        )}
        <i className={`ti ti-chevron-${isOpen ? "down" : "right"}`} style={{ fontSize: 16, color: isOpen ? "var(--pine)" : "var(--muted)", flexShrink: 0 }} aria-hidden="true"></i>
      </button>
      {isOpen && <div className="cg-grupo-body" style={{ padding: `${padTop}px 16px 16px` }}>{children}</div>}
    </div>
  );
}

/* ── Menús de píldora: Ordenar y Filtrar ──────────────────────────────────────────────────────
   Menú propio (no el desplegable nativo) para que se vea idéntico en iPhone y Android. Misma
   lógica en los dos: una píldora que abre un menú flotante; tocar fuera (o Escape) lo cierra.
   Iconos en SVG en línea: la fuente de iconos "ti" no está cargada en la app. */
function usarCierreFuera(abierto, cerrar) {
  const ref = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) cerrar(); };
    const tecla = (e) => { if (e.key === "Escape") cerrar(); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("touchstart", fuera, { passive: true });
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("touchstart", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto, cerrar]);
  return ref;
}

const IcoCheck = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

function OpcionMenu({ marcada, onClick, children, multiple }) {
  return (
    <button type="button" className="cg-menu-opt" role={multiple ? "menuitemcheckbox" : "menuitemradio"}
      aria-checked={!!marcada} onClick={onClick}>
      <span className="cg-menu-ck">{marcada && <IcoCheck />}</span>
      <span className="cg-menu-txt">{children}</span>
    </button>
  );
}

/* Ordenar: una sola opción activa; elegir cierra el menú. La píldora enseña el orden activo. */
export function MenuOrdenar({ opciones, valor, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const ref = usarCierreFuera(abierto, () => setAbierto(false));
  const actual = opciones.find(([k]) => k === valor) || opciones[0];
  return (
    <div className="cg-menuwrap" ref={ref}>
      <button type="button" className="cg-pill" aria-haspopup="menu" aria-expanded={abierto}
        aria-label={`Ordenar: ${actual[1]}`} onClick={() => setAbierto((v) => !v)}>
        <span>{actual[1]}</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 9l4-4 4 4M8 15l4 4 4-4" /></svg>
      </button>
      {abierto && (
        <div className="cg-menu" role="menu" aria-label="Ordenar">
          {opciones.map(([k, label]) => (
            <OpcionMenu key={k} marcada={k === valor} onClick={() => { onChange(k); setAbierto(false); }}>{label}</OpcionMenu>
          ))}
        </div>
      )}
    </div>
  );
}

/* Filtrar: misma lógica, pero se puede marcar más de una opción y el menú sigue abierto mientras
   se marca. grupos = [{ id, titulo, opciones: [{ key, label }] }]; seleccion = { [id]: [keys] }.
   La primera fila ("Ver todo, sin filtros") es la forma de quitarlo todo de un toque. */
export function MenuFiltrar({ grupos, seleccion, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const ref = usarCierreFuera(abierto, () => setAbierto(false));
  const visibles = grupos.filter((g) => g.opciones.length > 0);
  const total = visibles.reduce((n, g) => n + (seleccion[g.id] || []).length, 0);
  const alternar = (gid, key) => {
    const act = seleccion[gid] || [];
    onChange({ ...seleccion, [gid]: act.includes(key) ? act.filter((k) => k !== key) : [...act, key] });
  };
  const limpiar = () => { onChange(Object.fromEntries(grupos.map((g) => [g.id, []]))); setAbierto(false); };
  return (
    <div className="cg-menuwrap" ref={ref}>
      <button type="button" className={`cg-pill ${total > 0 ? "on" : ""}`} aria-haspopup="menu" aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16l-6 7.5V19l-4 1.5v-8z" /></svg>
        <span>{total > 0 ? `Filtrar · ${total}` : "Filtrar"}</span>
      </button>
      {abierto && (
        <div className="cg-menu" role="menu" aria-label="Filtrar">
          <OpcionMenu marcada={total === 0} onClick={limpiar}>Ver todo, sin filtros</OpcionMenu>
          {visibles.map((g) => (
            <React.Fragment key={g.id}>
              <div className="cg-menu-sec">{g.titulo}</div>
              {g.opciones.map((o) => (
                <OpcionMenu key={o.key} multiple marcada={(seleccion[g.id] || []).includes(o.key)}
                  onClick={() => alternar(g.id, o.key)}>{o.icono ? <>{o.icono}{" "}</> : null}{o.label}</OpcionMenu>
              ))}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── selector de banco: buscador + el más usado fijado arriba + 2 más + ver más ── */
export function BancoPicker({ bancos, masUsadoId, selectedId, onSelect, onAddNuevo }) {
  const [q, setQ] = useState("");
  const [expandido, setExpandido] = useState(false);

  const masUsado = bancos.find((b) => b.id === masUsadoId) || null;
  const resto = bancos.filter((b) => b.id !== masUsadoId).sort((a, b) => a.name.localeCompare(b.name, "es"));

  const crearYSeleccionar = () => {
    const nombre = q.trim();
    if (!nombre || !onAddNuevo) return;
    const nuevo = { id: uid(), name: nombre };
    onAddNuevo(nuevo);
    onSelect(nuevo.id);
    setQ("");
  };

  if (q.trim()) {
    const resultados = bancos.filter((b) => fuzzyMatch(q, b.name)).sort((a, b) => a.name.localeCompare(b.name, "es"));
    return (
      <div>
        <input className="cg-input" placeholder="Buscar banco…" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && resultados.length === 0) crearYSeleccionar(); }}
          style={{ marginBottom: 8 }} aria-label="Buscar banco" />
        <div style={{ borderRadius: 10, overflow: "hidden", border: "0.5px solid var(--line)" }}>
          {resultados.length === 0 ? (
            onAddNuevo ? (
              <button onClick={crearYSeleccionar}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "11px 12px", border: 0, background: "transparent", fontSize: 14, color: "var(--pine2)", fontWeight: 500, textAlign: "left", cursor: "pointer" }}>
                <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
                Añadir «{q.trim()}»
              </button>
            ) : (
              <p className="cg-hint" style={{ padding: 12, margin: 0 }}>Nada que se parezca a «{q.trim()}».</p>
            )
          ) : resultados.map((b) => (
            <button key={b.id} onClick={() => onSelect(b.id)}
              style={{ display: "flex", alignItems: "center", width: "100%", padding: "11px 12px", border: 0, borderBottom: "0.5px solid var(--line)", background: selectedId === b.id ? "#EAF0E8" : "transparent", fontSize: 14, textAlign: "left", cursor: "pointer" }}>
              {b.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const visibles = expandido ? resto : resto.slice(0, masUsado ? 2 : 3);
  const ocultos = resto.length - visibles.length;

  return (
    <div>
      <input className="cg-input" placeholder="Buscar banco…" value={q} onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 8 }} aria-label="Buscar banco" />
      <div style={{ borderRadius: 10, overflow: "hidden", border: "0.5px solid var(--line)" }}>
        {masUsado && (
          <button onClick={() => onSelect(masUsado.id)}
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "11px 12px", border: 0, borderBottom: "0.5px solid var(--line)", background: selectedId === masUsado.id ? "#EAF0E8" : "#EAF0E8", fontSize: 14, textAlign: "left", cursor: "pointer" }}>
            <span style={{ flex: 1 }}>{masUsado.name}</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}>Más utilizado</span>
            {selectedId === masUsado.id && <i className="ti ti-check" style={{ fontSize: 16, color: "var(--pine)" }} aria-hidden="true"></i>}
          </button>
        )}
        {visibles.map((b) => (
          <button key={b.id} onClick={() => onSelect(b.id)}
            style={{ display: "flex", alignItems: "center", width: "100%", padding: "11px 12px", border: 0, borderBottom: "0.5px solid var(--line)", background: selectedId === b.id ? "#EAF0E8" : "transparent", fontSize: 14, textAlign: "left", cursor: "pointer" }}>
            {b.name}
          </button>
        ))}
      </div>
      {ocultos > 0 && !expandido && (
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <button className="cg-vermas" onClick={() => setExpandido(true)}>Ver más ({ocultos})</button>
        </div>
      )}
    </div>
  );
}

/* ── forma de pago para varios apuntes a la vez: aplica al momento en Efectivo/Bizum,
   pide banco primero si es Tarjeta/Domiciliado ── */
export function BulkFormaPagoPicker({ bancos, masUsadoBancoId, onAddBanco, onAplicar }) {
  const [formaPago, setFormaPago] = useState(null);
  return (
    <div>
      <FormaPagoToggle formaPago={formaPago}
        onEfectivo={() => onAplicar({ formaPago: "efectivo", bancoId: null })}
        onBizum={() => onAplicar({ formaPago: "bizum", bancoId: null })}
        onTarjeta={() => setFormaPago("banco")}
        onDomiciliado={() => setFormaPago("domiciliado")} />
      {(formaPago === "banco" || formaPago === "domiciliado") && (
        <div style={{ marginTop: 12 }}>
          <BancoPicker bancos={bancos || []} masUsadoId={masUsadoBancoId} selectedId={null}
            onSelect={(id) => onAplicar({ formaPago, bancoId: id })}
            onAddNuevo={onAddBanco} />
        </div>
      )}
    </div>
  );
}

/* ── fecha u hora para varios apuntes a la vez ── */
export function BulkFechaHoraPicker({ tipo, onAplicar }) {
  const [valor, setValor] = useState("");
  return (
    <div>
      <label className="cg-lab" htmlFor="cg-bulk-valor">{tipo === "fecha" ? "Fecha nueva" : "Hora nueva"}</label>
      <input id="cg-bulk-valor" type={tipo === "fecha" ? "date" : "time"} className="cg-input"
        value={valor} onChange={(e) => setValor(e.target.value)} />
      {tipo === "fecha" && (
        <p className="cg-hint" style={{ marginTop: 8 }}>
          Si la fecha nueva cae en otro mes, los apuntes se mudan solos a ese mes.
        </p>
      )}
      <button className="cg-btn" style={{ marginTop: 12 }} disabled={!valor} onClick={() => onAplicar(valor)}>
        Aplicar a los seleccionados
      </button>
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
