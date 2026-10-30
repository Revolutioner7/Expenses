import React, { useEffect, useRef, useState } from "react";
import { conseguirToken, socialDisponible } from "../lib/social.js";
import { PerdidoTodo, peticionGuardada, recuperacionDisponible, AjusteRecuperacion } from "./recuperacion.jsx";

/* casilla del alta: "Lo he perdido todo" viene marcada; quien la desmarca no tiene recuperación posible */
function CasillaRecuperacion({ valor, onCambio }) {
  if (!recuperacionDisponible()) return null;
  return (
    <>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "4px 0 6px", fontSize: 13.5 }}>
        <input type="checkbox" checked={valor} onChange={(e) => onCambio(e.target.checked)} style={{ marginTop: 3 }} />
        <span>Si lo pierdo todo, quiero poder pedir que me devuelvan el acceso</span>
      </label>
      <p className="cg-hint">{valor
        ? "Con 72 horas de espera, aviso por email y revisión a mano. Puedes cambiarlo cuando quieras en Ajustes."
        : "Sin esto, si pierdes la contraseña y el código de recuperación, nadie podrá abrir tus datos. Ni nosotros."}</p>
    </>
  );
}

const NOMBRE = { apple: "Apple", google: "Google" };
/* logo oficial de Google para el botón, tal cual lo da su generador de botones (lo aportó Rodrigo) */
function LogoGoogle() {
  return (
    <svg className="cg-social-logo-svg" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
const esApple = () => typeof navigator !== "undefined" && /iPhone|iPad|Macintosh/.test(navigator.userAgent || "");

/* traduce los códigos del servidor a algo que se entienda */
export function mensajeError(e) {
  switch (e?.codigo) {
    case "credenciales": return "Email o contraseña incorrectos.";
    case "email-en-uso": return "Ya hay una cuenta con ese email. Prueba a entrar en vez de crearla.";
    case "sin-conexion": return "Sin conexión. Inténtalo cuando tengas internet.";
    case "demasiados-intentos": return "Demasiados intentos seguidos. Espera un cuarto de hora y vuelve a probar.";
    case "email": return "Ese email no tiene buena pinta. Revísalo.";
    case "sin-sesion": return "Tu sesión ha caducado. Vuelve a entrar.";
    case "identidad": return "No hemos podido confirmar que eres tú. Vuelve a tocar el botón y prueba otra vez.";
    case "sin-email": return "Para la cuenta necesitamos tu email, y no nos ha llegado. Prueba con tu email y una contraseña.";
    case "proveedor-no-disponible": return "Ahora mismo no podemos hablar con Apple ni con Google. Prueba en un rato o entra con tu email.";
    case "social": return "No se ha podido terminar. Prueba otra vez.";
    default: return "Algo ha fallado por nuestro lado. Prueba otra vez en un rato.";
  }
}

export const CONTRASENA_MIN = 10;

const hace = (ms) => {
  if (!ms) return "nunca";
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "hace un momento";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
};

function Campo({ id, etiqueta, ...props }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label className="cg-lab" htmlFor={id}>{etiqueta}</label>
      <input id={id} className="cg-input" {...props} />
    </div>
  );
}

/* el código de recuperación, recién creado: se enseña una vez y hay que confirmar que se ha guardado */
function MostrarCodigo({ codigo, onListo }) {
  const [guardado, setGuardado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(codigo); setCopiado(true); } catch (e) { setCopiado(false); }
  };
  return (
    <div className="cg-cuenta-codigo">
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>Tu código de recuperación</h3>
      <p className="cg-hint">
        Es la llave de repuesto de tus datos. Si un día olvidas la contraseña, con esto vuelves a entrar.
        Guárdalo fuera del móvil: en tu gestor de contraseñas, en una nota en papel, donde no se pierda.
      </p>
      <p className="cg-codigo" aria-label="Código de recuperación">{codigo}</p>
      <button className="cg-ghost" onClick={copiar}>{copiado ? "Copiado" : "Copiar"}</button>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "16px 0", fontSize: 14 }}>
        <input type="checkbox" checked={guardado} onChange={(e) => setGuardado(e.target.checked)} style={{ marginTop: 3 }} />
        <span>Lo tengo guardado en un sitio seguro</span>
      </label>
      <button className="cg-btn" disabled={!guardado} onClick={onListo}>Listo</button>
    </div>
  );
}

/* formulario de entrar / crear / recuperar. modo: "entrar" | "crear" | "recuperar" */
/* después de Apple/Google: elegir el código de Dineriko (cuenta nueva), escribirlo (ya existe)
   o escribir la contraseña de la cuenta que ya había con ese email (queda unida) */
function PasoSocial({ token, consulta, social, onCodigoNuevo, onVolver, onOlvidado, onPerdido }) {
  const [recuperacion, setRecuperacion] = useState(true);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const quien = NOMBRE[token.provider];
  const nueva = consulta.estado === "nueva";
  const largoOk = pass.length >= CONTRASENA_MIN;
  const listo = nueva ? largoOk && pass === pass2 : pass.length > 0;

  const enviar = async () => {
    if (!listo || ocupado) return;
    setError(""); setOcupado(true);
    try {
      if (nueva) onCodigoNuevo(await social.crear(token, pass, { recuperacion }));
      else await social.entrar(token, pass, consulta);
    } catch (e) {
      // el permiso de Apple/Google dura unos minutos: si ha caducado, hay que volver a tocar el botón
      if (e?.codigo === "identidad") { onVolver(e); return; }
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const textos = {
    nueva: {
      titulo: "Elige tu código de Dineriko",
      intro: `${quien} confirma que eres tú, pero no puede abrir tus datos. Este código los cifra y solo lo sabes tú. Te lo pediremos al entrar desde un dispositivo nuevo, no cada día.`,
      etiqueta: "Código de Dineriko", boton: "Crear cuenta",
    },
    existe: {
      titulo: "Hola de nuevo",
      intro: `${quien} ya sabe que eres tú. Ahora tu código de Dineriko, que es lo que abre tus datos.`,
      etiqueta: "Código de Dineriko", boton: "Entrar",
    },
    vincular: {
      titulo: "Ya tienes cuenta",
      intro: `Con ${consulta.email} ya hay una cuenta de Dineriko. Escribe su contraseña y la unimos a ${quien}. A partir de ahora entrarás con ${quien} y esa misma contraseña.`,
      etiqueta: "Contraseña de Dineriko", boton: "Unir y entrar",
    },
  }[consulta.estado] || {};

  return (
    <div className="cg-cuenta-form" onKeyDown={(e) => e.key === "Enter" && enviar()}>
      <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>{textos.titulo}</h3>
      <p className="cg-hint" style={{ marginBottom: 6 }}>{textos.intro}</p>
      <p className="cg-hint" style={{ marginBottom: 14, color: "var(--ink)" }}>{consulta.email}</p>
      <Campo id="cg-social-pass" etiqueta={textos.etiqueta} type="password" autoComplete={nueva ? "new-password" : "current-password"}
        value={pass} onChange={(e) => setPass(e.target.value)} />
      {nueva && (
        <>
          <Campo id="cg-social-pass2" etiqueta="Repítelo" type="password" autoComplete="new-password"
            value={pass2} onChange={(e) => setPass2(e.target.value)} />
          <p className="cg-hint">
            {pass.length > 0 && !largoOk ? `Un poco más largo: mínimo ${CONTRASENA_MIN} caracteres.`
              : pass2.length > 0 && pass !== pass2 ? "No coinciden."
              : "Una frase que recuerdes vale más que una palabra rara. Tu gestor de contraseñas también puede guardarlo."}
          </p>
          <CasillaRecuperacion valor={recuperacion} onCambio={setRecuperacion} />
        </>
      )}
      {error && <p className="cg-cuenta-error" role="alert">{error}</p>}
      <button className="cg-btn" disabled={!listo || ocupado} onClick={enviar}>{ocupado ? "Un momento…" : textos.boton}</button>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: 12 }}>
        {!nueva && <button className="cg-link" onClick={() => onOlvidado(consulta.email)}>Lo he olvidado</button>}
        {!nueva && recuperacionDisponible() && <button className="cg-link" onClick={() => onPerdido(consulta.email)}>Lo he perdido todo</button>}
        <button className="cg-link" style={{ color: "var(--muted)" }} onClick={() => onVolver()}>Volver</button>
      </div>
    </div>
  );
}

/* social = { consultar(token), crear(token, codigo), entrar(token, secreto, consulta) } desde App.
   socialPendiente: token que llegó al volver de Apple/Google en la misma pestaña. */
export function FormCuenta({ modoInicial = "entrar", onCrear, onEntrar, onRecuperar, onCancelar, textoCancelar = "Cancelar", social, socialPendiente, onRecuperada }) {
  // si en este dispositivo hay una recuperación "Lo he perdido todo" en marcha, se retoma ahí
  const [modo, setModo] = useState(() => (peticionGuardada() && onRecuperada ? "perdido" : modoInicial));
  const [recuperacion, setRecuperacion] = useState(true);
  const [esperando, setEsperando] = useState(null); // "apple" | "google" mientras está su ventana
  const [conSocial, setConSocial] = useState(null);  // { token, consulta } tras volver de Apple/Google
  const intento = useRef(0);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [codigoNuevo, setCodigoNuevo] = useState(null);
  const [conEmail, setConEmail] = useState(false); // con Apple/Google disponibles, el email es el tercer botón

  // la sesión no se activa hasta que confirma que ha guardado el código: si no, la pantalla del código
  // desaparecería al instante (el apartado pasa a "cuenta activa")
  const continuarCon = async (token) => {
    const mio = ++intento.current;
    setError(""); setOcupado(true);
    try {
      const consulta = await social.consultar(token);
      if (mio === intento.current) { setConSocial({ token, consulta }); setPass(""); setPass2(""); }
    } catch (e) {
      if (mio === intento.current) setError(mensajeError(e));
    } finally {
      if (mio === intento.current) { setOcupado(false); setEsperando(null); }
    }
  };
  const tocarSocial = async (provider) => {
    const mio = ++intento.current;
    setError(""); setEsperando(provider);
    try {
      const token = await conseguirToken(provider);
      if (mio !== intento.current) return;
      await continuarCon(token);
    } catch (e) {
      if (mio !== intento.current) return;
      setEsperando(null);
      if (e?.codigo !== "cancelado") setError(mensajeError(e) + (e?.detalle ? ` (${e.detalle})` : ""));
    }
  };
  // vuelta de Apple/Google en la misma pestaña (el navegador bloqueó la ventana)
  useEffect(() => { if (socialPendiente && social) continuarCon(socialPendiente); }, [socialPendiente]);

  if (codigoNuevo) return <MostrarCodigo codigo={codigoNuevo.codigo} onListo={() => { codigoNuevo.terminar(); onCancelar?.("listo"); }} />;

  if (esperando) {
    return (
      <div className="cg-cuenta-form">
        <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>Esperando a {NOMBRE[esperando]}…</h3>
        <p className="cg-hint" style={{ marginBottom: 14 }}>Termina en la ventana que se ha abierto. Aquí te esperamos.</p>
        <button className="cg-link" onClick={() => { intento.current++; setEsperando(null); setOcupado(false); }}>Cancelar</button>
      </div>
    );
  }
  if (modo === "perdido") {
    return <PerdidoTodo emailInicial={email} onVolver={() => { setModo("entrar"); setError(""); }}
      onTerminada={({ sesion, codigo }) => setCodigoNuevo({ codigo, terminar: () => onRecuperada(sesion) })} />;
  }
  if (conSocial) {
    return <PasoSocial {...conSocial} social={social} onCodigoNuevo={setCodigoNuevo}
      onPerdido={(em) => { setConSocial(null); setEmail(em); setModo("perdido"); setError(""); }}
      onVolver={(err) => { setConSocial(null); setError(err ? mensajeError(err) : ""); }}
      onOlvidado={(email) => { setConSocial(null); setEmail(email); setModo("recuperar"); setError(""); }} />;
  }

  const largoOk = pass.length >= CONTRASENA_MIN;
  const coincide = pass === pass2;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const listo = emailOk && (modo === "entrar" ? pass.length > 0 : largoOk && coincide && (modo !== "recuperar" || codigo.trim().length >= 20));

  const enviar = async () => {
    if (!listo || ocupado) return;
    setError(""); setOcupado(true);
    try {
      if (modo === "crear") setCodigoNuevo(await onCrear(email.trim(), pass, { recuperacion }));
      else if (modo === "entrar") await onEntrar(email.trim(), pass);
      else await onRecuperar(email.trim(), codigo, pass);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const hayBotones = !!social && modo !== "recuperar" && (socialDisponible("apple") || socialDisponible("google"));
  const verEmail = !hayBotones || conEmail;
  const titulo = { crear: "Crea tu cuenta", entrar: "Entra en tu cuenta", recuperar: "Contraseña nueva" }[modo];
  const intro = {
    crear: "Tus gastos se guardan cifrados con tu contraseña. Ni nosotros podemos leerlos.",
    entrar: "Tus datos aparecerán en cuanto entres.",
    recuperar: "Escribe tu código de recuperación y elige una contraseña nueva. Tus datos siguen ahí.",
  }[modo];

  return (
    <div className="cg-cuenta-form" onKeyDown={(e) => e.key === "Enter" && enviar()}>
      <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>{titulo}</h3>
      <p className="cg-hint" style={{ marginBottom: 14 }}>{intro}</p>
      {hayBotones && !conEmail && (
        <div className="cg-social">
          {socialDisponible("apple") && (
            <button className="cg-social-btn apple" disabled={ocupado} onClick={() => tocarSocial("apple")}>
              {esApple() && <span aria-hidden="true" className="cg-social-logo">{"\uF8FF"}</span>}Continuar con Apple
            </button>
          )}
          {socialDisponible("google") && (
            <button className="cg-social-btn google" disabled={ocupado} onClick={() => tocarSocial("google")}>
              <LogoGoogle />Continuar con Google
            </button>
          )}
          <button className="cg-social-btn email" disabled={ocupado} onClick={() => { setConEmail(true); setError(""); }}>
            <svg className="cg-social-logo-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
            </svg>Continuar con Email
          </button>
        </div>
      )}
      {verEmail && (<>
      <Campo id="cg-cuenta-email" etiqueta="Email" type="email" autoComplete="email" inputMode="email"
        value={email} onChange={(e) => setEmail(e.target.value)} />
      {modo === "recuperar" && (
        <Campo id="cg-cuenta-codigo" etiqueta="Código de recuperación" autoComplete="off" autoCapitalize="characters"
          placeholder="XXXX-XXXX-…" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
      )}
      <Campo id="cg-cuenta-pass" etiqueta={modo === "recuperar" ? "Contraseña nueva" : "Contraseña"} type="password"
        autoComplete={modo === "entrar" ? "current-password" : "new-password"} value={pass} onChange={(e) => setPass(e.target.value)} />
      {modo !== "entrar" && (
        <>
          <Campo id="cg-cuenta-pass2" etiqueta="Repite la contraseña" type="password" autoComplete="new-password"
            value={pass2} onChange={(e) => setPass2(e.target.value)} />
          <p className="cg-hint">
            {pass.length > 0 && !largoOk ? `Un poco más larga: mínimo ${CONTRASENA_MIN} caracteres.`
              : pass2.length > 0 && !coincide ? "No coinciden."
              : "Una frase que recuerdes vale más que una palabra rara."}
          </p>
          {modo === "crear" && (
            <>
              <p className="cg-hint" style={{ color: "var(--ink)" }}>
                Ojo: si olvidas la contraseña, podrás entrar con el código de recuperación que te daremos ahora.
              </p>
              <CasillaRecuperacion valor={recuperacion} onCambio={setRecuperacion} />
            </>
          )}
        </>
      )}
      </>)}
      {error && <p className="cg-cuenta-error" role="alert">{error}</p>}
      {verEmail && (
        <button className="cg-btn" disabled={!listo || ocupado} onClick={enviar}>
          {ocupado ? "Un momento…" : { crear: "Crear cuenta", entrar: "Entrar", recuperar: "Guardar contraseña nueva" }[modo]}
        </button>
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: 12 }}>
        {hayBotones && conEmail && <button className="cg-link" onClick={() => { setConEmail(false); setError(""); }}>Entrar con Apple o Google</button>}
        {modo === "entrar" && verEmail && <button className="cg-link" onClick={() => { setModo("recuperar"); setError(""); }}>He olvidado la contraseña</button>}
        {(modo === "recuperar" || (modo === "entrar" && verEmail)) && onRecuperada && recuperacionDisponible() && (
          <button className="cg-link" onClick={() => { setModo("perdido"); setError(""); }}>{modo === "recuperar" ? "Tampoco tengo el código: lo he perdido todo" : "Lo he perdido todo"}</button>
        )}
        {modo === "entrar" && onCrear && <button className="cg-link" onClick={() => { setModo("crear"); setError(""); }}>No tengo cuenta, quiero crearla</button>}
        {modo !== "entrar" && <button className="cg-link" onClick={() => { setModo("entrar"); setError(""); }}>Ya tengo cuenta</button>}
        {onCancelar && <button className="cg-link" style={{ color: "var(--muted)" }} onClick={() => onCancelar()}>{textoCancelar}</button>}
      </div>
    </div>
  );
}

/* apartado de Ajustes */
export function AjustesCuenta({ sesion, estado, onCrear, onEntrar, onRecuperar, onSalir, onBorrar, onSincronizar, social, socialPendiente, onRecuperada }) {
  const [abierto, setAbierto] = useState(socialPendiente || peticionGuardada() ? "entrar" : null); // null | "crear" | "entrar" | "borrar"
  const [passBorrar, setPassBorrar] = useState("");
  const [errorBorrar, setErrorBorrar] = useState("");

  if (!sesion) {
    if (abierto) {
      return <FormCuenta modoInicial={abierto} onCrear={onCrear} onEntrar={onEntrar} onRecuperar={onRecuperar}
        social={social} socialPendiente={socialPendiente} onRecuperada={onRecuperada} onCancelar={() => setAbierto(null)} />;
    }
    return (
      <div className="cg-cuenta">
        <p className="cg-hint">
          Ahora mismo tus gastos viven solo en este móvil. Si se te cae al agua, se van con él.
          Con una cuenta quedan a salvo y los ves también en otros dispositivos, siempre cifrados.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="cg-ghost" onClick={() => setAbierto("crear")}>Crear cuenta</button>
          <button className="cg-ghost" onClick={() => setAbierto("entrar")}>Ya tengo cuenta</button>
        </div>
      </div>
    );
  }

  const textoEstado = estado?.fase === "sincronizando" ? "Sincronizando…"
    : estado?.fase === "sin-conexion" ? "Sin conexión. Se sincronizará solo en cuanto vuelva."
    : estado?.fase === "caducada" ? "Tu sesión ha caducado. Sal y vuelve a entrar."
    : `Sincronizado ${hace(sesion.ultimaSync)}.`;

  return (
    <div className="cg-cuenta">
      <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 2px" }}>{sesion.email}</p>
      {sesion.proveedor && <p className="cg-hint" style={{ margin: "0 0 2px" }}>Entras con {NOMBRE[sesion.proveedor]} y tu código de Dineriko</p>}
      <p className="cg-hint" aria-live="polite">{textoEstado}</p>
      {abierto === "borrar" ? (
        <div className="cg-cuenta-borrar">
          <p className="cg-hint" style={{ color: "var(--red)" }}>
            Se borra la cuenta y todo lo guardado en el servidor. Lo que hay en este dispositivo se queda.
            No hay vuelta atrás.
          </p>
          <Campo id="cg-borrar-pass" etiqueta={sesion.proveedor ? "Tu código de Dineriko, para confirmar" : "Tu contraseña, para confirmar"} type="password" autoComplete="current-password"
            value={passBorrar} onChange={(e) => setPassBorrar(e.target.value)} />
          {errorBorrar && <p className="cg-cuenta-error" role="alert">{errorBorrar}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="cg-ghost danger" disabled={!passBorrar}
              onClick={async () => { setErrorBorrar(""); try { await onBorrar(passBorrar); setAbierto(null); } catch (e) { setErrorBorrar(mensajeError(e)); } }}>
              Borrar mi cuenta
            </button>
            <button className="cg-ghost" onClick={() => { setAbierto(null); setPassBorrar(""); setErrorBorrar(""); }}>Mejor no</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="cg-ghost" onClick={onSincronizar}>Sincronizar ahora</button>
          <button className="cg-ghost" onClick={onSalir}>Cerrar sesión</button>
          <button className="cg-ghost danger" onClick={() => setAbierto("borrar")}>Borrar cuenta</button>
        </div>
      )}
      {abierto !== "borrar" && <AjusteRecuperacion sesion={sesion} />}
    </div>
  );
}
