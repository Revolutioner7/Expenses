import { DEFAULT_CATEGORIES, ID_MIGRATION } from "../constants.js";
import { uid, todayISO, monthKeyOf, shiftMonth, daysIn, dueIn, emptyMonth } from "./utils.js";

/* ── anota solos los fijos que ya han vencido, incluidos meses sin abrir la app ── */
export function autoApplyAll(d) {
  if (!d?.recurring?.length) return d;
  const hoy = todayISO();
  const nowKey = monthKeyOf(new Date());
  const limite = shiftMonth(nowKey, -11); // no rebusca más de un año atrás
  const months = { ...d.months };
  let changed = false;

  for (const r of d.recurring) {
    if (r.active === false || r.auto === false) continue;
    let k = r.since > limite ? r.since : limite;
    for (let i = 0; i < 24 && k <= nowKey; i++, k = shiftMonth(k, 1)) {
      if (!dueIn(r, k)) continue;
      const cur = months[k] || emptyMonth();
      if ((cur.applied || {})[r.id]) continue;
      const day = String(Math.min(r.day, daysIn(k))).padStart(2, "0");
      const date = `${k}-${day}`;
      if (date > hoy) continue; // ese día aún no ha llegado
      if (r.kind === "ingreso") {
        const inc = { id: uid(), label: r.name, amount: r.amount, date, fixed: true };
        months[k] = { ...cur, incomes: [...cur.incomes, inc], applied: { ...(cur.applied || {}), [r.id]: inc.id } };
      } else {
        const exp = { id: uid(), name: r.name, amount: r.amount, categoryId: r.categoryId, date, time: null, fixed: true };
        months[k] = { ...cur, expenses: [...cur.expenses, exp], applied: { ...(cur.applied || {}), [r.id]: exp.id } };
      }
      changed = true;
    }
  }
  return changed ? { ...d, months } : d;
}

/* ── migración a las categorías nuevas, conservando los datos ── */
export function migrate(d) {
  const v = d.version || 1;
  if (v >= 8) return d;

  let out = d;
  if (v < 2) {
    const remap = (id) => ID_MIGRATION[id] || id;
    const byId = {};
    for (const c of out.categories) {
      const id = remap(c.id);
      const def = DEFAULT_CATEGORIES.find((x) => x.id === id);
      byId[id] = def && ID_MIGRATION[c.id] ? { ...def, budget: c.budget } : { ...c, id };
    }
    const categories = [
      ...DEFAULT_CATEGORIES.map((def) => byId[def.id] || def),
      ...Object.values(byId).filter((c) => !DEFAULT_CATEGORIES.some((def) => def.id === c.id)),
    ];
    const months = {};
    for (const [k, m] of Object.entries(out.months || {})) {
      months[k] = { ...m, expenses: (m.expenses || []).map((e) => ({ ...e, categoryId: remap(e.categoryId) })) };
    }
    const learned = {};
    for (const [tok, map] of Object.entries(out.learned || {})) {
      const next = {};
      for (const [id, n] of Object.entries(map)) {
        const to = remap(id);
        next[to] = (next[to] || 0) + n;
      }
      learned[tok] = next;
    }
    out = { ...out, categories, months, learned };
  }

  // v4: reparto 50/30/20 en cada categoría, lista de fijos y registro de aplicados
  //      (quien ya venga de v4 pasa por aquí sin cambios y solo recibe el paso v5)
  const categories = out.categories.map((c) => {
    if (c.bucket) return c;
    const def = DEFAULT_CATEGORIES.find((x) => x.id === c.id);
    return { ...c, bucket: def ? def.bucket : "deseo" };
  });
  const months = {};
  for (const [k, m] of Object.entries(out.months || {})) {
    // v8: los ingresos llevan fecha; los antiguos se colocan el día 1
    months[k] = {
      incomes: (m.incomes || []).map((i) => (i.date ? i : { ...i, date: `${k}-01` })),
      expenses: m.expenses || [],
      applied: m.applied || {},
    };
  }
  // v5: categoría de ahorro, para poder apartar dinero sin que cuente como gasto
  const conAhorro = categories.some((c) => c.bucket === "ahorro")
    ? categories
    : [...categories, DEFAULT_CATEGORIES.find((c) => c.id === "ahorro")];

  // v6: cada fijo lleva su periodicidad; los que ya existían eran mensuales
  // v7: y se anotan solos salvo que digas lo contrario
  const recurring = (out.recurring || []).map((r) => ({ ...r, every: r.every || 1, auto: r.auto !== false }));

  return { version: 8, categories: conAhorro, months, learned: out.learned || {}, recurring, metas: out.metas || [] };
}
