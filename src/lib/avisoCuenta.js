/* ── Fase 4: aviso a quien no tiene cuenta ──
   Decisión de Rodrigo (Notion, "Diseño: cuentas de usuario"): a los 7 días de uso o a los 20
   gastos anotados, lo que llegue antes, y después cada mes mientras no cree la cuenta.
   En la web es una tarjeta dentro de la app; en el iPhone, además, una notificación local
   (la programa el propio teléfono, sin servidor). */

export const DIAS_PRIMER_AVISO = 7;
export const GASTOS_PRIMER_AVISO = 20;
export const DIAS_ENTRE_AVISOS = 30;
export const TEXTO_AVISO = "Tus gastos viven solo en este móvil. Si se te cae al agua, se van con él. Crea una cuenta y quedan a salvo.";

const dia = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const masDias = (iso, n) => new Date((dia(iso) + n) * 86400000).toISOString().slice(0, 10);

/* primer día con algo anotado (gasto o ingreso); null si no hay nada */
export function primerUso(data) {
  let min = null;
  for (const m of Object.values(data?.months || {})) {
    for (const x of [...(m.expenses || []), ...(m.incomes || [])]) {
      if (x?.date && (!min || x.date < min)) min = x.date;
    }
  }
  return min;
}

export const contarGastos = (data) =>
  Object.values(data?.months || {}).reduce((s, m) => s + (m.expenses || []).filter((e) => !e.fixed).length, 0);

/* fecha (ISO) a partir de la cual toca enseñar el aviso; null si no toca nunca (tiene cuenta o nada anotado) */
export function fechaAviso(data) {
  if (!data || data._cuenta) return null;
  if (data.avisoSinCuenta) return masDias(data.avisoSinCuenta, DIAS_ENTRE_AVISOS);
  const inicio = primerUso(data);
  if (!inicio) return null;
  const porDias = masDias(inicio, DIAS_PRIMER_AVISO);
  if (contarGastos(data) >= GASTOS_PRIMER_AVISO) return inicio < porDias ? inicio : porDias;
  return porDias;
}

export function tocaAviso(data, hoyISO) {
  const f = fechaAviso(data);
  return !!f && f <= hoyISO;
}
