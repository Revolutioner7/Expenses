import React, { useState } from "react";
import { APP_NAME } from "../constants.js";
import { BancoPicker } from "./ui.jsx";
import { esNativo } from "../lib/nativo.js";
import { FormCuenta } from "./cuenta.jsx";

export function isAppInstalled() {
  if (esNativo()) return true; // la app de la tienda ya está instalada: nada de "añadir a pantalla de inicio"
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

/* "Ahora no": pasa de pregunta sin contestar. Todo se puede cambiar luego en Ajustes */
function Saltar({ onClick }) {
  return (
    <p className="cg-onboard-skip">
      <button className="cg-onboard-skiplink" onClick={onClick}>Ahora no</button>
    </p>
  );
}

/* pregunta a pantalla completa: cabecera arriba, pregunta y opciones centradas en el resto */
function Pregunta({ paso, onBack, titulo, sub, children }) {
  return (
    <div className="cg-onboard cg-onboard-q">
      <CabeceraPaso paso={paso} onBack={onBack} />
      <div className="cg-onboard-body">
        <h1 className="cg-onboard-qtitle">{titulo}</h1>
        {sub && <p className="cg-onboard-qsub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

export function Onboarding({ startStep, onDone, bancos, masUsadoBancoId, onAddBanco, cuentas, onEntrarCuenta, onRecuperarCuenta, social, socialPendiente, onRecuperada }) {
  const [step, setStep] = useState(socialPendiente && startStep === "consent" ? "cuenta" : startStep); // 'install' | 'consent' | 'cuenta' | 'vista' | 'difpago' | 'pago' | 'periodicos'
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
            <h1 className="cg-title" style={{ margin: 0 }}>Ponla en tu pantalla de inicio</h1>
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
                    <p className="cg-onboard-step">4. Ábrela desde el icono nuevo, no desde Safari</p>
                  </div>
                )}

                {(plataforma === "android" || plataforma === null) && (
                  <div className="cg-card">
                    <div className="cg-onboard-sub">Android</div>
                    <p className="cg-onboard-step">1. Abre este enlace en Chrome</p>
                    <p className="cg-onboard-step">2. Toca los tres puntos de arriba</p>
                    <p className="cg-onboard-step">3. Elige «Añadir a pantalla de inicio»</p>
                    <p className="cg-onboard-step">4. Ábrela desde el icono nuevo, no desde Chrome</p>
                  </div>
                )}
              </>
            );
          })()}

          <button className="cg-btn" onClick={() => setStep("consent")}>Hecho</button>
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button className="cg-ghost" onClick={() => setStep("consent")}>Prefiero seguir en el navegador</button>
          </div>
        </div>
      ) : step === "consent" ? (
        <div className="cg-onboard">
          <img src="./icon-192.png" alt="" className="cg-onboard-logo" />
          <p className="cg-onboard-title">{APP_NAME}</p>
          <p className="cg-onboard-tag">Para que el dinero no desaparezca sin dar explicaciones.</p>

          <label className="cg-lab" htmlFor="cg-onboard-email">Email</label>
          <input id="cg-onboard-email" className="cg-input" type="email" placeholder="tu@email.com"
            value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 4 }} />
          <p className="cg-hint" style={{ marginBottom: 16 }}>
            Opcional. De momento se queda en tu móvil. Si algún día lo usamos para avisarte de algo, te lo diremos antes.
          </p>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 20 }}>
            <input id="cg-onboard-accept" type="checkbox" checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)} style={{ marginTop: 3 }} />
            <label htmlFor="cg-onboard-accept" style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              He leído y acepto el <b>aviso antes de empezar</b>
            </label>
          </div>

          <button className="cg-btn" disabled={!accepted} onClick={() => setStep("vista")}>Empezar</button>
          {cuentas && (
            <p style={{ textAlign: "center", margin: "14px 0 0" }}>
              <button className="cg-link" disabled={!accepted} onClick={() => setStep("cuenta")}>Ya tengo cuenta</button>
            </p>
          )}

          <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--muted)", marginTop: 14 }}>
            🔒 Los detalles de tus gastos nunca salen de este dispositivo
          </p>
        </div>
      ) : step === "cuenta" ? (
        /* quien ya tiene cuenta entra y se salta las preguntas: sus respuestas vienen con sus datos */
        <div className="cg-onboard">
          <FormCuenta modoInicial="entrar" textoCancelar="Volver"
            onEntrar={async (e, p) => { await onEntrarCuenta(e, p); onDone(e, null, null, null, null); }}
            onRecuperar={async (e, c, p) => { await onRecuperarCuenta(e, c, p); onDone(e, null, null, null, null); }}
            social={social && {
              ...social,
              entrar: async (t, sec, c) => { await social.entrar(t, sec, c); onDone(c.email, null, null, null, null); },
            }}
            socialPendiente={socialPendiente}
            onRecuperada={onRecuperada && ((sesion) => { onRecuperada(sesion); onDone(sesion.email, null, null, null, null); })}
            // cuenta nueva con Apple/Google desde aquí: después del código de recuperación, las preguntas de siempre
            onCancelar={(motivo) => setStep(motivo === "listo" ? "vista" : "consent")} />
        </div>
      ) : step === "vista" ? (
        <Pregunta paso={3} onBack={() => setStep("consent")}
          titulo="¿Qué quieres ver primero al abrir la app?"
          sub="Lo que llevas gastado o lo que te queda. Sale en grande, arriba del todo.">
          <div className="cg-onboard-choices stack">
            <Opcion on={heroModo === "gastado"} onClick={() => { setHeroModo("gastado"); setStep("difpago"); }}>Lo gastado</Opcion>
            <Opcion on={heroModo === "disponible"} onClick={() => { setHeroModo("disponible"); setStep("difpago"); }}>Lo que me queda</Opcion>
          </div>
          <Saltar onClick={() => setStep("difpago")} />
        </Pregunta>
      ) : step === "difpago" ? (
        <Pregunta paso={4} onBack={() => setStep("vista")}
          titulo="¿Quieres saber con qué pagas?"
          sub="Tarjeta, Bizum, efectivo… Así ves qué cuenta se vacía antes.">
          <div className="cg-onboard-choices stack">
            <Opcion on={diferenciarPago === true} onClick={() => { setDiferenciarPago(true); setStep("pago"); }}>Sí</Opcion>
            <Opcion on={diferenciarPago === false} onClick={() => { setDiferenciarPago(false); setStep("periodicos"); }}>No</Opcion>
          </div>
          {/* sin contestar no tiene sentido preguntar cómo paga: se pasa directo a la siguiente */}
          <Saltar onClick={() => setStep("periodicos")} />
        </Pregunta>
      ) : step === "pago" ? (
        <Pregunta paso={5} onBack={() => setStep("difpago")}
          titulo="¿Cómo pagas casi siempre?"
          sub="Lo dejamos marcado al anotar un gasto. Un toque menos cada vez.">
          {/* efectivo y Bizum contestan y avanzan; tarjeta necesita elegir banco, así que es la única con "Continuar" */}
          <div className="cg-onboard-choices stack">
            <Opcion on={formaPago === "efectivo"}
              onClick={() => { setFormaPago("efectivo"); setBancoId(null); setMostrarPicker(false); setStep("periodicos"); }}>
              En efectivo
            </Opcion>
            <Opcion on={formaPago === "bizum"}
              onClick={() => { setFormaPago("bizum"); setBancoId(null); setMostrarPicker(false); setStep("periodicos"); }}>
              Con Bizum o transferencia
            </Opcion>
            <Opcion on={formaPago === "banco"} onClick={() => setFormaPago("banco")}>
              Con tarjeta
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 14px", borderRadius: 12, background: "#E6F1FB", marginTop: 12 }}>
                  <span style={{ fontSize: 16 }}>{bancoElegido ? bancoElegido.name : "¿De qué banco?"}</span>
                  <button className="cg-vermas" onClick={() => setMostrarPicker(true)}>{bancoElegido ? "cambiar" : "elegir"}</button>
                </div>
              )}
              <button className="cg-btn" style={{ marginTop: 16 }} onClick={() => setStep("periodicos")}>
                Continuar
              </button>
            </>
          )}

          <Saltar onClick={() => setStep("periodicos")} />
        </Pregunta>
      ) : (
        /* atrás vuelve a la última pregunta que de verdad se vio: si se contestó "No" (o "Ahora no")
           a saber con qué paga, el paso 5 se saltó entero, así que se vuelve al 4 */
        <Pregunta paso={6} onBack={() => setStep(diferenciarPago === true ? "pago" : "difpago")}
          titulo="¿Tienes pagos que no llegan cada mes?"
          sub="El seguro del coche, la comunidad, esa suscripción anual que siempre olvidas… Te ayudamos a apartar un poco cada mes para que no duela de golpe.">
          {/* el valor elegido se pasa directo a onDone: el estado de React aún no se habría actualizado */}
          <div className="cg-onboard-choices stack">
            <Opcion on={gastosPeriodicos === true}
              onClick={() => { setGastosPeriodicos(true); onDone(email.trim(), { formaPago, bancoId: formaPago === "banco" ? bancoId : null }, heroModo, true, diferenciarPago); }}>
              Sí, échame una mano
            </Opcion>
            <Opcion on={gastosPeriodicos === false}
              onClick={() => { setGastosPeriodicos(false); onDone(email.trim(), { formaPago, bancoId: formaPago === "banco" ? bancoId : null }, heroModo, false, diferenciarPago); }}>
              No, gracias
            </Opcion>
          </div>
          <Saltar onClick={() => onDone(email.trim(), null, heroModo, gastosPeriodicos, diferenciarPago)} />
        </Pregunta>
      )}
    </div>
  );
}
