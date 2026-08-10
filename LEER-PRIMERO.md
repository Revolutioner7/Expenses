# Cuaderno de gastos en el iPhone

Esta carpeta es la app entera, ya compilada. No necesita servidor propio, ni base de datos,
ni cuenta de desarrollador. Solo un sitio donde dejar estos archivos con HTTPS.

## 1. Publicar la carpeta (elige una vía)

### GitHub Pages — gratis y permanente
1. Crea un repositorio nuevo en github.com, por ejemplo `gastos`. Marca **Public**.
2. Sube **el contenido** de esta carpeta a la raíz del repositorio (Add file → Upload files).
   Sube los archivos, no la carpeta que los contiene.
3. Settings → Pages → Source: **Deploy from a branch**, rama `main`, carpeta `/ (root)`. Guarda.
4. En un par de minutos tendrás la dirección: `https://TU-USUARIO.github.io/gastos/`

### Netlify Drop — el camino corto
1. Entra en app.netlify.com/drop
2. Arrastra esta carpeta entera a la página.
3. Te da una dirección del tipo `https://algo-aleatorio.netlify.app` al momento.

Cualquier hosting estático con HTTPS sirve: Cloudflare Pages, Vercel, tu propio dominio.
Lo único imprescindible es **HTTPS**: sin él, iOS no instala la app ni activa el modo sin conexión.

## 2. Instalarla en el iPhone

1. Abre la dirección **en Safari** (no en Chrome ni desde el navegador de Instagram o WhatsApp).
2. Botón de compartir (el cuadrado con la flecha hacia arriba).
3. **Añadir a pantalla de inicio**.
4. Confirma el nombre («Gastos») y toca Añadir.

Aparece con su icono. Al abrirla desde ahí va a pantalla completa, sin barra de direcciones,
y funciona sin cobertura.

## 3. Cosas que conviene saber

- **Los datos viven en tu iPhone.** No hay servidor. Nadie más los ve, y no se sincronizan
  con otros dispositivos.
- **Haz copia de vez en cuando.** Ajustes → Copia de seguridad → Guardar copia. Se descarga un
  `.json` que puedes dejar en iCloud Drive. Si cambias de móvil o borras la app, con
  «Restaurar copia» lo recuperas todo.
- **No borres los datos de Safari** para este sitio: se llevaría lo guardado. La copia te cubre.
- **Para actualizar la app** cuando cambie el código: sustituye `bundle.js` (y `index.html` si
  cambió) en el hosting y sube el número de `CACHE` en `sw.js`, por ejemplo `gastos-v2`. Al abrirla
  se actualiza sola. Tus datos no se tocan.

## Qué es cada archivo

| Archivo | Para qué |
|---|---|
| `index.html` | la página que carga todo |
| `bundle.js` | la app completa, con React dentro (funciona sin conexión) |
| `manifest.webmanifest` | nombre, colores e iconos para que iOS la trate como app |
| `sw.js` | guarda la app en el móvil para abrirla sin cobertura |
| `icon-*.png`, `apple-touch-icon.png` | el icono en la pantalla de inicio |
