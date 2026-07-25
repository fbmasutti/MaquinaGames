// Persistência local — Escapa Buraco.

const Storage = (function () {
  const HS_KEY = "escapa-buraco:hs";
  const MUTE_KEY = "escapa-buraco:mute";

  function loadHighScore() {
    const raw = window.localStorage.getItem(HS_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  }

  function saveHighScore(score) {
    window.localStorage.setItem(HS_KEY, String(score));
  }

  function loadMuted() {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  }

  function saveMuted(muted) {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  }

  return { loadHighScore, saveHighScore, loadMuted, saveMuted };
})();
