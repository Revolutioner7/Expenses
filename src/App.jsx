import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { STORE_KEY, ONBOARD_KEY, WORKER_URL, APP_VERSION, APP_NAME, BUCKETS, DEFAULT_CATEGORIES, DEFAULT_BANCOS } from "./constants.js";
import { store } from "./lib/storage.js";
import {
  cryptoOk, bioDisponible, kekFromPass, kekFromBytes, newDEK, wrapDEK, unwrapDEK,
  sealData, openData, esSobre, tieneBio, prfCrear, prfObtener, ITER, b64, unb64,
} from "./lib/crypto.js";
import {
  fuzzyMatch, learnFrom, uid, eur, monthKeyOf, todayISO, monthLabel, shiftMonth,
  dayLabel, shortDate, stampLabel, sortKey, emptyMonth, daysIn, shortMonth, monthsBack, dueIn, nextDue, freqLabel, cicloDePago, mesEfectivo,
} from "./lib/utils.js";
import { autoApplyAll, migrate } from "./lib/data.js";
import { crearCopia, compartirApp, leerCopia } from "./lib/backup.js";

import { EyeIcon, ExpandableList, CoachBox, AvisoActualizacionCard, AvisoGastosPeriodicosCard, AjusteSaldoCard, MetaRow, BancoPicker, FormaPagoToggle, GrupoAjustes, Sheet, BulkFormaPagoPicker, BulkFechaHoraPicker, SwipeableRow, CatMark, MenuOrdenar, MenuFiltrar } from "./components/ui.jsx";
import { CategoryEditor, MetaEditor, ExpenseEditor, IncomeEditor, FixedEditor } from "./components/editors.jsx";
import { AddExpense, IncomeCard, Donut, CategoryDetail } from "./components/mes.jsx";
import { MonthCompare, Split503020, Forecast } from "./components/resumen.jsx";
import { isAppInstalled, Onboarding } from "./components/onboarding.jsx";
import { LockScreen, SecuritySheet } from "./components/lock.jsx";

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [monthKey, setMonthKey] = useState(monthKeyOf(new Date()));
  const [tab, setTab] = useState("gastos");
  const [sheet, setSheet] = useState(null); // {type:'cat'|'expense', payload}
  const firstSave = useRef(true);
  const timer = useRef(null);
  const [locked, setLocked] = useState(false);
  const [protegido, setProtegido] = useState(false);
  const envRef = useRef(null);      // sobre cifrado leído del disco
  const dekRef = useRef(null);      // clave de datos, solo en memoria
  const metaRef = useRef(null);     // { iter, salt, wrapped } del sobre
  const hiddenAt = useRef(0);
  const [bioOn, setBioOn] = useState(false);
  const [bioAvail, setBioAvail] = useState(false);
  useEffect(() => { bioDisponible().then(setBioAvail); }, []);

  /* ── onboarding: primer arranque, antes de tocar los datos ──
     Importante: si YA hay datos guardados (con o sin contraseña), quien actualiza desde una
     versión anterior a esta nunca debe ver el onboarding, aunque ONBOARD_KEY no exista todavía
     (es una clave nueva). Por eso esta comprobación vive en el mismo efecto que lee STORE_KEY,
     no en uno aparte. */
  const [onboard, setOnboard] = useState({ status: "loading" }); // 'loading' | 'install' | 'consent' | 'done'
  const installIdRef = useRef(null);
  const [avisoActualizacion, setAvisoActualizacion] = useState(false); // solo para quien ya tenía datos

  const registrarEnWorker = (id, email) => {
    if (WORKER_URL.includes("REEMPLAZA-ESTO")) return;
    fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, email: email || undefined }),
    }).catch(() => {});
  };

  const cerrarAvisoActualizacion = async (email) => {
    setAvisoActualizacion(false);
    try {
      const raw = await store.get(ONBOARD_KEY);
      const actual = raw ? JSON.parse(raw) : {};
      await store.set(ONBOARD_KEY, JSON.stringify({ ...actual, avisoActualizacionVisto: true, email: email || actual.email || null }));
    } catch (e) { /* no bloquea el uso de la app */ }
    if (email) registrarEnWorker(installIdRef.current, email);
  };

  /* aviso, una sola vez, para cuentas que ya existían antes de esta función y nunca pasaron
     por la pregunta del registro */
  const avisoGastosPeriodicos = data?.gastosPeriodicosActivado == null && !data?.avisoGastosPeriodicosVisto;
  const cerrarAvisoGastosPeriodicos = () => setData((d) => ({ ...d, avisoGastosPeriodicosVisto: true }));

  const finishOnboarding = async (email, pagoElegido, heroModoElegido, gastosPeriodicosElegido, diferenciarPagoElegido) => {
    const instalado = isAppInstalled();
    const installId = uid() + uid();
    const payload = { done: true, installId, email: email || null, instaladaAlAceptar: instalado, avisoActualizacionVisto: true };
    try { await store.set(ONBOARD_KEY, JSON.stringify(payload)); } catch (e) { /* no bloquea el uso de la app */ }
    installIdRef.current = installId;
    setOnboard({ status: "done" });
    if (pagoElegido?.formaPago || heroModoElegido || gastosPeriodicosElegido !== null || diferenciarPagoElegido !== null) {
      setData((d) => ({
        ...d,
        ...(pagoElegido?.formaPago ? { formaPagoDefecto: pagoElegido.formaPago, bancoDefectoId: pagoElegido.bancoId || null } : {}),
        ...(heroModoElegido ? { heroModo: heroModoElegido } : {}),
        ...(gastosPeriodicosElegido !== null ? { gastosPeriodicosActivado: gastosPeriodicosElegido, avisoGastosPeriodicosVisto: true } : {}),
        ...(diferenciarPagoElegido !== null ? { formaPagoActivada: diferenciarPagoElegido } : {}),
      }));
    }
    // registro inicial en el Worker (id + email si se dio) — una sola vez, aquí; los desbloqueos
    // siguientes solo mandan el id, no hace falta repetir el email cada vez
    registrarEnWorker(installId, email);
  };

  /* señal anónima: "sigo aquí", sin contraseña ni datos, cada vez que se desbloquea o se abre sin protección */
  useEffect(() => {
    if (onboard.status !== "done" || locked) return;
    if (WORKER_URL.includes("REEMPLAZA-ESTO")) return; // Worker aún no desplegado: no hacer nada
    const id = installIdRef.current;
    if (!id) return;
    fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {}); // sin conexión no debe romper nada
  }, [onboard.status, locked]);

  useEffect(() => {
    (async () => {
      const raw = await store.get(STORE_KEY);
      let parsed = null;
      if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }

      // ¿ya hay datos de alguna versión anterior? entonces el onboarding se da por hecho, siempre
      const yaHabiaDatos = esSobre(parsed) || !!(parsed && parsed.categories);
      if (yaHabiaDatos) {
        setOnboard({ status: "done" });
        // quien ya tenía datos nunca pasó por finishOnboarding: le generamos el id en silencio
        // (sin pedir nada) y, si no ha visto el aviso de esta actualización, se lo enseñamos
        // como una tarjeta en Mes, sin bloquear nada.
        try {
          const rawOnboard = await store.get(ONBOARD_KEY);
          const parsedOnboard = rawOnboard ? JSON.parse(rawOnboard) : null;
          if (parsedOnboard?.installId) {
            installIdRef.current = parsedOnboard.installId;
            if (!parsedOnboard.avisoActualizacionVisto) setAvisoActualizacion(true);
          } else {
            const installId = uid() + uid();
            installIdRef.current = installId;
            await store.set(ONBOARD_KEY, JSON.stringify({ done: true, installId, email: null, avisoActualizacionVisto: false }));
            setAvisoActualizacion(true);
          }
        } catch (e) { /* si falla, simplemente no se muestra el aviso ni se cuenta esta vez */ }
      } else {
        try {
          const rawOnboard = await store.get(ONBOARD_KEY);
          const parsedOnboard = rawOnboard ? JSON.parse(rawOnboard) : null;
          if (parsedOnboard?.done) {
            installIdRef.current = parsedOnboard.installId || null;
            setOnboard({ status: "done" });
          } else {
            setOnboard({ status: isAppInstalled() ? "consent" : "install" });
          }
        } catch (e) {
          setOnboard({ status: isAppInstalled() ? "consent" : "install" });
        }
      }

      if (esSobre(parsed)) {
        envRef.current = parsed;
        setProtegido(true);
        setLocked(true);
        setLoading(false);
        return;
      }
      if (parsed && parsed.categories) {
        const migrado = migrate(parsed);
        const conFijos = autoApplyAll(migrado);
        if (conFijos !== migrado) firstSave.current = false; // hay fijos nuevos que guardar ya
        setData(conFijos);
      } else {
        setData({ version: 8, categories: DEFAULT_CATEGORIES, months: {}, learned: {}, recurring: [], bancos: DEFAULT_BANCOS, formaPagoDefecto: null, bancoDefectoId: null });
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!data) return;
    if (firstSave.current) { firstSave.current = false; return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const payload = dekRef.current
          ? await sealData(data, dekRef.current, metaRef.current)
          : JSON.stringify(data);
        await store.set(STORE_KEY, payload);
      } catch (e) { console.error("no se pudo guardar", e); }
    }, 400);
    return () => clearTimeout(timer.current);
  }, [data]);

  const month = data?.months?.[monthKey] || emptyMonth();
  const categories = data?.categories || [];
  const catById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);

  /* las que más usas, primero */
  const chipOrder = useMemo(() => {
    const use = {};
    for (const m of Object.values(data?.months || {})) {
      for (const e of m.expenses || []) use[e.categoryId] = (use[e.categoryId] || 0) + 1;
    }
    return categories
      .map((c, i) => ({ c, i, n: use[c.id] || 0 }))
      .sort((a, b) => b.n - a.n || a.i - b.i)
      .map((x) => x.c);
  }, [data, categories]);

  const income = month.incomes.reduce((s, i) => s + i.amount, 0);
  const isSaving = (e) => catById[e.categoryId]?.bucket === "ahorro";
  const saved = month.expenses.filter(isSaving).reduce((s, e) => s + e.amount, 0);
  const spent = month.expenses.filter((e) => !isSaving(e)).reduce((s, e) => s + e.amount, 0);
  const spentFijo = month.expenses.filter((e) => !isSaving(e) && e.fixed).reduce((s, e) => s + e.amount, 0);
  const spentVariable = spent - spentFijo;
  const used = spent + saved;
  const ajuste = month.ajuste || null; // corrige solo el disponible final; nunca gasto/ahorro/categorías
  const leftSinAjuste = income - used;
  const left = leftSinAjuste + (ajuste?.valor || 0);
  const negativoPorAjuste = (ajuste?.valor || 0) < 0 && leftSinAjuste >= 0 && left < 0;
  const saveAjuste = (nuevoAjuste) => setData((d) => {
    const cur = d.months[monthKey] || emptyMonth();
    return { ...d, months: { ...d.months, [monthKey]: { ...cur, ajuste: nuevoAjuste } } };
  });

  /* totales por categoría: el ahorro va aparte del gasto */
  const [filtroCategoria, setFiltroCategoria] = useState("todos"); // 'todos' | 'variables' | 'fijos'
  const catTotals = useMemo(() => {
    const m = {};
    const lista = filtroCategoria === "fijos" ? month.expenses.filter((e) => e.fixed)
      : filtroCategoria === "variables" ? month.expenses.filter((e) => !e.fixed)
      : month.expenses;
    for (const e of lista) m[e.categoryId] = (m[e.categoryId] || 0) + e.amount;
    return categories
      .map((c) => ({ ...c, total: m[c.id] || 0 }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [month.expenses, categories, filtroCategoria]);
  const byCategory = catTotals.filter((c) => c.bucket !== "ahorro");
  const savingCats = catTotals.filter((c) => c.bucket === "ahorro");

  const mutMonth = useCallback((fn) => {
    setData((d) => {
      const cur = d.months[monthKey] || emptyMonth();
      return { ...d, months: { ...d.months, [monthKey]: fn(cur) } };
    });
  }, [monthKey]);

  const addExpense = (exp) => {
    setData((d) => {
      const target = exp.date.slice(0, 7);
      const cur = d.months[target] || emptyMonth();
      return {
        ...d,
        learned: learnFrom(d.learned, exp.name, exp.categoryId),
        months: { ...d.months, [target]: { ...cur, expenses: [...cur.expenses, exp] } },
      };
    });
  };
  const updateExpense = (exp) => {
    setData((d) => {
      const target = exp.date.slice(0, 7); // si cambias la fecha, el gasto cambia de mes
      const months = {};
      for (const [k, m] of Object.entries(d.months)) {
        months[k] = { ...m, expenses: m.expenses.filter((x) => x.id !== exp.id) };
      }
      const cur = months[target] || emptyMonth();
      months[target] = { ...cur, expenses: [...cur.expenses, exp] };
      return { ...d, learned: learnFrom(d.learned, exp.name, exp.categoryId), months };
    });
  };
  const deleteExpense = (id) => setData((d) => {
    const months = {};
    for (const [k, m] of Object.entries(d.months)) {
      months[k] = { ...m, expenses: m.expenses.filter((x) => x.id !== id) };
    }
    return { ...d, months };
  });
  const addIncome = (inc) => mutMonth((m) => ({ ...m, incomes: [...m.incomes, inc] }));
  const updateIncome = (inc) => setData((d) => {
    const target = inc.date.slice(0, 7); // si cambias la fecha, se muda de mes
    const months = {};
    for (const [k, m] of Object.entries(d.months)) {
      months[k] = { ...m, incomes: m.incomes.filter((x) => x.id !== inc.id) };
    }
    const cur = months[target] || emptyMonth();
    months[target] = { ...cur, incomes: [...cur.incomes, inc] };
    return { ...d, months };
  });
  const removeIncome = (id) => setData((d) => {
    const months = {};
    for (const [k, m] of Object.entries(d.months)) {
      months[k] = { ...m, incomes: m.incomes.filter((x) => x.id !== id) };
    }
    return { ...d, months };
  });

  const oculto = !!data?.hideBalance;
  const toggleOculto = () => setData((d) => ({ ...d, hideBalance: !d.hideBalance }));

  const modoCoach = data?.modoCoach !== false; // por defecto activado
  const setModoCoach = (v) => setData((d) => ({ ...d, modoCoach: v }));

  const [lastNewCat, setLastNewCat] = useState(null);
  const saveCategory = (cat) => setData((d) => {
    const exists = d.categories.some((c) => c.id === cat.id);
    if (!exists) setLastNewCat(cat.id);
    return { ...d, categories: exists ? d.categories.map((c) => (c.id === cat.id ? cat : c)) : [...d.categories, cat] };
  });

  /* ── bancos: solo una etiqueta en cada gasto, nunca toca ningún cálculo ── */
  const bancos = data?.bancos || [];
  const bancoById = useMemo(() => Object.fromEntries(bancos.map((b) => [b.id, b])), [bancos]);
  const saveBanco = (banco) => setData((d) => {
    const actuales = d.bancos || [];
    const exists = actuales.some((b) => b.id === banco.id);
    return { ...d, bancos: exists ? actuales.map((b) => (b.id === banco.id ? banco : b)) : [...actuales, banco] };
  });
  const deleteBanco = (id) => setData((d) => ({ ...d, bancos: (d.bancos || []).filter((b) => b.id !== id) }));

  /* ── uso real de cada forma de pago, en todo el historial — para saber cuál es "la más usada" ── */
  const usoFormaPago = useMemo(() => {
    const conteo = { efectivo: 0, bizum: 0, banco: 0, domiciliado: 0 };
    const porBanco = {}; // tarjeta + domiciliado combinados, para el "más usado" del buscador de bancos
    for (const m of Object.values(data?.months || {})) {
      for (const e of m.expenses || []) {
        if (e.formaPago === "efectivo") conteo.efectivo++;
        else if (e.formaPago === "bizum") conteo.bizum++;
        else if (e.formaPago === "banco" && e.bancoId) { conteo.banco++; porBanco[e.bancoId] = (porBanco[e.bancoId] || 0) + 1; }
        else if (e.formaPago === "domiciliado" && e.bancoId) { conteo.domiciliado++; porBanco[e.bancoId] = (porBanco[e.bancoId] || 0) + 1; }
      }
    }
    let masUsadoBancoId = null, maxBanco = 0;
    for (const [id, n] of Object.entries(porBanco)) if (n > maxBanco) { maxBanco = n; masUsadoBancoId = id; }

    let masUsadaGlobal = null, max = 0;
    if (conteo.efectivo > max) { max = conteo.efectivo; masUsadaGlobal = { formaPago: "efectivo", bancoId: null }; }
    if (conteo.bizum > max) { max = conteo.bizum; masUsadaGlobal = { formaPago: "bizum", bancoId: null }; }
    if (conteo.banco > max) { max = conteo.banco; masUsadaGlobal = { formaPago: "banco", bancoId: masUsadoBancoId }; }
    if (conteo.domiciliado > max) { max = conteo.domiciliado; masUsadaGlobal = { formaPago: "domiciliado", bancoId: masUsadoBancoId }; }

    return { efectivo: conteo.efectivo, porBanco, masUsadoBancoId, masUsadaGlobal };
  }, [data?.months]);

  /* la que de verdad se marca por defecto en un gasto nuevo: lo fijado a mano en Ajustes
     gana siempre; si no hay nada fijado, la más usada según el historial; si no hay ni una
     cosa ni otra, no se marca nada */
  const formaPagoPorDefecto = useMemo(() => {
    if (data?.formaPagoDefecto === "efectivo") return { formaPago: "efectivo", bancoId: null };
    if (data?.formaPagoDefecto === "banco" && data?.bancoDefectoId) return { formaPago: "banco", bancoId: data.bancoDefectoId };
    return usoFormaPago.masUsadaGlobal;
  }, [data?.formaPagoDefecto, data?.bancoDefectoId, usoFormaPago]);

  const heroModo = data?.heroModo === "gastado" ? "gastado" : "disponible";

  /* ── metas: objetivos de ahorro y deudas ── */
  const metas = data?.metas || [];
  const saveMeta = (meta, categoriaNueva) => setData((d) => {
    const exists = (d.metas || []).some((m) => m.id === meta.id);
    const metas = exists ? (d.metas || []).map((m) => (m.id === meta.id ? meta : m)) : [...(d.metas || []), meta];
    const categories = categoriaNueva ? [...d.categories, categoriaNueva] : d.categories;
    return { ...d, metas, categories };
  });
  /* categoría única y compartida "Gastos periódicos" — id fijo, para poder reconocerla siempre,
     se cree cuando se cree (a diferencia del diseño anterior, que creaba una categoría nueva
     por cada fijo periódico) */
  const CAT_GASTOS_PERIODICOS = "gastos-periodicos-compartida";
  const asegurarCategoriaGastosPeriodicos = (d) => {
    if ((d.categories || []).some((c) => c.id === CAT_GASTOS_PERIODICOS)) return d.categories;
    return [...d.categories, { id: CAT_GASTOS_PERIODICOS, name: "Gastos periódicos", emoji: "🗓️", color: "#4A9BC9", bucket: "ahorro" }];
  };
  /* mini-meta enlazada a un fijo periódico (>1 mes): todas comparten la misma categoría de
     ahorro ("Gastos periódicos"); un solo gasto anotado ahí se reparte solo entre todas según
     lo que necesita cada una (ver metaProgreso). cicloDesde sigue siendo por meta, para que el
     reinicio de una al cobrarse su fijo no afecte a las demás. */
  const crearMiniMeta = (fijo) => {
    setData((d) => {
      const categories = asegurarCategoriaGastosPeriodicos(d);
      const meta = {
        id: uid(), tipo: "objetivo", name: fijo.name, total: fijo.amount, plazoMeses: fijo.every,
        categoryId: CAT_GASTOS_PERIODICOS, fijoId: fijo.id, cicloDesde: todayISO(), recortesPendientes: [],
      };
      const metas = [...(d.metas || []), meta];
      return { ...d, categories, metas };
    });
  };
  const deleteMeta = (id) => setData((d) => {
    const metas = (d.metas || []).filter((m) => m.id !== id);
    // la categoría compartida se queda (la usan las demás mini-metas y los gastos ya anotados)
    return { ...d, metas };
  });
  const toggleRecorte = (metaId, categoryId) => setData((d) => ({
    ...d,
    metas: (d.metas || []).map((m) => m.id !== metaId ? m : {
      ...m,
      recortesPendientes: (m.recortesPendientes || []).map((r) => r.categoryId === categoryId ? { ...r, hecho: !r.hecho } : r),
    }),
  }));

  /* progreso de cada meta:
     - metas normales: suma de todos los gastos, en todos los meses, en su categoría dedicada.
     - mini-metas periódicas (con fijoId): comparten TODAS la misma categoría "Gastos
       periódicos" — un euro anotado ahí no es "de una", es de todas a la vez, repartido según
       lo que necesita cada una en proporción a las demás. Se calcula en vivo, no se guarda
       congelado — si añades un fijo periódico nuevo mañana, el reparto de lo ya aportado se
       ajusta solo, porque siempre se recalcula con las cuotas de HOY. */
  const metaProgreso = useMemo(() => {
    const out = {};
    const periodicas = metas.filter((m) => m.fijoId);
    const sumaCuotas = periodicas.reduce((s, m) => s + (m.plazoMeses > 0 ? m.total / m.plazoMeses : 0), 0);
    for (const m of metas) {
      if (m.fijoId) {
        // proporcional: mi cuota / suma de todas las cuotas, aplicado a lo aportado desde MI reinicio
        let totalCompartido = 0;
        for (const mes of Object.values(data?.months || {})) {
          for (const e of mes.expenses || []) {
            if (e.categoryId !== CAT_GASTOS_PERIODICOS) continue;
            if (m.cicloDesde && e.date < m.cicloDesde) continue;
            totalCompartido += e.amount;
          }
        }
        const miCuota = m.plazoMeses > 0 ? m.total / m.plazoMeses : 0;
        const miProporcion = sumaCuotas > 0 ? miCuota / sumaCuotas : 0;
        out[m.id] = totalCompartido * miProporcion;
        continue;
      }
      let total = 0;
      for (const mes of Object.values(data?.months || {})) {
        for (const e of mes.expenses || []) {
          if (e.categoryId !== m.categoryId) continue;
          if (m.cicloDesde && e.date < m.cicloDesde) continue; // solo desde el último reinicio, si es una mini-meta periódica
          total += e.amount;
        }
      }
      out[m.id] = total;
    }
    return out;
  }, [metas, data]);

  /* metas con "repetir cada X meses": al llegar al 100%, se reinician solas (cicloDesde = hoy),
     reutilizando el mismo mecanismo que ya usan las mini-metas periódicas de Gastos periódicos */
  useEffect(() => {
    const hoy = todayISO();
    for (const m of metas) {
      if (!m.repiteCada || m.tipo !== "objetivo") continue;
      const progreso = metaProgreso[m.id] || 0;
      if (progreso >= m.total && m.cicloDesde !== hoy) {
        setData((d) => ({
          ...d,
          metas: (d.metas || []).map((mm) => (mm.id === m.id ? { ...mm, cicloDesde: hoy } : mm)),
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaProgreso, metas]);

  /* ── fijos ── */
  const recurring = data?.recurring || [];
  const pendingFixed = recurring.filter((r) => dueIn(r, monthKey) && !(month.applied || {})[r.id]);

  /* para saber si una cuota mensual es viable: ingreso estimado, y necesidad (fija + variable histórica),
     ambas excluyendo la propia categoría de la meta que se esté editando */
  const mesesCerrados = monthsBack(shiftMonth(monthKey, -1), 3).filter((k) => (data?.months?.[k]?.expenses || []).length);
  const ingresoMensualEstimado = useMemo(() => {
    const fixIncome = recurring.filter((r) => r.kind === "ingreso").reduce((s, r) => s + r.amount / (r.every || 1), 0);
    if (fixIncome > 0) return fixIncome;
    const conIngresos = mesesCerrados.filter((k) => (data?.months?.[k]?.incomes || []).length);
    if (!conIngresos.length) return income;
    return conIngresos.reduce((s, k) => s + data.months[k].incomes.reduce((t, i) => t + i.amount, 0), 0) / conIngresos.length;
  }, [recurring, data, mesesCerrados, income]);

  const necesidadFijaMensual = (excluirCategoryId) => recurring
    .filter((r) => r.kind === "gasto" && r.categoryId !== excluirCategoryId && catById[r.categoryId]?.bucket === "necesidad")
    .reduce((s, r) => s + r.amount / (r.every || 1), 0);

  const necesidadVariableHistorica = (excluirCategoryId) => {
    if (!mesesCerrados.length) return 0;
    const total = mesesCerrados.reduce((s, k) => {
      const gastos = data.months[k].expenses.filter((e) =>
        !e.fixed && e.categoryId !== excluirCategoryId && catById[e.categoryId]?.bucket === "necesidad");
      return s + gastos.reduce((t, e) => t + e.amount, 0);
    }, 0);
    return total / mesesCerrados.length;
  };

  const applyFixed = (ids) => setData((d) => {
    const cur = d.months[monthKey] || emptyMonth();
    const incomes = [...cur.incomes];
    const expenses = [...cur.expenses];
    const applied = { ...(cur.applied || {}) };
    let metas = d.metas;
    for (const id of ids) {
      const r = d.recurring.find((x) => x.id === id);
      if (!r || applied[id]) continue;
      if (r.kind === "ingreso") {
        const day = String(Math.min(r.day, daysIn(monthKey))).padStart(2, "0");
        const inc = { id: uid(), label: r.name, amount: r.amount, date: `${monthKey}-${day}`, fixed: true };
        incomes.push(inc);
        applied[id] = inc.id;
      } else {
        const day = String(Math.min(r.day, daysIn(monthKey))).padStart(2, "0");
        const date = `${monthKey}-${day}`;
        const exp = {
          id: uid(), name: r.name, amount: r.amount, categoryId: r.categoryId, date, time: null, fixed: true,
          formaPago: r.formaPago || null, bancoId: r.bancoId || null,
        };
        expenses.push(exp);
        applied[id] = exp.id;
        if (metas?.some((m) => m.fijoId === r.id)) {
          const [y, m2, dd] = date.split("-").map(Number);
          const t = new Date(y, m2 - 1, dd + 1);
          const diaSiguiente = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
          metas = metas.map((mm) => mm.fijoId === r.id ? { ...mm, cicloDesde: diaSiguiente } : mm);
        }
      }
    }
    return { ...d, metas, months: { ...d.months, [monthKey]: { ...cur, incomes, expenses, applied } } };
  });

  const skipFixed = (id) => setData((d) => {
    const cur = d.months[monthKey] || emptyMonth();
    return { ...d, months: { ...d.months, [monthKey]: { ...cur, applied: { ...(cur.applied || {}), [id]: "skip" } } } };
  });

  const saveFixed = (item) => setData((d) => {
    const exists = d.recurring.some((r) => r.id === item.id);
    const recurring = exists ? d.recurring.map((r) => (r.id === item.id ? item : r)) : [...d.recurring, item];
    return autoApplyAll({ ...d, recurring }); // si ya ha vencido, se anota al momento
  });

  const deleteFixed = (id) => setData((d) => ({ ...d, recurring: d.recurring.filter((r) => r.id !== id) }));

  /* ── bloqueo y cifrado ── */
  const abrirCon = async (dek, meta) => {
    const plano = await openData(envRef.current, dek);   // falla si la llave no es la correcta
    dekRef.current = dek;
    metaRef.current = meta;
    const migrado = migrate(plano);
    const conFijos = autoApplyAll(migrado);
    firstSave.current = conFijos === migrado;            // si hay fijos nuevos, guardar ya
    setBioOn(tieneBio(envRef.current));
    setData(conFijos);
    setLocked(false);
  };

  const unlock = async (pass) => {
    try {
      const env = envRef.current;
      const salt = unb64(env.salt);
      const kek = await kekFromPass(pass, salt, env.iter || ITER);

      if (env.enc === 1) {
        // sobre antiguo: la contraseña cifraba los datos directamente. Se abre y se pasa al nuevo.
        const plano = JSON.parse(td.decode(
          await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, kek, unb64(env.ct))
        ));
        const dek = await newDEK();
        const meta = { iter: env.iter || ITER, salt: env.salt, wrapped: { pass: await wrapDEK(dek, kek) } };
        dekRef.current = dek; metaRef.current = meta;
        const migrado = migrate(plano);
        const conFijos = autoApplyAll(migrado);
        await store.set(STORE_KEY, await sealData(conFijos, dek, meta));
        firstSave.current = true;
        setBioOn(false);
        setData(conFijos);
        setLocked(false);
        return true;
      }

      const dek = await unwrapDEK(env.wrapped.pass, kek);
      await abrirCon(dek, { iter: env.iter || ITER, salt: env.salt, wrapped: env.wrapped });
      return true;
    } catch (e) {
      return false;
    }
  };

  const unlockBio = async () => {
    const env = envRef.current;
    if (!tieneBio(env)) return "sin-bio";
    try {
      const bytes = await prfObtener(env.wrapped.prf.credId);
      const dek = await unwrapDEK(env.wrapped.prf, await kekFromBytes(bytes));
      await abrirCon(dek, { iter: env.iter || ITER, salt: env.salt, wrapped: env.wrapped });
      return "ok";
    } catch (e) {
      return e?.name === "NotAllowedError" ? "cancelado" : "error";
    }
  };

  /* activar protección, o cambiar la contraseña conservando Face ID */
  const enableLock = async (pass) => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek = await kekFromPass(pass, salt);
    const dek = dekRef.current || await newDEK();
    const meta = {
      iter: ITER, salt: b64(salt),
      wrapped: { pass: await wrapDEK(dek, kek), ...(metaRef.current?.wrapped?.prf ? { prf: metaRef.current.wrapped.prf } : {}) },
    };
    dekRef.current = dek; metaRef.current = meta;
    await store.set(STORE_KEY, await sealData(data, dek, meta));
    setProtegido(true);
  };

  const disableLock = async (pass) => {
    try {
      const env = JSON.parse(await store.get(STORE_KEY));
      if (!esSobre(env)) throw new Error("no cifrado");
      const kek = await kekFromPass(pass, unb64(env.salt), env.iter || ITER);
      if (env.enc === 1) {
        await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, kek, unb64(env.ct));
      } else {
        await unwrapDEK(env.wrapped.pass, kek);          // verifica la contraseña actual
      }
      dekRef.current = null; metaRef.current = null;
      await store.set(STORE_KEY, JSON.stringify(data));
      setProtegido(false); setBioOn(false);
      return true;
    } catch (e) {
      return false;
    }
  };

  /* añadir o quitar Face ID sobre una app ya protegida */
  const enableBio = async () => {
    if (!dekRef.current || !metaRef.current) return "sin-clave";
    try {
      const { credId, bytes } = await prfCrear();
      const prf = { ...(await wrapDEK(dekRef.current, await kekFromBytes(bytes))), credId };
      const meta = { ...metaRef.current, wrapped: { ...metaRef.current.wrapped, prf } };
      metaRef.current = meta;
      await store.set(STORE_KEY, await sealData(data, dekRef.current, meta));
      setBioOn(true);
      return "ok";
    } catch (e) {
      if (e?.message === "sin-prf") return "sin-prf";
      return e?.name === "NotAllowedError" ? "cancelado" : "error";
    }
  };

  const disableBio = async () => {
    if (!dekRef.current || !metaRef.current) return;
    const { prf, ...resto } = metaRef.current.wrapped;
    const meta = { ...metaRef.current, wrapped: resto };
    metaRef.current = meta;
    await store.set(STORE_KEY, await sealData(data, dekRef.current, meta));
    setBioOn(false);
  };

  const lockNow = async () => {
    if (!dekRef.current) return;
    clearTimeout(timer.current);
    let sobre;
    try {
      sobre = await sealData(data, dekRef.current, metaRef.current);
      await store.set(STORE_KEY, sobre);
    } catch (e) {
      console.error("no se pudo guardar antes de bloquear", e);
      return; // mejor seguir abierta que perder lo último anotado
    }
    envRef.current = JSON.parse(sobre);
    dekRef.current = null;
    setData(null);
    setSheet(null);
    firstSave.current = true;
    setLocked(true);
  };

  /* se vuelve a bloquear si la app pasa más de un minuto en segundo plano */
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) { hiddenAt.current = Date.now(); return; }
      if (dekRef.current && hiddenAt.current && Date.now() - hiddenAt.current > 60000) lockNow();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [data]);

  /* ── copia de seguridad ── */
  const backup = async () => {
    const hecho = await crearCopia(data);
    if (hecho) setData((d) => ({ ...d, lastBackupAt: todayISO() }));
  };

  const compartirAppClick = async () => {
    const { estado, texto } = await compartirApp();
    if (estado === "copiado") window.alert("Mensaje copiado.");
    else if (estado === "manual") window.prompt("Copia este mensaje:", texto);
  };

  const fileRef = useRef(null);
  const restore = async (file) => {
    try {
      const parsed = await leerCopia(file);
      const n = Object.values(parsed.months).reduce((s, m) => s + (m.expenses || []).length, 0);
      const meses = Object.keys(parsed.months).length;
      if (!window.confirm(`La copia tiene ${n} gastos en ${meses} ${meses === 1 ? "mes" : "meses"}. Sustituye todo lo que hay ahora. ¿Continuar?`)) return;
      setData(autoApplyAll(migrate(parsed)));
      setMonthKey(monthKeyOf(new Date()));
      setTab("gastos");
    } catch (e) {
      window.alert(e.message);
    }
  };

  const deleteCategory = (id) => setData((d) => {
    let cats = d.categories.filter((c) => c.id !== id);
    let fallback = cats.find((c) => c.id === "otros");
    if (!fallback) {
      fallback = { id: "otros", name: "Otros", emoji: "📦", color: "#8A7A4E", budget: null };
      cats = [...cats, fallback];
    }
    const months = {};
    for (const [k, m] of Object.entries(d.months)) {
      months[k] = { ...m, expenses: m.expenses.map((e) => (e.categoryId === id ? { ...e, categoryId: fallback.id } : e)) };
    }
    const learned = {};
    for (const [tok, map] of Object.entries(d.learned)) {
      const copy = { ...map }; delete copy[id];
      if (Object.keys(copy).length) learned[tok] = copy;
    }
    return { ...d, categories: cats, months, learned };
  });

  const exportCSV = (scope) => {
    const rows = [["fecha", "hora", "concepto", "categoria", "importe"]];
    const keys = scope === "mes" ? [monthKey] : Object.keys(data.months).sort();
    for (const k of keys) {
      const m = data.months[k];
      if (!m) continue;
      for (const inc of m.incomes) rows.push([inc.date || `${k}-01`, "", inc.label, "INGRESO", eur(inc.amount)]);
      for (const e of [...m.expenses].sort((a, b) => sortKey(a).localeCompare(sortKey(b))))
        rows.push([e.date, e.time || "", e.name, catById[e.categoryId]?.name || "—", eur(-e.amount)]);
    }
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = scope === "mes" ? `gastos-${monthKey}.csv` : "gastos-completo.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const wipe = () => {
    if (!window.confirm("Se borran todos los gastos, ingresos y categorías. ¿Continuar?")) return;
    setData({ version: 8, categories: DEFAULT_CATEGORIES, months: {}, learned: {}, recurring: [], bancos: DEFAULT_BANCOS, formaPagoDefecto: null, bancoDefectoId: null });
  };

  const isCurrentMonth = monthKey === mesEfectivo(data?.diaCobro || null);
  const daysInMonth = new Date(Number(monthKey.split("-")[0]), Number(monthKey.split("-")[1]), 0).getDate();

  /* salta sola al mes efectivo al cargar, y cada vez que la app vuelve a primer plano
     (no hace falta "cerrarla" — con que la persona vuelva a mirar la pantalla, basta).
     Solo salta si seguía viendo el mes efectivo anterior: si navegó a mano a otro mes,
     no la interrumpe. */
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const mesEfectivoRef = useRef(null);
  const revisarMesEfectivo = useCallback(() => {
    const d = dataRef.current;
    if (!d) return;
    const efectivo = mesEfectivo(d.diaCobro || null);
    setMonthKey((actual) => {
      const seguiaElActual = mesEfectivoRef.current === null || actual === mesEfectivoRef.current;
      mesEfectivoRef.current = efectivo;
      return seguiaElActual && actual !== efectivo ? efectivo : actual;
    });
  }, []);
  useEffect(() => { revisarMesEfectivo(); }, [data?.diaCobro, !!data, revisarMesEfectivo]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") revisarMesEfectivo(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [revisarMesEfectivo]);

  /* vista por ciclo de nómina (opción C): solo recalcula el "disponible" del hero cuando
     se está viendo el mes actual — Fijos y Previsión siguen contando por calendario siempre,
     porque un alquiler vence el día 5 le pese a cuándo cobre quien sea. */
  const diaCobro = data?.diaCobro || null;
  const setDiaCobro = (dia) => setData((d) => ({ ...d, diaCobro: dia }));
  const ciclo = useMemo(() => {
    if (!diaCobro || !isCurrentMonth) return null;
    const { inicio, fin } = cicloDePago(diaCobro);
    const meses = new Set([inicio.slice(0, 7), fin.slice(0, 7)]);
    let incomeC = 0, spentC = 0, savedC = 0, spentFijoC = 0;
    const expensesC = [];
    for (const mk of meses) {
      const m = data?.months?.[mk] || emptyMonth();
      for (const i of m.incomes) if (i.date >= inicio && i.date <= fin) incomeC += i.amount;
      for (const e of m.expenses) {
        if (e.date < inicio || e.date > fin) continue;
        if (catById[e.categoryId]?.bucket === "ahorro") { savedC += e.amount; continue; }
        spentC += e.amount;
        if (e.fixed) spentFijoC += e.amount;
        expensesC.push(e);
      }
    }
    const hoyISO = todayISO();
    const diasTranscurridos = Math.max(1, Math.round((new Date(hoyISO) - new Date(inicio)) / 86400000) + 1);
    const diasTotales = Math.round((new Date(fin) - new Date(inicio)) / 86400000) + 1;
    const leftCSinAjuste = incomeC - spentC - savedC;
    const leftC = leftCSinAjuste + (ajuste?.valor || 0);
    return {
      inicio, fin, income: incomeC, spent: spentC, saved: savedC, spentFijo: spentFijoC, spentVariable: spentC - spentFijoC,
      expenses: expensesC,
      left: leftC,
      negativoPorAjuste: (ajuste?.valor || 0) < 0 && leftCSinAjuste >= 0 && leftC < 0,
      diasTranscurridos, diasTotales,
    };
  }, [diaCobro, isCurrentMonth, data?.months, catById, ajuste]);

  /* ── gasto por forma de pago (efectivo / banco) — solo una etiqueta, respeta el ciclo ── */
  const gastoPorFormaPago = useMemo(() => {
    const lista = ciclo ? ciclo.expenses : month.expenses.filter((e) => !isSaving(e));
    let efectivo = 0, bizum = 0, sinEspecificar = 0;
    const porBanco = {}, porBancoDomiciliado = {};
    const sinEspecificarItems = [];
    for (const e of lista) {
      if (e.formaPago === "efectivo") efectivo += e.amount;
      else if (e.formaPago === "bizum") bizum += e.amount;
      else if (e.formaPago === "banco" && e.bancoId) porBanco[e.bancoId] = (porBanco[e.bancoId] || 0) + e.amount;
      else if (e.formaPago === "domiciliado" && e.bancoId) porBancoDomiciliado[e.bancoId] = (porBancoDomiciliado[e.bancoId] || 0) + e.amount;
      else { sinEspecificar += e.amount; sinEspecificarItems.push(e); }
    }
    return { efectivo, bizum, porBanco, porBancoDomiciliado, sinEspecificar, sinEspecificarItems };
  }, [ciclo, month.expenses]);

  /* motor de mensajes de coach: varias candidatas por prioridad, con guardia de historial mínimo
     (evita comparar contra un mes con apenas apuntes, que es lo que causaba el 1703%) */
  const HIST_MIN_APUNTES = 5;
  const prevMonthKey = shiftMonth(monthKey, -1);
  const daysInPrevMonth = new Date(Number(prevMonthKey.split("-")[0]), Number(prevMonthKey.split("-")[1]), 0).getDate();
  const prevMonthData = data?.months?.[prevMonthKey] || null;
  const prevMonthApuntes = (prevMonthData?.expenses?.length || 0) + (prevMonthData?.incomes?.length || 0);
  const suficienteHistorial = prevMonthApuntes >= HIST_MIN_APUNTES;

  const prevSpent = useMemo(() => {
    if (!prevMonthData) return 0;
    return (prevMonthData.expenses || [])
      .filter((e) => catById[e.categoryId]?.bucket !== "ahorro")
      .reduce((s, e) => s + e.amount, 0);
  }, [prevMonthData, catById]);

  const diaHoy = new Date().getDate();
  const diaCorte = Math.min(diaHoy, daysInPrevMonth);
  const prevToDate = useMemo(() => {
    if (!prevMonthData) return { income: 0, used: 0 };
    const inc = (prevMonthData.incomes || [])
      .filter((i) => Number((i.date || `${prevMonthKey}-01`).slice(-2)) <= diaCorte)
      .reduce((s, i) => s + i.amount, 0);
    const used = (prevMonthData.expenses || [])
      .filter((e) => Number(e.date.slice(-2)) <= diaCorte)
      .reduce((s, e) => s + e.amount, 0);
    return { income: inc, used };
  }, [prevMonthData, diaCorte, prevMonthKey]);

  const coachMsg = useMemo(() => {
    if (!modoCoach || !isCurrentMonth) return null;

    /* candidata 0: una meta conseguida o superada — no depende de tener mes anterior con historial,
       es un hecho positivo por sí mismo. Si hay varias, se muestra la de mayor porcentaje. */
    const metaLograda = metas
      .map((m) => ({ m, pct: m.total > 0 ? ((metaProgreso[m.id] || 0) / m.total) * 100 : 0 }))
      .filter((x) => x.pct >= 100)
      .sort((a, b) => b.pct - a.pct)[0];
    if (metaLograda) {
      const { m, pct } = metaLograda;
      const verbo = m.tipo === "deuda" ? "Has terminado de pagar" : "Has conseguido";
      return pct > 105
        ? `${verbo} «${m.name}» — llevas el ${Math.round(pct)}%`
        : `${verbo} tu ${m.tipo === "deuda" ? "deuda" : "objetivo"} «${m.name}»`;
    }

    /* candidata 0.5: dinero ya apartado al ahorro este mes — tampoco depende de tener historial
       del mes anterior. Si hay una meta de ahorro con progreso real (sin llegar al 100%), se
       nombra; si no, un mensaje genérico sobre lo ahorrado este mes. */
    /* a partir de aquí, en vez de quedarse con la primera candidata que sea cierta, se recogen
       TODAS las que lo sean ahora mismo y se rota entre ellas cada 6 horas — así una persona con
       ahorro automático (que hace que "vas al X%" sea casi siempre cierta) no se queda viendo
       siempre la misma frase, bloqueando a las demás para siempre. */
    const candidatas = [];

    if (saved > 0) {
      const metaConProgreso = metas
        .filter((m) => m.tipo === "objetivo")
        .map((m) => ({ m, pct: m.total > 0 ? ((metaProgreso[m.id] || 0) / m.total) * 100 : 0 }))
        .filter((x) => x.pct > 0 && x.pct < 100)
        .sort((a, b) => b.pct - a.pct)[0];
      candidatas.push(metaConProgreso
        ? `Vas al ${Math.round(metaConProgreso.pct)}% de tu objetivo «${metaConProgreso.m.name}», sigue así`
        : `Ya llevas ${eur(saved)} € ahorrados este mes`);
    }

    /* candidata 1: proyección de cierre de este mes, mejor que el gasto real del anterior */
    if (suficienteHistorial && prevSpent > 0 && spent > 0) {
      const proyeccion = (spent / diaHoy) * daysInMonth;
      const pct = ((prevSpent - proyeccion) / prevSpent) * 100;
      if (pct >= 3) candidatas.push(`${Math.round(pct)}% mejor que ${monthLabel(prevMonthKey).toLowerCase()}, sigue así`);
    }

    /* candidata 2: más disponible que el mes anterior, en el mismo día */
    if (suficienteHistorial) {
      const prevLeftToDate = prevToDate.income - prevToDate.used;
      const diff = left - prevLeftToDate;
      if (diff >= 15) candidatas.push(`Hoy tienes ${eur(diff)} € más disponible que en ${monthLabel(prevMonthKey).toLowerCase()} a estas alturas`);
    }

    /* candidata 3: más ingresos que el mes anterior, en el mismo día */
    if (suficienteHistorial) {
      const diffInc = income - prevToDate.income;
      if (diffInc >= 15) candidatas.push(`Has ingresado ${eur(diffInc)} € más que en ${monthLabel(prevMonthKey).toLowerCase()} a estas alturas`);
    }

    /* ninguna candidata es cierta: ánimo neutro, sin inventar comparaciones */
    if (candidatas.length === 0) return "Llevas todo el mes anotado, eso ya suma.";

    /* con una o más candidatas ciertas, rota entre ellas por bloques de 6 horas — el mismo
       bloque siempre da la misma candidata (no cambia en cada render), pero al pasar al
       siguiente bloque de 6h, toca otra */
    const bloqueDeSeisHoras = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
    return candidatas[bloqueDeSeisHoras % candidatas.length];
  }, [modoCoach, isCurrentMonth, metas, metaProgreso, saved, suficienteHistorial, prevSpent, spent, diaHoy, daysInMonth, prevMonthKey, prevToDate, left, income]);

  const totalGastosSiempre = useMemo(
    () => Object.values(data?.months || {}).reduce((s, m) => s + (m.expenses || []).length, 0),
    [data]
  );
  const diasSinCopia = useMemo(() => {
    if (!data?.lastBackupAt) return null; // nunca se ha hecho copia
    const [y, m, d] = data.lastBackupAt.split("-").map(Number);
    const last = new Date(y, m - 1, d);
    return Math.floor((new Date() - last) / 86400000);
  }, [data?.lastBackupAt]);
  const avisarCopia = isCurrentMonth && totalGastosSiempre >= 5 &&
    (diasSinCopia === null || diasSinCopia >= 21);

  /* ── Filtrar (Movimientos y Gastos fijos): categorías y formas de pago, varias a la vez.
     Varias categorías suman entre sí; categoría y forma de pago se cruzan. Los filtros se borran
     solos al salir de la pestaña (un filtro olvidado parece pérdida de datos); el orden se conserva. */
  const FILTRO_VACIO = { cats: [], pagos: [] };
  const [filtroGastos, setFiltroGastos] = useState(FILTRO_VACIO);
  const [filtroFijosGastos, setFiltroFijosGastos] = useState(FILTRO_VACIO);
  useEffect(() => { setFiltroGastos(FILTRO_VACIO); setFiltroFijosGastos(FILTRO_VACIO); }, [tab]);
  const pagoActivo = data?.formaPagoActivada !== false;
  const pagoKey = (x) => (!x.formaPago ? "sin"
    : (x.formaPago === "banco" || x.formaPago === "domiciliado") ? `${x.formaPago}:${x.bancoId || ""}` : x.formaPago);
  const etiquetaPago = (key) => {
    if (key === "sin") return "Sin especificar";
    if (key === "efectivo") return "Efectivo";
    if (key === "bizum") return "Bizum/Transferencia";
    const [tipo, bid] = key.split(":");
    const nombre = (data?.bancos || []).find((b) => b.id === bid)?.name || "Tarjeta";
    return tipo === "domiciliado" ? `${nombre} · domiciliado` : nombre;
  };
  const filtroActivo = (f) => f.cats.length > 0 || (pagoActivo && f.pagos.length > 0);
  const pasaFiltro = (x, f) =>
    (f.cats.length === 0 || f.cats.includes(x.categoryId || "")) &&
    (!pagoActivo || f.pagos.length === 0 || f.pagos.includes(pagoKey(x)));
  /* opciones del menú: solo lo que de verdad aparece en la lista, más lo ya marcado (para poder desmarcarlo) */
  const gruposFiltro = (lista, f) => {
    const catIds = [...new Set([...lista.map((x) => x.categoryId || ""), ...f.cats])];
    const cats = catIds.map((id) => {
      const c = catById[id];
      // la marca va con CatMark, igual que en el resto de la app: así Ahorro y Gastos periódicos enseñan
      // su imagen propia también dentro del menú, no un emoji suelto
      return { key: id, label: c ? c.name : "Sin categoría", icono: c ? <CatMark c={c} size={15} /> : null, orden: c ? c.name : "zzz" };
    }).sort((a, b) => a.orden.localeCompare(b.orden, "es"));
    const pagos = [...new Set([...lista.map(pagoKey), ...f.pagos])]
      .map((k) => ({ key: k, label: etiquetaPago(k) }))
      .sort((a, b) => (a.key === "sin") - (b.key === "sin") || a.label.localeCompare(b.label, "es"));
    return [
      { id: "cats", titulo: "Categoría", opciones: cats },
      { id: "pagos", titulo: "Forma de pago", opciones: pagoActivo ? pagos : [] },
    ];
  };
  const gastosFiltrados = useMemo(
    () => month.expenses.filter((e) => pasaFiltro(e, filtroGastos)),
    [month.expenses, filtroGastos, pagoActivo]
  );

  const [ordenGastos, setOrdenGastos] = useState("reciente"); // 'reciente' | 'antiguo' | 'az'
  const groupedGastos = useMemo(() => {
    if (ordenGastos === "az") {
      const todo = gastosFiltrados.map((e) => ({ ...e, tipo: "gasto" })).sort((a, b) => a.name.localeCompare(b.name, "es"));
      return todo.length === 0 ? [] : [["__az__", todo]];
    }
    const todo = gastosFiltrados.map((e) => ({ ...e, tipo: "gasto" }))
      .sort((a, b) => ordenGastos === "antiguo"
        ? sortKey(a).localeCompare(sortKey(b)) || a.id.localeCompare(b.id)
        : sortKey(b).localeCompare(sortKey(a)) || b.id.localeCompare(a.id));
    const g = {};
    for (const m of todo) (g[m.date] = g[m.date] || []).push(m);
    return Object.entries(g);
  }, [gastosFiltrados, ordenGastos]);

  const [ordenIngresos, setOrdenIngresos] = useState("reciente"); // 'reciente' | 'antiguo' | 'az'
  const groupedIngresos = useMemo(() => {
    if (ordenIngresos === "az") {
      const todo = month.incomes.map((i) => ({ ...i, tipo: "ingreso", name: i.label, date: i.date || `${monthKey}-01` })).sort((a, b) => a.name.localeCompare(b.name, "es"));
      return todo.length === 0 ? [] : [["__az__", todo]];
    }
    const todo = month.incomes.map((i) => ({ ...i, tipo: "ingreso", name: i.label, date: i.date || `${monthKey}-01` }))
      .sort((a, b) => ordenIngresos === "antiguo"
        ? sortKey(a).localeCompare(sortKey(b)) || a.id.localeCompare(b.id)
        : sortKey(b).localeCompare(sortKey(a)) || b.id.localeCompare(a.id));
    const g = {};
    for (const m of todo) (g[m.date] = g[m.date] || []).push(m);
    return Object.entries(g);
  }, [month.incomes, monthKey, ordenIngresos]);

  /* reparto genérico "primeros 3 (día entero, nunca partido) + resto", reutilizado para gastos e ingresos */
  const splitFirstRest = (agrupado) => {
    let contados = 0;
    const first = [];
    const rest = [];
    for (const [date, items] of agrupado) {
      if (contados < 3) { first.push([date, items]); contados += items.length; }
      else rest.push([date, items]);
    }
    return { first, rest, restCount: rest.reduce((s, [, items]) => s + items.length, 0) };
  };

  const [vistaGastos, setVistaGastos] = useState("movimientos"); // 'movimientos' | 'fijos'
  const [vistaIngresos, setVistaIngresos] = useState("movimientos"); // 'movimientos' | 'fijos'
  const [prefillNonce, setPrefillNonce] = useState(0);
  const [showAllMov, setShowAllMov] = useState(false);
  const [showAllMovIngresos, setShowAllMovIngresos] = useState(false);
  const [modoEditarMov, setModoEditarMov] = useState(false);
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [mostrarMenuCampos, setMostrarMenuCampos] = useState(false);
  const [campoEditando, setCampoEditando] = useState(null); // 'categoria' | 'formaPago' | 'fecha' | 'hora' | null
  const [seleccionadosSinEsp, setSeleccionadosSinEsp] = useState(() => new Set());
  const toggleSeleccionSinEsp = (id) => setSeleccionadosSinEsp((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /* ── selección múltiple en Movimientos de Ingresos: propia y separada de la de Gastos ── */
  const [modoEditarIngresos, setModoEditarIngresos] = useState(false);
  const [seleccionadosIngresos, setSeleccionadosIngresos] = useState(() => new Set());
  const [mostrarEditarFechaIngresos, setMostrarEditarFechaIngresos] = useState(false);

  /* ── selección múltiple en las reglas de Fijos: editar Categoría/Forma de pago o borrar en bloque ── */
  const [modoEditarFijos, setModoEditarFijos] = useState(false);
  const [seleccionadosFijos, setSeleccionadosFijos] = useState(() => new Set());
  const [mostrarMenuCamposFijos, setMostrarMenuCamposFijos] = useState(false);
  const [campoEditandoFijos, setCampoEditandoFijos] = useState(null); // 'categoria' | 'formaPago' | null
  const toggleSeleccionFijos = (id) => setSeleccionadosFijos((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const cancelarEdicionFijos = () => {
    setModoEditarFijos(false);
    setSeleccionadosFijos(new Set());
    setMostrarMenuCamposFijos(false);
    setCampoEditandoFijos(null);
  };
  const borrarSeleccionadosFijos = () => {
    if (!window.confirm(`¿Borrar ${seleccionadosFijos.size} ${seleccionadosFijos.size === 1 ? "regla" : "reglas"} de fijos? No se puede deshacer. Los gastos e ingresos ya anotados no se ven afectados.`)) return;
    setData((d) => ({ ...d, recurring: d.recurring.filter((r) => !seleccionadosFijos.has(r.id)) }));
    cancelarEdicionFijos();
  };
  const aplicarCampoBulkFijos = (cambios) => {
    setData((d) => ({ ...d, recurring: d.recurring.map((r) => (seleccionadosFijos.has(r.id) ? { ...r, ...cambios } : r)) }));
    setMostrarMenuCamposFijos(false);
    setCampoEditandoFijos(null);
  };
  /* fila de una regla de fijo, reutilizada en Gastos y en Ingresos */
  const renderFijoItem = (r) => {
    const state = (month.applied || {})[r.id];
    const toca = dueIn(r, monthKey);
    const prox = nextDue(r, monthKey);
    const seleccionado = seleccionadosFijos.has(r.id);
    return (
      <button key={r.id} className="cg-item"
        onClick={() => {
          if (modoEditarFijos) { toggleSeleccionFijos(r.id); return; }
          setSheet({ type: "fixed", payload: r });
        }}>
        {modoEditarFijos && (
          <div style={{
            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
            border: `1.5px solid ${seleccionado ? "var(--pine)" : "var(--line)"}`,
            display: "flex", alignItems: "center", justifyContent: "center", background: "var(--card)",
          }}>
            {seleccionado && <div style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--ink)" }}></div>}
          </div>
        )}
        <div className="cg-badge" style={{ background: r.kind === "ingreso" ? "#E6F1FB" : (catById[r.categoryId]?.color || "#888") + "22" }}>
          {r.kind === "ingreso" ? "＋" : <CatMark c={catById[r.categoryId]} size={16} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="cg-name">{r.name}</div>
          <div className="cg-meta">
            día {r.day} · {freqLabel(r)}{r.auto === false ? " · manual" : ""} · {r.kind === "ingreso" ? "ingreso" : catById[r.categoryId]?.name || "—"}
          </div>
        </div>
        <span className="cg-amt">{r.kind === "ingreso" ? "" : "−"}{eur(r.amount)} €</span>
        <span className={`cg-tag ${state && state !== "skip" ? "ok" : ""}`} style={{ marginLeft: 8 }}>
          {state === "skip" ? "saltado" : state ? "anotado" : toca ? "pendiente" : prox ? shortMonth(prox) : "—"}
        </span>
      </button>
    );
  };
  /* barra de acciones al pie de la lista de fijos, con Editar campos (solo si hay seleccionados y todos son de gasto) */
  const seleccionFijosSonTodosGasto = useMemo(() => {
    for (const r of recurring) if (seleccionadosFijos.has(r.id) && r.kind === "ingreso") return false;
    return seleccionadosFijos.size > 0;
  }, [seleccionadosFijos, recurring]);
  const toggleSeleccionIngresos = (id) => setSeleccionadosIngresos((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const cancelarEdicionIngresos = () => {
    setModoEditarIngresos(false);
    setSeleccionadosIngresos(new Set());
    setMostrarEditarFechaIngresos(false);
  };
  const borrarSeleccionadosIngresos = () => {
    if (!window.confirm(`¿Borrar ${seleccionadosIngresos.size} ${seleccionadosIngresos.size === 1 ? "ingreso" : "ingresos"}? No se puede deshacer.`)) return;
    setData((d) => {
      const months = {};
      for (const [k, m] of Object.entries(d.months)) {
        months[k] = { ...m, incomes: m.incomes.filter((i) => !seleccionadosIngresos.has(i.id)) };
      }
      return { ...d, months };
    });
    cancelarEdicionIngresos();
  };

  /* ── selección múltiple en Movimientos: borrar o editar un campo en varios apuntes a la vez ── */
  const toggleSeleccion = (id) => setSeleccionados((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const cancelarEdicionMov = () => {
    setModoEditarMov(false);
    setSeleccionados(new Set());
    setMostrarMenuCampos(false);
    setCampoEditando(null);
  };
  const borrarSeleccionados = () => {
    if (!window.confirm(`¿Borrar ${seleccionados.size} ${seleccionados.size === 1 ? "apunte" : "apuntes"}? No se puede deshacer.`)) return;
    setData((d) => {
      const months = {};
      for (const [k, m] of Object.entries(d.months)) {
        months[k] = {
          ...m,
          expenses: m.expenses.filter((e) => !seleccionados.has(e.id)),
          incomes: m.incomes.filter((i) => !seleccionados.has(i.id)),
        };
      }
      return { ...d, months };
    });
    cancelarEdicionMov();
  };
  /* solo cuenta los gastos seleccionados (los ingresos no tienen categoría/forma de pago) */
  const seleccionSonTodosGastos = useMemo(() => {
    for (const mo of Object.values(data?.months || {})) {
      for (const i of mo.incomes || []) if (seleccionados.has(i.id)) return false;
    }
    return seleccionados.size > 0;
  }, [seleccionados, data?.months]);
  const aplicarCampoBulk = (cambios, ids = seleccionados) => setData((d) => {
    // quita los seleccionados de donde estaban, y los vuelve a colocar según su fecha final
    // (por si el cambio fue de fecha, y ahora tocan a otro mes)
    const months = {};
    for (const [k, m] of Object.entries(d.months)) {
      months[k] = {
        ...m,
        expenses: m.expenses.filter((e) => !ids.has(e.id)),
        incomes: m.incomes.filter((i) => !ids.has(i.id)),
      };
    }
    for (const m of Object.values(d.months)) {
      for (const e of m.expenses) {
        if (!ids.has(e.id)) continue;
        const actualizado = { ...e, ...cambios };
        const target = actualizado.date.slice(0, 7);
        const cur = months[target] || emptyMonth();
        months[target] = { ...cur, expenses: [...cur.expenses, actualizado] };
      }
      for (const i of m.incomes) {
        if (!ids.has(i.id)) continue;
        const actualizado = { ...i, ...cambios };
        const target = actualizado.date.slice(0, 7);
        const cur = months[target] || emptyMonth();
        months[target] = { ...cur, incomes: [...cur.incomes, actualizado] };
      }
    }
    return { ...d, months };
  });

  useEffect(() => { setShowAllMov(false); }, [monthKey]);
  const [searchQ, setSearchQ] = useState("");
  useEffect(() => { if (tab !== "gastos") setSearchQ(""); }, [tab]);
  const [expByCategory, setExpByCategory] = useState(false);
  const [expFijos, setExpFijos] = useState(false);
  const [expFijosIngresos, setExpFijosIngresos] = useState(false);
  const [expCatLimites, setExpCatLimites] = useState(false);
  const [mostrarPickerDefecto, setMostrarPickerDefecto] = useState(false);
  const [grupoAbierto, setGrupoAbierto] = useState(null);
  const [subDinero, setSubDinero] = useState(null);
  const [expMetas, setExpMetas] = useState(false);
  const [expGastosPeriodicos, setExpGastosPeriodicos] = useState(false);
  const metasNormales = useMemo(() => metas.filter((m) => !m.fijoId), [metas]);
  const metasPeriodicas = useMemo(() => metas.filter((m) => m.fijoId), [metas]);
  const [searchQFijos, setSearchQFijos] = useState("");
  useEffect(() => { if (tab !== "fijos") setSearchQFijos(""); }, [tab]);

  /* buscador de fijos: por nombre o categoría, entre los dados de alta y su histórico */
  const fijosResults = useMemo(() => {
    const q = searchQFijos.trim();
    if (!q) return null;
    const nombreCat = (r) => r.kind === "ingreso" ? "ingreso" : (catById[r.categoryId]?.name || "");
    const dadosDeAlta = recurring.filter((r) => fuzzyMatch(q, r.name) || fuzzyMatch(q, nombreCat(r)));

    const historico = [];
    for (const [k, m] of Object.entries(data?.months || {})) {
      for (const e of m.expenses || []) {
        if (!e.fixed) continue;
        if (fuzzyMatch(q, e.name) || fuzzyMatch(q, catById[e.categoryId]?.name || "")) {
          historico.push({ ...e, tipo: "gasto" });
        }
      }
      for (const i of m.incomes || []) {
        if (!i.fixed) continue;
        if (fuzzyMatch(q, i.label) || fuzzyMatch(q, "ingreso")) {
          historico.push({ ...i, tipo: "ingreso", name: i.label, date: i.date || `${k}-01` });
        }
      }
    }
    historico.sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || b.id.localeCompare(a.id));
    return { dadosDeAlta, historico: historico.slice(0, 50) };
  }, [searchQFijos, recurring, data, catById]);

  const [ordenFijosGastos, setOrdenFijosGastos] = useState("proximo"); // 'proximo' | 'antiguo' | 'az' | 'periodicidad'
  const ordenarFijos = (lista, orden, monthKey) => {
    const arr = [...lista];
    if (orden === "az") return arr.sort((a, b) => a.name.localeCompare(b.name, "es"));
    if (orden === "periodicidad") return arr.sort((a, b) => (a.every || 1) - (b.every || 1));
    // próximo/antiguo: por la fecha del siguiente cobro
    return arr.sort((a, b) => {
      const da = nextDue(a, monthKey) || "9999-99";
      const db = nextDue(b, monthKey) || "9999-99";
      return orden === "antiguo" ? db.localeCompare(da) : da.localeCompare(db);
    });
  };
  const recurringGastos = useMemo(() => ordenarFijos(recurring.filter((r) => r.kind === "gasto"), ordenFijosGastos, monthKey), [recurring, ordenFijosGastos, monthKey]);
  const recurringGastosVisibles = useMemo(
    () => recurringGastos.filter((r) => pasaFiltro(r, filtroFijosGastos)),
    [recurringGastos, filtroFijosGastos, pagoActivo]
  );
  const [ordenFijosIngresos, setOrdenFijosIngresos] = useState("proximo");
  const recurringIngresos = useMemo(() => ordenarFijos(recurring.filter((r) => r.kind === "ingreso"), ordenFijosIngresos, monthKey), [recurring, ordenFijosIngresos, monthKey]);
  const fijosPeriodicosSinMiniMeta = useMemo(
    () => recurringGastos.filter((r) => r.every > 1 && r.active !== false && !metas.some((m) => m.fijoId === r.id)),
    [recurringGastos, metas]
  );
  const [mostrarOfertaMasivaMiniMetas, setMostrarOfertaMasivaMiniMetas] = useState(false);
  const activarGastosPeriodicos = () => {
    setData((d) => ({ ...d, gastosPeriodicosActivado: true }));
    if (fijosPeriodicosSinMiniMeta.length > 0) setMostrarOfertaMasivaMiniMetas(true);
  };
  const crearMiniMetasMasivo = () => {
    for (const r of fijosPeriodicosSinMiniMeta) crearMiniMeta({ id: r.id, name: r.name, amount: r.amount, every: r.every });
    setMostrarOfertaMasivaMiniMetas(false);
  };
  const fijosResultsGastos = fijosResults ? {
    dadosDeAlta: fijosResults.dadosDeAlta.filter((r) => r.kind === "gasto" && pasaFiltro(r, filtroFijosGastos)),
    historico: fijosResults.historico.filter((m) => m.tipo === "gasto" && pasaFiltro(m, filtroFijosGastos)),
  } : null;
  const fijosResultsIngresos = fijosResults ? {
    dadosDeAlta: fijosResults.dadosDeAlta.filter((r) => r.kind === "ingreso"),
    historico: fijosResults.historico.filter((m) => m.tipo === "ingreso"),
  } : null;

  const movCount = month.expenses.length + month.incomes.length;
  const { first: firstGroupedGastos, rest: restGroupedGastos, restCount: restCountGastos } = useMemo(
    () => splitFirstRest(groupedGastos), [groupedGastos]
  );
  const { first: firstGroupedIngresos, rest: restGroupedIngresos, restCount: restCountIngresos } = useMemo(
    () => splitFirstRest(groupedIngresos), [groupedIngresos]
  );

  /* ── una sola fila de Movimientos, reutilizada en el buscador, los primeros 3 días y el resto ── */
  const renderMovItem = (m, conFecha, opts) => {
    const modoEditar = opts?.modoEditar ?? modoEditarMov;
    const seleccionSet = opts?.seleccionSet ?? seleccionados;
    const onToggle = opts?.onToggle ?? toggleSeleccion;
    const esIngreso = m.tipo === "ingreso";
    const c = esIngreso ? null : catById[m.categoryId];
    const seleccionado = seleccionSet.has(m.id);
    const metaTexto = conFecha
      ? (esIngreso ? `ingreso · ${stampLabel(m)}` : `${c?.name || "Sin categoría"} · ${stampLabel(m)}`)
      : esIngreso
        ? `ingreso${m.fixed ? " · fijo" : ""}`
        : `${c?.name || "Sin categoría"}${m.fixed ? " · fijo" : m.time ? ` · ${m.time}` : ""}`;
    return (
      <SwipeableRow key={m.id} disabled={modoEditar} onDelete={() => (esIngreso ? removeIncome(m.id) : deleteExpense(m.id))}>
        <button className="cg-item"
          onClick={() => {
            if (modoEditar) { onToggle(m.id); return; }
            setSheet(esIngreso ? { type: "income", payload: m } : { type: "expense", payload: m });
          }}>
          {modoEditar && (
            <div style={{
              width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
              border: `1.5px solid ${seleccionado ? "var(--pine)" : "var(--line)"}`,
              display: "flex", alignItems: "center", justifyContent: "center", background: "var(--card)",
            }}>
              {seleccionado && <div style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--ink)" }}></div>}
            </div>
          )}
          <div className="cg-badge" style={{ background: esIngreso ? "#E6F1FB" : (c?.color || "#888") + "22" }}>
            {esIngreso ? "＋" : <CatMark c={c} size={16} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="cg-name">{esIngreso ? m.label : m.name}</div>
            <div className="cg-meta">{metaTexto}</div>
          </div>
          <span className="cg-amt" style={esIngreso ? { color: "var(--pine)" } : undefined}>
            {esIngreso ? "+" : "−"}{eur(m.amount)} €
          </span>
        </button>
      </SwipeableRow>
    );
  };

  /* buscador de movimientos: cruza todos los meses guardados, por proximidad de texto */
  const searchResultsGastos = useMemo(() => {
    const q = searchQ.trim();
    if (!q) return [];
    const todo = [];
    for (const [k, m] of Object.entries(data?.months || {})) {
      for (const e of m.expenses || []) todo.push({ ...e, tipo: "gasto" });
    }
    return todo
      .filter((m) => fuzzyMatch(q, m.name) && pasaFiltro(m, filtroGastos))
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || b.id.localeCompare(a.id))
      .slice(0, 50);
  }, [searchQ, data, filtroGastos, pagoActivo]);

  const [searchQIngresos, setSearchQIngresos] = useState("");
  const searchResultsIngresos = useMemo(() => {
    const q = searchQIngresos.trim();
    if (!q) return [];
    const todo = [];
    for (const [k, m] of Object.entries(data?.months || {})) {
      for (const i of m.incomes || []) todo.push({ ...i, tipo: "ingreso", name: i.label, date: i.date || `${k}-01` });
    }
    return todo
      .filter((m) => fuzzyMatch(q, m.name))
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || b.id.localeCompare(a.id))
      .slice(0, 50);
  }, [searchQIngresos, data]);

  if (onboard.status === "install" || onboard.status === "consent") {
    return <Onboarding startStep={onboard.status} onDone={finishOnboarding} bancos={bancos} masUsadoBancoId={usoFormaPago.masUsadoBancoId} onAddBanco={saveBanco} />;
  }

  if (locked) {
    return (
      <LockScreen
        onUnlock={unlock}
        onBio={tieneBio(envRef.current) ? unlockBio : null}
        onWipe={() => {
          if (!window.confirm("Sin la contraseña no hay forma de recuperar los datos. ¿Empezar de cero y borrar todo lo guardado?")) return;
          if (!window.confirm("Última confirmación: se borra todo el historial de gastos de este dispositivo.")) return;
          keyRef.current = null; envRef.current = null;
          store.set(STORE_KEY, JSON.stringify({ version: 8, categories: DEFAULT_CATEGORIES, months: {}, learned: {}, recurring: [] }));
          window.location.reload();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="cg-root">
        <div className="cg-wrap"><div className="cg-card"><p className="cg-empty">Cargando tus datos…</p></div></div>
      </div>
    );
  }

  return (
    <div className="cg-root">
      <div className="cg-wrap">

        <div className="cg-head">
          <div>
            <div className="cg-eyebrow">{APP_NAME}</div>
            <div className="cg-brand">Gastos del mes</div>
          </div>
          <div className="cg-nav">
            <button className="cg-navbtn" onClick={() => setMonthKey(shiftMonth(monthKey, -1))} aria-label="Mes anterior">‹</button>
            <span className="cg-month">{monthLabel(monthKey)}</span>
            <button className="cg-navbtn" onClick={() => setMonthKey(shiftMonth(monthKey, 1))} aria-label="Mes siguiente">›</button>
          </div>
        </div>

        {/* héroe: disponible */}
        {(() => {
          const izq = ciclo ? ciclo.left : left;
          const inc = ciclo ? ciclo.income : income;
          const sp = ciclo ? ciclo.spent : spent;
          const sv = ciclo ? ciclo.saved : saved;
          const looksOver = izq < 0;
          const overText = (ciclo ? ciclo.negativoPorAjuste : negativoPorAjuste) ? "Ajustado a la baja" : "Te has pasado";
          const normalText = heroModo === "gastado" ? "Gastado este mes" : "Disponible";
          const numeroGrande = heroModo === "gastado" ? sp : Math.abs(izq);
          return (
            <div className={`cg-hero ${looksOver && !oculto ? "over" : ""}`}>
              <button className="cg-eye" onClick={toggleOculto} aria-pressed={oculto}
                aria-label={oculto ? "Mostrar el disponible" : "Ocultar el disponible"}
                title={oculto ? "Mostrar importes" : "Ocultar importes"}>
                <EyeIcon off={oculto} />
              </button>

              <div className="cg-eyebrow">
                {oculto || !looksOver ? normalText : overText}
                {ciclo && !oculto && (
                  <span style={{ marginLeft: 6, fontWeight: 400, opacity: 0.7 }}>
                    · ciclo {shortDate(ciclo.inicio)}–{shortDate(ciclo.fin)}
                  </span>
                )}
              </div>
              <div className="cg-big">
                {oculto ? <span className="cg-hidden">••••</span> : eur(numeroGrande)}<small>€</small>
              </div>
              <div className="cg-sub">
                {oculto
                  ? "importes ocultos"
                  : heroModo === "gastado"
                    ? `${eur(Math.abs(izq))} disponible · ${eur(inc)} recibido${sv > 0 ? ` · ${eur(sv)} ahorrado 🎉` : ""}${ajuste ? ` · ajuste ${ajuste.valor >= 0 ? "+" : ""}${eur(ajuste.valor)} €` : ""}`
                    : `${eur(inc)} recibido · ${eur(sp)} gastado${sv > 0 ? ` · ${eur(sv)} ahorrado 🎉` : ""}${ajuste ? ` · ajuste ${ajuste.valor >= 0 ? "+" : ""}${eur(ajuste.valor)} €` : ""}`}
              </div>
            </div>
          );
        })()}

        {!oculto && coachMsg && <CoachBox msg={coachMsg} />}

        <div className="cg-tabs" role="tablist">
          {[["gastos", "Gastos"], ["ingresos", "Ingresos"], ["resumen", "Resumen"], ["metas", "Metas"], ["ajustes", "Ajustes"]].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k}
              className={`cg-tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>

        {tab === "gastos" && (
          <>
            {avisoActualizacion && <AvisoActualizacionCard onClose={cerrarAvisoActualizacion} />}
            {avisoGastosPeriodicos && <AvisoGastosPeriodicosCard onClose={cerrarAvisoGastosPeriodicos} />}

            {avisarCopia && (
              <div className="cg-card cg-pending">
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <h2 className="cg-title">
                    {diasSinCopia === null ? "Todavía no hay copia de seguridad" : "Hace tiempo que no hay copia"}
                  </h2>
                  <button className="cg-ghost" onClick={backup}>Guardar copia</button>
                </div>
                <p className="cg-hint" style={{ margin: 0 }}>
                  {diasSinCopia === null
                    ? "Guarda una copia de vez en cuando por si pierdes el móvil o lo cambias."
                    : `Han pasado ${diasSinCopia} días desde la última. Es buen momento para hacer otra.`}
                </p>
              </div>
            )}

            {pendingFixed.length > 0 && (
              <div className="cg-card cg-pending">
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <h2 className="cg-title">Fijos por venir</h2>
                  <button className="cg-ghost" onClick={() => applyFixed(pendingFixed.map((r) => r.id))}>
                    Anotar {pendingFixed.length === 1 ? "ya" : "los " + pendingFixed.length}
                  </button>
                </div>
                {pendingFixed.map((r) => (
                  <div key={r.id} className="cg-fixedrow">
                    <div className="cg-badge" style={{ background: r.kind === "ingreso" ? "#E6F1FB" : (catById[r.categoryId]?.color || "#888") + "22" }}>
                      {r.kind === "ingreso" ? "＋" : <CatMark c={catById[r.categoryId]} size={16} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="cg-name">{r.name}</div>
                      <div className="cg-meta">
                        {r.auto === false ? "lo anotas tú" : `se anota el día ${r.day}`}
                        {" · "}{r.kind === "ingreso" ? "ingreso" : catById[r.categoryId]?.name || "—"}
                      </div>
                    </div>
                    <span className="cg-amt">{r.kind === "ingreso" ? "" : "−"}{eur(r.amount)} €</span>
                    <button className="cg-navbtn" style={{ marginLeft: 6 }} aria-label={`Anotar ${r.name} ya`}
                      onClick={() => applyFixed([r.id])}>✓</button>
                    <button className="cg-navbtn" aria-label={`Saltar ${r.name} este mes`}
                      onClick={() => skipFixed(r.id)}>×</button>
                  </div>
                ))}
              </div>
            )}

            <AddExpense
              categories={chipOrder}
              learned={data.learned}
              onAdd={addExpense}
              justCreated={lastNewCat}
              onNewCategory={() => setSheet({ type: "cat", payload: null })}
              bancos={bancos}
              masUsadoBancoId={usoFormaPago.masUsadoBancoId}
              formaPagoDefecto={formaPagoPorDefecto}
              formaPagoEsExplicita={!!data.formaPagoDefecto}
              formaPagoActivada={data.formaPagoActivada}
              onAddBanco={saveBanco}
              prefillNonce={prefillNonce}
              prefillCategoryId="gastos-periodicos-compartida"
              prefillName="Gastos periódicos"
            />

            <div className="cg-toggle" style={{ marginBottom: 4 }}>
              <button className={vistaGastos === "movimientos" ? "on" : ""} onClick={() => setVistaGastos("movimientos")}>Movimientos</button>
              <button className={vistaGastos === "fijos" ? "on" : ""} onClick={() => setVistaGastos("fijos")}>Fijos</button>
            </div>

            {vistaGastos === "movimientos" ? (
              <div className="cg-card">
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <h2 className="cg-title">Movimientos</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="cg-eyebrow">
                      {modoEditarMov
                        ? (seleccionados.size > 0 ? `${seleccionados.size} seleccionado${seleccionados.size === 1 ? "" : "s"}` : "Elige apuntes")
                        : filtroActivo(filtroGastos)
                          ? `${gastosFiltrados.length} de ${month.expenses.length} ${month.expenses.length === 1 ? "gasto" : "gastos"}`
                          : `${month.expenses.length} ${month.expenses.length === 1 ? "gasto" : "gastos"}`}
                    </span>
                    {month.expenses.length > 0 && (
                      <button className="cg-vermas" onClick={() => (modoEditarMov ? cancelarEdicionMov() : setModoEditarMov(true))}>
                        {modoEditarMov ? "Cancelar" : "Editar"}
                      </button>
                    )}
                  </div>
                </div>

                <input className="cg-input" style={{ marginBottom: 10 }} placeholder="Buscar por concepto…"
                  value={searchQ} onChange={(e) => setSearchQ(e.target.value)} aria-label="Buscar movimientos" />

                <div className="cg-pillbar">
                  <MenuOrdenar valor={ordenGastos} onChange={setOrdenGastos}
                    opciones={[["reciente", "Más reciente"], ["antiguo", "Más antiguo"], ["az", "A-Z"]]} />
                  <MenuFiltrar grupos={gruposFiltro(month.expenses, filtroGastos)} seleccion={filtroGastos} onChange={setFiltroGastos} />
                </div>

                {searchQ.trim() ? (
                  searchResultsGastos.length === 0 ? (
                    <p className="cg-empty">Nada que se parezca a «{searchQ.trim()}».</p>
                  ) : (
                    searchResultsGastos.map((m) => renderMovItem(m, true))
                  )
                ) : groupedGastos.length === 0 && month.expenses.length > 0 ? (
                  <p className="cg-empty">Ningún gasto con estos filtros.</p>
                ) : groupedGastos.length === 0 ? (
                  <p className="cg-empty">Todavía no hay nada en {monthLabel(monthKey).toLowerCase()}.<br />Anota el primer gasto arriba.</p>
                ) : (
                  <>
                    {firstGroupedGastos.map(([date, items]) => (
                      <div key={date}>
                        {date !== "__az__" && <div className="cg-day">{dayLabel(date)}</div>}
                        {items.map((m) => renderMovItem(m, date === "__az__"))}
                      </div>
                    ))}

                    {restCountGastos > 0 && (
                      <div style={{ textAlign: "center", marginTop: 8 }}>
                        <button className="cg-vermas" onClick={() => setShowAllMov((v) => !v)}>
                          {showAllMov ? "Ver menos" : `Ver más (${restCountGastos})`}
                        </button>
                      </div>
                    )}

                    {showAllMov && restGroupedGastos.map(([date, items]) => (
                      <div key={`rest-${date}`}>
                        {date !== "__az__" && <div className="cg-day">{dayLabel(date)}</div>}
                        {items.map((m) => renderMovItem(m, date === "__az__"))}
                      </div>
                    ))}
                  </>
                )}

                {modoEditarMov && seleccionados.size > 0 && (
                  <div style={{ display: "flex", gap: 8, marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                    <button className="cg-ghost" style={{ flex: 1, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                      onClick={() => setMostrarMenuCampos(true)}>
                      <i className="ti ti-edit" style={{ fontSize: 15 }} aria-hidden="true"></i>
                      Editar campos
                    </button>
                    <button className="cg-ghost danger" style={{ flex: 1, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                      onClick={borrarSeleccionados}>
                      <i className="ti ti-trash" style={{ fontSize: 15 }} aria-hidden="true"></i>
                      Borrar
                    </button>
                    <button className="cg-ghost" style={{ flex: 1, margin: 0 }} onClick={cancelarEdicionMov}>Cancelar</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="cg-card">
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <h2 className="cg-title">Gastos fijos</h2>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {recurringGastos.length > 0 && (
                        <button className="cg-vermas" onClick={() => (modoEditarFijos ? cancelarEdicionFijos() : setModoEditarFijos(true))}>
                          {modoEditarFijos ? "Cancelar" : "Editar"}
                        </button>
                      )}
                      <button className="cg-ghost" onClick={() => setSheet({ type: "fixed", payload: null })}>+ Nuevo</button>
                    </div>
                  </div>
                  <p className="cg-hint">
                    Alquiler, agua cada 2 meses, comunidad cada trimestre. Se anotan solos el día que les toca,
                    también si no has abierto la app en semanas. Puedes poner cualquiera en modo «me lo preguntas».
                  </p>

                  <input className="cg-input" style={{ marginBottom: 10 }} placeholder="Buscar por nombre o categoría…"
                    value={searchQFijos} onChange={(e) => setSearchQFijos(e.target.value)} aria-label="Buscar fijos" />

                  <div className="cg-pillbar">
                    <MenuOrdenar valor={ordenFijosGastos} onChange={setOrdenFijosGastos}
                      opciones={[["proximo", "Próximo cobro"], ["antiguo", "Más antiguo"], ["az", "A-Z"], ["periodicidad", "Periodicidad"]]} />
                    <MenuFiltrar grupos={gruposFiltro(recurringGastos, filtroFijosGastos)} seleccion={filtroFijosGastos} onChange={setFiltroFijosGastos} />
                  </div>

                  {fijosResultsGastos ? (
                    <>
                      {fijosResultsGastos.dadosDeAlta.length === 0 && fijosResultsGastos.historico.length === 0 ? (
                        <p className="cg-empty">Nada que se parezca a «{searchQFijos.trim()}».</p>
                      ) : (
                        <>
                          {fijosResultsGastos.dadosDeAlta.map(renderFijoItem)}
                          {fijosResultsGastos.historico.length > 0 && (
                            <>
                              <p className="cg-eyebrow" style={{ margin: "14px 0 4px" }}>Histórico</p>
                              {fijosResultsGastos.historico.map((m) => (
                                <button key={m.id} className="cg-item" onClick={() => setSheet({ type: "expense", payload: m })}>
                                  <div className="cg-badge" style={{ background: (catById[m.categoryId]?.color || "#888") + "22" }}>
                                    <CatMark c={catById[m.categoryId]} size={16} />
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <div className="cg-name">{m.name}</div>
                                    <div className="cg-meta">{catById[m.categoryId]?.name || "—"} · {stampLabel(m)}</div>
                                  </div>
                                  <span className="cg-amt">−{eur(m.amount)} €</span>
                                </button>
                              ))}
                            </>
                          )}
                        </>
                      )}
                    </>
                  ) : recurringGastos.length === 0 ? (
                    <p className="cg-empty">Sin fijos todavía.<br />Empieza por el alquiler, que suele ser el más fácil.</p>
                  ) : recurringGastosVisibles.length === 0 ? (
                    <p className="cg-empty">Ningún fijo con estos filtros.</p>
                  ) : (
                    <ExpandableList
                      items={recurringGastosVisibles}
                      expanded={expFijos}
                      onToggle={() => setExpFijos((v) => !v)}
                      renderItem={renderFijoItem}
                    />
                  )}

                  {modoEditarFijos && seleccionadosFijos.size > 0 && (
                    <div style={{ display: "flex", gap: 8, marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                      <button className="cg-ghost" style={{ flex: 1, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                        onClick={() => setMostrarMenuCamposFijos(true)}>
                        <i className="ti ti-edit" style={{ fontSize: 15 }} aria-hidden="true"></i>
                        Editar campos
                      </button>
                      <button className="cg-ghost danger" style={{ flex: 1, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                        onClick={borrarSeleccionadosFijos}>
                        <i className="ti ti-trash" style={{ fontSize: 15 }} aria-hidden="true"></i>
                        Borrar
                      </button>
                      <button className="cg-ghost" style={{ flex: 1, margin: 0 }} onClick={cancelarEdicionFijos}>Cancelar</button>
                    </div>
                  )}
                </div>

                {recurringGastos.length > 0 && (
                  <div className="cg-card">
                    <div className="cg-stats">
                      <button className="cg-stat" style={{ border: 0, textAlign: "left", cursor: "pointer" }}
                        onClick={() => setSheet({ type: "desgloseGastoFijo", payload: null })}>
                        <span className="cg-eyebrow" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          Gasto fijo al mes
                          <i className="ti ti-chevron-right" style={{ fontSize: 13 }} aria-hidden="true"></i>
                        </span>
                        <b>{eur(recurring.filter((r) => r.kind === "gasto" && r.active !== false && catById[r.categoryId]?.bucket !== "ahorro").reduce((s, r) => s + r.amount / (r.every || 1), 0))} €</b>
                      </button>
                      {recurring.some((r) => r.kind === "gasto" && r.active !== false && catById[r.categoryId]?.bucket === "ahorro") && (
                        <div className="cg-stat">
                          <span className="cg-eyebrow">Ahorro fijo</span>
                          <b>{eur(recurring.filter((r) => r.kind === "gasto" && r.active !== false && catById[r.categoryId]?.bucket === "ahorro").reduce((s, r) => s + r.amount / (r.every || 1), 0))} €</b>
                        </div>
                      )}
                    </div>
                    <p className="cg-hint" style={{ marginTop: 10, marginBottom: 0 }}>
                      Lo que tienes comprometido cada mes antes de gastar nada. Lo trimestral y lo anual va prorrateado,
                      así que un seguro de 600 € al año cuenta aquí como 50 € al mes.
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === "ingresos" && (
          <>
            <IncomeCard incomes={month.incomes} onAdd={addIncome} monthKey={monthKey}
              bancos={bancos} masUsadoBancoId={usoFormaPago.masUsadoBancoId} onAddBanco={saveBanco}
              formaPagoActivada={data.formaPagoActivada} />

            <div className="cg-toggle" style={{ marginBottom: 4 }}>
              <button className={vistaIngresos === "movimientos" ? "on" : ""} onClick={() => setVistaIngresos("movimientos")}>Movimientos</button>
              <button className={vistaIngresos === "fijos" ? "on" : ""} onClick={() => setVistaIngresos("fijos")}>Fijos</button>
            </div>

            {vistaIngresos === "movimientos" ? (
            <div className="cg-card">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <h2 className="cg-title">Movimientos</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="cg-eyebrow">
                    {modoEditarIngresos
                      ? (seleccionadosIngresos.size > 0 ? `${seleccionadosIngresos.size} seleccionado${seleccionadosIngresos.size === 1 ? "" : "s"}` : "Elige apuntes")
                      : `${month.incomes.length} ${month.incomes.length === 1 ? "ingreso" : "ingresos"}`}
                  </span>
                  {month.incomes.length > 0 && (
                    <button className="cg-vermas" onClick={() => (modoEditarIngresos ? cancelarEdicionIngresos() : setModoEditarIngresos(true))}>
                      {modoEditarIngresos ? "Cancelar" : "Editar"}
                    </button>
                  )}
                </div>
              </div>

              <input className="cg-input" style={{ marginBottom: 10 }} placeholder="Buscar por concepto…"
                value={searchQIngresos} onChange={(e) => setSearchQIngresos(e.target.value)} aria-label="Buscar ingresos" />

              <div className="cg-pillbar">
                <MenuOrdenar valor={ordenIngresos} onChange={setOrdenIngresos}
                  opciones={[["reciente", "Más reciente"], ["antiguo", "Más antiguo"], ["az", "A-Z"]]} />
              </div>

              {searchQIngresos.trim() ? (
                searchResultsIngresos.length === 0 ? (
                  <p className="cg-empty">Nada que se parezca a «{searchQIngresos.trim()}».</p>
                ) : (
                  searchResultsIngresos.map((m) => renderMovItem(m, true, {
                    modoEditar: modoEditarIngresos, seleccionSet: seleccionadosIngresos, onToggle: toggleSeleccionIngresos,
                  }))
                )
              ) : groupedIngresos.length === 0 ? (
                <p className="cg-empty">Todavía no hay ingresos en {monthLabel(monthKey).toLowerCase()}.</p>
              ) : (
                <>
                  {firstGroupedIngresos.map(([date, items]) => (
                    <div key={date}>
                      {date !== "__az__" && <div className="cg-day">{dayLabel(date)}</div>}
                      {items.map((m) => renderMovItem(m, date === "__az__", {
                        modoEditar: modoEditarIngresos, seleccionSet: seleccionadosIngresos, onToggle: toggleSeleccionIngresos,
                      }))}
                    </div>
                  ))}

                  {restCountIngresos > 0 && (
                    <div style={{ textAlign: "center", marginTop: 8 }}>
                      <button className="cg-vermas" onClick={() => setShowAllMovIngresos((v) => !v)}>
                        {showAllMovIngresos ? "Ver menos" : `Ver más (${restCountIngresos})`}
                      </button>
                    </div>
                  )}

                  {showAllMovIngresos && restGroupedIngresos.map(([date, items]) => (
                    <div key={`rest-${date}`}>
                      {date !== "__az__" && <div className="cg-day">{dayLabel(date)}</div>}
                      {items.map((m) => renderMovItem(m, date === "__az__", {
                        modoEditar: modoEditarIngresos, seleccionSet: seleccionadosIngresos, onToggle: toggleSeleccionIngresos,
                      }))}
                    </div>
                  ))}
                </>
              )}

              {modoEditarIngresos && seleccionadosIngresos.size > 0 && (
                <div style={{ display: "flex", gap: 8, marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                  <button className="cg-ghost" style={{ flex: 1, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    onClick={() => setMostrarEditarFechaIngresos(true)}>
                    <i className="ti ti-calendar" style={{ fontSize: 15 }} aria-hidden="true"></i>
                    Cambiar fecha
                  </button>
                  <button className="cg-ghost danger" style={{ flex: 1, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    onClick={borrarSeleccionadosIngresos}>
                    <i className="ti ti-trash" style={{ fontSize: 15 }} aria-hidden="true"></i>
                    Borrar
                  </button>
                  <button className="cg-ghost" style={{ flex: 1, margin: 0 }} onClick={cancelarEdicionIngresos}>Cancelar</button>
                </div>
              )}
            </div>
            ) : (
              <>
                <div className="cg-card">
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <h2 className="cg-title">Ingresos fijos</h2>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {recurringIngresos.length > 0 && (
                        <button className="cg-vermas" onClick={() => (modoEditarFijos ? cancelarEdicionFijos() : setModoEditarFijos(true))}>
                          {modoEditarFijos ? "Cancelar" : "Editar"}
                        </button>
                      )}
                      <button className="cg-ghost" onClick={() => setSheet({ type: "fixed", payload: null, defaultKind: "ingreso" })}>+ Nuevo</button>
                    </div>
                  </div>
                  <p className="cg-hint">
                    La nómina y cualquier otro ingreso que se repita. Se anota solo el día que le toca,
                    también si no has abierto la app en semanas.
                  </p>

                  {recurringIngresos.length === 0 ? (
                    <p className="cg-empty">Sin ingresos fijos todavía.<br />Empieza por la nómina.</p>
                  ) : (
                    <>
                      <div className="cg-pillbar">
                        <MenuOrdenar valor={ordenFijosIngresos} onChange={setOrdenFijosIngresos}
                          opciones={[["proximo", "Próximo cobro"], ["antiguo", "Más antiguo"], ["az", "A-Z"], ["periodicidad", "Periodicidad"]]} />
                      </div>
                      <ExpandableList
                        items={recurringIngresos}
                        expanded={expFijosIngresos}
                        onToggle={() => setExpFijosIngresos((v) => !v)}
                        renderItem={renderFijoItem}
                      />
                    </>
                  )}

                  {modoEditarFijos && seleccionadosFijos.size > 0 && (
                    <div style={{ display: "flex", gap: 8, marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                      <button className="cg-ghost danger" style={{ flex: 1, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                        onClick={borrarSeleccionadosFijos}>
                        <i className="ti ti-trash" style={{ fontSize: 15 }} aria-hidden="true"></i>
                        Borrar
                      </button>
                      <button className="cg-ghost" style={{ flex: 1, margin: 0 }} onClick={cancelarEdicionFijos}>Cancelar</button>
                    </div>
                  )}
                </div>

                {recurringIngresos.length > 0 && (
                  <div className="cg-card">
                    <div className="cg-stats">
                      <div className="cg-stat">
                        <span className="cg-eyebrow">Ingresos mensuales aproximados</span>
                        <b>{eur(recurring.filter((r) => r.kind === "ingreso" && r.active !== false).reduce((s, r) => s + r.amount / (r.every || 1), 0))} €</b>
                      </div>
                    </div>
                    <p className="cg-hint" style={{ marginTop: 10, marginBottom: 0 }}>
                      Lo trimestral y lo anual va prorrateado, así que una paga extra de 1.200 € repartida en 6
                      meses cuenta aquí como 200 € al mes.
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === "resumen" && (
          <>
            <p style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 10px" }}>
              Ahora mismo
            </p>

            <div className="cg-card">
              <div className="cg-stats">
                <div className="cg-stat"><span className="cg-eyebrow">Recibido</span><b>{eur(ciclo ? ciclo.income : income)} €</b></div>
                <div className="cg-stat"><span className="cg-eyebrow">Gastado</span><b>{eur(ciclo ? ciclo.spent : spent)} €</b></div>
                <div className="cg-stat" style={{ background: (ciclo ? ciclo.left : left) < 0 ? "#F7E9E6" : "#E6F1FB" }}>
                  <span className="cg-eyebrow">Queda</span><b style={{ color: (ciclo ? ciclo.left : left) < 0 ? "var(--red)" : "var(--pine)" }}>{eur(ciclo ? ciclo.left : left)} €</b>
                </div>
              </div>
              {ciclo && (
                <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10, marginBottom: 0 }}>
                  Del {shortDate(ciclo.inicio)} al {shortDate(ciclo.fin)}, tu ciclo de nómina — no del 1 al fin de mes.
                </p>
              )}
              {(() => {
                const gastoTotal = ciclo ? ciclo.spent : spent;
                const gastoFijo = ciclo ? ciclo.spentFijo : spentFijo;
                const gastoVariable = ciclo ? ciclo.spentVariable : spentVariable;
                const diasTranscurridos = ciclo ? ciclo.diasTranscurridos : new Date().getDate();
                const diasTotales = ciclo ? ciclo.diasTotales : daysInMonth;
                if (!isCurrentMonth || gastoTotal <= 0) return null;
                const media = gastoVariable / diasTranscurridos;
                const proyeccion = gastoFijo + media * diasTotales;
                return (
                  <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 12, marginBottom: 0 }}>
                    Media de {eur(media)} € al día en gasto variable
                    {gastoFijo > 0 ? ` (aparte, ${eur(gastoFijo)} € en fijos ya pagados este ${ciclo ? "ciclo" : "mes"})` : ""}.
                    {" "}A este ritmo {ciclo ? "cerrarás el ciclo" : "cerrarás el mes"} en{" "}
                    <b style={{ fontFamily: "var(--mono)" }}>{eur(proyeccion)} €</b>.
                  </p>
                );
              })()}
            </div>

            {!oculto && coachMsg && <CoachBox msg={coachMsg} />}

            <p style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", margin: "18px 0 10px" }}>
              Cómo se reparte
            </p>

            <div className="cg-card">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <h2 className="cg-title">Gasto por categoría</h2>
              </div>
              <div className="cg-toggle" style={{ marginBottom: 10 }}>
                <button className={filtroCategoria === "todos" ? "on" : ""} onClick={() => setFiltroCategoria("todos")}>Todos</button>
                <button className={filtroCategoria === "variables" ? "on" : ""} onClick={() => setFiltroCategoria("variables")}>Variables</button>
                <button className={filtroCategoria === "fijos" ? "on" : ""} onClick={() => setFiltroCategoria("fijos")}>Fijos</button>
              </div>
              {byCategory.length === 0 ? (
                <p className="cg-empty">Sin datos que dibujar todavía{filtroCategoria !== "todos" ? " con este filtro" : ""}.</p>
              ) : (
                <>
                  <Donut slices={byCategory} total={byCategory.reduce((s, c) => s + c.total, 0)} onPick={(id) => setSheet({ type: "detail", payload: catById[id] })} />
                  <p className="cg-hint">
                    Toca una categoría para ver todos sus gastos con día y hora.
                    {saved > 0 ? " El ahorro no entra en este reparto." : ""}
                  </p>
                  <ExpandableList
                    items={byCategory}
                    expanded={expByCategory}
                    onToggle={() => setExpByCategory((v) => !v)}
                    renderItem={(c) => {
                      const pct = spent > 0 ? (c.total / spent) * 100 : 0;
                      const overBudget = c.budget && c.total > c.budget;
                      const barBase = Math.max(byCategory[0].total, c.budget || 0);
                      return (
                        <button key={c.id} className="cg-catrow" onClick={() => setSheet({ type: "detail", payload: c })}>
                          <div className="cg-catline">
                            <span><CatMark c={c} size={16} /></span>
                            <span style={{ fontWeight: 500 }}>{c.name}</span>
                            <span className="cg-pct" style={{ fontFamily: "var(--mono)" }}>
                              {eur(c.total)} € · {pct.toFixed(0)}%
                            </span>
                          </div>
                          <div className="cg-track">
                            <div className="cg-fill" style={{ width: `${(c.total / barBase) * 100}%`, background: overBudget ? "var(--red)" : c.color }} />
                            {c.budget ? <div className="cg-limit" style={{ left: `${Math.min(100, (c.budget / barBase) * 100)}%` }} /> : null}
                          </div>
                          {c.budget ? (
                            <div className="cg-meta" style={{ color: overBudget ? "var(--red)" : "var(--muted)" }}>
                              {overBudget
                                ? `${eur(c.total - c.budget)} € por encima del límite de ${eur(c.budget)} €`
                                : `Quedan ${eur(c.budget - c.total)} € de ${eur(c.budget)} €`}
                            </div>
                          ) : null}
                        </button>
                      );
                    }}
                  />
                </>
              )}
            </div>

            {data.formaPagoActivada !== false && (gastoPorFormaPago.efectivo > 0 || gastoPorFormaPago.bizum > 0 || Object.keys(gastoPorFormaPago.porBanco).length > 0 || Object.keys(gastoPorFormaPago.porBancoDomiciliado).length > 0 || gastoPorFormaPago.sinEspecificar > 0) && (
              <div className="cg-card">
                <h2 className="cg-title">Gasto por forma de pago</h2>
                <div style={{ marginTop: 6 }}>
                  {gastoPorFormaPago.efectivo > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "0.5px solid var(--line)" }}>
                      <span style={{ fontSize: 13 }}><i className="ti ti-cash" style={{ fontSize: 15, marginRight: 5, verticalAlign: -2 }} aria-hidden="true"></i>Efectivo</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{eur(gastoPorFormaPago.efectivo)} €</span>
                    </div>
                  )}
                  {gastoPorFormaPago.bizum > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "0.5px solid var(--line)" }}>
                      <span style={{ fontSize: 13 }}><i className="ti ti-device-mobile" style={{ fontSize: 15, marginRight: 5, verticalAlign: -2 }} aria-hidden="true"></i>Bizum/Transferencia</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{eur(gastoPorFormaPago.bizum)} €</span>
                    </div>
                  )}
                  {bancos.filter((b) => gastoPorFormaPago.porBanco[b.id] > 0).map((b) => (
                    <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "0.5px solid var(--line)" }}>
                      <span style={{ fontSize: 13 }}><i className="ti ti-building-bank" style={{ fontSize: 15, marginRight: 5, verticalAlign: -2 }} aria-hidden="true"></i>{b.name}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{eur(gastoPorFormaPago.porBanco[b.id])} €</span>
                    </div>
                  ))}
                  {bancos.filter((b) => gastoPorFormaPago.porBancoDomiciliado[b.id] > 0).map((b) => (
                    <div key={`dom-${b.id}`} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "0.5px solid var(--line)" }}>
                      <span style={{ fontSize: 13 }}><i className="ti ti-repeat" style={{ fontSize: 15, marginRight: 5, verticalAlign: -2 }} aria-hidden="true"></i>{b.name} · domiciliado</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{eur(gastoPorFormaPago.porBancoDomiciliado[b.id])} €</span>
                    </div>
                  ))}
                  {gastoPorFormaPago.sinEspecificar > 0 && (
                    <button onClick={() => setSheet({ type: "sinEspecificar", payload: null })}
                      style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "6px 0", border: 0, background: "transparent", cursor: "pointer" }}>
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>Sin especificar</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--muted)" }}>{eur(gastoPorFormaPago.sinEspecificar)} €</span>
                        <i className="ti ti-chevron-right" style={{ fontSize: 14, color: "var(--muted)" }} aria-hidden="true"></i>
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {savingCats.length > 0 && (
              <div className="cg-card">
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: saved > 0 ? 8 : 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <i className="ti ti-moneybag" style={{ fontSize: 16, color: "var(--pine)" }} aria-hidden="true"></i>
                    <h2 className="cg-title" style={{ margin: 0 }}>Ahorro</h2>
                  </span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 15 }}>{eur(saved)} €</span>
                </div>
                {saved > 0 && (
                  <p className="cg-hint" style={{ marginTop: 0, marginBottom: 10 }}>
                    Más {eur(saved)} € apartados al ahorro, que también salen del disponible pero no cuentan como gasto.
                  </p>
                )}
                {savingCats.map((c) => (
                  <button key={c.id} className="cg-item" onClick={() => setSheet({ type: "detail", payload: c })}>
                    <div className="cg-badge" style={{ background: c.color + "22" }}><CatMark c={c} size={18} /></div>
                    <div style={{ minWidth: 0 }}>
                      <div className="cg-name">{c.name}</div>
                      <div className="cg-meta">
                        {c.budget
                          ? (c.total >= c.budget
                            ? `objetivo de ${eur(c.budget)} € cumplido`
                            : `te faltan ${eur(c.budget - c.total)} € para el objetivo de ${eur(c.budget)} €`)
                          : `${((c.total / (income || 1)) * 100).toFixed(0)}% de lo recibido`}
                      </div>
                    </div>
                    <span className="cg-amt">{eur(c.total)} €</span>
                  </button>
                ))}
              </div>
            )}

            <Split503020 income={income} expenses={month.expenses} catById={catById} />

            <p style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", margin: "18px 0 10px" }}>
              Cómo cambia con el tiempo
            </p>

            <MonthCompare monthKey={monthKey} months={data.months} categories={categories} onJump={setMonthKey} />

            <Forecast monthKey={monthKey} months={data.months} recurring={recurring} categories={categories} />

            <div className="cg-card">
              <h2 className="cg-title">Exportar</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="cg-ghost" onClick={() => exportCSV("mes")}>CSV de este mes</button>
                <button className="cg-ghost" onClick={() => exportCSV("todo")}>CSV de todo</button>
              </div>
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 10, marginBottom: 0 }}>
                Separado por punto y coma, listo para abrir en Excel en español.
              </p>
            </div>
          </>
        )}

        {tab === "metas" && (
          <>
            <div className="cg-card">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <h2 className="cg-title">Metas</h2>
                <button className="cg-ghost" onClick={() => setSheet({ type: "meta", payload: null })}>+ Nueva</button>
              </div>
              {metasNormales.length === 0 ? (
                <p className="cg-empty">Sin metas todavía.<br />Un objetivo de ahorro (un viaje, un coche) o una deuda a pagar — lo que sea, con su propio hueco.</p>
              ) : (
                <ExpandableList
                  items={metasNormales}
                  expanded={expMetas}
                  onToggle={() => setExpMetas((v) => !v)}
                  renderItem={(m) => (
                    <MetaRow key={m.id} meta={m} cat={catById[m.categoryId]} aportado={metaProgreso[m.id] || 0}
                      onOpen={(meta) => setSheet({ type: "meta", payload: meta })}
                      onToggleRecorte={toggleRecorte} />
                  )}
                />
              )}
            </div>

            {metasPeriodicas.length > 0 && (
              <div className="cg-card">
                <button onClick={() => setExpGastosPeriodicos((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", border: 0, background: "transparent", padding: 0, cursor: "pointer", textAlign: "left" }}>
                  <div className="cg-badge" style={{ background: "#E7EBE4" }}>
                    <CatMark c={{ id: "gastos-periodicos-compartida" }} size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cg-name">Gastos periódicos</div>
                    <div className="cg-meta">{metasPeriodicas.length} {metasPeriodicas.length === 1 ? "gasto" : "gastos"} · apartar este mes</div>
                  </div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 17, fontWeight: 600, color: "var(--pine)" }}>
                    {eur(metasPeriodicas.reduce((s, m) => s + (m.total / m.plazoMeses), 0))} €
                  </span>
                  <i className={`ti ti-chevron-${expGastosPeriodicos ? "down" : "right"}`} style={{ fontSize: 16, color: "var(--muted)" }} aria-hidden="true"></i>
                </button>
                {expGastosPeriodicos && (
                  <div style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 14 }}>
                    {(() => {
                      const necesarioMes = metasPeriodicas.reduce((s, m) => s + (m.total / m.plazoMeses), 0);
                      const aportadoMes = metasPeriodicas.reduce((s, m) => s + (metaProgreso[m.id] || 0), 0);
                      const pctMes = necesarioMes > 0 ? Math.min(100, Math.round((aportadoMes / necesarioMes) * 100)) : 0;
                      const completo = pctMes >= 100;
                      return (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13, marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, color: "var(--ink)" }}>
                              {completo ? "Completado este mes 🎉" : "Este mes, en conjunto"}
                            </span>
                            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: completo ? "var(--pine)" : "var(--muted)" }}>
                              {eur(aportadoMes)} / {eur(necesarioMes)} € · {pctMes}%
                            </span>
                          </div>
                          <div style={{ height: 8, borderRadius: 4, background: "#E7EBE4", overflow: "hidden" }}>
                            <div style={{ width: `${pctMes}%`, height: "100%", background: completo ? "var(--saffron)" : "var(--pine)" }}></div>
                          </div>
                        </div>
                      );
                    })()}
                    {metasPeriodicas.map((m) => {
                      const aportado = metaProgreso[m.id] || 0;
                      const pct = m.total > 0 ? Math.min(100, Math.round((aportado / m.total) * 100)) : 0;
                      const borrar = () => {
                        if (!window.confirm(`¿Borrar «${m.name}» de Gastos periódicos? No se puede deshacer.`)) return;
                        deleteMeta(m.id);
                      };
                      return (
                        <SwipeableRow key={m.id} onDelete={borrar}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, background: "var(--card)" }}>
                            <button onClick={() => setSheet({ type: "meta", payload: m })}
                              style={{ flex: 1, display: "block", border: 0, background: "transparent", padding: 0, cursor: "pointer", textAlign: "left" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13, marginBottom: 4 }}>
                                <span style={{ color: "var(--ink)" }}>{m.name}</span>
                                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>
                                  {eur(aportado)} / {eur(m.total)} € · {pct}%
                                </span>
                              </div>
                              <div style={{ height: 6, borderRadius: 3, background: "#E7EBE4", overflow: "hidden" }}>
                                <div style={{ width: `${pct}%`, height: "100%", background: "var(--pine)" }}></div>
                              </div>
                            </button>
                            <button onClick={borrar} aria-label={`Borrar ${m.name}`}
                              style={{ border: 0, background: "transparent", padding: 4, cursor: "pointer", color: "var(--muted)", flexShrink: 0 }}>
                              <i className="ti ti-x" style={{ fontSize: 15 }} aria-hidden="true"></i>
                            </button>
                          </div>
                        </SwipeableRow>
                      );
                    })}
                    <button className="cg-ghost" style={{ width: "100%", margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                      onClick={() => { setTab("gastos"); setVistaGastos("movimientos"); setPrefillNonce((n) => n + 1); }}>
                      <i className="ti ti-plus" style={{ fontSize: 14 }} aria-hidden="true"></i>
                      Añadir gasto periódico
                    </button>
                  </div>
                )}
              </div>
            )}

            <p className="cg-hint" style={{ padding: "0 4px" }}>
              Cada meta tiene su propia categoría: cualquier gasto que anotes ahí (a mano, o desde un Fijo que la
              apunte) descuenta solo de su pendiente. Si tienes un Fijo relacionado (como una hipoteca), edítalo en
              la pestaña Fijos y cámbiale la categoría a la de la meta nueva.
            </p>
          </>
        )}

        {tab === "ajustes" && (
          <>
            <GrupoAjustes id="vista" icono="ti-adjustments" titulo="Cómo se ve la app"
              resumen={heroModo === "gastado" ? "Gastado" : "Disponible"}
              abierto={grupoAbierto} onToggle={setGrupoAbierto}>

              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>Número protagonista</h3>
                <p className="cg-hint" style={{ marginBottom: 10 }}>
                  El número grande de la pantalla principal. Sigue en blanco a menos que te pases de gasto,
                  sea cual sea el que elijas.
                </p>
                <div className="cg-toggle">
                  <button className={heroModo === "disponible" ? "on" : ""} onClick={() => setData((d) => ({ ...d, heroModo: "disponible" }))}>Disponible</button>
                  <button className={heroModo === "gastado" ? "on" : ""} onClick={() => setData((d) => ({ ...d, heroModo: "gastado" }))}>Gastado</button>
                </div>
              </div>

              <div style={{ marginBottom: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>Modo</h3>
                <p className="cg-hint" style={{ marginBottom: 10 }}>
                  Coach muestra mensajes de ánimo y comparaciones con meses anteriores. Gastos se queda solo con los números.
                </p>
                <div className="cg-toggle">
                  <button className={modoCoach ? "on" : ""} onClick={() => setModoCoach(true)}>Coach</button>
                  <button className={!modoCoach ? "on" : ""} onClick={() => setModoCoach(false)}>Gastos</button>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>Ciclo de nómina</h3>
                <p className="cg-hint" style={{ marginBottom: 10 }}>
                  ¿Te gustaría que el dinero que se muestra sea desde el día que recibes
                  el salario, en vez de del 1 al fin de mes?
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input className="cg-input num" style={{ maxWidth: 70 }} inputMode="numeric"
                    placeholder="—" value={diaCobro || ""}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "");
                      setDiaCobro(v ? Math.min(28, Math.max(1, parseInt(v, 10))) : null);
                    }} />
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>día del mes en que cobras (1–28)</span>
                </div>
                {diaCobro && (
                  <button className="cg-ghost" style={{ marginTop: 10 }} onClick={() => setDiaCobro(null)}>
                    Quitar, volver al mes natural
                  </button>
                )}
                <p className="cg-hint" style={{ marginTop: 10, marginBottom: 0 }}>
                  Solo cambia el número de Disponible/Gastado. Los Fijos y la Previsión siguen contando
                  siempre por calendario — un recibo vence el día que le toca, cobres cuando cobres.
                </p>
              </div>
            </GrupoAjustes>

            <GrupoAjustes id="dinero" icono="ti-wallet" titulo="Dinero" resumen="Categorías, forma de pago, ajuste"
              abierto={grupoAbierto} onToggle={setGrupoAbierto} padTop={4}>

              <button onClick={() => setSubDinero((v) => (v === "categorias" ? null : "categorias"))}
                style={{ display: "flex", alignItems: "center", width: "100%", padding: "10px 0", border: 0, background: "transparent", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", flex: 1 }}>Límites Categorías</span>
                <i className={`ti ti-chevron-${subDinero === "categorias" ? "down" : "right"}`} style={{ fontSize: 15, color: "var(--muted)" }} aria-hidden="true"></i>
              </button>
              {subDinero === "categorias" && (
                <div style={{ marginBottom: 6, paddingBottom: 10 }}>
                  <div style={{ textAlign: "right", marginBottom: 8 }}>
                    <button className="cg-ghost" style={{ width: "auto", margin: 0, padding: "4px 10px", fontSize: 12 }}
                      onClick={() => setSheet({ type: "cat", payload: null })}>+ Nueva</button>
                  </div>
                  <ExpandableList
                    items={[...categories].sort((a, b) => a.name.localeCompare(b.name, "es"))}
                    expanded={expCatLimites}
                    onToggle={() => setExpCatLimites((v) => !v)}
                    renderItem={(c) => (
                      <button key={c.id} className="cg-item" onClick={() => setSheet({ type: "cat", payload: c })}>
                        <div className="cg-badge" style={{ background: c.color + "22" }}><CatMark c={c} size={18} /></div>
                        <div style={{ minWidth: 0 }}>
                          <div className="cg-name">{c.name}</div>
                          <div className="cg-meta">
                            {BUCKETS.find((b) => b.id === (c.bucket || "deseo"))?.label}
                            {c.budget ? ` · límite ${eur(c.budget)} €` : ""}
                          </div>
                        </div>
                        <span className="cg-amt" style={{ color: "var(--muted)", fontSize: 12 }}>editar</span>
                      </button>
                    )}
                  />
                </div>
              )}

              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 4 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>Forma de pago</h3>
                <p className="cg-hint" style={{ marginBottom: 10 }}>
                  Diferenciar si un gasto fue en efectivo, tarjeta, Bizum/Transferencia o domiciliado.
                  Si lo desactivas, ese selector desaparece de toda la app — nada se borra, solo deja de pedirse.
                </p>
                <div className="cg-toggle">
                  <button className={data.formaPagoActivada !== false ? "on" : ""}
                    onClick={() => setData((d) => ({ ...d, formaPagoActivada: true }))}>Activado</button>
                  <button className={data.formaPagoActivada === false ? "on" : ""}
                    onClick={() => setData((d) => ({ ...d, formaPagoActivada: false }))}>Desactivado</button>
                </div>
              </div>

              {data.formaPagoActivada !== false && (
              <button onClick={() => setSubDinero((v) => (v === "formapago" ? null : "formapago"))}
                style={{ display: "flex", alignItems: "center", width: "100%", padding: "10px 0", border: 0, borderTop: "1px solid var(--line)", background: "transparent", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", flex: 1 }}>Forma de pago por defecto</span>
                <i className={`ti ti-chevron-${subDinero === "formapago" ? "down" : "right"}`} style={{ fontSize: 15, color: "var(--muted)" }} aria-hidden="true"></i>
              </button>
              )}
              {data.formaPagoActivada !== false && subDinero === "formapago" && (
                <div style={{ marginBottom: 6, paddingBottom: 10 }}>
                  <p className="cg-hint" style={{ marginBottom: 12 }}>
                    Se marca sola al anotar un gasto nuevo, para no tener que elegirla cada vez.
                    Siempre la puedes cambiar en ese gasto.
                  </p>
                  <div style={{ marginBottom: 10 }}>
                    <FormaPagoToggle formaPago={data.formaPagoDefecto}
                      onEfectivo={() => setData((d) => ({ ...d, formaPagoDefecto: "efectivo", bancoDefectoId: null }))}
                      onBizum={() => setData((d) => ({ ...d, formaPagoDefecto: "bizum", bancoDefectoId: null }))}
                      onTarjeta={() => { setData((d) => ({ ...d, formaPagoDefecto: "banco" })); setMostrarPickerDefecto(true); }}
                      onDomiciliado={() => { setData((d) => ({ ...d, formaPagoDefecto: "domiciliado" })); setMostrarPickerDefecto(true); }} />
                  </div>
                  {(data.formaPagoDefecto === "banco" || data.formaPagoDefecto === "domiciliado") && bancos.length > 0 && (
                    mostrarPickerDefecto ? (
                      <BancoPicker bancos={bancos} masUsadoId={usoFormaPago.masUsadoBancoId} selectedId={data.bancoDefectoId}
                        onAddNuevo={saveBanco}
                        onSelect={(id) => { setData((d) => ({ ...d, bancoDefectoId: id })); setMostrarPickerDefecto(false); }} />
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: "#E6F1FB", marginBottom: 10 }}>
                        <span style={{ fontSize: 14 }}>{bancoById[data.bancoDefectoId]?.name || "Elige tu banco…"}</span>
                        <button className="cg-vermas" onClick={() => setMostrarPickerDefecto(true)}>cambiar</button>
                      </div>
                    )
                  )}
                  {data.formaPagoDefecto && (
                    <div style={{ textAlign: "center" }}>
                      <button className="cg-vermas" onClick={() => setData((d) => ({ ...d, formaPagoDefecto: null, bancoDefectoId: null }))}>
                        Quitar, decidirlo cada vez
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button onClick={() => setSubDinero((v) => (v === "ajuste" ? null : "ajuste"))}
                style={{ display: "flex", alignItems: "center", width: "100%", padding: "10px 0", border: 0, borderTop: "1px solid var(--line)", background: "transparent", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", flex: 1 }}>Ajuste de saldo</span>
                <i className={`ti ti-chevron-${subDinero === "ajuste" ? "down" : "right"}`} style={{ fontSize: 15, color: "var(--muted)" }} aria-hidden="true"></i>
              </button>
              {subDinero === "ajuste" && (
                <div style={{ marginBottom: 6, paddingBottom: 10, marginTop: 10 }}>
                  <AjusteSaldoCard ajuste={ajuste} onSave={saveAjuste} />
                </div>
              )}

              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>Gastos periódicos</h3>
                <p className="cg-hint" style={{ marginBottom: 10 }}>
                  Ayuda a separar dinero cada mes para tus gastos que no son mensuales (seguros, comunidad…),
                  para no notar el golpe cuando llega el cobro.
                </p>
                <div className="cg-toggle">
                  <button className={data.gastosPeriodicosActivado === true ? "on" : ""}
                    onClick={activarGastosPeriodicos}>Activado</button>
                  <button className={data.gastosPeriodicosActivado !== true ? "on" : ""}
                    onClick={() => setData((d) => ({ ...d, gastosPeriodicosActivado: false }))}>Desactivado</button>
                </div>
              </div>
            </GrupoAjustes>

            <GrupoAjustes id="datos" icono="ti-shield-lock" titulo="Datos y privacidad" resumen="Copia, contraseña, borrar"
              abierto={grupoAbierto} onToggle={setGrupoAbierto}>

              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>Copia de seguridad</h3>
                <p className="cg-hint">
                  Los datos viven en este dispositivo. Guarda una copia de vez en cuando y la podrás restaurar aquí
                  o abrirla en otro móvil. La copia va sin cifrar, para que siempre puedas recuperarla: guárdala
                  en un sitio tuyo, no en una carpeta compartida.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="cg-ghost" onClick={backup}>Guardar copia</button>
                  <button className="cg-ghost" onClick={() => fileRef.current?.click()}>Restaurar copia</button>
                </div>
                <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }}
                  onChange={(e) => { restore(e.target.files?.[0]); e.target.value = ""; }} />
                <p className="cg-hint" style={{ marginTop: 10, marginBottom: 0 }}>
                  {diasSinCopia === null
                    ? "Todavía no has hecho ninguna copia."
                    : diasSinCopia === 0
                      ? "Última copia: hoy."
                      : `Última copia: hace ${diasSinCopia} ${diasSinCopia === 1 ? "día" : "días"}.`}
                </p>
              </div>

              <div style={{ marginBottom: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>Seguridad</h3>
                {!cryptoOk() ? (
                  <p className="cg-hint" style={{ margin: 0 }}>
                    Este navegador no permite cifrar. Abre la app desde su icono en la pantalla de inicio.
                  </p>
                ) : protegido ? (
                  <>
                    <p className="cg-hint">
                      Protegida: pide contraseña al abrir y los datos están cifrados en el dispositivo.
                      Se vuelve a bloquear sola si pasa un minuto en segundo plano.
                    </p>
                    <div className="cg-fixedrow" style={{ borderTop: "1px solid var(--line)" }}>
                      <div className="cg-badge" style={{ background: bioOn ? "#E6F1FB" : "#E7EBE4" }}>
                        {bioOn ? "✓" : "☺"}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="cg-name">Face ID o Touch ID</div>
                        <div className="cg-meta">
                          {bioOn ? "activado" : bioAvail ? "abrir sin teclear la contraseña" : "no disponible en este navegador"}
                        </div>
                      </div>
                      <button className="cg-ghost" disabled={!bioAvail}
                        onClick={async () => {
                          if (bioOn) { await disableBio(); return; }
                          const r = await enableBio();
                          if (r === "sin-prf") window.alert("Este dispositivo permite Face ID pero no la función que hace falta para descifrar (extensión PRF). Necesitas iOS 18 o superior con el llavero de iCloud activado.");
                          else if (r === "error") window.alert("No se pudo activar. Inténtalo otra vez.");
                        }}>
                        {bioOn ? "Quitar" : "Activar"}
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                      <button className="cg-ghost" onClick={lockNow}>Bloquear ahora</button>
                      <button className="cg-ghost" onClick={() => setSheet({ type: "seg", payload: "change" })}>Cambiar contraseña</button>
                      <button className="cg-ghost danger" onClick={() => setSheet({ type: "seg", payload: "off" })}>Quitar protección</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="cg-hint">
                      Sin protección: quien coja este móvil desbloqueado puede abrir la app y verlo todo.
                      Puedes pedir contraseña al abrir y cifrar los datos guardados.
                    </p>
                    <button className="cg-ghost" onClick={() => setSheet({ type: "seg", payload: "on" })}>Proteger con contraseña</button>
                  </>
                )}
              </div>

              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>Borrar todos los datos</h3>
                <button className="cg-ghost danger" onClick={wipe}>Borrar todos los datos</button>
              </div>

              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>Aviso de Privacidad</h3>
                <button className="cg-ghost" onClick={() => setSheet({ type: "privacidad", payload: null })}>Ver Aviso de Privacidad</button>
              </div>
            </GrupoAjustes>

            <GrupoAjustes id="ayuda" icono="ti-help-circle" titulo="Ayuda y app" resumen="Feedback, compartir, versión"
              abierto={grupoAbierto} onToggle={setGrupoAbierto}>

              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>Feedback</h3>
                <p className="cg-hint">
                  ¿Falta algo, algo no funciona bien, o se te ocurre una mejora? Escribe directamente al admin.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <a className="cg-ghost" style={{ textAlign: "center", textDecoration: "none" }}
                    href={`mailto:rodrigoharmat@gmail.com?subject=Feedback%20${encodeURIComponent(APP_NAME)}`}>Escribir al admin</a>
                  <button className="cg-ghost" onClick={compartirAppClick}>Compartir esta app</button>
                </div>
              </div>

              <div style={{ marginBottom: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>Detección automática</h3>
                <p style={{ fontSize: 13.5, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
                  Al escribir el concepto se propone una categoría. Si la corriges, la app aprende esa palabra
                  y la próxima vez acierta. Ha aprendido {Object.keys(data.learned).length} palabras.
                </p>
              </div>

              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, textAlign: "center" }}>
                <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", margin: "0 0 6px" }}>
                  {APP_NAME} v{APP_VERSION}
                </p>
                {"serviceWorker" in navigator && (
                  <button className="cg-ghost" style={{ width: "auto", margin: 0, padding: "6px 14px", fontSize: 12 }}
                    onClick={async () => {
                      try {
                        const reg = await navigator.serviceWorker.getRegistration();
                        await reg?.update();
                      } finally {
                        window.location.reload();
                      }
                    }}>
                    Buscar actualizaciones
                  </button>
                )}
              </div>
            </GrupoAjustes>
          </>
        )}

        <div className="cg-foot">Tus datos se guardan solo en este dispositivo</div>
      </div>

      {sheet?.type === "cat" && (
        <CategoryEditor
          category={sheet.payload}
          expenseCount={sheet.payload
            ? Object.values(data.months).reduce((n, m) => n + m.expenses.filter((e) => e.categoryId === sheet.payload.id).length, 0)
            : 0}
          onSave={saveCategory}
          onDelete={deleteCategory}
          onClose={() => { setSheet(null); setExpCatLimites(false); }}
        />
      )}

      {sheet?.type === "meta" && (
        <MetaEditor
          meta={sheet.payload}
          aportado={sheet.payload ? (metaProgreso[sheet.payload.id] || 0) : 0}
          ingresoMensualEstimado={ingresoMensualEstimado}
          necesidadFija={necesidadFijaMensual(sheet.payload?.categoryId)}
          necesidadVariable={necesidadVariableHistorica(sheet.payload?.categoryId)}
          byCategoryDeseo={byCategory.filter((c) => c.bucket === "deseo")}
          onSave={saveMeta}
          onDelete={deleteMeta}
          onClose={() => { setSheet(null); setExpMetas(false); }}
        />
      )}

      {sheet?.type === "seg" && (
        <SecuritySheet
          mode={sheet.payload}
          onEnable={enableLock}
          onDisable={disableLock}
          onBackup={backup}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === "fixed" && (
        <FixedEditor
          item={sheet.payload}
          defaultKind={sheet.defaultKind}
          categories={chipOrder}
          monthKey={monthKey}
          bancos={bancos}
          masUsadoBancoId={usoFormaPago.masUsadoBancoId}
          onAddBanco={saveBanco}
          metas={metas}
          gastosPeriodicosActivado={data.gastosPeriodicosActivado === true}
          onCrearMiniMeta={crearMiniMeta}
          onSave={saveFixed}
          onDelete={deleteFixed}
          onSaveCategory={saveCategory}
          formaPagoActivada={data.formaPagoActivada}
          onClose={() => { setSheet(null); setExpFijos(false); setExpFijosIngresos(false); }}
        />
      )}

      {sheet?.type === "income" && (
        <IncomeEditor
          income={sheet.payload}
          bancos={bancos}
          masUsadoBancoId={usoFormaPago.masUsadoBancoId}
          onAddBanco={saveBanco}
          onSave={updateIncome}
          onDelete={removeIncome}
          formaPagoActivada={data.formaPagoActivada}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === "detail" && (
        <CategoryDetail
          category={sheet.payload}
          monthKey={monthKey}
          months={data.months}
          onPickExpense={(e) => setSheet({ type: "expense", payload: e })}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === "expense" && (
        <ExpenseEditor
          expense={sheet.payload}
          categories={categories}
          bancos={bancos}
          masUsadoBancoId={usoFormaPago.masUsadoBancoId}
          onAddBanco={saveBanco}
          onSave={updateExpense}
          onDelete={deleteExpense}
          formaPagoActivada={data.formaPagoActivada}
          onClose={() => setSheet(null)}
        />
      )}

      {mostrarMenuCampos && (
        <Sheet
          title={campoEditando ? { categoria: "Categoría", formaPago: "Forma de pago", fecha: "Fecha", hora: "Hora" }[campoEditando] : `Editar ${seleccionados.size} ${seleccionados.size === 1 ? "gasto" : "gastos"}`}
          onClose={() => { setMostrarMenuCampos(false); setCampoEditando(null); }}>

          {!campoEditando ? (
            <>
              <p className="cg-hint" style={{ marginBottom: 12 }}>
                {seleccionSonTodosGastos
                  ? "Elige qué campo quieres cambiar en todos a la vez."
                  : "La selección incluye ingresos — solo se puede cambiar la fecha en bloque."}
              </p>
              <div style={{ borderRadius: 10, overflow: "hidden", border: "0.5px solid var(--line)" }}>
                {seleccionSonTodosGastos && (
                  <button onClick={() => setCampoEditando("categoria")}
                    style={{ display: "flex", alignItems: "center", width: "100%", padding: "13px 12px", border: 0, borderBottom: "0.5px solid var(--line)", background: "transparent", fontSize: 14, color: "var(--ink)", textAlign: "left", cursor: "pointer" }}>
                    <i className="ti ti-tag" style={{ fontSize: 16, marginRight: 10, color: "var(--muted)" }} aria-hidden="true"></i>
                    Categoría
                    <i className="ti ti-chevron-right" style={{ fontSize: 15, marginLeft: "auto", color: "var(--muted)" }} aria-hidden="true"></i>
                  </button>
                )}
                {seleccionSonTodosGastos && (
                  <button onClick={() => setCampoEditando("formaPago")}
                    style={{ display: "flex", alignItems: "center", width: "100%", padding: "13px 12px", border: 0, borderBottom: "0.5px solid var(--line)", background: "transparent", fontSize: 14, color: "var(--ink)", textAlign: "left", cursor: "pointer" }}>
                    <i className="ti ti-cash" style={{ fontSize: 16, marginRight: 10, color: "var(--muted)" }} aria-hidden="true"></i>
                    Forma de pago
                    <i className="ti ti-chevron-right" style={{ fontSize: 15, marginLeft: "auto", color: "var(--muted)" }} aria-hidden="true"></i>
                  </button>
                )}
                <button onClick={() => setCampoEditando("fecha")}
                  style={{ display: "flex", alignItems: "center", width: "100%", padding: "13px 12px", border: 0, borderBottom: seleccionSonTodosGastos ? "0.5px solid var(--line)" : 0, background: "transparent", fontSize: 14, color: "var(--ink)", textAlign: "left", cursor: "pointer" }}>
                  <i className="ti ti-calendar" style={{ fontSize: 16, marginRight: 10, color: "var(--muted)" }} aria-hidden="true"></i>
                  Fecha
                  <i className="ti ti-chevron-right" style={{ fontSize: 15, marginLeft: "auto", color: "var(--muted)" }} aria-hidden="true"></i>
                </button>
                {seleccionSonTodosGastos && (
                  <button onClick={() => setCampoEditando("hora")}
                    style={{ display: "flex", alignItems: "center", width: "100%", padding: "13px 12px", border: 0, background: "transparent", fontSize: 14, color: "var(--ink)", textAlign: "left", cursor: "pointer" }}>
                    <i className="ti ti-clock" style={{ fontSize: 16, marginRight: 10, color: "var(--muted)" }} aria-hidden="true"></i>
                    Hora
                    <i className="ti ti-chevron-right" style={{ fontSize: 15, marginLeft: "auto", color: "var(--muted)" }} aria-hidden="true"></i>
                  </button>
                )}
              </div>
              <p className="cg-hint" style={{ marginTop: 12, marginBottom: 0, textAlign: "center" }}>
                El concepto y el importe no se pueden editar en bloque — son distintos en cada apunte.
              </p>
            </>
          ) : campoEditando === "categoria" ? (
            <div className="cg-chips">
              {categories.map((c) => (
                <button key={c.id} className="cg-chip"
                  style={{ background: c.color }}
                  onClick={() => { aplicarCampoBulk({ categoryId: c.id }); setMostrarMenuCampos(false); setCampoEditando(null); }}>
                  <span><CatMark c={c} size={16} /></span>{c.name}
                </button>
              ))}
            </div>
          ) : campoEditando === "formaPago" ? (
            <BulkFormaPagoPicker bancos={bancos} masUsadoBancoId={usoFormaPago.masUsadoBancoId} onAddBanco={saveBanco}
              onAplicar={(cambios) => { aplicarCampoBulk(cambios); setMostrarMenuCampos(false); setCampoEditando(null); }} />
          ) : campoEditando === "fecha" ? (
            <BulkFechaHoraPicker tipo="fecha"
              onAplicar={(valor) => { aplicarCampoBulk({ date: valor }); setMostrarMenuCampos(false); setCampoEditando(null); }} />
          ) : (
            <BulkFechaHoraPicker tipo="hora"
              onAplicar={(valor) => { aplicarCampoBulk({ time: valor }); setMostrarMenuCampos(false); setCampoEditando(null); }} />
          )}
        </Sheet>
      )}

      {mostrarEditarFechaIngresos && (
        <Sheet title={`Fecha para ${seleccionadosIngresos.size} ${seleccionadosIngresos.size === 1 ? "ingreso" : "ingresos"}`}
          onClose={() => setMostrarEditarFechaIngresos(false)}>
          <BulkFechaHoraPicker tipo="fecha"
            onAplicar={(valor) => {
              aplicarCampoBulk({ date: valor }, seleccionadosIngresos);
              setMostrarEditarFechaIngresos(false);
              setSeleccionadosIngresos(new Set());
            }} />
        </Sheet>
      )}

      {mostrarMenuCamposFijos && (
        <Sheet
          title={campoEditandoFijos ? { categoria: "Categoría", formaPago: "Forma de pago" }[campoEditandoFijos] : `Editar ${seleccionadosFijos.size} ${seleccionadosFijos.size === 1 ? "fijo" : "fijos"}`}
          onClose={() => { setMostrarMenuCamposFijos(false); setCampoEditandoFijos(null); }}>
          {!campoEditandoFijos ? (
            <>
              <p className="cg-hint" style={{ marginBottom: 12 }}>
                {seleccionFijosSonTodosGasto
                  ? "Elige qué campo quieres cambiar en todos a la vez."
                  : "La selección incluye ingresos fijos — no tienen categoría ni forma de pago que cambiar."}
              </p>
              {seleccionFijosSonTodosGasto && (
                <div style={{ borderRadius: 10, overflow: "hidden", border: "0.5px solid var(--line)" }}>
                  <button onClick={() => setCampoEditandoFijos("categoria")}
                    style={{ display: "flex", alignItems: "center", width: "100%", padding: "13px 12px", border: 0, borderBottom: "0.5px solid var(--line)", background: "transparent", fontSize: 14, color: "var(--ink)", textAlign: "left", cursor: "pointer" }}>
                    <i className="ti ti-tag" style={{ fontSize: 16, marginRight: 10, color: "var(--muted)" }} aria-hidden="true"></i>
                    Categoría
                    <i className="ti ti-chevron-right" style={{ fontSize: 15, marginLeft: "auto", color: "var(--muted)" }} aria-hidden="true"></i>
                  </button>
                  <button onClick={() => setCampoEditandoFijos("formaPago")}
                    style={{ display: "flex", alignItems: "center", width: "100%", padding: "13px 12px", border: 0, background: "transparent", fontSize: 14, color: "var(--ink)", textAlign: "left", cursor: "pointer" }}>
                    <i className="ti ti-cash" style={{ fontSize: 16, marginRight: 10, color: "var(--muted)" }} aria-hidden="true"></i>
                    Forma de pago
                    <i className="ti ti-chevron-right" style={{ fontSize: 15, marginLeft: "auto", color: "var(--muted)" }} aria-hidden="true"></i>
                  </button>
                </div>
              )}
            </>
          ) : campoEditandoFijos === "categoria" ? (
            <div className="cg-chips">
              {categories.map((c) => (
                <button key={c.id} className="cg-chip" style={{ background: c.color }}
                  onClick={() => aplicarCampoBulkFijos({ categoryId: c.id })}>
                  <span><CatMark c={c} size={16} /></span>{c.name}
                </button>
              ))}
            </div>
          ) : (
            <BulkFormaPagoPicker bancos={bancos} masUsadoBancoId={usoFormaPago.masUsadoBancoId} onAddBanco={saveBanco}
              onAplicar={(cambios) => aplicarCampoBulkFijos(cambios)} />
          )}
        </Sheet>
      )}

      {mostrarOfertaMasivaMiniMetas && (
        <Sheet title="¿Apartamos dinero para estos gastos?" onClose={() => setMostrarOfertaMasivaMiniMetas(false)}>
          <p className="cg-hint" style={{ marginBottom: 12 }}>
            Ya tienes {fijosPeriodicosSinMiniMeta.length} {fijosPeriodicosSinMiniMeta.length === 1 ? "gasto periódico" : "gastos periódicos"} dado{fijosPeriodicosSinMiniMeta.length === 1 ? "" : "s"} de alta. Se creará una mini-meta para cada uno, con la cuota ya calculada.
          </p>
          <div style={{ borderRadius: 10, overflow: "hidden", border: "0.5px solid var(--line)", marginBottom: 16 }}>
            {fijosPeriodicosSinMiniMeta.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderBottom: "0.5px solid var(--line)" }}>
                <span style={{ fontSize: 13.5 }}>{r.name}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--pine)" }}>{eur(r.amount / r.every)} €/mes</span>
              </div>
            ))}
          </div>
          <button className="cg-btn" onClick={crearMiniMetasMasivo}>
            Sí, crear {fijosPeriodicosSinMiniMeta.length === 1 ? "la mini-meta" : "todas"}
          </button>
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <button className="cg-vermas" onClick={() => setMostrarOfertaMasivaMiniMetas(false)}>Ahora no</button>
          </div>
        </Sheet>
      )}

      {sheet?.type === "desgloseGastoFijo" && (
        <Sheet title="Gasto fijo al mes" onClose={() => setSheet(null)}>
          {(() => {
            const activos = recurringGastos.filter((r) => r.active !== false && catById[r.categoryId]?.bucket !== "ahorro");
            const mensuales = activos.filter((r) => (r.every || 1) === 1);
            const periodicos = activos.filter((r) => (r.every || 1) > 1);
            const totalMensual = mensuales.reduce((s, r) => s + r.amount, 0);
            const totalPeriodico = periodicos.reduce((s, r) => s + r.amount / r.every, 0);
            return (
              <>
                {mensuales.length > 0 && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                      <span className="cg-lab" style={{ margin: 0 }}>Mensuales</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{eur(totalMensual)} €</span>
                    </div>
                    <div style={{ borderRadius: 10, overflow: "hidden", border: "0.5px solid var(--line)", marginBottom: 16 }}>
                      {mensuales.map((r) => (
                        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", borderBottom: "0.5px solid var(--line)" }}>
                          <span style={{ fontSize: 13 }}>{r.name}</span>
                          <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--muted)" }}>{eur(r.amount)} €</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {periodicos.length > 0 && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                      <span className="cg-lab" style={{ margin: 0 }}>Periódicos, prorrateados</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{eur(totalPeriodico)} €</span>
                    </div>
                    <div style={{ borderRadius: 10, overflow: "hidden", border: "0.5px solid var(--line)" }}>
                      {periodicos.map((r) => (
                        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", borderBottom: "0.5px solid var(--line)" }}>
                          <span style={{ fontSize: 13 }}>{r.name} <span style={{ color: "var(--muted)" }}>· {freqLabel(r)}</span></span>
                          <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--muted)" }}>{eur(r.amount / r.every)} €/mes</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </Sheet>
      )}

      {sheet?.type === "privacidad" && (
        <Sheet title="Aviso de Privacidad" onClose={() => setSheet(null)}>
          <p className="cg-hint" style={{ marginTop: 0 }}>Última actualización: 20 de septiembre de 2026</p>

          <h4 style={{ fontSize: 13, fontWeight: 700, margin: "16px 0 4px" }}>1. Responsable del tratamiento</h4>
          <p className="cg-hint">
            El responsable del tratamiento es Rodrigo E. Harmat Gainza, Barcelona, España.
            Correo electrónico: <a href="mailto:rodrigoharmat@gmail.com">rodrigoharmat@gmail.com</a>.
          </p>

          <h4 style={{ fontSize: 13, fontWeight: 700, margin: "16px 0 4px" }}>2. Qué datos trata {APP_NAME}</h4>
          <p className="cg-hint">
            Actualmente, {APP_NAME} no recoge, transmite ni almacena en ningún servidor datos
            personales de sus usuarios. Los datos que introduces en la aplicación, incluidos gastos,
            ingresos, categorías y metas de ahorro, se almacenan únicamente en el dispositivo del
            usuario y permanecen cifrados mediante AES-GCM.
          </p>
          <p className="cg-hint">
            {APP_NAME} no tiene cuentas de usuario ni actualmente dispone de un sistema de
            sincronización o almacenamiento remoto.
          </p>
          <p className="cg-hint">
            El acceso mediante Face ID, Touch ID u otros sistemas biométricos se realiza a través
            del mecanismo de autenticación del propio dispositivo, mediante WebAuthn. {APP_NAME} no
            recibe ni almacena los datos biométricos del usuario, y estos no salen del dispositivo.
          </p>
          <p className="cg-hint">Asimismo, {APP_NAME}:</p>
          <ul className="cg-hint" style={{ margin: "0 0 12px", paddingLeft: 18 }}>
            <li>No utiliza cookies de seguimiento.</li>
            <li>No utiliza servicios de analítica de terceros.</li>
            <li>No utiliza píxeles publicitarios ni tecnologías similares.</li>
            <li>No comparte datos personales con terceros.</li>
          </ul>

          <h4 style={{ fontSize: 13, fontWeight: 700, margin: "16px 0 4px" }}>3. Base jurídica</h4>
          <p className="cg-hint">
            Dado que {APP_NAME} actualmente no recibe ni almacena datos personales de los usuarios
            en sus propios sistemas, no existe actualmente un tratamiento de datos personales remoto
            que requiera una base jurídica específica conforme al RGPD. Los datos financieros
            almacenados localmente en el dispositivo permanecen bajo el control del usuario y no son
            accesibles por {APP_NAME}.
          </p>

          <h4 style={{ fontSize: 13, fontWeight: 700, margin: "16px 0 4px" }}>4. Derechos del usuario</h4>
          <p className="cg-hint">
            El RGPD reconoce, entre otros, los derechos de acceso, rectificación, supresión,
            limitación del tratamiento, oposición y portabilidad de los datos personales, así como
            el derecho a no ser objeto de determinadas decisiones automatizadas. En la situación
            actual de {APP_NAME}, no disponemos de datos personales almacenados en nuestros
            servidores que permitan atender, por ejemplo, una solicitud de rectificación o supresión.
          </p>
          <p className="cg-hint">
            Para cualquier consulta relacionada con la privacidad o el ejercicio de derechos, puedes
            contactar con nosotros en <a href="mailto:rodrigoharmat@gmail.com">rodrigoharmat@gmail.com</a>.
            También tienes derecho a presentar una reclamación ante la Agencia Española de Protección
            de Datos (AEPD) si consideras que se han vulnerado tus derechos.
          </p>

          <h4 style={{ fontSize: 13, fontWeight: 700, margin: "16px 0 4px" }}>5. Cambios futuros</h4>
          <p className="cg-hint" style={{ marginBottom: 0 }}>
            {APP_NAME} podrá incorporar en el futuro funcionalidades que requieran el tratamiento de
            datos en servidores, por ejemplo, sincronización entre dispositivos, copias de seguridad
            o cuentas de usuario. Si esto ocurre, este Aviso de Privacidad será actualizado antes de
            que dicho tratamiento resulte aplicable, indicando qué datos se tratarán, con qué
            finalidad, durante cuánto tiempo, sobre qué base jurídica y cualquier otra información
            exigida por la normativa aplicable. Los usuarios serán informados de los cambios
            relevantes mediante los medios disponibles en ese momento.
          </p>
        </Sheet>
      )}

      {sheet?.type === "sinEspecificar" && (
        <Sheet title={`Sin especificar (${gastoPorFormaPago.sinEspecificarItems.length})`}
          onClose={() => { setSheet(null); setSeleccionadosSinEsp(new Set()); }}>
          <p className="cg-hint" style={{ marginBottom: 12 }}>
            Toca los que quieras marcar. En cuanto un gasto tenga forma de pago, desaparece de esta lista.
          </p>
          <div style={{ borderRadius: 10, overflow: "hidden", border: "0.5px solid var(--line)", marginBottom: seleccionadosSinEsp.size > 0 ? 16 : 0 }}>
            {gastoPorFormaPago.sinEspecificarItems.length === 0 ? (
              <p className="cg-empty" style={{ margin: 0, padding: 16 }}>Ya no queda ninguno sin especificar 🎉</p>
            ) : gastoPorFormaPago.sinEspecificarItems.map((e) => {
              const c = catById[e.categoryId];
              const marcado = seleccionadosSinEsp.has(e.id);
              return (
                <button key={e.id} onClick={() => toggleSeleccionSinEsp(e.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", border: 0, borderBottom: "0.5px solid var(--line)", background: marcado ? "#E6F1FB" : "transparent", cursor: "pointer", textAlign: "left" }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                    border: `1.5px solid ${marcado ? "var(--pine)" : "var(--line)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {marcado && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--ink)" }}></div>}
                  </div>
                  <div className="cg-badge" style={{ background: (c?.color || "#888") + "22" }}><CatMark c={c} size={18} /></div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="cg-name">{e.name}</div>
                    <div className="cg-meta">{stampLabel(e)}</div>
                  </div>
                  <span className="cg-amt">−{eur(e.amount)} €</span>
                </button>
              );
            })}
          </div>
          {seleccionadosSinEsp.size > 0 && (
            <div>
              <span className="cg-lab">Forma de pago para {seleccionadosSinEsp.size} {seleccionadosSinEsp.size === 1 ? "gasto" : "gastos"}</span>
              <div style={{ marginTop: 8 }}>
                <BulkFormaPagoPicker bancos={bancos} masUsadoBancoId={usoFormaPago.masUsadoBancoId} onAddBanco={saveBanco}
                  onAplicar={(cambios) => { aplicarCampoBulk(cambios, seleccionadosSinEsp); setSeleccionadosSinEsp(new Set()); }} />
              </div>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
