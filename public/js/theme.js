// Applica il tema salvato prima del primo paint (evita il flash). Caricato nell'<head>,
// dopo <meta name="theme-color">, di cui aggiorna il colore (barra di stato del telefono / della PWA).
(function () {
    var theme = null;
    try { theme = localStorage.getItem("gl-theme"); } catch (e) { /* storage non disponibile: si usa il tema di sistema */ }
    if (theme === "light" || theme === "dark") {
        document.documentElement.setAttribute("data-theme", theme);
    } else {
        theme = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#121210" : "#ece7dc");
})();
