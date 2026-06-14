import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  BLACK,
  EMPTY,
  WHITE,
  applyMove,
  chooseAiMove,
  countPieces,
  createInitialState,
  passTurn,
  validMoves
} from "./game.js";
import { HEALPIX_BOUNDARY_SEGMENTS_NSIDE2 } from "./healpix-boundaries-nside2.js";
import { createHealpixTopology, pixelCount } from "./healpix.js";

const topology = createHealpixTopology(2);
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
const passButton = document.querySelector("#passButton");
const resetButton = document.querySelector("#resetButton");
const homeButton = document.querySelector("#homeButton");
const controlStack = document.querySelector("#controlStack");
const controlsToggle = document.querySelector("#controlsToggle");
const languageToggle = document.querySelector("#languageToggle");
const hud = document.querySelector(".hud");
const netBoard = document.querySelector("#netBoard");
const netPanel = document.querySelector(".net-panel");
const netTitle = document.querySelector("#netTitle");
const netToggle = document.querySelector("#netToggle");
const blackDifficultyLabel = document.querySelector("#blackDifficultyLabel");
const whiteDifficultyLabel = document.querySelector("#whiteDifficultyLabel");
const difficultyGroup = document.querySelector(".difficulty");
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
const axisWidgetRotation = new THREE.Quaternion();
const axisWidgetDirection = new THREE.Vector3();
const godHintButton = document.querySelector("#godHintButton");
const indexOverlayToggle = document.querySelector("#indexOverlayToggle");
const difficultyButtons = [...document.querySelectorAll("[data-player][data-difficulty]")];

const TRANSLATIONS = {
  en: {
    axisNorth: "+Z North",
    black: "Black",
    white: "White",
    blackShort: "Black",
    whiteShort: "White",
    human: "Human",
    npc: "NPC",
    home: "Home",
    homeLabel: "Back to HEALPix Games",
    pass: "Pass",
    newGame: "New",
    net: "Unfolded map",
    difficultyAria: "NPC difficulty by color",
    showSettings: "Settings",
    hideSettings: "Hide settings",
    showSettingsLabel: "Show NPC and game settings",
    hideSettingsLabel: "Hide NPC and game settings",
    showMap: "Open",
    hideMap: "Hide",
    showMapLabel: "Show unfolded map",
    hideMapLabel: "Hide unfolded map",
    switchLanguage: "JA",
    switchLanguageLabel: "Switch language to Japanese",
    difficulties: {
      easy: "Weak",
      normal: "Normal",
      hard: "Strong",
      expert: "Expert",
      god: "God"
    },
    turn: (color, npc) => `${color} turn${npc ? " NPC" : ""}`,
    gameOver: "Game over",
    draw: "Draw",
    blackWin: "Black wins",
    whiteWin: "White wins",
    scoreLine: (winner, black, white) => `${winner} / Black ${black} - White ${white}`,
    noMovesFor: (color, moveTotal) => `${color} has no legal moves / Legal moves ${moveTotal}`,
    noLegalMoves: "No legal moves",
    legalMoves: (moveTotal) => `Legal moves ${moveTotal}`,
    godHint: "God move",
    playHint: "Play this move",
    illegalMove: "Illegal move",
    calculatingHint: "Calculating",
    calculatingMessage: "Calculating god move",
    noHint: "No god move",
    hintShown: "God move highlighted",
    indexModes: {
      off: "Index off",
      nest: "Nest index",
      ring: "Ring index"
    },
    indexModeLabel: (mode) => `Show ${mode} overlay`
  },
  ja: {
    axisNorth: "+Z 北",
    black: "黒",
    white: "白",
    blackShort: "黒",
    whiteShort: "白",
    human: "PC",
    npc: "NPC",
    home: "ホーム",
    homeLabel: "HEALPix Gamesに戻る",
    pass: "パス",
    newGame: "新規",
    net: "展開図",
    difficultyAria: "色ごとのNPC難易度",
    showSettings: "設定",
    hideSettings: "設定を隠す",
    showSettingsLabel: "NPCとゲーム設定を表示",
    hideSettingsLabel: "NPCとゲーム設定を隠す",
    showMap: "開く",
    hideMap: "隠す",
    showMapLabel: "展開図を表示",
    hideMapLabel: "展開図を隠す",
    switchLanguage: "EN",
    switchLanguageLabel: "表示言語を英語に切り替え",
    difficulties: {
      easy: "弱",
      normal: "中",
      hard: "強",
      expert: "最強",
      god: "神"
    },
    turn: (color, npc) => `${color}番${npc ? " NPC" : ""}`,
    gameOver: "終了",
    draw: "引き分け",
    blackWin: "黒勝ち",
    whiteWin: "白勝ち",
    scoreLine: (winner, black, white) => `${winner} / 黒 ${black} - 白 ${white}`,
    noMovesFor: (color, moveTotal) => `${color}は合法手なし / 合法手 ${moveTotal}`,
    noLegalMoves: "合法手なし",
    legalMoves: (moveTotal) => `合法手 ${moveTotal}`,
    godHint: "神の一手",
    playHint: "この手を打つ",
    illegalMove: "そこには置けません",
    calculatingHint: "計算中",
    calculatingMessage: "神の一手を計算中",
    noHint: "神の一手なし",
    hintShown: "神の一手を表示",
    indexModes: {
      off: "番号なし",
      nest: "Nest番号",
      ring: "Ring番号"
    },
    indexModeLabel: (mode) => `${mode}を表示`
  }
};

const languageOptions = new Set(Object.keys(TRANSLATIONS));
const requestedLanguage = new URLSearchParams(window.location.search).get("lang");
const storedLanguage =
  window.localStorage.getItem("healpixGameLanguage") ?? window.localStorage.getItem("healpixOthelloLanguage");
let currentLanguage = languageOptions.has(requestedLanguage)
  ? requestedLanguage
  : languageOptions.has(storedLanguage)
    ? storedLanguage
    : navigator.language.startsWith("ja")
      ? "ja"
      : "en";

const colors = {
  baseTile: new THREE.Color("#5f6768"),
  alternateTile: new THREE.Color("#50595a"),
  legalBlack: new THREE.Color("#4db996"),
  legalWhite: new THREE.Color("#d8b442"),
  hover: new THREE.Color("#c96542"),
  last: new THREE.Color("#9e6fef"),
  hint: new THREE.Color("#f052be"),
  locator: new THREE.Color("#fff4a8"),
  blackPiece: new THREE.Color("#111315"),
  whitePiece: new THREE.Color("#eeeae0")
};

let state = createInitialState(topology);
let legalMoves = new Map();
let hoveredCellId = null;
let focusCellId = null;
let npcPlayers = new Set([WHITE]);
let aiDifficulties = {
  [BLACK]: "easy",
  [WHITE]: "easy"
};
let aiTimer = 0;
let hintMoveId = null;
let hintBusy = false;
let hintToken = 0;
let pointerDown = null;
let hasCameraFocusTarget = false;
let focusHoldUntil = 0;
const compactLayoutQuery = window.matchMedia("(max-width: 640px)");
let controlsCollapsed = compactLayoutQuery.matches;
let netCollapsed = compactLayoutQuery.matches;
let panelChoiceChanged = false;
const indexOverlayModes = Object.freeze(["off", "nest", "ring"]);
let indexOverlayMode = "off";

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
camera.up.set(0, 0, 1);
camera.position.set(5.9, 0, 0);
camera.lookAt(0, 0, 0);
const cameraFocusTarget = new THREE.Vector3();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 2.15;
controls.maxDistance = 8.6;
controls.rotateSpeed = 0.62;
controls.zoomSpeed = 0.55;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.28;

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
    opacity: 0.88
  })
);
scene.add(globe);

const healpixBoundaryGroup = new THREE.Group();
scene.add(healpixBoundaryGroup);

const tileGroup = new THREE.Group();
const pieceGroup = new THREE.Group();
const indexLabelGroup = new THREE.Group();
scene.add(tileGroup, pieceGroup, indexLabelGroup);

const unitZ = new THREE.Vector3(0, 0, 1);
const unitY = new THREE.Vector3(0, 1, 0);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tileMeshes = new Map();
const pieceMeshes = new Map();
const netCellGroups = new Map();
const tileGeometry = new THREE.PlaneGeometry(1, 1);
const pieceGeometry = new THREE.CylinderGeometry(1, 1, 0.12, 36, 1);
const blackPieceMaterial = new THREE.MeshStandardMaterial({
  color: colors.blackPiece,
  roughness: 0.38,
  metalness: 0.16
});
const whitePieceMaterial = new THREE.MeshStandardMaterial({
  color: colors.whitePiece,
  roughness: 0.42,
  metalness: 0.02
});
const locatorMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.84, 1, 48),
  new THREE.MeshBasicMaterial({
    color: colors.locator,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthTest: true
  })
);
locatorMarker.visible = false;
locatorMarker.renderOrder = 4;
scene.add(locatorMarker);

buildHealpixBoundaries();
buildTiles();
buildPieceMeshes();
buildNet();
resize();
applyLanguage();
updatePlayerButtons();
updateDifficultyButtons();
refresh();
requestAiIfNeeded();
renderer.setAnimationLoop(render);

window.addEventListener("resize", resize);
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointerleave", clearHover);
blackNpcToggle.addEventListener("click", () => toggleNpc(BLACK));
whiteNpcToggle.addEventListener("click", () => toggleNpc(WHITE));
passButton.addEventListener("click", requestPass);
resetButton.addEventListener("click", resetGame);
godHintButton.addEventListener("click", requestGodHint);
homeButton.addEventListener("click", goHome);
controlsToggle.addEventListener("click", toggleControlsPanel);
languageToggle.addEventListener("click", toggleLanguage);
netToggle.addEventListener("click", toggleNetPanel);
indexOverlayToggle.addEventListener("click", toggleIndexOverlay);
difficultyButtons.forEach((button) => button.addEventListener("click", setDifficulty));
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
  blackScoreLabel.textContent = text.blackShort;
  whiteScoreLabel.textContent = text.whiteShort;
  blackDifficultyLabel.textContent = text.blackShort;
  whiteDifficultyLabel.textContent = text.whiteShort;
  homeButton.textContent = text.home;
  homeButton.setAttribute("aria-label", text.homeLabel);
  passButton.textContent = text.pass;
  resetButton.textContent = text.newGame;
  netTitle.textContent = text.net;
  axisTextZ.textContent = text.axisNorth;
  languageToggle.textContent = text.switchLanguage;
  languageToggle.setAttribute("aria-label", text.switchLanguageLabel);
  difficultyGroup.setAttribute("aria-label", text.difficultyAria);
  updatePanelVisibility();
  updateIndexOverlayButton();

  for (const button of difficultyButtons) {
    button.textContent = text.difficulties[button.dataset.difficulty];
  }
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

function toggleLanguage() {
  currentLanguage = currentLanguage === "en" ? "ja" : "en";
  window.localStorage.setItem("healpixGameLanguage", currentLanguage);
  window.localStorage.setItem("healpixOthelloLanguage", currentLanguage);
  const url = new URL(window.location.href);
  url.searchParams.set("lang", currentLanguage);
  window.history.replaceState(null, "", url);
  applyLanguage();
  updatePlayerButtons();
  refresh();
}

function goHome() {
  const url = new URL("./", window.location.href);
  url.searchParams.set("lang", currentLanguage);
  window.location.href = url.href;
}

function buildHealpixBoundaries() {
  healpixBoundaryGroup.clear();

  const radius = 1.054;
  const positions = new Float32Array(HEALPIX_BOUNDARY_SEGMENTS_NSIDE2.length);
  for (let index = 0; index < HEALPIX_BOUNDARY_SEGMENTS_NSIDE2.length; index += 1) {
    positions[index] = HEALPIX_BOUNDARY_SEGMENTS_NSIDE2[index] * radius;
  }

  const material = new THREE.LineBasicMaterial({
    color: 0xf4ecd6,
    transparent: true,
    opacity: 0.58,
    depthTest: true
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const lineSegments = new THREE.LineSegments(geometry, material);
  lineSegments.renderOrder = 2;
  healpixBoundaryGroup.add(lineSegments);
}

function buildTiles() {
  tileGroup.clear();
  tileMeshes.clear();
  for (const cell of topology.cells) {
    const material = new THREE.MeshStandardMaterial({
      color: baseColorFor(cell),
      roughness: 0.68,
      metalness: 0.03,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(tileGeometry, material);
    const normal = vectorForCell(cell);
    const size = tileSize(cell);

    mesh.position.copy(normal).multiplyScalar(1.02);
    mesh.quaternion.setFromUnitVectors(unitZ, normal);
    mesh.scale.set(size * 1.12, size * 0.9, 1);
    mesh.userData.cellId = cell.id;

    tileGroup.add(mesh);
    tileMeshes.set(cell.id, mesh);
  }
}

function buildNet() {
  const namespace = "http://www.w3.org/2000/svg";
  netBoard.setAttribute("viewBox", `-1 0.35 ${8 * topology.nside + 2} ${4 * topology.nside - 0.7}`);
  netBoard.replaceChildren();
  netCellGroups.clear();

  const sortedCells = [...topology.cells].sort((a, b) => a.gridJr - b.gridJr || a.gridJp - b.gridJp);
  for (const cell of sortedCells) {
    const group = document.createElementNS(namespace, "g");
    const shape = document.createElementNS(namespace, "polygon");
    const piece = document.createElementNS(namespace, "circle");
    const indexLabel = document.createElementNS(namespace, "text");
    const x = cell.gridJp;
    const y = cell.gridJr;
    const radius = 0.46;

    group.classList.add("net-cell");
    group.dataset.cellId = String(cell.id);
    shape.classList.add("net-cell-shape");
    shape.setAttribute(
      "points",
      `${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${x - radius},${y}`
    );
    piece.classList.add("net-piece");
    piece.setAttribute("cx", String(x));
    piece.setAttribute("cy", String(y));
    piece.setAttribute("r", "0.22");
    indexLabel.classList.add("net-index-label");
    indexLabel.setAttribute("x", String(x));
    indexLabel.setAttribute("y", String(y));

    group.append(shape, piece, indexLabel);
    group.addEventListener("pointerenter", () => {
      hoveredCellId = cell.id;
      focusCellId = cell.id;
      refresh();
    });
    group.addEventListener("pointerleave", () => {
      if (hoveredCellId === cell.id) {
        hoveredCellId = null;
        refresh();
      }
    });
    group.addEventListener("click", () => {
      focusCellId = cell.id;
      nudgeCameraTowardCell(cell.id);
      if (!state.gameOver && !isNpcTurn()) {
        playCell(cell.id);
      }
    });

    netBoard.append(group);
    netCellGroups.set(cell.id, { group, piece, indexLabel });
  }
}

function labelForIndexOverlay(cell) {
  if (indexOverlayMode === "nest") {
    return String(cell.id);
  }

  if (indexOverlayMode === "ring") {
    return String(cell.ringIndex);
  }

  return "";
}

function updateIndexOverlayButton() {
  const text = labels();
  const label = text.indexModes[indexOverlayMode];
  indexOverlayToggle.textContent = label;
  indexOverlayToggle.setAttribute("aria-pressed", String(indexOverlayMode !== "off"));
  indexOverlayToggle.setAttribute("aria-label", text.indexModeLabel(label));
  updateIndexLabels();
}

function toggleIndexOverlay() {
  const currentIndex = indexOverlayModes.indexOf(indexOverlayMode);
  indexOverlayMode = indexOverlayModes[(currentIndex + 1) % indexOverlayModes.length];
  updateIndexOverlayButton();
}

function updateIndexLabels() {
  const isVisible = indexOverlayMode !== "off";

  for (const cell of topology.cells) {
    const netCell = netCellGroups.get(cell.id);
    if (netCell) {
      netCell.group.classList.toggle("show-index", isVisible);
      netCell.indexLabel.textContent = labelForIndexOverlay(cell);
    }
  }

  rebuildIndexSprites();
}

function disposeIndexSprites() {
  for (const label of indexLabelGroup.children) {
    label.material.map?.dispose();
    label.material.dispose();
  }

  indexLabelGroup.clear();
}

function rebuildIndexSprites() {
  disposeIndexSprites();

  if (indexOverlayMode === "off") {
    return;
  }

  for (const cell of topology.cells) {
    const label = labelForIndexOverlay(cell);
    const sprite = createIndexLabelSprite(label);
    const normal = vectorForCell(cell);
    sprite.position.copy(normal).multiplyScalar(1.16);
    sprite.userData.cellId = cell.id;
    indexLabelGroup.add(sprite);
  }
}

function createIndexLabelSprite(label) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const width = label.includes("/") ? 128 : 62;
  const height = 48;
  const pixelRatio = 2;
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  context.scale(pixelRatio, pixelRatio);
  context.fillStyle = "rgba(12, 14, 15, 0.74)";
  context.strokeStyle = "rgba(240, 239, 232, 0.72)";
  context.lineWidth = 2;
  roundRect(context, 3, 3, width - 6, height - 6, 9);
  context.fill();
  context.stroke();
  context.fillStyle = "#f8f4df";
  context.font = "800 22px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
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
  const scale = label.includes("/") ? 0.19 : 0.115;
  sprite.scale.set(scale, scale * (height / width), 1);
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

function buildPieceMeshes() {
  pieceGroup.clear();
  pieceMeshes.clear();

  for (const cell of topology.cells) {
    const normal = vectorForCell(cell);
    const radius = tileSize(cell) * 0.28;
    const piece = new THREE.Mesh(pieceGeometry, blackPieceMaterial);

    piece.position.copy(normal).multiplyScalar(1.068);
    piece.quaternion.setFromUnitVectors(unitY, normal);
    piece.scale.set(radius, 0.13, radius);
    piece.userData.cellId = cell.id;
    piece.visible = false;
    pieceGroup.add(piece);
    pieceMeshes.set(cell.id, piece);
  }
}

function updatePieces() {
  for (const cell of topology.cells) {
    const piece = pieceMeshes.get(cell.id);
    const value = state.board[cell.id];
    piece.visible = value !== EMPTY;

    if (value === BLACK) {
      piece.material = blackPieceMaterial;
    } else if (value === WHITE) {
      piece.material = whitePieceMaterial;
    }
  }
}

function vectorForCell(cell) {
  return vectorForNormal(cell.normal);
}

function vectorForNormal(normal) {
  return new THREE.Vector3(normal[0], normal[2], normal[1]).normalize();
}

function tileSize(cell) {
  const latitudeRadius = Math.sqrt(Math.max(0.04, 1 - cell.height * cell.height));
  const eastArc = (Math.PI * 2 * latitudeRadius) / cell.nphi;
  const minSize = topology.nside <= 2 ? 0.17 : 0.025;
  const maxSize = topology.nside <= 2 ? 0.34 : topology.nside <= 4 ? 0.2 : 0.13;
  return THREE.MathUtils.clamp(eastArc * 0.72, minSize, maxSize);
}

function nudgeCameraTowardCell(cellId, holdMs = 1300) {
  const cell = topology.cells[cellId];
  if (!cell) {
    return;
  }

  const normal = vectorForCell(cell);
  const currentDirection = camera.position.clone().sub(controls.target).normalize();
  const distance = camera.position.distanceTo(controls.target);
  const targetDirection = currentDirection.lerp(normal, 0.18).normalize();
  cameraFocusTarget.copy(targetDirection.multiplyScalar(distance).add(controls.target));
  controls.target.set(0, 0, 0);
  hasCameraFocusTarget = true;
  focusHoldUntil = performance.now() + holdMs;
}

function updateLocatorMarker() {
  const cellId = hoveredCellId ?? focusCellId;
  const cell = cellId === null ? null : topology.cells[cellId];

  if (!cell) {
    locatorMarker.visible = false;
    return;
  }

  const normal = vectorForCell(cell);
  const size = tileSize(cell) * 0.62;
  locatorMarker.position.copy(normal).multiplyScalar(1.108);
  locatorMarker.quaternion.setFromUnitVectors(unitZ, normal);
  locatorMarker.scale.set(size, size, 1);
  locatorMarker.visible = true;
}

function baseColorFor(cell) {
  return (cell.ring + cell.column) % 2 === 0 ? colors.baseTile : colors.alternateTile;
}

function setEmissive(material, color, intensity) {
  material.emissive.copy(color).multiplyScalar(intensity);
}

function refresh() {
  const moves = validMoves(topology, state.board, state.current);
  legalMoves = new Map(moves.map((move) => [move.cellId, move]));

  for (const cell of topology.cells) {
    const mesh = tileMeshes.get(cell.id);
    const material = mesh.material;
    const isLegal = legalMoves.has(cell.id);
    const isLastMove = state.lastMove?.cellId === cell.id;
    const isHintMove = hintMoveId === cell.id && isLegal;
    const isHovered = hoveredCellId === cell.id;
    const isFocused = focusCellId === cell.id;

    if (isHovered) {
      material.color.copy(colors.hover);
      setEmissive(material, colors.hover, 0.14);
    } else if (isHintMove) {
      material.color.copy(colors.hint);
      setEmissive(material, colors.hint, 0.16);
    } else if (isLegal) {
      const legalColor = state.current === BLACK ? colors.legalBlack : colors.legalWhite;
      material.color.copy(legalColor);
      setEmissive(material, legalColor, 0.08);
    } else if (isLastMove) {
      material.color.copy(colors.last);
      setEmissive(material, colors.last, 0.1);
    } else {
      material.color.copy(baseColorFor(cell));
      material.emissive.setRGB(0, 0, 0);
    }

    const netCell = netCellGroups.get(cell.id);
    if (netCell) {
      netCell.group.classList.toggle("legal", isLegal);
      netCell.group.classList.toggle("last", isLastMove);
      netCell.group.classList.toggle("hint", isHintMove);
      netCell.group.classList.toggle("hovered", isHovered);
      netCell.group.classList.toggle("located", isFocused);
      netCell.piece.classList.toggle("black", state.board[cell.id] === BLACK);
      netCell.piece.classList.toggle("white", state.board[cell.id] === WHITE);
    }
  }

  updateLocatorMarker();
  updatePieces();
  updateHud(moves.length);
}

function updateHud(moveTotal) {
  const counts = countPieces(state.board);
  const text = labels();
  resolutionLabel.textContent = `NSIDE ${topology.nside} / ${pixelCount(topology.nside)} cells`;
  blackScore.textContent = String(counts.black);
  whiteScore.textContent = String(counts.white);

  if (state.gameOver) {
    const winner = counts.black === counts.white ? text.draw : counts.black > counts.white ? text.blackWin : text.whiteWin;
    turnLabel.textContent = text.gameOver;
    turnLabel.style.color = "#f0c84b";
    message.textContent = text.scoreLine(winner, counts.black, counts.white);
  } else {
    turnLabel.textContent = text.turn(colorLabel(state.current), isNpcTurn());
    turnLabel.style.color = state.current === BLACK ? "#64c3a5" : "#f0c84b";

    if (state.lastMove?.autoPass) {
      message.textContent = text.noMovesFor(colorLabel(state.current === BLACK ? WHITE : BLACK), moveTotal);
    } else if (moveTotal === 0) {
      message.textContent = text.noLegalMoves;
    } else {
      message.textContent = text.legalMoves(moveTotal);
    }
  }

  passButton.disabled = state.gameOver || moveTotal > 0 || isNpcTurn();
  const canRequestHint = !state.gameOver && !isNpcTurn() && moveTotal > 0;
  godHintButton.disabled = hintBusy || !canRequestHint;
  if (!hintBusy) {
    godHintButton.textContent = hintMoveId !== null && legalMoves.has(hintMoveId) ? text.playHint : text.godHint;
  }
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
  controls.autoRotate = !pointerDown && hoveredCellId === null && !focusHold && !state.gameOver;
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
    id: event.pointerId
  };
  hasCameraFocusTarget = false;
  focusHoldUntil = 0;
}

function onPointerMove(event) {
  const cellId = pickCell(event);
  if (cellId !== hoveredCellId) {
    hoveredCellId = cellId;
    if (cellId !== null) {
      focusCellId = cellId;
    }
    refresh();
  }
}

function onPointerUp(event) {
  if (!pointerDown || pointerDown.id !== event.pointerId) {
    return;
  }

  const dragDistance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  pointerDown = null;

  if (dragDistance > 6 || state.gameOver || isNpcTurn()) {
    return;
  }

  const cellId = pickCell(event);
  if (cellId !== null) {
    playCell(cellId);
  }
}

function clearHover() {
  if (hoveredCellId !== null) {
    hoveredCellId = null;
    refresh();
  }
  pointerDown = null;
}

function pickCell(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);

  const intersections = raycaster.intersectObjects(tileGroup.children, false);
  if (intersections.length === 0) {
    return null;
  }

  return intersections[0].object.userData.cellId;
}

function playCell(cellId) {
  if (!legalMoves.has(cellId)) {
    if (state.board[cellId] === EMPTY) {
      message.textContent = labels().illegalMove;
    }
    return;
  }

  const next = applyMove(topology, state, cellId);
  if (!next) {
    return;
  }

  clearHint();
  focusCellId = cellId;
  state = next;
  hoveredCellId = null;
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

    const player = state.current;
    clearHint();
    const move = chooseAiMove(topology, state.board, player, aiDifficulties[player]);
    if (move) {
      focusCellId = move.cellId;
      state = applyMove(topology, state, move.cellId);
      refresh();
      requestAiIfNeeded();
    } else {
      const passed = passTurn(topology, state);
      if (passed) {
        state = passed;
        refresh();
        requestAiIfNeeded();
      }
    }
  }, 430);
}

function toggleNpc(player) {
  if (npcPlayers.has(player)) {
    npcPlayers.delete(player);
  } else {
    npcPlayers.add(player);
  }

  clearHint();
  updatePlayerButtons();
  refresh();
  requestAiIfNeeded();
}

function updatePlayerButtons() {
  const blackIsNpc = npcPlayers.has(BLACK);
  const whiteIsNpc = npcPlayers.has(WHITE);

  blackNpcToggle.setAttribute("aria-pressed", String(blackIsNpc));
  whiteNpcToggle.setAttribute("aria-pressed", String(whiteIsNpc));
  const text = labels();
  const joiner = currentLanguage === "ja" ? "" : " ";
  blackNpcToggle.textContent = `${text.blackShort}${joiner}${blackIsNpc ? text.npc : text.human}`;
  whiteNpcToggle.textContent = `${text.whiteShort}${joiner}${whiteIsNpc ? text.npc : text.human}`;
}

function playerForDifficultyButton(button) {
  return button.dataset.player === "black" ? BLACK : WHITE;
}

function updateDifficultyButtons() {
  for (const button of difficultyButtons) {
    const player = playerForDifficultyButton(button);
    button.setAttribute("aria-pressed", String(button.dataset.difficulty === aiDifficulties[player]));
  }
}

function setDifficulty(event) {
  const button = event.currentTarget;
  const player = playerForDifficultyButton(button);
  aiDifficulties[player] = button.dataset.difficulty;
  updateDifficultyButtons();
  requestAiIfNeeded();
}

function requestPass() {
  if (isNpcTurn()) {
    return;
  }

  const passed = passTurn(topology, state);
  if (!passed) {
    return;
  }

  clearHint();
  state = passed;
  refresh();
  requestAiIfNeeded();
}

function resetGame() {
  window.clearTimeout(aiTimer);
  state = createInitialState(topology);
  hoveredCellId = null;
  focusCellId = null;
  hasCameraFocusTarget = false;
  focusHoldUntil = 0;
  clearHint();
  refresh();
  requestAiIfNeeded();
}

function positionKey() {
  return `${topology.nside}:${state.current}:${state.board.join(",")}`;
}

function clearHint() {
  hintMoveId = null;
  hintBusy = false;
  hintToken += 1;
}

function requestGodHint() {
  if (hintBusy || state.gameOver || isNpcTurn()) {
    return;
  }

  if (hintMoveId !== null && legalMoves.has(hintMoveId)) {
    playCell(hintMoveId);
    return;
  }

  const requestKey = positionKey();
  const requestToken = hintToken + 1;
  hintToken = requestToken;
  hintMoveId = null;
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

    const move = chooseAiMove(topology, state.board, state.current, "god");
    hintBusy = false;

    if (!move || hintToken !== requestToken || positionKey() !== requestKey) {
      clearHint();
      refresh();
      message.textContent = labels().noHint;
      return;
    }

    hintMoveId = move.cellId;
    hoveredCellId = null;
    refresh();
    message.textContent = labels().hintShown;
  }, 30);
}
