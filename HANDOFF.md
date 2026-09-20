# Handoff — Cosecha

Documento de traspaso completo. Sirve para retomar el proyecto dentro de seis meses, para
dárselo a otra persona, o para arrancar una conversación nueva con un asistente sin perder
contexto.

**Última actualización:** 20 de septiembre de 2026 (ver §18, lo más reciente)
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
- **Toda cosa nueva que se configura o se muestra en la app tiene que poder editarse o
  deshacerse — nunca quedar puesta sin salida.** Cuando el usuario pida mostrar algo nuevo
  ("quiero que ahora aparezca X"), preguntar explícitamente cómo se editaría o se quitaría X
  antes de construirlo, no dar por hecho que con mostrarlo ya basta. Pedido explícitamente como
  principio permanente de esta conversación, no solo para el caso concreto que lo motivó.
- **Toda funcionalidad nueva o cambio de diseño tiene que pensarse también para lo que ya
  existe, no solo para lo que se crea a partir de ahora — si puede afectar retroactivamente a
  datos ya guardados, hay que decidir explícitamente qué pasa con ellos, no dejarlo sin
  resolver.** Nace del caso real de la categoría única "Gastos periódicos": el rediseño cambió
  cómo se crean las mini-metas nuevas, pero las que ya existían (con su categoría dedicada de
  antes) se quedaron huérfanas del cambio, sin que nadie se planteara qué debía pasar con ellas
  hasta que el usuario lo encontró por su cuenta. Cualquier cambio de arquitectura de datos
  (categorías, forma de guardar algo, campos que cambian de significado) necesita una pasada de
  migración explícita para lo que ya está guardado, del mismo estilo que ya se hace en
  `migrate()` — no basta con que el código nuevo funcione bien para datos nuevos.
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
- **Principio general de la app, no solo para bancos: cualquier cosa que se pueda "dar de alta"
  (categoría, banco, lo que sea) tiene que poder añadirse en dos sitios — en el momento, desde
  donde sea que la estés eligiendo (sin salir de ahí), y también desde Ajustes, para gestionarla
  con calma aparte.** Nunca solo uno de los dos. El buscador de bancos (`BancoPicker`) lo hace
  bien con categorías desde hace tiempo (chip "+ Nueva" en el propio selector); haría falta
  añadir la misma opción "+ Añadir «lo que se ha escrito»" dentro del buscador de bancos cuando
  no hay ningún resultado que coincida — todavía no está construido, ver §12.
- **Principio general, no solo para categorías: cualquier menú desplegable ("Ver más"/"Ver
  menos") tiene que volver a su estado colapsado en cuanto termines de usarlo, nunca quedarse
  expandido sin necesidad.** El disparador exacto depende del patrón:
  - **Chips de elección inline** (categoría en el formulario rápido, en `ExpenseEditor`, en
    `FixedEditor`): el propio clic sobre una opción tiene que colapsar la lista a la vez que la
    selecciona — no son dos pasos separados.
  - **`ExpandableList`** (Ajustes → Límites Categorías, la lista de reglas de Fijos, Metas):
    aquí tocar un elemento abre un editor aparte, no selecciona en el sitio — el disparador
    equivalente es *cerrar ese editor*, momento en el que la lista debe volver a colapsarse si
    estaba expandida.
  - **`BancoPicker`**: no necesita ningún arreglo — en cuanto se elige un banco, el propio
    componente entero se sustituye por el resumen "banco elegido + cambiar", así que su "Ver
    más" interno nunca llega a quedarse pegado.
  - Cualquier menú desplegable nuevo que se construya a partir de ahora debe seguir este mismo
    principio desde el primer día, no como algo que haya que recordar pedir aparte.

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
- **Ningún test debe dar por sentado "hoy" sin fijarlo.** Varios tests sembraban datos en
  "2026-08" asumiendo que ese mes seguiría siendo el actual — funcionaban mientras el reloj real
  de la máquina seguía en agosto, y se rompieron solos, sin tocar nada, en cuanto ese reloj pasó
  a septiembre (pasó de verdad, en mitad de esta conversación). Nada que ver con paralelismo ni
  con ningún cambio de código — probado descartando esas hipótesis primero. Arreglo: `vi.setSystemTime(...)`
  con una fecha fija en el `beforeEach` global, para que la batería entera deje de depender de
  cuándo se ejecute de verdad. Los tests que necesiten otra fecha concreta (el ciclo de nómina)
  la fijan aparte, dentro de su propio test.

## 12. Backlog, en orden de valor

**Pendiente de un solo dato: el enlace real de la ficha en Google Play (18 de septiembre, código
ya listo, solo falta rellenar la constante):**
- `PLAY_STORE_URL`, en `constants.js`, sigue con el mismo relleno de siempre
  (`REEMPLAZA-ESTO`) — en cuanto exista la ficha real, sustituir esa URL es lo único que hace
  falta, sin tocar nada más.
- **"Compartir esta app"** (Ajustes → Ayuda y app) ya está listo para esto: en Android, comparte
  `PLAY_STORE_URL` en cuanto deje de ser el relleno; hasta entonces, cae solo al enlace normal de
  la web, sin dar ningún error. En iPhone, siempre comparte la web (no hay equivalente de App
  Store, sigue siendo una PWA ahí).
- La pantalla **"Cómo instalar"** ya detecta iPhone vs Android y muestra solo las instrucciones
  que tocan (antes mostraba las dos a la vez) — pero en Android sigue enseñando el "Añadir a
  pantalla de inicio" manual de siempre, sin ofrecer todavía el enlace a Play. A diferencia de
  "Compartir esta app", este todavía no está conectado a `PLAY_STORE_URL` — falta ese cableado
  cuando se retome.

**Visión a muy largo plazo, condicional ("si la app se desarrolla y se necesita"), sin
construir nada:**
- **Soporte multi-divisa** — un ajuste para elegir euros, dólares, o tener las dos a la vez.
  Anotado el 18 de septiembre, sin diseñar el mecanismo (¿una cuenta por divisa? ¿conversión en
  vivo? ¿solo cambia el símbolo, sin tocar los importes?) — retomar desde cero cuando llegue el
  momento. El icono de la hucha-cerdito de "Gastos periódicos" (imagen PNG con fondo transparente,
  no emoji de texto) se diseñó a propósito para no depender de esto: en vez de un símbolo de
  moneda, lleva la forma del logo de Dineriko recortada como hueco transparente en el cuerpo —
  se adapta sola al color de fondo de cualquier insignia, y no hará falta tocarla pase lo que
  pase con las divisas.
  imagen fija, hecha a mano para esta app en concreto.

**Pendiente, para la próxima ronda de "constrúyelo" (anotado el 9 de septiembre, sin construir):**
- Al aceptar la oferta de crear las mini-metas en bloque (el mensaje que sale al activar el
  interruptor de Gastos periódicos en Ajustes → Dinero, si ya había fijos periódicos sin mini-meta),
  redirigir directo a Metas con el desglose de "Gastos periódicos" ya desplegado — hoy se queda en
  Ajustes tras aceptar. Sin confirmar todavía si también aplica al aviso que ven los usuarios
  existentes antes de activar nada (`AvisoGastosPeriodicosCard`), o solo a este.
- Renombrar la categoría "Gastos periódicos" → "Gastos prorrateados". No es solo un texto —
  ya existe como categoría real creada en datos de usuarios (incluido este), así que hace falta
  un paso de migración para las cuentas que ya la tengan con el nombre viejo, no solo cambiar
  dónde se crea una nueva (mismo principio que la migración de categoría única, §9).

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

**2. Panel de Admin, con el flujo de despliegue en dos pasos que pidió el usuario.** Pendiente de
que el Worker esté desplegado de verdad (paso 3) para poder probarlo contra algo real, no
simulado. El flujo exacto, confirmado varias veces por el usuario a lo largo de la conversación
(la última, el 18 de septiembre, como recordatorio explícito de que no se olvide):
1. Se sube una actualización, pero **no llega a todos los usuarios todavía** — solo a su propio
   usuario (admin), para poder probarla él mismo primero, con datos y uso reales.
2. Si le vale, **desde dentro de la propia app** (no desde GitHub, no desde un sitio aparte),
   pulsa un botón "Deploy" que hace que esa misma versión llegue ya al resto de usuarios.
Esto es justo el "botón Deploy de verdad" que se diferenció en su momento de la alternativa
sencilla (dos URLs, subir dos veces a mano) — necesita servidor con un token de GitHub guardado
y una pantalla de administrador protegida, no es una función más dentro de la app en sí. Sigue
sin diseñar el mecanismo técnico exacto (¿dos ramas de GitHub Pages con dominios distintos, con
el admin viendo la de "preview"? ¿un flag en el propio Worker que decide qué build servir según
quién lo pide?) — retomar el diseño desde cero cuando se llegue a este punto, con este flujo de
dos pasos como el requisito que no puede faltar.

**3. Desplegar el Worker.** Código listo (`worker.js`, `WORKER.md` con pasos desde el panel web
de Cloudflare, sin terminal). Falta que el usuario lo despliegue y pase la URL real, para
actualizar `WORKER_URL` en `constants.js` y el `connect-src` de la CSP.

**4. Decisiones abiertas, sin resolver:**
- **TypeScript**: decidido que no, por ahora — el motivo real (falta de `package.json`) ya está
  resuelto por el propio refactor; no hay ningún bug reciente que TypeScript hubiera cazado, y
  meter una migración mecánica justo detrás de terminar el refactor repetiría el mismo patrón que
  ya costó dos reinicios de entorno perdidos en una sesión. Se reconsiderará si entra otra persona
  a tocar el código, o si empiezan a aparecer bugs por pasar datos con la forma equivocada.
- **Dirección de monetización** (interruptor local fácil de saltar, backend de licencias real,
  publicidad con SDK de terceros, o ninguna todavía) — cada camino pide algo distinto de la
  arquitectura, no es una casilla que se pueda dejar "preparada" en abstracto.
- **Importar el extracto del banco** (diseño ya acordado en una versión anterior de este
  documento, sigue vigente, no se ha tocado).

**5. Patrimonio (ahorro, acciones, bonos…) — aparcado, con la dirección ya decidida para cuando
se retome.** Adelante, pero **solo entrada manual, sin conectar nada automático**. La decisión,
con su razonamiento completo, para no repetir la conversación:

> Solo si lo mete el usuario a mano, sin conectar nada automático. En cuanto la app empiece a
> mostrar el valor de acciones o bonos, hay dos caminos. Uno es que el usuario mismo actualice el
> número una vez al mes ("tengo 3.000 € en el fondo tal"), que no cambia nada de cómo está
> construida la app — sigue sin salir nada del móvil, cero coste nuevo, cero riesgo. El otro
> camino es que la app vaya a buscar el precio real de esas acciones a internet cada día — y eso
> sí es un cambio de fondo: la primera vez que la app hable con un proveedor de datos bursátiles,
> deja de ser "una app que nunca sale del dispositivo" y pasa a depender de un servicio externo,
> con su coste y sus caídas. Empezar por lo primero, y dejar lo segundo para más adelante, solo si
> de verdad hace falta.

Un apartado "hacer crecer tu dinero" (bonos, acciones, como categoría para invertir) se descartó
aparte, con un motivo distinto y más serio: en cuanto la app pasa de "esto es lo que tienes" a
sugerir "esto es lo que deberías comprar", entra en terreno de asesoramiento financiero regulado
(CNMV, en España) — no es una decisión técnica que se tome sobre la marcha.

**6. Cerrar los huecos de los Términos y Condiciones y el Aviso de Privacidad.** Ambos documentos
están redactados y revisados a fondo (ver conversación de finales de agosto), pero siguen con
placeholders sin rellenar: `[NOMBRE DE LA APLICACIÓN]` (ya se puede poner "Dineriko", decidido),
`[FECHA]`, `[EMAIL DE CONTACTO]`, `[DOMICILIO, SI PROCEDE]`, y el enlace cruzado entre ambos
documentos una vez publicados. Tarea mecánica, no de contenido — nadie ha vuelto a tocarlo desde
que se cerró el nombre.

**7. Bancos y forma de pago — construido y probado desde hace tiempo, esta nota llevaba
desactualizada varias rondas.** Todo lo que sigue **ya funciona**, no está pendiente:
`DEFAULT_BANCOS` precargados, `BancoPicker` reutilizable (buscador + más usado arriba + ver más
+ "Añadir «lo escrito»" cuando no hay resultados), forma de pago en el editor completo y en el
formulario rápido con valor por defecto, tarjeta "Forma de pago por defecto" en Ajustes, paso de
onboarding. Decisión ya tomada, no pendiente: **insignias con inicial y color por banco, no
logos reales** (los logos son marca registrada de cada entidad; si el usuario consigue el kit de
marca oficial de un banco con permiso de uso, ahí sí se podrían incluir).

Lo único genuinamente sin construir de este bloque:
- **Disponible por cuenta (efectivo / cada banco), aparcado, sin diseño cerrado.** Distinto de
  "Gasto por forma de pago" en Resumen (que ya existe): esto sería un balance real por cuenta, no
  solo un desglose del gasto. Si se construye, nunca debe mostrarse como una cifra sola y
  aparentemente completa — siempre acompañada de cuánto del historial total sigue sin marcar,
  para que no se confunda con el saldo real de esa cuenta mientras la mayoría de lo anotado no lo
  tenga etiquetado todavía. Sin ajuste de saldo por cuenta en una primera versión, a propósito —
  se añadiría más adelante si el hueco de "sin especificar" resulta ser un problema real en la
  práctica.

**8. Idea nueva, sin decidir del todo: un apartado en Ajustes llamado algo como "¿No te cuadran
las cuentas?"**, que reuniría en un solo sitio dos cosas que hoy están separadas:
- El **Ajuste de saldo** que ya existe (corrección puntual, manual, del disponible).
- Una función nueva para **subir todos los movimientos del banco y comparar contra lo ya
  anotado** — para encontrar qué se ha cobrado de verdad en la cuenta pero todavía no está en la
  app. Esto es, en esencia, el mismo "Importar extracto del banco" que ya estaba en el backlog
  (dos diseños distintos, ninguno confirmado — ver más abajo), pero replanteado como parte de un
  apartado de conciliación más amplio, no como una función aislada.

No se ha decidido nada más allá de la idea en sí — ni el diseño de la comparación, ni si de
verdad conviene fusionarlo con Ajuste de saldo o dejarlos separados. Antes de construir nada de
esto, retomar la conversación desde cero con esta idea como punto de partida.

- **Recordatorios, en Ajustes.** Sin diseñar, solo la idea de partida: un apartado nuevo con (al
  menos) dos avisos configurables — "¿quieres que te recordemos cuando llega algún gasto?" y
  "¿quieres que te avisemos si no has apuntado gastos en X días?". Antes de construir, pensar en
  la parte técnica: en iOS, sin servidor, esto solo puede vivir como notificación LOCAL
  programada desde el propio dispositivo (no como push real) — que es justo el tipo de aviso que
  no rompe el "todo se queda en el dispositivo", a diferencia de las notificaciones push que se
  hablaron para analítica/anuncios. Retomar también con la regla de oro nueva del §9: cada
  recordatorio que se active tiene que poder editarse (cambiar el umbral de días) y desactivarse,
  no solo encenderse.

---

## 13. Limitaciones conocidas

- **Hay un `src/styles.css` huérfano, sin usar.** El de verdad es `styles.css` en la raíz del
  proyecto (el que `index.html` carga con `<link>`). El de `src/` no lo referencia nada — se
  comprobó a fondo el 18 de septiembre — así que si alguna vez hace falta tocar estilos, es en el
  de la raíz. No se ha borrado por precaución, solo queda anotado para no confundirse.

Todas las de antes (sin sincronización, no cuadra con el saldo del banco por diseño, el efectivo
ensucia, riesgo de pérdida de datos si Safari borra el sitio, tipografía del sistema dentro del
asistente). Añadida:

- **Borrar el icono de una PWA instalada no es "quitar un acceso directo" — borra los datos
  también.** Distinto del comportamiento de un marcador normal de Safari. Cualquier instrucción
  de "reinstala para ver el icono nuevo" tiene que ir siempre precedida de un aviso de copia de
  seguridad, no como buena práctica sino como paso obligatorio.

**15. Visión a largo plazo, sin fecha ni decisión de construir — solo para que quede anotado:**

- **Conectar la cuenta de Revolut (u otro banco) para registrar gastos automáticamente**, "futuro
  lejano" según sus propias palabras. Aclarado ya el punto técnico para cuando se retome: esto no
  es "la app habla con el banco directamente" — en la UE (PSD2) hace falta pasar por un proveedor
  ya autorizado como intermediario (Tink, Salt Edge, GoCardless, TrueLayer…), con coste real y
  continuo por cuenta conectada. Es el cambio más profundo de cuantos se han hablado hasta ahora:
  rompe el "nunca sale nada del dispositivo" mucho más a fondo que la analítica agregada o las
  notificaciones — aquí lo que viaja es el movimiento y saldo real de cada cuenta, no un dato
  anónimo. Retomar esta conversación desde cero cuando llegue el momento, no asumir que es una
  extensión sencilla de lo demás.
- **Enlace de referido de Revolut (comisión por alta), sin acceso a datos reales de la cuenta**:
  esto es harina de otro costal, mucho más sencillo — una tarjeta con un enlace, sin servidor ni
  cambio de arquitectura. La parte de si hace falta darse de alta como autónomo o cumplir alguna
  normativa de intermediación financiera es una pregunta para un abogado, no para esta conversación.
- **Salto a app nativa (Capacitor) si el éxito lo justifica más adelante**: no haría falta rehacer
  el código de la app en sí — TWA (Android, ya decidido) y Capacitor son solo "cáscaras" distintas
  alrededor del mismo interior en React. El riesgo real y sin confirmar sigue siendo si el
  desbloqueo por Face ID (WebAuthn PRF) sobrevive dentro de un WKWebView — habría que probarlo
  antes de comprometerse, asumido el riesgo de que puede que no sea posible.
- **Despliegue por etapas: que una versión nueva le llegue solo a él primero, y al resto de
  usuarios solo si él la aprueba.** No hace falta nada complicado para esto — la vía que encaja
  con su flujo real (arrastrar archivos a GitHub, sin terminal) es una segunda URL de pruebas
  aparte de la real: sube los archivos ahí primero, los prueba él, y solo cuando esté conforme,
  copia esos mismos archivos a la URL de producción. Dos repositorios (o dos ramas) en vez de uno,
  no un sistema de banderas por usuario — más simple, y de paso resolvería de raíz el patrón de
  fallos que ya se ha repetido varias veces en esta conversación (subir algo roto directamente a
  producción, enterarse por él en vez de antes).
- **Analítica agregada de uso — decidido en buena parte, sin construir todavía.** Quiere que sea
  obligatoria desde el primer día (sin interruptor de activar/desactivar), y que permita seguir el
  cambio de uso de un mismo dispositivo en el tiempo — por tanto, la base legal es **interés
  legítimo** (art. 6.1.f RGPD), no consentimiento; confirmado con una consulta externa a un
  "abogado" (otra sesión de Claude, no una fuente jurídica real — dejarlo claro si se retoma).
  Requisitos que esto exige, no opcionales si se sigue este camino: (1) el identificador de
  instalación y el email no pueden vivir juntos ni cruzarse nunca a nivel técnico; (2) tiene que
  existir un derecho de oposición, aceptado que puede ser tan simple como "escribe a este email"
  dentro de la Política de Privacidad, sin interruptor dentro de la app; (3) categorías que puedan
  revelar salud/religión/orientación/etc. deben agruparse o suavizarse antes de mandarse, nunca
  tal cual. Qué trackear, ya decidido tras comparar con estándar de sector (no solo la opinión de
  Claude): sesiones (conteo y duración agregada), qué pantallas se visitan (evento con nombre, no
  automático para cada una), qué acciones concretas se usan (añadir gasto, buscador, editar en
  bloque…), categorías de gasto ya filtradas de las sensibles. Explícitamente descartado: posición
  exacta de cada toque en pantalla (no aporta nada que los eventos con nombre no den ya, y es lo
  que la analítica de producto en general está dejando de hacer en 2026, no una limitación de esta
  app en concreto). Idea añadida para cuando se diseñe el detalle exacto de eventos: saber si a
  algún usuario **solo** le aparece el mensaje neutro del motor de coach (nunca una candidata real)
  — señal de que el modo Coach no le está aportando nada, útil para decidir si vale la pena
  seguir invirtiendo en ese motor o simplificarlo.
- **Anuncios basados en gasto — pieza aparte, con más incertidumbre legal, sin decisión de
  construir.** Importante no confundir con "explotar a quien está en apuros": la idea, aclarada
  explícitamente, es lo contrario — si alguien gasta mucho en una categoría (gimnasio,
  supermercado…), ofrecerle una alternativa más barata, cobrando comisión solo si la persona
  cambia y ahorra de verdad. Se descartó sin ambigüedad, y no se retomará bajo ninguna forma,
  cualquier mecanismo que dirija anuncios a partir de "esta persona gasta más de lo que ingresa"
  — eso sí sería señalar vulnerabilidad económica para venderla a un anunciante, indistinto de la
  intención. A diferencia de la analítica, esto necesitaría **consentimiento explícito** (no
  interés legítimo), con su propia casilla separada de la de los T&C (art. 7.2 RGPD — no puede
  fusionarse con "acepto los términos"), y de verdad opcional (quien diga que no, sigue usando la
  app igual). Categorías que puedan revelar salud/religión/orientación/etc. quedarían fuera de
  esto también, por buena que sea la intención concreta de ayudar en esa categoría. Depende,
  además, de una pieza de negocio que no es técnica ni legal: acuerdos reales con las alternativas
  más baratas (comisión por cada persona que cambie) — sin eso no hay nada que recomendar. Su
  estrategia declarada es construir la base de usuarios primero, y negociar esos acuerdos después,
  con la audiencia ya conseguida como argumento — por tanto, esto va varios pasos por detrás de la
  propia analítica en el tiempo, no en paralelo. Sin diseño técnico ni decisión final de seguir
  adelante.

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

**Actualizado a 20 de septiembre de 2026.** Versión **2.3.0**, caché **`dineriko-v8`**. 102/102
tests en verde. Test suite pasó de 92 a 102 desde la última vez que se escribió esta sección
(nuevo botón "Ver Aviso de Privacidad" en Ajustes → Datos y privacidad, con el texto completo
dentro de un `Sheet`, sin dependencias nuevas).

**Google Play, en curso.** Cuenta de desarrollador **personal** (no organización — Rodrigo tiene
una empresa registrada, Harforitech, pero inactiva y sin D-U-N-S, y Dineriko no encaja en ninguna
categoría que obligue a cuenta de empresa: se marcó "Ninguna de las anteriores" en el cuestionario
de tipos de app). Nombre de desarrollador elegido: "Rodrigo Harmat". Verificación de identidad ya
enviada, pendiente de que Google la apruebe (sin plazo fijo, puede tardar horas o días). Falta
crear el paquete Android (TWA) y subirlo una vez la cuenta esté aprobada — no empezado todavía.
`PLAY_STORE_URL` en `constants.js` sigue con el relleno de siempre.

**Aviso de Privacidad, a medias.** El texto ya existe y está dentro de la app (ver arriba), pero
Google Play exige un enlace público, no le vale con que esté solo dentro de la app. Falta
publicarlo también en una dirección propia (por ejemplo `dineriko.com/privacidad`) y enlazarlo
desde ahí — no empezado. El texto en sí describe la app tal como está hoy (sin servidor, sin
cuentas, todo cifrado en el dispositivo) y ya incluye una cláusula de que se actualizará si algún
día hay sincronización server-side.

**Análisis RGPD para la futura analítica agregada, guardado, no aplicable todavía.** Rodrigo
consultó a otra IA sobre la base legal para la señal de analítica agregada (categorías más usadas,
modo Coach, funciones usadas) que se apuntó como pendiente en el Worker. Conclusión: interés
legítimo (art. 6.1.f RGPD) es más defendible que consentimiento obligatorio, salvo que se consiga
anonimización real (agregar en el propio dispositivo antes de mandar nada, sin identificador
persistente). Hay dos borradores de cláusula ya redactados (versión interés legítimo / versión
anonimización real), pegados en un chat de este proyecto — reutilizar cuando se construya el
Worker de verdad, no antes.

**Orden acordado para lo grande que queda, de menor a mayor riesgo:** (1) Google Play — en curso,
como arriba; (2) desplegar el Worker de Cloudflare de verdad (no existe todavía, no hay
`WORKER.md` en el repo) y con eso el panel de admin con el botón real de "Publicar" (dos pasos:
probar en la cuenta de Rodrigo, luego publicar para todos) — no empezado, es la pieza que falta
para tener una red de seguridad antes de tocar el servidor grande; (3) servidor con cuentas de
usuario reales y sincronización — no empezado, decisión tomada el 18 de septiembre, diseño sin
empezar.

**Incidente serio de dominio, resuelto — lección técnica nueva y crítica para la próxima vez.**
El 20 de septiembre se reconectó `dineriko.com` como dominio personalizado en GitHub Pages (la
misma reconexión que quedó pendiente tras el susto del 18 de septiembre). Poco después, tanto
Rodrigo como al menos otro usuario de Android abrieron su icono instalado de siempre (uno viejo,
de antes de que existiera Dineriko, con logo de "Cosecha") y vieron la app completamente vacía,
como si nunca hubieran anotado nada. **Causa real, confirmada:** GitHub Pages redirige
automáticamente cualquier visita a la dirección antigua (`revolutioner7.github.io`) hacia el
dominio personalizado en cuanto este queda conectado — esto no estaba documentado ni se sabía
antes de este incidente. Como el almacenamiento del navegador es propio de cada dirección, un
icono viejo que antes cargaba en `revolutioner7.github.io` pasa a cargar en `dineriko.com`, que
nunca había tenido esos datos guardados: de ahí la apariencia de "todo borrado", sin que nada se
hubiera borrado de verdad. Se resolvió quitando otra vez `dineriko.com` del campo "Custom domain"
en GitHub Pages, con lo que el icono viejo de ambos volvió a cargar sus datos reales sin problema.

**Consecuencia práctica, ya acordada: el orden del plan de migración se invierte.** Antes se había
decidido conectar `dineriko.com` primero (sin quitar la dirección antigua) y avisar a la gente con
calma después. Con esta lección, el orden correcto es al revés: **primero avisar a todos los
usuarios (por WhatsApp) y pedirles que borren su icono viejo y añadan uno nuevo desde
`dineriko.com`, y solo cuando la mayoría lo haya hecho, conectar el dominio de verdad.** Conectarlo
antes de avisar expone a cualquiera con un icono antiguo al mismo susto, sin previo aviso, con el
riesgo añadido de que alguien confundido toque "Borrar todos los datos" pensando que así arregla
el problema (eso sí sería una pérdida real, sin vuelta atrás). **Estado ahora mismo:** `dineriko.com`
está desconectado de GitHub Pages (retirado por segunda vez), a la espera de hacer el aviso antes
de volver a conectarlo. Ver también §9 (regla de dominio/origen) y la nueva regla de
"reconfirmar antes de preguntar" en las reglas de trabajo del proyecto.

**Pendiente suelto, apuntado, no construido:** rediseñar los controles de orden de Movimientos
(hoy tres botones sueltos: A-Z, más reciente, más antiguo) como un solo botón que despliega las
opciones, más dos botones aparte para filtrar por categoría y por forma de pago. Se aplica igual
a Movimientos, Fijos e Ingresos, por compartir el mismo patrón de lista. Regla general acordada de
paso: cualquier menú desplegable de la app sigue el mismo criterio de diseño, se use donde se use.

## 17. Persistencia de entregables (lección de esta ronda)

El directorio de trabajo del asistente (`/home/claude` o equivalente) **puede reiniciarse sin
aviso entre turnos de la misma conversación**, borrando todo lo que solo viva ahí. Solo
`/mnt/user-data/outputs` (o el directorio que el propio entorno documente como persistente) se
conserva. Regla práctica: en cualquier trabajo largo de varias respuestas, copiar los archivos
intermedios importantes (no solo el resultado final) a ese sitio persistente **según se van
terminando**, no solo al final — así un reinicio a mitad de camino cuesta, como mucho, rehacer un
paso mecánico ya conocido, no perder el trabajo entero. Aplicado con éxito la segunda vez que el
entorno se reinició en esta misma ronda: no se perdió nada.

## 18. Ronda del 20 de septiembre de 2026 (conversación nueva, sustituye a la anterior como casa del proyecto)

**Leer esto antes que el resto: es lo más reciente y corrige datos de la cabecera.** La app se llama
Dineriko, la caché publicada es `dineriko-v9`, y la dirección pública ya es `https://dineriko.com`.

### Publicado hoy (110 pruebas en verde)
- **Mudanza a dineriko.com, hecha.** Un solo repositorio con dineriko.com como dominio personalizado
  en GitHub Pages. La dirección antigua (`revolutioner7.github.io/Expenses`) redirige sola a la nueva
  y, como el almacenamiento va por dirección, los datos antiguos NO viajan: cada usuario instala desde
  dineriko.com y restaura su copia. Rodrigo lo probó entero en su iPhone (nombre, icono y restaurar,
  todo bien) y ya avisó al resto por WhatsApp. Face ID hay que reactivarlo (va ligado a la dirección).
  Quien abrió la app durante el rato de la mañana en que el dominio estuvo conectado ve la app vacía y
  SIN preguntas de inicio (quedó guardado un cuaderno vacío en esa dirección): se arregla restaurando.
- `manifest.webmanifest`: nombre "Dineriko" (antes "Cuaderno de gastos"/"Gastos"; de ahí salía el
  nombre viejo al instalar). Los colores de fondo siguen siendo los antiguos (`#E4E9E2`), pendiente.
- **Preguntas de inicio rediseñadas** (`components/onboarding.jsx`, estilos `.cg-onboard-*` en
  `styles.css`): opciones grandes de 64px que avanzan al tocarlas, sin "Continuar" (salvo "con
  tarjeta" en el paso 5, que necesita elegir banco); flecha de atrás de 44px en los pasos 3 a 6, que
  enseña marcada la opción ya elegida; "Saltar por ahora" subrayado con el resto de la frase en texto
  normal. Desde el paso 6, atrás vuelve al 4 si se contestó "No" a diferenciar pagos. Causa del aspecto
  feo anterior: la clase `.cg-onboard-choice` no tenía ninguna regla CSS.
- **Compartir esta app**: el enlace va una sola vez, dentro del texto. Ya no se pasa `url` aparte a
  `navigator.share` (iOS pegaba los dos y salía duplicado).
- Frase de la pantalla del email: "Los detalles de tus gastos nunca salen de este dispositivo".
- `GrupoAjustes` (ui.jsx): aire entre cabecera y contenido con la prop `padTop` (14 por defecto, 4 en
  Dinero porque sus filas ya traen relleno).
- Se publicó también el texto de la Política de Privacidad dentro de la app, que venía sin publicar.

### Decidido y aprobado, SIN construir (esperan un "hazlo" explícito)
- **Ordenar y Filtrar** en las cuatro listas (Movimientos, Ingresos, Fijos de gastos, Fijos de
  ingresos): dos píldoras con menú propio, idéntico en iPhone y Android (no el desplegable nativo).
  "Ordenar": una opción, se cierra al elegir; en Fijos conserva sus cuatro opciones. "Filtrar": un
  solo menú con categorías y formas de pago separadas por rótulo, selección múltiple, sigue abierto
  mientras se marca y se cierra tocando fuera; primera fila "Ver todo, sin filtros"; con filtro activo
  la píldora se pone azul con el número ("Filtrar · 2") y el contador pasa a "3 de 18 gastos". Varias
  categorías suman entre sí; categoría y forma de pago se cruzan. Los filtros se borran al salir de la
  pestaña, el orden se conserva. El bloque de forma de pago solo sale si está activada en Ajustes. En
  Ingresos solo va Ordenar. Menú largo: altura máxima con deslizamiento interno. Referencia visual: la
  píldora de ordenar de su app de contraseñas.
- **Logo de "Gastos periódicos"**: calendario azul marino con la D y un círculo con flechas de
  repetición. Archivo en `pendiente-de-integrar/gastos-periodicos-logo.png`. Al integrarlo: sustituye a
  `piggy-d.png` en esa categoría (componente `CatMark`), se usa también en la tarjeta de Metas (hoy
  recuadro gris vacío) y se pinta más grande que un emoji. **El nombre se queda en "Gastos
  periódicos"**: el cambio a "prorrateados" del §12 queda descartado, sin migración.
- **Hucha (`piggy-d.png`) para la categoría Ahorro** en vez del emoji del cerdito. Alcance sin
  confirmar; propuesta: solo la categoría "Ahorro" por defecto y solo para quien conserve el cerdito
  original, sin tocar el selector de emojis. Ojo: `piggy-d.png` tiene mucho margen transparente (el
  dibujo ocupa medio lienzo), hay que recortarlo para que no se vea pequeño.
- **Desplegables de Ajustes**: un apartado abierto sigue abierto mientras se esté dentro de Ajustes
  (aunque se abra y cierre un editor) y se cierra al salir a otra pestaña. Hoy no se cierra: bug.

### Ronda v9 (misma tarde del 20 de septiembre): construido y probado, 121 pruebas en verde
Caché **`dineriko-v9`**. Construido lo que más arriba figura como "aprobado, sin construir", salvo los
desplegables de Ajustes, que siguen pendientes:
- **Ordenar y Filtrar**: componentes `MenuOrdenar` y `MenuFiltrar` en `components/ui.jsx`, estilos
  `.cg-pill*` y `.cg-menu*`. El menú se ancla a la barra `.cg-pillbar` entera, no a su píldora, para que
  el de Filtrar no se salga de la pantalla en móviles estrechos. Iconos en SVG en línea. En `App.jsx`:
  `filtroGastos`, `filtroFijosGastos`, `pasaFiltro`, `gruposFiltro`, `recurringGastosVisibles` (la
  lógica de mini-metas y totales sigue usando `recurringGastos` entero, sin filtrar). El menú solo
  ofrece categorías y formas de pago que aparecen en la lista, más las ya marcadas.
- **Imágenes propias de categoría**: `imagenDeCategoria(c)` y `CatMark` en `ui.jsx`. Gastos periódicos
  usa `gastos-periodicos.png`; la categoría con id `ahorro` usa `hucha-d.png` SOLO mientras su emoji
  sea el cerdito original (si el usuario lo cambia, se respeta; si vuelve a elegir el cerdito, vuelve
  la hucha). Sin migración de datos: es una regla de pintado. Las imágenes se pintan un 35% más grandes
  que un emoji. `piggy-d.png` ya no se usa (se deja en el repositorio, fuera de la caché).
- La tarjeta de Gastos periódicos en Metas usa `CatMark` en vez del icono `ti` que no se veía.

### Apuntes sin decidir
- Unos 49 iconos `ti ti-*` no se ven en ninguna parte: la fuente de iconos Tabler nunca se carga (la
  CSP además solo permite fuentes propias). Decidir: añadir el archivo de la fuente o sustituir por SVG.
- Paso 4 del inicio: "Saltar por ahora" lleva al paso 5 (cómo pagas); lo lógico sería ir al 6.
- Enlace "Ya tengo una copia de seguridad" en la primera pantalla del inicio, directo a restaurar.
  Útil para la mudanza a Google Play.
- Al aceptar crear mini-metas en bloque, ir directo a Metas con el desglose abierto (del 9 de sept.).
- Google Play: la app (TWA) comparte almacenamiento con Chrome para dineriko.com, así que quien ya use
  dineriko.com en Chrome debería ver sus datos al instalar desde Play. Sin probar en móvil real; no
  vale si el navegador por defecto es otro.

### Reglas de trabajo confirmadas hoy
- No tocar código sin orden directa ("hazlo", "constrúyelo", "adelante"). Bugs, ideas y mejoras son
  apuntes. En caso de duda, preguntar antes.
- La carpeta `src/` del repositorio de GitHub estaba desactualizada respecto a lo publicado: **la
  fuente de verdad es el zip del proyecto completo**, que debe guardarse en los archivos del Proyecto de
  Claude y subirse también al repositorio tras cada ronda.
- En el contenedor de trabajo no existe `rsync`; copiar con `cp`.

