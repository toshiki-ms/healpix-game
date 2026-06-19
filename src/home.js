const TRANSLATIONS = {
  en: {
    lead: "Board games on spherical HEALPix grids.",
    othelloDescription: "Spherical Othello with NPC difficulty, god-move hints, and index overlays.",
    goDescription: "Go on HEALPix pixel vertices with territory view, NPC difficulty, and move-order overlays.",
    asteroidTitle: "HEALPix Asteroid Garden",
    asteroidDescription: "A spherical garden sandbox simulation on HEALPix grids.",
    gameSelection: "Game selection",
    switchLanguage: "JPN",
    switchLanguageLabel: "Switch language to Japanese"
  },
  ja: {
    lead: "球面HEALPix格子で遊ぶボードゲーム集です。",
    othelloDescription: "NPC難易度、神の一手、番号表示つきの球面オセロです。",
    goDescription: "HEALPixピクセル頂点に打つ囲碁です。地表示、NPC難易度、着手順表示に対応しています。",
    asteroidTitle: "HEALPix Asteroid Garden",
    asteroidDescription: "HEALPix球面で庭を世話する箱庭シミュレーションです。",
    gameSelection: "ゲーム選択",
    switchLanguage: "EN",
    switchLanguageLabel: "表示言語を英語に切り替え"
  }
};

const languageOptions = new Set(Object.keys(TRANSLATIONS));
const requestedLanguage = new URLSearchParams(window.location.search).get("lang");
const storedLanguage =
  window.localStorage.getItem("healpixGameLanguage") ??
  window.localStorage.getItem("healpixOthelloLanguage") ??
  window.localStorage.getItem("healpixGoLanguage");
let currentLanguage = languageOptions.has(requestedLanguage)
  ? requestedLanguage
  : languageOptions.has(storedLanguage)
    ? storedLanguage
    : navigator.language.startsWith("ja")
      ? "ja"
      : "en";

const homeLanguageToggle = document.querySelector("#homeLanguageToggle");

homeLanguageToggle.addEventListener("click", toggleLanguage);
applyLanguage();

function applyLanguage() {
  window.localStorage.setItem("healpixGameLanguage", currentLanguage);
  document.documentElement.lang = currentLanguage;

  const text = TRANSLATIONS[currentLanguage];
  document.querySelector("#homeLead").textContent = text.lead;
  document.querySelector("#othelloDescription").textContent = text.othelloDescription;
  document.querySelector("#goDescription").textContent = text.goDescription;
  document.querySelector("#asteroidTitle").textContent = text.asteroidTitle;
  document.querySelector("#asteroidDescription").textContent = text.asteroidDescription;
  document.querySelector(".game-cards").setAttribute("aria-label", text.gameSelection);
  homeLanguageToggle.textContent = text.switchLanguage;
  homeLanguageToggle.setAttribute("aria-label", text.switchLanguageLabel);

  for (const [id, page] of [
    ["#othelloLink", "othello.html"],
    ["#goLink", "go.html"],
    ["#asteroidLink", "asteroid.html"]
  ]) {
    const url = new URL(`./${page}`, window.location.href);
    url.searchParams.set("lang", currentLanguage);
    document.querySelector(id).href = url.href;
  }
}

function toggleLanguage() {
  currentLanguage = currentLanguage === "en" ? "ja" : "en";
  const url = new URL(window.location.href);
  url.searchParams.set("lang", currentLanguage);
  window.history.replaceState(null, "", url);
  applyLanguage();
}
