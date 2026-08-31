import React, { useState } from "react";

export function isAppInstalled() {
  return window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
}

export function Onboarding({ startStep, onDone }) {
  const [step, setStep] = useState(startStep); // 'install' | 'consent'
  const [accepted, setAccepted] = useState(false);
  const [email, setEmail] = useState("");

  return (
    <div className="cg-root">
      {step === "install" ? (
        <div className="cg-onboard">
          <div className="cg-onboard-head">
            <button className="cg-navbtn" onClick={() => setStep("consent")} aria-label="Atrás">←</button>
            <h1 className="cg-title" style={{ margin: 0 }}>Cómo instalar</h1>
          </div>

          <div className="cg-card">
            <div className="cg-onboard-sub">iPhone</div>
            <p className="cg-onboard-step">1. Abre este enlace en Safari</p>
            <p className="cg-onboard-step">2. Toca el icono de compartir</p>
            <p className="cg-onboard-step">3. Elige «Añadir a pantalla de inicio»</p>
            <p className="cg-onboard-step">4. Abre el icono nuevo desde tu pantalla</p>
          </div>

          <div className="cg-card">
            <div className="cg-onboard-sub">Android</div>
            <p className="cg-onboard-step">1. Abre este enlace en Chrome</p>
            <p className="cg-onboard-step">2. Toca los tres puntos de arriba</p>
            <p className="cg-onboard-step">3. Elige «Añadir a pantalla de inicio»</p>
            <p className="cg-onboard-step">4. Abre el icono nuevo desde tu pantalla</p>
          </div>

          <button className="cg-btn" onClick={() => setStep("consent")}>Entendido, empezar</button>
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button className="cg-ghost" onClick={() => setStep("consent")}>Seguir sin instalar por ahora</button>
          </div>
        </div>
      ) : (
        <div className="cg-onboard">
          <div className="cg-onboard-logo">🌱</div>
          <p className="cg-onboard-title">Cosecha</p>
          <p className="cg-onboard-tag">Tu dinero, con acompañamiento.</p>

          <label className="cg-lab" htmlFor="cg-onboard-email">Email</label>
          <input id="cg-onboard-email" className="cg-input" type="email" placeholder="tu@email.com"
            value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 4 }} />
          <p className="cg-hint" style={{ marginBottom: 16 }}>
            Por favor, por motivos de seguridad y satisfacción, registra tu email. Nunca se comparte con terceros.
          </p>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 20 }}>
            <input id="cg-onboard-accept" type="checkbox" checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)} style={{ marginTop: 3 }} />
            <label htmlFor="cg-onboard-accept" style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              He leído y acepto el <b>aviso antes de empezar</b>
            </label>
          </div>

          <button className="cg-btn" disabled={!accepted} onClick={() => onDone(email.trim())}>Empezar</button>

          <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--muted)", marginTop: 14 }}>
            🔒 Tus gastos nunca salen de este dispositivo
          </p>
        </div>
      )}
    </div>
  );
}
