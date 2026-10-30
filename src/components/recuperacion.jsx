import React, { useEffect, useState } from "react";
import { API_URL, RECUPERACION_PUBLICA } from "../constants.js";
import { empezarRecuperacion, estadoRecuperacion, completarRecuperacion, infoCuenta, activarRecuperacion, desactivarRecuperacion } from "../lib/cuenta.js";
import { listarPeticiones, aprobarPeticion, crearLlaveMaestra } from "../lib/admin.js";
import { textoAMaestra } from "../lib/recuperacion.js";

export const recuperacionDisponible = () => !!RECUPERACION_PUBLICA;

/* la petición en curso vive en este dispositivo: es el único que puede terminarla */
const CLAVE = "dineriko-recuperacion";
export function peticionGuardada() {
  try { return JSON.parse(localStorage.getItem(CLAVE) || "null"); } catch (e) { return null; }
}
const guardar = (p) => { try { p ? localStorage.setItem(CLAVE, JSON.stringify(p)) : localStorage.removeItem(CLAVE); } catch (e) {} };

const fecha = (ms) => new Date(ms).toLocaleString("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const MIN = 10;

function mensaje(e) {
  switch (e?.codigo) {
    case "sin-conexion": return "Sin conexión. Inténtalo cuando tengas internet.";
    case "email": return "Ese email no tiene buena pinta. Revísalo.";
    case "recuperacion-en-curso": return "Ya hay una petición en marcha para esa cuenta. Revisa tu email.";
    case "email-no-disponible": return "Ahora mismo no podemos enviar emails. Prueba en un rato.";
    case "credenciales": return "Contraseña incorrecta.";
    case "repuesto": return "No se han podido abrir tus datos con la llave de repuesto. Escríbenos y lo miramos.";
    default: return "Algo ha fallado por nuestro lado. Prueba otra vez en un rato.";
  }
}

const Titulo = ({ children }) => <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>{children}</h3>;
function Campo({ id, etiqueta, ...props }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label className="cg-lab" htmlFor={id}>{etiqueta}</label>
      <input id={id} className="cg-input" {...props} />
    </div>
  );
}

/* "Lo he perdido todo": pedirla, esperar y terminarla. onSesion({ sesion, codigo }) al acabar. */
export function PerdidoTodo({ emailInicial = "", onVolver, onTerminada }) {
  const [pend, setPend] = useState(() => peticionGuardada());
  const [email, setEmail] = useState(emailInicial);
  const [st, setSt] = useState(null);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const comprobar = async (p = pend) => {
    if (!p) return;
    setError(""); setOcupado(true);
    try { setSt(await estadoRecuperacion(API_URL, p)); } catch (e) { setError(mensaje(e)); } finally { setOcupado(false); }
  };
  useEffect(() => { if (pend) comprobar(pend); }, []);

  const pedir = async () => {
    setError(""); setOcupado(true);
    try {
      const p = await empezarRecuperacion(API_URL, email.trim());
      guardar(p); setPend(p); setSt({ estado: "pendiente" });
    } catch (e) { setError(mensaje(e)); } finally { setOcupado(false); }
  };
  const olvidar = () => { guardar(null); setPend(null); setSt(null); };

  const terminar = async () => {
    setError(""); setOcupado(true);
    try {
      const r = await completarRecuperacion(API_URL, pend, pass, RECUPERACION_PUBLICA);
      guardar(null);
      onTerminada(r);
    } catch (e) { setError(mensaje(e)); setOcupado(false); }
  };

  const pie = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: 12 }}>
      {onVolver && <button className="cg-link" style={{ color: "var(--muted)" }} onClick={onVolver}>Volver</button>}
    </div>
  );

  if (!pend) {
    return (
      <div className="cg-cuenta-form">
        <Titulo>Lo he perdido todo</Titulo>
        <p className="cg-hint">Para cuando no tienes ni la contraseña (o el código de Dineriko) ni el código de recuperación. Funciona así:</p>
        <ol className="cg-hint" style={{ paddingLeft: 18, margin: "0 0 12px" }}>
          <li>Te mandamos un email para confirmar que eres tú.</li>
          <li>Esperamos 72 horas. Si alguien lo está intentando por ti, te avisamos y puedes cancelarlo.</li>
          <li>Lo revisamos a mano y, desde este mismo dispositivo, eliges una contraseña nueva.</li>
        </ol>
        <p className="cg-hint" style={{ color: "var(--ink)" }}>Tus datos no se pierden y nadie los lee por el camino.</p>
        <Campo id="cg-perdido-email" etiqueta="El email de tu cuenta" type="email" autoComplete="email" inputMode="email"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        {error && <p className="cg-cuenta-error" role="alert">{error}</p>}
        <button className="cg-btn" disabled={ocupado || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} onClick={pedir}>
          {ocupado ? "Un momento…" : "Pedir la recuperación"}
        </button>
        {pie}
      </div>
    );
  }

  const estado = st?.estado;
  if (estado === "aprobada") {
    const ok = pass.length >= MIN && pass === pass2;
    return (
      <div className="cg-cuenta-form" onKeyDown={(e) => e.key === "Enter" && ok && !ocupado && terminar()}>
        <Titulo>Ya puedes volver a entrar</Titulo>
        <p className="cg-hint" style={{ marginBottom: 14 }}>Elige una contraseña nueva para {st.email}. Si entrabas con Apple o Google, este será tu código de Dineriko nuevo.</p>
        <Campo id="cg-perdido-pass" etiqueta="Contraseña nueva" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
        <Campo id="cg-perdido-pass2" etiqueta="Repítela" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
        <p className="cg-hint">{pass.length > 0 && pass.length < MIN ? `Un poco más larga: mínimo ${MIN} caracteres.` : pass2 && pass !== pass2 ? "No coinciden." : "Después te daremos un código de recuperación nuevo."}</p>
        {error && <p className="cg-cuenta-error" role="alert">{error}</p>}
        <button className="cg-btn" disabled={!ok || ocupado} onClick={terminar}>{ocupado ? "Un momento…" : "Guardar y entrar"}</button>
      </div>
    );
  }

  const textos = {
    pendiente: ["Revisa tu email", `Te hemos escrito a ${pend.email}. Pulsa «Sí, soy yo» en ese email para empezar la espera. Si no te llega en unos minutos, mira en spam.`],
    esperando: ["Esperando 72 horas", st?.listaEn ? `Si nadie la cancela, a partir del ${fecha(st.listaEn)} la revisamos a mano. Vuelve a esta pantalla en este mismo dispositivo.` : "Vuelve a esta pantalla en este mismo dispositivo dentro de unos días."],
    cancelada: ["Petición cancelada", "Se canceló con el enlace del email. Si fuiste tú y sigues sin acceso, puedes pedirla otra vez."],
    caducada: ["Petición caducada", "Pasó demasiado tiempo sin confirmarla o sin terminarla. Puedes pedirla otra vez."],
    completada: ["Ya se completó", "Esta recuperación ya se terminó. Entra con tu contraseña nueva."],
  }[estado] || ["Comprobando…", ""];
  const acabada = ["cancelada", "caducada", "completada"].includes(estado);
  return (
    <div className="cg-cuenta-form">
      <Titulo>{textos[0]}</Titulo>
      <p className="cg-hint">{textos[1]}</p>
      {error && <p className="cg-cuenta-error" role="alert">{error}</p>}
      {acabada
        ? <button className="cg-btn" onClick={olvidar}>{estado === "completada" ? "Entendido" : "Empezar de nuevo"}</button>
        : <button className="cg-btn" disabled={ocupado} onClick={() => comprobar()}>{ocupado ? "Comprobando…" : "Comprobar ahora"}</button>}
      {!acabada && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button className="cg-link" style={{ color: "var(--muted)" }}
            onClick={() => { if (window.confirm("Se olvida la petición en este dispositivo y ya no podrás terminarla aquí. ¿Seguir?")) olvidar(); }}>
            Olvidar esta petición
          </button>
        </div>
      )}
      {pie}
    </div>
  );
}

/* ── en Ajustes, con la cuenta abierta: activar o desactivar la recuperación ── */
export function AjusteRecuperacion({ sesion }) {
  const [info, setInfo] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { infoCuenta(API_URL, sesion).then(setInfo).catch(() => {}); }, [sesion?.token]);
  if (!info || !recuperacionDisponible()) return null;

  const cambiar = async () => {
    setError(""); setOcupado(true);
    try {
      const r = info.recuperacion ? await desactivarRecuperacion(API_URL, sesion, pass) : await activarRecuperacion(API_URL, sesion, pass, RECUPERACION_PUBLICA);
      setInfo({ ...info, recuperacion: r.recuperacion }); setAbierto(false); setPass("");
    } catch (e) { setError(mensaje(e)); } finally { setOcupado(false); }
  };
  const etiqueta = sesion.proveedor ? "Tu código de Dineriko" : "Tu contraseña";
  return (
    <div className="cg-cuenta-rec" style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 12 }}>
      <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 2px" }}>Si lo pierdo todo</p>
      <p className="cg-hint">
        {info.recuperacion
          ? "Activada. Si pierdes la contraseña y el código de recuperación, podrás pedir que te devolvamos el acceso (con 72 horas de espera y revisión a mano)."
          : "Desactivada. Si pierdes la contraseña y el código de recuperación, nadie podrá abrir tus datos, ni nosotros."}
      </p>
      {info.recuperadaEn && <p className="cg-hint">Acceso recuperado el {fecha(info.recuperadaEn)}.</p>}
      {abierto ? (
        <>
          {info.recuperacion && <p className="cg-hint" style={{ color: "var(--red)" }}>Si la desactivas y un día pierdes las dos cosas, tus datos no se podrán recuperar de ninguna forma.</p>}
          <Campo id="cg-rec-pass" etiqueta={etiqueta + ", para confirmar"} type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          {error && <p className="cg-cuenta-error" role="alert">{error}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className={`cg-ghost${info.recuperacion ? " danger" : ""}`} disabled={!pass || ocupado} onClick={cambiar}>
              {info.recuperacion ? "Desactivar" : "Activar"}
            </button>
            <button className="cg-ghost" onClick={() => { setAbierto(false); setPass(""); setError(""); }}>Mejor no</button>
          </div>
        </>
      ) : (
        <button className="cg-ghost" onClick={() => setAbierto(true)}>{info.recuperacion ? "Desactivar" : "Activar"}</button>
      )}
    </div>
  );
}

/* ── panel de Rodrigo (solo en la beta desbloqueada) ── */
export function PanelRecuperaciones() {
  const [texto, setTexto] = useState("");
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [nueva, setNueva] = useState(null);

  const maestra = () => textoAMaestra(texto);
  const cargar = async () => {
    setError(""); setOcupado(true);
    try { setLista(await listarPeticiones(API_URL, maestra())); }
    catch (e) { setError(e?.message === "maestra-invalida" ? "Eso no parece tu llave maestra." : e?.codigo === "admin" ? "El servidor no reconoce esta llave maestra." : "No se ha podido cargar."); }
    finally { setOcupado(false); }
  };
  const aprobar = async (p) => {
    if (!window.confirm(`¿Aprobar la recuperación de ${p.email}?`)) return;
    setOcupado(true);
    try { await aprobarPeticion(API_URL, maestra(), p); await cargar(); } catch (e) { setError("No se ha podido aprobar: " + (e?.codigo || e?.message)); setOcupado(false); }
  };

  if (!recuperacionDisponible()) {
    return (
      <div>
        <p className="cg-hint">Todavía no hay llave maestra. Créala una sola vez y guarda la parte privada en tu gestor de contraseñas (mejor en dos sitios). Sin ella no se podrá recuperar a nadie.</p>
        {!nueva ? (
          <button className="cg-ghost" onClick={async () => setNueva(await crearLlaveMaestra())}>Crear llave maestra</button>
        ) : (
          <>
            <label className="cg-lab">1. Privada: cópiala a tu gestor de contraseñas. No la compartas con nadie, tampoco con Claude.</label>
            <textarea className="cg-input" readOnly rows={3} value={nueva.textoPrivado} style={{ fontFamily: "var(--mono)", fontSize: 11 }} />
            <button className="cg-ghost" onClick={() => navigator.clipboard?.writeText(nueva.textoPrivado)}>Copiar privada</button>
            <label className="cg-lab" style={{ marginTop: 12 }}>2. Pública: esta sí se la pasas a Claude para ponerla en la app y el servidor.</label>
            <textarea className="cg-input" readOnly rows={3} value={JSON.stringify(nueva.publica)} style={{ fontFamily: "var(--mono)", fontSize: 11 }} />
            <button className="cg-ghost" onClick={() => navigator.clipboard?.writeText(JSON.stringify(nueva.publica))}>Copiar pública</button>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="cg-hint">Pega tu llave maestra para ver las peticiones. No se guarda en ningún sitio.</p>
      <textarea className="cg-input" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="dineriko-maestra:…" style={{ fontFamily: "var(--mono)", fontSize: 11 }} />
      <button className="cg-ghost" disabled={!texto || ocupado} onClick={cargar}>{ocupado ? "Cargando…" : "Ver peticiones"}</button>
      {error && <p className="cg-cuenta-error" role="alert">{error}</p>}
      {lista && (
        lista.peticiones.length === 0 ? <p className="cg-hint" style={{ marginTop: 10 }}>No hay peticiones en los últimos 30 días.</p> : (
          <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
            {lista.peticiones.map((p) => (
              <li key={p.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0", fontSize: 13.5 }}>
                <b>{p.email}</b> · {p.estado}<br />
                <span className="cg-hint">Pedida {fecha(p.creada)}{p.lista ? ` · lista ${fecha(p.lista)}` : ""}</span>
                {p.a && <div><button className="cg-ghost" disabled={ocupado} onClick={() => aprobar(p)}>Aprobar</button></div>}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
