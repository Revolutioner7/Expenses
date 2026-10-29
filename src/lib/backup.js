import { todayISO } from "./utils.js";
import { APP_NAME, PLAY_STORE_URL, WEB_URL } from "../constants.js";
import { esNativo, compartirArchivoNativo, compartirTextoNativo } from "./nativo.js";

/* crea la copia de seguridad: intenta la hoja de compartir nativa primero (deja elegir
   carpeta, incluido Google Drive o iCloud Drive si están instalados); si no está disponible,
   cae al descargable de toda la vida. Devuelve true si se hizo de una forma u otra, false
   si la persona canceló la hoja de compartir. */
export async function crearCopia(data) {
  const filename = `gastos-copia-${todayISO()}.json`;
  // la sesión de la cuenta es de este dispositivo y lleva su llave: nunca va en la copia
  const { _cuenta, ...sinSesion } = data || {};
  const texto = JSON.stringify(sinSesion, null, 2);
  if (esNativo()) return compartirArchivoNativo(filename, texto); // app de iPhone: hoja de compartir del sistema
  const blob = new Blob([texto], { type: "application/json" });
  let hecho = false;
  if (navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: "application/json" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        hecho = true;
      } catch (e) {
        if (e && e.name === "AbortError") return false; // ha cancelado, no insistimos con la descarga
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
  return hecho;
}

/* comparte el enlace de la app. Devuelve qué pasó, para que quien llama decida el aviso:
   "compartido" | "cancelado" | "copiado" (al portapapeles) | "manual" (ni share ni portapapeles
   disponibles — quien llama debe mostrar la url para copiarla a mano) */
export async function compartirApp() {
  const esAndroid = /Android/.test(window.navigator.userAgent || "");
  const playListo = !PLAY_STORE_URL.includes("REEMPLAZA-ESTO");
  // dentro de la app de iPhone la dirección es interna (capacitor://), así que se comparte la web
  const url = (esAndroid && playListo) ? PLAY_STORE_URL : (esNativo() ? WEB_URL : (window.location.origin + window.location.pathname));
  const nombre = APP_NAME || "esta app";
  const texto = `¿Quieres tener tus gastos al día? Prueba ${nombre}: ${url}`;
  if (esNativo()) return { estado: await compartirTextoNativo(nombre, texto), url, texto };
  if (navigator.share) {
    try {
      // el enlace ya va dentro del texto: si además se pasa "url" aparte, iOS pega los dos y sale duplicado
      await navigator.share({ title: nombre, text: texto });
      return { estado: "compartido", url, texto };
    } catch (e) {
      if (e && e.name === "AbortError") return { estado: "cancelado", url, texto };
    }
  }
  try {
    await navigator.clipboard.writeText(texto);
    return { estado: "copiado", url, texto };
  } catch (e) {
    return { estado: "manual", url, texto };
  }
}

/* lee y valida un archivo de copia de seguridad; no toca el estado de React, solo
   devuelve los datos ya parseados o rechaza con un mensaje entendible para mostrar */
export function leerCopia(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error("Sin archivo.")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || !Array.isArray(parsed.categories) || typeof parsed.months !== "object") {
          throw new Error("formato");
        }
        delete parsed._cuenta; // por si alguien edita una copia a mano: la sesión nunca viene de un archivo
        resolve(parsed);
      } catch (e) {
        reject(new Error("Ese archivo no es una copia de la app. Busca uno que empiece por «gastos-copia»."));
      }
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsText(file);
  });
}
