/* ── constantes: categorías por defecto, reparto 50/30/20, diccionario de
   detección automática, iconos sugeridos ── */

export const STORE_KEY = "cuaderno-gastos-v1";
export const ONBOARD_KEY = "cosecha-onboarding-v1"; // aparte de STORE_KEY: no es dato financiero, no se cifra
// ⚠️ Sustituir por la URL real una vez desplegado el Worker (ver WORKER.md). Hasta entonces,
// el envío de la señal anónima se salta solo, sin dar error.
export const WORKER_URL = "https://REEMPLAZA-ESTO.workers.dev";

export const SWATCHES = [
  "#1E4E45", "#2C6B5E", "#6F9C6B", "#9DB05A",
  "#4A6B4E", "#3F7C8C", "#5B6B8C", "#6B7B8C",
  "#7A5C86", "#A8628A", "#D99A2B", "#C2703A",
  "#A63A2E", "#8A5A44", "#B08A5A", "#8A7A4E",
  "#2F7D6B",
];

/* reparto 50/30/20: cada categoría es necesidad, deseo o ahorro */
export const APP_VERSION = "2.2.1";

export const BUCKETS = [
  { id: "necesidad", label: "Gasto", target: 50, color: "#1E4E45" },
  { id: "deseo", label: "Deseo", target: 30, color: "#D99A2B" },
  { id: "ahorro", label: "Ahorro", target: 20, color: "#6F9C6B" },
];

/* iconos sugeridos según el nombre que escribas */
export const EMOJI_HINTS = [
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

export const EMOJI_ALL = [
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


export const DEFAULT_CATEGORIES = [
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
export const ID_MIGRATION = { resto: "comerfuera", suministros: "facturas" };

/* ── diccionario de detección (palabra → categoría) ── */
export const DICT = {
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


export const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "un", "una", "en", "para", "con", "por", "al", "y", "o", "mi", "mis", "que", "es"]);

export const FREQS = [
  { every: 1, label: "Cada mes", short: "cada mes" },
  { every: 2, label: "Cada 2 meses", short: "cada 2 meses" },
  { every: 3, label: "Trimestral", short: "trimestral" },
  { every: 6, label: "Semestral", short: "semestral" },
  { every: 12, label: "Anual", short: "anual" },
];
