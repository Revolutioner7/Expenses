import { todayISO } from "./utils.js";

/* crea la copia de seguridad: intenta la hoja de compartir nativa primero (deja elegir
   carpeta, incluido Google Drive o iCloud Drive si están instalados); si no está disponible,
   cae al descargable de toda la vida. Devuelve true si se hizo de una forma u otra, false
   si la persona canceló la hoja de compartir. */
export async function crearCopia(data) {
  const filename = `gastos-copia-${todayISO()}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
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
  const url = window.location.origin + window.location.pathname;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Cosecha", text: "Prueba Cosecha, mi app para llevar los gastos:", url });
      return { estado: "compartido", url };
    } catch (e) {
      if (e && e.name === "AbortError") return { estado: "cancelado", url };
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return { estado: "copiado", url };
  } catch (e) {
    return { estado: "manual", url };
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
        resolve(parsed);
      } catch (e) {
        reject(new Error("Ese archivo no es una copia de la app. Busca uno que empiece por «gastos-copia»."));
      }
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsText(file);
  });
}
