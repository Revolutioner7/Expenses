/* Vuelta de Apple o Google en la web. El token llega en el fragmento (#), que no sale del navegador.
   Si se abrió como ventana emergente, se pasa a la app por un canal del propio navegador y se cierra.
   Si se abrió en la misma pestaña (el navegador bloqueó la ventana), se guarda un momento y se vuelve a la app. */
(function () {
  var p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname); // que el token no se quede en el historial
  var st = p.get("state") || "";
  var r = { provider: p.get("provider") || st.split(".")[3], state: st, idToken: p.get("id_token"), error: p.get("error"), at: Date.now() };
  var modo = r.state.split(".")[1];
  if (modo === "p") {
    try { new BroadcastChannel("dineriko-oauth").postMessage(r); } catch (e) {}
    try { localStorage.setItem("dineriko-oauth-popup", JSON.stringify(r)); localStorage.removeItem("dineriko-oauth-popup"); } catch (e) {}
    window.close();
    document.getElementById("msg").textContent = "Listo. Ya puedes cerrar esta ventana y volver a Dineriko.";
  } else {
    try { sessionStorage.setItem("dineriko-oauth", JSON.stringify(r)); } catch (e) {}
    location.replace("./");
  }
})();
