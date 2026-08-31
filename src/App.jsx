import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { STORE_KEY, ONBOARD_KEY, WORKER_URL, APP_VERSION, BUCKETS, DEFAULT_CATEGORIES } from "./constants.js";
import { store } from "./lib/storage.js";
import {
  cryptoOk, bioDisponible, kekFromPass, kekFromBytes, newDEK, wrapDEK, unwrapDEK,
  sealData, openData, esSobre, tieneBio, prfCrear, prfObtener, ITER, b64, unb64,
} from "./lib/crypto.js";
import {
  fuzzyMatch, learnFrom, uid, eur, monthKeyOf, todayISO, monthLabel, shiftMonth,
  dayLabel, shortDate, stampLabel, sortKey, emptyMonth, daysIn, shortMonth, monthsBack, dueIn, nextDue, freqLabel, cicloDePago,
} from "./lib/utils.js";
import { autoApplyAll, migrate } from "./lib/data.js";
import { crearCopia, compartirApp, leerCopia } from "./lib/backup.js";

import { EyeIcon, ExpandableList, CoachBox, AvisoActualizacionCard, AjusteSaldoCard, MetaRow } from "./components/ui.jsx";
import { CategoryEditor, MetaEditor, ExpenseEditor, IncomeEditor, FixedEditor } from "./components/editors.jsx";
import { AddExpense, IncomeCard, Donut, CategoryDetail } from "./components/mes.jsx";
import { MonthCompare, Split503020, Forecast } from "./components/resumen.jsx";
import { isAppInstalled, Onboarding } from "./components/onboarding.jsx";
import { LockScreen, SecuritySheet } from "./components/lock.jsx";

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [monthKey, setMonthKey] = useState(monthKeyOf(new Date()));
  const [tab, setTab] = useState("mes");
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

  const finishOnboarding = async (email) => {
    const instalado = isAppInstalled();
    const installId = uid() + uid();
    const payload = { done: true, installId, email: email || null, instaladaAlAceptar: instalado, avisoActualizacionVisto: true };
    try { await store.set(ONBOARD_KEY, JSON.stringify(payload)); } catch (e) { /* no bloquea el uso de la app */ }
    installIdRef.current = installId;
    setOnboard({ status: "done" });
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
        setData({ version: 8, categories: DEFAULT_CATEGORIES, months: {}, learned: {}, recurring: [] });
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
  const used = spent + saved;
  const ajuste = month.ajuste || null; // corrige solo el disponible final; nunca gasto/ahorro/categorías
  const left = income - used + (ajuste?.valor || 0);
  const saveAjuste = (nuevoAjuste) => setData((d) => {
    const cur = d.months[monthKey] || emptyMonth();
    return { ...d, months: { ...d.months, [monthKey]: { ...cur, ajuste: nuevoAjuste } } };
  });

  /* totales por categoría: el ahorro va aparte del gasto */
  const catTotals = useMemo(() => {
    const m = {};
    for (const e of month.expenses) m[e.categoryId] = (m[e.categoryId] || 0) + e.amount;
    return categories
      .map((c) => ({ ...c, total: m[c.id] || 0 }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [month.expenses, categories]);
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

  /* ── metas: objetivos de ahorro y deudas ── */
  const metas = data?.metas || [];
  const saveMeta = (meta, categoriaNueva) => setData((d) => {
    const exists = (d.metas || []).some((m) => m.id === meta.id);
    const metas = exists ? (d.metas || []).map((m) => (m.id === meta.id ? meta : m)) : [...(d.metas || []), meta];
    const categories = categoriaNueva ? [...d.categories, categoriaNueva] : d.categories;
    return { ...d, metas, categories };
  });
  const deleteMeta = (id) => setData((d) => {
    const metas = (d.metas || []).filter((m) => m.id !== id);
    // la categoría dedicada se queda (así no se pierden los gastos ya anotados), solo deja de ser "de una meta"
    return { ...d, metas };
  });
  const toggleRecorte = (metaId, categoryId) => setData((d) => ({
    ...d,
    metas: (d.metas || []).map((m) => m.id !== metaId ? m : {
      ...m,
      recortesPendientes: (m.recortesPendientes || []).map((r) => r.categoryId === categoryId ? { ...r, hecho: !r.hecho } : r),
    }),
  }));

  /* progreso de cada meta: suma de todos los gastos, en todos los meses, en su categoría dedicada */
  const metaProgreso = useMemo(() => {
    const out = {};
    for (const m of metas) {
      let total = 0;
      for (const mes of Object.values(data?.months || {})) {
        for (const e of mes.expenses || []) if (e.categoryId === m.categoryId) total += e.amount;
      }
      out[m.id] = total;
    }
    return out;
  }, [metas, data]);

  /* ── fijos ── */
  const recurring = data?.recurring || [];
  const pendingFixed = recurring.filter((r) => dueIn(r, monthKey) && !(month.applied || {})[r.id]);

  /* para saber si una cuota mensual es viable: ingreso estimado, y necesidad (fija + variable histórica),
     ambas excluyendo la propia categoría de la meta que se esté editando */
  const mesesCerrados = monthsBack(shiftMonth(monthKey, -1), 3).filter((k) => (data?.months?.[k]?.expenses || []).length);
  const ingresoMensualEstimado = useMemo(() => {
    const fixIncome = recurring.filter((r) => r.kind === "ingreso").reduce((s, r) => s + r.amount, 0);
    if (fixIncome > 0) return fixIncome;
    const conIngresos = mesesCerrados.filter((k) => (data?.months?.[k]?.incomes || []).length);
    if (!conIngresos.length) return income;
    return conIngresos.reduce((s, k) => s + data.months[k].incomes.reduce((t, i) => t + i.amount, 0), 0) / conIngresos.length;
  }, [recurring, data, mesesCerrados, income]);

  const necesidadFijaMensual = (excluirCategoryId) => recurring
    .filter((r) => r.kind === "gasto" && r.categoryId !== excluirCategoryId && catById[r.categoryId]?.bucket === "necesidad")
    .reduce((s, r) => s + r.amount, 0);

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
        const exp = { id: uid(), name: r.name, amount: r.amount, categoryId: r.categoryId, date: `${monthKey}-${day}`, time: null, fixed: true };
        expenses.push(exp);
        applied[id] = exp.id;
      }
    }
    return { ...d, months: { ...d.months, [monthKey]: { ...cur, incomes, expenses, applied } } };
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
    const { estado, url } = await compartirApp();
    if (estado === "copiado") window.alert("Enlace copiado.");
    else if (estado === "manual") window.prompt("Copia este enlace:", url);
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
      setTab("mes");
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
    setData({ version: 8, categories: DEFAULT_CATEGORIES, months: {}, learned: {}, recurring: [] });
  };

  const isCurrentMonth = monthKey === monthKeyOf(new Date());
  const daysInMonth = new Date(Number(monthKey.split("-")[0]), Number(monthKey.split("-")[1]), 0).getDate();

  /* vista por ciclo de nómina (opción C): solo recalcula el "disponible" del hero cuando
     se está viendo el mes actual — Fijos y Previsión siguen contando por calendario siempre,
     porque un alquiler vence el día 5 le pese a cuándo cobre quien sea. */
  const diaCobro = data?.diaCobro || null;
  const setDiaCobro = (dia) => setData((d) => ({ ...d, diaCobro: dia }));
  const ciclo = useMemo(() => {
    if (!diaCobro || !isCurrentMonth) return null;
    const { inicio, fin } = cicloDePago(diaCobro);
    const meses = new Set([inicio.slice(0, 7), fin.slice(0, 7)]);
    let incomeC = 0, spentC = 0, savedC = 0;
    for (const mk of meses) {
      const m = data?.months?.[mk] || emptyMonth();
      for (const i of m.incomes) if (i.date >= inicio && i.date <= fin) incomeC += i.amount;
      for (const e of m.expenses) {
        if (e.date < inicio || e.date > fin) continue;
        if (catById[e.categoryId]?.bucket === "ahorro") savedC += e.amount; else spentC += e.amount;
      }
    }
    return {
      inicio, fin, income: incomeC, spent: spentC, saved: savedC,
      left: incomeC - spentC - savedC + (ajuste?.valor || 0),
    };
  }, [diaCobro, isCurrentMonth, data?.months, catById, ajuste]);

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
    if (saved > 0) {
      const metaConProgreso = metas
        .filter((m) => m.tipo === "objetivo")
        .map((m) => ({ m, pct: m.total > 0 ? ((metaProgreso[m.id] || 0) / m.total) * 100 : 0 }))
        .filter((x) => x.pct > 0 && x.pct < 100)
        .sort((a, b) => b.pct - a.pct)[0];
      if (metaConProgreso) {
        return `Vas al ${Math.round(metaConProgreso.pct)}% de tu objetivo «${metaConProgreso.m.name}», sigue así`;
      }
      return `Ya llevas ${eur(saved)} € ahorrados este mes`;
    }

    /* candidata 1: proyección de cierre de este mes, mejor que el gasto real del anterior */
    if (suficienteHistorial && prevSpent > 0 && spent > 0) {
      const proyeccion = (spent / diaHoy) * daysInMonth;
      const pct = ((prevSpent - proyeccion) / prevSpent) * 100;
      if (pct >= 3) return `${Math.round(pct)}% mejor que ${monthLabel(prevMonthKey).toLowerCase()}, sigue así`;
    }

    /* candidata 2: más disponible que el mes anterior, en el mismo día */
    if (suficienteHistorial) {
      const prevLeftToDate = prevToDate.income - prevToDate.used;
      const diff = left - prevLeftToDate;
      if (diff >= 15) return `Hoy tienes ${eur(diff)} € más disponible que en ${monthLabel(prevMonthKey).toLowerCase()} a estas alturas`;
    }

    /* candidata 3: más ingresos que el mes anterior, en el mismo día */
    if (suficienteHistorial) {
      const diffInc = income - prevToDate.income;
      if (diffInc >= 15) return `Has ingresado ${eur(diffInc)} € más que en ${monthLabel(prevMonthKey).toLowerCase()} a estas alturas`;
    }

    /* ninguna candidata es cierta: ánimo neutro, sin inventar comparaciones */
    return "Llevas todo el mes anotado, eso ya suma.";
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

  const grouped = useMemo(() => {
    const todo = [
      ...month.expenses.map((e) => ({ ...e, tipo: "gasto" })),
      ...month.incomes.map((i) => ({ ...i, tipo: "ingreso", name: i.label, date: i.date || `${monthKey}-01` })),
    ].sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || b.id.localeCompare(a.id));
    const g = {};
    for (const m of todo) (g[m.date] = g[m.date] || []).push(m);
    return Object.entries(g);
  }, [month.expenses, month.incomes, monthKey]);

  const [showAllMov, setShowAllMov] = useState(false);
  useEffect(() => { setShowAllMov(false); }, [monthKey]);
  const [searchQ, setSearchQ] = useState("");
  useEffect(() => { if (tab !== "mes") setSearchQ(""); }, [tab]);
  const [expByCategory, setExpByCategory] = useState(false);
  const [expFijos, setExpFijos] = useState(false);
  const [expCatLimites, setExpCatLimites] = useState(false);
  const [expMetas, setExpMetas] = useState(false);
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

  const movCount = month.expenses.length + month.incomes.length;
  const { firstGrouped, restGrouped } = useMemo(() => {
    let restante = 3;
    const first = [];
    const rest = [];
    for (const [date, items] of grouped) {
      if (restante > 0) {
        const take = items.slice(0, restante);
        first.push([date, take]);
        const leftover = items.slice(restante);
        restante -= take.length;
        if (leftover.length) rest.push([date, leftover]);
      } else {
        rest.push([date, items]);
      }
    }
    return { firstGrouped: first, restGrouped: rest };
  }, [grouped]);

  /* buscador de movimientos: cruza todos los meses guardados, por proximidad de texto */
  const searchResults = useMemo(() => {
    const q = searchQ.trim();
    if (!q) return [];
    const todo = [];
    for (const [k, m] of Object.entries(data?.months || {})) {
      for (const e of m.expenses || []) todo.push({ ...e, tipo: "gasto" });
      for (const i of m.incomes || []) todo.push({ ...i, tipo: "ingreso", name: i.label, date: i.date || `${k}-01` });
    }
    return todo
      .filter((m) => fuzzyMatch(q, m.name))
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || b.id.localeCompare(a.id))
      .slice(0, 50);
  }, [searchQ, data]);

  if (onboard.status === "install" || onboard.status === "consent") {
    return <Onboarding startStep={onboard.status} onDone={finishOnboarding} />;
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
            <div className="cg-eyebrow">Cosecha</div>
            <div className="cg-brand">Gastos del mes</div>
          </div>
          <div className="cg-nav">
            <button className="cg-navbtn" onClick={() => setMonthKey(shiftMonth(monthKey, -1))} aria-label="Mes anterior">‹</button>
            <span className="cg-month">{monthLabel(monthKey)}</span>
            <button className="cg-navbtn" onClick={() => setMonthKey(shiftMonth(monthKey, 1))} aria-label="Mes siguiente">›</button>
          </div>
        </div>

        {/* héroe: disponible */}
        <div className={`cg-hero ${left < 0 && !oculto ? "over" : ""}`}>
          <button className="cg-eye" onClick={toggleOculto} aria-pressed={oculto}
            aria-label={oculto ? "Mostrar el disponible" : "Ocultar el disponible"}
            title={oculto ? "Mostrar importes" : "Ocultar importes"}>
            <EyeIcon off={oculto} />
          </button>

          <div className="cg-eyebrow">
            {oculto ? "Disponible" : (ciclo ? ciclo.left : left) < 0 ? "Te has pasado" : "Disponible"}
            {ciclo && !oculto && (
              <span style={{ marginLeft: 6, fontWeight: 400, opacity: 0.7 }}>
                · ciclo {shortDate(ciclo.inicio)}–{shortDate(ciclo.fin)}
              </span>
            )}
          </div>
          <div className="cg-big">
            {oculto ? <span className="cg-hidden">••••</span> : eur(Math.abs(ciclo ? ciclo.left : left))}<small>€</small>
          </div>
          <div className="cg-sub">
            {oculto
              ? "importes ocultos"
              : (() => {
                  const inc = ciclo ? ciclo.income : income;
                  const sp = ciclo ? ciclo.spent : spent;
                  const sv = ciclo ? ciclo.saved : saved;
                  return `${eur(inc)} recibido · ${eur(sp)} gastado${sv > 0 ? ` · ${eur(sv)} ahorrado 🎉` : ""}${ajuste ? ` · ajuste ${ajuste.valor >= 0 ? "+" : ""}${eur(ajuste.valor)} €` : ""}`;
                })()}
          </div>
        </div>

        {!oculto && coachMsg && <CoachBox msg={coachMsg} />}

        <div className="cg-tabs" role="tablist">
          {[["mes", "Mes"], ["resumen", "Resumen"], ["fijos", "Fijos"], ["metas", "Metas"], ["ajustes", "Ajustes"]].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k}
              className={`cg-tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>

        {tab === "mes" && (
          <>
            {avisoActualizacion && <AvisoActualizacionCard onClose={cerrarAvisoActualizacion} />}

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
                    <div className="cg-badge" style={{ background: r.kind === "ingreso" ? "#EAF0E8" : (catById[r.categoryId]?.color || "#888") + "22" }}>
                      {r.kind === "ingreso" ? "＋" : catById[r.categoryId]?.emoji || "🏷️"}
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
            />

            <div className="cg-card">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <h2 className="cg-title">Movimientos</h2>
                <span className="cg-eyebrow">{month.expenses.length + month.incomes.length} apuntes</span>
              </div>

              <input className="cg-input" style={{ marginBottom: 12 }} placeholder="Buscar por concepto…"
                value={searchQ} onChange={(e) => setSearchQ(e.target.value)} aria-label="Buscar movimientos" />

              {searchQ.trim() ? (
                searchResults.length === 0 ? (
                  <p className="cg-empty">Nada que se parezca a «{searchQ.trim()}».</p>
                ) : (
                  searchResults.map((m) => {
                    if (m.tipo === "ingreso") {
                      return (
                        <button key={m.id} className="cg-item"
                          onClick={() => setSheet({ type: "income", payload: m })}>
                          <div className="cg-badge" style={{ background: "#E1EFE2" }}>＋</div>
                          <div style={{ minWidth: 0 }}>
                            <div className="cg-name">{m.label}</div>
                            <div className="cg-meta">ingreso · {stampLabel(m)}</div>
                          </div>
                          <span className="cg-amt" style={{ color: "var(--pine)" }}>+{eur(m.amount)} €</span>
                        </button>
                      );
                    }
                    const c = catById[m.categoryId];
                    return (
                      <button key={m.id} className="cg-item" onClick={() => setSheet({ type: "expense", payload: m })}>
                        <div className="cg-badge" style={{ background: (c?.color || "#888") + "22" }}>{c?.emoji || "🏷️"}</div>
                        <div style={{ minWidth: 0 }}>
                          <div className="cg-name">{m.name}</div>
                          <div className="cg-meta">{c?.name || "Sin categoría"} · {stampLabel(m)}</div>
                        </div>
                        <span className="cg-amt">−{eur(m.amount)} €</span>
                      </button>
                    );
                  })
                )
              ) : grouped.length === 0 ? (
                <p className="cg-empty">Todavía no hay nada en {monthLabel(monthKey).toLowerCase()}.<br />Anota el primer gasto arriba.</p>
              ) : (
                <>
                  {firstGrouped.map(([date, items]) => (
                    <div key={date}>
                      <div className="cg-day">{dayLabel(date)}</div>
                      {items.map((m) => {
                        if (m.tipo === "ingreso") {
                          return (
                            <button key={m.id} className="cg-item"
                              onClick={() => setSheet({ type: "income", payload: m })}>
                              <div className="cg-badge" style={{ background: "#E1EFE2" }}>＋</div>
                              <div style={{ minWidth: 0 }}>
                                <div className="cg-name">{m.label}</div>
                                <div className="cg-meta">ingreso{m.fixed ? " · fijo" : ""}</div>
                              </div>
                              <span className="cg-amt" style={{ color: "var(--pine)" }}>+{eur(m.amount)} €</span>
                            </button>
                          );
                        }
                        const c = catById[m.categoryId];
                        return (
                          <button key={m.id} className="cg-item" onClick={() => setSheet({ type: "expense", payload: m })}>
                            <div className="cg-badge" style={{ background: (c?.color || "#888") + "22" }}>{c?.emoji || "🏷️"}</div>
                            <div style={{ minWidth: 0 }}>
                              <div className="cg-name">{m.name}</div>
                              <div className="cg-meta">{c?.name || "Sin categoría"}{m.fixed ? " · fijo" : m.time ? ` · ${m.time}` : ""}</div>
                            </div>
                            <span className="cg-amt">−{eur(m.amount)} €</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}

                  {movCount > 3 && (
                    <div style={{ textAlign: "center", marginTop: 8 }}>
                      <button className="cg-vermas" onClick={() => setShowAllMov((v) => !v)}>
                        {showAllMov ? "Ver menos" : `Ver más (${movCount - 3})`}
                      </button>
                    </div>
                  )}

                  {showAllMov && restGrouped.map(([date, items]) => (
                    <div key={`rest-${date}`}>
                      <div className="cg-day">{dayLabel(date)}</div>
                      {items.map((m) => {
                        if (m.tipo === "ingreso") {
                          return (
                            <button key={m.id} className="cg-item"
                              onClick={() => setSheet({ type: "income", payload: m })}>
                              <div className="cg-badge" style={{ background: "#E1EFE2" }}>＋</div>
                              <div style={{ minWidth: 0 }}>
                                <div className="cg-name">{m.label}</div>
                                <div className="cg-meta">ingreso{m.fixed ? " · fijo" : ""}</div>
                              </div>
                              <span className="cg-amt" style={{ color: "var(--pine)" }}>+{eur(m.amount)} €</span>
                            </button>
                          );
                        }
                        const c = catById[m.categoryId];
                        return (
                          <button key={m.id} className="cg-item" onClick={() => setSheet({ type: "expense", payload: m })}>
                            <div className="cg-badge" style={{ background: (c?.color || "#888") + "22" }}>{c?.emoji || "🏷️"}</div>
                            <div style={{ minWidth: 0 }}>
                              <div className="cg-name">{m.name}</div>
                              <div className="cg-meta">{c?.name || "Sin categoría"}{m.fixed ? " · fijo" : m.time ? ` · ${m.time}` : ""}</div>
                            </div>
                            <span className="cg-amt">−{eur(m.amount)} €</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}

                  {showAllMov && movCount > 3 && (
                    <div style={{ textAlign: "center", marginTop: 8 }}>
                      <button className="cg-vermas" onClick={() => setShowAllMov(false)}>Ver menos</button>
                    </div>
                  )}
                </>
              )}
            </div>

            <IncomeCard incomes={month.incomes} onAdd={addIncome} monthKey={monthKey} />
          </>
        )}

        {tab === "resumen" && (
          <>
            <div className="cg-card">
              <div className="cg-stats">
                <div className="cg-stat"><span className="cg-eyebrow">Recibido</span><b>{eur(income)} €</b></div>
                <div className="cg-stat"><span className="cg-eyebrow">Gastado</span><b>{eur(spent)} €</b></div>
                <div className="cg-stat" style={{ background: left < 0 ? "#F7E9E6" : "#EAF0E8" }}>
                  <span className="cg-eyebrow">Queda</span><b style={{ color: left < 0 ? "var(--red)" : "var(--pine)" }}>{eur(left)} €</b>
                </div>
              </div>
              {isCurrentMonth && spent > 0 && (
                <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 12, marginBottom: 0 }}>
                  Media de {eur(spent / new Date().getDate())} € al día. A este ritmo cerrarás el mes en{" "}
                  <b style={{ fontFamily: "var(--mono)" }}>{eur((spent / new Date().getDate()) * daysInMonth)} €</b>.
                </p>
              )}
            </div>

            {!oculto && coachMsg && <CoachBox msg={coachMsg} />}

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
                    <div className="cg-badge" style={{ background: c.color + "22" }}>{c.emoji}</div>
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

            <MonthCompare monthKey={monthKey} months={data.months} categories={categories} onJump={setMonthKey} />

            <Forecast monthKey={monthKey} months={data.months} recurring={recurring} categories={categories} />

            <Split503020 income={income} expenses={month.expenses} catById={catById} />

            <div className="cg-card">
              <h2 className="cg-title">Gasto por categoría</h2>
              {byCategory.length === 0 ? (
                <p className="cg-empty">Sin datos que dibujar todavía.</p>
              ) : (
                <>
                  <Donut slices={byCategory} total={spent} onPick={(id) => setSheet({ type: "detail", payload: catById[id] })} />
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
                            <span>{c.emoji}</span>
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

        {tab === "fijos" && (
          <>
            <div className="cg-card">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <h2 className="cg-title">Gastos e ingresos fijos</h2>
                <button className="cg-ghost" onClick={() => setSheet({ type: "fixed", payload: null })}>+ Nuevo</button>
              </div>
              <p className="cg-hint">
                Alquiler, agua cada 2 meses, comunidad cada trimestre, la nómina. Se anotan solos el día que les toca,
                también si no has abierto la app en semanas. Puedes poner cualquiera en modo «me lo preguntas».
              </p>

              <input className="cg-input" style={{ marginBottom: 12 }} placeholder="Buscar por nombre o categoría…"
                value={searchQFijos} onChange={(e) => setSearchQFijos(e.target.value)} aria-label="Buscar fijos" />

              {fijosResults ? (
                <>
                  {fijosResults.dadosDeAlta.length === 0 && fijosResults.historico.length === 0 ? (
                    <p className="cg-empty">Nada que se parezca a «{searchQFijos.trim()}».</p>
                  ) : (
                    <>
                      {fijosResults.dadosDeAlta.map((r) => {
                        const state = (month.applied || {})[r.id];
                        const toca = dueIn(r, monthKey);
                        const prox = nextDue(r, monthKey);
                        return (
                          <button key={r.id} className="cg-item" onClick={() => setSheet({ type: "fixed", payload: r })}>
                            <div className="cg-badge" style={{ background: r.kind === "ingreso" ? "#EAF0E8" : (catById[r.categoryId]?.color || "#888") + "22" }}>
                              {r.kind === "ingreso" ? "＋" : catById[r.categoryId]?.emoji || "🏷️"}
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
                      })}
                      {fijosResults.historico.length > 0 && (
                        <>
                          <p className="cg-eyebrow" style={{ margin: "14px 0 4px" }}>Histórico</p>
                          {fijosResults.historico.map((m) => (
                            <button key={m.id} className="cg-item" onClick={() => setSheet({ type: m.tipo === "ingreso" ? "income" : "expense", payload: m })}>
                              <div className="cg-badge" style={{ background: m.tipo === "ingreso" ? "#EAF0E8" : (catById[m.categoryId]?.color || "#888") + "22" }}>
                                {m.tipo === "ingreso" ? "＋" : catById[m.categoryId]?.emoji || "🏷️"}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div className="cg-name">{m.name}</div>
                                <div className="cg-meta">{m.tipo === "ingreso" ? "ingreso" : catById[m.categoryId]?.name || "—"} · {stampLabel(m)}</div>
                              </div>
                              <span className="cg-amt" style={m.tipo === "ingreso" ? { color: "var(--pine)" } : undefined}>
                                {m.tipo === "ingreso" ? "+" : "−"}{eur(m.amount)} €
                              </span>
                            </button>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </>
              ) : recurring.length === 0 ? (
                <p className="cg-empty">Sin fijos todavía.<br />Empieza por el alquiler y la nómina, que son los seguros.</p>
              ) : (
                <ExpandableList
                  items={recurring}
                  expanded={expFijos}
                  onToggle={() => setExpFijos((v) => !v)}
                  renderItem={(r) => {
                    const state = (month.applied || {})[r.id];
                    const toca = dueIn(r, monthKey);
                    const prox = nextDue(r, monthKey);
                    return (
                      <button key={r.id} className="cg-item" onClick={() => setSheet({ type: "fixed", payload: r })}>
                        <div className="cg-badge" style={{ background: r.kind === "ingreso" ? "#EAF0E8" : (catById[r.categoryId]?.color || "#888") + "22" }}>
                          {r.kind === "ingreso" ? "＋" : catById[r.categoryId]?.emoji || "🏷️"}
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
                  }}
                />
              )}
            </div>

            {recurring.length > 0 && (
              <div className="cg-card">
                <div className="cg-stats">
                  <div className="cg-stat">
                    <span className="cg-eyebrow">Gasto fijo al mes</span>
                    <b>{eur(recurring.filter((r) => r.kind === "gasto" && r.active !== false && catById[r.categoryId]?.bucket !== "ahorro").reduce((s, r) => s + r.amount / (r.every || 1), 0))} €</b>
                  </div>
                  {recurring.some((r) => r.kind === "gasto" && r.active !== false && catById[r.categoryId]?.bucket === "ahorro") && (
                    <div className="cg-stat">
                      <span className="cg-eyebrow">Ahorro fijo</span>
                      <b>{eur(recurring.filter((r) => r.kind === "gasto" && r.active !== false && catById[r.categoryId]?.bucket === "ahorro").reduce((s, r) => s + r.amount / (r.every || 1), 0))} €</b>
                    </div>
                  )}
                  <div className="cg-stat">
                    <span className="cg-eyebrow">Ingreso fijo al mes</span>
                    <b>{eur(recurring.filter((r) => r.kind === "ingreso" && r.active !== false).reduce((s, r) => s + r.amount / (r.every || 1), 0))} €</b>
                  </div>
                </div>
                <p className="cg-hint" style={{ marginTop: 10, marginBottom: 0 }}>
                  Lo que tienes comprometido cada mes antes de gastar nada. Lo trimestral y lo anual va prorrateado,
                  así que un seguro de 600 € al año cuenta aquí como 50 € al mes.
                </p>
              </div>
            )}
          </>
        )}

        {tab === "metas" && (
          <>
            <div className="cg-card">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <h2 className="cg-title">Metas</h2>
                <button className="cg-ghost" onClick={() => setSheet({ type: "meta", payload: null })}>+ Nueva</button>
              </div>
              {metas.length === 0 ? (
                <p className="cg-empty">Sin metas todavía.<br />Un objetivo de ahorro (un viaje, un coche) o una deuda a pagar — lo que sea, con su propio hueco.</p>
              ) : (
                <ExpandableList
                  items={metas}
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

            <p className="cg-hint" style={{ padding: "0 4px" }}>
              Cada meta tiene su propia categoría: cualquier gasto que anotes ahí (a mano, o desde un Fijo que la
              apunte) descuenta solo de su pendiente. Si tienes un Fijo relacionado (como una hipoteca), edítalo en
              la pestaña Fijos y cámbiale la categoría a la de la meta nueva.
            </p>
          </>
        )}

        {tab === "ajustes" && (
          <>
            <div className="cg-card">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <h2 className="cg-title">Límites Categorías</h2>
                <button className="cg-ghost" onClick={() => setSheet({ type: "cat", payload: null })}>+ Nueva</button>
              </div>
              <ExpandableList
                items={[...categories].sort((a, b) => a.name.localeCompare(b.name, "es"))}
                expanded={expCatLimites}
                onToggle={() => setExpCatLimites((v) => !v)}
                renderItem={(c) => (
                  <button key={c.id} className="cg-item" onClick={() => setSheet({ type: "cat", payload: c })}>
                    <div className="cg-badge" style={{ background: c.color + "22" }}>{c.emoji}</div>
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

            <AjusteSaldoCard ajuste={ajuste} onSave={saveAjuste} />

            <div className="cg-card">
              <h2 className="cg-title">Modo</h2>
              <p className="cg-hint">
                Coach muestra mensajes de ánimo y comparaciones con meses anteriores. Gastos se queda solo con los números.
              </p>
              <div className="cg-toggle">
                <button className={modoCoach ? "on" : ""} onClick={() => setModoCoach(true)}>Coach</button>
                <button className={!modoCoach ? "on" : ""} onClick={() => setModoCoach(false)}>Gastos</button>
              </div>

              <div style={{ borderTop: "0.5px solid var(--line)", marginTop: 14, paddingTop: 12 }}>
                <span className="cg-lab">Ciclo de nómina</span>
                <p className="cg-hint" style={{ marginTop: 4, marginBottom: 8 }}>
                  Si lo pones, el "Disponible" del mes actual cuenta desde tu día de cobro hasta el
                  siguiente, en vez de del 1 al fin de mes. Los Fijos y la Previsión siguen siempre
                  por calendario — un recibo vence el día que le toca, cobres cuando cobres.
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
              </div>
            </div>

            <div className="cg-card">
              <h2 className="cg-title">Copia de seguridad</h2>
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
                Ahora mismo: {Object.values(data.months).reduce((s, m) => s + m.expenses.length, 0)} gastos en{" "}
                {Object.keys(data.months).length} {Object.keys(data.months).length === 1 ? "mes" : "meses"}.
              </p>
            </div>

            <div className="cg-card">
              <h2 className="cg-title">Seguridad</h2>
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
                    <div className="cg-badge" style={{ background: bioOn ? "#E1EFE2" : "#E7EBE4" }}>
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

            <div className="cg-card">
              <h2 className="cg-title">Feedback</h2>
              <p className="cg-hint">
                ¿Falta algo, algo no funciona bien, o se te ocurre una mejora? Escribe directamente al admin.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <a className="cg-ghost" style={{ textAlign: "center", textDecoration: "none" }}
                  href="mailto:rodrigoharmat@gmail.com?subject=Feedback%20Cosecha">Escribir al admin</a>
                <button className="cg-ghost" onClick={compartirAppClick}>Compartir esta app</button>
              </div>
            </div>

            <div className="cg-card">
              <h2 className="cg-title">Detección automática</h2>
              <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
                Al escribir el concepto se propone una categoría. Si la corriges, la app aprende esa palabra
                y la próxima vez acierta. Ha aprendido {Object.keys(data.learned).length} palabras.
              </p>
              <button className="cg-ghost danger" onClick={wipe}>Borrar todos los datos</button>
            </div>

            <p style={{ textAlign: "center", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", margin: "4px 0 0" }}>
              Cosecha v{APP_VERSION}
            </p>
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
          onClose={() => setSheet(null)}
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
          onClose={() => setSheet(null)}
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
          categories={chipOrder}
          monthKey={monthKey}
          onSave={saveFixed}
          onDelete={deleteFixed}
          onSaveCategory={saveCategory}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === "income" && (
        <IncomeEditor
          income={sheet.payload}
          onSave={updateIncome}
          onDelete={removeIncome}
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
          onSave={updateExpense}
          onDelete={deleteExpense}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
