# Handoff — Cosecha

Documento de traspaso completo. Sirve para retomar el proyecto dentro de seis meses, para
dárselo a otra persona, o para arrancar una conversación nueva con un asistente sin perder
contexto.

**Última actualización:** 31 de agosto de 2026
**Estado:** en producción, en uso por al menos 2 personas
**Versión de la app:** 2.3.0 · **Versión de datos:** 8 · **Versión de caché:** `cosecha-v8`

---

## 0. Cómo retomar el proyecto

**Este documento no basta por sí solo: no contiene el código.** Para continuar en otra
conversación hacen falta estos archivos:

| Archivo / carpeta | Para qué | Imprescindible |
|---|---|---|
| `HANDOFF.md` | este documento: contexto, decisiones, modelo de datos | sí |
| `src/` (15 archivos) | **la app entera**, dividida en módulos — ver §2 | sí, para tocar código |
| `package.json`, `vitest.config.js` | dependencias y comandos (`npm run build`, `npm test`) | sí, para tocar código |
| `tests/consolidada.test.jsx` | batería de pruebas real, con Vitest | sí, para tocar código |
| `index.html`, `sw.js`, `manifest.webmanifest`, iconos, fuentes | archivos ya listos para publicar tal cual | solo si no vas a compilar |
| `worker.js`, `wrangler.toml`, `WORKER.md` | el Worker de Cloudflare (contador anónimo), código listo, pendiente de desplegar | solo si se toca esa parte |

Frase para arrancar la conversación nueva:

> Retomo un proyecto en marcha. Te adjunto el handoff y la carpeta `src/` (código fuente
> dividido en módulos). Es una PWA de control de gastos llamada Cosecha, publicada en GitHub
> Pages, ya en uso por más de una persona. Lee el handoff antes de proponer nada, especialmente
> las reglas de oro de la §9 y los invariantes de la §7. Quiero [lo que sea].

Y lo que se espera de quien lo retome, porque es el método que ha funcionado hasta ahora:

1. **Un cambio, un `bundle.js`.** Se acumulan los cambios pequeños y se publican juntos — o,
   si está configurado GitHub Actions (§8), se compila y publica solo con subir el `src/` nuevo.
2. **Probar con Vitest antes de entregar** (§11 bis). `npm test` corre toda la batería con un
   solo comando. Nada se da por bueno por leerlo ni por compilar sin errores — compilar limpio
   no es lo mismo que comportarse igual.
3. **Nunca romper datos existentes**: subir `version` y añadir escalón a `migrate()` si cambia
   la forma de los datos.
4. Los datos son de personas reales que ya llevan meses anotando. No hay entorno de pruebas
   aparte del suyo.
5. **El entorno de trabajo se puede reiniciar sin avisar** (ya ha pasado una vez). Guarda
   cualquier archivo que no quieras volver a escribir en un sitio persistente, no solo en el
   directorio de trabajo — ver §17.

## 1. Qué es

App personal de control de gastos e ingresos mensuales para iPhone, con seguimiento de metas de
ahorro y deudas. Web app instalable (PWA), sin servidor propio para los datos, sin cuentas y sin
coste. Los datos viven en el dispositivo y no salen de él — con una única excepción consciente y
acotada, el contador anónimo (§7 ter).

| | |
|---|---|
| Nombre visible | **Cosecha** (antes "Cuaderno de gastos" — el cambio de nombre no tocó la URL) |
| Dirección pública | `https://revolutioner7.github.io/Expenses/` (ojo: **E** mayúscula) |
| Repositorio | `github.com/Revolutioner7/Expenses` (público) |
| Hosting | GitHub Pages, rama `main`, carpeta `/ (root)` |
| Instalada en | iPhone(s), vía Safari → Añadir a pantalla de inicio |
| Coste anual | 0 € (ver §14 bis si algún día se comercializa) |

### Principios de diseño (el "por qué" de todo lo demás)

1. **Los datos no salen del dispositivo.** Ninguna funcionalidad justifica romper esto sin una
   decisión explícita. El contador anónimo (§7 ter) es la única excepción, y es deliberadamente
   mínima: un id aleatorio y "sigo aquí", nunca datos financieros.
2. **Anotar un gasto tiene que costar menos de 10 segundos**, o se abandona la app en una semana.
3. **Nada se anota en silencio salvo los fijos**, y los fijos son desactivables uno a uno.
4. **Gasto y ahorro no se mezclan nunca.** Apartar dinero no es gastarlo.
5. **Coste 0 €.** Descarta por definición APIs bancarias de pago, licencias y servidores — salvo
   excepciones acotadas y explícitas (el Worker cuesta 0 € en su plan gratuito).
6. **Una categoría de ahorro con seguimiento de verdad vive en Metas, no suelta.** El selector de
   categorías normal ya no ofrece el bucket "ahorro" salvo para editar una que ya lo era.

---

## 2. Arquitectura

Desde el refactor de finales de agosto, el código **ya no es un único archivo**. Sigue sin
backend propio para los datos, sin más dependencia en tiempo de ejecución que React.

```
src/
  main.jsx              ← punto de entrada: registra el service worker, pide persistencia,
                           monta <App />
  App.jsx                ← el componente principal: estado, mutaciones, pestañas, modales
  constants.js            ← categorías por defecto, buckets, diccionario de detección, claves
  styles.css               ← todo el CSS (antes vivía como plantilla de JS inyectada, ya no)
  lib/
    crypto.js               ← cifrado: PBKDF2, AES-GCM, Face ID/PRF
    storage.js               ← almacenamiento: window.storage → localStorage → memoria
    utils.js                  ← fechas, dinero, búsqueda difusa, detección de categoría
    data.js                    ← autoApplyAll, migrate
    backup.js                   ← crear copia, compartir la app, leer una copia (sin tocar React)
  components/
    ui.jsx                    ← EyeIcon, ExpandableList, CoachBox, AvisoActualizacionCard, Sheet
    editors.jsx                ← CategoryEditor, MetaEditor, ExpenseEditor, IncomeEditor, FixedEditor
    mes.jsx                     ← AddExpense, IncomeCard, Donut, CategoryDetail
    resumen.jsx                  ← MonthCompare, Split503020, Forecast
    onboarding.jsx                ← detección de instalación + las dos pantallas de primer arranque
    lock.jsx                       ← LockScreen, SecuritySheet
   │
   │  npm run build  (esbuild --bundle --minify, con React empaquetado dentro)
   ▼
bundle.js
```

**Por qué se dividió:** un amigo del usuario, arquitecto de sistemas, señaló que el proyecto no
tenía ni `package.json` ni control de dependencias — todo vivía en el entorno de trabajo del
asistente y en el propio handoff, no en el repositorio. Con pocos usuarios y sin comercializar
todavía, se decidió que era el momento de hacerlo bien, **sin reescribir la lógica** — es
exactamente el mismo comportamiento, movido de sitio y con andamiaje real alrededor. Verificado
con la misma batería de pruebas antes y después del movimiento (§11 bis).

### Archivos publicados

| Archivo | Qué es |
|---|---|
| `index.html` | Shell: metas de iOS, CSP, enlaza `styles.css`, precarga de tipografías |
| `bundle.js` | La app entera compilada, con React dentro |
| `styles.css` | Todo el CSS, como hoja de estilos real (ya no inyectado por JS) |
| `manifest.webmanifest` | Nombre, colores, iconos, `display: standalone` |
| `sw.js` | Service worker: precaché e offline |
| `font-bricolage.woff2`, `font-karla.woff2`, `font-mono-400/500/600.woff2` | Tipografías |
| `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png` | Iconos |

### Archivos de desarrollo (no se publican)

`src/`, `tests/`, `package.json`, `package-lock.json`, `vitest.config.js`, `node_modules/`,
`.github/`, `worker.js`, `wrangler.toml`, `WORKER.md`, `HANDOFF.md`. El flujo de GitHub Actions
(§8) ya sabe excluirlos solo al publicar.

---

## 2 bis. Lenguaje visual

El CSS vive en `styles.css`, un archivo real — antes era una plantilla de JS inyectada en un
`<style>` en tres sitios distintos (`App`, `LockScreen`, `Onboarding`); ahora se enlaza una vez
desde `index.html` y ya está. **Sin Tailwind ni librerías de componentes**, clases con prefijo
`cg-` para no chocar con nada.

```
--ink    #101A18   fondo del recuadro principal, texto
--pine   #1E4E45   primario, botones de aceptar, cifras positivas
--pine2  #2C6B5E   estados hover
--saffron #D99A2B  avisos, tramo "deseo", objetivos de ahorro
--red    #A63A2E   sobregasto, acciones destructivas
--bg     #E4E9E2   fondo de la página (verde grisáceo)
--card   #FBFCF9   tarjetas
--line   #CCD6CE   bordes de 1px
--muted  #5F6F68   texto secundario
```

Tipografías: **Bricolage Grotesque** para titulares, **Karla** para texto, **IBM Plex Mono** para
todas las cifras y las etiquetas en mayúsculas (`.cg-eyebrow`, `.cg-lab`, `.cg-meta`).

Convenciones que conviene respetar al añadir pantallas:

- Ancho máximo 560 px, una columna, pensado primero para móvil.
- Tarjetas `.cg-card` con borde de 1px y radio 14px. **Sin sombras pesadas.**
- Etiquetas de campo `.cg-lab`: mono, 10px, mayúsculas, letra espaciada.
- Modales con `<Sheet>`: suben desde abajo en móvil, centrados en pantalla ancha.
- `@media (prefers-reduced-motion)` desactiva todas las animaciones.
- El "disponible" grande y la caja de coach (`.cg-coachbox`) son un cabecero que se ve en
  **todas las pestañas**, no solo en Mes — es a propósito, desde el rediseño de finales de agosto.
- **Convención de color de botones, fijada como regla general del sistema (no solo de una
  pantalla):** verde (`.cg-btn`) = acepta y aplica algo ya mismo (Crear meta, Guardar cambios,
  Guardar ajuste, Poner X meses). Línea (`.cg-ghost`) = lleva a otra pantalla o a explorar antes
  de decidir (Ver esta opción, Ver más, Cancelar). El color dice el *tipo* de acción, nunca cuál
  de dos caminos válidos se recomienda por encima del otro.
- La barra segmentada del mes por categoría, que antes era el elemento distintivo, **se quitó**
  en el rediseño — Resumen ya cubre ese desglose, y duplicarlo no aportaba.

## 2 ter. Mapa de módulos

Ya no hay un índice por orden de aparición en un único archivo — la ubicación **es** el índice:

| Dónde | Qué hay |
|---|---|
| `lib/crypto.js` | `store` no — eso es `storage.js`. Cifrado: `kekFromPass`, `kekFromBytes`, `newDEK`, `wrapDEK`, `unwrapDEK`, `sealData`, `openData`, `esSobre`, `tieneBio`, `bioDisponible`, `prfCrear`, `prfObtener` |
| `lib/storage.js` | `store` (almacenamiento con reserva en memoria), `pedirPersistencia` |
| `constants.js` | `BUCKETS`, `DEFAULT_CATEGORIES`, `ID_MIGRATION`, `DICT`, `STOPWORDS`, `EMOJI_HINTS`, `EMOJI_ALL`, `FREQS`, `STORE_KEY`, `ONBOARD_KEY`, `WORKER_URL`, `APP_VERSION` |
| `lib/utils.js` | `norm`, `tokenize`, `levenshtein`, `fuzzyMatch`, `detectCategory`, `learnFrom`, `suggestEmojis`, `eur`, `parseAmount`, fechas (`monthKeyOf`, `monthLabel`, `shiftMonth`, `daysIn`, `sortKey`, `stampLabel`, `monthsBack`…), periodicidad de fijos (`dueIn`, `nextDue`, `freqLabel`) |
| `lib/data.js` | `autoApplyAll`, `migrate` |
| `lib/backup.js` | `crearCopia`, `compartirApp`, `leerCopia` — sin tocar estado de React, listo para añadir Drive/iCloud como función nueva el día que toque |
| `components/ui.jsx` | `EyeIcon`, `ExpandableList` (patrón ver más/menos), `CoachBox`, `AvisoActualizacionCard`, `Sheet` |
| `components/editors.jsx` | `CategoryEditor`, `MetaEditor`, `ExpenseEditor`, `IncomeEditor`, `FixedEditor` |
| `components/mes.jsx` | `AddExpense`, `IncomeCard`, `Donut`, `CategoryDetail` |
| `components/resumen.jsx` | `MonthCompare`, `Split503020`, `Forecast` |
| `components/onboarding.jsx` | `isAppInstalled`, `Onboarding` |
| `components/lock.jsx` | `LockScreen`, `SecuritySheet` |
| `App.jsx` | todo el estado y las mutaciones: `addExpense`, `updateExpense`, `deleteExpense`, `addIncome`, `updateIncome`, `saveCategory`, `deleteCategory`, `saveMeta`, `deleteMeta`, `saveFixed`, `deleteFixed`, `applyFixed`, `skipFixed`, `backup`, `restore`, `finishOnboarding`, `cerrarAvisoActualizacion`, `unlock`, `unlockBio`, `enableLock`, `disableLock`, `toggleOculto`… |

## 3. Modelo de datos

Todo en **una sola clave** de almacenamiento para los datos financieros, más una clave aparte
para metadatos de instalación que no son financieros (ver más abajo).

**Clave de datos:** `cuaderno-gastos-v1` ⚠️ El nombre se quedó así desde el primer día y no se ha
cambiado nunca a propósito: cambiarlo haría que la app no encontrara los datos existentes.
El número de versión real está **dentro**, en el campo `version`.

```js
{
  version: 8,
  hideBalance: false,
  lastBackupAt: "2026-08-27",       // para el aviso periódico de copia de seguridad
  modoCoach: true,                   // switch Coach/Gastos en Ajustes
  diaCobro: null,                    // 1-28, o null: día de cobro para la vista por ciclo de nómina
  categories: [{
    id: "super", name: "Supermercado", emoji: "🛒", color: "#2C6B5E",
    budget: null, bucket: "necesidad"   // "necesidad" | "deseo" | "ahorro"
  }],
  months: {
    "2026-08": {
      incomes:  [{ id, label, amount, date, fixed? }],
      expenses: [{ id, name, amount, categoryId, date, time, fixed? }],
      applied:  { "<idDelFijo>": "<idGenerado>" | "skip" },
      ajuste:   { valor: -25, nota: "Efectivo sin anotar" } | null   // ajuste de saldo, por mes
    }
  },
  learned: { "mercadona": { "super": 3 } },
  recurring: [{ id, kind: "gasto"|"ingreso", name, amount, categoryId, day, every, since, auto, active }],
  metas: [{
    id, tipo: "objetivo" | "deuda", name, total,
    categoryId,           // categoría dedicada, creada junto con la meta — nunca compartida
    plazoMeses,           // null hasta que se fija
    creadoEl,
    recortesPendientes: [  // foto fija tomada al aceptar una sugerencia de reducción; no se
      { categoryId, nombre, emoji, monto, hecho: false }   // recalcula sola si cambian los gastos
    ]
  }]
}
```

**Clave de onboarding, aparte:** `cosecha-onboarding-v1` — no cifrada, no es dato financiero.

```js
{ done: true, installId: "ab12cd34ef56gh78", email: "opcional@ejemplo.com" | null,
  avisoActualizacionVisto: true }
```

`installId` es el id aleatorio que manda la señal anónima al Worker (§7 ter). Quien ya tenía
datos antes de que existiera esta clave la recibe en silencio al arrancar, sin que se le pida
nada — solo ve la tarjeta de aviso no bloqueante una vez (§4, pestaña Mes).

### Historial de versiones y migraciones

`migrate()` es acumulativa e **idempotente**. Un dataset v1 pasa por todos los escalones.

| v | Cambio | Migración |
|---|---|---|
| 1 | Versión inicial, 10 categorías | — |
| 2 | Juego de 16 categorías | `resto`→`comerfuera`, `suministros`→`facturas` |
| 3 | Hora en los gastos | Los antiguos quedan sin hora |
| 4 | Reparto 50/30/20, fijos, `applied` | Asigna `bucket` por defecto según la categoría |
| 5 | Categoría de ahorro | Añade 🐷 Ahorro si no existe ninguna con `bucket: "ahorro"` |
| 6 | Periodicidad de fijos | `every: 1` a los existentes |
| 7 | Fijos automáticos | `auto: true` a los existentes |
| 8 | Fecha en los ingresos | Los antiguos se colocan el día 1 del mes |

**Nota:** `metas` se añadió como campo nuevo (`out.metas || []`) sin subir la versión a 9, porque
es aditivo — un dataset viejo sin ese campo sigue abriendo igual, solo con la lista vacía.

---

## 4. Funcionalidades por pestaña

### Cabecera (recuadro negro, visible en todas las pestañas)

- **Disponible** = `recibido − gastado − apartado + ajuste`. En rojo con «Te has pasado» si es
  negativo. El `ajuste` es el Ajuste de saldo del mes (Ajustes → Ajuste de saldo): corrige solo
  este número final, nunca gastado/ahorrado/categorías ni ninguna media histórica.
- **Vista por ciclo de nómina**: si hay un día de cobro puesto (Ajustes → Modo), y se está viendo
  el mes actual, el disponible (y su desglose de recibido/gastado/ahorrado) se recalcula sobre la
  ventana del ciclo (p. ej. 27 jul – 26 ago) en vez del mes natural — con una etiqueta "· ciclo
  27 jul–26 ago" junto al rótulo. **Movimientos sigue mostrando todo el mes de calendario, sin
  filtrar por ciclo** — a propósito, para no esconder gastos ya anotados. Fijos y Previsión no se
  tocan en ningún caso.
- **Botón del ojo**: oculta el número y las cifras de detalle. Se guarda en `hideBalance`.
- **Caja de coach** (`.cg-coachbox`), debajo del disponible: mensaje de ánimo, con este orden de
  prioridad (la primera candidata que sea cierta gana):
  1. Una meta (objetivo o deuda) conseguida o superada (≥100%) — no depende de nada más.
  2. Progreso real en una meta de ahorro sin completar (>0% y <100%) — tampoco depende del
     historial del mes anterior.
  3. Dinero apartado al ahorro este mes, sin meta con nombre asociada — genérico, mismo motivo.
  4. Proyección de cierre de este mes mejor que el gasto real del anterior — **requiere que el
     mes anterior tenga al menos 5 apuntes**, si no, se salta (evita el bug del 1703%, ver §11).
  5. Más disponible que el mes anterior, en el mismo día.
  6. Más ingresos que el mes anterior, en el mismo día.
  7. Ánimo neutro sin comparar cifras, si ninguna de las anteriores es cierta.
- Flechas de mes: navegan meses anteriores y posteriores sin límite.

### Mes

- **Aviso de actualización** (solo una vez, para quien ya tenía datos antes de una novedad) y
  **aviso de copia de seguridad** (cada ~21 días sin copia, o si nunca se hizo ninguna).
- **Fijos por venir**: los que tocan este mes y aún no han vencido, o los marcados como manuales.
- **Nuevo gasto**: concepto, importe, **fecha** (justo debajo de concepto/importe), luego
  categoría — 4 más usadas + "+ Nueva", con "Ver más"/"Ver menos" como texto suelto abajo a la
  derecha, no como otro chip.
- **Movimientos**: últimos 3 + "Ver más (N)"; al expandir, "Ver menos" aparece dos veces — donde
  estaba el botón, y al final de la lista. Con buscador por proximidad (igual que "blanco"
  encuentra "banco"), que busca en **todos los meses guardados**, no solo el abierto.

### Resumen

- Trío Recibido / Gastado / Queda, con la caja de coach justo debajo.
- **Ahorro** (antes "Apartado al ahorro"): icono de bolsa de dinero, el texto explicativo ya
  dentro de la tarjeta, no en la de arriba.
- **Comparativa**, **Previsión del mes siguiente** (con disclaimer cuando un 0 € es por falta de
  historial, no un 0 € real — ver §11), **Reparto 50/30/20**, **Gasto por categoría** (3 + "ver
  más/menos"), **Exportar**.

### Fijos

Alta y edición: gasto o ingreso, concepto, importe, periodicidad, día, categoría — con el mismo
patrón del resto (4 más usadas + "+ Nueva" + "Ver más/menos", no la lista completa).

**Buscador**, por nombre o por categoría, con la misma búsqueda por proximidad que Movimientos.
Busca en dos sitios a la vez: los fijos dados de alta, y el histórico de meses anteriores (gastos
e ingresos marcados como `fixed: true`), mostrado aparte bajo un rótulo "Histórico".

### Metas

Pestaña nueva. Objetivos de ahorro y deudas, cada uno con su propia categoría dedicada — nunca
comparte categoría con otra cosa, para que el descuento automático no se contamine. Cualquier
gasto anotado en esa categoría (a mano, o desde un Fijo que la apunte) descuenta solo de su
pendiente.

- **Objetivo de ahorro** → categoría con `bucket: "ahorro"`.
- **Deuda** → categoría con `bucket: "necesidad"` (cuenta como gasto normal en el 50/30/20).
- **Mensualidad y meses, enlazados**: escribir uno recalcula el otro (`restante / plazo` en un
  sentido, `restante / cuota` redondeado hacia arriba en el otro).
- **Viabilidad**: si la cuota deseada no cabe en el margen (ingreso estimado − necesidad fija −
  necesidad variable histórica), se ofrece reducir gastos "deseo" concretos hasta cubrir el
  hueco. Si ni recortando todo el "deseo" alcanza, se ofrecen dos caminos igual de válidos:
  reducir gastos y mensualidad a la vez (recorte máximo + plazo mínimo que sí funciona), o
  alargar el plazo sin tocar el gasto.
- **No se puede crear una categoría de ahorro suelta**: el selector normal de categorías ya no
  ofrece el bucket "ahorro" salvo para editar una que ya lo era (como el "Fondo de ahorro" por
  defecto). Si alguien escribe un nombre que suena a ahorro ("ahorro", "ahorros"…) al crear una
  categoría normal, aparece un aviso invitando a crear la meta en su lugar.
- **Cuando la cuota deseada no cabe ni recortando todo el "deseo"**, se muestra el total de la
  reducción lograda **antes** que la lista de categorías concretas (para el caso en que sí cabe
  con recortes parciales). Cuando ni así alcanza, dos caminos con el mismo peso visual: "Reducir
  gastos y mensualidad" (recorte máximo + plazo mínimo que sí funciona, ambos a la vez) o
  "Alargar el plazo" (sin tocar ni un gasto).
- **Checklist de reducciones** bajo cada meta, en la propia pestaña Metas: al aceptar una
  sugerencia de recorte, queda una lista con casilla por categoría. Lo pendiente se ve siempre.
  Lo recién marcado se ve tachado en la misma sesión (para que quede la satisfacción de verlo),
  y a partir de la siguiente vez que se visita esa pantalla se recoge detrás de un enlace
  "Detalles" — no desaparece al instante de marcarlo.

### Ajustes

Orden confirmado: **Límites Categorías → Ajuste de saldo → Modo → Copia de seguridad →
Seguridad → Feedback → Detección automática**.

- **Ajuste de saldo** — diseñado con maqueta aprobada, pendiente de construir (§12): corrige un
  pequeño descuadre puntual sin que cuente como gasto ni afecte a categorías o medias. Botón
  verde (por la convención de color), con la explicación larga detrás de un icono de información.
- **Modo**: switch Coach/Gastos.
- **Feedback**: mailto a `rodrigoharmat@gmail.com`, con "Compartir esta app" debajo (hoja de
  compartir nativa).
- Al fondo, en pequeño: `Cosecha v{APP_VERSION}`.

---

## 5. Motor de categorización

Sin cambios desde la versión anterior de este documento: diccionario + memoria aprendida, la
memoria siempre gana. Ver `lib/utils.js` (`detectCategory`, `learnFrom`, `DICT` en `constants.js`).

## 6. Fijos automáticos

Sin cambios: `autoApplyAll(data)`, hasta 11 meses hacia atrás, condiciones en `lib/data.js`.

## 7. Invariantes del dinero

Las mismas cuatro de siempre (disponible, ahorro fuera de gasto, tramo ahorro del 50/30/20,
cambiar fecha muda de mes), más:

5. **Una categoría de ahorro sin meta asociada sigue siendo válida** (el "Fondo de ahorro" por
   defecto), pero ya no se pueden crear nuevas sueltas — solo desde Metas.

## 7 bis. Seguridad

Sin cambios en cifrado, Face ID/PRF ni modelo de amenazas — siguen en pie tal cual. **Una
corrección importante sobre la CSP**: el documento anterior la daba por existente desde hacía
tiempo, pero **nunca había existido de verdad** en `index.html` hasta finales de agosto. Ya está
añadida: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'
data:; font-src 'self'; connect-src 'self' https://<worker>; base-uri 'none'; form-action 'none';
frame-ancestors 'none';` — el `connect-src` incluye el dominio del Worker (§7 ter).

## 7 ter. El contador anónimo (única excepción al principio 1)

Primera y única vez que la app habla con algo fuera del dispositivo. Diseñado para ser lo más
mínimo posible:

- Un **id aleatorio por instalación**, generado en el móvil, guardado en `ONBOARD_KEY` — nunca
  la contraseña, nunca datos de gastos.
- Se manda **en cada desbloqueo** (o cada apertura, si no hay protección activada), junto con el
  email opcional la primera vez que se registra.
- El Worker (`worker.js`, no desplegado todavía — ver §12) guarda `{ lastSeen, email? }` por id
  en KV, y expone `GET /stats` protegido por un token, para un futuro panel de Admin.
- **Mientras `WORKER_URL` en `constants.js` sea el valor de relleno**
  (`https://REEMPLAZA-ESTO.workers.dev`), la app no manda ninguna llamada de red — se salta sola,
  sin error. Confirmado con test.
- El email, si se da, **nunca llega a `navigator.share` como `title`** — eso causaba que algunas
  apps de destino crearan un archivo de texto sobrante al exportar la copia de seguridad (bug
  real, encontrado y corregido).

## 8. Compilar y publicar

### Compilar

```bash
npm install
npm run build      # esbuild --bundle --minify, escribe bundle.js en la raíz
npm test           # Vitest — toda la batería con un solo comando
```

### Publicar una actualización, a mano (como hasta ahora)

1. Repositorio → **Add file** → **Upload files** → arrastrar los archivos cambiados. **Siempre a
   la raíz, nunca dentro de una carpeta.** ⚠️ No confundir el botón real con el texto "Add files
   via upload" de un commit ya existente en el historial — eso no es un botón, es solo el mensaje
   del último commit.
2. **Subir el número de `CACHE` en `sw.js`** si hay cambios. Sin esto el iPhone sigue sirviendo
   la versión guardada.
3. Pestaña **Actions**, esperar el ✓ verde.
4. Comprobar en el ordenador con `Cmd+Shift+R`. En el iPhone: cerrar la app del todo y abrirla
   **dos veces**.
5. **El icono y el nombre de la pantalla de inicio no se actualizan solos** — iOS los fija en el
   momento de "Añadir a pantalla de inicio" y no los vuelve a mirar. Para verlos cambiados hace
   falta borrar el icono y volver a instalarla — **y eso sí borra los datos**, aunque parezca
   un simple acceso directo. Hacer copia de seguridad siempre antes de reinstalar.

### Publicar una actualización, automático (configurado, sin desplegar todavía)

`.github/workflows/deploy.yml` ya existe: al hacer push a `main`, instala dependencias, **corre
`npm test` y para la publicación si algo falla**, compila `bundle.js` desde `src/`, y publica en
GitHub Pages sin que haga falta subir nada compilado a mano. Requiere un cambio de ajuste, una
sola vez: **Settings → Pages → Source → GitHub Actions** (ahora mismo está en "Deploy from a
branch"). ⚠️ El workflow asume que la rama principal se llama `main` — confirmarlo antes de
activarlo.

---

## 9. Reglas de oro

Todas las de antes siguen en pie (nunca cambiar un `id` de categoría, nunca cambiar la clave de
almacenamiento, nunca borrar un escalón de `migrate()`, subir `version` al cambiar la forma de
los datos, campos a 16px mínimo, día de fijos limitado a 28, `window.storage` antes que
`localStorage`, nada de `<script>` en línea, no cambiar `PRF_SALT_TXT` ni fijar `rp.id`). Además:

- **Cambiar `rp.name` en la ceremonia de passkey es seguro** (solo cosmético); cambiar `rp.id`
  no lo es — eso sí invalidaría los passkeys.
- **El aviso de "novedad" para quien ya tenía datos nunca debe depender de una clave que no
  existía antes.** Al añadir `ONBOARD_KEY`, hubo que comprobar explícitamente "¿ya había datos
  en `STORE_KEY`?" antes de decidir si mostrar onboarding — si no, cualquier actualización futura
  volvería a mostrar la pantalla de bienvenida a quien ya usa la app.
- **Ningún candidato del motor de coach que dependa de comparar con el mes anterior debe
  disparase con menos de 5 apuntes en ese mes.** Es la guardia que evita comparar contra un mes
  casi vacío y sacar porcentajes sin sentido (pasó de verdad: 1703%).
- **`hist.length > 0` no significa "hay datos de gasto variable"** — un mes puede tener
  apuntes y ser todos fijos. Para disclaimers de "sin datos suficientes", filtrar por si esos
  meses aportaron algo del tipo concreto que se está prometiendo, no solo por si el mes existe.

## 10. Decisiones tomadas y por qué

Todas las de antes siguen vigentes. Añadidas desde entonces:

| Decisión | Motivo | Alternativa descartada |
|---|---|---|
| Dividir `gastos.jsx` en módulos, con `package.json` y Vitest | Un amigo arquitecto señaló la falta de control de dependencias; pocos usuarios y sin comercializar = buen momento | Reescribir desde cero: mismo riesgo de reintroducir bugs ya cazados, sin ganar nada |
| Metas con categoría dedicada, no una casilla suelta en cada gasto | El descuento automático ya existe gratis (los totales por categoría), sin código especial | Marcar gastos individualmente como "de esta meta": más fricción, más bugs |
| Contador anónimo con id + señal en cada desbloqueo, sin IP | La IP identifica peor (redes compartidas, IPs dinámicas) y es dato personal de verdad; el id local no | Registrar por IP con aviso RGPD completo: desproporcionado para una app de amigos |
| Login/cuentas con email, descartado dos veces (para compartir con una amiga, y para "comercializar") | Sin sincronización real de datos, un login no aporta nada — solo fricción y una segunda contraseña que no protege nada | Cuentas de verdad: exige backend, rompe el principio 1 |
| CSP añadida de verdad en agosto | El handoff anterior decía que existía; nunca había existido | — |

**Presupuesto de peso:** sigue por debajo del margen que ya se midió; los módulos nuevos no
cambian sustancialmente el tamaño final, solo la organización del código fuente.

---

## 11. Qué está probado

Todo lo de antes (migración v1→v8, detección de categorías, fijos, previsión, reparto 50/30/20,
cifrado con 8 escenarios…) sigue verificado y sin romperse — confirmado de nuevo tras el
refactor, con la misma batería ejecutada contra la versión modular. Añadido desde entonces:

- El motor de coach: guardia de 5 apuntes mínimos (reproducido con datos reales del usuario:
  julio con 1 solo apunte fijo → antes daba 1703%, ahora cae al ánimo neutro o a la candidata de
  meta, que no depende del historial).
- El disclaimer de "sin datos suficientes" en Previsión: aparece cuando el 0€ es por falta de
  historial real, y **no** aparece cuando el 0€ es un cero legítimo (0 fijos dados de alta ese
  mes).
- Metas: categoría dedicada creada con el bucket correcto según el tipo; descuento automático al
  anotar un gasto en esa categoría (probado anotando un gasto de verdad, no solo revisando el
  cálculo); enlace bidireccional mensualidad↔meses; los dos casos de viabilidad; los recortes
  sugeridos son los mínimos necesarios, no todos los "deseo" (probado con un caso donde una sola
  categoría ya cubría el hueco).
- El patrón "ver más/ver menos" en las 4 listas que lo usan, incluido que "ver menos" aparece dos
  veces al expandir.
- Onboarding: quien ya tenía datos nunca ve la pantalla de bienvenida, ve el aviso no bloqueante
  en su lugar; se le genera el id de instalación en silencio.
- El Worker no manda ninguna llamada de red mientras `WORKER_URL` sea el valor de relleno.
- La versión modular se comporta **exactamente igual** que la monolítica que la precedió, en
  todo lo anterior — no es una promesa, está comprobado con la misma batería antes y después.

## 11 bis. Banco de pruebas

Ya no son scripts sueltos escritos cada ronda — **Vitest de verdad**, con `npm test`.
`vitest.config.js` fija el entorno `jsdom` y recoge `tests/**/*.test.jsx`.

### Trampas que costaron tiempo (no repetirlas)

Todas las de antes (`store.get` espera `{ value }`, no hacer `global.btoa` desligado de su
ventana, `navigator` de solo lectura en Node, montar en un nodo del documento, escribir en
inputs por el descriptor del prototipo, envolver en `act`, hacer clic en la pestaña correcta
antes de comprobar, WebAuthn simulado con un `Map`). Añadidas:

- **`isInputEventSupported` de React se calcula una sola vez, al importarse `react-dom`,
  mirando si existe `window`/`document` en ese instante.** Si el test crea la ventana de jsdom
  *después* de importar `react-dom/client`, React decide para siempre (hasta reiniciar el
  proceso) que hay que usar una ruta de compatibilidad vieja que no existe de verdad en jsdom, y
  cualquier interacción con un campo con `autoFocus` revienta con
  `activeElement.attachEvent is not a function`. Solución: crear la ventana **antes** de la
  primera importación de React/React-DOM en el archivo. Con Vitest y `environment: "jsdom"` en
  la configuración, esto ya no hace falta a mano — el entorno se monta antes de que el archivo
  de test se evalúe.
- **`pretendToBeVisual: true`** al crear la `JSDOM` (si se hace a mano) evita fallos de foco
  raros con inputs controlados de React.
- **Un mock de `window.storage` que no distingue por clave** (devuelve/guarda lo mismo pase lo
  que pase la clave pedida) puede sobrescribir datos financieros con metadatos de onboarding o
  viceversa, sin ningún error visible — solo datos que desaparecen. Siempre un objeto `{ clave:
  valor }` de verdad, nunca una única variable compartida.
- **`import { act } from "react"`, no de `"react-dom/test-utils"`** — el segundo está en desuso
  en React 19 y da avisos (inofensivos, pero ruidosos) en cada test.

## 12. Backlog, en orden de valor

**✅ 1-5, terminados y probados en la ronda del 31 de agosto** (22 comprobaciones nuevas, todas
en verde, además de las que ya había):
- Refactor completo: `package.json`, Vitest, GitHub Actions — falta solo el paso 1 de abajo.
- Ajuste de saldo, en el orden confirmado, botón verde.
- Fijos: categorías con el patrón de siempre (4 + "+ Nueva" + ver más/menos) y buscador (nombre y
  categoría, en los dados de alta y en su histórico).
- Vista por ciclo de nómina: un día de cobro en Ajustes; solo el "Disponible" del mes actual se
  recalcula por ciclo, Fijos y Previsión siguen por calendario siempre.
- Metas: total de la reducción antes que la lista; las dos variantes (incluida "reducir gastos y
  mensualidad" combinada, que recalcula el plazo mínimo con el recorte máximo); checklist con
  casilla bajo cada meta, con lo pendiente siempre visible y lo ya reducido recogido tras
  "Detalles" a partir de la siguiente vez que se visita esa pantalla, no al instante de marcarlo
  (probado simulando cerrar y volver a abrir la app, no solo con un clic).

**Sigue pendiente:**

**1. Activar GitHub Actions de verdad.** El workflow ya está escrito y probado en local
(`npm run build` + `npm test`, ambos correctos). Falta: cambiar Settings → Pages → Source a
"GitHub Actions" en el repositorio real, y confirmar que la rama principal se llama `main` antes
de depender de él.

**2. Panel de Admin.** Pendiente de que el Worker esté desplegado de verdad (paso 3) para poder
probarlo contra algo real, no simulado.

**3. Desplegar el Worker.** Código listo (`worker.js`, `WORKER.md` con pasos desde el panel web
de Cloudflare, sin terminal). Falta que el usuario lo despliegue y pase la URL real, para
actualizar `WORKER_URL` en `constants.js` y el `connect-src` de la CSP.

**4. Decisiones abiertas, sin resolver:**
- **TypeScript**, ¿se adopta en este mismo movimiento del refactor, o se deja aparte?
- **Dirección de monetización** (interruptor local fácil de saltar, backend de licencias real,
  publicidad con SDK de terceros, o ninguna todavía) — cada camino pide algo distinto de la
  arquitectura, no es una casilla que se pueda dejar "preparada" en abstracto.
- **Importar el extracto del banco** (diseño ya acordado en una versión anterior de este
  documento, sigue vigente, no se ha tocado).

---

## 13. Limitaciones conocidas

Todas las de antes (sin sincronización, no cuadra con el saldo del banco por diseño, el efectivo
ensucia, riesgo de pérdida de datos si Safari borra el sitio, tipografía del sistema dentro del
asistente). Añadida:

- **Borrar el icono de una PWA instalada no es "quitar un acceso directo" — borra los datos
  también.** Distinto del comportamiento de un marcador normal de Safari. Cualquier instrucción
  de "reinstala para ver el icono nuevo" tiene que ir siempre precedida de un aviso de copia de
  seguridad, no como buena práctica sino como paso obligatorio.

---

## 14. Contexto del usuario

Todo lo de antes sigue vigente (presupuesto 0€, no es programador, publica desde la web nunca
desde terminal, iPhone en Barcelona). Añadido:

- **Un amigo suyo, arquitecto de sistemas, revisó el código** y señaló la falta de
  `package.json`/control de dependencias como el problema real de fondo — no "no escala a
  usuarios" (eso ya escalaba bien, por diseño), sino "no está montado para que trabaje un equipo
  ni para crecer en herramientas sin fricción". Motivó el refactor de §2.
- **Está pensando en comercializar la app.** Ver §14 bis para el desglose de costes ya explorado.
- **Tiene otra app en paralelo** (gestor de contraseñas/recovery codes) — no confundir contextos;
  alguna vez ha llegado a esta conversación una captura que no era de Cosecha.
- **Ya hay al menos 2 usuarias reales**: el propio usuario, y una amiga a la que ayudó a instalar
  la app con instrucciones en catalán.

## 14 bis. Si algún día se comercializa

Explorado, no decidido. Resumen: **la infraestructura técnica se queda igual de barata sea cual
sea la escala** (GitHub Pages y el Worker en su plan gratuito aguantan miles de usuarios sin
coste) — lo único que sube de precio es el papeleo de poder facturar legalmente, no la app en sí.
En España, darse de alta como autónomo (con tarifa plana el primer año) es, con diferencia, la
partida más grande, y la única obligatoria en cuanto se empiece a cobrar de verdad. Quedarse en
PWA (sin tiendas de apps) evita las cuotas de Apple/Google y su comisión sobre pagos dentro de la
app. El freemium "de verdad" (a prueba de que alguien lea el código y se lo salte) exige un
backend de licencias — la misma clase de decisión que ya se descartó dos veces para el login. No
es una tarea técnica pendiente, es una decisión de negocio sin tomar todavía (§12, punto 8).

## 15. Inventario de entregables

| Archivo / carpeta | Contenido |
|---|---|
| `src/` | fuente de la app, dividida en 15 módulos |
| `package.json`, `vitest.config.js` | dependencias y comandos |
| `tests/consolidada.test.jsx` | batería de pruebas real |
| `.github/workflows/deploy.yml` | compilar y publicar solo (pendiente de activar en Pages) |
| `index.html`, `sw.js`, `manifest.webmanifest`, iconos, fuentes | listos para publicar tal cual |
| `worker.js`, `wrangler.toml`, `WORKER.md` | Worker del contador anónimo, pendiente de desplegar |
| `HANDOFF.md` | este documento |

## 16. Estado de la conversación

Refactor completo (módulos + `package.json` + Vitest + GitHub Actions + `index.html` enlazando
`styles.css`), y encima, en la misma ronda del 31 de agosto: Ajuste de saldo, Fijos (categorías +
buscador), vista por ciclo de nómina, y las mejoras de Metas (total antes de la lista, las dos
variantes con la opción combinada, y el checklist con colapso tras revisita). 22 comprobaciones
nuevas, todas en verde, sobre las que ya había. Versión **2.3.0**, caché **`cosecha-v8`**.

El entorno de trabajo se reinició dos veces durante esta ronda larga. La primera vez se perdió el
refactor entero y hubo que rehacerlo; la segunda, con la lección ya aplicada (guardar en
`/mnt/user-data/outputs` según se iba terminando, no solo al final — ver §17), no se perdió nada.

El paquete final para publicar está completo en `/mnt/user-data/outputs/refactor/`: código fuente
(`src/`), pruebas (`tests/`), y todos los archivos estáticos listos (`bundle.js` ya compilado,
`sw.js` con la caché subida, iconos, manifest, 4 de las 5 tipografías). **Falta una sola pieza que
no estaba disponible para reconstruir**: `font-mono-600.woff2` — no hace falta generarla ni
subirla de nuevo, ya existe en el repositorio real desde antes; sencillamente no se toca al
publicar el resto.

Pendiente inmediato: activar GitHub Actions en los ajustes de Pages (§12, punto 1), y las
decisiones abiertas de siempre (TypeScript, monetización) cuando el usuario quiera retomarlas.

## 17. Persistencia de entregables (lección de esta ronda)

El directorio de trabajo del asistente (`/home/claude` o equivalente) **puede reiniciarse sin
aviso entre turnos de la misma conversación**, borrando todo lo que solo viva ahí. Solo
`/mnt/user-data/outputs` (o el directorio que el propio entorno documente como persistente) se
conserva. Regla práctica: en cualquier trabajo largo de varias respuestas, copiar los archivos
intermedios importantes (no solo el resultado final) a ese sitio persistente **según se van
terminando**, no solo al final — así un reinicio a mitad de camino cuesta, como mucho, rehacer un
paso mecánico ya conocido, no perder el trabajo entero. Aplicado con éxito la segunda vez que el
entorno se reinició en esta misma ronda: no se perdió nada.
