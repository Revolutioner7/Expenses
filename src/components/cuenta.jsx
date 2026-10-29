import React, { useState } from "react";

/* traduce los códigos del servidor a algo que se entienda */
export function mensajeError(e) {
  switch (e?.codigo) {
    case "credenciales": return "Email o contraseña incorrectos.";
    case "email-en-uso": return "Ya hay una cuenta con ese email. Prueba a entrar en vez de crearla.";
    case "sin-conexion": return "Sin conexión. Inténtalo cuando tengas internet.";
    case "demasiados-intentos": return "Demasiados intentos seguidos. Espera un cuarto de hora y vuelve a probar.";
    case "email": return "Ese email no tiene buena pinta. Revísalo.";
    case "sin-sesion": return "Tu sesión ha caducado. Vuelve a entrar.";
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
export function FormCuenta({ modoInicial = "entrar", onCrear, onEntrar, onRecuperar, onCancelar, textoCancelar = "Cancelar" }) {
  const [modo, setModo] = useState(modoInicial);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [codigoNuevo, setCodigoNuevo] = useState(null);

  // la sesión no se activa hasta que confirma que ha guardado el código: si no, la pantalla del código
  // desaparecería al instante (el apartado pasa a "cuenta activa")
  if (codigoNuevo) return <MostrarCodigo codigo={codigoNuevo.codigo} onListo={() => { codigoNuevo.terminar(); onCancelar?.("listo"); }} />;

  const largoOk = pass.length >= CONTRASENA_MIN;
  const coincide = pass === pass2;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const listo = emailOk && (modo === "entrar" ? pass.length > 0 : largoOk && coincide && (modo !== "recuperar" || codigo.trim().length >= 20));

  const enviar = async () => {
    if (!listo || ocupado) return;
    setError(""); setOcupado(true);
    try {
      if (modo === "crear") setCodigoNuevo(await onCrear(email.trim(), pass));
      else if (modo === "entrar") await onEntrar(email.trim(), pass);
      else await onRecuperar(email.trim(), codigo, pass);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

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
            <p className="cg-hint" style={{ color: "var(--ink)" }}>
              Ojo: si olvidas la contraseña, solo podrás entrar con el código de recuperación que te daremos ahora.
            </p>
          )}
        </>
      )}
      {error && <p className="cg-cuenta-error" role="alert">{error}</p>}
      <button className="cg-btn" disabled={!listo || ocupado} onClick={enviar}>
        {ocupado ? "Un momento…" : { crear: "Crear cuenta", entrar: "Entrar", recuperar: "Guardar contraseña nueva" }[modo]}
      </button>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: 12 }}>
        {modo === "entrar" && <button className="cg-link" onClick={() => { setModo("recuperar"); setError(""); }}>He olvidado la contraseña</button>}
        {modo === "entrar" && onCrear && <button className="cg-link" onClick={() => { setModo("crear"); setError(""); }}>No tengo cuenta, quiero crearla</button>}
        {modo !== "entrar" && <button className="cg-link" onClick={() => { setModo("entrar"); setError(""); }}>Ya tengo cuenta</button>}
        {onCancelar && <button className="cg-link" style={{ color: "var(--muted)" }} onClick={() => onCancelar()}>{textoCancelar}</button>}
      </div>
    </div>
  );
}

/* apartado de Ajustes */
export function AjustesCuenta({ sesion, estado, onCrear, onEntrar, onRecuperar, onSalir, onBorrar, onSincronizar }) {
  const [abierto, setAbierto] = useState(null); // null | "crear" | "entrar" | "borrar"
  const [passBorrar, setPassBorrar] = useState("");
  const [errorBorrar, setErrorBorrar] = useState("");

  if (!sesion) {
    if (abierto) {
      return <FormCuenta modoInicial={abierto} onCrear={onCrear} onEntrar={onEntrar} onRecuperar={onRecuperar}
        onCancelar={() => setAbierto(null)} />;
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
      <p className="cg-hint" aria-live="polite">{textoEstado}</p>
      {abierto === "borrar" ? (
        <div className="cg-cuenta-borrar">
          <p className="cg-hint" style={{ color: "var(--red)" }}>
            Se borra la cuenta y todo lo guardado en el servidor. Lo que hay en este dispositivo se queda.
            No hay vuelta atrás.
          </p>
          <Campo id="cg-borrar-pass" etiqueta="Tu contraseña, para confirmar" type="password" autoComplete="current-password"
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
    </div>
  );
}
