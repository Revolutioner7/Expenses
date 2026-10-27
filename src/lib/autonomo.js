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
