// Applica il tema salvato prima del primo paint (evita il flash). Caricato nell'<head>.
(function () {
    try {
        var theme = localStorage.getItem("gl-theme");
        if (theme === "light" || theme === "dark") {
            document.documentElement.setAttribute("data-theme", theme);
        }
    } catch (e) { /* storage non disponibile: si usa il tema di sistema */ }
})();
