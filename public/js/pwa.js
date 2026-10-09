// Registra il service worker: è quello che permette di installare l'app sul telefono.
// Se il browser non lo supporta (o la pagina non è HTTPS/localhost) non succede nulla.
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(err => console.warn("Service worker non registrato:", err));
    });
}
