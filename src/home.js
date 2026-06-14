const TRANSLATIONS = {
  en: {
    lead: "Board games on spherical HEALPix grids.",
    othelloDescription: "Spherical Othello with NPC difficulty, god-move hints, and index overlays.",
    goDescription: "Go on HEALPix pixel vertices with territory view, NPC difficulty, and move-order overlays.",
    gameSelection: "Game selection"
  },
  ja: {
    lead: "球面HEALPix格子で遊ぶボードゲーム集です。",
    othelloDescription: "NPC難易度、神の一手、番号表示つきの球面オセロです。",
    goDescription: "HEALPixピクセル頂点に打つ囲碁です。地表示、NPC難易度、着手順表示に対応しています。",
    gameSelection: "ゲーム選択"
  }
};

const languageOptions = new Set(Object.keys(TRANSLATIONS));
const requestedLanguage = new URLSearchParams(window.location.search).get("lang");
const storedLanguage =
  window.localStorage.getItem("healpixGameLanguage") ??
  window.localStorage.getItem("healpixOthelloLanguage") ??
  window.localStorage.getItem("healpixGoLanguage");
const currentLanguage = languageOptions.has(requestedLanguage)
  ? requestedLanguage
  : languageOptions.has(storedLanguage)
    ? storedLanguage
    : navigator.language.startsWith("ja")
      ? "ja"
      : "en";

window.localStorage.setItem("healpixGameLanguage", currentLanguage);
document.documentElement.lang = currentLanguage;

const text = TRANSLATIONS[currentLanguage];
document.querySelector("#homeLead").textContent = text.lead;
document.querySelector("#othelloDescription").textContent = text.othelloDescription;
document.querySelector("#goDescription").textContent = text.goDescription;
document.querySelector(".game-cards").setAttribute("aria-label", text.gameSelection);

for (const [id, page] of [
  ["#othelloLink", "othello.html"],
  ["#goLink", "go.html"]
]) {
  const url = new URL(`./${page}`, window.location.href);
  url.searchParams.set("lang", currentLanguage);
  document.querySelector(id).href = url.href;
}
