import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

/* ────────────────────────────────────────────────────────────────
   Cosecha — control mensual de gastos e ingresos
   Sin servidor, sin API, sin coste. Los datos se guardan localmente.
   ──────────────────────────────────────────────────────────────── */

const STORE_KEY = "cuaderno-gastos-v1";

/* ── almacenamiento (con reserva en memoria si no está disponible) ── */
let memoryStore = {};
const hasLocal = (() => {
  try { window.localStorage.setItem("__t", "1"); window.localStorage.removeItem("__t"); return true; }
  catch (e) { return false; }
})();
const store = {
  async get(key) {
    if (window.storage) {
      try { const r = await window.storage.get(key, false); return r ? r.value : null; }
      catch (e) { return null; }
    }
    if (hasLocal) {
      try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }
    return memoryStore[key] ?? null;
  },
  async set(key, value) {
    if (window.storage) {
      try { await window.storage.set(key, value, false); return true; }
      catch (e) { memoryStore[key] = value; return false; }
    }
    if (hasLocal) {
      try { window.localStorage.setItem(key, value); return true; }
      catch (e) { memoryStore[key] = value; return false; }
    }
    memoryStore[key] = value;
    return true;
  },
};

/* en iPhone instalado, pedir que los datos no se puedan desalojar */
if (typeof navigator !== "undefined" && navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {});
}

/* ── cifrado local ─────────────────────────────────────────────────────────
   Sobre de dos llaves: los datos se cifran con una clave aleatoria (DEK) y la
   DEK se guarda envuelta dos veces, por la contraseña y por Face ID. Así los
   dos caminos abren lo mismo y ninguno guarda nada utilizable en el disco.

   { enc:2, kdf, iter, salt, wrapped:{ pass:{iv,ct}, prf:{iv,ct,credId} }, iv, ct }
   ─────────────────────────────────────────────────────────────────────────── */
const ITER = 600000;
const PRF_SALT_TXT = "cuaderno-gastos-prf-v1";
const te = new TextEncoder();
const td = new TextDecoder();
const cryptoOk = () => typeof crypto !== "undefined" && !!crypto.subtle;

const b64 = (buf) => {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/* clave a partir de la contraseña */
async function kekFromPass(pass, salt, iter = ITER) {
  const base = await crypto.subtle.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}
/* clave a partir de los 32 bytes que devuelve el passkey */
const kekFromBytes = (bytes) =>
  crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);

const newDEK = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

async function wrapDEK(dek, kek) {
  const raw = await crypto.subtle.exportKey("raw", dek);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, raw)) };
}
async function unwrapDEK(w, kek) {
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(w.iv) }, kek, unb64(w.ct));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}
async function sealData(obj, dek, meta) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dek, te.encode(JSON.stringify(obj)));
  return JSON.stringify({ enc: 2, kdf: "PBKDF2-SHA256", iter: meta.iter, salt: meta.salt, wrapped: meta.wrapped, iv: b64(iv), ct: b64(ct) });
}
async function openData(env, dek) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, dek, unb64(env.ct));
  return JSON.parse(td.decode(pt));
}
const esSobre = (o) => !!o && (o.enc === 1 || o.enc === 2) && typeof o.ct === "string";
const tieneBio = (o) => !!o?.wrapped?.prf;

/* ── Face ID / Touch ID vía passkey con extensión PRF ── */
async function bioDisponible() {
  try {
    if (!window.PublicKeyCredential || !navigator.credentials) return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (e) { return false; }
}

async function prfObtener(credId) {
  const a = await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ id: unb64(credId), type: "public-key" }],
    userVerification: "required",
    timeout: 60000,
    extensions: { prf: { eval: { first: te.encode(PRF_SALT_TXT) } } },
  }});
  const r = a.getClientExtensionResults?.()?.prf?.results?.first;
  if (!r) throw new Error("sin-prf");
  return new Uint8Array(r);
}

async function prfCrear() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: "Cosecha" },   // rp.id se toma del dominio actual (cambiar solo name es seguro, no invalida passkeys)
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "gastos", displayName: "Gastos" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" },
    timeout: 60000,
    extensions: { prf: { eval: { first: te.encode(PRF_SALT_TXT) } } },
  }});
  const ext = cred.getClientExtensionResults?.() || {};
  const credId = b64(cred.rawId);
  let bytes = ext.prf?.results?.first;
  if (bytes) return { credId, bytes: new Uint8Array(bytes) };
  // algunas plataformas solo confirman prf.enabled al crear: hace falta una segunda ceremonia
  if (!ext.prf?.enabled) throw new Error("sin-prf");
  return { credId, bytes: await prfObtener(credId) };
}

/* ── paleta de categorías ── */
const SWATCHES = [
  "#1E4E45", "#2C6B5E", "#6F9C6B", "#9DB05A",
  "#4A6B4E", "#3F7C8C", "#5B6B8C", "#6B7B8C",
  "#7A5C86", "#A8628A", "#D99A2B", "#C2703A",
  "#A63A2E", "#8A5A44", "#B08A5A", "#8A7A4E",
  "#2F7D6B",
];

/* reparto 50/30/20: cada categoría es necesidad, deseo o ahorro */
const BUCKETS = [
  { id: "necesidad", label: "Gasto", target: 50, color: "#1E4E45" },
  { id: "deseo", label: "Deseo", target: 30, color: "#D99A2B" },
  { id: "ahorro", label: "Ahorro", target: 20, color: "#6F9C6B" },
];

/* iconos sugeridos según el nombre que escribas */
const EMOJI_HINTS = [
  { words: ["coche", "auto", "automovil", "vehiculo", "carro", "taller", "mecanico", "itv", "ruedas", "neumaticos"], emojis: ["🚗", "🚙", "🔧", "🛞", "🅿️"] },
  { words: ["gasolina", "gasolinera", "combustible", "diesel", "gasoil", "repsol", "cepsa"], emojis: ["⛽", "🚗"] },
  { words: ["moto", "motocicleta", "scooter"], emojis: ["🏍️", "🛴"] },
  { words: ["bici", "bicicleta", "ciclismo", "bicing"], emojis: ["🚲", "🚴"] },
  { words: ["transporte", "bus", "autobus", "metro", "tren", "renfe", "cercanias", "billete", "abono"], emojis: ["🚌", "🚇", "🚆", "🎫"] },
  { words: ["taxi", "uber", "cabify"], emojis: ["🚕", "🚖"] },
  { words: ["parking", "aparcamiento", "peaje", "garaje"], emojis: ["🅿️", "🚧"] },
  { words: ["casa", "piso", "hogar", "vivienda", "alquiler", "hipoteca", "comunidad", "reforma"], emojis: ["🏠", "🏡", "🔑", "🏢"] },
  { words: ["muebles", "mueble", "ikea", "decoracion", "sofa", "colchon"], emojis: ["🛋️", "🪑", "🛏️"] },
  { words: ["ferreteria", "bricolaje", "arreglo", "fontanero", "electricista", "obra"], emojis: ["🔨", "🪛", "🧰"] },
  { words: ["limpieza", "basura", "colada", "lavanderia"], emojis: ["🧹", "🧼", "🧽"] },
  { words: ["luz", "electricidad", "endesa", "iberdrola"], emojis: ["💡", "⚡"] },
  { words: ["agua", "aigues"], emojis: ["💧", "🚰"] },
  { words: ["gas", "calefaccion", "butano"], emojis: ["🔥", "🌡️"] },
  { words: ["factura", "facturas", "recibo", "recibos"], emojis: ["🧾", "📄"] },
  { words: ["internet", "fibra", "wifi", "movil", "telefono", "movistar", "vodafone", "orange"], emojis: ["📶", "📱", "🛜"] },
  { words: ["super", "supermercado", "compra", "mercadona", "lidl", "carrefour", "mercado", "despensa"], emojis: ["🛒", "🧺", "🥕"] },
  { words: ["fruta", "verdura", "fruteria", "verduleria"], emojis: ["🍎", "🥦", "🍌"] },
  { words: ["panaderia", "pan", "bolleria"], emojis: ["🥖", "🥐"] },
  { words: ["carniceria", "carne", "pescaderia", "pescado"], emojis: ["🥩", "🐟"] },
  { words: ["restaurante", "restaurantes", "comer", "comida", "cena", "cenas", "almuerzo", "menu", "tapas"], emojis: ["🍽️", "🍴", "🥘"] },
  { words: ["bar", "bares", "cerveza", "cervezas", "copas", "vermut", "vino", "vinos"], emojis: ["🍺", "🍷", "🍸"] },
  { words: ["cafe", "cafeteria", "desayuno", "brunch"], emojis: ["☕", "🥐", "🫖"] },
  { words: ["pizza", "pizzeria", "italiano"], emojis: ["🍕", "🍝"] },
  { words: ["hamburguesa", "burger", "kebab", "mcdonalds"], emojis: ["🍔", "🌯", "🍟"] },
  { words: ["sushi", "japones", "asiatico", "ramen"], emojis: ["🍣", "🍜", "🥢"] },
  { words: ["helado", "postre", "dulces", "chocolate"], emojis: ["🍦", "🍰", "🍫"] },
  { words: ["delivery", "glovo", "ubereats", "domicilio"], emojis: ["🛵", "🥡"] },
  { words: ["salud", "medico", "clinica", "hospital", "analitica"], emojis: ["🩺", "🏥", "❤️"] },
  { words: ["farmacia", "medicamento", "medicinas", "pastillas"], emojis: ["💊", "🩹"] },
  { words: ["dentista", "dental", "muelas"], emojis: ["🦷", "😬"] },
  { words: ["optica", "gafas", "lentillas", "vista"], emojis: ["👓", "🕶️", "👁️"] },
  { words: ["gimnasio", "gym", "pesas", "deporte", "entreno"], emojis: ["🏋️", "💪", "🏃"] },
  { words: ["yoga", "pilates", "meditacion"], emojis: ["🧘", "🕉️"] },
  { words: ["psicologo", "terapia", "psicologa", "mental"], emojis: ["🧠", "💬"] },
  { words: ["fisio", "fisioterapia", "masaje", "osteopata"], emojis: ["💆", "🦴"] },
  { words: ["futbol", "partido", "equipo"], emojis: ["⚽", "🥅"] },
  { words: ["padel", "tenis", "raqueta"], emojis: ["🎾", "🏓"] },
  { words: ["natacion", "piscina", "playa", "surf"], emojis: ["🏊", "🏖️", "🏄"] },
  { words: ["montana", "senderismo", "excursion", "esqui", "escalada"], emojis: ["⛰️", "🥾", "🎿"] },
  { words: ["cine", "peliculas", "pelicula"], emojis: ["🎬", "🍿"] },
  { words: ["musica", "concierto", "conciertos", "festival", "spotify"], emojis: ["🎵", "🎸", "🎤"] },
  { words: ["teatro", "espectaculo", "danza"], emojis: ["🎭", "🎟️"] },
  { words: ["museo", "exposicion", "arte", "cultura"], emojis: ["🏛️", "🖼️"] },
  { words: ["libro", "libros", "libreria", "lectura", "comic"], emojis: ["📚", "📖"] },
  { words: ["juego", "juegos", "videojuego", "videojuegos", "consola", "steam", "playstation"], emojis: ["🎮", "🕹️", "🎲"] },
  { words: ["ocio", "planes", "salir", "fiesta", "discoteca"], emojis: ["🎉", "🥳", "🍾"] },
  { words: ["viaje", "viajes", "vacaciones", "escapada", "turismo"], emojis: ["✈️", "🧳", "🗺️"] },
  { words: ["hotel", "alojamiento", "airbnb", "hostal", "camping"], emojis: ["🏨", "🛏️", "⛺"] },
  { words: ["ropa", "camiseta", "pantalones", "vestido", "zara", "moda"], emojis: ["👕", "👖", "👗"] },
  { words: ["zapatos", "zapatillas", "calzado", "botas"], emojis: ["👟", "👞", "🥾"] },
  { words: ["bolso", "complementos", "joyas", "reloj"], emojis: ["👜", "💍", "⌚"] },
  { words: ["peluqueria", "barberia", "pelo", "corte"], emojis: ["💈", "✂️", "💇"] },
  { words: ["belleza", "cosmetica", "maquillaje", "perfume", "crema", "unas", "manicura"], emojis: ["💄", "💅", "🧴"] },
  { words: ["mascota", "perro", "perros", "gato", "gatos", "veterinario", "pienso"], emojis: ["🐾", "🐶", "🐱"] },
  { words: ["bebe", "hijo", "hijos", "nino", "ninos", "guarderia", "panales"], emojis: ["👶", "🧒", "🍼"] },
  { words: ["colegio", "escuela", "cole", "material", "mochila"], emojis: ["🎒", "✏️", "🏫"] },
  { words: ["curso", "cursos", "formacion", "master", "universidad", "estudios", "academia", "idiomas"], emojis: ["🎓", "📚", "🗣️"] },
  { words: ["trabajo", "oficina", "despacho", "autonomo", "freelance"], emojis: ["💼", "💻", "🖇️"] },
  { words: ["tecnologia", "ordenador", "informatica", "portatil", "auriculares"], emojis: ["💻", "🖥️", "🎧"] },
  { words: ["suscripcion", "suscripciones", "netflix", "streaming", "cuota", "membresia"], emojis: ["🔁", "📺", "☁️"] },
  { words: ["banco", "comision", "comisiones", "tarjeta", "prestamo"], emojis: ["🏦", "💳", "🧾"] },
  { words: ["impuesto", "impuestos", "hacienda", "irpf", "iva", "gestoria", "notario"], emojis: ["🧾", "⚖️", "📊"] },
  { words: ["seguro", "seguros", "mapfre"], emojis: ["🛡️", "📄"] },
  { words: ["multa", "sancion"], emojis: ["🚨", "👮"] },
  { words: ["ahorro", "ahorrar", "hucha", "fondo", "colchon"], emojis: ["🐷", "💰", "🏦"] },
  { words: ["inversion", "bolsa", "indexado", "acciones", "cripto"], emojis: ["📈", "💹", "🪙"] },
  { words: ["nomina", "sueldo", "salario", "ingreso", "ingresos", "cobro"], emojis: ["💶", "💵", "🤑"] },
  { words: ["regalo", "regalos", "cumpleanos", "aniversario", "detalle"], emojis: ["🎁", "🎂", "💐"] },
  { words: ["boda", "bodas", "comunion", "bautizo"], emojis: ["💍", "👰", "🥂"] },
  { words: ["navidad", "reyes", "fiestas"], emojis: ["🎄", "🎅", "🎁"] },
  { words: ["donativo", "ong", "solidaridad", "caridad"], emojis: ["❤️", "🤝", "🕊️"] },
  { words: ["correos", "envio", "paquete", "amazon", "compras"], emojis: ["📦", "✉️", "🛍️"] },
  { words: ["papeleria", "imprenta", "copisteria", "oficina"], emojis: ["📎", "🖨️", "✏️"] },
  { words: ["tabaco", "cigarros", "vapeo"], emojis: ["🚬", "💨"] },
  { words: ["jardin", "plantas", "terraza", "huerto"], emojis: ["🪴", "🌱", "🌻"] },
  { words: ["foto", "fotografia", "camara"], emojis: ["📷", "🖼️"] },
  { words: ["varios", "otros", "otro", "misc"], emojis: ["📦", "🏷️", "❓"] },
];

/* paleta para cuando ninguna sugerencia encaja */
const EMOJI_ALL = [
  "🏷️", "📦", "💶", "🧾", "⭐", "📌", "❓", "🔖",
  "🛒", "🍽️", "🍺", "☕", "🍕", "🍔", "🍦", "🥐",
  "🏠", "🔑", "🛋️", "🔨", "🧹", "💡", "💧", "🔥",
  "📶", "📱", "💻", "🎧", "🖨️", "☁️", "🔁", "📺",
  "🚗", "⛽", "🚌", "🚇", "🚆", "🚕", "🚲", "🏍️",
  "✈️", "🧳", "🏨", "🗺️", "⛺", "🏖️", "⛰️", "🎿",
  "💊", "🩺", "🦷", "👓", "🧠", "🏋️", "🧘", "🏃",
  "⚽", "🎾", "🏊", "🎮", "🎬", "🎵", "🎭", "📚",
  "👕", "👟", "👜", "💈", "💄", "💅", "⌚", "💍",
  "🐾", "🐶", "🐱", "👶", "🎒", "🎓", "💼", "✏️",
  "🏦", "💳", "🛡️", "📈", "🐷", "💰", "🚨", "⚖️",
  "🎁", "🎂", "💐", "🎉", "🎄", "❤️", "🤝", "🪴",
];

function suggestEmojis(name) {
  const toks = norm(name).split(" ").filter((t) => t.length >= 3);
  const out = [];
  for (const t of toks) {
    for (const h of EMOJI_HINTS) {
      const hit = h.words.some((w) =>
        w === t || (w.startsWith(t) && t.length >= 4) || (t.startsWith(w) && w.length >= 4));
      if (hit) for (const e of h.emojis) if (!out.includes(e)) out.push(e);
    }
  }
  return out.slice(0, 8);
}

const DEFAULT_CATEGORIES = [
  { id: "super", name: "Supermercado", emoji: "🛒", color: "#2C6B5E", budget: null, bucket: "necesidad" },
  { id: "comerfuera", name: "Comer fuera", emoji: "🍽️", color: "#C2703A", budget: null, bucket: "deseo" },
  { id: "vivienda", name: "Vivienda", emoji: "🏠", color: "#1E4E45", budget: null, bucket: "necesidad" },
  { id: "facturas", name: "Facturas", emoji: "💡", color: "#D99A2B", budget: null, bucket: "necesidad" },
  { id: "transporte", name: "Transporte", emoji: "🚌", color: "#3F7C8C", budget: null, bucket: "necesidad" },
  { id: "ocio", name: "Ocio", emoji: "🎬", color: "#7A5C86", budget: null, bucket: "deseo" },
  { id: "viajes", name: "Viajes", emoji: "✈️", color: "#A8628A", budget: null, bucket: "deseo" },
  { id: "salud", name: "Salud", emoji: "💊", color: "#6F9C6B", budget: null, bucket: "necesidad" },
  { id: "personal", name: "Ropa y cuidado", emoji: "👕", color: "#5B6B8C", budget: null, bucket: "deseo" },
  { id: "subs", name: "Suscripciones", emoji: "🔁", color: "#A63A2E", budget: null, bucket: "deseo" },
  { id: "banco", name: "Banco e impuestos", emoji: "🏦", color: "#6B7B8C", budget: null, bucket: "necesidad" },
  { id: "mascota", name: "Mascota", emoji: "🐾", color: "#8A5A44", budget: null, bucket: "necesidad" },
  { id: "hijos", name: "Hijos", emoji: "👶", color: "#9DB05A", budget: null, bucket: "necesidad" },
  { id: "formacion", name: "Formación", emoji: "📚", color: "#4A6B4E", budget: null, bucket: "necesidad" },
  { id: "regalos", name: "Regalos", emoji: "🎁", color: "#B08A5A", budget: null, bucket: "deseo" },
  { id: "otros", name: "Otros", emoji: "📦", color: "#8A7A4E", budget: null, bucket: "deseo" },
  { id: "ahorro", name: "Ahorro", emoji: "🐷", color: "#2F7D6B", budget: null, bucket: "ahorro" },
];

/* categorías antiguas → nuevas, para no perder datos ya anotados */
const ID_MIGRATION = { resto: "comerfuera", suministros: "facturas" };

/* ── diccionario de detección (palabra → categoría) ── */
const DICT = {
  super: ["mercadona", "lidl", "aldi", "carrefour", "dia", "consum", "bonpreu", "caprabo", "alcampo", "eroski", "condis", "supermercado", "super", "compra", "fruteria", "verduleria", "panaderia", "carniceria", "pescaderia", "mercado", "bodega", "huevos", "leche", "pan", "congelados", "despensa"],
  comerfuera: ["restaurante", "restaurantes", "bar", "cafe", "cafeteria", "cerveza", "cervezas", "cena", "cenar", "comida", "comer", "almuerzo", "menu", "tapas", "pizza", "pizzeria", "sushi", "hamburguesa", "burger", "mcdonalds", "kebab", "brunch", "desayuno", "glovo", "ubereats", "justeat", "deliveroo", "telepizza", "starbucks", "vermut", "copas", "helado", "postre", "terraza", "bocata", "churros", "vinos", "cocktail", "taberna", "bistro", "asador"],
  vivienda: ["alquiler", "hipoteca", "comunidad", "casa", "piso", "ikea", "muebles", "mueble", "ferreteria", "leroy", "bricolaje", "bricomart", "limpieza", "hogar", "colchon", "sabanas", "toallas", "menaje", "reforma", "fontanero", "electricista", "cerrajero", "pintura", "lavadora", "nevera", "horno", "aspiradora", "cortinas", "vajilla", "bombillas"],
  facturas: ["luz", "electricidad", "endesa", "iberdrola", "naturgy", "holaluz", "agua", "aigues", "gas", "internet", "fibra", "movil", "telefono", "movistar", "vodafone", "orange", "yoigo", "digi", "pepephone", "simyo", "lowi", "factura", "basura", "recibo", "butano", "calefaccion"],
  transporte: ["gasolina", "gasolinera", "repsol", "cepsa", "shell", "diesel", "gasoil", "parking", "aparcamiento", "peaje", "metro", "bus", "autobus", "tmb", "taxi", "uber", "cabify", "bolt", "bicing", "renfe", "rodalies", "cercanias", "tren", "itv", "taller", "coche", "moto", "bici", "patinete", "billete", "abono", "mecanico", "ruedas", "neumaticos", "grua", "lavadero"],
  ocio: ["cine", "teatro", "concierto", "museo", "libro", "libros", "libreria", "comic", "juego", "videojuego", "steam", "playstation", "nintendo", "xbox", "entrada", "entradas", "festival", "padel", "futbol", "partido", "bolera", "karaoke", "discoteca", "planes", "revista", "exposicion", "escape", "billar", "piscina"],
  viajes: ["viaje", "viajes", "hotel", "airbnb", "hostal", "alojamiento", "vuelo", "vuelos", "avion", "ryanair", "vueling", "iberia", "easyjet", "booking", "escapada", "camping", "maleta", "equipaje", "excursion", "crucero", "ferry", "visado", "souvenir", "guia"],
  salud: ["farmacia", "medico", "dentista", "optica", "gafas", "lentillas", "gimnasio", "gym", "fisio", "fisioterapia", "psicologo", "terapia", "sanitas", "adeslas", "asisa", "analitica", "vitaminas", "medicamento", "pastillas", "yoga", "pilates", "pediatra", "vacuna", "masaje", "podologo", "radiografia", "ibuprofeno", "paracetamol"],
  personal: ["ropa", "zapatos", "zapatillas", "zara", "hm", "mango", "pull", "bershka", "stradivarius", "decathlon", "primark", "uniqlo", "shein", "camiseta", "pantalones", "abrigo", "vestido", "bolso", "peluqueria", "barberia", "perfume", "cosmetica", "sephora", "druni", "primor", "manicura", "crema", "champu", "tinte", "cejas", "depilacion", "cuchillas"],
  subs: ["netflix", "spotify", "hbo", "max", "disney", "prime", "youtube", "icloud", "dropbox", "suscripcion", "filmin", "mubi", "twitch", "patreon", "kindle", "chatgpt", "claude", "adobe", "canva", "dominio", "hosting", "notion", "cuota", "membresia", "apple", "google"],
  banco: ["banco", "comision", "comisiones", "impuesto", "impuestos", "hacienda", "irpf", "iva", "ibi", "tasa", "gestoria", "notario", "autonomo", "seguro", "seguros", "mapfre", "allianz", "axa", "multa", "prestamo", "interes", "transferencia", "mantenimiento"],
  mascota: ["mascota", "veterinario", "veterinaria", "gato", "gatos", "perro", "perros", "pienso", "arena", "correa", "collar", "rascador", "canina", "adiestrador"],
  hijos: ["guarderia", "colegio", "escuela", "cole", "bebe", "panales", "papilla", "carrito", "juguete", "juguetes", "extraescolar", "comedor", "ampa", "canguro", "ninera", "chupete", "biberon", "cuna"],
  formacion: ["curso", "cursos", "master", "universidad", "matricula", "academia", "idiomas", "ingles", "clases", "manual", "temario", "examen", "titulacion", "formacion", "apuntes", "certificado", "oposicion"],
  regalos: ["regalo", "regalos", "cumpleanos", "aniversario", "boda", "navidad", "reyes", "valentin", "detalle", "flores", "floristeria", "donativo", "ong", "propina", "bautizo", "comunion"],
  ahorro: ["ahorro", "ahorrar", "hucha", "traspaso", "apartar", "fondo", "inversion", "indexado", "etf", "pension", "imposicion"],
  otros: ["varios", "efectivo", "correos", "papeleria", "amazon", "mudanza", "imprenta", "copisteria", "llaves", "reparacion", "envio", "paqueteria"],
};

const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "un", "una", "en", "para", "con", "por", "al", "y", "o", "mi", "mis", "que", "es"]);

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (s) => norm(s).split(" ").filter((t) => t.length >= 3 && !STOPWORDS.has(t));

/* distancia de edición, para el buscador por proximidad (ej. "blanco" encuentra "banco") */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}

/* ¿el texto de búsqueda encaja con este texto? por substring, o por proximidad si no */
function fuzzyMatch(query, text) {
  const q = norm(query);
  if (!q) return true;
  const qTokens = q.split(" ").filter(Boolean);
  const textTokens = norm(text).split(" ").filter(Boolean);
  if (!qTokens.length || !textTokens.length) return false;
  return qTokens.every((qt) =>
    textTokens.some((tt) => {
      if (tt.includes(qt) || qt.includes(tt)) return true;
      const maxLen = Math.max(qt.length, tt.length);
      const tolerancia = maxLen <= 4 ? 1 : maxLen <= 8 ? 2 : 3;
      return levenshtein(qt, tt) <= tolerancia;
    })
  );
}

/* detecta categoría: lo aprendido pesa más que el diccionario */
function detectCategory(name, categories, learned) {
  const toks = tokenize(name);
  if (!toks.length) return null;
  const valid = new Set(categories.map((c) => c.id));
  const scores = {};
  const bump = (id, n) => {
    if (!valid.has(id)) return;
    scores[id] = (scores[id] || 0) + n;
  };

  for (const t of toks) {
    const mem = learned[t];
    if (mem) for (const [id, count] of Object.entries(mem)) bump(id, 10 + count * 4);
    for (const [id, words] of Object.entries(DICT)) {
      if (words.includes(t)) bump(id, 5);
    }
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

function learnFrom(learned, name, categoryId) {
  const next = { ...learned };
  for (const t of tokenize(name)) {
    const entry = { ...(next[t] || {}) };
    entry[categoryId] = (entry[categoryId] || 0) + 1;
    next[t] = entry;
  }
  return next;
}

/* ── utilidades ── */
const uid = () => Math.random().toString(36).slice(2, 10);
const eur = (n) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(n || 0);
const monthKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const nowHM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKeyOf(d);
}
function parseAmount(s) {
  if (s === null || s === undefined) return NaN;
  let t = String(s).trim().replace(/[€\s]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  t = t.replace(/[^0-9.]/g, "");
  const v = parseFloat(t);
  return isNaN(v) ? NaN : Math.round(v * 100) / 100;
}
const dayLabel = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
};
const stampLabel = (e) => {
  const [y, m, d] = e.date.split("-").map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", year: "2-digit" });
  if (e.fixed) return `${day} · fijo`;
  return e.time ? `${day} · ${e.time}` : `${day} · sin hora`;
};
const sortKey = (e) => `${e.date} ${e.time || "00:00"}`;
const emptyMonth = () => ({ incomes: [], expenses: [], applied: {} });
const daysIn = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};
const shortMonth = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
};
const monthsBack = (key, n) => Array.from({ length: n }, (_, i) => shiftMonth(key, -(n - 1 - i)));

/* cada cuánto se repite un fijo */
const FREQS = [
  { every: 1, label: "Cada mes", short: "cada mes" },
  { every: 2, label: "Cada 2 meses", short: "cada 2 meses" },
  { every: 3, label: "Trimestral", short: "trimestral" },
  { every: 6, label: "Semestral", short: "semestral" },
  { every: 12, label: "Anual", short: "anual" },
];
const monthsDiff = (from, to) => {
  const [ay, am] = from.split("-").map(Number);
  const [by, bm] = to.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
};
const dueIn = (r, key) =>
  r.active !== false && r.since <= key && monthsDiff(r.since, key) % (r.every || 1) === 0;
const nextDue = (r, fromKey) => {
  let k = r.since > fromKey ? r.since : fromKey;
  for (let i = 0; i < 24; i++) {
    if (dueIn(r, k)) return k;
    k = shiftMonth(k, 1);
  }
  return null;
};
const freqLabel = (r) => (FREQS.find((f) => f.every === (r.every || 1)) || FREQS[0]).short;

/* ── estilos ── */
const CSS = `
/* tipografías propias: sin depender de Google, funcionan sin conexión */
@font-face{font-family:'Bricolage Grotesque';src:url('./font-bricolage.woff2') format('woff2');
  font-weight:400 800;font-style:normal;font-display:swap;}
@font-face{font-family:'Karla';src:url('./font-karla.woff2') format('woff2');
  font-weight:400 700;font-style:normal;font-display:swap;}
@font-face{font-family:'IBM Plex Mono';src:url('./font-mono-400.woff2') format('woff2');
  font-weight:400;font-style:normal;font-display:swap;}
@font-face{font-family:'IBM Plex Mono';src:url('./font-mono-500.woff2') format('woff2');
  font-weight:500;font-style:normal;font-display:swap;}
@font-face{font-family:'IBM Plex Mono';src:url('./font-mono-600.woff2') format('woff2');
  font-weight:600;font-style:normal;font-display:swap;}

.cg-root{
  --ink:#101A18; --pine:#1E4E45; --pine2:#2C6B5E; --saffron:#D99A2B; --red:#A63A2E;
  --bg:#E4E9E2; --card:#FBFCF9; --line:#CCD6CE; --muted:#5F6F68;
  --display:'Bricolage Grotesque',system-ui,sans-serif;
  --body:'Karla',system-ui,sans-serif;
  --mono:'IBM Plex Mono',ui-monospace,monospace;
  background:var(--bg); color:var(--ink); font-family:var(--body);
  min-height:100vh; box-sizing:border-box;
  padding:max(20px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right))
          calc(48px + env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
  -webkit-font-smoothing:antialiased; -webkit-text-size-adjust:100%;
  -webkit-tap-highlight-color:transparent; overscroll-behavior-y:contain;
}
.cg-root *,.cg-root *::before,.cg-root *::after{box-sizing:border-box;}
.cg-wrap{max-width:560px;margin:0 auto;}
.cg-eyebrow{font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);}
.cg-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;}
.cg-card + .cg-card{margin-top:12px;}

/* cabecera */
.cg-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px;}
.cg-brand{font-family:var(--display);font-weight:700;font-size:17px;letter-spacing:-.02em;}
.cg-nav{display:flex;align-items:center;gap:2px;}
.cg-navbtn{width:30px;height:30px;border-radius:9px;border:1px solid var(--line);background:var(--card);
  color:var(--ink);cursor:pointer;font-size:15px;line-height:1;display:grid;place-items:center;}
.cg-navbtn:hover{background:#EFF3EE;}
.cg-month{font-family:var(--mono);font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;
  padding:0 8px;min-width:112px;text-align:center;}

/* héroe */
.cg-hero{background:var(--ink);color:#F2F5F1;border-radius:16px;padding:18px 18px 16px;position:relative;overflow:hidden;}
.cg-hero .cg-eyebrow{color:#8DA39A;}
.cg-big{font-family:var(--mono);font-weight:600;font-size:clamp(34px,11vw,46px);letter-spacing:-.03em;
  line-height:1;margin:6px 0 2px;font-variant-numeric:tabular-nums;display:flex;align-items:baseline;gap:6px;}
.cg-big small{font-size:.45em;font-weight:500;color:#8DA39A;letter-spacing:0;}
.cg-hero.over .cg-big{color:#F0A79B;}
.cg-sub{font-size:12.5px;color:#9FB3AA;font-family:var(--mono);letter-spacing:.02em;}
.cg-coachmsg{font-size:12px;color:#B9C9C0;margin-top:4px;}

.cg-eye{position:absolute;top:14px;right:14px;width:32px;height:32px;border-radius:50%;border:0;
  background:rgba(242,245,241,.12);color:#F2F5F1;cursor:pointer;display:grid;place-items:center;padding:0;}
.cg-eye:hover{background:rgba(242,245,241,.22);}
.cg-eye:focus-visible{outline:2px solid #F2F5F1;outline-offset:2px;}
.cg-hidden{letter-spacing:.06em;}

/* barra del mes */
.cg-bar{position:relative;height:12px;border-radius:99px;background:#22322E;margin:16px 0 8px;display:flex;overflow:hidden;}
.cg-seg{height:100%;transition:width .45s cubic-bezier(.22,.75,.2,1);}
.cg-tick{position:absolute;top:-6px;bottom:-6px;width:2px;background:#F2F5F1;opacity:.75;border-radius:2px;}
.cg-tick span{position:absolute;top:-15px;left:50%;transform:translateX(-50%);font-family:var(--mono);
  font-size:9px;letter-spacing:.1em;color:#9FB3AA;white-space:nowrap;}
.cg-legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:10px;}
.cg-legend div{display:flex;align-items:center;gap:5px;font-size:11px;color:#9FB3AA;font-family:var(--mono);}
.cg-dot{width:7px;height:7px;border-radius:2px;flex:none;}

/* pestañas */
.cg-tabs{display:flex;gap:4px;margin:14px 0 12px;background:#D9E0D8;padding:3px;border-radius:11px;}
.cg-tab{flex:1;border:0;background:transparent;padding:8px 4px;border-radius:9px;cursor:pointer;
  font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);}
.cg-tab.on{background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(16,26,24,.08);}

/* formulario */
.cg-row{display:flex;gap:8px;}
.cg-field{flex:1;min-width:0;}
label.cg-lab{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--muted);margin-bottom:5px;}
.cg-input{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:10px;background:#fff;
  font-family:var(--body);font-size:16px;color:var(--ink);}
.cg-input.num{font-family:var(--mono);text-align:right;font-variant-numeric:tabular-nums;}
.cg-input:focus-visible,.cg-navbtn:focus-visible,.cg-chip:focus-visible,.cg-btn:focus-visible,
.cg-tab:focus-visible,.cg-ghost:focus-visible{outline:2px solid var(--pine2);outline-offset:2px;}
.cg-chips{display:flex;flex-wrap:wrap;gap:6px;}
.cg-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:99px;cursor:pointer;
  border:1px solid var(--line);background:#fff;font-family:var(--body);font-size:13px;color:var(--ink);}
.cg-chip.on{border-color:transparent;color:#fff;font-weight:600;}
.cg-chip.add{border-style:dashed;color:var(--muted);}
.cg-guess{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--pine2);margin-left:6px;}
.cg-btn{width:100%;margin-top:12px;padding:12px;border:0;border-radius:11px;background:var(--pine);
  color:#F2F5F1;font-family:var(--display);font-weight:700;font-size:15px;letter-spacing:-.01em;cursor:pointer;}
.cg-btn:hover{background:#17403A;}
.cg-btn[disabled]{opacity:.45;cursor:not-allowed;}
.cg-ghost{border:1px solid var(--line);background:transparent;border-radius:9px;padding:7px 11px;
  font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);cursor:pointer;}
.cg-ghost:hover{background:#EFF3EE;color:var(--ink);}
.cg-ghost.danger{color:var(--red);border-color:#E3C6C1;}

/* listas */
.cg-title{font-family:var(--display);font-weight:700;font-size:15px;margin:0 0 10px;letter-spacing:-.01em;}
.cg-item{display:flex;align-items:center;gap:11px;padding:10px 0;border-top:1px solid var(--line);cursor:pointer;
  background:none;border-left:0;border-right:0;border-bottom:0;width:100%;text-align:left;font-family:var(--body);}
.cg-item:first-of-type{border-top:0;}
.cg-item:hover{background:#F4F7F3;}
.cg-badge{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-size:15px;flex:none;}
.cg-name{font-size:14.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cg-meta{font-family:var(--mono);font-size:10.5px;color:var(--muted);letter-spacing:.04em;margin-top:2px;}
.cg-amt{margin-left:auto;font-family:var(--mono);font-size:14px;font-variant-numeric:tabular-nums;flex:none;}
.cg-day{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--muted);margin:14px 0 4px;}
.cg-empty{text-align:center;padding:22px 10px;color:var(--muted);font-size:13.5px;line-height:1.5;}

/* gráfico */
.cg-donut{display:block;margin:2px auto 14px;max-width:230px;}
.cg-donut svg{width:100%;height:auto;display:block;}
.cg-slice{cursor:pointer;transition:opacity .2s ease,stroke-width .2s ease;}
.cg-dnum{font-family:var(--mono);font-size:19px;font-weight:600;fill:var(--ink);}
.cg-dlab{font-family:var(--mono);font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;fill:var(--muted);}
.cg-dpct{font-family:var(--mono);font-size:9px;font-weight:600;fill:#fff;pointer-events:none;}
.cg-catrow{padding:11px 0;border-top:1px solid var(--line);display:block;width:100%;text-align:left;
  background:none;border-left:0;border-right:0;border-bottom:0;font-family:var(--body);color:var(--ink);cursor:pointer;}
.cg-catrow:first-of-type{border-top:0;}
.cg-catrow:hover{background:#F4F7F3;}
.cg-catline{display:flex;align-items:baseline;gap:8px;font-size:14px;}
.cg-track{height:8px;background:#E7EBE4;border-radius:99px;margin-top:7px;overflow:hidden;position:relative;}
.cg-fill{height:100%;border-radius:99px;transition:width .45s cubic-bezier(.22,.75,.2,1);}
.cg-limit{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--ink);opacity:.55;}
.cg-pct{margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--muted);}
.cg-hint{font-size:12px;color:var(--muted);margin:0 0 12px;}
.cg-toggle{display:flex;gap:4px;background:#E7EBE4;padding:3px;border-radius:10px;margin-bottom:4px;}
.cg-toggle button{flex:1;border:0;background:transparent;padding:7px;border-radius:8px;cursor:pointer;
  font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);}
.cg-toggle button.on{background:var(--card);color:var(--ink);}
.cg-stats{display:flex;gap:8px;}
.cg-stat{flex:1;background:#F1F5F0;border-radius:11px;padding:10px 11px;}
.cg-stat b{display:block;font-family:var(--mono);font-size:15px;margin-top:3px;font-variant-numeric:tabular-nums;}

/* comparativa */
.cg-spark{display:flex;align-items:flex-end;gap:5px;height:108px;margin:2px 0 14px;}
.cg-sparkcol{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;
  border:0;background:none;cursor:pointer;padding:0;gap:4px;}
.cg-sparkval{font-family:var(--mono);font-size:9px;color:var(--muted);}
.cg-sparkbar{width:100%;background:#CFDACF;border-radius:5px 5px 2px 2px;transition:height .4s cubic-bezier(.22,.75,.2,1);}
.cg-sparkcol.on .cg-sparkbar{background:var(--pine);}
.cg-sparkcol.on .cg-sparkval{color:var(--ink);font-weight:600;}
.cg-sparkcol:hover .cg-sparkbar{background:var(--pine2);}
.cg-sparklab{font-family:var(--mono);font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);}
.cg-mover{display:flex;align-items:center;gap:8px;font-size:13.5px;padding:6px 0;border-top:1px solid var(--line);}
.cg-movdelta{margin-left:auto;font-family:var(--mono);font-size:12px;}

/* reparto 50/30/20 */
.cg-split{display:flex;height:16px;border-radius:99px;background:#E7EBE4;overflow:hidden;position:relative;}
.cg-splitseg{height:100%;transition:width .45s cubic-bezier(.22,.75,.2,1);}
.cg-splittick{position:absolute;top:0;bottom:0;width:2px;background:var(--card);opacity:.9;}
.cg-splitrow{display:flex;align-items:center;gap:8px;font-size:13.5px;padding:9px 0;border-top:1px solid var(--line);}
.cg-splitrow:first-of-type{margin-top:4px;}
.cg-splitnum{margin-left:auto;font-family:var(--mono);font-size:12px;color:var(--muted);}
.cg-splitnum b{color:var(--ink);}
.cg-splitnum em{font-style:normal;opacity:.7;}
.cg-splitoff{font-family:var(--mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;
  min-width:66px;text-align:right;}

/* selector de iconos */
.cg-emojibig{width:100%;height:44px;border:1px solid var(--line);border-radius:10px;background:#fff;
  font-size:24px;line-height:1;cursor:pointer;display:grid;place-items:center;}
.cg-emojibig:hover{background:#F4F7F3;}
.cg-emoji{width:38px;height:38px;border:1px solid var(--line);border-radius:9px;background:#fff;
  font-size:19px;line-height:1;cursor:pointer;display:grid;place-items:center;padding:0;}
.cg-emoji:hover{background:#F4F7F3;}
.cg-emoji.on{border-color:var(--pine);box-shadow:inset 0 0 0 1.5px var(--pine);}
.cg-emojigrid{display:grid;grid-template-columns:repeat(8,1fr);gap:5px;margin-top:8px;padding:9px;
  border:1px solid var(--line);border-radius:11px;background:#F4F7F3;max-height:216px;overflow-y:auto;}
.cg-emojigrid .cg-emoji{width:100%;}

/* previsión */
.cg-fcast{display:flex;align-items:baseline;justify-content:space-between;gap:10px;
  margin-top:12px;padding:12px 13px;border-radius:11px;}
.cg-fcast b{font-family:var(--mono);font-size:19px;font-variant-numeric:tabular-nums;}

/* fijos */
.cg-pending{background:#FDF6E7;border:1px solid #EBD9AE;}
.cg-fixedrow{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line);}
.cg-fixedrow:first-of-type{border-top:0;}
.cg-tag{font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;
  padding:2px 6px;border-radius:5px;background:#E7EBE4;color:var(--muted);}
.cg-tag.ok{background:#E1EFE2;color:var(--pine);}

/* hoja modal */
.cg-scrim{position:fixed;inset:0;padding-bottom:max(14px,env(safe-area-inset-bottom));background:rgba(16,26,24,.42);display:flex;align-items:flex-end;
  justify-content:center;padding:14px;z-index:50;animation:cgFade .18s ease;}
.cg-sheet{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;
  width:100%;max-width:460px;max-height:86vh;overflow:auto;animation:cgUp .22s cubic-bezier(.22,.75,.2,1);}
@keyframes cgFade{from{opacity:0}to{opacity:1}}
@keyframes cgUp{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}
@media (min-width:600px){.cg-scrim{align-items:center;}}
@media (prefers-reduced-motion:reduce){
  .cg-root *{animation:none!important;transition:none!important;}
}
.cg-foot{text-align:center;margin-top:18px;font-family:var(--mono);font-size:10px;
  letter-spacing:.12em;text-transform:uppercase;color:#8A9791;}
`;

/* ── iconos del ojo ── */
const EyeIcon = ({ off }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {off ? (
      <>
        <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.6 6.6A18.5 18.5 0 0 0 2 12s3 8 10 8a9.1 9.1 0 0 0 5.4-1.6" />
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <line x1="2" y1="2" x2="22" y2="22" />
      </>
    ) : (
      <>
        <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

/* ── hoja modal ── */
function Sheet({ children, onClose, title }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="cg-scrim" onClick={onClose}>
      <div className="cg-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 className="cg-title" style={{ margin: 0 }}>{title}</h3>
          <button className="cg-navbtn" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── editor de categoría ── */
function CategoryEditor({ category, onSave, onDelete, onClose, expenseCount }) {
  const [name, setName] = useState(category?.name || "");
  const [emoji, setEmoji] = useState(category?.emoji || "🏷️");
  const [pickedEmoji, setPickedEmoji] = useState(!!category);
  const [showAll, setShowAll] = useState(false);
  const [color, setColor] = useState(category?.color || SWATCHES[Math.floor(Math.random() * SWATCHES.length)]);
  const [budget, setBudget] = useState(category?.budget != null ? String(category.budget).replace(".", ",") : "");
  const [bucket, setBucket] = useState(category?.bucket || "deseo");
  const isNew = !category;

  const suggested = useMemo(() => suggestEmojis(name), [name]);
  useEffect(() => {
    if (!pickedEmoji && suggested.length) setEmoji(suggested[0]);
  }, [suggested, pickedEmoji]);

  const save = () => {
    const n = name.trim();
    if (!n) return;
    const b = parseAmount(budget);
    onSave({
      id: category?.id || uid(),
      name: n,
      emoji: emoji.trim() || "🏷️",
      color,
      bucket,
      budget: isNaN(b) || b <= 0 ? null : b,
    });
    onClose();
  };

  return (
    <Sheet title={isNew ? "Nueva categoría" : "Editar categoría"} onClose={onClose}>
      <div className="cg-row">
        <div style={{ width: 74 }}>
          <span className="cg-lab">Icono</span>
          <button className="cg-emojibig" onClick={() => setShowAll((v) => !v)}
            aria-label="Elegir otro icono">{emoji}</button>
        </div>
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-catname">Nombre</label>
          <input id="cg-catname" className="cg-input" value={name} autoFocus
            placeholder="Coche, mascota, café…" onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()} />
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <span className="cg-lab">
          {suggested.length ? "Sugeridos para ese nombre" : "Elige un icono"}
        </span>
        <div className="cg-chips">
          {(suggested.length ? suggested : EMOJI_ALL.slice(0, 8)).map((e, i) => (
            <button key={e + i} className={`cg-emoji ${emoji === e ? "on" : ""}`}
              onClick={() => { setEmoji(e); setPickedEmoji(true); }} aria-label={`Icono ${e}`}>{e}</button>
          ))}
          <button className="cg-chip add" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Cerrar" : "Ver todos"}
          </button>
        </div>
        {showAll && (
          <div className="cg-emojigrid">
            {EMOJI_ALL.map((e, i) => (
              <button key={e + i} className={`cg-emoji ${emoji === e ? "on" : ""}`}
                onClick={() => { setEmoji(e); setPickedEmoji(true); setShowAll(false); }}
                aria-label={`Icono ${e}`}>{e}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <span className="cg-lab">Color</span>
        <div className="cg-chips">
          {SWATCHES.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={`Color ${c}`}
              style={{
                width: 28, height: 28, borderRadius: 8, background: c, cursor: "pointer",
                border: color === c ? "2px solid #101A18" : "1px solid rgba(0,0,0,.1)",
                outlineOffset: 2,
              }} />
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <span className="cg-lab">En el reparto 50/30/20 cuenta como</span>
        <div className="cg-toggle">
          {BUCKETS.map((b) => (
            <button key={b.id} className={bucket === b.id ? "on" : ""} onClick={() => setBucket(b.id)}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="cg-lab" htmlFor="cg-budget">Límite mensual (opcional)</label>
        <input id="cg-budget" className="cg-input num" inputMode="decimal" placeholder="0,00"
          value={budget} onChange={(e) => setBudget(e.target.value)} />
      </div>

      <button className="cg-btn" onClick={save} disabled={!name.trim()}>
        {isNew ? "Crear categoría" : "Guardar cambios"}
      </button>

      {!isNew && (
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <button className="cg-ghost danger" onClick={() => { onDelete(category.id); onClose(); }}>
            Borrar categoría
          </button>
          {expenseCount > 0 && (
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
              Tiene {expenseCount} {expenseCount === 1 ? "gasto" : "gastos"}. Al borrarla pasan a «Otros».
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ── editor de gasto ── */
function ExpenseEditor({ expense, categories, onSave, onDelete, onClose }) {
  const [name, setName] = useState(expense.name);
  const [amount, setAmount] = useState(String(expense.amount).replace(".", ","));
  const [categoryId, setCategoryId] = useState(expense.categoryId);
  const [date, setDate] = useState(expense.date);
  const [time, setTime] = useState(expense.time || "");
  const value = parseAmount(amount);
  const valid = name.trim() && !isNaN(value) && value > 0 && categoryId;

  return (
    <Sheet title="Editar gasto" onClose={onClose}>
      <div className="cg-row">
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-ename">Concepto</label>
          <input id="cg-ename" className="cg-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ width: 108 }}>
          <label className="cg-lab" htmlFor="cg-eamt">Importe</label>
          <input id="cg-eamt" className="cg-input num" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <div className="cg-row" style={{ marginTop: 12 }}>
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-edate">Fecha</label>
          <input id="cg-edate" type="date" className="cg-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div style={{ width: 120 }}>
          <label className="cg-lab" htmlFor="cg-etime">Hora</label>
          <input id="cg-etime" type="time" className="cg-input" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <span className="cg-lab">Categoría</span>
        <div className="cg-chips">
          {categories.map((c) => (
            <button key={c.id} className={`cg-chip ${categoryId === c.id ? "on" : ""}`}
              style={categoryId === c.id ? { background: c.color } : undefined}
              onClick={() => setCategoryId(c.id)}>
              <span>{c.emoji}</span>{c.name}
            </button>
          ))}
        </div>
      </div>
      <button className="cg-btn" disabled={!valid}
        onClick={() => { onSave({ ...expense, name: name.trim(), amount: value, categoryId, date, time: time || null }); onClose(); }}>
        Guardar cambios
      </button>
      <div style={{ marginTop: 12, textAlign: "center" }}>
        <button className="cg-ghost danger" onClick={() => { onDelete(expense.id); onClose(); }}>Borrar gasto</button>
      </div>
    </Sheet>
  );
}

/* ── editor de ingreso ── */
function IncomeEditor({ income, onSave, onDelete, onClose }) {
  const [label, setLabel] = useState(income.label);
  const [amount, setAmount] = useState(String(income.amount).replace(".", ","));
  const [date, setDate] = useState(income.date || todayISO());
  const value = parseAmount(amount);
  const valid = label.trim() && !isNaN(value) && value > 0;

  return (
    <Sheet title="Editar ingreso" onClose={onClose}>
      <div className="cg-row">
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-ilabe">Concepto</label>
          <input id="cg-ilabe" className="cg-input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div style={{ width: 108 }}>
          <label className="cg-lab" htmlFor="cg-iamte">Importe</label>
          <input id="cg-iamte" className="cg-input num" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="cg-lab" htmlFor="cg-idate">Fecha</label>
        <input id="cg-idate" type="date" className="cg-input" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <button className="cg-btn" disabled={!valid}
        onClick={() => { onSave({ ...income, label: label.trim(), amount: value, date }); onClose(); }}>
        Guardar cambios
      </button>
      <div style={{ marginTop: 12, textAlign: "center" }}>
        <button className="cg-ghost danger" onClick={() => { onDelete(income.id); onClose(); }}>Borrar ingreso</button>
      </div>
    </Sheet>
  );
}

/* ── formulario de alta ── */
function AddExpense({ categories, learned, onAdd, onNewCategory, justCreated }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [touched, setTouched] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [showDate, setShowDate] = useState(false);
  const [catExpanded, setCatExpanded] = useState(false);
  const nameRef = useRef(null);

  const guess = useMemo(
    () => (touched ? null : detectCategory(name, categories, learned)),
    [name, categories, learned, touched]
  );
  useEffect(() => {
    if (justCreated) { setCategoryId(justCreated); setTouched(true); }
  }, [justCreated]);
  const selected = touched ? categoryId : guess || categoryId;
  const topCats = categories.slice(0, 4);
  useEffect(() => {
    if (selected && !topCats.some((c) => c.id === selected)) setCatExpanded(true);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const visibleCats = catExpanded ? categories : topCats;
  const value = parseAmount(amount);
  const valid = name.trim() && !isNaN(value) && value > 0 && selected;

  const submit = () => {
    if (!valid) return;
    onAdd({ id: uid(), name: name.trim(), amount: value, categoryId: selected, date, time: nowHM() });
    setName(""); setAmount(""); setCategoryId(null); setTouched(false);
    setDate(todayISO()); setShowDate(false); setCatExpanded(false);
    nameRef.current?.focus();
  };

  return (
    <div className="cg-card">
      <h2 className="cg-title">Nuevo gasto</h2>
      <div className="cg-row">
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-name">Concepto</label>
          <input id="cg-name" ref={nameRef} className="cg-input" placeholder="Mercadona, gasolina…"
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
        <div style={{ width: 108 }}>
          <label className="cg-lab" htmlFor="cg-amt">Importe €</label>
          <input id="cg-amt" className="cg-input num" inputMode="decimal" placeholder="0,00"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
      </div>

      {showDate ? (
        <div style={{ marginTop: 12 }}>
          <label className="cg-lab" htmlFor="cg-date">Fecha</label>
          <input id="cg-date" type="date" className="cg-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      ) : (
        <button className="cg-ghost" style={{ marginTop: 12 }} onClick={() => setShowDate(true)}>
          Hoy · cambiar fecha
        </button>
      )}

      <div style={{ marginTop: 12 }}>
        <span className="cg-lab">
          Categoría
          {guess && (
            <span className="cg-guess">
              · detectada: {categories.find((c) => c.id === guess)?.name}
            </span>
          )}
        </span>
        <div className="cg-chips">
          {visibleCats.map((c) => (
            <button key={c.id} className={`cg-chip ${selected === c.id ? "on" : ""}`}
              style={selected === c.id ? { background: c.color } : undefined}
              onClick={() => { setCategoryId(c.id); setTouched(true); }}>
              <span>{c.emoji}</span>{c.name}
            </button>
          ))}
          <button className="cg-chip add" onClick={onNewCategory}>+ Nueva</button>
          {!catExpanded && categories.length > 4 && (
            <button className="cg-chip" onClick={() => setCatExpanded(true)}>Ver más</button>
          )}
        </div>
      </div>

      <button className="cg-btn" onClick={submit} disabled={!valid}>Añadir gasto</button>
    </div>
  );
}

/* ── ingresos del mes ── */
function IncomeCard({ incomes, onAdd, monthKey }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const total = incomes.reduce((s, i) => s + i.amount, 0);
  const value = parseAmount(amount);
  const valid = !isNaN(value) && value > 0;
  const hoy = todayISO();
  const fecha = hoy.slice(0, 7) === monthKey ? hoy : `${monthKey}-01`;

  const submit = () => {
    if (!valid) return;
    onAdd({ id: uid(), label: label.trim() || "Ingreso", amount: value, date: fecha });
    setLabel(""); setAmount("");
  };

  return (
    <div className="cg-card">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 className="cg-title">Recibido este mes</h2>
        <span style={{ fontFamily: "var(--mono)", fontSize: 15 }}>{eur(total)} €</span>
      </div>

      <p className="cg-hint" style={{ marginTop: 4 }}>
        {incomes.length === 0
          ? "Nómina, devoluciones, ventas… Aparecerán en Movimientos, arriba."
          : `${incomes.length} ${incomes.length === 1 ? "ingreso" : "ingresos"} anotados. Los ves y los editas en Movimientos, arriba.`}
      </p>

      <div className="cg-row" style={{ marginTop: 12 }}>
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-ilab">Concepto</label>
          <input id="cg-ilab" className="cg-input" placeholder="Nómina, freelance…"
            value={label} onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
        <div style={{ width: 108 }}>
          <label className="cg-lab" htmlFor="cg-iamt">Importe €</label>
          <input id="cg-iamt" className="cg-input num" inputMode="decimal" placeholder="0,00"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
      </div>
      <button className="cg-btn" onClick={submit} disabled={!valid}>Añadir ingreso</button>
    </div>
  );
}

/* ── gráfico de queso ── */
function Donut({ slices, total, onPick }) {
  const [hover, setHover] = useState(null);
  const R = 68, SW = 27, C = 2 * Math.PI * R;
  const active = slices.find((s) => s.id === hover);
  let acc = 0;
  const arcs = slices.map((s) => {
    const frac = s.total / total;
    const start = acc;
    acc += frac;
    return { ...s, frac, start };
  });

  return (
    <div className="cg-donut">
      <svg viewBox="0 0 200 200" role="img"
        aria-label={`Reparto del gasto: ${arcs.map((a) => `${a.name} ${Math.round(a.frac * 100)}%`).join(", ")}`}>
        <circle cx="100" cy="100" r={R} fill="none" stroke="#E7EBE4" strokeWidth={SW} />
        <g transform="rotate(-90 100 100)">
          {arcs.map((a) => {
            const len = Math.max(a.frac * C - (slices.length > 1 ? 1.6 : 0), 0.8);
            return (
              <circle key={a.id} className="cg-slice" cx="100" cy="100" r={R} fill="none"
                stroke={a.color} strokeWidth={hover === a.id ? SW + 6 : SW}
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-a.start * C}
                opacity={hover && hover !== a.id ? 0.32 : 1}
                onMouseEnter={() => setHover(a.id)} onMouseLeave={() => setHover(null)}
                onClick={() => onPick(a.id)} />
            );
          })}
        </g>
        {arcs.filter((a) => a.frac >= 0.07).map((a) => {
          const ang = (a.start + a.frac / 2) * 2 * Math.PI - Math.PI / 2;
          return (
            <text key={a.id} className="cg-dpct" x={100 + R * Math.cos(ang)}
              y={100 + R * Math.sin(ang) + 3.2} textAnchor="middle">
              {Math.round(a.frac * 100)}%
            </text>
          );
        })}
        <text className="cg-dnum" x="100" y={active ? 95 : 97} textAnchor="middle">
          {eur(active ? active.total : total)} €
        </text>
        <text className="cg-dlab" x="100" y={active ? 111 : 113} textAnchor="middle">
          {active ? active.name.slice(0, 20) : "gastado"}
        </text>
      </svg>
    </div>
  );
}

/* ── desglose de una categoría ── */
function CategoryDetail({ category, monthKey, months, onClose, onPickExpense }) {
  const [scope, setScope] = useState("mes");
  const groups = useMemo(() => {
    const keys = scope === "mes" ? [monthKey] : Object.keys(months).sort().reverse();
    const out = [];
    for (const k of keys) {
      const list = (months[k]?.expenses || [])
        .filter((e) => e.categoryId === category.id)
        .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
      if (list.length) out.push([k, list]);
    }
    return out;
  }, [scope, monthKey, months, category.id]);

  const all = groups.flatMap(([, l]) => l);
  const total = all.reduce((s, e) => s + e.amount, 0);

  return (
    <Sheet title={`${category.emoji} ${category.name}`} onClose={onClose}>
      <div className="cg-toggle">
        <button className={scope === "mes" ? "on" : ""} onClick={() => setScope("mes")}>
          {monthLabel(monthKey)}
        </button>
        <button className={scope === "todo" ? "on" : ""} onClick={() => setScope("todo")}>
          Todo el historial
        </button>
      </div>

      <div className="cg-stats" style={{ marginTop: 12 }}>
        <div className="cg-stat"><span className="cg-eyebrow">Total</span><b>{eur(total)} €</b></div>
        <div className="cg-stat"><span className="cg-eyebrow">Gastos</span><b>{all.length}</b></div>
        <div className="cg-stat"><span className="cg-eyebrow">Media</span><b>{eur(all.length ? total / all.length : 0)} €</b></div>
      </div>

      {all.length === 0 ? (
        <p className="cg-empty">Nada anotado en esta categoría todavía.</p>
      ) : (
        groups.map(([k, list]) => (
          <div key={k}>
            {scope === "todo" && (
              <div className="cg-day" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{monthLabel(k)}</span>
                <span>{eur(list.reduce((s, e) => s + e.amount, 0))} €</span>
              </div>
            )}
            {list.map((e) => (
              <button key={e.id} className="cg-item" onClick={() => onPickExpense(e)}>
                <div className="cg-badge" style={{ background: category.color + "22" }}>{category.emoji}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="cg-name">{e.name}</div>
                  <div className="cg-meta">{stampLabel(e)}</div>
                </div>
                <span className="cg-amt">−{eur(e.amount)} €</span>
              </button>
            ))}
          </div>
        ))
      )}
      <p className="cg-hint" style={{ marginTop: 14, marginBottom: 0 }}>Toca un gasto para editarlo o borrarlo.</p>
    </Sheet>
  );
}

/* ── editor de gasto o ingreso fijo ── */
function FixedEditor({ item, categories, monthKey, onSave, onDelete, onClose, onSaveCategory }) {
  const [kind, setKind] = useState(item?.kind || "gasto");
  const [name, setName] = useState(item?.name || "");
  const [amount, setAmount] = useState(item ? String(item.amount).replace(".", ",") : "");
  const [categoryId, setCategoryId] = useState(item?.categoryId || null);
  const [day, setDay] = useState(String(item?.day || 1));
  const [every, setEvery] = useState(item?.every || 1);
  const [since, setSince] = useState(item?.since || monthKey);
  const [auto, setAuto] = useState(item?.auto !== false);
  const [newCat, setNewCat] = useState(false);
  const isNew = !item;
  const value = parseAmount(amount);
  const d = Math.min(28, Math.max(1, parseInt(day, 10) || 1));
  const valid = name.trim() && !isNaN(value) && value > 0 && (kind === "ingreso" || categoryId) && /^\d{4}-\d{2}$/.test(since);
  const cuando = every === 1
    ? `Se propone todos los meses, el día ${d}.`
    : `Toca en ${Array.from({ length: Math.min(12 / Math.min(every, 12) || 1, 4) }, (_, i) => monthLabel(shiftMonth(since, i * every)).toLowerCase()).join(", ")}…`;

  return (
    <Sheet title={isNew ? "Nuevo fijo" : "Editar fijo"} onClose={onClose}>
      <div className="cg-toggle">
        <button className={kind === "gasto" ? "on" : ""} onClick={() => setKind("gasto")}>Gasto</button>
        <button className={kind === "ingreso" ? "on" : ""} onClick={() => setKind("ingreso")}>Ingreso</button>
      </div>

      <div className="cg-row" style={{ marginTop: 12 }}>
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-fname">Concepto</label>
          <input id="cg-fname" className="cg-input" autoFocus value={name}
            placeholder={kind === "ingreso" ? "Nómina" : "Alquiler, Netflix…"}
            onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ width: 108 }}>
          <label className="cg-lab" htmlFor="cg-famt">Importe €</label>
          <input id="cg-famt" className="cg-input num" inputMode="decimal" placeholder="0,00"
            value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <span className="cg-lab">Cada cuánto se repite</span>
        <div className="cg-chips">
          {FREQS.map((f) => (
            <button key={f.every} className={`cg-chip ${every === f.every ? "on" : ""}`}
              style={every === f.every ? { background: "var(--pine)" } : undefined}
              onClick={() => setEvery(f.every)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cg-row" style={{ marginTop: 12 }}>
        <div style={{ width: 96 }}>
          <label className="cg-lab" htmlFor="cg-fday">Día del mes</label>
          <input id="cg-fday" className="cg-input num" inputMode="numeric" value={day}
            onChange={(e) => setDay(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} />
        </div>
        <div className="cg-field">
          <label className="cg-lab" htmlFor="cg-fsince">Empieza en</label>
          <input id="cg-fsince" type="month" className="cg-input" value={since}
            onChange={(e) => setSince(e.target.value)} />
        </div>
      </div>
      <p className="cg-hint" style={{ marginTop: 6 }}>
        {cuando} El día va del 1 al 28, para que exista en febrero.
      </p>

      <div style={{ marginTop: 12 }}>
        <span className="cg-lab">¿Se anota solo?</span>
        <div className="cg-toggle">
          <button className={auto ? "on" : ""} onClick={() => setAuto(true)}>Automático</button>
          <button className={!auto ? "on" : ""} onClick={() => setAuto(false)}>Me lo preguntas</button>
        </div>
      </div>

      {kind === "gasto" && (
        <div style={{ marginTop: 12 }}>
          <span className="cg-lab">Categoría</span>
          <div className="cg-chips">
            {categories.map((c) => (
              <button key={c.id} className={`cg-chip ${categoryId === c.id ? "on" : ""}`}
                style={categoryId === c.id ? { background: c.color } : undefined}
                onClick={() => setCategoryId(c.id)}>
                <span>{c.emoji}</span>{c.name}
              </button>
            ))}
            <button className="cg-chip add" onClick={() => setNewCat(true)}>+ Nueva</button>
          </div>
        </div>
      )}

      {newCat && (
        <CategoryEditor
          category={null}
          expenseCount={0}
          onSave={(cat) => { onSaveCategory(cat); setCategoryId(cat.id); }}
          onDelete={() => {}}
          onClose={() => setNewCat(false)}
        />
      )}


      <button className="cg-btn" disabled={!valid}
        onClick={() => {
          onSave({
            id: item?.id || uid(),
            kind, name: name.trim(), amount: value, day: d, every, auto,
            categoryId: kind === "gasto" ? categoryId : null,
            since,
            active: item?.active !== false,
          });
          onClose();
        }}>
        {isNew ? "Crear fijo" : "Guardar cambios"}
      </button>

      {!isNew && (
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <button className="cg-ghost danger" onClick={() => { onDelete(item.id); onClose(); }}>
            Borrar fijo
          </button>
          <p className="cg-hint" style={{ marginTop: 8 }}>
            Los gastos ya anotados en meses anteriores se quedan como están.
          </p>
        </div>
      )}
    </Sheet>
  );
}

/* ── comparativa entre meses ── */
function MonthCompare({ monthKey, months, categories, onJump }) {
  const spendCats = categories.filter((c) => c.bucket !== "ahorro");
  const isSpend = (e) => spendCats.some((c) => c.id === e.categoryId);
  const keys = monthsBack(monthKey, 6);
  const totalOf = (k) => (months[k]?.expenses || []).filter(isSpend).reduce((s, e) => s + e.amount, 0);
  const series = keys.map((k) => ({ key: k, total: totalOf(k) }));
  const max = Math.max(...series.map((s) => s.total), 1);
  const current = totalOf(monthKey);

  const prevKeys = monthsBack(shiftMonth(monthKey, -1), 3).filter((k) => (months[k]?.expenses || []).length);
  const avg = prevKeys.length ? prevKeys.reduce((s, k) => s + totalOf(k), 0) / prevKeys.length : 0;
  const diff = current - avg;
  const pct = avg > 0 ? (diff / avg) * 100 : 0;

  const movers = useMemo(() => {
    if (!prevKeys.length) return [];
    return spendCats.map((c) => {
      const now = (months[monthKey]?.expenses || []).filter((e) => e.categoryId === c.id).reduce((s, e) => s + e.amount, 0);
      const before = prevKeys.reduce((s, k) =>
        s + (months[k]?.expenses || []).filter((e) => e.categoryId === c.id).reduce((t, e) => t + e.amount, 0), 0) / prevKeys.length;
      return { ...c, now, before, delta: now - before };
    })
      .filter((c) => Math.abs(c.delta) >= 1 && (c.now > 0 || c.before > 0))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);
  }, [categories, months, monthKey, prevKeys.join()]);

  return (
    <div className="cg-card">
      <h2 className="cg-title">Comparativa</h2>

      <div className="cg-spark">
        {series.map((s) => (
          <button key={s.key} onClick={() => onJump(s.key)}
            className={`cg-sparkcol ${s.key === monthKey ? "on" : ""}`}
            aria-label={`${monthLabel(s.key)}: ${eur(s.total)} euros`}>
            <span className="cg-sparkval">{s.total > 0 ? Math.round(s.total) : ""}</span>
            <span className="cg-sparkbar" style={{ height: `${Math.max((s.total / max) * 100, 2)}%` }} />
            <span className="cg-sparklab">{shortMonth(s.key)}</span>
          </button>
        ))}
      </div>

      {prevKeys.length === 0 ? (
        <p className="cg-hint" style={{ margin: 0 }}>
          Cuando tengas un mes anterior con gastos, aquí verás si subes o bajas.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 13.5, margin: "4px 0 0", lineHeight: 1.5 }}>
            {Math.abs(pct) < 3 ? (
              <>Vas en línea con tu media {prevKeys.length === 1 ? "del mes anterior" : `de los ${prevKeys.length} meses anteriores`} ({eur(avg)} €).</>
            ) : (
              <>
                {diff > 0 ? "Gastas " : "Gastas "}
                <b style={{ fontFamily: "var(--mono)", color: diff > 0 ? "var(--red)" : "var(--pine)" }}>
                  {diff > 0 ? "+" : "−"}{Math.abs(pct).toFixed(0)}%
                </b>{" "}
                {diff > 0 ? "más" : "menos"} que tu media {prevKeys.length === 1 ? "del mes anterior" : `de los ${prevKeys.length} meses anteriores`} ({eur(avg)} €).
              </>
            )}
          </p>

          {movers.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <span className="cg-lab">Lo que más se mueve</span>
              {movers.map((c) => (
                <div key={c.id} className="cg-mover">
                  <span>{c.emoji}</span>
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                  <span className="cg-movdelta" style={{ color: c.delta > 0 ? "var(--red)" : "var(--pine)" }}>
                    {c.delta > 0 ? "▲" : "▼"} {eur(Math.abs(c.delta))} €
                  </span>
                </div>
              ))}
              <p className="cg-hint" style={{ margin: "8px 0 0" }}>Frente a tu media por mes en cada categoría.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── reparto 50/30/20 ── */
function Split503020({ income, expenses, catById }) {
  const sums = { necesidad: 0, deseo: 0, ahorro: 0 };
  for (const e of expenses) {
    const b = catById[e.categoryId]?.bucket || "deseo";
    sums[b] += e.amount;
  }
  const gastoReal = sums.necesidad + sums.deseo;
  const ahorro = income - gastoReal; // lo que no gastas es ahorro, incluidos los traspasos que anotes
  const rows = [
    { ...BUCKETS[0], value: sums.necesidad },
    { ...BUCKETS[1], value: sums.deseo },
    { ...BUCKETS[2], value: ahorro },
  ];

  if (income <= 0) {
    return (
      <div className="cg-card">
        <h2 className="cg-title">Reparto 50/30/20</h2>
        <p className="cg-empty">
          Apunta lo que has recibido este mes y verás cuánto va a necesidades, a caprichos y al ahorro.
        </p>
      </div>
    );
  }

  return (
    <div className="cg-card">
      <h2 className="cg-title">Reparto 50/30/20</h2>
      <div className="cg-split">
        {rows.map((r) => (
          <div key={r.id} className="cg-splitseg"
            style={{ width: `${Math.max((Math.max(r.value, 0) / income) * 100, 0)}%`, background: r.color }} />
        ))}
        {ahorro < 0 && <div className="cg-splitseg" style={{ flex: 1, background: "var(--red)" }} />}
        <div className="cg-splittick" style={{ left: "50%" }} />
        <div className="cg-splittick" style={{ left: "80%" }} />
      </div>
      <div className="cg-hint" style={{ marginTop: 6 }}>Las marcas señalan el 50% y el 80%: ahí deberían acabar los dos primeros tramos.</div>

      {rows.map((r) => {
        const pct = (r.value / income) * 100;
        const off = pct - r.target;
        return (
          <div key={r.id} className="cg-splitrow">
            <i className="cg-dot" style={{ background: r.value < 0 ? "var(--red)" : r.color }} />
            <span style={{ fontWeight: 500 }}>{r.label}</span>
            <span className="cg-splitnum">
              {eur(r.value)} € · <b>{pct.toFixed(0)}%</b>
              <em> / {r.target}%</em>
            </span>
            <span className="cg-splitoff" style={{ color: Math.abs(off) < 3 ? "var(--pine2)" : (r.id === "ahorro" ? (off < 0 ? "var(--red)" : "var(--pine)") : (off > 0 ? "var(--red)" : "var(--pine)")) }}>
              {Math.abs(off) < 3 ? "en objetivo" : `${off > 0 ? "+" : "−"}${Math.abs(off).toFixed(0)} pt`}
            </span>
          </div>
        );
      })}
      {sums.ahorro > 0 && ahorro > 0 && (
        <p className="cg-hint" style={{ margin: "10px 0 0" }}>
          Del ahorro, {eur(sums.ahorro)} € los has apartado tú a mano; el resto es lo que te ha sobrado.
        </p>
      )}
      {ahorro < 0 && (
        <p className="cg-hint" style={{ margin: "10px 0 0", color: "var(--red)" }}>
          Este mes gastas más de lo que has recibido, así que no hay ahorro: te faltan {eur(-ahorro)} €.
        </p>
      )}
    </div>
  );
}

/* ── previsión del mes siguiente ── */
function Forecast({ monthKey, months, recurring, categories }) {
  const next = shiftMonth(monthKey, 1);
  const saveIds = new Set(categories.filter((c) => c.bucket === "ahorro").map((c) => c.id));
  const due = recurring.filter((r) => dueIn(r, next));

  const fixIn = due.filter((r) => r.kind === "ingreso").reduce((s, r) => s + r.amount, 0);
  const fixOut = due.filter((r) => r.kind === "gasto" && !saveIds.has(r.categoryId)).reduce((s, r) => s + r.amount, 0);
  const fixSave = due.filter((r) => r.kind === "gasto" && saveIds.has(r.categoryId)).reduce((s, r) => s + r.amount, 0);

  /* meses ya cerrados, para la media del gasto que no es fijo */
  const hist = monthsBack(shiftMonth(monthKey, -1), 3).filter((k) => (months[k]?.expenses || []).length);
  const avgOf = (fn) => hist.reduce((s, k) => s + fn(months[k]), 0) / hist.length;
  const varAvg = hist.length ? avgOf((m) => m.expenses.filter((e) => !e.fixed && !saveIds.has(e.categoryId)).reduce((t, e) => t + e.amount, 0)) : null;
  const incAvg = hist.length ? avgOf((m) => (m.incomes || []).reduce((t, i) => t + i.amount, 0)) : null;

  const income = fixIn > 0 ? fixIn : incAvg || 0;
  const variable = varAvg || 0;
  const left = income - fixOut - variable - fixSave;

  if (!hist.length && !due.length) {
    return (
      <div className="cg-card">
        <h2 className="cg-title">Previsión de {monthLabel(next).toLowerCase()}</h2>
        <p className="cg-empty">
          Con un mes cerrado o algún fijo dado de alta ya puedo estimarte el mes que viene.
        </p>
      </div>
    );
  }

  const rows = [
    { label: "Ingresos previstos", value: income, sign: 1,
      note: fixIn > 0 ? "de tus ingresos fijos" : `media de ${hist.length} ${hist.length === 1 ? "mes" : "meses"}` },
    { label: "Gastos fijos", value: fixOut, sign: -1,
      note: due.filter((r) => r.kind === "gasto" && !saveIds.has(r.categoryId)).length + " de alta ese mes" },
    { label: "Gasto variable", value: variable, sign: -1,
      note: hist.length ? `media de ${hist.length} ${hist.length === 1 ? "mes" : "meses"}` : "sin historial aún" },
  ];
  if (fixSave > 0) rows.push({ label: "Ahorro fijo", value: fixSave, sign: -1, note: "apartado automático" });

  return (
    <div className="cg-card">
      <h2 className="cg-title">Previsión de {monthLabel(next).toLowerCase()}</h2>

      {rows.map((r) => (
        <div key={r.label} className="cg-splitrow">
          <span style={{ fontWeight: 500 }}>{r.label}</span>
          <span className="cg-meta" style={{ marginLeft: 2 }}>{r.note}</span>
          <span className="cg-splitnum" style={{ color: r.sign < 0 ? "var(--muted)" : "var(--pine)" }}>
            {r.sign < 0 ? "−" : "+"}{eur(r.value)} €
          </span>
        </div>
      ))}

      <div className="cg-fcast" style={{ background: left < 0 ? "#F7E9E6" : "#EAF0E8" }}>
        <span className="cg-eyebrow">{left < 0 ? "Te faltarían" : "Te sobrarían"}</span>
        <b style={{ color: left < 0 ? "var(--red)" : "var(--pine)" }}>{eur(Math.abs(left))} €</b>
      </div>

      {due.filter((r) => r.kind === "gasto" && (r.every || 1) > 1).map((r) => (
        <p key={r.id} className="cg-hint" style={{ margin: "8px 0 0" }}>
          Ojo: ese mes toca <b>{r.name}</b> ({freqLabel(r)}), {eur(r.amount)} €.
        </p>
      ))}
      <p className="cg-hint" style={{ margin: "8px 0 0" }}>
        El gasto variable es la media de lo que gastas sin contar fijos ni ahorro. Cuantos más meses lleves, mejor afina.
      </p>
    </div>
  );
}

/* ── anota solos los fijos que ya han vencido, incluidos meses sin abrir la app ── */
function autoApplyAll(d) {
  if (!d?.recurring?.length) return d;
  const hoy = todayISO();
  const nowKey = monthKeyOf(new Date());
  const limite = shiftMonth(nowKey, -11); // no rebusca más de un año atrás
  const months = { ...d.months };
  let changed = false;

  for (const r of d.recurring) {
    if (r.active === false || r.auto === false) continue;
    let k = r.since > limite ? r.since : limite;
    for (let i = 0; i < 24 && k <= nowKey; i++, k = shiftMonth(k, 1)) {
      if (!dueIn(r, k)) continue;
      const cur = months[k] || emptyMonth();
      if ((cur.applied || {})[r.id]) continue;
      const day = String(Math.min(r.day, daysIn(k))).padStart(2, "0");
      const date = `${k}-${day}`;
      if (date > hoy) continue; // ese día aún no ha llegado
      if (r.kind === "ingreso") {
        const inc = { id: uid(), label: r.name, amount: r.amount, date, fixed: true };
        months[k] = { ...cur, incomes: [...cur.incomes, inc], applied: { ...(cur.applied || {}), [r.id]: inc.id } };
      } else {
        const exp = { id: uid(), name: r.name, amount: r.amount, categoryId: r.categoryId, date, time: null, fixed: true };
        months[k] = { ...cur, expenses: [...cur.expenses, exp], applied: { ...(cur.applied || {}), [r.id]: exp.id } };
      }
      changed = true;
    }
  }
  return changed ? { ...d, months } : d;
}

/* ── pantalla de bloqueo ── */
function LockScreen({ onUnlock, onBio, onWipe }) {
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
      <style>{CSS}</style>
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

/* ── activar, cambiar o quitar la protección ── */
function SecuritySheet({ mode, onEnable, onDisable, onBackup, onClose }) {
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

/* ── migración a las categorías nuevas, conservando los datos ── */
function migrate(d) {
  const v = d.version || 1;
  if (v >= 8) return d;

  let out = d;
  if (v < 2) {
    const remap = (id) => ID_MIGRATION[id] || id;
    const byId = {};
    for (const c of out.categories) {
      const id = remap(c.id);
      const def = DEFAULT_CATEGORIES.find((x) => x.id === id);
      byId[id] = def && ID_MIGRATION[c.id] ? { ...def, budget: c.budget } : { ...c, id };
    }
    const categories = [
      ...DEFAULT_CATEGORIES.map((def) => byId[def.id] || def),
      ...Object.values(byId).filter((c) => !DEFAULT_CATEGORIES.some((def) => def.id === c.id)),
    ];
    const months = {};
    for (const [k, m] of Object.entries(out.months || {})) {
      months[k] = { ...m, expenses: (m.expenses || []).map((e) => ({ ...e, categoryId: remap(e.categoryId) })) };
    }
    const learned = {};
    for (const [tok, map] of Object.entries(out.learned || {})) {
      const next = {};
      for (const [id, n] of Object.entries(map)) {
        const to = remap(id);
        next[to] = (next[to] || 0) + n;
      }
      learned[tok] = next;
    }
    out = { ...out, categories, months, learned };
  }

  // v4: reparto 50/30/20 en cada categoría, lista de fijos y registro de aplicados
  //      (quien ya venga de v4 pasa por aquí sin cambios y solo recibe el paso v5)
  const categories = out.categories.map((c) => {
    if (c.bucket) return c;
    const def = DEFAULT_CATEGORIES.find((x) => x.id === c.id);
    return { ...c, bucket: def ? def.bucket : "deseo" };
  });
  const months = {};
  for (const [k, m] of Object.entries(out.months || {})) {
    // v8: los ingresos llevan fecha; los antiguos se colocan el día 1
    months[k] = {
      incomes: (m.incomes || []).map((i) => (i.date ? i : { ...i, date: `${k}-01` })),
      expenses: m.expenses || [],
      applied: m.applied || {},
    };
  }
  // v5: categoría de ahorro, para poder apartar dinero sin que cuente como gasto
  const conAhorro = categories.some((c) => c.bucket === "ahorro")
    ? categories
    : [...categories, DEFAULT_CATEGORIES.find((c) => c.id === "ahorro")];

  // v6: cada fijo lleva su periodicidad; los que ya existían eran mensuales
  // v7: y se anotan solos salvo que digas lo contrario
  const recurring = (out.recurring || []).map((r) => ({ ...r, every: r.every || 1, auto: r.auto !== false }));

  return { version: 8, categories: conAhorro, months, learned: out.learned || {}, recurring };
}

/* ── app ── */
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

  useEffect(() => {
    (async () => {
      const raw = await store.get(STORE_KEY);
      let parsed = null;
      if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
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
  const left = income - used;

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

  /* ── fijos ── */
  const recurring = data?.recurring || [];
  const pendingFixed = recurring.filter((r) => dueIn(r, monthKey) && !(month.applied || {})[r.id]);

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
    const filename = `gastos-copia-${todayISO()}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    let hecho = false;
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], filename, { type: "application/json" });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Copia de Cosecha" });
          hecho = true;
        } catch (e) {
          if (e && e.name === "AbortError") return; // ha cancelado, no insistimos con la descarga
          // si falla por otro motivo, seguimos con la descarga de siempre
        }
      }
    }
    if (!hecho) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      hecho = true;
    }
    if (hecho) setData((d) => ({ ...d, lastBackupAt: todayISO() }));
  };

  const compartirApp = async () => {
    const url = window.location.origin + window.location.pathname;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Cosecha", text: "Prueba Cosecha, mi app para llevar los gastos:", url });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      window.alert("Enlace copiado.");
    } catch (e) {
      window.prompt("Copia este enlace:", url);
    }
  };

  const fileRef = useRef(null);
  const restore = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || !Array.isArray(parsed.categories) || typeof parsed.months !== "object") {
          throw new Error("formato");
        }
        const n = Object.values(parsed.months).reduce((s, m) => s + (m.expenses || []).length, 0);
        const meses = Object.keys(parsed.months).length;
        if (!window.confirm(`La copia tiene ${n} gastos en ${meses} ${meses === 1 ? "mes" : "meses"}. Sustituye todo lo que hay ahora. ¿Continuar?`)) return;
        setData(autoApplyAll(migrate(parsed)));
        setMonthKey(monthKeyOf(new Date()));
        setTab("mes");
      } catch (e) {
        window.alert("Ese archivo no es una copia de la app. Busca uno que empiece por «gastos-copia».");
      }
    };
    reader.readAsText(file);
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

  /* barra del mes */
  const base = Math.max(income, used) || 1;
  const isCurrentMonth = monthKey === monthKeyOf(new Date());
  const daysInMonth = new Date(Number(monthKey.split("-")[0]), Number(monthKey.split("-")[1]), 0).getDate();

  /* mensaje de coach: proyección de cierre de este mes frente al gasto real del anterior */
  const prevMonthKey = shiftMonth(monthKey, -1);
  const prevSpent = useMemo(() => {
    const pm = data?.months?.[prevMonthKey];
    if (!pm) return 0;
    return (pm.expenses || [])
      .filter((e) => catById[e.categoryId]?.bucket !== "ahorro")
      .reduce((s, e) => s + e.amount, 0);
  }, [data, prevMonthKey, catById]);
  const coachMsg = useMemo(() => {
    if (!modoCoach || !isCurrentMonth || prevSpent <= 0 || spent <= 0) return null;
    const diaHoy = new Date().getDate();
    const proyeccion = (spent / diaHoy) * daysInMonth;
    const pct = ((prevSpent - proyeccion) / prevSpent) * 100;
    if (Math.abs(pct) < 3) return null; // diferencia poco significativa, mejor no decir nada
    return pct > 0
      ? `${Math.round(pct)}% mejor que ${monthLabel(prevMonthKey).toLowerCase()}, sigue así`
      : `${Math.round(Math.abs(pct))}% por encima de ${monthLabel(prevMonthKey).toLowerCase()}, aún puedes ajustar`;
  }, [modoCoach, isCurrentMonth, prevSpent, spent, daysInMonth, prevMonthKey]);

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
  const paceLeft = isCurrentMonth && income > 0
    ? Math.min(100, ((new Date().getDate() / daysInMonth) * income / base) * 100)
    : null;

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
  const movCount = month.expenses.length + month.incomes.length;
  const visibleGrouped = useMemo(() => {
    if (showAllMov) return grouped;
    let restante = 3;
    const out = [];
    for (const [date, items] of grouped) {
      if (restante <= 0) break;
      out.push([date, items.slice(0, restante)]);
      restante -= Math.min(restante, items.length);
    }
    return out;
  }, [grouped, showAllMov]);

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
      <div className="cg-root"><style>{CSS}</style>
        <div className="cg-wrap"><div className="cg-card"><p className="cg-empty">Cargando tus datos…</p></div></div>
      </div>
    );
  }

  return (
    <div className="cg-root">
      <style>{CSS}</style>
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

        {/* héroe: disponible + barra segmentada del mes */}
        <div className={`cg-hero ${left < 0 && !oculto ? "over" : ""}`}>
          <button className="cg-eye" onClick={toggleOculto} aria-pressed={oculto}
            aria-label={oculto ? "Mostrar el disponible" : "Ocultar el disponible"}
            title={oculto ? "Mostrar importes" : "Ocultar importes"}>
            <EyeIcon off={oculto} />
          </button>

          <div className="cg-eyebrow">{oculto ? "Disponible" : left < 0 ? "Te has pasado" : "Disponible"}</div>
          <div className="cg-big">
            {oculto ? <span className="cg-hidden">••••</span> : eur(Math.abs(left))}<small>€</small>
          </div>
          <div className="cg-sub">
            {oculto
              ? "importes ocultos"
              : `${eur(income)} recibido · ${eur(spent)} gastado${saved > 0 ? ` · ${eur(saved)} apartado` : ""}`}
          </div>
          {!oculto && coachMsg && (
            <div className="cg-coachmsg">{coachMsg}</div>
          )}

          <div className="cg-bar" role="img"
            aria-label={`Gastado ${eur(spent)} euros de ${eur(income)} recibidos`}>
            {catTotals.map((c) => (
              <div key={c.id} className="cg-seg" style={{ width: `${(c.total / base) * 100}%`, background: c.color }} />
            ))}
            {paceLeft !== null && (
              <div className="cg-tick" style={{ left: `${paceLeft}%` }}><span>hoy</span></div>
            )}
          </div>

          {catTotals.length > 0 ? (
            <div className="cg-legend">
              {catTotals.slice(0, 4).map((c) => (
                <div key={c.id}><i className="cg-dot" style={{ background: c.color }} />{c.name}{oculto ? "" : ` ${eur(c.total)}`}</div>
              ))}
              {catTotals.length > 4 && <div>+{catTotals.length - 4} más</div>}
            </div>
          ) : (
            <div className="cg-legend"><div>La barra se llena con cada gasto que anotes.</div></div>
          )}
        </div>

        <div className="cg-tabs" role="tablist">
          {[["mes", "Mes"], ["resumen", "Resumen"], ["fijos", "Fijos"], ["ajustes", "Ajustes"]].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k}
              className={`cg-tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>

        {tab === "mes" && (
          <>
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
                  {visibleGrouped.map(([date, items]) => (
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
                  {!showAllMov && movCount > 3 && (
                    <button className="cg-ghost" style={{ marginTop: 8, width: "100%" }} onClick={() => setShowAllMov(true)}>
                      Ver todas ({movCount})
                    </button>
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
              {saved > 0 && (
                <p className="cg-hint" style={{ marginTop: 10, marginBottom: 0 }}>
                  Más {eur(saved)} € apartados al ahorro, que también salen del disponible pero no cuentan como gasto.
                </p>
              )}
              {isCurrentMonth && spent > 0 && (
                <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 12, marginBottom: 0 }}>
                  Media de {eur(spent / new Date().getDate())} € al día. A este ritmo cerrarás el mes en{" "}
                  <b style={{ fontFamily: "var(--mono)" }}>{eur((spent / new Date().getDate()) * daysInMonth)} €</b>.
                </p>
              )}
            </div>

            {savingCats.length > 0 && (
              <div className="cg-card">
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <h2 className="cg-title">Apartado al ahorro</h2>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 15 }}>{eur(saved)} €</span>
                </div>
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
                  {byCategory.map((c) => {
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
                  })}
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
              {recurring.length === 0 ? (
                <p className="cg-empty">Sin fijos todavía.<br />Empieza por el alquiler y la nómina, que son los seguros.</p>
              ) : (
                recurring.map((r) => {
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
                })
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

        {tab === "ajustes" && (
          <>
            <div className="cg-card">
              <h2 className="cg-title">Modo</h2>
              <p className="cg-hint">
                Coach muestra mensajes de ánimo y comparaciones con meses anteriores. Gastos se queda solo con los números.
              </p>
              <div className="cg-toggle">
                <button className={modoCoach ? "on" : ""} onClick={() => setModoCoach(true)}>Coach</button>
                <button className={!modoCoach ? "on" : ""} onClick={() => setModoCoach(false)}>Gastos</button>
              </div>
              <div style={{ marginTop: 14 }}>
                <button className="cg-ghost" onClick={compartirApp}>Compartir esta app</button>
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
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <h2 className="cg-title">Límites Categorías</h2>
                <button className="cg-ghost" onClick={() => setSheet({ type: "cat", payload: null })}>+ Nueva</button>
              </div>
              {[...categories].sort((a, b) => a.name.localeCompare(b.name, "es")).map((c) => (
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
              ))}
            </div>

            <div className="cg-card">
              <h2 className="cg-title">Detección automática</h2>
              <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
                Al escribir el concepto se propone una categoría. Si la corriges, la app aprende esa palabra
                y la próxima vez acierta. Ha aprendido {Object.keys(data.learned).length} palabras.
              </p>
              <button className="cg-ghost danger" onClick={wipe}>Borrar todos los datos</button>
            </div>
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
