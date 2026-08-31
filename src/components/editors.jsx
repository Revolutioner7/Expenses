import React, { useState, useEffect, useMemo } from "react";
import { Sheet } from "./ui.jsx";
import { SWATCHES, BUCKETS, EMOJI_ALL, FREQS } from "../constants.js";
import { suggestEmojis, norm, uid, parseAmount, eur, todayISO, monthLabel, shiftMonth } from "../lib/utils.js";

/* ── editor de categoría ── */
export function CategoryEditor({ category, onSave, onDelete, onClose, expenseCount }) {
  const [name, setName] = useState(category?.name || "");
  const [emoji, setEmoji] = useState(category?.emoji || "🏷️");
  const [pickedEmoji, setPickedEmoji] = useState(!!category);
  const [showAll, setShowAll] = useState(false);
  const [color, setColor] = useState(category?.color || SWATCHES[Math.floor(Math.random() * SWATCHES.length)]);
  const [budget, setBudget] = useState(category?.budget != null ? String(category.budget).replace(".", ",") : "");
  const [bucket, setBucket] = useState(category?.bucket || "deseo");
  const isNew = !category;

  const suggested = useMemo(() => suggestEmojis(name), [name]);
  useEffect(() => {
    if (!pickedEmoji && suggested.length) setEmoji(suggested[0]);
  }, [suggested, pickedEmoji]);

  const save = () => {
    const n = name.trim();
    if (!n) return;
    const b = parseAmount(budget);
    onSave({
      id: category?.id || uid(),
      name: n,
      emoji: emoji.trim() || "🏷️",
      color,
      bucket,
      budget: isNaN(b) || b <= 0 ? null : b,
    });
    onClose();
  };

  const parecidoAAhorro = isNew && /ahorr/.test(norm(name));

  return (
    <Sheet title={isNew ? "Nueva categoría" : "Editar categoría"} onClose={onClose}>
      <div className="cg-row">
        <div style={{ width: 74 }}>
          <span className="cg-lab">Icono</span>
          <button className="cg-emojibig" onClick={() => setShowAll((v) => !v)}
            aria-label="Elegir otro icono">{emoji}</button>
        </div>
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-catname">Nombre</label>
          <input id="cg-catname" className="cg-input" value={name} autoFocus
            placeholder="Coche, mascota, café…" onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()} />
        </div>
      </div>

      {parecidoAAhorro && (
        <div className="cg-card" style={{ background: "#FBEFDA", margin: "10px 0 0" }}>
          <p style={{ fontSize: 13, margin: 0, color: "#6B4816" }}>
            Esto suena a un fondo de ahorro. Para que tenga seguimiento de verdad (importe, plazo y aviso de
            si es alcanzable), créalo como una meta en la pestaña Metas en vez de una categoría suelta.
          </p>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <span className="cg-lab">
          {suggested.length ? "Sugeridos para ese nombre" : "Elige un icono"}
        </span>
        <div className="cg-chips">
          {(suggested.length ? suggested : EMOJI_ALL.slice(0, 8)).map((e, i) => (
            <button key={e + i} className={`cg-emoji ${emoji === e ? "on" : ""}`}
              onClick={() => { setEmoji(e); setPickedEmoji(true); }} aria-label={`Icono ${e}`}>{e}</button>
          ))}
          <button className="cg-chip add" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Cerrar" : "Ver todos"}
          </button>
        </div>
        {showAll && (
          <div className="cg-emojigrid">
            {EMOJI_ALL.map((e, i) => (
              <button key={e + i} className={`cg-emoji ${emoji === e ? "on" : ""}`}
                onClick={() => { setEmoji(e); setPickedEmoji(true); setShowAll(false); }}
                aria-label={`Icono ${e}`}>{e}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <span className="cg-lab">Color</span>
        <div className="cg-chips">
          {SWATCHES.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={`Color ${c}`}
              style={{
                width: 28, height: 28, borderRadius: 8, background: c, cursor: "pointer",
                border: color === c ? "2px solid #101A18" : "1px solid rgba(0,0,0,.1)",
                outlineOffset: 2,
              }} />
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <span className="cg-lab">En el reparto 50/30/20 cuenta como</span>
        <div className="cg-toggle">
          {BUCKETS.filter((b) => b.id !== "ahorro" || category?.bucket === "ahorro").map((b) => (
            <button key={b.id} className={bucket === b.id ? "on" : ""} onClick={() => setBucket(b.id)}>
              {b.label}
            </button>
          ))}
        </div>
        {category?.bucket !== "ahorro" && (
          <p className="cg-hint">
            Para una categoría de ahorro con seguimiento (importe, plazo), crea una meta en la pestaña Metas.
          </p>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="cg-lab" htmlFor="cg-budget">Límite mensual (opcional)</label>
        <input id="cg-budget" className="cg-input num" inputMode="decimal" placeholder="0,00"
          value={budget} onChange={(e) => setBudget(e.target.value)} />
      </div>

      <button className="cg-btn" onClick={save} disabled={!name.trim()}>
        {isNew ? "Crear categoría" : "Guardar cambios"}
      </button>

      {!isNew && (
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <button className="cg-ghost danger" onClick={() => { onDelete(category.id); onClose(); }}>
            Borrar categoría
          </button>
          {expenseCount > 0 && (
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
              Tiene {expenseCount} {expenseCount === 1 ? "gasto" : "gastos"}. Al borrarla pasan a «Otros».
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}


export function MetaEditor({ meta, aportado, ingresoMensualEstimado, necesidadFija, necesidadVariable, byCategoryDeseo, onSave, onDelete, onClose }) {
  const isNew = !meta;
  const [tipo, setTipo] = useState(meta?.tipo || "objetivo");
  const [name, setName] = useState(meta?.name || "");
  const [total, setTotal] = useState(meta?.total != null ? String(meta.total).replace(".", ",") : "");

  const totalNum = parseAmount(total);
  const restante = Math.max(0, (isNaN(totalNum) ? 0 : totalNum) - (aportado || 0));

  const [cuotaStr, setCuotaStr] = useState(() => {
    if (meta?.total != null && meta?.plazoMeses > 0) {
      const restanteInicial = Math.max(0, meta.total - (aportado || 0));
      return String(Math.round((restanteInicial / meta.plazoMeses) * 100) / 100).replace(".", ",");
    }
    return "";
  });
  const [plazoStr, setPlazoStr] = useState(meta?.plazoMeses != null ? String(meta.plazoMeses) : "");
  const [lastEdited, setLastEdited] = useState(null); // 'cuota' | 'plazo' | null

  const cuotaNum = parseAmount(cuotaStr);
  const plazoNum = parseInt(plazoStr, 10);

  useEffect(() => {
    if (restante <= 0) return;
    if (lastEdited === "cuota" && !isNaN(cuotaNum) && cuotaNum > 0) {
      setPlazoStr(String(Math.max(1, Math.ceil(restante / cuotaNum))));
    } else if (lastEdited === "plazo" && plazoNum > 0) {
      setCuotaStr(String(Math.round((restante / plazoNum) * 100) / 100).replace(".", ","));
    }
  }, [restante, lastEdited, cuotaNum, plazoNum]);

  const margenMaximo = ingresoMensualEstimado - necesidadFija - necesidadVariable;
  const factible = cuotaNum > 0 ? cuotaNum <= margenMaximo : null;

  const recortes = useMemo(() => {
    if (factible !== false) return [];
    let falta = cuotaNum - margenMaximo;
    const out = [];
    for (const c of byCategoryDeseo) {
      if (falta <= 0) break;
      out.push(c);
      falta -= c.total;
    }
    return out;
  }, [factible, cuotaNum, margenMaximo, byCategoryDeseo]);

  const totalRecortes = recortes.reduce((s, c) => s + c.total, 0);
  const gap = factible === false ? cuotaNum - margenMaximo : 0;
  const cubreConRecortes = factible === false && totalRecortes >= gap;

  /* opción "reducir gastos y mensualidad": recorte máximo posible (todo el deseo) +
     el plazo mínimo que sí funciona con lo que queda de margen */
  const sumaDeseoTotal = byCategoryDeseo.reduce((s, c) => s + c.total, 0);
  const margenConRecorteMax = margenMaximo + sumaDeseoTotal;
  const plazoCombinado = margenConRecorteMax > 0 ? Math.max(1, Math.ceil(restante / margenConRecorteMax)) : null;
  const cuotaCombinada = plazoCombinado ? Math.round((restante / plazoCombinado) * 100) / 100 : null;

  /* opción "alargar sin tocar gasto" */
  const plazoSinRecorte = margenMaximo > 0 ? Math.max(1, Math.ceil(restante / margenMaximo)) : null;

  const [vista, setVista] = useState("form"); // 'form' | 'combinada'

  const snapshotRecortes = (lista) => lista.map((c) => ({ categoryId: c.id, nombre: c.name, emoji: c.emoji, monto: c.total, hecho: false }));

  const save = (overridePlazo, overrideRecortes) => {
    const n = name.trim();
    if (!n || isNaN(totalNum) || totalNum <= 0) return;
    const categoryId = meta?.categoryId || uid();
    const categoriaNueva = meta ? null : {
      id: categoryId,
      name: n,
      emoji: tipo === "objetivo" ? "🎯" : "🤝",
      color: tipo === "objetivo" ? "#D99A2B" : "#1E4E45",
      bucket: tipo === "objetivo" ? "ahorro" : "necesidad",
      budget: null,
    };
    const plazoFinal = overridePlazo != null ? overridePlazo : (plazoNum > 0 ? plazoNum : null);
    const recortesFinal = overrideRecortes !== undefined ? overrideRecortes : (meta?.recortesPendientes || []);
    onSave({
      id: meta?.id || uid(),
      tipo, name: n, total: totalNum, categoryId,
      plazoMeses: plazoFinal,
      recortesPendientes: recortesFinal,
      creadoEl: meta?.creadoEl || todayISO(),
    }, categoriaNueva);
    onClose();
  };

  const saveNormal = () => save(null, cubreConRecortes ? snapshotRecortes(recortes) : (meta?.recortesPendientes || []));
  const aplicarAlargar = () => save(plazoSinRecorte, meta?.recortesPendientes || []);
  const aplicarCombinada = () => save(plazoCombinado, snapshotRecortes(byCategoryDeseo));

  return (
    <Sheet title={isNew ? "Nueva meta" : "Editar meta"} onClose={onClose}>
      <div style={{ marginBottom: 12 }}>
        <span className="cg-lab">Tipo</span>
        <div className="cg-toggle">
          <button className={tipo === "objetivo" ? "on" : ""} onClick={() => setTipo("objetivo")} disabled={!isNew}>Objetivo de ahorro</button>
          <button className={tipo === "deuda" ? "on" : ""} onClick={() => setTipo("deuda")} disabled={!isNew}>Deuda</button>
        </div>
        {!isNew && <p className="cg-hint">El tipo no se puede cambiar una vez creada, porque ya tiene categoría propia.</p>}
      </div>

      <label className="cg-lab" htmlFor="cg-metaname">Nombre</label>
      <input id="cg-metaname" className="cg-input" value={name} autoFocus
        placeholder={tipo === "objetivo" ? "Coche nuevo, viaje a Japón…" : "Préstamo de Ana, hipoteca…"}
        onChange={(e) => setName(e.target.value)} style={{ marginBottom: 10 }} />

      <label className="cg-lab" htmlFor="cg-metatotal">{tipo === "objetivo" ? "Cuánto quieres ahorrar en total" : "Cuánto debes en total"}</label>
      <input id="cg-metatotal" className="cg-input num" inputMode="decimal" placeholder="0,00"
        value={total} onChange={(e) => setTotal(e.target.value)} style={{ marginBottom: 10 }} />

      {!isNew && (
        <p className="cg-hint" style={{ marginBottom: 10 }}>
          Llevas {eur(aportado)} € de {eur(totalNum || 0)} € ({tipo === "objetivo" ? "ahorrado" : "pagado"}).
        </p>
      )}

      <div className="cg-row" style={{ alignItems: "flex-end", gap: 10, marginBottom: 4 }}>
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-metacuota">Mensualidad</label>
          <input id="cg-metacuota" className="cg-input num" inputMode="decimal" placeholder="0,00"
            value={cuotaStr}
            onChange={(e) => { setCuotaStr(e.target.value); setLastEdited("cuota"); }} />
        </div>
        <i className="ti ti-arrow-left-right" style={{ fontSize: 16, color: "var(--muted)", marginBottom: 10 }} aria-hidden="true"></i>
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-metaplazo">En cuántos meses</label>
          <input id="cg-metaplazo" className="cg-input num" inputMode="numeric" placeholder="Ej. 8"
            value={plazoStr}
            onChange={(e) => { setPlazoStr(e.target.value.replace(/\D/g, "")); setLastEdited("plazo"); }} />
        </div>
      </div>
      <p className="cg-hint" style={{ marginBottom: 10 }}>Escribe uno de los dos y el otro se calcula solo.</p>

      {vista === "combinada" ? (
        <div className="cg-card" style={{ background: "var(--bg)", margin: "4px 0 12px" }}>
          <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 10px" }}>Reducir gastos y mensualidad</p>
          <div className="cg-card" style={{ padding: "4px 12px", marginBottom: 10 }}>
            {byCategoryDeseo.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "0.5px solid var(--line)" }}>
                <span style={{ fontSize: 12.5 }}>{c.emoji} {c.name}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--muted)" }}>{eur(c.total)} €/mes</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 14px" }}>
            Reduciendo todo esto, te sobran {eur(sumaDeseoTotal)} €/mes más para la meta.
          </p>
          <div className="cg-card" style={{ background: "#EAF0E8", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Plazo ajustado</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 500 }}>{plazoCombinado} {plazoCombinado === 1 ? "mes" : "meses"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Nueva cuota</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 500 }}>{eur(cuotaCombinada)} €/mes</span>
            </div>
          </div>
          <button className="cg-btn" onClick={aplicarCombinada}>Aplicar esta opción</button>
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <button className="cg-ghost" onClick={() => setVista("form")}>Volver</button>
          </div>
        </div>
      ) : cuotaNum > 0 && (
        <div className="cg-card" style={{ background: factible ? "#EAF0E8" : "#FBEFDA", margin: "4px 0 12px" }}>
          <p style={{ fontWeight: 500, margin: "0 0 4px" }}>
            Cuota necesaria: {eur(cuotaNum)} €/mes
          </p>
          {factible ? (
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
              Cabe dentro de lo que ingresas, descontando tus necesidades actuales.
            </p>
          ) : cubreConRecortes ? (
            <>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 8px" }}>
                No cabe del todo — faltarían unos {eur(gap)} € al mes.
              </p>
              <div className="cg-card" style={{ background: "#FBEFDA", padding: "10px 12px", marginBottom: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>
                  Si reduces estos gastos, tendrías {eur(totalRecortes)} €/mes de margen
                </p>
              </div>
              {recortes.map((c) => (
                <p key={c.id} style={{ fontSize: 13, margin: "2px 0" }}>{c.emoji} {c.name} — {eur(c.total)} €/mes</p>
              ))}
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
                Con tus gastos actuales no es posible llegar a esa mensualidad, ni reduciendo todo lo prescindible.
              </p>
              <div className="cg-card" style={{ padding: 12, marginBottom: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 4px" }}>Reducir gastos y mensualidad</p>
                <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 10px" }}>Recorta algo de gasto y ajusta el plazo un poco, entre los dos.</p>
                <button className="cg-ghost" style={{ width: "100%" }} onClick={() => setVista("combinada")} disabled={!plazoCombinado}>Ver esta opción</button>
              </div>
              <div className="cg-card" style={{ padding: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 4px" }}>Alargar a {plazoSinRecorte || "—"} {plazoSinRecorte === 1 ? "mes" : "meses"}</p>
                <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 10px" }}>Sin tocar nada de tu gasto actual.</p>
                <button className="cg-btn" style={{ width: "100%" }} onClick={aplicarAlargar} disabled={!plazoSinRecorte}>Poner {plazoSinRecorte} {plazoSinRecorte === 1 ? "mes" : "meses"}</button>
              </div>
            </>
          )}
        </div>
      )}

      {vista === "form" && (
        <button className="cg-btn" onClick={saveNormal} disabled={!name.trim() || isNaN(totalNum) || totalNum <= 0}>
          {isNew ? "Crear meta" : "Guardar cambios"}
        </button>
      )}

      {!isNew && vista === "form" && (
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <button className="cg-ghost danger" onClick={() => { onDelete(meta.id); onClose(); }}>Borrar meta</button>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
            La categoría «{name}» y sus gastos ya anotados se quedan, solo deja de estar ligada a esta meta.
          </p>
        </div>
      )}
    </Sheet>
  );
}

/* ── editor de gasto ── */
export function ExpenseEditor({ expense, categories, onSave, onDelete, onClose }) {
  const [name, setName] = useState(expense.name);
  const [amount, setAmount] = useState(String(expense.amount).replace(".", ","));
  const [categoryId, setCategoryId] = useState(expense.categoryId);
  const [date, setDate] = useState(expense.date);
  const [time, setTime] = useState(expense.time || "");
  const value = parseAmount(amount);
  const valid = name.trim() && !isNaN(value) && value > 0 && categoryId;

  return (
    <Sheet title="Editar gasto" onClose={onClose}>
      <div className="cg-row">
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-ename">Concepto</label>
          <input id="cg-ename" className="cg-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ width: 108 }}>
          <label className="cg-lab" htmlFor="cg-eamt">Importe</label>
          <input id="cg-eamt" className="cg-input num" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <div className="cg-row" style={{ marginTop: 12 }}>
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-edate">Fecha</label>
          <input id="cg-edate" type="date" className="cg-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div style={{ width: 120 }}>
          <label className="cg-lab" htmlFor="cg-etime">Hora</label>
          <input id="cg-etime" type="time" className="cg-input" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <span className="cg-lab">Categoría</span>
        <div className="cg-chips">
          {categories.map((c) => (
            <button key={c.id} className={`cg-chip ${categoryId === c.id ? "on" : ""}`}
              style={categoryId === c.id ? { background: c.color } : undefined}
              onClick={() => setCategoryId(c.id)}>
              <span>{c.emoji}</span>{c.name}
            </button>
          ))}
        </div>
      </div>
      <button className="cg-btn" disabled={!valid}
        onClick={() => { onSave({ ...expense, name: name.trim(), amount: value, categoryId, date, time: time || null }); onClose(); }}>
        Guardar cambios
      </button>
      <div style={{ marginTop: 12, textAlign: "center" }}>
        <button className="cg-ghost danger" onClick={() => { onDelete(expense.id); onClose(); }}>Borrar gasto</button>
      </div>
    </Sheet>
  );
}

/* ── editor de ingreso ── */

/* ── editor de ingreso ── */
export function IncomeEditor({ income, onSave, onDelete, onClose }) {
  const [label, setLabel] = useState(income.label);
  const [amount, setAmount] = useState(String(income.amount).replace(".", ","));
  const [date, setDate] = useState(income.date || todayISO());
  const value = parseAmount(amount);
  const valid = label.trim() && !isNaN(value) && value > 0;

  return (
    <Sheet title="Editar ingreso" onClose={onClose}>
      <div className="cg-row">
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-ilabe">Concepto</label>
          <input id="cg-ilabe" className="cg-input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div style={{ width: 108 }}>
          <label className="cg-lab" htmlFor="cg-iamte">Importe</label>
          <input id="cg-iamte" className="cg-input num" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="cg-lab" htmlFor="cg-idate">Fecha</label>
        <input id="cg-idate" type="date" className="cg-input" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <button className="cg-btn" disabled={!valid}
        onClick={() => { onSave({ ...income, label: label.trim(), amount: value, date }); onClose(); }}>
        Guardar cambios
      </button>
      <div style={{ marginTop: 12, textAlign: "center" }}>
        <button className="cg-ghost danger" onClick={() => { onDelete(income.id); onClose(); }}>Borrar ingreso</button>
      </div>
    </Sheet>
  );
}

/* ── formulario de alta ── */

export function FixedEditor({ item, categories, monthKey, onSave, onDelete, onClose, onSaveCategory }) {
  const [kind, setKind] = useState(item?.kind || "gasto");
  const [name, setName] = useState(item?.name || "");
  const [amount, setAmount] = useState(item ? String(item.amount).replace(".", ",") : "");
  const [categoryId, setCategoryId] = useState(item?.categoryId || null);
  const [day, setDay] = useState(String(item?.day || 1));
  const [every, setEvery] = useState(item?.every || 1);
  const [since, setSince] = useState(item?.since || monthKey);
  const [auto, setAuto] = useState(item?.auto !== false);
  const [newCat, setNewCat] = useState(false);
  const [catExpanded, setCatExpanded] = useState(() => categoryId ? !categories.slice(0, 4).some((c) => c.id === categoryId) : false);
  const isNew = !item;
  const value = parseAmount(amount);
  const d = Math.min(28, Math.max(1, parseInt(day, 10) || 1));
  const valid = name.trim() && !isNaN(value) && value > 0 && (kind === "ingreso" || categoryId) && /^\d{4}-\d{2}$/.test(since);
  const cuando = every === 1
    ? `Se propone todos los meses, el día ${d}.`
    : `Toca en ${Array.from({ length: Math.min(12 / Math.min(every, 12) || 1, 4) }, (_, i) => monthLabel(shiftMonth(since, i * every)).toLowerCase()).join(", ")}…`;

  return (
    <Sheet title={isNew ? "Nuevo fijo" : "Editar fijo"} onClose={onClose}>
      <div className="cg-toggle">
        <button className={kind === "gasto" ? "on" : ""} onClick={() => setKind("gasto")}>Gasto</button>
        <button className={kind === "ingreso" ? "on" : ""} onClick={() => setKind("ingreso")}>Ingreso</button>
      </div>

      <div className="cg-row" style={{ marginTop: 12 }}>
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-fname">Concepto</label>
          <input id="cg-fname" className="cg-input" autoFocus value={name}
            placeholder={kind === "ingreso" ? "Nómina" : "Alquiler, Netflix…"}
            onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ width: 108 }}>
          <label className="cg-lab" htmlFor="cg-famt">Importe €</label>
          <input id="cg-famt" className="cg-input num" inputMode="decimal" placeholder="0,00"
            value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <span className="cg-lab">Cada cuánto se repite</span>
        <div className="cg-chips">
          {FREQS.map((f) => (
            <button key={f.every} className={`cg-chip ${every === f.every ? "on" : ""}`}
              style={every === f.every ? { background: "var(--pine)" } : undefined}
              onClick={() => setEvery(f.every)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cg-row" style={{ marginTop: 12 }}>
        <div style={{ width: 96 }}>
          <label className="cg-lab" htmlFor="cg-fday">Día del mes</label>
          <input id="cg-fday" className="cg-input num" inputMode="numeric" value={day}
            onChange={(e) => setDay(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} />
        </div>
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-fsince">Empieza en</label>
          <input id="cg-fsince" type="month" className="cg-input" value={since}
            onChange={(e) => setSince(e.target.value)} />
        </div>
      </div>
      <p className="cg-hint" style={{ marginTop: 6 }}>
        {cuando} El día va del 1 al 28, para que exista en febrero.
      </p>

      <div style={{ marginTop: 12 }}>
        <span className="cg-lab">¿Se anota solo?</span>
        <div className="cg-toggle">
          <button className={auto ? "on" : ""} onClick={() => setAuto(true)}>Automático</button>
          <button className={!auto ? "on" : ""} onClick={() => setAuto(false)}>Me lo preguntas</button>
        </div>
      </div>

      {kind === "gasto" && (
        <div style={{ marginTop: 12 }}>
          <span className="cg-lab">Categoría</span>
          <div className="cg-chips">
            {(catExpanded ? categories : categories.slice(0, 4)).map((c) => (
              <button key={c.id} className={`cg-chip ${categoryId === c.id ? "on" : ""}`}
                style={categoryId === c.id ? { background: c.color } : undefined}
                onClick={() => setCategoryId(c.id)}>
                <span>{c.emoji}</span>{c.name}
              </button>
            ))}
            <button className="cg-chip add" onClick={() => setNewCat(true)}>+ Nueva</button>
          </div>
          {categories.length > 4 && (
            <div style={{ textAlign: "right", marginTop: 6 }}>
              <button className="cg-vermas" onClick={() => setCatExpanded((v) => !v)}>
                {catExpanded ? "Ver menos" : "Ver más"}
              </button>
            </div>
          )}
        </div>
      )}

      {newCat && (
        <CategoryEditor
          category={null}
          expenseCount={0}
          onSave={(cat) => { onSaveCategory(cat); setCategoryId(cat.id); }}
          onDelete={() => {}}
          onClose={() => setNewCat(false)}
        />
      )}


      <button className="cg-btn" disabled={!valid}
        onClick={() => {
          onSave({
            id: item?.id || uid(),
            kind, name: name.trim(), amount: value, day: d, every, auto,
            categoryId: kind === "gasto" ? categoryId : null,
            since,
            active: item?.active !== false,
          });
          onClose();
        }}>
        {isNew ? "Crear fijo" : "Guardar cambios"}
      </button>

      {!isNew && (
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <button className="cg-ghost danger" onClick={() => { onDelete(item.id); onClose(); }}>
            Borrar fijo
          </button>
          <p className="cg-hint" style={{ marginTop: 8 }}>
            Los gastos ya anotados en meses anteriores se quedan como están.
          </p>
        </div>
      )}
    </Sheet>
  );
}
