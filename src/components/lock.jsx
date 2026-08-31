import React, { useState, useEffect, useRef, useCallback } from "react";
import { Sheet } from "./ui.jsx";

/* ── pantalla de bloqueo ── */
export function LockScreen({ onUnlock, onBio, onWipe }) {
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [conPass, setConPass] = useState(!onBio);
  const intentado = useRef(false);

  const bio = useCallback(async () => {
    if (!onBio || busy) return;
    setBusy(true); setError("");
    const r = await onBio();
    if (r === "cancelado") setError("");
    else if (r !== "ok") setError("No se pudo con Face ID. Prueba con la contraseña.");
    setBusy(false);
  }, [onBio, busy]);

  /* al abrir la app, Face ID directo: es lo que se espera */
  useEffect(() => {
    if (onBio && !intentado.current) { intentado.current = true; bio(); }
  }, [onBio, bio]);

  const abrir = async () => {
    if (!pass || busy) return;
    setBusy(true); setError("");
    const ok = await onUnlock(pass);
    if (!ok) { setError("No es la contraseña. Inténtalo otra vez."); setPass(""); }
    setBusy(false);
  };

  return (
    <div className="cg-root">
      <div className="cg-wrap">
        <div className="cg-hero" style={{ marginTop: "12vh" }}>
          <div className="cg-eyebrow">Cosecha</div>
          <div className="cg-brand" style={{ fontSize: 21, marginTop: 2 }}>Gastos del mes</div>

          {onBio && !conPass ? (
            <>
              <button className="cg-btn" onClick={bio} disabled={busy} style={{ marginTop: 20 }}>
                {busy ? "Esperando…" : "Abrir con Face ID"}
              </button>
              {error && <p style={{ color: "#F0A79B", fontSize: 13, margin: "10px 0 0" }}>{error}</p>}
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <button className="cg-ghost" style={{ color: "#9FB3AA", borderColor: "rgba(242,245,241,.25)" }}
                  onClick={() => { setConPass(true); setError(""); }}>
                  Usar la contraseña
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginTop: 20 }}>
                <label className="cg-lab" style={{ color: "#8DA39A" }} htmlFor="cg-pass">Contraseña</label>
                <input id="cg-pass" className="cg-input" type="password" autoFocus
                  autoComplete="current-password" value={pass} disabled={busy}
                  onChange={(e) => setPass(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && abrir()} />
              </div>
              {error && <p style={{ color: "#F0A79B", fontSize: 13, margin: "10px 0 0" }}>{error}</p>}
              <button className="cg-btn" onClick={abrir} disabled={!pass || busy}>
                {busy ? "Descifrando…" : "Abrir"}
              </button>
              {onBio && (
                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <button className="cg-ghost" style={{ color: "#9FB3AA", borderColor: "rgba(242,245,241,.25)" }}
                    onClick={() => { setConPass(false); setError(""); }}>
                    Usar Face ID
                  </button>
                </div>
              )}
            </>
          )}

          <p className="cg-sub" style={{ marginTop: 14, lineHeight: 1.5 }}>
            Tus datos están cifrados en este dispositivo. Nadie, ni el creador guapo y simpático
            de esta app, puede acceder a ellos ni recuperarlos.
          </p>
        </div>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button className="cg-ghost danger" onClick={onWipe}>La he olvidado</button>
        </div>
      </div>
    </div>
  );
}

export function SecuritySheet({ mode, onEnable, onDisable, onBackup, onClose }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const quitando = mode === "off";
  const cambiando = mode === "change";

  const fuerza = (() => {
    if (p1.length < 4) return null;
    if (/^\d+$/.test(p1)) return p1.length >= 6
      ? { txt: "PIN de " + p1.length + " dígitos: frena miradas ajenas, poco más", col: "var(--saffron)" }
      : { txt: "PIN muy corto", col: "var(--red)" };
    if (p1.length >= 14) return { txt: "Buena contraseña", col: "var(--pine)" };
    return { txt: "Aceptable. Varias palabras sería mejor", col: "var(--saffron)" };
  })();

  const enviar = async () => {
    setError(""); 
    if (quitando) {
      setBusy(true);
      const ok = await onDisable(p1);
      setBusy(false);
      if (!ok) { setError("No es la contraseña actual."); return; }
      onClose(); return;
    }
    if (p1.length < 4) { setError("Mínimo 4 caracteres."); return; }
    if (p1 !== p2) { setError("Las dos no coinciden."); return; }
    setBusy(true);
    await onEnable(p1);
    setBusy(false);
    onClose();
  };

  return (
    <Sheet title={quitando ? "Quitar la protección" : cambiando ? "Cambiar la contraseña" : "Proteger la app"} onClose={onClose}>
      {!quitando && (
        <>
          <p className="cg-hint" style={{ marginTop: 0 }}>
            La app pedirá esta contraseña al abrirse, y con ella se cifran los datos guardados en
            el dispositivo. Sirve un PIN de números o una frase; una frase de varias palabras es
            mucho más difícil de adivinar.
          </p>
          <div className="cg-card" style={{ background: "#FDF6E7", borderColor: "#EBD9AE", padding: 13 }}>
            <b style={{ fontSize: 13.5 }}>Si la olvidas, los datos no se recuperan.</b>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "6px 0 10px", lineHeight: 1.5 }}>
              No hay servidor ni correo de recuperación. Guarda una copia antes, y apunta la
              contraseña en tu gestor de contraseñas.
            </p>
            <button className="cg-ghost" onClick={onBackup}>Guardar copia ahora</button>
          </div>
        </>
      )}

      <div style={{ marginTop: 12 }}>
        <label className="cg-lab" htmlFor="cg-p1">{quitando ? "Contraseña actual" : "Contraseña"}</label>
        <input id="cg-p1" className="cg-input" type="password" autoFocus value={p1}
          autoComplete={quitando ? "current-password" : "new-password"}
          onChange={(e) => setP1(e.target.value)} />
        {!quitando && fuerza && (
          <p style={{ fontSize: 12, color: fuerza.col, margin: "6px 0 0" }}>{fuerza.txt}</p>
        )}
      </div>

      {!quitando && (
        <div style={{ marginTop: 12 }}>
          <label className="cg-lab" htmlFor="cg-p2">Repítela</label>
          <input id="cg-p2" className="cg-input" type="password" value={p2}
            autoComplete="new-password" onChange={(e) => setP2(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviar()} />
        </div>
      )}

      {error && <p style={{ color: "var(--red)", fontSize: 13, margin: "10px 0 0" }}>{error}</p>}

      <button className="cg-btn" onClick={enviar} disabled={busy || !p1}>
        {busy ? "Trabajando…" : quitando ? "Quitar la protección" : cambiando ? "Cambiar la contraseña" : "Activar"}
      </button>
    </Sheet>
  );
}
