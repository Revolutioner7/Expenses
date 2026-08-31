import { DICT, EMOJI_HINTS, STOPWORDS, FREQS } from "../constants.js";

/* ── utilidades: dinero, fechas, búsqueda difusa, detección de categoría ── */

export function suggestEmojis(name) {
  const toks = norm(name).split(" ").filter((t) => t.length >= 3);
  const out = [];
  for (const t of toks) {
    for (const h of EMOJI_HINTS) {
      const hit = h.words.some((w) =>
        w === t || (w.startsWith(t) && t.length >= 4) || (t.startsWith(w) && w.length >= 4));
      if (hit) for (const e of h.emojis) if (!out.includes(e)) out.push(e);
    }
  }
  return out.slice(0, 8);
}

export const norm = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const tokenize = (s) => norm(s).split(" ").filter((t) => t.length >= 3 && !STOPWORDS.has(t));

/* distancia de edición, para el buscador por proximidad (ej. "blanco" encuentra "banco") */
export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}

/* ¿el texto de búsqueda encaja con este texto? por substring, o por proximidad si no */
export function fuzzyMatch(query, text) {
  const q = norm(query);
  if (!q) return true;
  const qTokens = q.split(" ").filter(Boolean);
  const textTokens = norm(text).split(" ").filter(Boolean);
  if (!qTokens.length || !textTokens.length) return false;
  return qTokens.every((qt) =>
    textTokens.some((tt) => {
      if (tt.includes(qt) || qt.includes(tt)) return true;
      const maxLen = Math.max(qt.length, tt.length);
      const tolerancia = maxLen <= 4 ? 1 : maxLen <= 8 ? 2 : 3;
      return levenshtein(qt, tt) <= tolerancia;
    })
  );
}

/* detecta categoría: lo aprendido pesa más que el diccionario */
export function detectCategory(name, categories, learned) {
  const toks = tokenize(name);
  if (!toks.length) return null;
  const valid = new Set(categories.map((c) => c.id));
  const scores = {};
  const bump = (id, n) => {
    if (!valid.has(id)) return;
    scores[id] = (scores[id] || 0) + n;
  };

  for (const t of toks) {
    const mem = learned[t];
    if (mem) for (const [id, count] of Object.entries(mem)) bump(id, 10 + count * 4);
    for (const [id, words] of Object.entries(DICT)) {
      if (words.includes(t)) bump(id, 5);
    }
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

export function learnFrom(learned, name, categoryId) {
  const next = { ...learned };
  for (const t of tokenize(name)) {
    const entry = { ...(next[t] || {}) };
    entry[categoryId] = (entry[categoryId] || 0) + 1;
    next[t] = entry;
  }
  return next;
}

/* ── utilidades ── */
export const uid = () => Math.random().toString(36).slice(2, 10);
export const eur = (n) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(n || 0);
export const monthKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const nowHM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKeyOf(d);
}
export function parseAmount(s) {
  if (s === null || s === undefined) return NaN;
  let t = String(s).trim().replace(/[€\s]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  t = t.replace(/[^0-9.]/g, "");
  const v = parseFloat(t);
  return isNaN(v) ? NaN : Math.round(v * 100) / 100;
}
export const dayLabel = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
};
export const shortDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
};
export const stampLabel = (e) => {
  const [y, m, d] = e.date.split("-").map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", year: "2-digit" });
  if (e.fixed) return `${day} · fijo`;
  return e.time ? `${day} · ${e.time}` : `${day} · sin hora`;
};
export const sortKey = (e) => `${e.date} ${e.time || "00:00"}`;
export const emptyMonth = () => ({ incomes: [], expenses: [], applied: {} });
export const daysIn = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};
export const shortMonth = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
};
export const monthsBack = (key, n) => Array.from({ length: n }, (_, i) => shiftMonth(key, -(n - 1 - i)));

/* cada cuánto se repite un fijo */
export const monthsDiff = (from, to) => {
  const [ay, am] = from.split("-").map(Number);
  const [by, bm] = to.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
};
export const dueIn = (r, key) =>
  r.active !== false && r.since <= key && monthsDiff(r.since, key) % (r.every || 1) === 0;
export const nextDue = (r, fromKey) => {
  let k = r.since > fromKey ? r.since : fromKey;
  for (let i = 0; i < 24; i++) {
    if (dueIn(r, k)) return k;
    k = shiftMonth(k, 1);
  }
  return null;
};
export const freqLabel = (r) => (FREQS.find((f) => f.every === (r.every || 1)) || FREQS[0]).short;


const pad2 = (n) => String(n).padStart(2, "0");
const isoLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/* ── ciclo de nómina: dado un día de cobro, calcula el ciclo que contiene "hoy" ──
   No toca cómo se guardan los datos — es solo una ventana [inicio, fin] en fechas ISO,
   que puede cruzar dos meses de calendario distintos. */
export function cicloDePago(diaCobro, hoy = new Date()) {
  let y = hoy.getFullYear(), m = hoy.getMonth();
  if (hoy.getDate() < diaCobro) { m -= 1; if (m < 0) { m = 11; y -= 1; } }
  const diasEsteMes = new Date(y, m + 1, 0).getDate();
  const inicio = new Date(y, m, Math.min(diaCobro, diasEsteMes));
  let y2 = y, m2 = m + 1;
  if (m2 > 11) { m2 = 0; y2 += 1; }
  const diasSigMes = new Date(y2, m2 + 1, 0).getDate();
  const finExclusivo = new Date(y2, m2, Math.min(diaCobro, diasSigMes));
  const fin = new Date(finExclusivo.getTime() - 86400000);
  return { inicio: isoLocal(inicio), fin: isoLocal(fin) };
}
