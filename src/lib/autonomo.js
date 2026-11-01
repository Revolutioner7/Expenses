/* ── Soy autónomo: reserva de impuestos ──
   Reglas de 2026 (fuentes en HANDOFF §19). Es una reserva prudente, no la liquidación:
   la cifra final la da la gestoría. Todo lo que sale de aquí es editable desde Ajustes. */

export const IVA_GENERAL = 21;
export const IRPF_PAGO_FRACCIONADO = 20;   // modelo 130: 20 % del rendimiento neto
export const RETENCION_GENERAL = 15;       // la que aplica un cliente empresa en la factura
export const RETENCION_NUEVOS = 7;         // los tres primeros años de actividad
export const UMBRAL_POR_DEFECTO = 2000;    // solo los ingresos por encima activan el reparto

/* cuota de la Seguridad Social: tarifa plana más los 15 tramos de 2026 (cuota mínima de cada tramo) */
export const CUOTAS = [
  { id: "plana", label: "Tarifa plana", detalle: "primer año (prorrogable)", cuota: 80, desde: 0, hasta: Infinity },
  { id: "t01", desde: 0, hasta: 670, cuota: 205 },
  { id: "t02", desde: 670, hasta: 900, cuota: 226 },
  { id: "t03", desde: 900, hasta: 1166.7, cuota: 267 },
  { id: "t04", desde: 1166.7, hasta: 1300, cuota: 299 },
  { id: "t05", desde: 1300, hasta: 1500, cuota: 302 },
  { id: "t06", desde: 1500, hasta: 1700, cuota: 302 },
  { id: "t07", desde: 1700, hasta: 1850, cuota: 360 },
  { id: "t08", desde: 1850, hasta: 2030, cuota: 380 },
  { id: "t09", desde: 2030, hasta: 2330, cuota: 401 },
  { id: "t10", desde: 2330, hasta: 2760, cuota: 427 },
  { id: "t11", desde: 2760, hasta: 3190, cuota: 452 },
  { id: "t12", desde: 3190, hasta: 3620, cuota: 478 },
  { id: "t13", desde: 3620, hasta: 4050, cuota: 504 },
  { id: "t14", desde: 4050, hasta: 6000, cuota: 545 },
  { id: "t15", desde: 6000, hasta: Infinity, cuota: 607 },
].map((t) => ({
  ...t,
  label: t.label || (t.hasta === Infinity ? `${fmt(t.desde)} € o más` : t.desde === 0 ? `Hasta ${fmt(t.hasta)} €` : `De ${fmt(t.desde)} a ${fmt(t.hasta)} €`),
  detalle: t.detalle || "rendimiento neto al mes",
}));

function fmt(n) {
  return new Intl.NumberFormat("es-ES", { useGrouping: true, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
}

export const cuotaPorId = (id) => CUOTAS.find((c) => c.id === id) || null;

/* el tramo que corresponde a un rendimiento neto mensual (nunca la tarifa plana: esa se elige a mano) */
export function tramoPara(rendimientoMensual) {
  const r = Math.max(0, rendimientoMensual || 0);
  return CUOTAS.find((c) => c.id !== "plana" && r >= c.desde && r < c.hasta) || CUOTAS[CUOTAS.length - 1];
}

/* texto con el que se filtra en el desplegable: "80", "plana", "1.300", "302"… */
export function coincideCuota(c, texto) {
  const t = (texto || "").trim().toLowerCase();
  if (!t) return true;
  const esNumero = /^[\d.,]+$/.test(t);
  if (esNumero) {
    // un número coincide por el principio de cualquier cifra de la opción: "80" encuentra 80, no 380
    const q = t.replace(/\./g, "").replace(",", ".");
    const cifras = [c.cuota, c.desde, c.hasta].filter((n) => Number.isFinite(n)).map((n) => String(n));
    return cifras.some((n) => n.startsWith(q));
  }
  return `${c.label} ${c.detalle}`.toLowerCase().includes(t);
}

/* porcentajes por defecto a partir de las respuestas. Todos editables después. */
export function porcentajesPorDefecto({ clientesEspana, retencion, nuevoAutonomo }) {
  const ivaPct = clientesEspana ? IVA_GENERAL : 0;
  const retPct = clientesEspana && retencion ? (nuevoAutonomo ? RETENCION_NUEVOS : RETENCION_GENERAL) : 0;
  const irpfPct = Math.max(0, IRPF_PAGO_FRACCIONADO - retPct);
  return { ivaPct, irpfPct, retPct };
}

export function configPorDefecto() {
  return {
    activo: false,
    clientesEspana: false,
    retencion: false,
    nuevoAutonomo: false,
    ivaPct: 0,
    irpfPct: IRPF_PAGO_FRACCIONADO,
    umbral: UMBRAL_POR_DEFECTO,
    cuotaId: null,
    cuotaFijoId: null,
    gestoria: 0,
    gestoriaFijoId: null,
    rentaPct: null,        // null = propuesto según ingresos (rentaPropuesta)
    colchonPct: 0,
  };
}

/* reparto de un ingreso. Si lleva IVA, el importe recibido lo incluye: se separa primero.
   Devuelve null si el ingreso no supera el umbral. */
export function repartoIngreso(amount, cfg) {
  if (!cfg?.activo) return null;
  const umbral = cfg.umbral ?? UMBRAL_POR_DEFECTO;
  if (!(amount >= umbral)) return null;
  const ivaPct = cfg.ivaPct || 0;
  const base = ivaPct > 0 ? amount / (1 + ivaPct / 100) : amount;
  const iva = amount - base;
  const irpf = base * ((cfg.irpfPct || 0) / 100);
  const impuestos = iva + irpf;
  return { base, iva, irpf, impuestos, tuyo: amount - impuestos };
}

/* trimestre fiscal de una fecha ISO y su próxima fecha de pago (día 20 del mes siguiente;
   el 4T se paga en enero, y el 130 del 4T también, aunque la renta anual vaya aparte) */
export function trimestreDe(iso) {
  const [y, m] = iso.split("-").map(Number);
  const q = Math.floor((m - 1) / 3); // 0..3
  const meses = [[1, 3], [4, 6], [7, 9], [10, 12]][q];
  const pagoAnio = q === 3 ? y + 1 : y;
  const pagoMes = q === 3 ? 1 : meses[1] + 1;
  return {
    etiqueta: `${q + 1}T ${y}`,
    desde: `${y}-${String(meses[0]).padStart(2, "0")}-01`,
    hasta: `${y}-${String(meses[1]).padStart(2, "0")}-31`,
    pago: `${pagoAnio}-${String(pagoMes).padStart(2, "0")}-20`,
  };
}

/* resumen del trimestre en curso: ingresos sobre el umbral y lo reservado */
export function resumenTrimestre(months, cfg, hoyISO) {
  const tri = trimestreDe(hoyISO);
  const filas = [];
  for (const mk of Object.keys(months || {})) {
    if (mk < tri.desde.slice(0, 7) || mk > tri.hasta.slice(0, 7)) continue;
    for (const inc of months[mk].incomes || []) {
      const r = repartoIngreso(inc.amount, cfg);
      if (r) filas.push({ ...inc, reparto: r });
    }
  }
  filas.sort((a, b) => (a.date < b.date ? 1 : -1));
  const tot = filas.reduce((s, f) => ({ iva: s.iva + f.reparto.iva, irpf: s.irpf + f.reparto.irpf, impuestos: s.impuestos + f.reparto.impuestos, ingresado: s.ingresado + f.amount }),
    { iva: 0, irpf: 0, impuestos: 0, ingresado: 0 });
  const [py, pm, pd] = tri.pago.split("-").map(Number);
  const [hy, hm, hd] = hoyISO.split("-").map(Number);
  const dias = Math.round((Date.UTC(py, pm - 1, pd) - Date.UTC(hy, hm - 1, hd)) / 86400000);
  return { ...tri, filas, ...tot, diasHastaPago: dias };
}

/* media de ingresos mensuales de los últimos n meses cerrados, para proponer tramo */
export function mediaIngresosMensual(months, hoyISO, n = 3) {
  const claves = Object.keys(months || {}).filter((k) => k < hoyISO.slice(0, 7)).sort().slice(-n);
  if (claves.length === 0) return 0;
  const total = claves.reduce((s, k) => s + (months[k].incomes || []).reduce((a, i) => a + i.amount, 0), 0);
  return total / claves.length;
}

/* ── Del reparto a Metas ──
   Cada ingreso de autónomo puede sumar a tres metas, todas con su categoría propia (regla de
   Metas: nunca compartida):
   - "Impuestos 4T 2026": una sola por trimestre, fecha límite el día del pago. IVA + reserva IRPF.
   - "Renta 2026": una por año, fecha límite el 30 de junio del año siguiente. El 130 adelanta un
     20 %; con ingresos altos la renta final es mayor y la diferencia se paga de golpe en junio.
   - "Colchón de autónomo": sin fecha, opcional (vacaciones, bajas, meses flojos).
   La cuota de autónomo y la gestoría no van aquí: ya son fijos. Cada meta guarda qué ingreso
   aportó cuánto (aportes), para poder deshacerlo si el ingreso se borra o cambia. */

/* puntos de IRPF que faltan sobre el 20 % del 130, según lo que se factura al año (base sin IVA).
   Estimación prudente con la escala estatal + autonómica media de 2026; editable en Ajustes. */
export function rentaPropuesta(anualBase) {
  const a = Math.max(0, anualBase || 0);
  if (a < 30000) return 0;
  if (a < 45000) return 4;
  if (a < 70000) return 9;
  if (a < 100000) return 12;
  return 15;
}

export const rentaPctDe = (cfg, mediaMensual, baseIngreso) =>
  cfg?.rentaPct != null && cfg.rentaPct !== "" ? Number(cfg.rentaPct) || 0
    : rentaPropuesta((mediaMensual > 0 ? mediaMensual : baseIngreso || 0) * 12);

/* meses que quedan hasta una fecha ISO (mínimo 1) */
export function mesesHasta(hoyISO, fechaISO) {
  const [hy, hm] = hoyISO.split("-").map(Number);
  const [fy, fm] = fechaISO.split("-").map(Number);
  return Math.max(1, (fy - hy) * 12 + (fm - hm));
}

/* lo que un ingreso debería sumar a cada meta. [] si no supera el umbral o no hay nada que apartar. */
export function partesParaMetas(inc, cfg, mediaMensual = 0) {
  const r = repartoIngreso(inc?.amount, cfg);
  if (!r) return [];
  const tri = trimestreDe(inc.date);
  const anio = Number(inc.date.slice(0, 4));
  const q = tri.etiqueta.split(" ")[0];
  const redondo = (n) => Math.round(n * 100) / 100;
  const partes = [
    { clave: `trim-${anio}-${q}`, nombre: `Impuestos ${tri.etiqueta}`, importe: redondo(r.impuestos), fechaLimite: tri.pago, emoji: "🧾" },
    { clave: `renta-${anio}`, nombre: `Renta ${anio}`, importe: redondo(r.base * rentaPctDe(cfg, mediaMensual, r.base) / 100), fechaLimite: `${anio + 1}-06-30`, emoji: "🧾" },
    { clave: "colchon", nombre: "Colchón de autónomo", importe: redondo(r.base * (Number(cfg.colchonPct) || 0) / 100), fechaLimite: null, emoji: "🛟" },
  ];
  return partes.filter((p) => p.importe > 0);
}

export const ingresoEnMetas = (metas, incomeId) => (metas || []).some((m) => (m.aportes || []).some((a) => a.incomeId === incomeId));

/* quita lo que aportó un ingreso. Una meta que se queda sin aportes y sin nada ahorrado
   en su categoría desaparece (con su categoría); si ya tiene dinero, se queda. */
export function quitarIngresoDeMetas(d, incomeId) {
  let categories = d.categories;
  const metas = [];
  for (const m of d.metas || []) {
    const mio = (m.aportes || []).find((a) => a.incomeId === incomeId);
    if (!m.autonomo || !mio) { metas.push(m); continue; }
    const aportes = m.aportes.filter((a) => a.incomeId !== incomeId);
    const conDinero = Object.values(d.months || {}).some((mes) => (mes.expenses || []).some((e) => e.categoryId === m.categoryId));
    if (aportes.length === 0 && !conDinero) {
      categories = categories.filter((c) => c.id !== m.categoryId);
      continue;
    }
    metas.push({ ...m, aportes, total: Math.max(0, Math.round((m.total - mio.importe) * 100) / 100) });
  }
  return { ...d, metas, categories };
}

/* suma las partes de un ingreso a sus metas, creándolas si hace falta. Si el ingreso ya había
   aportado, se sustituye (no se cuenta dos veces). nuevoId genera ids. */
export function aplicarIngresoAMetas(d, incomeId, partes, hoyISO, nuevoId) {
  let out = quitarIngresoDeMetas(d, incomeId);
  let metas = [...(out.metas || [])];
  let categories = [...out.categories];
  for (const p of partes) {
    const i = metas.findIndex((m) => m.autonomo?.clave === p.clave);
    const plazoMeses = p.fechaLimite ? mesesHasta(hoyISO, p.fechaLimite) : null;
    if (i >= 0) {
      const m = metas[i];
      metas[i] = { ...m, total: Math.round((m.total + p.importe) * 100) / 100, plazoMeses: p.fechaLimite ? plazoMeses : m.plazoMeses,
        aportes: [...(m.aportes || []), { incomeId, importe: p.importe }] };
      continue;
    }
    const categoryId = nuevoId();
    categories.push({ id: categoryId, name: p.nombre, emoji: p.emoji, color: "#D99A2B", bucket: "ahorro", budget: null });
    metas.push({
      id: nuevoId(), tipo: "objetivo", name: p.nombre, total: p.importe, categoryId, plazoMeses,
      recortesPendientes: [], creadoEl: hoyISO, repiteCada: null, cicloDesde: null,
      fechaLimite: p.fechaLimite, autonomo: { clave: p.clave }, aportes: [{ incomeId, importe: p.importe }],
    });
  }
  return { ...out, metas, categories };
}
