import React, { useState, useEffect, useMemo, useRef } from "react";
import { Sheet } from "./ui.jsx";
import { uid, eur, todayISO, nowHM, parseAmount, detectCategory, monthLabel, sortKey, stampLabel } from "../lib/utils.js";

/* ── formulario de alta ── */
export function AddExpense({ categories, learned, onAdd, onNewCategory, justCreated }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [touched, setTouched] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [showDate, setShowDate] = useState(false);
  const [catExpanded, setCatExpanded] = useState(false);
  const nameRef = useRef(null);

  const guess = useMemo(
    () => (touched ? null : detectCategory(name, categories, learned)),
    [name, categories, learned, touched]
  );
  useEffect(() => {
    if (justCreated) { setCategoryId(justCreated); setTouched(true); }
  }, [justCreated]);
  const selected = touched ? categoryId : guess || categoryId;
  const topCats = categories.slice(0, 4);
  useEffect(() => {
    if (selected && !topCats.some((c) => c.id === selected)) setCatExpanded(true);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const visibleCats = catExpanded ? categories : topCats;
  const value = parseAmount(amount);
  const valid = name.trim() && !isNaN(value) && value > 0 && selected;

  const submit = () => {
    if (!valid) return;
    onAdd({ id: uid(), name: name.trim(), amount: value, categoryId: selected, date, time: nowHM() });
    setName(""); setAmount(""); setCategoryId(null); setTouched(false);
    setDate(todayISO()); setShowDate(false); setCatExpanded(false);
    nameRef.current?.focus();
  };

  return (
    <div className="cg-card">
      <h2 className="cg-title">Nuevo gasto</h2>
      <div className="cg-row">
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-name">Concepto</label>
          <input id="cg-name" ref={nameRef} className="cg-input" placeholder="Mercadona, gasolina…"
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
        <div style={{ width: 108 }}>
          <label className="cg-lab" htmlFor="cg-amt">Importe €</label>
          <input id="cg-amt" className="cg-input num" inputMode="decimal" placeholder="0,00"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
      </div>

      {showDate ? (
        <div style={{ marginTop: 12 }}>
          <label className="cg-lab" htmlFor="cg-date">Fecha</label>
          <input id="cg-date" type="date" className="cg-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      ) : (
        <button className="cg-ghost" style={{ marginTop: 12 }} onClick={() => setShowDate(true)}>
          Hoy · cambiar fecha
        </button>
      )}

      <div style={{ marginTop: 12 }}>
        <span className="cg-lab">
          Categoría
          {guess && (
            <span className="cg-guess">
              · detectada: {categories.find((c) => c.id === guess)?.name}
            </span>
          )}
        </span>
        <div className="cg-chips">
          {visibleCats.map((c) => (
            <button key={c.id} className={`cg-chip ${selected === c.id ? "on" : ""}`}
              style={selected === c.id ? { background: c.color } : undefined}
              onClick={() => { setCategoryId(c.id); setTouched(true); }}>
              <span>{c.emoji}</span>{c.name}
            </button>
          ))}
          <button className="cg-chip add" onClick={onNewCategory}>+ Nueva</button>
        </div>
        {categories.length > 4 && (
          <div style={{ textAlign: "right", marginTop: 6 }}>
            <button className="cg-vermas" onClick={() => setCatExpanded((v) => !v)}>
              {catExpanded ? "Ver menos" : "Ver más"}
            </button>
          </div>
        )}
      </div>

      <button className="cg-btn" onClick={submit} disabled={!valid}>Añadir gasto</button>
    </div>
  );
}

/* ── ingresos del mes ── */
export function IncomeCard({ incomes, onAdd, monthKey }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const total = incomes.reduce((s, i) => s + i.amount, 0);
  const value = parseAmount(amount);
  const valid = !isNaN(value) && value > 0;
  const hoy = todayISO();
  const fecha = hoy.slice(0, 7) === monthKey ? hoy : `${monthKey}-01`;

  const submit = () => {
    if (!valid) return;
    onAdd({ id: uid(), label: label.trim() || "Ingreso", amount: value, date: fecha });
    setLabel(""); setAmount("");
  };

  return (
    <div className="cg-card">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 className="cg-title">Recibido este mes</h2>
        <span style={{ fontFamily: "var(--mono)", fontSize: 15 }}>{eur(total)} €</span>
      </div>

      <p className="cg-hint" style={{ marginTop: 4 }}>
        {incomes.length === 0
          ? "Nómina, devoluciones, ventas… Aparecerán en Movimientos, arriba."
          : `${incomes.length} ${incomes.length === 1 ? "ingreso" : "ingresos"} anotados. Los ves y los editas en Movimientos, arriba.`}
      </p>

      <div className="cg-row" style={{ marginTop: 12 }}>
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-ilab">Concepto</label>
          <input id="cg-ilab" className="cg-input" placeholder="Nómina, freelance…"
            value={label} onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
        <div style={{ width: 108 }}>
          <label className="cg-lab" htmlFor="cg-iamt">Importe €</label>
          <input id="cg-iamt" className="cg-input num" inputMode="decimal" placeholder="0,00"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
      </div>
      <button className="cg-btn" onClick={submit} disabled={!valid}>Añadir ingreso</button>
    </div>
  );
}

/* ── gráfico de queso ── */
export function Donut({ slices, total, onPick }) {
  const [hover, setHover] = useState(null);
  const R = 68, SW = 27, C = 2 * Math.PI * R;
  const active = slices.find((s) => s.id === hover);
  let acc = 0;
  const arcs = slices.map((s) => {
    const frac = s.total / total;
    const start = acc;
    acc += frac;
    return { ...s, frac, start };
  });

  return (
    <div className="cg-donut">
      <svg viewBox="0 0 200 200" role="img"
        aria-label={`Reparto del gasto: ${arcs.map((a) => `${a.name} ${Math.round(a.frac * 100)}%`).join(", ")}`}>
        <circle cx="100" cy="100" r={R} fill="none" stroke="#E7EBE4" strokeWidth={SW} />
        <g transform="rotate(-90 100 100)">
          {arcs.map((a) => {
            const len = Math.max(a.frac * C - (slices.length > 1 ? 1.6 : 0), 0.8);
            return (
              <circle key={a.id} className="cg-slice" cx="100" cy="100" r={R} fill="none"
                stroke={a.color} strokeWidth={hover === a.id ? SW + 6 : SW}
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-a.start * C}
                opacity={hover && hover !== a.id ? 0.32 : 1}
                onMouseEnter={() => setHover(a.id)} onMouseLeave={() => setHover(null)}
                onClick={() => onPick(a.id)} />
            );
          })}
        </g>
        {arcs.filter((a) => a.frac >= 0.07).map((a) => {
          const ang = (a.start + a.frac / 2) * 2 * Math.PI - Math.PI / 2;
          return (
            <text key={a.id} className="cg-dpct" x={100 + R * Math.cos(ang)}
              y={100 + R * Math.sin(ang) + 3.2} textAnchor="middle">
              {Math.round(a.frac * 100)}%
            </text>
          );
        })}
        <text className="cg-dnum" x="100" y={active ? 95 : 97} textAnchor="middle">
          {eur(active ? active.total : total)} €
        </text>
        <text className="cg-dlab" x="100" y={active ? 111 : 113} textAnchor="middle">
          {active ? active.name.slice(0, 20) : "gastado"}
        </text>
      </svg>
    </div>
  );
}

/* ── desglose de una categoría ── */
export function CategoryDetail({ category, monthKey, months, onClose, onPickExpense }) {
  const [scope, setScope] = useState("mes");
  const groups = useMemo(() => {
    const keys = scope === "mes" ? [monthKey] : Object.keys(months).sort().reverse();
    const out = [];
    for (const k of keys) {
      const list = (months[k]?.expenses || [])
        .filter((e) => e.categoryId === category.id)
        .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
      if (list.length) out.push([k, list]);
    }
    return out;
  }, [scope, monthKey, months, category.id]);

  const all = groups.flatMap(([, l]) => l);
  const total = all.reduce((s, e) => s + e.amount, 0);

  return (
    <Sheet title={`${category.emoji} ${category.name}`} onClose={onClose}>
      <div className="cg-toggle">
        <button className={scope === "mes" ? "on" : ""} onClick={() => setScope("mes")}>
          {monthLabel(monthKey)}
        </button>
        <button className={scope === "todo" ? "on" : ""} onClick={() => setScope("todo")}>
          Todo el historial
        </button>
      </div>

      <div className="cg-stats" style={{ marginTop: 12 }}>
        <div className="cg-stat"><span className="cg-eyebrow">Total</span><b>{eur(total)} €</b></div>
        <div className="cg-stat"><span className="cg-eyebrow">Gastos</span><b>{all.length}</b></div>
        <div className="cg-stat"><span className="cg-eyebrow">Media</span><b>{eur(all.length ? total / all.length : 0)} €</b></div>
      </div>

      {all.length === 0 ? (
        <p className="cg-empty">Nada anotado en esta categoría todavía.</p>
      ) : (
        groups.map(([k, list]) => (
          <div key={k}>
            {scope === "todo" && (
              <div className="cg-day" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{monthLabel(k)}</span>
                <span>{eur(list.reduce((s, e) => s + e.amount, 0))} €</span>
              </div>
            )}
            {list.map((e) => (
              <button key={e.id} className="cg-item" onClick={() => onPickExpense(e)}>
                <div className="cg-badge" style={{ background: category.color + "22" }}>{category.emoji}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="cg-name">{e.name}</div>
                  <div className="cg-meta">{stampLabel(e)}</div>
                </div>
                <span className="cg-amt">−{eur(e.amount)} €</span>
              </button>
            ))}
          </div>
        ))
      )}
      <p className="cg-hint" style={{ marginTop: 14, marginBottom: 0 }}>Toca un gasto para editarlo o borrarlo.</p>
    </Sheet>
  );
}
