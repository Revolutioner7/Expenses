import React, { useState } from "react";
import { APP_NAME } from "../constants.js";
import { BancoPicker } from "./ui.jsx";

export function isAppInstalled() {
  return window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
}

/* 'ios' | 'android' | null (de escritorio, o no se pudo saber — en ese caso se muestran las dos) */
export function detectarPlataforma() {
  const ua = window.navigator.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return null;
}

/* cabecera de cada pregunta: flecha de atrás (44px, cómoda para el dedo) + "Paso N de 6" centrado */
function CabeceraPaso({ paso, onBack }) {
  return (
    <div className="cg-onboard-stephead">
      <button className="cg-onboard-back" onClick={onBack} aria-label="Atrás">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
      </button>
      <span className="cg-eyebrow" style={{ textAlign: "center" }}>Paso {paso} de 6</span>
      <span />
    </div>
  );
}

/* una opción grande: tocarla ya contesta la pregunta. "on" solo se ve al volver atrás a una ya contestada */
function Opcion({ on, onClick, children }) {
  return (
    <button className={`cg-onboard-choice ${on ? "on" : ""}`} onClick={onClick}>
      {on && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      )}
      {children}
    </button>
  );
}

/* "Saltar por ahora" subrayado (la parte que se pulsa) + el resto de la frase como texto normal */
function Saltar({ onClick, resto }) {
  return (
    <p className="cg-onboard-skip">
      <button className="cg-onboard-skiplink" onClick={onClick}>Saltar por ahora</button>. {resto}
    </p>
  );
}

export function Onboarding({ startStep, onDone, bancos, masUsadoBancoId, onAddBanco }) {
  const [step, setStep] = useState(startStep); // 'install' | 'consent' | 'vista' | 'difpago' | 'pago' | 'periodicos'
  const [accepted, setAccepted] = useState(false);
  const [email, setEmail] = useState("");
  const [heroModo, setHeroModo] = useState(null);
  const [formaPago, setFormaPago] = useState(null);
  const [bancoId, setBancoId] = useState(null);
  const [mostrarPicker, setMostrarPicker] = useState(false);
  const [gastosPeriodicos, setGastosPeriodicos] = useState(null);
  const [diferenciarPago, setDiferenciarPago] = useState(null);
  const bancoElegido = bancos?.find((b) => b.id === bancoId) || null;

  return (
    <div className="cg-root">
      {step === "install" ? (
        <div className="cg-onboard">
          <div className="cg-onboard-head">
            <button className="cg-navbtn" onClick={() => setStep("consent")} aria-label="Atrás">←</button>
            <h1 className="cg-title" style={{ margin: 0 }}>Cómo instalar</h1>
          </div>

          {(() => {
            const plataforma = detectarPlataforma();
            return (
              <>
                {(plataforma === "ios" || plataforma === null) && (
                  <div className="cg-card">
                    <div className="cg-onboard-sub">iPhone</div>
                    <p className="cg-onboard-step">1. Abre este enlace en Safari</p>
                    <p className="cg-onboard-step">2. Toca el icono de compartir</p>
                    <p className="cg-onboard-step">3. Elige «Añadir a pantalla de inicio»</p>
                    <p className="cg-onboard-step">4. Abre el icono nuevo desde tu pantalla</p>
                  </div>
                )}

                {(plataforma === "android" || plataforma === null) && (
                  <div className="cg-card">
                    <div className="cg-onboard-sub">Android</div>
                    <p className="cg-onboard-step">1. Abre este enlace en Chrome</p>
                    <p className="cg-onboard-step">2. Toca los tres puntos de arriba</p>
                    <p className="cg-onboard-step">3. Elige «Añadir a pantalla de inicio»</p>
                    <p className="cg-onboard-step">4. Abre el icono nuevo desde tu pantalla</p>
                  </div>
                )}
              </>
            );
          })()}

          <button className="cg-btn" onClick={() => setStep("consent")}>Entendido, empezar</button>
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button className="cg-ghost" onClick={() => setStep("consent")}>Seguir sin instalar por ahora</button>
          </div>
        </div>
      ) : step === "consent" ? (
        <div className="cg-onboard">
          <img src="./icon-192.png" alt="" className="cg-onboard-logo" />
          <p className="cg-onboard-title">{APP_NAME}</p>
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

          <button className="cg-btn" disabled={!accepted} onClick={() => setStep("vista")}>Empezar</button>

          <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--muted)", marginTop: 14 }}>
            🔒 Los detalles de tus gastos nunca salen de este dispositivo
          </p>
        </div>
      ) : step === "vista" ? (
        <div className="cg-onboard">
          <CabeceraPaso paso={3} onBack={() => setStep("consent")} />
          <p className="cg-title" style={{ textAlign: "center", marginTop: 8, marginBottom: 4 }}>
            ¿Qué es más importante, lo que llevas gastado este mes o lo que queda disponible?
          </p>
          <p className="cg-hint" style={{ textAlign: "center", marginBottom: 20 }}>
            Es el número grande de la pantalla principal. Puedes cambiarlo cuando quieras en Ajustes.
          </p>

          <div className="cg-onboard-choices">
            <Opcion on={heroModo === "gastado"} onClick={() => { setHeroModo("gastado"); setStep("difpago"); }}>Gasto</Opcion>
            <Opcion on={heroModo === "disponible"} onClick={() => { setHeroModo("disponible"); setStep("difpago"); }}>Disponible</Opcion>
          </div>

          <Saltar onClick={() => setStep("difpago")} resto="Puedes decidirlo luego en Ajustes." />
        </div>
      ) : step === "difpago" ? (
        <div className="cg-onboard">
          <CabeceraPaso paso={4} onBack={() => setStep("vista")} />
          <p className="cg-title" style={{ textAlign: "center", marginTop: 8, marginBottom: 4 }}>
            ¿Te interesa diferenciar cómo se pagan los gastos?
          </p>
          <p className="cg-hint" style={{ textAlign: "center", marginBottom: 20 }}>
            Si lo activas, podrás seleccionar entre tarjeta, transferencia, dinero, etc.
          </p>

          <div className="cg-onboard-choices">
            <Opcion on={diferenciarPago === true} onClick={() => { setDiferenciarPago(true); setStep("pago"); }}>Sí</Opcion>
            <Opcion on={diferenciarPago === false} onClick={() => { setDiferenciarPago(false); setStep("periodicos"); }}>No</Opcion>
          </div>

          <Saltar onClick={() => setStep("pago")} resto="Puedes decidirlo luego en Ajustes → Dinero." />
        </div>
      ) : step === "pago" ? (
        <div className="cg-onboard">
          <CabeceraPaso paso={5} onBack={() => setStep("difpago")} />
          <p className="cg-title" style={{ textAlign: "center", marginTop: 8, marginBottom: 4 }}>¿Cómo pagas normalmente?</p>
          <p className="cg-hint" style={{ textAlign: "center", marginBottom: 20 }}>
            Así lo dejamos ya marcado cuando anotes un gasto. Puedes cambiarlo cuando quieras, o pasar de esto.
          </p>

          {/* textos largos: una opción por fila. Efectivo y Bizum contestan y avanzan; tarjeta
              necesita un paso más (elegir banco), así que es la única que enseña "Continuar" */}
          <div className="cg-onboard-choices stack">
            <Opcion on={formaPago === "efectivo"}
              onClick={() => { setFormaPago("efectivo"); setBancoId(null); setMostrarPicker(false); setStep("periodicos"); }}>
              Casi siempre en efectivo
            </Opcion>
            <Opcion on={formaPago === "bizum"}
              onClick={() => { setFormaPago("bizum"); setBancoId(null); setMostrarPicker(false); setStep("periodicos"); }}>
              Casi siempre con Bizum/Transferencia
            </Opcion>
            <Opcion on={formaPago === "banco"} onClick={() => setFormaPago("banco")}>
              Casi siempre con tarjeta
            </Opcion>
          </div>

          {formaPago === "banco" && (
            <>
              {mostrarPicker ? (
                <div style={{ marginTop: 12 }}>
                  <BancoPicker bancos={bancos || []} masUsadoId={masUsadoBancoId} selectedId={bancoId}
                    onSelect={(id) => { setBancoId(id); setMostrarPicker(false); }} onAddNuevo={onAddBanco} />
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 12px", borderRadius: 10, background: "#E6F1FB", marginTop: 12 }}>
                  <span style={{ fontSize: 13 }}>{bancoElegido ? bancoElegido.name : "Elige tu banco…"}</span>
                  <button className="cg-vermas" onClick={() => setMostrarPicker(true)}>{bancoElegido ? "cambiar" : "elegir"}</button>
                </div>
              )}
              <button className="cg-btn" style={{ marginTop: 16 }} onClick={() => setStep("periodicos")}>
                Continuar
              </button>
            </>
          )}

          <Saltar onClick={() => setStep("periodicos")} resto="Puedes decidirlo luego en Ajustes." />
        </div>
      ) : (
        <div className="cg-onboard">
          {/* atrás vuelve a la última pregunta que de verdad se vio: si se contestó "No" a diferenciar
              pagos, el paso 5 se saltó entero, así que se vuelve al 4 */}
          <CabeceraPaso paso={6} onBack={() => setStep(diferenciarPago === false ? "difpago" : "pago")} />
          <p className="cg-title" style={{ textAlign: "center", marginTop: 8, marginBottom: 4 }}>
            ¿Tienes gastos que no se pagan mensualmente?
          </p>
          <p className="cg-hint" style={{ textAlign: "center", marginBottom: 20 }}>
            Seguros, comunidad, suscripciones anuales… Podemos ayudarte a separar un monto cada mes
            para no tener que pagarlo de golpe.
          </p>

          {/* el valor elegido se pasa directo a onDone: el estado de React aún no se habría actualizado */}
          <div className="cg-onboard-choices">
            <Opcion on={gastosPeriodicos === true}
              onClick={() => { setGastosPeriodicos(true); onDone(email.trim(), { formaPago, bancoId: formaPago === "banco" ? bancoId : null }, heroModo, true, diferenciarPago); }}>
              Sí, ayudadme
            </Opcion>
            <Opcion on={gastosPeriodicos === false}
              onClick={() => { setGastosPeriodicos(false); onDone(email.trim(), { formaPago, bancoId: formaPago === "banco" ? bancoId : null }, heroModo, false, diferenciarPago); }}>
              No, gracias
            </Opcion>
          </div>

          <Saltar onClick={() => onDone(email.trim(), null, heroModo, gastosPeriodicos, diferenciarPago)}
            resto="Puedes decidirlo luego en Ajustes → Dinero." />
        </div>
      )}
    </div>
  );
}
