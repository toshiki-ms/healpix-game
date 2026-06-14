import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  BLACK,
  EMPTY,
  WHITE,
  analyzeGoMove,
  applyGoMove,
  chooseGoNpcMove,
  classifyGoTerritory,
  createGoState,
  createPoleSet,
  passGoTurn,
  scoreGoGame,
  toggleDeadGroup,
  validGoMoves
} from "./go-game.js";
import { createHealpixVertexTopology } from "./healpix.js";

const supportedNsides = new Set([2, 4]);
const requestedNside = Number(new URLSearchParams(window.location.search).get("nside"));
const storedNside = Number(window.localStorage.getItem("healpixGoNside"));
let currentNside = supportedNsides.has(requestedNside)
  ? requestedNside
  : supportedNsides.has(storedNside)
    ? storedNside
    : 2;
let topology = createHealpixVertexTopology(currentNside);
let poleIds = createPoleSet(topology);
let playablePointCount = topology.vertices.length - poleIds.size;

const canvas = document.querySelector("#board");
const resolutionLabel = document.querySelector("#resolutionLabel");
const blackScore = document.querySelector("#blackScore");
const whiteScore = document.querySelector("#whiteScore");
const blackScoreLabel = document.querySelector("#blackScoreLabel");
const whiteScoreLabel = document.querySelector("#whiteScoreLabel");
const turnLabel = document.querySelector("#turnLabel");
const message = document.querySelector("#message");
const blackNpcToggle = document.querySelector("#blackNpcToggle");
const whiteNpcToggle = document.querySelector("#whiteNpcToggle");
const blackDifficultyLabel = document.querySelector("#blackDifficultyLabel");
const whiteDifficultyLabel = document.querySelector("#whiteDifficultyLabel");
const difficultyGroup = document.querySelector(".go-difficulty");
const difficultyButtons = [...document.querySelectorAll("[data-go-player][data-go-difficulty]")];
const goNsideSelect = document.querySelector("#goNsideSelect");
const passButton = document.querySelector("#passButton");
const territoryToggle = document.querySelector("#territoryToggle");
const resetButton = document.querySelector("#resetButton");
const godHintButton = document.querySelector("#godHintButton");
const goOverlayToggle = document.querySelector("#goOverlayToggle");
const controlStack = document.querySelector("#controlStack");
const homeButton = document.querySelector("#homeButton");
const controlsToggle = document.querySelector("#controlsToggle");
const hud = document.querySelector(".hud");
const netBoard = document.querySelector("#netBoard");
const netPanel = document.querySelector(".net-panel");
const netTitle = document.querySelector("#netTitle");
const netToggle = document.querySelector("#netToggle");
const axisWidget = document.querySelector("#axisWidget");
const axisTextZ = document.querySelector("#axisTextZ");
const axisWidgetItems = [
  {
    line: document.querySelector("#axisLineX"),
    text: document.querySelector("#axisTextX"),
    direction: new THREE.Vector3(1, 0, 0),
    fallback: new THREE.Vector2(48, 0),
    halfWidth: 16
  },
  {
    line: document.querySelector("#axisLineY"),
    text: document.querySelector("#axisTextY"),
    direction: new THREE.Vector3(0, 1, 0),
    fallback: new THREE.Vector2(-38, -34),
    halfWidth: 16
  },
  {
    line: document.querySelector("#axisLineZ"),
    text: document.querySelector("#axisTextZ"),
    direction: new THREE.Vector3(0, 0, 1),
    fallback: new THREE.Vector2(12, -46),
    halfWidth: 31
  },
  {
    line: document.querySelector("#axisLineSouth"),
    text: null,
    direction: new THREE.Vector3(0, 0, -1),
    fallback: new THREE.Vector2(-12, 48),
    halfWidth: 31
  }
];

const TRANSLATIONS = {
  en: {
    axisNorth: "+Z North",
    black: "Black",
    white: "White",
    blackShort: "Black",
    whiteShort: "White",
    human: "Human",
    npc: "NPC",
    difficultyAria: "NPC difficulty by color",
    difficulties: {
      weak: "Weak",
      medium: "Medium",
      strong: "Strong",
      expert: "Expert",
      god: "God"
    },
    pass: "Pass",
    territory: "Territory",
    hideTerritory: "Hide area",
    territoryBlackMark: "B",
    territoryWhiteMark: "W",
    territoryLegend: (black, white, neutral) => `Black area ${black} / White area ${white} / Neutral ${neutral}`,
    godHint: "God move",
    playHint: "Play this move",
    playHintPass: "Pass",
    calculatingHint: "Calculating",
    calculatingMessage: "Calculating god move",
    noHint: "No god move",
    hintShown: "God move highlighted",
    passHintShown: "God move is pass",
    newGame: "New",
    net: "Vertex map",
    overlayModes: {
      off: "Index off",
      index: "Vertex index",
      move: "Move order"
    },
    overlayModeLabel: (mode) => `Show ${mode} overlay`,
    showSettings: "Settings",
    hideSettings: "Hide settings",
    showSettingsLabel: "Show game settings",
    hideSettingsLabel: "Hide game settings",
    home: "Home",
    homeLabel: "Back to HEALPix Games",
    showMap: "Open",
    hideMap: "Hide",
    showMapLabel: "Show vertex map",
    hideMapLabel: "Hide vertex map",
    turn: (color, npc) => `${color} turn${npc ? " NPC" : ""}`,
    gameOver: "Game over",
    scoreLine: (black, white, neutral, deadBlack, deadWhite) =>
      `Territory score Black ${black} - White ${white} / Neutral ${neutral} / Dead ${deadBlack}-${deadWhite}`,
    captures: (blackCaptures, whiteCaptures) => `Captures ${blackCaptures}-${whiteCaptures}`,
    scoring: "Scoring",
    noMoves: "No legal moves / pass",
    passed: (color) => `${color} passed`,
    illegal: {
      "game-over": "Game already ended",
      pole: "Poles are neutral",
      occupied: "Occupied point",
      suicide: "Suicide is not allowed",
      ko: "Ko recapture is not allowed"
    }
  },
  ja: {
    axisNorth: "+Z 北",
    black: "黒",
    white: "白",
    blackShort: "黒",
    whiteShort: "白",
    human: "PC",
    npc: "NPC",
    difficultyAria: "色ごとのNPC難易度",
    difficulties: {
      weak: "弱",
      medium: "中",
      strong: "強",
      expert: "最強",
      god: "神"
    },
    pass: "パス",
    territory: "地表示",
    hideTerritory: "地を隠す",
    territoryBlackMark: "黒",
    territoryWhiteMark: "白",
    territoryLegend: (black, white, neutral) => `黒地 ${black} / 白地 ${white} / 中立 ${neutral}`,
    godHint: "神の一手",
    playHint: "この手を打つ",
    playHintPass: "パスする",
    calculatingHint: "計算中",
    calculatingMessage: "神の一手を計算中",
    noHint: "神の一手なし",
    hintShown: "神の一手を表示",
    passHintShown: "神の一手はパス",
    newGame: "新規",
    net: "頂点展開図",
    overlayModes: {
      off: "番号なし",
      index: "頂点番号",
      move: "着手順"
    },
    overlayModeLabel: (mode) => `${mode}を表示`,
    showSettings: "設定",
    hideSettings: "設定を隠す",
    showSettingsLabel: "ゲーム設定を表示",
    hideSettingsLabel: "ゲーム設定を隠す",
    home: "ホーム",
    homeLabel: "HEALPix Gamesに戻る",
    showMap: "開く",
    hideMap: "隠す",
    showMapLabel: "頂点展開図を表示",
    hideMapLabel: "頂点展開図を隠す",
    turn: (color, npc) => `${color}番${npc ? " NPC" : ""}`,
    gameOver: "終了",
    scoreLine: (black, white, neutral, deadBlack, deadWhite) =>
      `地計算 黒 ${black} - 白 ${white} / 中立 ${neutral} / 死石 ${deadBlack}-${deadWhite}`,
    captures: (blackCaptures, whiteCaptures) => `アゲハマ ${blackCaptures}-${whiteCaptures}`,
    scoring: "死石指定",
    noMoves: "合法手なし / パスしてください",
    passed: (color) => `${color}パス`,
    illegal: {
      "game-over": "終局しています",
      pole: "極点は中立です",
      occupied: "すでに石があります",
      suicide: "自殺手です",
      ko: "コウの取り返しはできません"
    }
  }
};

const languageOptions = new Set(Object.keys(TRANSLATIONS));
const requestedLanguage = new URLSearchParams(window.location.search).get("lang");
const storedLanguage =
  window.localStorage.getItem("healpixGameLanguage") ?? window.localStorage.getItem("healpixGoLanguage");
let currentLanguage = languageOptions.has(requestedLanguage)
  ? requestedLanguage
  : languageOptions.has(storedLanguage)
    ? storedLanguage
    : navigator.language.startsWith("ja")
      ? "ja"
      : "en";
window.localStorage.setItem("healpixGameLanguage", currentLanguage);
window.localStorage.setItem("healpixGoLanguage", currentLanguage);

const colors = {
  point: new THREE.Color("#8aa0a8"),
  hover: new THREE.Color("#d77b55"),
  last: new THREE.Color("#9e6fef"),
  hint: new THREE.Color("#f052be"),
  territoryBlack: new THREE.Color("#020303"),
  territoryWhite: new THREE.Color("#fff7df"),
  territoryNeutral: new THREE.Color("#81898a"),
  pole: new THREE.Color("#76d7e8"),
  poleInner: new THREE.Color("#d4fbff"),
  blackStone: new THREE.Color("#090a0b"),
  whiteStone: new THREE.Color("#eeeae0")
};

let state = createGoState(topology);
let hoveredVertexId = null;
let focusVertexId = null;
let legalMoves = new Set();
const difficultyOptions = new Set(["weak", "medium", "strong", "expert", "god"]);
let npcPlayers = new Set([WHITE]);
const goDifficulties = {
  [BLACK]: difficultyOptions.has(window.localStorage.getItem("healpixGoBlackDifficulty"))
    ? window.localStorage.getItem("healpixGoBlackDifficulty")
    : "medium",
  [WHITE]: difficultyOptions.has(window.localStorage.getItem("healpixGoWhiteDifficulty"))
    ? window.localStorage.getItem("healpixGoWhiteDifficulty")
    : "medium"
};
let aiTimer = 0;
let pointerDown = null;
let hasCameraFocusTarget = false;
let focusHoldUntil = 0;
const compactLayoutQuery = window.matchMedia("(max-width: 640px)");
const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
let controlsCollapsed = compactLayoutQuery.matches;
let netCollapsed = compactLayoutQuery.matches;
let panelChoiceChanged = false;
let territoryVisible = false;
let hintMoveId = null;
let hintPass = false;
let hintBusy = false;
let hintToken = 0;
const overlayModes = Object.freeze(["off", "index", "move"]);
let overlayMode = "off";
let overlaySpriteKey = "";

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false
});
const backgroundColor = new THREE.Color(0x50575a);
renderer.setClearColor(backgroundColor, 1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = backgroundColor;
scene.fog = new THREE.Fog(0x50575a, 5.6, 11.2);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
const initialCameraDistance = compactLayoutQuery.matches ? 7.4 : 6.25;
camera.up.set(0, 0, 1);
camera.position.set(initialCameraDistance, 0, 0);
camera.lookAt(0, 0, 0);
const cameraFocusTarget = new THREE.Vector3();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 2.15;
controls.maxDistance = 9.4;
controls.rotateSpeed = 0.62;
controls.zoomSpeed = 0.55;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.22;

const ambient = new THREE.HemisphereLight(0xffffff, 0x2c3031, 2.35);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.25);
keyLight.position.set(2.4, 3.1, 4.8);
scene.add(keyLight);

const viewFillLight = new THREE.DirectionalLight(0xffffff, 1.35);
viewFillLight.target.position.set(0, 0, 0);
scene.add(viewFillLight, viewFillLight.target);

const rimLight = new THREE.DirectionalLight(0x9de4d1, 0.85);
rimLight.position.set(-3.6, 1.4, 2.8);
scene.add(rimLight);

const globe = new THREE.Mesh(
  new THREE.SphereGeometry(0.984, 72, 36),
  new THREE.MeshStandardMaterial({
    color: 0x3f4648,
    roughness: 0.94,
    metalness: 0,
    transparent: true,
    opacity: 0.82
  })
);
scene.add(globe);

const lineGroup = new THREE.Group();
const pointGroup = new THREE.Group();
const hitTargetGroup = new THREE.Group();
const territoryGroup = new THREE.Group();
const stoneGroup = new THREE.Group();
const poleGroup = new THREE.Group();
const overlayLabelGroup = new THREE.Group();
scene.add(lineGroup, pointGroup, hitTargetGroup, territoryGroup, stoneGroup, poleGroup, overlayLabelGroup);

const unitZ = new THREE.Vector3(0, 0, 1);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointMeshes = new Map();
const netVertexGroups = new Map();
const pointGeometry = new THREE.SphereGeometry(1, 16, 10);
const hitTargetGeometry = new THREE.SphereGeometry(1, 12, 8);
const territoryRingGeometry = new THREE.RingGeometry(0.052, 0.075, 32);
const stoneGeometry = new THREE.SphereGeometry(1, 24, 14);
const poleGeometry = new THREE.RingGeometry(0.052, 0.076, 36);
const poleInnerGeometry = new THREE.RingGeometry(0.022, 0.03, 36);
const blackStoneMaterial = new THREE.MeshStandardMaterial({
  color: colors.blackStone,
  roughness: 0.38,
  metalness: 0.16
});
const whiteStoneMaterial = new THREE.MeshStandardMaterial({
  color: colors.whiteStone,
  roughness: 0.42,
  metalness: 0.02
});
const hitTargetMaterial = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  colorWrite: false
});
const deadBlackStoneMaterial = new THREE.MeshStandardMaterial({
  color: colors.blackStone,
  roughness: 0.5,
  metalness: 0.04,
  transparent: true,
  opacity: 0.36
});
const deadWhiteStoneMaterial = new THREE.MeshStandardMaterial({
  color: colors.whiteStone,
  roughness: 0.58,
  metalness: 0,
  transparent: true,
  opacity: 0.42
});
const blackTerritoryMaterial = new THREE.MeshBasicMaterial({
  color: colors.territoryBlack,
  transparent: true,
  opacity: 0.94,
  side: THREE.DoubleSide
});
const whiteTerritoryMaterial = new THREE.MeshBasicMaterial({
  color: colors.territoryWhite,
  transparent: true,
  opacity: 0.92,
  side: THREE.DoubleSide
});
const neutralTerritoryMaterial = new THREE.MeshBasicMaterial({
  color: colors.territoryNeutral,
  transparent: true,
  opacity: 0.58,
  side: THREE.DoubleSide
});
const poleMaterial = new THREE.MeshBasicMaterial({
  color: colors.pole,
  transparent: true,
  opacity: 0.86,
  side: THREE.DoubleSide
});
const poleInnerMaterial = new THREE.MeshBasicMaterial({
  color: colors.poleInner,
  transparent: true,
  opacity: 0.68,
  side: THREE.DoubleSide
});
const axisWidgetRotation = new THREE.Quaternion();
const axisWidgetDirection = new THREE.Vector3();

buildLines();
buildPoints();
buildPoles();
buildNet();
resize();
applyLanguage();
updatePlayerButtons();
refresh();
requestAiIfNeeded();
renderer.setAnimationLoop(render);

window.addEventListener("resize", resize);
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointerleave", clearHover);
goNsideSelect.addEventListener("change", changeGoNside);
blackNpcToggle.addEventListener("click", () => toggleNpc(BLACK));
whiteNpcToggle.addEventListener("click", () => toggleNpc(WHITE));
difficultyButtons.forEach((button) => button.addEventListener("click", setDifficulty));
godHintButton.addEventListener("click", requestGodHint);
passButton.addEventListener("click", requestPass);
territoryToggle.addEventListener("click", toggleTerritory);
resetButton.addEventListener("click", resetGame);
goOverlayToggle.addEventListener("click", toggleOverlayMode);
homeButton.addEventListener("click", goHome);
controlsToggle.addEventListener("click", toggleControlsPanel);
netToggle.addEventListener("click", toggleNetPanel);
if (compactLayoutQuery.addEventListener) {
  compactLayoutQuery.addEventListener("change", handleCompactLayoutChange);
} else {
  compactLayoutQuery.addListener(handleCompactLayoutChange);
}

function labels() {
  return TRANSLATIONS[currentLanguage];
}

function colorLabel(player) {
  return player === BLACK ? labels().black : labels().white;
}

function applyLanguage() {
  const text = labels();
  document.documentElement.lang = currentLanguage;
  goNsideSelect.value = String(topology.nside);
  blackScoreLabel.textContent = text.blackShort;
  whiteScoreLabel.textContent = text.whiteShort;
  blackDifficultyLabel.textContent = text.blackShort;
  whiteDifficultyLabel.textContent = text.whiteShort;
  difficultyGroup.setAttribute("aria-label", text.difficultyAria);
  for (const button of difficultyButtons) {
    button.textContent = text.difficulties[button.dataset.goDifficulty];
  }
  passButton.textContent = text.pass;
  territoryToggle.textContent = territoryVisible ? text.hideTerritory : text.territory;
  resetButton.textContent = text.newGame;
  if (!hintBusy) {
    godHintButton.textContent = text.godHint;
  }
  netTitle.textContent = text.net;
  axisTextZ.textContent = text.axisNorth;
  homeButton.textContent = text.home;
  homeButton.setAttribute("aria-label", text.homeLabel);
  updatePanelVisibility();
  updateOverlayButton();
}

function updatePanelVisibility() {
  const text = labels();
  hud.classList.toggle("controls-collapsed", controlsCollapsed);
  controlStack.hidden = controlsCollapsed;
  controlsToggle.setAttribute("aria-expanded", String(!controlsCollapsed));
  controlsToggle.textContent = controlsCollapsed ? text.showSettings : text.hideSettings;
  controlsToggle.setAttribute("aria-label", controlsCollapsed ? text.showSettingsLabel : text.hideSettingsLabel);

  netPanel.classList.toggle("collapsed", netCollapsed);
  netBoard.setAttribute("aria-hidden", String(netCollapsed));
  netToggle.setAttribute("aria-expanded", String(!netCollapsed));
  netToggle.textContent = netCollapsed ? text.showMap : text.hideMap;
  netToggle.setAttribute("aria-label", netCollapsed ? text.showMapLabel : text.hideMapLabel);
}

function toggleControlsPanel() {
  panelChoiceChanged = true;
  controlsCollapsed = !controlsCollapsed;
  updatePanelVisibility();
}

function toggleNetPanel() {
  panelChoiceChanged = true;
  netCollapsed = !netCollapsed;
  updatePanelVisibility();
}

function handleCompactLayoutChange(event) {
  if (panelChoiceChanged) {
    return;
  }

  controlsCollapsed = event.matches;
  netCollapsed = event.matches;
  updatePanelVisibility();
}

function goHome() {
  const url = new URL("./", window.location.href);
  url.searchParams.set("lang", currentLanguage);
  window.location.href = url.href;
}

function changeGoNside() {
  const nextNside = Number(goNsideSelect.value);
  if (!supportedNsides.has(nextNside) || nextNside === topology.nside) {
    goNsideSelect.value = String(topology.nside);
    return;
  }

  window.clearTimeout(aiTimer);
  currentNside = nextNside;
  topology = createHealpixVertexTopology(currentNside);
  poleIds = createPoleSet(topology);
  playablePointCount = topology.vertices.length - poleIds.size;
  state = createGoState(topology);
  hoveredVertexId = null;
  focusVertexId = null;
  hasCameraFocusTarget = false;
  focusHoldUntil = 0;
  territoryVisible = false;
  clearHint();

  window.localStorage.setItem("healpixGoNside", String(currentNside));
  const url = new URL(window.location.href);
  url.searchParams.set("nside", String(currentNside));
  window.history.replaceState(null, "", url);

  buildLines();
  buildPoints();
  buildPoles();
  buildNet();
  resetCameraView();
  refresh();
  requestAiIfNeeded();
}

function resetCameraView() {
  const distance = compactLayoutQuery.matches ? 7.4 : 6.25;
  controls.target.set(0, 0, 0);
  camera.position.set(distance, 0, 0);
  camera.lookAt(0, 0, 0);
  controls.update();
}

function vectorForVertex(vertex) {
  return vectorForNormal(vertex.normal);
}

function vectorForNormal(normal) {
  return new THREE.Vector3(normal[0], normal[2], normal[1]).normalize();
}

function buildLines() {
  lineGroup.clear();
  const positions = [];

  for (const [a, b] of topology.edges) {
    if (poleIds.has(a) || poleIds.has(b)) {
      continue;
    }

    const start = vectorForVertex(topology.vertices[a]).multiplyScalar(1.035);
    const end = vectorForVertex(topology.vertices[b]).multiplyScalar(1.035);
    positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0xe5ddc7,
    transparent: true,
    opacity: 0.72
  });
  lineGroup.add(new THREE.LineSegments(geometry, material));
}

function buildPoints() {
  pointGroup.clear();
  hitTargetGroup.clear();
  pointMeshes.clear();
  const hitTargetScale = topology.nside === 2
    ? coarsePointerQuery.matches
      ? 0.23
      : 0.14
    : coarsePointerQuery.matches
      ? 0.12
      : 0.085;

  for (const vertex of topology.vertices) {
    if (poleIds.has(vertex.id)) {
      continue;
    }

    const material = new THREE.MeshStandardMaterial({
      color: colors.point,
      roughness: 0.64,
      metalness: 0.02
    });
    const point = new THREE.Mesh(pointGeometry, material);
    const normal = vectorForVertex(vertex);
    point.position.copy(normal).multiplyScalar(1.065);
    point.scale.setScalar(0.025);
    point.userData.vertexId = vertex.id;
    pointGroup.add(point);
    pointMeshes.set(vertex.id, point);

    const hitTarget = new THREE.Mesh(hitTargetGeometry, hitTargetMaterial);
    hitTarget.position.copy(normal).multiplyScalar(1.067);
    hitTarget.scale.setScalar(hitTargetScale);
    hitTarget.userData.vertexId = vertex.id;
    hitTargetGroup.add(hitTarget);
  }
}

function buildPoles() {
  poleGroup.clear();

  for (const vertexId of poleIds) {
    const vertex = topology.vertices[vertexId];
    const normal = vectorForVertex(vertex);
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    const poleInner = new THREE.Mesh(poleInnerGeometry, poleInnerMaterial);
    pole.position.copy(normal).multiplyScalar(1.072);
    poleInner.position.copy(normal).multiplyScalar(1.075);
    pole.quaternion.setFromUnitVectors(unitZ, normal);
    poleInner.quaternion.setFromUnitVectors(unitZ, normal);
    poleGroup.add(pole, poleInner);
  }
}

function buildNet() {
  const namespace = "http://www.w3.org/2000/svg";
  const xValues = topology.vertices.map((vertex) => vertex.gridJp);
  const yValues = topology.vertices.map((vertex) => vertex.gridJr);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  netBoard.setAttribute("viewBox", `${minX - 0.8} ${minY - 0.65} ${maxX - minX + 1.6} ${maxY - minY + 1.3}`);
  netBoard.replaceChildren();
  netVertexGroups.clear();
  overlaySpriteKey = "";
  disposeOverlaySprites();

  const edgeLayer = document.createElementNS(namespace, "g");
  edgeLayer.classList.add("go-net-lines");
  for (const [a, b] of topology.edges) {
    if (poleIds.has(a) || poleIds.has(b)) {
      continue;
    }

    const start = topology.vertices[a];
    const end = topology.vertices[b];
    if (Math.abs(start.gridJp - end.gridJp) > topology.nside * 4) {
      continue;
    }

    const line = document.createElementNS(namespace, "line");
    line.classList.add("go-net-line");
    line.setAttribute("x1", String(start.gridJp));
    line.setAttribute("y1", String(start.gridJr));
    line.setAttribute("x2", String(end.gridJp));
    line.setAttribute("y2", String(end.gridJr));
    edgeLayer.append(line);
  }
  netBoard.append(edgeLayer);

  const sortedVertices = topology.vertices
    .filter((vertex) => !poleIds.has(vertex.id))
    .sort((a, b) => a.gridJr - b.gridJr || a.gridJp - b.gridJp);

  for (const vertex of sortedVertices) {
    const group = document.createElementNS(namespace, "g");
    const hitTarget = document.createElementNS(namespace, "circle");
    const point = document.createElementNS(namespace, "circle");
    const ownerLabel = document.createElementNS(namespace, "text");
    const stone = document.createElementNS(namespace, "circle");
    const overlayLabel = document.createElementNS(namespace, "text");

    group.classList.add("go-net-vertex");
    group.dataset.vertexId = String(vertex.id);
    hitTarget.classList.add("go-net-hit");
    hitTarget.setAttribute("cx", String(vertex.gridJp));
    hitTarget.setAttribute("cy", String(vertex.gridJr));
    hitTarget.setAttribute("r", "0.34");
    point.classList.add("go-net-point");
    point.setAttribute("cx", String(vertex.gridJp));
    point.setAttribute("cy", String(vertex.gridJr));
    point.setAttribute("r", "0.11");
    ownerLabel.classList.add("go-net-owner");
    ownerLabel.setAttribute("x", String(vertex.gridJp));
    ownerLabel.setAttribute("y", String(vertex.gridJr));
    stone.classList.add("go-net-stone");
    stone.setAttribute("cx", String(vertex.gridJp));
    stone.setAttribute("cy", String(vertex.gridJr));
    stone.setAttribute("r", "0.23");
    overlayLabel.classList.add("go-net-overlay-label");
    overlayLabel.setAttribute("x", String(vertex.gridJp));
    overlayLabel.setAttribute("y", String(vertex.gridJr));

    group.append(hitTarget, point, ownerLabel, stone, overlayLabel);
    group.addEventListener("pointerenter", () => {
      hoveredVertexId = vertex.id;
      focusVertexId = vertex.id;
      refresh();
    });
    group.addEventListener("pointerleave", () => {
      if (hoveredVertexId === vertex.id) {
        hoveredVertexId = null;
        refresh();
      }
    });
    group.addEventListener("click", () => {
      focusVertexId = vertex.id;
      nudgeCameraTowardVertex(vertex.id);
      if (state.gameOver) {
        toggleDeadAtVertex(vertex.id);
      } else if (!isNpcTurn()) {
        playVertex(vertex.id);
      }
    });

    netBoard.append(group);
    netVertexGroups.set(vertex.id, { group, point, ownerLabel, stone, overlayLabel });
  }
}

function labelForOverlay(vertex) {
  if (overlayMode === "index") {
    return String(vertex.id);
  }

  if (overlayMode === "move") {
    const moveNumber = state.moveNumbers?.[vertex.id];
    return state.board[vertex.id] !== EMPTY && moveNumber !== null && moveNumber !== undefined ? String(moveNumber) : "";
  }

  return "";
}

function updateOverlayButton() {
  const text = labels();
  const label = text.overlayModes[overlayMode];
  goOverlayToggle.textContent = label;
  goOverlayToggle.setAttribute("aria-pressed", String(overlayMode !== "off"));
  goOverlayToggle.setAttribute("aria-label", text.overlayModeLabel(label));
}

function toggleOverlayMode() {
  const currentIndex = overlayModes.indexOf(overlayMode);
  overlayMode = overlayModes[(currentIndex + 1) % overlayModes.length];
  updateOverlayButton();
  updateOverlayLabels();
}

function updateOverlayLabels() {
  const isVisible = overlayMode !== "off";

  for (const vertex of topology.vertices) {
    if (poleIds.has(vertex.id)) {
      continue;
    }

    const label = labelForOverlay(vertex);
    const netVertex = netVertexGroups.get(vertex.id);
    if (netVertex) {
      netVertex.group.classList.toggle("show-overlay", isVisible && label !== "");
      netVertex.group.classList.toggle("overlay-move", overlayMode === "move");
      netVertex.overlayLabel.textContent = label;
    }
  }

  rebuildOverlaySprites();
}

function disposeOverlaySprites() {
  for (const label of overlayLabelGroup.children) {
    label.material.map?.dispose();
    label.material.dispose();
  }

  overlayLabelGroup.clear();
}

function rebuildOverlaySprites() {
  const nextKey =
    overlayMode === "off"
      ? "off"
      : `${topology.nside}:${overlayMode}:${topology.vertices.map((vertex) => labelForOverlay(vertex)).join(",")}`;
  if (nextKey === overlaySpriteKey) {
    return;
  }

  disposeOverlaySprites();
  overlaySpriteKey = nextKey;

  if (overlayMode === "off") {
    return;
  }

  for (const vertex of topology.vertices) {
    if (poleIds.has(vertex.id)) {
      continue;
    }

    const label = labelForOverlay(vertex);
    if (label === "") {
      continue;
    }

    const sprite = createOverlayLabelSprite(label, overlayMode);
    const normal = vectorForVertex(vertex);
    sprite.position.copy(normal).multiplyScalar(overlayMode === "move" ? 1.145 : 1.13);
    sprite.userData.vertexId = vertex.id;
    overlayLabelGroup.add(sprite);
  }
}

function createOverlayLabelSprite(label, mode) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const width = Math.max(54, label.length * 20 + 22);
  const height = 46;
  const pixelRatio = 2;
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  context.scale(pixelRatio, pixelRatio);
  context.fillStyle = mode === "move" ? "rgba(15, 17, 18, 0.82)" : "rgba(17, 24, 27, 0.7)";
  context.strokeStyle = mode === "move" ? "rgba(246, 231, 176, 0.86)" : "rgba(219, 239, 240, 0.72)";
  context.lineWidth = 2;
  roundRect(context, 3, 3, width - 6, height - 6, 8);
  context.fill();
  context.stroke();
  context.fillStyle = mode === "move" ? "#f8edbe" : "#edf7f6";
  context.font = "850 22px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, width / 2, height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  const scale = mode === "move" ? 0.13 : 0.105;
  sprite.scale.set(scale * (width / 54), scale * (height / 54), 1);
  return sprite;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function refresh() {
  const moves = validGoMoves(topology, state, poleIds);
  legalMoves = new Set(moves);
  const territory = territoryVisible || state.gameOver ? classifyGoTerritory(topology, state, poleIds).ownerByPoint : new Map();
  const deadStones = state.deadStones ?? new Set();

  for (const vertex of topology.vertices) {
    if (poleIds.has(vertex.id)) {
      continue;
    }

    const mesh = pointMeshes.get(vertex.id);
    const value = state.board[vertex.id];
    const isDead = deadStones.has(vertex.id);
    const territoryOwner = territory.get(vertex.id);
    const isHovered = hoveredVertexId === vertex.id;
    const isHint = hintMoveId === vertex.id && legalMoves.has(vertex.id);
    const isLast = state.lastMove?.type === "move" && state.lastMove.vertexId === vertex.id;

    if (isHovered) {
      mesh.material.color.copy(colors.hover);
      mesh.material.emissive.copy(colors.hover).multiplyScalar(0.25);
      mesh.scale.setScalar(0.045);
    } else if (isHint) {
      mesh.material.color.copy(colors.hint);
      mesh.material.emissive.copy(colors.hint).multiplyScalar(0.22);
      mesh.scale.setScalar(0.05);
    } else if (isLast) {
      mesh.material.color.copy(colors.last);
      mesh.material.emissive.copy(colors.last).multiplyScalar(0.22);
      mesh.scale.setScalar(0.038);
    } else if (territory.has(vertex.id)) {
      mesh.material.color.copy(colors.point);
      mesh.material.emissive.setRGB(0, 0, 0);
      mesh.scale.setScalar(territoryOwner === null ? 0.019 : 0.022);
    } else {
      mesh.material.color.copy(colors.point);
      mesh.material.emissive.setRGB(0, 0, 0);
      mesh.scale.setScalar(value === EMPTY ? 0.025 : 0.016);
    }

    const netVertex = netVertexGroups.get(vertex.id);
    if (netVertex) {
      netVertex.group.classList.toggle("hovered", isHovered);
      netVertex.group.classList.toggle("hint", isHint);
      netVertex.group.classList.toggle("last", isLast);
      netVertex.group.classList.toggle("territory-black", territoryOwner === BLACK);
      netVertex.group.classList.toggle("territory-white", territoryOwner === WHITE);
      netVertex.group.classList.toggle("territory-neutral", territory.has(vertex.id) && territoryOwner === null);
      netVertex.ownerLabel.textContent =
        territoryOwner === BLACK ? labels().territoryBlackMark : territoryOwner === WHITE ? labels().territoryWhiteMark : "";
      netVertex.stone.classList.toggle("black", value === BLACK);
      netVertex.stone.classList.toggle("white", value === WHITE);
      netVertex.stone.classList.toggle("dead", isDead);
    }
  }

  updateTerritoryMarkers(territory, deadStones);
  updateStones();
  updateOverlayLabels();
  updateHud(moves.length);
}

function updateTerritoryMarkers(territory, deadStones) {
  territoryGroup.clear();

  for (const [vertexId, owner] of territory) {
    const value = state.board[vertexId];
    if (value !== EMPTY && !deadStones.has(vertexId)) {
      continue;
    }

    const vertex = topology.vertices[vertexId];
    const normal = vectorForVertex(vertex);
    const material =
      owner === BLACK ? blackTerritoryMaterial : owner === WHITE ? whiteTerritoryMaterial : neutralTerritoryMaterial;
    const marker = new THREE.Mesh(territoryRingGeometry, material);
    marker.position.copy(normal).multiplyScalar(1.088);
    marker.quaternion.setFromUnitVectors(unitZ, normal);
    marker.scale.setScalar(owner === null ? 0.72 : 1);
    territoryGroup.add(marker);
  }
}

function updateStones() {
  stoneGroup.clear();
  const deadStones = state.deadStones ?? new Set();

  for (const vertex of topology.vertices) {
    const value = state.board[vertex.id];
    if (value === EMPTY || poleIds.has(vertex.id)) {
      continue;
    }

    const normal = vectorForVertex(vertex);
    const isDead = deadStones.has(vertex.id);
    const material =
      value === BLACK
        ? isDead
          ? deadBlackStoneMaterial
          : blackStoneMaterial
        : isDead
          ? deadWhiteStoneMaterial
          : whiteStoneMaterial;
    const stone = new THREE.Mesh(stoneGeometry, material);
    stone.position.copy(normal).multiplyScalar(1.092);
    stone.quaternion.setFromUnitVectors(unitZ, normal);
    stone.scale.set(0.062, 0.062, isDead ? 0.01 : 0.019);
    stone.userData.vertexId = vertex.id;
    stoneGroup.add(stone);
  }
}

function updateHud(moveTotal) {
  const score = scoreGoGame(topology, state, poleIds);
  const text = labels();
  resolutionLabel.textContent = `NSIDE ${topology.nside} / ${playablePointCount} ${currentLanguage === "ja" ? "着手点" : "playable points"}`;
  blackScore.textContent = String(score.blackScore);
  whiteScore.textContent = String(score.whiteScore);
  territoryToggle.setAttribute("aria-pressed", String(territoryVisible));
  territoryToggle.textContent = territoryVisible ? text.hideTerritory : text.territory;

  if (state.gameOver) {
    turnLabel.textContent = text.scoring;
    turnLabel.style.color = "#f0c84b";
    message.textContent = text.scoreLine(
      score.blackScore,
      score.whiteScore,
      score.neutral,
      score.deadBlack,
      score.deadWhite
    );
  } else {
    turnLabel.textContent = text.turn(colorLabel(state.current), isNpcTurn());
    turnLabel.style.color = state.current === BLACK ? "#64c3a5" : "#f0c84b";

    if (state.lastMove?.type === "pass") {
      message.textContent = moveTotal === 0 ? text.noMoves : text.passed(colorLabel(state.lastMove.player));
    } else if (territoryVisible) {
      message.textContent = text.territoryLegend(score.blackTerritory, score.whiteTerritory, score.neutral);
    } else {
      message.textContent = moveTotal === 0 ? text.noMoves : text.captures(state.captures[BLACK], state.captures[WHITE]);
    }
  }

  passButton.disabled = state.gameOver || isNpcTurn();
  const canRequestHint = !state.gameOver && !isNpcTurn();
  godHintButton.disabled = hintBusy || !canRequestHint;
  if (hintBusy) {
    godHintButton.textContent = text.calculatingHint;
  } else if (hintMoveId !== null && legalMoves.has(hintMoveId)) {
    godHintButton.textContent = text.playHint;
  } else if (hintPass) {
    godHintButton.textContent = text.playHintPass;
  } else {
    godHintButton.textContent = text.godHint;
  }
}

function playVertex(vertexId) {
  const analysis = analyzeGoMove(topology, state, vertexId, poleIds);
  if (!analysis.ok) {
    message.textContent = labels().illegal[analysis.reason] ?? labels().illegal.occupied;
    return;
  }

  state = applyGoMove(topology, state, vertexId, poleIds);
  clearHint();
  hoveredVertexId = null;
  focusVertexId = vertexId;
  refresh();
  requestAiIfNeeded();
}

function requestPass() {
  if (isNpcTurn()) {
    return;
  }

  clearHint();
  state = passGoTurn(state);
  if (state.gameOver) {
    territoryVisible = true;
  }
  refresh();
  requestAiIfNeeded();
}

function toggleTerritory() {
  territoryVisible = !territoryVisible;
  refresh();
}

function toggleDeadAtVertex(vertexId) {
  const nextState = toggleDeadGroup(topology, state, vertexId, poleIds);
  if (nextState !== state) {
    state = nextState;
    territoryVisible = true;
    refresh();
  }
}

function resetGame() {
  window.clearTimeout(aiTimer);
  state = createGoState(topology);
  hoveredVertexId = null;
  focusVertexId = null;
  hasCameraFocusTarget = false;
  focusHoldUntil = 0;
  territoryVisible = false;
  clearHint();
  refresh();
  requestAiIfNeeded();
}

function isNpcTurn(player = state.current) {
  return npcPlayers.has(player) && !state.gameOver;
}

function requestAiIfNeeded() {
  window.clearTimeout(aiTimer);

  if (!isNpcTurn()) {
    return;
  }

  aiTimer = window.setTimeout(() => {
    if (!isNpcTurn()) {
      return;
    }

    clearHint();
    const move = chooseGoNpcMove(topology, state, poleIds, { level: goDifficulties[state.current] });
    if (move === null) {
      state = passGoTurn(state);
      if (state.gameOver) {
        territoryVisible = true;
      }
    } else {
      state = applyGoMove(topology, state, move, poleIds);
      focusVertexId = move;
    }

    refresh();
    requestAiIfNeeded();
  }, 430);
}

function toggleNpc(player) {
  clearHint();
  if (npcPlayers.has(player)) {
    npcPlayers.delete(player);
  } else {
    npcPlayers.add(player);
  }

  updatePlayerButtons();
  refresh();
  requestAiIfNeeded();
}

function updatePlayerButtons() {
  const text = labels();
  const joiner = currentLanguage === "ja" ? "" : " ";
  const blackIsNpc = npcPlayers.has(BLACK);
  const whiteIsNpc = npcPlayers.has(WHITE);
  blackNpcToggle.setAttribute("aria-pressed", String(blackIsNpc));
  whiteNpcToggle.setAttribute("aria-pressed", String(whiteIsNpc));
  blackNpcToggle.textContent = `${text.blackShort}${joiner}${blackIsNpc ? text.npc : text.human}`;
  whiteNpcToggle.textContent = `${text.whiteShort}${joiner}${whiteIsNpc ? text.npc : text.human}`;
  updateDifficultyButtons();
}

function updateDifficultyButtons() {
  for (const button of difficultyButtons) {
    const player = button.dataset.goPlayer === "black" ? BLACK : WHITE;
    button.setAttribute("aria-pressed", String(button.dataset.goDifficulty === goDifficulties[player]));
  }
}

function setDifficulty(event) {
  const button = event.currentTarget;
  const player = button.dataset.goPlayer === "black" ? BLACK : WHITE;
  const difficulty = button.dataset.goDifficulty;
  if (!difficultyOptions.has(difficulty)) {
    return;
  }

  goDifficulties[player] = difficulty;
  window.localStorage.setItem(player === BLACK ? "healpixGoBlackDifficulty" : "healpixGoWhiteDifficulty", difficulty);

  updateDifficultyButtons();
  requestAiIfNeeded();
}

function positionKey() {
  const history = state.positionHistory ? [...state.positionHistory].join("|") : "";
  return `${topology.nside}:${state.current}:${state.consecutivePasses}:${state.board.join(",")}:${history}`;
}

function clearHint() {
  hintMoveId = null;
  hintPass = false;
  hintBusy = false;
  hintToken += 1;
}

function requestGodHint() {
  if (hintBusy || state.gameOver || isNpcTurn()) {
    return;
  }

  if (hintMoveId !== null && legalMoves.has(hintMoveId)) {
    playVertex(hintMoveId);
    return;
  }

  if (hintPass) {
    requestPass();
    return;
  }

  const requestKey = positionKey();
  const requestToken = hintToken + 1;
  hintToken = requestToken;
  hintMoveId = null;
  hintPass = false;
  hintBusy = true;
  godHintButton.disabled = true;
  godHintButton.textContent = labels().calculatingHint;
  message.textContent = labels().calculatingMessage;

  window.setTimeout(() => {
    if (hintToken !== requestToken || positionKey() !== requestKey || state.gameOver || isNpcTurn()) {
      clearHint();
      refresh();
      return;
    }

    const move = chooseGoNpcMove(topology, state, poleIds, { level: "god" });
    hintBusy = false;

    if (hintToken !== requestToken || positionKey() !== requestKey) {
      clearHint();
      refresh();
      return;
    }

    if (move === null) {
      hintPass = true;
      hoveredVertexId = null;
      refresh();
      message.textContent = labels().passHintShown;
      return;
    }

    if (!validGoMoves(topology, state, poleIds).includes(move)) {
      clearHint();
      refresh();
      message.textContent = labels().noHint;
      return;
    }

    hintMoveId = move;
    hoveredVertexId = null;
    focusVertexId = move;
    nudgeCameraTowardVertex(move, 1600);
    refresh();
    message.textContent = labels().hintShown;
  }, 30);
}

function nudgeCameraTowardVertex(vertexId, holdMs = 1200) {
  const vertex = topology.vertices[vertexId];
  if (!vertex) {
    return;
  }

  const normal = vectorForVertex(vertex);
  const currentDirection = camera.position.clone().sub(controls.target).normalize();
  const distance = camera.position.distanceTo(controls.target);
  const targetDirection = currentDirection.lerp(normal, 0.16).normalize();
  cameraFocusTarget.copy(targetDirection.multiplyScalar(distance).add(controls.target));
  controls.target.set(0, 0, 0);
  hasCameraFocusTarget = true;
  focusHoldUntil = performance.now() + holdMs;
}

function render() {
  if (hasCameraFocusTarget) {
    camera.position.lerp(cameraFocusTarget, 0.07);
    if (camera.position.distanceTo(cameraFocusTarget) < 0.008) {
      camera.position.copy(cameraFocusTarget);
      hasCameraFocusTarget = false;
    }
  }

  const focusHold = hasCameraFocusTarget || performance.now() < focusHoldUntil;
  controls.autoRotate = !pointerDown && hoveredVertexId === null && !focusHold && !state.gameOver;
  controls.update();
  updateViewFillLight();
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.setScissorTest(false);
  renderer.render(scene, camera);
  positionAxisWidget();
}

function updateViewFillLight() {
  viewFillLight.position.copy(camera.position).normalize().multiplyScalar(4.8);
  viewFillLight.target.updateMatrixWorld();
}

function positionAxisWidget() {
  if (!axisWidget) {
    return;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const size = Math.round(THREE.MathUtils.clamp(Math.min(viewportWidth, viewportHeight) * 0.2, 150, 185));
  const left = 18;
  let bottom = 18;

  if (netPanel && viewportWidth <= 840) {
    const netBounds = netPanel.getBoundingClientRect();
    const overlapsLeft = netBounds.left < left + size + 12;
    const overlapsBottom = netBounds.bottom > viewportHeight - bottom - size;
    if (overlapsLeft && overlapsBottom) {
      bottom = Math.round(viewportHeight - netBounds.top + 14);
    }
  }

  bottom = Math.round(THREE.MathUtils.clamp(bottom, 18, Math.max(18, viewportHeight - size - 18)));
  axisWidget.style.width = `${size}px`;
  axisWidget.style.height = `${size}px`;
  axisWidget.style.left = `${left}px`;
  axisWidget.style.bottom = `${bottom}px`;
  updateAxisWidgetDirections();
}

function updateAxisWidgetDirections() {
  const centerX = 78;
  const centerY = 82;
  const arrowRadius = 54;
  const labelRadius = 64;
  axisWidgetRotation.copy(camera.quaternion).invert();

  for (const item of axisWidgetItems) {
    if (!item.line) {
      continue;
    }

    axisWidgetDirection.copy(item.direction).applyQuaternion(axisWidgetRotation);
    const projectedLength = Math.hypot(axisWidgetDirection.x, axisWidgetDirection.y);
    const endX = centerX + axisWidgetDirection.x * arrowRadius;
    const endY = centerY - axisWidgetDirection.y * arrowRadius;

    item.line.setAttribute("x1", centerX);
    item.line.setAttribute("y1", centerY);
    item.line.setAttribute("x2", endX.toFixed(1));
    item.line.setAttribute("y2", endY.toFixed(1));

    if (!item.text) {
      continue;
    }

    let labelX;
    let labelY;
    if (projectedLength < 0.22) {
      labelX = centerX + item.fallback.x;
      labelY = centerY + item.fallback.y;
    } else {
      const unitX = axisWidgetDirection.x / projectedLength;
      const unitY = -axisWidgetDirection.y / projectedLength;
      labelX = centerX + unitX * labelRadius;
      labelY = centerY + unitY * labelRadius;
    }

    labelX = THREE.MathUtils.clamp(labelX, item.halfWidth + 4, 156 - item.halfWidth);
    labelY = THREE.MathUtils.clamp(labelY, 16, 146);
    item.text.setAttribute("x", labelX.toFixed(1));
    item.text.setAttribute("y", labelY.toFixed(1));
  }
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function onPointerDown(event) {
  pointerDown = {
    x: event.clientX,
    y: event.clientY,
    id: event.pointerId,
    type: event.pointerType
  };
  hasCameraFocusTarget = false;
  focusHoldUntil = 0;
}

function onPointerMove(event) {
  const vertexId = pickVertex(event);
  if (vertexId !== hoveredVertexId) {
    hoveredVertexId = vertexId;
    if (vertexId !== null) {
      focusVertexId = vertexId;
    }
    refresh();
  }
}

function onPointerUp(event) {
  if (!pointerDown || pointerDown.id !== event.pointerId) {
    return;
  }

  const dragDistance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  const tapMoveLimit = pointerDown.type === "touch" || pointerDown.type === "pen" ? 16 : 6;
  pointerDown = null;

  if (dragDistance > tapMoveLimit || isNpcTurn()) {
    return;
  }

  const vertexId = pickVertex(event);
  if (vertexId !== null) {
    if (state.gameOver) {
      toggleDeadAtVertex(vertexId);
    } else {
      playVertex(vertexId);
    }
  }
}

function clearHover() {
  if (hoveredVertexId !== null) {
    hoveredVertexId = null;
    refresh();
  }
  pointerDown = null;
}

function pickVertex(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);

  const intersections = raycaster.intersectObjects(hitTargetGroup.children, false);
  for (const intersection of intersections) {
    if (intersection.object.position.dot(camera.position) > 0) {
      return intersection.object.userData.vertexId;
    }
  }

  return null;
}
