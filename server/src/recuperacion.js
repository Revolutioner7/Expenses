/* ── "Lo he perdido todo" en el servidor ──
   Pasos de una petición:
     pendiente  → la persona pide recuperar; le llega un email para confirmar que es ella.
     esperando  → confirmado; empieza la espera de 72 horas. Le llega otro email con un enlace
                  "no he sido yo" para cancelar en cualquier momento.
     aprobada   → pasadas las 72 horas, Rodrigo la aprueba desde su panel: vuelve a cifrar la pieza A
                  para el dispositivo que la pidió (el servidor nunca ve A abierta).
     completada → el dispositivo junta A y la pieza S, abre la llave de datos, elige contraseña
                  nueva y recibe un código de recuperación nuevo. Se cierran las demás sesiones.
   Cancelada o caducada: no pasa nada más. */

const HORA = 3600000;
export const ESPERA_MS = 72 * HORA;
const CONFIRMAR_MS = 24 * HORA;        // tiempo para pulsar el enlace del primer email
const APROBADA_MS = 7 * 24 * HORA;     // tiempo para terminar una vez lista o aprobada
const ADMIN_MARGEN_MS = 5 * 60000;     // la firma del panel vale 5 minutos

const te = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const aleatorio = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (t) => b64url(await crypto.subtle.digest("SHA-256", te.encode(t)));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function crearRutas({ Fallo, leerJson, usuarioDeSesion, normalizarEmail, hmac, igual, crearSesion, validarEnvuelta, validarIter, esB64, ahora }) {
  /* ── validaciones ── */
  const esPunto = (p) => p && typeof p === "object" && /^[A-Za-z0-9_-]{40,50}$/.test(p.x || "") && /^[A-Za-z0-9_-]{40,50}$/.test(p.y || "");
  const esSello = (s) => s && typeof s === "object" && esPunto(s.e) && esB64(s.iv, 12, 32) && esB64(s.ct, 40, 200);
  function validarEscrow(e) {
    if (!e || typeof e !== "object" || !esSello(e.a) || !esB64(e.s, 40, 50)) throw new Fallo(400, "escrow");
    return { a: e.a, s: e.s };
  }
  const validarPublica = (p) => {
    if (!esPunto(p)) throw new Fallo(400, "llave");
    return { kty: "EC", crv: "P-256", x: p.x, y: p.y };
  };

  /* ── emails (Resend) ── */
  // solo en las pruebas locales (EMAIL_PRUEBA en .dev.vars o --var): los emails se guardan en memoria
  const buzonPrueba = [];
  async function enviarEmail(env, para, asunto, parrafos) {
    if (env.EMAIL_PRUEBA) { buzonPrueba.push({ para, asunto, parrafos }); return; }
    if (!env.RESEND_API_KEY) throw new Fallo(503, "email-no-disponible");
    const html = `<div style="font-family:-apple-system,system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1c2421;max-width:520px">
      ${parrafos.map((p) => (p.enlace ? `<p><a href="${esc(p.enlace)}" style="display:inline-block;background:#1c2421;color:#fff;padding:10px 16px;border-radius:9px;text-decoration:none">${esc(p.texto)}</a></p>` : `<p>${esc(p)}</p>`)).join("")}
      <p style="color:#6b756f;font-size:13px">Dineriko · Este email es automático.</p></div>`;
    const texto = parrafos.map((p) => (p.enlace ? `${p.texto}: ${p.enlace}` : p)).join("\n\n");
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM || "Dineriko <hola@dineriko.com>", to: [para], subject: asunto, html, text: texto }),
    });
    if (!r.ok) { console.error("resend", r.status, await r.text().catch(() => "")); throw new Fallo(503, "email-no-disponible"); }
  }
  const fecha = (ms) => new Date(ms).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

  /* ── páginas que se abren desde los emails ── */
  const pagina = (titulo, texto, status = 200) => new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Dineriko</title></head>
<body style="font-family:-apple-system,system-ui,sans-serif;max-width:480px;margin:12vh auto;padding:0 24px;color:#1c2421;line-height:1.5">
<h1 style="font-size:22px">${esc(titulo)}</h1><p>${esc(texto)}</p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } });

  /* las que llevan mucho tiempo paradas dejan de valer */
  async function caducar(env) {
    const t = ahora();
    await env.DB.batch([
      env.DB.prepare("UPDATE recoveries SET estado = 'caducada' WHERE estado = 'pendiente' AND created_at < ?").bind(t - CONFIRMAR_MS),
      env.DB.prepare("UPDATE recoveries SET estado = 'caducada' WHERE estado IN ('esperando', 'aprobada') AND ready_at < ?").bind(t - APROBADA_MS),
    ]);
  }

  /* ── el usuario, con sesión ── */
  async function info(req, env) {
    const { userId } = await usuarioDeSesion(req, env);
    const u = await env.DB.prepare("SELECT escrow IS NOT NULL AS rec, recuperada_en FROM users WHERE id = ?").bind(userId).first();
    return { recuperacion: !!u?.rec, recuperadaEn: u?.recuperada_en || null };
  }

  /* activar (con escrow y wrappedEsc) o desactivar (escrow: null) la recuperación; pide la contraseña */
  async function cambiarEscrow(req, env) {
    const { userId } = await usuarioDeSesion(req, env);
    const b = await leerJson(req);
    const u = await env.DB.prepare("SELECT auth_hash, wrapped FROM users WHERE id = ?").bind(userId).first();
    if (!u || !esB64(b.authKey, 40, 64) || !igual(await hmac(env.PEPPER, b.authKey), u.auth_hash)) throw new Fallo(401, "credenciales");
    const wrapped = JSON.parse(u.wrapped);
    if (b.escrow === null) {
      delete wrapped.esc;
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET escrow = NULL, wrapped = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(wrapped), ahora(), userId),
        env.DB.prepare("UPDATE recoveries SET estado = 'cancelada' WHERE user_id = ? AND estado IN ('pendiente', 'esperando', 'aprobada')").bind(userId),
      ]);
      return { recuperacion: false };
    }
    const escrow = validarEscrow(b.escrow);
    wrapped.esc = validarEnvuelta({ esc: b.wrappedEsc }).esc;
    await env.DB.prepare("UPDATE users SET escrow = ?, wrapped = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(escrow), JSON.stringify(wrapped), ahora(), userId).run();
    return { recuperacion: true };
  }

  /* ── pedir la recuperación (sin sesión). Siempre responde lo mismo, exista o no la cuenta ── */
  async function empezar(req, env, url) {
    const b = await leerJson(req);
    if (!env.RESEND_API_KEY && !env.EMAIL_PRUEBA) throw new Fallo(503, "email-no-disponible");
    const email = normalizarEmail(b.email);
    const devicePub = validarPublica(b.devicePub);
    await caducar(env);
    const id = aleatorio(16), token = aleatorio(32);
    const u = await env.DB.prepare("SELECT id, escrow FROM users WHERE email = ?").bind(email).first();
    if (!u) return { id, token }; // nadie sabrá si ese email tiene cuenta
    if (!u.escrow) {
      await enviarEmail(env, email, "Sobre tu cuenta de Dineriko", [
        "Alguien (seguramente tú) ha pedido recuperar tu cuenta de Dineriko con el botón «Lo he perdido todo».",
        "Tu cuenta tiene la recuperación desactivada, así que nadie puede abrir tus datos sin tu contraseña o tu código de recuperación. Ni siquiera nosotros. Si los has perdido los dos, puedes borrar la cuenta y empezar de cero.",
        "Si no has sido tú, no tienes que hacer nada.",
      ]);
      return { id, token };
    }
    const activa = await env.DB.prepare("SELECT COUNT(*) AS n FROM recoveries WHERE user_id = ? AND estado IN ('pendiente', 'esperando', 'aprobada')").bind(u.id).first();
    if (activa.n > 0) throw new Fallo(409, "recuperacion-en-curso");
    const confirmar = aleatorio(32), cancelar = aleatorio(32);
    await env.DB.prepare(`INSERT INTO recoveries (id, user_id, poll_hash, confirm_hash, cancel_hash, device_pub, estado, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?)`)
      .bind(id, u.id, await sha256(token), await sha256(confirmar), await sha256(cancelar), JSON.stringify(devicePub), ahora()).run();
    try {
      await enviarEmail(env, email, "Confirma que quieres recuperar tu cuenta", [
        "Has pedido recuperar tu cuenta de Dineriko porque has perdido la contraseña y el código de recuperación.",
        "Para seguir, confirma que eres tú. Después empieza una espera de 72 horas por seguridad: si alguien que no eres tú lo ha pedido, tendrás tiempo de cancelarlo.",
        { texto: "Sí, soy yo", enlace: `${url.origin}/recovery/confirm?t=${confirmar}&c=${cancelar}` },
        "Si no has sido tú, no pulses nada: la petición caduca sola en 24 horas.",
      ]);
    } catch (e) {
      await env.DB.prepare("DELETE FROM recoveries WHERE id = ?").bind(id).run();
      throw e;
    }
    return { id, token };
  }

  async function confirmar(req, env, url) {
    const t = url.searchParams.get("t") || "", c = url.searchParams.get("c") || "";
    await caducar(env);
    const r = await env.DB.prepare("SELECT r.id, r.estado, r.cancel_hash, u.email FROM recoveries r JOIN users u ON u.id = r.user_id WHERE r.confirm_hash = ?")
      .bind(await sha256(t)).first();
    if (!r) return pagina("Enlace no válido", "Este enlace no es válido o ha caducado. Si sigues necesitando recuperar tu cuenta, vuelve a pedirlo desde la app.", 404);
    if (r.estado !== "pendiente") return pagina("Ya estaba confirmado", "Esta petición ya estaba confirmada, cancelada o caducada. No hace falta hacer nada más aquí.");
    if (!igual(await sha256(c), r.cancel_hash)) return pagina("Enlace no válido", "El enlace está incompleto. Ábrelo tal cual desde el email.", 400);
    // al abrir el enlace solo se enseña un botón: algunos programas de correo abren los enlaces solos
    // para revisarlos, y eso no debe confirmar nada
    if (req.method !== "POST") {
      return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Dineriko</title></head>
<body style="font-family:-apple-system,system-ui,sans-serif;max-width:480px;margin:12vh auto;padding:0 24px;color:#1c2421;line-height:1.5">
<h1 style="font-size:22px">¿Confirmas que eres tú?</h1>
<p>Al confirmar empieza una espera de 72 horas. Te enviaremos otro email con un enlace para cancelarlo si cambias de idea.</p>
<form method="post"><button style="font-size:16px;padding:12px 18px;border-radius:10px;border:0;background:#1c2421;color:#fff">Sí, soy yo</button></form>
</body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" } });
    }
    // en las pruebas locales la espera se puede acortar; en el servidor real siempre son 72 horas
    const espera = env.EMAIL_PRUEBA && env.ESPERA_PRUEBA_MS ? Number(env.ESPERA_PRUEBA_MS) : ESPERA_MS;
    const listo = ahora() + espera;
    await env.DB.prepare("UPDATE recoveries SET estado = 'esperando', confirmed_at = ?, ready_at = ? WHERE id = ?").bind(ahora(), listo, r.id).run();
    await enviarEmail(env, r.email, "Alguien ha pedido recuperar tu cuenta de Dineriko", [
      `Se ha confirmado una petición para recuperar tu cuenta. Si no se cancela, se podrá completar a partir del ${fecha(listo)} (hora de España), después de revisarla a mano.`,
      "Si has sido tú, no tienes que hacer nada: abre Dineriko en ese dispositivo pasado ese momento.",
      "Si no has sido tú, cancélala ahora:",
      { texto: "No he sido yo, cancelar", enlace: `${url.origin}/recovery/cancel?t=${c}` },
    ]).catch(() => {});
    return pagina("Confirmado", `Empieza la espera de 72 horas. A partir del ${fecha(listo)} revisaremos la petición y podrás terminar desde la app, en el mismo dispositivo donde la pediste.`);
  }

  async function cancelarPeticion(req, env, url) {
    const t = url.searchParams.get("t") || "";
    const r = await env.DB.prepare("SELECT id, estado FROM recoveries WHERE cancel_hash = ?").bind(await sha256(t)).first();
    if (!r) return pagina("Enlace no válido", "Este enlace no es válido.", 404);
    if (["completada"].includes(r.estado)) return pagina("Ya estaba completada", `La recuperación ya se completó. Si no has sido tú, escríbenos cuanto antes.`);
    await env.DB.prepare("UPDATE recoveries SET estado = 'cancelada', done_at = ? WHERE id = ?").bind(ahora(), r.id).run();
    return pagina("Cancelada", "La petición de recuperación se ha cancelado. Tu cuenta y tus datos siguen como estaban.");
  }

  /* el dispositivo que la pidió pregunta cómo va; cuando está aprobada recibe lo necesario para terminar */
  async function estado(req, env) {
    const b = await leerJson(req);
    if (!esB64(b.id, 16, 40) || !esB64(b.token, 30, 60)) throw new Fallo(400, "datos");
    await caducar(env);
    const r = await env.DB.prepare(`SELECT r.estado, r.poll_hash, r.ready_at, r.sello, u.escrow, u.wrapped, u.email
      FROM recoveries r JOIN users u ON u.id = r.user_id WHERE r.id = ?`).bind(b.id).first();
    // las peticiones de emails sin cuenta no existen: se responden como pendientes, igual que las reales
    if (!r) return { estado: "pendiente" };
    if (!igual(await sha256(b.token), r.poll_hash)) throw new Fallo(401, "credenciales");
    const base = { estado: r.estado, listaEn: r.ready_at || null };
    if (r.estado !== "aprobada") return base;
    return { ...base, email: r.email, sello: JSON.parse(r.sello), s: JSON.parse(r.escrow).s, wrappedEsc: JSON.parse(r.wrapped).esc };
  }

  /* terminar: contraseña nueva, código de recuperación nuevo y llave de repuesto nueva */
  async function completar(req, env) {
    const b = await leerJson(req);
    if (!esB64(b.id, 16, 40) || !esB64(b.token, 30, 60)) throw new Fallo(400, "datos");
    if (!esB64(b.salt, 16, 64) || !esB64(b.authKey, 40, 64) || !esB64(b.recAuth, 40, 64)) throw new Fallo(400, "datos");
    validarIter(b.iter);
    const w = validarEnvuelta(b.wrapped);
    if (!w.pass || !w.rec || !w.esc) throw new Fallo(400, "wrapped");
    const escrow = validarEscrow(b.escrow);
    const r = await env.DB.prepare("SELECT r.id, r.user_id, r.estado, r.poll_hash, u.email FROM recoveries r JOIN users u ON u.id = r.user_id WHERE r.id = ?").bind(b.id).first();
    if (!r || !igual(await sha256(b.token), r.poll_hash)) throw new Fallo(401, "credenciales");
    if (r.estado !== "aprobada") throw new Fallo(409, "no-aprobada");
    const t = ahora();
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET kdf_salt = ?, kdf_iter = ?, auth_hash = ?, rec_hash = ?, wrapped = ?, escrow = ?, recuperada_en = ?, updated_at = ? WHERE id = ?")
        .bind(b.salt, b.iter, await hmac(env.PEPPER, b.authKey), await hmac(env.PEPPER, b.recAuth), JSON.stringify(w), JSON.stringify(escrow), t, t, r.user_id),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(r.user_id),
      env.DB.prepare("UPDATE recoveries SET estado = 'completada', done_at = ?, sello = NULL WHERE id = ?").bind(t, r.id),
    ]);
    await enviarEmail(env, r.email, "Has recuperado el acceso a tu cuenta de Dineriko", [
      `El ${fecha(t)} se completó la recuperación de tu cuenta: hay una contraseña y un código de recuperación nuevos, y se han cerrado las sesiones de los demás dispositivos.`,
      "Si no has sido tú, escríbenos cuanto antes respondiendo a este email.",
    ]).catch(() => {});
    return { token: await crearSesion(env, r.user_id, req), email: r.email };
  }

  /* ── panel de Rodrigo: entra firmando con la llave maestra ── */
  async function comprobarAdmin(env, b, accion) {
    if (!env.RECUPERACION_PUBLICA) throw new Fallo(503, "sin-llave-maestra");
    const ts = Number(b.ts);
    if (!Number.isFinite(ts) || Math.abs(ahora() - ts) > ADMIN_MARGEN_MS || !esB64(b.sig, 60, 120)) throw new Fallo(401, "admin");
    const pub = JSON.parse(env.RECUPERACION_PUBLICA);
    const k = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: pub.x, y: pub.y }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k, unb64(b.sig), te.encode(`${accion}:${ts}`));
    if (!ok) throw new Fallo(401, "admin");
  }

  async function adminLista(req, env) {
    const b = await leerJson(req);
    await comprobarAdmin(env, b, "lista");
    await caducar(env);
    const { results } = await env.DB.prepare(`SELECT r.id, r.estado, r.created_at, r.confirmed_at, r.ready_at, r.approved_at, r.done_at, r.device_pub, u.email, u.escrow
      FROM recoveries r JOIN users u ON u.id = r.user_id WHERE r.created_at > ? ORDER BY r.created_at DESC LIMIT 50`).bind(ahora() - 30 * 24 * HORA).all();
    return {
      ahora: ahora(),
      peticiones: results.map((r) => ({
        id: r.id, estado: r.estado, email: r.email, creada: r.created_at, confirmada: r.confirmed_at, lista: r.ready_at, aprobada: r.approved_at, terminada: r.done_at,
        // solo se dan las piezas cuando ya se puede aprobar
        ...(r.estado === "esperando" && r.ready_at <= ahora() && r.escrow ? { devicePub: JSON.parse(r.device_pub), a: JSON.parse(r.escrow).a } : {}),
      })),
    };
  }

  async function adminAprobar(req, env) {
    const b = await leerJson(req);
    if (!esB64(b.id, 16, 40)) throw new Fallo(400, "datos");
    await comprobarAdmin(env, b, `aprobar-${b.id}`);
    if (!esSello(b.sello)) throw new Fallo(400, "sello");
    const r = await env.DB.prepare("SELECT estado, ready_at FROM recoveries WHERE id = ?").bind(b.id).first();
    if (!r || r.estado !== "esperando") throw new Fallo(409, "no-esperando");
    if (r.ready_at > ahora()) throw new Fallo(409, "aun-no"); // las 72 horas no se pueden saltar
    await env.DB.prepare("UPDATE recoveries SET estado = 'aprobada', sello = ?, approved_at = ? WHERE id = ?").bind(JSON.stringify(b.sello), ahora(), b.id).run();
    return {};
  }

  async function buzon(req, env) {
    if (!env.EMAIL_PRUEBA) throw new Fallo(404, "no-existe");
    return { emails: buzonPrueba.splice(0) };
  }

  return {
    post: {
      "/test/emails": buzon,
      "/account/info": info, "/account/escrow": cambiarEscrow,
      "/recovery/start": empezar, "/recovery/status": estado, "/recovery/complete": completar,
      "/admin/recoveries": adminLista, "/admin/approve": adminAprobar,
    },
    paginas: { "/recovery/confirm": confirmar, "/recovery/cancel": cancelarPeticion },
    validarEscrow,
  };
}
