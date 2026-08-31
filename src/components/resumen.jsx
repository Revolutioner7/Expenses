import React, { useMemo } from "react";
import { BUCKETS } from "../constants.js";
import { eur, monthLabel, shiftMonth, shortMonth, monthsBack, dueIn, freqLabel } from "../lib/utils.js";

/* ── comparativa entre meses ── */
export function MonthCompare({ monthKey, months, categories, onJump }) {
  const spendCats = categories.filter((c) => c.bucket !== "ahorro");
  const isSpend = (e) => spendCats.some((c) => c.id === e.categoryId);
  const keys = monthsBack(monthKey, 6);
  const totalOf = (k) => (months[k]?.expenses || []).filter(isSpend).reduce((s, e) => s + e.amount, 0);
  const series = keys.map((k) => ({ key: k, total: totalOf(k) }));
  const max = Math.max(...series.map((s) => s.total), 1);
  const current = totalOf(monthKey);

  const prevKeys = monthsBack(shiftMonth(monthKey, -1), 3).filter((k) => (months[k]?.expenses || []).length);
  const avg = prevKeys.length ? prevKeys.reduce((s, k) => s + totalOf(k), 0) / prevKeys.length : 0;
  const diff = current - avg;
  const pct = avg > 0 ? (diff / avg) * 100 : 0;

  const movers = useMemo(() => {
    if (!prevKeys.length) return [];
    return spendCats.map((c) => {
      const now = (months[monthKey]?.expenses || []).filter((e) => e.categoryId === c.id).reduce((s, e) => s + e.amount, 0);
      const before = prevKeys.reduce((s, k) =>
        s + (months[k]?.expenses || []).filter((e) => e.categoryId === c.id).reduce((t, e) => t + e.amount, 0), 0) / prevKeys.length;
      return { ...c, now, before, delta: now - before };
    })
      .filter((c) => Math.abs(c.delta) >= 1 && (c.now > 0 || c.before > 0))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);
  }, [categories, months, monthKey, prevKeys.join()]);

  return (
    <div className="cg-card">
      <h2 className="cg-title">Comparativa</h2>

      <div className="cg-spark">
        {series.map((s) => (
          <button key={s.key} onClick={() => onJump(s.key)}
            className={`cg-sparkcol ${s.key === monthKey ? "on" : ""}`}
            aria-label={`${monthLabel(s.key)}: ${eur(s.total)} euros`}>
            <span className="cg-sparkval">{s.total > 0 ? Math.round(s.total) : ""}</span>
            <span className="cg-sparkbar" style={{ height: `${Math.max((s.total / max) * 100, 2)}%` }} />
            <span className="cg-sparklab">{shortMonth(s.key)}</span>
          </button>
        ))}
      </div>

      {prevKeys.length === 0 ? (
        <p className="cg-hint" style={{ margin: 0 }}>
          Cuando tengas un mes anterior con gastos, aquí verás si subes o bajas.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 13.5, margin: "4px 0 0", lineHeight: 1.5 }}>
            {Math.abs(pct) < 3 ? (
              <>Vas en línea con tu media {prevKeys.length === 1 ? "del mes anterior" : `de los ${prevKeys.length} meses anteriores`} ({eur(avg)} €).</>
            ) : (
              <>
                {diff > 0 ? "Gastas " : "Gastas "}
                <b style={{ fontFamily: "var(--mono)", color: diff > 0 ? "var(--red)" : "var(--pine)" }}>
                  {diff > 0 ? "+" : "−"}{Math.abs(pct).toFixed(0)}%
                </b>{" "}
                {diff > 0 ? "más" : "menos"} que tu media {prevKeys.length === 1 ? "del mes anterior" : `de los ${prevKeys.length} meses anteriores`} ({eur(avg)} €).
              </>
            )}
          </p>

          {movers.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <span className="cg-lab">Lo que más se mueve</span>
              {movers.map((c) => (
                <div key={c.id} className="cg-mover">
                  <span>{c.emoji}</span>
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                  <span className="cg-movdelta" style={{ color: c.delta > 0 ? "var(--red)" : "var(--pine)" }}>
                    {c.delta > 0 ? "▲" : "▼"} {eur(Math.abs(c.delta))} €
                  </span>
                </div>
              ))}
              <p className="cg-hint" style={{ margin: "8px 0 0" }}>Frente a tu media por mes en cada categoría.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── reparto 50/30/20 ── */
export function Split503020({ income, expenses, catById }) {
  const sums = { necesidad: 0, deseo: 0, ahorro: 0 };
  for (const e of expenses) {
    const b = catById[e.categoryId]?.bucket || "deseo";
    sums[b] += e.amount;
  }
  const gastoReal = sums.necesidad + sums.deseo;
  const ahorro = income - gastoReal; // lo que no gastas es ahorro, incluidos los traspasos que anotes
  const rows = [
    { ...BUCKETS[0], value: sums.necesidad },
    { ...BUCKETS[1], value: sums.deseo },
    { ...BUCKETS[2], value: ahorro },
  ];

  if (income <= 0) {
    return (
      <div className="cg-card">
        <h2 className="cg-title">Reparto 50/30/20</h2>
        <p className="cg-empty">
          Apunta lo que has recibido este mes y verás cuánto va a necesidades, a caprichos y al ahorro.
        </p>
      </div>
    );
  }

  return (
    <div className="cg-card">
      <h2 className="cg-title">Reparto 50/30/20</h2>
      <div className="cg-split">
        {rows.map((r) => (
          <div key={r.id} className="cg-splitseg"
            style={{ width: `${Math.max((Math.max(r.value, 0) / income) * 100, 0)}%`, background: r.color }} />
        ))}
        {ahorro < 0 && <div className="cg-splitseg" style={{ flex: 1, background: "var(--red)" }} />}
        <div className="cg-splittick" style={{ left: "50%" }} />
        <div className="cg-splittick" style={{ left: "80%" }} />
      </div>
      <div className="cg-hint" style={{ marginTop: 6 }}>Las marcas señalan el 50% y el 80%: ahí deberían acabar los dos primeros tramos.</div>

      {rows.map((r) => {
        const pct = (r.value / income) * 100;
        const off = pct - r.target;
        return (
          <div key={r.id} className="cg-splitrow">
            <i className="cg-dot" style={{ background: r.value < 0 ? "var(--red)" : r.color }} />
            <span style={{ fontWeight: 500 }}>{r.label}</span>
            <span className="cg-splitnum">
              {eur(r.value)} € · <b>{pct.toFixed(0)}%</b>
              <em> / {r.target}%</em>
            </span>
            <span className="cg-splitoff" style={{ color: Math.abs(off) < 3 ? "var(--pine2)" : (r.id === "ahorro" ? (off < 0 ? "var(--red)" : "var(--pine)") : (off > 0 ? "var(--red)" : "var(--pine)")) }}>
              {Math.abs(off) < 3 ? "en objetivo" : `${off > 0 ? "+" : "−"}${Math.abs(off).toFixed(0)} pt`}
            </span>
          </div>
        );
      })}
      {sums.ahorro > 0 && ahorro > 0 && (
        <p className="cg-hint" style={{ margin: "10px 0 0" }}>
          Del ahorro, {eur(sums.ahorro)} € los has apartado tú a mano; el resto es lo que te ha sobrado.
        </p>
      )}
      {ahorro < 0 && (
        <p className="cg-hint" style={{ margin: "10px 0 0", color: "var(--red)" }}>
          Este mes gastas más de lo que has recibido, así que no hay ahorro: te faltan {eur(-ahorro)} €.
        </p>
      )}
    </div>
  );
}

/* ── previsión del mes siguiente ── */
export function Forecast({ monthKey, months, recurring, categories }) {
  const next = shiftMonth(monthKey, 1);
  const saveIds = new Set(categories.filter((c) => c.bucket === "ahorro").map((c) => c.id));
  const due = recurring.filter((r) => dueIn(r, next));

  const fixIn = due.filter((r) => r.kind === "ingreso").reduce((s, r) => s + r.amount, 0);
  const fixOut = due.filter((r) => r.kind === "gasto" && !saveIds.has(r.categoryId)).reduce((s, r) => s + r.amount, 0);
  const fixSave = due.filter((r) => r.kind === "gasto" && saveIds.has(r.categoryId)).reduce((s, r) => s + r.amount, 0);

  /* meses ya cerrados, para la media del gasto que no es fijo */
  const hist = monthsBack(shiftMonth(monthKey, -1), 3).filter((k) => (months[k]?.expenses || []).length);
  const avgOf = (fn) => hist.reduce((s, k) => s + fn(months[k]), 0) / hist.length;
  const varAvg = hist.length ? avgOf((m) => m.expenses.filter((e) => !e.fixed && !saveIds.has(e.categoryId)).reduce((t, e) => t + e.amount, 0)) : null;
  const incAvg = hist.length ? avgOf((m) => (m.incomes || []).reduce((t, i) => t + i.amount, 0)) : null;

  /* "hist" solo dice que el mes existe; para el disclaimer hace falta saber si de verdad aportó
     algo de gasto variable o de ingresos (un mes con un único fijo cuenta como "hist" pero no aporta nada) */
  const histConVariable = hist.filter((k) => (months[k]?.expenses || []).some((e) => !e.fixed && !saveIds.has(e.categoryId)));
  const histConIngresos = hist.filter((k) => (months[k]?.incomes || []).length);

  const income = fixIn > 0 ? fixIn : incAvg || 0;
  const variable = varAvg || 0;
  const left = income - fixOut - variable - fixSave;

  if (!hist.length && !due.length) {
    return (
      <div className="cg-card">
        <h2 className="cg-title">Previsión de {monthLabel(next).toLowerCase()}</h2>
        <p className="cg-empty">
          Con un mes cerrado o algún fijo dado de alta ya puedo estimarte el mes que viene.
        </p>
      </div>
    );
  }

  const rows = [
    { label: "Ingresos previstos", value: income, sign: 1,
      note: fixIn > 0 ? "de tus ingresos fijos" : (histConIngresos.length ? `media de ${histConIngresos.length} ${histConIngresos.length === 1 ? "mes" : "meses"}` : "sin historial aún"),
      sinDatos: fixIn <= 0 && !histConIngresos.length },
    { label: "Gastos fijos", value: fixOut, sign: -1,
      note: due.filter((r) => r.kind === "gasto" && !saveIds.has(r.categoryId)).length + " de alta ese mes" },
    { label: "Gasto variable", value: variable, sign: -1,
      note: histConVariable.length ? `media de ${histConVariable.length} ${histConVariable.length === 1 ? "mes" : "meses"}` : "sin historial aún",
      sinDatos: !histConVariable.length },
  ];
  if (fixSave > 0) rows.push({ label: "Ahorro fijo", value: fixSave, sign: -1, note: "apartado automático" });

  return (
    <div className="cg-card">
      <h2 className="cg-title">Previsión de {monthLabel(next).toLowerCase()}</h2>

      {rows.map((r) => (
        <div key={r.label}>
          <div className="cg-splitrow">
            <span style={{ fontWeight: 500 }}>{r.label}</span>
            <span className="cg-meta" style={{ marginLeft: 2 }}>{r.note}</span>
            <span className="cg-splitnum" style={{ color: r.sign < 0 ? "var(--muted)" : "var(--pine)" }}>
              {r.sign < 0 ? "−" : "+"}{eur(r.value)} €
            </span>
          </div>
          {r.sinDatos && r.value === 0 && (
            <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "2px 0 4px", lineHeight: 1.4 }}>
              La previsión usa los últimos 3 meses cerrados. Hace falta al menos uno completo, con todos los gastos anotados, para poder estimarla.
            </p>
          )}
        </div>
      ))}

      <div className="cg-fcast" style={{ background: left < 0 ? "#F7E9E6" : "#EAF0E8" }}>
        <span className="cg-eyebrow">{left < 0 ? "Te faltarían" : "Te sobrarían"}</span>
        <b style={{ color: left < 0 ? "var(--red)" : "var(--pine)" }}>{eur(Math.abs(left))} €</b>
      </div>

      {due.filter((r) => r.kind === "gasto" && (r.every || 1) > 1).map((r) => (
        <p key={r.id} className="cg-hint" style={{ margin: "8px 0 0" }}>
          Ojo: ese mes toca <b>{r.name}</b> ({freqLabel(r)}), {eur(r.amount)} €.
        </p>
      ))}
      <p className="cg-hint" style={{ margin: "8px 0 0" }}>
        El gasto variable es la media de lo que gastas sin contar fijos ni ahorro. Cuantos más meses lleves, mejor afina.
      </p>
    </div>
  );
}
