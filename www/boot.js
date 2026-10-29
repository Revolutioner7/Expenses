/* Dineriko — cargador. Decide qué versión de la app abrir: la estable (bundle.js) o la beta
   (bundle-beta.js), según la preferencia guardada desde Ajustes (ver src/lib/canal.js).
   Vive fuera del bundle para que la elección ocurra antes de arrancar React.
   La "?v=" de su propia etiqueta <script> se reutiliza para los bundles, así la caché se
   invalida con un solo número (el mismo que CACHE en sw.js). */
(function () {
  var canal = "estable";
  try { if (window.localStorage.getItem("dineriko-canal") === "beta") canal = "beta"; } catch (e) {}

  var v = "";
  try {
    var propio = document.currentScript && document.currentScript.src;
    var m = propio && propio.match(/[?&]v=([^&]+)/);
    if (m) v = "?v=" + m[1];
  } catch (e) {}

  var s = document.createElement("script");
  s.src = (canal === "beta" ? "./bundle-beta.js" : "./bundle.js") + v;
  s.onerror = function () {
    // si la beta no carga (por ejemplo, aún no existe), volvemos a la estable sin dejar la pantalla vacía
    if (canal === "beta") {
      try { window.localStorage.removeItem("dineriko-canal"); } catch (e) {}
      var r = document.createElement("script");
      r.src = "./bundle.js" + v;
      document.body.appendChild(r);
    }
  };
  document.body.appendChild(s);
})();
