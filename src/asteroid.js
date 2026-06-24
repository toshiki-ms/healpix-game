import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  createAsteroidVegetationModel,
  ecosystemSubstepsForDuration,
  preloadAsteroidSimulationCore,
  preloadAsteroidVegetationOperators
} from "./asteroid-vegetation.js";
import {
  runWasmAdvanceAsh,
  runWasmCleanAsh,
  runWasmEarthCloudCover,
  runWasmInitializeAsteroidProfile,
  runWasmInitializeEarthProfile,
  runWasmSunlightField
} from "./asteroid-sim-core.js";
import {
  earthBaobabSuitabilityForCell,
  earthClimateForCell,
  earthClimateGridData,
  earthDesertScoreForCell,
  earthElevationGridData,
  earthElevationMetersForCell,
  earthEffectiveLandFraction,
  earthKoppenClassForCell,
  earthLandFractionDataForNside,
  earthLatitudeDeg,
  earthLongitudeDeg,
  earthMountainScoreForCell,
  preloadEarthElevation,
  earthAnnualPrecipMmForCell,
  earthRainClimatologyForCell,
  earthRainforestScoreForCell,
  earthRoseSuitabilityForCell,
  preloadEarthLandFractions,
  preloadEarthClimate
} from "./earth-reference.js";
import {
  era5CloudCoverData,
  hasEra5CloudClimatology,
  preloadEra5CloudClimatology
} from "./earth-cloud-reference.js";
import { createHealpixTopology, pixelCount } from "./healpix.js";

const FIXED_GAME_LENGTH_DAYS = 3650;
const TURNS_PER_DAY = 8;
const HOURS_PER_TURN = 24 / TURNS_PER_DAY;
const ACTION_DT_DAYS = HOURS_PER_TURN / 24;
const MAX_ECOSYSTEM_SUBSTEPS_PER_TURN = 32;
const DEFAULT_MAX_ECOSYSTEM_PERIOD_STEP_DAYS = 0.25;
const TERRAIN_CODE = Object.freeze({
  sand: 0,
  rock: 1,
  volcano: 2,
  crack: 3,
  path: 4,
  water: 5,
  moss: 6,
  rose: 7,
  meadow: 8
});
const TERRAIN_KEY_BY_CODE = Object.freeze(
  Object.fromEntries(Object.entries(TERRAIN_CODE).map(([key, value]) => [value, key]))
);
const KOPPEN_CLASS_BY_CODE = Object.freeze([
  "Ocean",
  "EF",
  "ET",
  "BWh",
  "BWk",
  "BSh",
  "BSk",
  "Af",
  "Am",
  "Aw",
  "Csa",
  "Csb",
  "Cfa",
  "Cfb",
  "Dfa",
  "Dfb",
  "Dfc"
]);
const MIN_ACTION_TIME_SCALE = 1;
const MAX_ACTION_TIME_SCALE = 80;
const FIXED_ACTION_TIME_SCALE_NSIDE = 128;
const MAX_GLOBAL_RENDER_NSIDE = 64;
const MAX_CONTINUOUS_GLOBAL_RENDER_NSIDE = 128;
const FULL_DETAIL_RENDER_MIN_NSIDE = 128;
const LOCAL_DETAIL_DISABLE_NSIDE = 128;
const LOD_OBJECT_CAMERA_DISTANCE = 3.75;
const LOD_DETAIL_CAMERA_DISTANCE = 3.75;
const LOD_DETAIL_MIN_TILE_PIXELS = 5.2;
const LOD_DETAIL_MAX_FINE_CELLS = 16384;
const LOD_DETAIL_MAX_MID_CELLS = 16384;
const LOD_DETAIL_VIEW_MARGIN = 0.22;
const SIMULATION_SUNLIGHT_DURATION_DAYS = 1;
const VISIBLE_SUNLIGHT_DURATION_DAYS = ACTION_DT_DAYS;
const START_HOUR = 6;
const SUNLIGHT_AVERAGE_SAMPLES = 8;
const SUNSET_HOUR = 18;
const SUNSET_TURN = Math.round(((SUNSET_HOUR - START_HOUR + 24) % 24) / HOURS_PER_TURN);
const REST_TURN_SKIP = 3;
const FACE_RING_ANCHORS = Object.freeze([2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]);
const FACE_PHI_ANCHORS = Object.freeze([1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7]);
const CELL_EDGE_STEPS = 4;
const HIERARCHY_OBJECT_NSIDE = 2;
const SUN_VISUAL_DISTANCE = 40;
const ACTIVE_VOLCANO_ASH_FALL = Object.freeze([0.006, 0.0024, 0.0008]);
const NET_CELL_DRAW_RADIUS = 1.005;
const NET_CELL_PICK_RADIUS = 1;
const NET_GRID_KEY_STRIDE = 8192;
const BAOBAB_HIDDEN_THRESHOLD = 0.005;
const BAOBAB_PULL_THRESHOLD = 0.08;
const BAOBAB_PULL_PATCH_NSIDE = 4;
const BAOBAB_PULL_WORK = 0.64;
const BAOBAB_PULL_MIN_SPATIAL_WEIGHT = 0.08;
const BAOBAB_PULL_REDISTRIBUTION_PASSES = 4;
const BURN_PATCH_NSIDE = 8;
const BURN_ASH_SPREAD_NSIDE = 8;
const BURN_WORK = 2.25;
const BURN_MIN_SPATIAL_WEIGHT = 0.05;
const BURN_ASH_SPREAD_MULTIPLIER = 2.1;
const BURN_FUEL_CONSUMPTION_PER_DAY = 0.085;
const BURN_ASH_PER_FUEL = 0.12;
const BURNING_MARKER_THRESHOLD = 0.03;
const BURN_INTENSITY_MAX = 2.4;
const BURN_INTENSITY_STACK_BOOST = 0.48;
const EARTH_ROSE_BURN_FUEL_FACTOR = 0.24;
const EARTH_ROSE_BURN_HEAT_FUEL_FACTOR = 0.045;
const EARTH_ROSE_BURN_RATE_MULTIPLIER = 8.0;
const DISCHARGE_FIRE_COOLING = 0.78;
const DISCHARGE_FIRE_FUEL_REDUCTION = 0.58;
const DISCHARGE_FIRE_CLEAR_INTENSITY = 0.28;
const RAIN_FIRE_COOLING_PER_MM = 0.055;
const RAIN_FIRE_DAMPING_PER_MM = 0.16;
const RAIN_FIRE_CLEAR_INTENSITY = 0.08;
const SNOW_ICE_DISPLAY_MAX_M = 0.05;
const SEA_ICE_DISPLAY_MAX_M = 0.04;
const SEA_ICE_GROWTH_RATE_PER_DAY = 0.85;
const SEA_ICE_DECAY_RATE_PER_DAY = 1.35;
const SNOW_ICE_FREEZE_RATE_PER_DAY_C = 1.8;
const SNOW_ICE_MELT_BASE_M_DAY = 0.0015;
const SNOW_ICE_MELT_M_DAY_C = 0.0035;
const FREEZE_DAMAGE_ICE_REFERENCE_M = 0.012;
const FREEZE_DAMAGE_COLD_REFERENCE_C = 12;
const ROSE_FREEZE_DAMAGE_RATES = Object.freeze({
  flower: 1.25,
  leaf: 0.42,
  root: 0.045,
  store: 0.03,
  seed: 0.018
});
const BAOBAB_FREEZE_DAMAGE_RATES = Object.freeze({
  leaf: 1.45,
  stem: 0.16,
  root: 0.1,
  store: 0.08,
  seed: 0.12
});
const ASH_CLEAN_THRESHOLD = 0.01;
const ASH_CLEAN_PATCH_NSIDE = 4;
const ASH_CLEAN_WORK = 0.78;
const SNOW_ICE_CLEAN_THRESHOLD_M = 0.0005;
const SNOW_ICE_CLEAN_WORK_M = 0.022;
const CLEANED_ASH_SOIL_CARBON_EQUIVALENT = 0.18;
const CLEANED_ASH_NUTRIENT_EQUIVALENT = 0.035;
const WATERING_RATE_M_DAY = 0.008;
const DISCHARGE_RATE_M_DAY = 0.018 / ACTION_DT_DAYS;
const DISCHARGE_RADIUS_NEIGHBOR_SCALE = 1.8;
const DISCHARGE_EDGE_WEIGHT = 0.42;
const SHEEP_GRAZE_WORK_PER_DAY = 0.11;
const SHEEP_MAX_BAOBAB_SPROUT_MASS = 0.22;
const SHEEP_MAX_ROSE_SPROUT_MASS = 0.16;
const SHEEP_DUNG_CARBON_RETURN_FRACTION = 0.38;
const SHEEP_RESPIRATION_CARBON_FRACTION = 0.48;
const SHEEP_BODY_CARBON_FRACTION = 0.08;
const SHEEP_DUNG_NUTRIENT_RETURN_FRACTION = 0.028;
const SHEEP_INITIAL_ENERGY = 1.0;
const SHEEP_MAX_ENERGY = 1.45;
const SHEEP_MAINTENANCE_COST_PER_DAY = 0.018;
const SHEEP_ENERGY_GAIN_PER_CARBON = 3.8;
const SHEEP_MEMORY_REWARD_SCALE = 7.5;
const SHEEP_MEMORY_LEARNING_RATE = 0.35;
const SHEEP_MEMORY_DECAY_PER_DAY = 0.18;
const SHEEP_MEMORY_WEIGHT = 0.18;
const SHEEP_MEMORY_MAX = 1.8;
const SHEEP_LOOKAHEAD_RINGS = 3;
const SHEEP_LOOKAHEAD_WEIGHT = 1.45;
const SHEEP_LOOKAHEAD_DECAY = 0.62;
const SHEEP_LOOKAHEAD_BULK_WEIGHT = 0.08;
const SHEEP_RECENT_VISIT_PENALTY = 0.035;
const SHEEP_TRAIL_LENGTH = 7;
const SHEEP_SOFTMAX_TEMPERATURE = 0.08;
const SHEEP_SOFTMAX_TEMPERATURE_MIN = 0.04;
const SHEEP_BAOBAB_SPROUT_VALUE = 1.25;
const SHEEP_ROSE_SPROUT_VALUE = 0.78;
const SHEEP_FIRE_AVOIDANCE = 0.9;
const SHEEP_WET_AVOIDANCE = 0.16;
const EARTH_ROSE_PULL_THRESHOLD = 0.08;
const EARTH_DESERT_RAIN_THRESHOLD_MM = 250;
const EARTH_FOREST_RAIN_THRESHOLD_MM = 680;
const EARTH_WETLAND_RAIN_THRESHOLD_MM = 1280;
const EARTH_WETLAND_MOISTURE_REFERENCE_RAIN_MM = 2400;
const EARTH_FOREST_MOISTURE_REFERENCE_RAIN_MM = 1450;
const EARTH_DRYLAND_MOISTURE_REFERENCE_RAIN_MM = 900;
const EARTH_UPLAND_MOISTURE_REFERENCE_RAIN_MM = 1350;
const EARTH_BAOBAB_HUMID_PENALTY_START_MM = 850;
const EARTH_BAOBAB_HUMID_PENALTY_END_MM = 1400;
const ROSE_PATCH_MARKER_THRESHOLD = 0.16;
const BAOBAB_REFERENCE_HEIGHT_M = 25;
const ROSE_REFERENCE_HEIGHT_M = 1.2;
const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const ASTEROID_MAX_NSIDE = 64;
const IS_VITE_DEV = Boolean(import.meta.env?.DEV);
const EARTH_MAX_NSIDE = IS_VITE_DEV ? 256 : 64;
const MOBILE_MAX_NSIDE = 64;
const BASE_SUPPORTED_NSIDES = Object.freeze([2, 4, 8, 16, 32, 64]);
const LOCAL_HIGH_RES_NSIDES = Object.freeze(IS_VITE_DEV ? [128, 256] : []);
const compactLayoutQuery = window.matchMedia("(max-width: 640px), (orientation: portrait)");
const mobileCapabilityQuery = window.matchMedia("(max-width: 640px) and (pointer: coarse)");
const hierarchyObjectTopology = createHealpixTopology(HIERARCHY_OBJECT_NSIDE);
const hierarchyObjectCellByKey = new Map(
  hierarchyObjectTopology.cells.map((cell) => [`${cell.face}:${cell.ix}:${cell.iy}`, cell])
);
const supportedPlanetPresets = new Set(["asteroid", "earth"]);
const requestedPlanetPreset = new URLSearchParams(window.location.search).get("planet");
const storedPlanetPreset = window.localStorage.getItem("healpixAsteroidPlanetPreset");
let currentPlanetPreset = supportedPlanetPresets.has(requestedPlanetPreset)
  ? requestedPlanetPreset
  : supportedPlanetPresets.has(storedPlanetPreset)
    ? storedPlanetPreset
    : "asteroid";
const supportedNsides = new Set([...BASE_SUPPORTED_NSIDES, ...LOCAL_HIGH_RES_NSIDES]);
const requestedNside = Number(new URLSearchParams(window.location.search).get("nside"));
const storedNside = Number(window.localStorage.getItem("healpixAsteroidNside"));
let currentNside = supportedNsides.has(requestedNside)
  ? requestedNside
  : supportedNsides.has(storedNside)
    ? storedNside
    : 2;
currentNside = normalizeNsideForPreset(currentNside, currentPlanetPreset);
window.localStorage.setItem("healpixAsteroidNside", String(currentNside));
if (requestedNside && requestedNside !== currentNside) {
  const normalizedInitialUrl = new URL(window.location.href);
  normalizedInitialUrl.searchParams.set("nside", String(currentNside));
  window.history.replaceState(null, "", normalizedInitialUrl);
}
let topology = createHealpixTopology(currentNside);
let topologyNeighborLists = buildTopologyNeighborLists(topology);
let sunlightCellNormals = buildSunlightCellNormals(topology);
let renderTopology = topology;
const detailTopologyCache = new Map();
let renderCellChildIds = [];
let simulationCellToRenderCellId = new Int32Array(0);
let renderCellRepresentativeIds = new Int32Array(0);

function maxNsideForPreset(preset) {
  const presetMaxNside = preset === "asteroid" ? ASTEROID_MAX_NSIDE : EARTH_MAX_NSIDE;
  return mobileCapabilityQuery.matches ? Math.min(presetMaxNside, MOBILE_MAX_NSIDE) : presetMaxNside;
}

function minNsideForPreset(preset) {
  return 8;
}

function appendLocalHighResolutionNsideOptions() {
  for (const nside of LOCAL_HIGH_RES_NSIDES) {
    if (nsideSelect.querySelector(`option[value="${nside}"]`)) {
      continue;
    }
    const option = document.createElement("option");
    option.value = String(nside);
    option.textContent = `NS ${nside}`;
    nsideSelect.append(option);
  }
}

function normalizeNsideForPreset(nside, preset) {
  const minNside = minNsideForPreset(preset);
  const maxNside = maxNsideForPreset(preset);
  const allowed = [...supportedNsides].filter((value) => value >= minNside && value <= maxNside);
  if (supportedNsides.has(nside) && nside >= minNside && nside <= maxNside) {
    return nside;
  }
  return allowed.reduce((best, value) =>
    Math.abs(value - nside) < Math.abs(best - nside) ? value : best,
  allowed[0] ?? minNside);
}

function syncNsideOptions() {
  const minNside = minNsideForPreset(currentPlanetPreset);
  const maxNside = maxNsideForPreset(currentPlanetPreset);
  for (const option of nsideSelect.options) {
    const value = Number(option.value);
    const available = supportedNsides.has(value) && value >= minNside && value <= maxNside;
    option.disabled = !available;
    option.hidden = !available;
  }
  nsideSelect.value = String(currentNside);
}
let cellBoundaryPoints = null;

const canvas = document.querySelector("#board");
const resolutionLabel = document.querySelector("#resolutionLabel");
const dayLabel = document.querySelector("#dayLabel");
const dayValue = document.querySelector("#dayValue");
const actionLabel = document.querySelector("#actionLabel");
const actionValue = document.querySelector("#actionValue");
const healthLabel = document.querySelector("#healthLabel");
const healthValue = document.querySelector("#healthValue");
const roseLabel = document.querySelector("#roseLabel");
const roseValue = document.querySelector("#roseValue");
const message = document.querySelector("#message");
const planetSelect = document.querySelector("#asteroidPlanetSelect");
const nsideSelect = document.querySelector("#asteroidNsideSelect");
appendLocalHighResolutionNsideOptions();
const viewSelect = document.querySelector("#asteroidViewSelect");
const colorbarToggle = document.querySelector("#colorbarToggle");
const colorbarPanel = document.querySelector("#colorbarPanel");
const colorbarTitle = document.querySelector("#colorbarTitle");
const colorbarUnit = document.querySelector("#colorbarUnit");
const colorbarGradient = document.querySelector("#colorbarGradient");
const colorbarMin = document.querySelector("#colorbarMin");
const colorbarMid = document.querySelector("#colorbarMid");
const colorbarMax = document.querySelector("#colorbarMax");
const waterButton = document.querySelector("#waterButton");
const releaseWaterButton = document.querySelector("#releaseWaterButton");
const pullButton = document.querySelector("#pullButton");
const burnButton = document.querySelector("#burnButton");
const cleanButton = document.querySelector("#cleanButton");
const sheepButton = document.querySelector("#sheepButton");
const observeButton = document.querySelector("#observeButton");
const sunsetButton = document.querySelector("#sunsetButton");
const restButton = document.querySelector("#restButton");
const endDayButton = document.querySelector("#endDayButton");
const resetButton = document.querySelector("#resetButton");
const resetSettingsButton = document.querySelector("#resetSettingsButton");
const homeButton = document.querySelector("#homeButton");
const controlStack = document.querySelector("#controlStack");
const simulationControls = document.querySelector("#simulationControls");
const controlsToggle = document.querySelector("#controlsToggle");
const hud = document.querySelector(".hud");
const netBoard = document.querySelector("#netBoard");
const netContext = netBoard.getContext("2d");
const netPanel = document.querySelector(".net-panel");
const netTitle = document.querySelector("#netTitle");
const netToggle = document.querySelector("#netToggle");
const eventLog = document.querySelector("#eventLog");
const axisWidget = document.querySelector("#axisWidget");
const sunMarker = document.querySelector("#sunMarker");
const axisTextZ = document.querySelector("#axisTextZ");
const simulationParamControls = [
  {
    key: "annualPrecipMm",
    planet: "asteroid",
    label: document.querySelector("#annualPrecipParamLabel"),
    input: document.querySelector("#annualPrecipParam"),
    output: document.querySelector("#annualPrecipParamValue"),
    format: (value) => `${Math.round(value)} mm/y`
  },
  {
    key: "dryDays",
    planet: "asteroid",
    label: document.querySelector("#dryDaysParamLabel"),
    input: document.querySelector("#dryDaysParam"),
    output: document.querySelector("#dryDaysParamValue"),
    format: (value) => `${Math.round(value)} d`
  },
  {
    key: "rainPatchiness",
    planet: "asteroid",
    label: document.querySelector("#rainPatchinessParamLabel"),
    input: document.querySelector("#rainPatchinessParam"),
    output: document.querySelector("#rainPatchinessParamValue"),
    format: (value) => value.toFixed(2)
  },
  {
    key: "rainScale",
    planet: "asteroid",
    label: document.querySelector("#rainScaleParamLabel"),
    input: document.querySelector("#rainScaleParam"),
    output: document.querySelector("#rainScaleParamValue"),
    format: (value) => `${Math.round(value)} km`
  },
  {
    key: "asteroidMeanTempC",
    planet: "asteroid",
    label: document.querySelector("#asteroidMeanTempParamLabel"),
    input: document.querySelector("#asteroidMeanTempParam"),
    output: document.querySelector("#asteroidMeanTempParamValue"),
    format: (value) => `${value.toFixed(1)} C`
  },
  {
    key: "asteroidDiurnalRangeC",
    planet: "asteroid",
    label: document.querySelector("#asteroidDiurnalRangeParamLabel"),
    input: document.querySelector("#asteroidDiurnalRangeParam"),
    output: document.querySelector("#asteroidDiurnalRangeParamValue"),
    format: (value) => `${value.toFixed(1)} C`
  },
  {
    key: "asteroidLatitudeTempRangeC",
    planet: "asteroid",
    label: document.querySelector("#asteroidLatitudeRangeParamLabel"),
    input: document.querySelector("#asteroidLatitudeRangeParam"),
    output: document.querySelector("#asteroidLatitudeRangeParamValue"),
    format: (value) => `${value.toFixed(1)} C`
  },
  {
    key: "evaporation",
    planet: "asteroid",
    label: document.querySelector("#evaporationParamLabel"),
    input: document.querySelector("#evaporationParam"),
    output: document.querySelector("#evaporationParamValue"),
    format: (value) => `${value.toFixed(2)}x`
  },
  {
    key: "gwFlow",
    planet: "asteroid",
    label: document.querySelector("#gwFlowParamLabel"),
    input: document.querySelector("#gwFlowParam"),
    output: document.querySelector("#gwFlowParamValue"),
    format: (value) => `${value.toFixed(3)} m/d`
  },
  {
    key: "rootDepth",
    planet: "asteroid",
    label: document.querySelector("#rootDepthParamLabel"),
    input: document.querySelector("#rootDepthParam"),
    output: document.querySelector("#rootDepthParamValue"),
    format: (value) => value.toFixed(1)
  },
  {
    key: "shade",
    planet: "asteroid",
    label: document.querySelector("#shadeParamLabel"),
    input: document.querySelector("#shadeParam"),
    output: document.querySelector("#shadeParamValue"),
    format: (value) => `${value.toFixed(2)}x`
  },
  {
    key: "roseGrowth",
    label: document.querySelector("#roseGrowthParamLabel"),
    input: document.querySelector("#roseGrowthParam"),
    output: document.querySelector("#roseGrowthParamValue"),
    format: (value) => `${value.toFixed(2)}x`
  },
  {
    key: "baobabGrowth",
    label: document.querySelector("#baobabGrowthParamLabel"),
    input: document.querySelector("#baobabGrowthParam"),
    output: document.querySelector("#baobabGrowthParamValue"),
    format: (value) => `${value.toFixed(2)}x`
  },
  {
    key: "atmosphericCo2Ppm",
    planet: "asteroid",
    label: document.querySelector("#co2ParamLabel"),
    input: document.querySelector("#co2Param"),
    output: document.querySelector("#co2ParamValue"),
    format: (value) => `${Math.round(value)} ppm`
  },
  {
    key: "storage",
    planet: "asteroid",
    label: document.querySelector("#storageParamLabel"),
    input: document.querySelector("#storageParam"),
    output: document.querySelector("#storageParamValue"),
    format: (value) => `${value.toFixed(2)}x`
  },
  {
    key: "actionTimeScale",
    label: document.querySelector("#actionTimeScaleParamLabel"),
    input: document.querySelector("#actionTimeScaleParam"),
    output: document.querySelector("#actionTimeScaleParamValue"),
    format: formatActionTimeScale
  }
];
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

const TRANSLATIONS = {
  en: {
    axisNorth: "+Z North",
    title: "Asteroid Garden",
    titleEarth: "Earth Garden",
    home: "Home",
    homeLabel: "Back to HEALPix Games",
    showSettings: "Settings",
    hideSettings: "Hide settings",
    showSettingsLabel: "Show simulation settings",
    hideSettingsLabel: "Hide simulation settings",
    showMap: "Open",
    hideMap: "Hide",
    showMapLabel: "Show flat map",
    hideMapLabel: "Hide flat map",
    showColorbar: "Scale",
    hideColorbar: "Hide scale",
    showColorbarLabel: "Show numeric color scale",
    hideColorbarLabel: "Hide numeric color scale",
    map: "Flat map",
    day: "Day",
    actions: "Time",
    selected: "Selected",
    roseCell: "Rose patches",
    roseStatus: "Rose",
    water: "Water",
    releaseWater: "Release",
    pull: "Pull",
    burn: "Burn",
    clean: "Clean",
    sheep: "Keep sheep",
    observe: "Observe",
    sunset: "Sunset",
    rest: "Rest",
    night: "Wait",
    newGame: "New",
    resetSettings: "Reset settings",
    planetPresets: {
      asteroid: "Asteroid",
      earth: "Earth"
    },
    simulationParams: {
      annualPrecipMm: "Annual rain",
      dryDays: "Dry days",
      rainPatchiness: "Patchiness",
      rainScale: "Storm size",
      asteroidMeanTempC: "Mean temp",
      asteroidDiurnalRangeC: "Day-night range",
      asteroidLatitudeTempRangeC: "Latitude range",
      evaporation: "Evaporation",
      gwFlow: "GW conductivity",
      rootDepth: "Root depth",
      shade: "Shade",
      roseGrowth: "Rose growth",
      baobabGrowth: "Baobab growth",
      atmosphericCo2Ppm: "Atmospheric CO2",
      storage: "Trunk water",
      actionTimeScale: "Action scale"
    },
    viewModes: {
      landUse: "Land use",
      substrate: "Substrate",
      soilNutrient: "Mineral nutrients",
      soilCarbon: "Soil organic carbon",
      carbonBudget: "Carbon flux",
      topSoilWater: "Soil water: upper layer",
      midSoilWater: "Soil water: middle layer",
      deepSoilWater: "Soil water: lower layer",
      topSoilHead: "Soil water head: upper",
      midSoilHead: "Soil water head: middle",
      deepSoilHead: "Soil water head: lower",
      topSoilK: "Hydraulic conductivity: upper",
      midSoilK: "Hydraulic conductivity: middle",
      deepSoilK: "Hydraulic conductivity: lower",
      groundwater: "Groundwater storage",
      groundwaterHead: "Groundwater hydraulic head",
      waterPotential: "Soil water potential: upper",
      rootStress: "Root water availability",
      waterBudget: "Water movement",
      surfaceWater: "Surface ponding",
      snowIce: "Snow and ice",
      rainfall: "Mean rainfall",
      cloudCover: "Cloud cover",
      meanTemp: "Mean temperature",
      koppen: "Köppen climate",
      sunlight: "Sunlight",
      leafArea: "Leaf area index",
      apar: "Absorbed PAR",
      vegetation: "Vegetation",
      seedBank: "Seed bank",
      elevation: "Terrain height",
      height: "Plant height"
    },
    viewGroups: {
      land: "Land",
      soil: "Soil nutrients and carbon",
      water: "Hydrology",
      weather: "Weather and light",
      vegetation: "Vegetation"
    },
    resolution: (nside, day, renderNside = nside) => renderNside === nside
      ? `NSIDE ${nside} / Day ${day}`
      : `NSIDE ${nside} (render ${renderNside}) / Day ${day}`,
    start: "Click any cell to choose a patch on the little asteroid.",
    startEarth: "The crash site in the Sahara is the center of this Earth garden. Click any cell to inspect the HEALPix surface.",
    moved: "Selected this patch.",
    tooFar: "Select a patch, then choose an action.",
    noActions: "Time keeps moving on the asteroid.",
    watered: "The soil drinks a little water.",
    wateredFrozen: "The water froze on the cold surface before it could soak in.",
    wateredPartlyFrozen: "Some water soaked into the exposed ground, but the rest froze on the cold surface.",
    wateredActiveVolcano: "The water hisses into steam on the active volcanic ground.",
    wateredOcean: "The ocean shows no visible change.",
    wateredWaterReserve: "A small ripple spreads across the water reserve.",
    wateredWaterShore: "The wet shore becomes a little damper.",
    released: "Water was released across the nearby ground.",
    releasedFrozen: "The released water spread as a thin frozen skin over the cold ground.",
    releasedPartlyFrozen: "Some released water moved through the exposed ground, but much of it froze again.",
    releasedActiveVolcano: "The released water steamed away on the active volcanic ground.",
    releasedOcean: "Releasing water over the ocean changes nothing visible.",
    releasedWaterReserve: "Water was released from the reserve into the nearby ground.",
    releasedWaterShore: "Water spread from the shore into the damp ground nearby.",
    releasedRose: "Too much water flowed into the rose ground. The roots may have trouble breathing.",
    releasedFireWeakened: "The released water weakened the burning patch, but some fire remains.",
    releasedFire: "The released water put out the burning patch.",
    pulledNone: "No baobab sprout is rooted here.",
    pulledTooSmall: "It may be a baobab, but it is still too small to tell. Watch it a little longer.",
    pulledRosePlain: "If it were an ordinary rose, you could pull it.",
    pulledRoseMemory: "Your hand stops. The time spent here still remains in this flower.",
    pulledRoseMeaning: "What matters is not decided only by what can be seen. The time you have spent with this flower is what makes it special.",
    pulledRoseReturn: "This is not just a rose. It is one of the reasons you come back.",
    pulledEarthRose: "The garden rose came away. For a moment, you remembered the rose left on the little asteroid.",
    pulledWildRose: "You pulled the rose that had taken root beyond the first garden.",
    pulled: "You loosened the baobab before it could grip the star.",
    pulledPatch: "You pulled the small baobab sprouts before they could take root.",
    pulledWeakened: "You weakened the thick baobab roots. It will take more work to remove them.",
    burned: "You made a controlled burn. The dry fuel will burn down and leave ash.",
    burnedNone: "There was almost nothing dry enough to burn here.",
    burnedStacked: "The existing fire burns hotter.",
    burnedWet: "The wet ground kept the fire from spreading.",
    burnedOcean: "A fire cannot be set on the ocean. Only the wind moves over the water.",
    burnedWaterReserve: "The water reserve is too wet to burn.",
    burnedVolcano: "The volcanic ground did not change as a burn patch.",
    burnedRose: "The fire reached the rose ground. That may be too much.",
    burnedProtectedRose: "Your hand stops. This is not fuel for a controlled burn.",
    burnedEarthRose: "The rose burned quickly, leaving only a trace of ash.",
    cleaned: "You brushed away the ash and worked it back into the soil.",
    cleanedPatch: "You brushed away a thin spread of ash and returned it to the soil.",
    cleanedHeavy: "You worked through the thick ash and returned what you could to the soil. Some ash still remains.",
    cleanedSnowIce: "You cleared snow and surface ice, exposing the ground.",
    cleanedAshAndSnowIce: "You cleared ash, snow, and surface ice from the ground.",
    sheepReleased: "A sheep began wandering over nearby land, learning where young shoots tend to appear.",
    sheepOcean: "Sheep cannot be released on the ocean.",
    sheepAsteroidUnavailable: "There are no sheep on the little asteroid.",
    sheepGrazed: "The sheep clipped young shoots and left nutrients in the nearby soil. It will remember this patch for a while.",
    sheepNoSprouts: "The sheep wandered nearby, but found no young shoots to graze.",
    sheepGone: "A sheep could not find enough young shoots for a long time and disappeared from the garden.",
    sunsetMemory: "You watched the sunset and kept the color in memory.",
    sunsetCloudy: "The weather was poor today, and the sunset could not be seen.",
    restMessage: (duration) => `You rested and let ${duration} pass.`,
    nightMessage: "A new day began on the asteroid.",
    nightMessageEarth: "A new day began on Earth.",
    waitMessage: (duration) => `You waited and let ${duration} pass.`,
    finalGood: (days) => `Day ${days}: the asteroid feels clear, warm, and kept.`,
    finalOk: (days) => `Day ${days}: the asteroid remains fragile, but it is still turning.`,
    finalBad: (days) => `Day ${days}: roots and ash have made the asteroid heavy.`,
    roseWithered: "The rose has withered. The asteroid feels suddenly quiet.",
    eventNewGame: "A new garden was prepared.",
    eventSettingsReset: "Simulation settings were reset.",
    eventEarth: "Earth preset: the Sahara crash site, a nearby well, oceans, continents, and wetter rose habitats.",
    eventAsteroid: "Asteroid preset: a small dry garden around B-612.",
    eventRain: "Rain moved across the surface.",
    eventRoseWeak: "The rose sounded fragile.",
    eventBaobabLarge: "A baobab has become hard to ignore.",
    eventSunset: "A sunset was kept in memory.",
    roseHelpWilting: 'Rose: "If it stays like this, I may not last until tomorrow. Please water me now."',
    roseHelpCritical: 'Rose: "I feel faint. Could you look at the water and the ash first?"',
    roseHelpWater: 'Rose: "The soil around me is dry. A little water would help."',
    roseHelpAsh: 'Rose: "There is ash near me. It makes the air feel heavy."',
    roseHelpBaobab: 'Rose: "Those baobabs nearby worry me. Pull them while they are still small."',
    roseHelpCare: 'Rose: "Could you check on me for a moment today?"',
    roseHelpStable: 'Rose: "I am all right for now."',
    observeNotes: {
      roseHere: "the rose is here",
      roseWeak: "the rose looks weak",
      dry: "soil is dry",
      wet: "soil is moist",
      ash: "ash has settled",
      baobabHidden: "something like a baobab may be sprouting",
      baobabSprout: "baobab sprouts are visible",
      baobabLarge: "baobab roots are heavy",
      poorLight: "sunlight is weak",
      rain: "rain has passed here",
      snowIce: "snow or surface ice remains",
      cold: "the air is cold",
      mild: "the air is mild",
      warm: "the air is warm",
      hot: "the air is hot"
    },
    plantBriefRose: (mass, height, seed) => `rose ${mass}% / ${height} m / seed ${seed}%`,
    plantBriefBaobab: (mass, height, seed) => `baobab ${mass}% / ${height} m / seed ${seed}%`,
    plantBriefNone: "no rose or baobab",
    terrain: {
      sand: "sand",
      rock: "rock",
      crack: "baobab watch ground",
      path: "sunset path",
      volcano: "volcano",
      activeVolcano: "active volcano",
      dormantVolcano: "dormant volcano",
      moss: "small moss",
      meadow: "meadow",
      water: "water",
      rose: "rose"
    },
    land: {
      roseLoam: "rose garden loam",
      roseBorder: "kept rose border",
      waterReserve: "water reserve",
      waterShore: "damp water edge",
      sunsetPath: "sunset path turf",
      sunsetMeadow: "wide sunset meadow",
      activeVolcanoLand: "active volcanic ground",
      dormantVolcanoLand: "old volcanic ground",
      volcanicSkirt: "thin volcanic slope",
      freshAshSoil: "fresh ash fall",
      ashSoil: "ash-covered soil",
      baobabWatch: "baobab watch soil",
      baobabSproutGround: "baobab sprout ground",
      baobabRooted: "baobab-rooted soil",
      baobabDanger: "dangerous baobab roots",
      loamGround: "loam",
      wetLoam: "damp loam",
      moistBasin: "moist basin",
      mossLoam: "mossy loam",
      dryLoam: "dry loam",
      sandySoil: "sandy soil",
      crustSoil: "crusted soil",
      rockySoil: "rocky soil",
      lichenRock: "lichen rock",
      earthRoseGarden: "temperate rose garden",
      earthOcean: "ocean",
      earthCoast: "coastal shelf",
      earthWetland: "wetland",
      earthForest: "forest",
      earthGrassland: "grassland",
      earthDesert: "desert",
      earthMountain: "mountain",
      earthHighland: "highland",
      earthBaobabGrove: "baobab grove"
    },
    substrate: {
      loam: "loam",
      rock: "rock",
      ash: "volcanic ash",
      sand: "sand",
      crust: "clay crust"
    },
    baobabStage: (value) =>
      value < 0.08 ? "no baobab" : value < 0.32 ? "baobab sprout" : value < 0.7 ? "young baobab" : "dangerous baobab",
    waterBudgetLine: (input, horizontal, infiltration, percolation01, percolation12, recharge, leakage, loss, change) =>
      `water movement input ${input} mm / horizontal transport ${horizontal} mm / surface ponding to upper soil ${infiltration} mm / upper to middle soil ${percolation01} mm / middle to lower soil ${percolation12} mm / lower soil to groundwater ${recharge} mm / groundwater leakage ${leakage} mm / total loss ${loss} mm / storage change ${change} mm`,
    carbonBudgetLine: (input, respiration, transport, disturbance, change) =>
      `carbon flux GPP input ${input} gC/m2 / respiration loss ${respiration} gC/m2 / seed transport ${transport} gC/m2 / disturbance export ${disturbance} gC/m2 / storage ${change} gC/m2`,
    ecosystemCarbonLine: (total, pools, nep) =>
      `ecosystem C gC/m2 total ${total} / plant/seed/litter/SOC ${pools} / NEP ${nep} gC/m2/d`,
    photosynthesisLimitLine: (baobab, rose) =>
      `GPP limits B T/W/VPD/CO2/N/total ${baobab} / R ${rose}`,
    lueGppLine: (baobab, rose) =>
      `LUE GPP gC/m2/d B/R ${baobab}/${rose}`,
    plantProductionLine: (baobab, rose) =>
      `plant production gC/m2/d B GPP/Rm/Rg/NPP ${baobab} / R GPP/Rm/Rg/NPP ${rose}`,
    plantLossLine: (baobab, rose) =>
      `plant tissue loss gC/m2/d B leaf/stem/root ${baobab} / R leaf/flower/root ${rose}`,
    plantCarbonLine: (baobab, rose) =>
      `plant C pools gC/m2 B total/leaf/stem/root/store ${baobab} / R total/leaf/flower/root/store ${rose}`,
    soilCarbonPoolLine: (litter, soc) =>
      `litter/SOC pools gC/m2 litter fast/slow ${litter} / SOC active/stable ${soc}`,
    allocationFractionLine: (baobab, rose) =>
      `NPP allocation fraction B leaf/stem/root/store ${baobab} / R leaf/flower/root/store ${rose}`,
    allocationLine: (baobab, rose) =>
      `NPP allocation gC/m2/d B leaf/stem/root/store ${baobab} / R leaf/flower/root/store ${rose}`,
    litterSourceLine: (baobab, rose, seed) =>
      `litter input source gC/m2/d B/R/seed ${baobab}/${rose}/${seed}`,
    soilCarbonFluxLine: (litterInput, litterDecay, humification, activeDecay, stabilization, stableDecay) =>
      `litter/SOC flux gC/m2/d litter input ${litterInput} / litter decay ${litterDecay} / humification ${humification} / active SOC decay ${activeDecay} / stabilization ${stabilization} / stable SOC decay ${stableDecay}`,
    soilRespirationLine: (components) =>
      `soil C respiration gC/m2/d litter/active SOC/stable SOC ${components}`,
    disturbanceLine: (exported) => `disturbance export ${exported} gC/m2`,
    groundwaterHeadLine: (head) => `groundwater hydraulic head ${head} m`,
    summaryLine: (land, notes) =>
      `${land}: ${notes.length > 0 ? notes.join("; ") : "quiet for now"}.`,
    observeLine: (land, terrain, substrate, top, mid, deep, ground, nutrient, temp, rain, snowIce, sunlight, roseMass, baobabMass, baobab, ash) =>
      `${land} (${terrain}, ${substrate}): soil water upper/middle/lower ${top}/${mid}/${deep}% / groundwater ${ground}% / nutrients ${nutrient}% / mean temp ${temp} C / sunlight ${sunlight}% / mean rain ${rain} mm/d / snow-ice ${snowIce} mm / rose ${roseMass}% / baobab ${baobabMass}% (${baobab}) / ash ${ash}%`,
    roseMood: (health) =>
      health > 82 ? "The rose is calm." : health > 58 ? "The rose wants attention." : "The rose is uneasy."
  },
  ja: {
    axisNorth: "+Z 北",
    title: "小惑星の庭",
    titleEarth: "地球の庭",
    home: "ホーム",
    homeLabel: "HEALPix Gamesに戻る",
    showSettings: "設定",
    hideSettings: "設定を隠す",
    showSettingsLabel: "シミュレーション設定を表示",
    hideSettingsLabel: "シミュレーション設定を隠す",
    showMap: "開く",
    hideMap: "隠す",
    showMapLabel: "平面展開図を表示",
    hideMapLabel: "平面展開図を隠す",
    showColorbar: "カラーバー",
    hideColorbar: "カラーバー隠す",
    showColorbarLabel: "数値カラーバーを表示",
    hideColorbarLabel: "数値カラーバーを隠す",
    map: "平面展開図",
    day: "日",
    actions: "時刻",
    selected: "選択",
    roseCell: "バラ区画数",
    roseStatus: "バラ",
    water: "水やり",
    releaseWater: "放水",
    pull: "抜く",
    burn: "火入れ",
    clean: "掃除",
    sheep: "羊を飼う",
    observe: "観察",
    sunset: "夕日",
    rest: "休む",
    night: "待つ",
    newGame: "新規",
    resetSettings: "設定初期化",
    planetPresets: {
      asteroid: "小惑星",
      earth: "地球"
    },
    simulationParams: {
      annualPrecipMm: "年降水量",
      dryDays: "乾期日数",
      rainPatchiness: "降水斑状性",
      rainScale: "降水域サイズ",
      asteroidMeanTempC: "全球平均気温",
      asteroidDiurnalRangeC: "日変化幅",
      asteroidLatitudeTempRangeC: "緯度差",
      evaporation: "蒸発強度",
      gwFlow: "地下水透水性",
      rootDepth: "根深度",
      shade: "遮光",
      roseGrowth: "バラ成長",
      baobabGrowth: "バオバブ成長",
      atmosphericCo2Ppm: "大気CO2",
      storage: "幹貯水",
      actionTimeScale: "1行動の倍率"
    },
    viewModes: {
      landUse: "土地利用",
      substrate: "土壌基質",
      soilNutrient: "無機養分",
      soilCarbon: "土壌有機炭素",
      carbonBudget: "炭素フラックス",
      topSoilWater: "土壌水：上層",
      midSoilWater: "土壌水：中層",
      deepSoilWater: "土壌水：下層",
      topSoilHead: "土壌水頭：上層",
      midSoilHead: "土壌水頭：中層",
      deepSoilHead: "土壌水頭：下層",
      topSoilK: "透水係数：上層",
      midSoilK: "透水係数：中層",
      deepSoilK: "透水係数：下層",
      groundwater: "地下水貯留",
      groundwaterHead: "地下水水頭",
      waterPotential: "土壌水ポテンシャル：上層",
      rootStress: "根の吸水しやすさ",
      waterBudget: "水移動",
      surfaceWater: "地表滞水",
      snowIce: "積雪・氷",
      rainfall: "平均降水量",
      cloudCover: "雲量",
      meanTemp: "年平均気温",
      koppen: "ケッペン気候区分",
      sunlight: "日射量",
      leafArea: "葉面積指数",
      apar: "吸収PAR",
      vegetation: "植生",
      seedBank: "種子バンク",
      elevation: "標高",
      height: "植物高"
    },
    viewGroups: {
      land: "地形・土地",
      soil: "土壌養分・炭素",
      water: "水文",
      weather: "気象・光",
      vegetation: "植生"
    },
    resolution: (nside, day, renderNside = nside) => renderNside === nside
      ? `NSIDE ${nside} / ${day}日目`
      : `NSIDE ${nside}（表示 ${renderNside}）/ ${day}日目`,
    start: "任意のセルをクリックして、操作する区画を選んでください。小惑星を見守りましょう。",
    startEarth: "地球ガーデンでは、サハラ砂漠の不時着地点が中心です。任意のセルをクリックして、HEALPixの区画を見てください。",
    moved: "この区画を選んだ。",
    tooFar: "区画を選んでから行動してください。",
    noActions: "小惑星の時間は進んでいる。",
    watered: "土が少し潤った。",
    wateredFrozen: "水は冷えた地表で凍り、土にはほとんど染み込まなかった。",
    wateredPartlyFrozen: "出ている地面には少し染み込んだが、残りは冷えた地表で凍った。",
    wateredActiveVolcano: "活火山の地面に落ちた水は、白い湯気になってすぐ消えた。",
    wateredOcean: "海に水を足しても、見た目には何も変わらない。",
    wateredWaterReserve: "保水地の水面に小さな波紋が広がった。",
    wateredWaterShore: "水辺の土が、少しだけさらに湿った。",
    released: "周囲の地面へ水を流した。",
    releasedFrozen: "放水した水は、冷えた地表に薄い氷として広がった。",
    releasedPartlyFrozen: "放水した水の一部は地面を流れたが、多くはまた凍った。",
    releasedActiveVolcano: "放水した水は、活火山の地面で白い湯気になって消えた。",
    releasedOcean: "海で放水しても、見た目には何も変わらない。",
    releasedWaterReserve: "保水地から周囲の地面へ水を流した。",
    releasedWaterShore: "水辺から湿った地面へ水を広げた。",
    releasedRose: "バラの地面に水を流し込みすぎた。根元の土が、少し息苦しそうだ。",
    releasedFireWeakened: "放水で火は弱まったが、まだ燃えている。",
    releasedFire: "放水で、燃えていた地面の火を消した。",
    pulledNone: "ここにはバオバブの芽はない。",
    pulledTooSmall: "バオバブかもしれないが、まだ小さすぎて見分けがつかない。もう少し様子を見るしかなさそうだ。",
    pulledRosePlain: "普通のバラなら抜ける",
    pulledRoseMemory: "手が止まった。この花には、ここで過ごした時間が残っている。",
    pulledRoseMeaning: "大切なものは、目に見える形だけでは決まらない。\nあなたがこの花にかけた時間が、この花を特別にしている。",
    pulledRoseReturn: "これは、ただのバラではない。\nあなたが帰ってくる理由のひとつだ。",
    pulledEarthRose: "地球の庭のバラを抜いた。そのとき少しだけ、故郷の小惑星に残したバラのことを思い出した。",
    pulledWildRose: "最初の庭ではない場所に根づいたバラを抜いた。",
    pulled: "バオバブが根を張る前に抜いた。",
    pulledPatch: "小さなバオバブの芽を、根づく前にまとめて抜いた。",
    pulledWeakened: "太くなったバオバブの根を少し弱らせた。抜ききるには、もう少し手がかかりそうだ。",
    burned: "乾いた地表に火を入れた。燃えている間に、灰が少しずつ残る。",
    burnedNone: "ここには、燃やせるほど乾いたものがほとんどない。",
    burnedStacked: "火がさらに強く燃えはじめた。",
    burnedWet: "湿った地面では、火はほとんど広がらなかった。",
    burnedOcean: "海では火入れにならない。水面の上を風が動くだけだ。",
    burnedWaterReserve: "保水地では、火はつかない。",
    burnedVolcano: "火山の地面では、火入れとしては何も変わらない。",
    burnedRose: "火がバラの地面にも触れた。少しやりすぎかもしれない。",
    burnedProtectedRose: "手が止まった。この花は、火入れで燃やすものではない。",
    burnedEarthRose: "地球のバラはすぐに燃え、灰だけが少し残った。",
    cleaned: "灰を払い、土に戻した。",
    cleanedPatch: "薄く広がった灰をまとめて払い、土に戻した。",
    cleanedHeavy: "厚く積もった灰を削るように払い、土に戻した。まだ少し残っている。",
    cleanedSnowIce: "雪と表層の氷を払い、地面を少し出した。",
    cleanedAshAndSnowIce: "灰と雪氷を払い、地面を少し出した。",
    sheepReleased: "羊を放した。羊は近くの陸地を歩き、若い芽が出やすい場所を少しずつ覚えていく。",
    sheepOcean: "海には羊を放てない。",
    sheepAsteroidUnavailable: "小惑星には羊はいない。",
    sheepGrazed: "羊が若い芽を摘み、近くの土に養分を落とした。この場所をしばらく覚えている。",
    sheepNoSprouts: "羊は近くを歩いたが、摘むほどの若い芽は見つからなかった。",
    sheepGone: "長いあいだ若い芽を見つけられなかった羊が、庭からいなくなった。",
    sunsetMemory: "夕日を見て、その色を記憶に残した。",
    sunsetCloudy: "今日は天気が悪くて夕日が見れない。",
    restMessage: (duration) => `休んで、${duration}ぶん時間が進んだ。`,
    nightMessage: "小惑星に新しい日が始まった。",
    nightMessageEarth: "地球に新しい日が始まった。",
    waitMessage: (duration) => `少し待って、${duration}ぶん時間が進んだ。`,
    finalGood: (days) => `${days}日目。小惑星は明るく、よく保たれている。`,
    finalOk: (days) => `${days}日目。小惑星は少し不安定だが、まだ回っている。`,
    finalBad: (days) => `${days}日目。根と灰で、小惑星は重くなっている。`,
    roseWithered: "バラは枯れてしまった。小惑星は、急に静かになった。",
    eventNewGame: "新しい庭を用意した。",
    eventSettingsReset: "シミュレーション設定を初期値に戻した。",
    eventEarth: "地球プリセット。サハラ砂漠の不時着地点と井戸、海と大陸、湿りやすいバラの生育地がある。",
    eventAsteroid: "小惑星プリセット。B-612のような乾いた小さな庭。",
    eventRain: "雨域が通り過ぎた。",
    eventRoseWeak: "バラの声が少し弱く聞こえた。",
    eventBaobabLarge: "見過ごせない大きさのバオバブがある。",
    eventSunset: "夕日の色を記憶に残した。",
    roseHelpWilting: "バラ「このままだと、明日までもたないかもしれない。今すぐ水をくれる？」",
    roseHelpCritical: "バラ「少し、元気がないみたい。水と灰のことを先に見てくれる？」",
    roseHelpWater: "バラ「庭の土が乾いているわ。少しだけ水をもらえるかしら。」",
    roseHelpAsh: "バラ「近くに灰が積もって、空気が重いの。払ってくれる？」",
    roseHelpBaobab: "バラ「あのバオバブ、気になるわ。小さいうちに抜いておいたほうがいいんじゃない？」",
    roseHelpCare: "バラ「今日は、少しだけ様子を見てくれる？」",
    roseHelpStable: "バラ「今は大丈夫よ。」",
    observeNotes: {
      roseHere: "バラがここにいる",
      roseWeak: "バラが弱っている",
      dry: "土が乾いている",
      wet: "土は湿っている",
      ash: "灰が積もっている",
      baobabHidden: "バオバブかもしれない芽がある",
      baobabSprout: "バオバブの芽が見える",
      baobabLarge: "バオバブの根が重い",
      poorLight: "日当たりが弱い",
      rain: "雨が通った跡がある",
      snowIce: "雪や表層の氷が残っている",
      cold: "空気が冷たい",
      mild: "気温は穏やか",
      warm: "暖かい",
      hot: "暑さが強い"
    },
    plantBriefRose: (mass, height, seed) => `バラ ${mass}% / ${height}m / 種子 ${seed}%`,
    plantBriefBaobab: (mass, height, seed) => `バオバブ ${mass}% / ${height}m / 種子 ${seed}%`,
    plantBriefNone: "バラ/バオバブなし",
    terrain: {
      sand: "砂地",
      rock: "岩",
      crack: "バオバブ監視地",
      path: "夕日観測路",
      volcano: "火山",
      activeVolcano: "活火山",
      dormantVolcano: "休火山",
      moss: "小さな苔",
      meadow: "花畑",
      water: "水場",
      rose: "バラ"
    },
    land: {
      roseLoam: "バラの庭土",
      roseBorder: "手入れされたバラの縁",
      waterReserve: "水辺の保水地",
      waterShore: "湿った水辺",
      sunsetPath: "夕日観測路の草地",
      sunsetMeadow: "広い夕日観測草地",
      activeVolcanoLand: "活火山の地面",
      dormantVolcanoLand: "休火山の地面",
      volcanicSkirt: "火山の裾野",
      freshAshSoil: "新しい火山灰地",
      ashSoil: "灰をかぶった土",
      baobabWatch: "バオバブ監視地の土",
      baobabSproutGround: "バオバブの芽がある土",
      baobabRooted: "バオバブが根を張った土",
      baobabDanger: "危険なバオバブ根圏",
      loamGround: "ローム",
      wetLoam: "湿った壌土",
      moistBasin: "湿ったくぼ地",
      mossLoam: "苔のある壌土",
      dryLoam: "乾いた壌土",
      sandySoil: "砂質土",
      crustSoil: "固結した表土",
      rockySoil: "岩がちな土",
      lichenRock: "地衣類の岩地",
      earthRoseGarden: "温帯のバラ園",
      earthOcean: "海洋",
      earthCoast: "沿岸浅海",
      earthWetland: "湿地",
      earthForest: "森林",
      earthGrassland: "草地",
      earthDesert: "砂漠",
      earthMountain: "山地",
      earthHighland: "高原",
      earthBaobabGrove: "バオバブ林"
    },
    substrate: {
      loam: "ローム",
      rock: "岩地",
      ash: "火山灰",
      sand: "砂地",
      crust: "粘土クラスト"
    },
    baobabStage: (value) =>
      value < 0.08 ? "バオバブなし" : value < 0.32 ? "バオバブの芽" : value < 0.7 ? "若いバオバブ" : "危険なバオバブ",
    waterBudgetLine: (input, horizontal, infiltration, percolation01, percolation12, recharge, leakage, loss, change) =>
      `水移動 入力 ${input}mm / 水平輸送 ${horizontal}mm / 地表滞水→土壌上層 ${infiltration}mm / 土壌上層→中層 ${percolation01}mm / 土壌中層→下層 ${percolation12}mm / 土壌下層→地下水 ${recharge}mm / 地下水漏出 ${leakage}mm / 総損失 ${loss}mm / 貯留変化 ${change}mm`,
    carbonBudgetLine: (input, respiration, transport, disturbance, change) =>
      `炭素フラックス GPP入力 ${input}gC/m2 / 呼吸損失 ${respiration}gC/m2 / 種子移動 ${transport}gC/m2 / 外乱持ち出し ${disturbance}gC/m2 / 貯留変化 ${change}gC/m2`,
    ecosystemCarbonLine: (total, pools, nep) =>
      `生態系C gC/m2 合計 ${total} / 植物体/種子/リター/SOC ${pools} / NEP ${nep}gC/m2/d`,
    photosynthesisLimitLine: (baobab, rose) =>
      `GPP制限 バオバブ T/W/VPD/CO2/N/総合 ${baobab} / バラ ${rose}`,
    lueGppLine: (baobab, rose) =>
      `LUE型GPP gC/m2/d バオバブ/バラ ${baobab}/${rose}`,
    plantProductionLine: (baobab, rose) =>
      `植物生産 gC/m2/d バオバブ GPP/維持呼吸/成長呼吸/NPP ${baobab} / バラ GPP/維持呼吸/成長呼吸/NPP ${rose}`,
    plantLossLine: (baobab, rose) =>
      `植物体損失 gC/m2/d バオバブ 葉/幹/根 ${baobab} / バラ 葉/花/根 ${rose}`,
    plantCarbonLine: (baobab, rose) =>
      `植物体C gC/m2 バオバブ 合計/葉/幹/根/貯蔵 ${baobab} / バラ 合計/葉/花/根/貯蔵 ${rose}`,
    soilCarbonPoolLine: (litter, soc) =>
      `リター/SOCプール gC/m2 リター 易分解/難分解 ${litter} / SOC 活性/安定 ${soc}`,
    allocationFractionLine: (baobab, rose) =>
      `NPP配分率 バオバブ 葉/幹/根/貯蔵 ${baobab} / バラ 葉/花/根/貯蔵 ${rose}`,
    allocationLine: (baobab, rose) =>
      `NPP配分 gC/m2/d バオバブ 葉/幹/根/貯蔵 ${baobab} / バラ 葉/花/根/貯蔵 ${rose}`,
    litterSourceLine: (baobab, rose, seed) =>
      `リター入力源 gC/m2/d バオバブ/バラ/種子 ${baobab}/${rose}/${seed}`,
    soilCarbonFluxLine: (litterInput, litterDecay, humification, activeDecay, stabilization, stableDecay) =>
      `リター/SOCフラックス gC/m2/d リター入力 ${litterInput} / リター分解 ${litterDecay} / 腐植化 ${humification} / 活性SOC分解 ${activeDecay} / 安定化 ${stabilization} / 安定SOC分解 ${stableDecay}`,
    soilRespirationLine: (components) =>
      `土壌C呼吸内訳 gC/m2/d リター/活性SOC/安定SOC ${components}`,
    disturbanceLine: (exported) => `外乱持ち出し ${exported}gC/m2`,
    groundwaterHeadLine: (head) => `地下水水頭 ${head}m`,
    summaryLine: (land, notes) =>
      `${land}：${notes.length > 0 ? notes.join("、") : "今は落ち着いている"}。`,
    observeLine: (land, terrain, substrate, top, mid, deep, ground, nutrient, temp, rain, snowIce, sunlight, roseMass, baobabMass, baobab, ash) =>
      `${land}（${terrain}, ${substrate}）：土壌水 上層/中層/下層 ${top}/${mid}/${deep}% / 地下水 ${ground}% / 無機養分 ${nutrient}% / 平均気温 ${temp}℃ / 日射 ${sunlight}% / 平均降水 ${rain}mm/d / 積雪・氷 ${snowIce}mm / バラ ${roseMass}% / バオバブ ${baobabMass}%（${baobab}） / 灰 ${ash}%`,
    roseMood: (health) =>
      health > 82 ? "バラは落ち着いている。" : health > 58 ? "バラは少し気にしてほしそうだ。" : "バラは不安そうだ。"
  }
};

const languageOptions = new Set(Object.keys(TRANSLATIONS));
const requestedLanguage = new URLSearchParams(window.location.search).get("lang");
const storedLanguage =
  window.localStorage.getItem("healpixGameLanguage") ?? window.localStorage.getItem("healpixAsteroidLanguage");
let currentLanguage = languageOptions.has(requestedLanguage)
  ? requestedLanguage
  : languageOptions.has(storedLanguage)
    ? storedLanguage
    : navigator.language.startsWith("ja")
      ? "ja"
      : "en";
window.localStorage.setItem("healpixGameLanguage", currentLanguage);
window.localStorage.setItem("healpixAsteroidLanguage", currentLanguage);
window.localStorage.setItem("healpixAsteroidPlanetPreset", currentPlanetPreset);

const SIMULATION_SETTINGS_KEY_PREFIX = "healpixAsteroidSimulationSettingsV17";
const ASTEROID_SIMULATION_SETTINGS = Object.freeze({
  annualPrecipMm: 70,
  dryDays: 340,
  rainPatchiness: 0.78,
  rainScale: 18,
  asteroidMeanTempC: 18,
  asteroidDiurnalRangeC: 10,
  asteroidLatitudeTempRangeC: 3,
  evaporation: 1.25,
  gwFlow: 0.006,
  rootDepth: 4.6,
  shade: 0.45,
  roseGrowth: 0.8,
  baobabGrowth: 1.0,
  atmosphericCo2Ppm: 430,
  storage: 1.12,
  actionTimeScale: 1
});
const EARTH_SIMULATION_SETTINGS = Object.freeze({
  annualPrecipMm: 980,
  dryDays: 48,
  rainPatchiness: 0.46,
  rainScale: 32,
  asteroidMeanTempC: 16,
  asteroidDiurnalRangeC: 16,
  asteroidLatitudeTempRangeC: 3,
  evaporation: 0.78,
  gwFlow: 0.018,
  rootDepth: 5.8,
  shade: 0.82,
  roseGrowth: 0.96,
  baobabGrowth: 1.0,
  atmosphericCo2Ppm: 420,
  storage: 1.12,
  actionTimeScale: 1
});
const EARTH_FIXED_SETTING_KEYS = Object.freeze([
  "annualPrecipMm",
  "dryDays",
  "rainPatchiness",
  "rainScale",
  "evaporation",
  "gwFlow",
  "rootDepth",
  "shade",
  "atmosphericCo2Ppm",
  "storage"
]);
let simulationSettings = loadSimulationSettings();
let timeIntegrationDepth = 0;
const VIEW_SETTINGS_KEY = "healpixAsteroidViewMode";
const viewModes = new Set(["landUse", "substrate", "soilNutrient", "soilCarbon", "carbonBudget", "topSoilWater", "midSoilWater", "deepSoilWater", "topSoilHead", "midSoilHead", "deepSoilHead", "topSoilK", "midSoilK", "deepSoilK", "groundwater", "groundwaterHead", "waterPotential", "rootStress", "waterBudget", "surfaceWater", "snowIce", "rainfall", "cloudCover", "meanTemp", "koppen", "sunlight", "leafArea", "apar", "vegetation", "seedBank", "elevation", "height"]);
const continuousGlobalRenderViewModes = new Set([
  "soilNutrient",
  "soilCarbon",
  "carbonBudget",
  "topSoilWater",
  "midSoilWater",
  "deepSoilWater",
  "topSoilHead",
  "midSoilHead",
  "deepSoilHead",
  "topSoilK",
  "midSoilK",
  "deepSoilK",
  "groundwater",
  "groundwaterHead",
  "waterPotential",
  "rootStress",
  "waterBudget",
  "surfaceWater",
  "snowIce",
  "rainfall",
  "cloudCover",
  "meanTemp",
  "sunlight",
  "leafArea",
  "apar",
  "vegetation",
  "seedBank",
  "elevation",
  "height"
]);
const ecosystemDiagnosticViewModes = new Set([
  "carbonBudget",
  "waterBudget"
]);
let viewMode = viewModes.has(window.localStorage.getItem(VIEW_SETTINGS_KEY))
  ? window.localStorage.getItem(VIEW_SETTINGS_KEY)
  : "landUse";
let colorbarVisible = false;
const viewColorScaleCache = new Map();

let controlsCollapsed = compactLayoutQuery.matches;
let netCollapsed = compactLayoutQuery.matches;
let panelChoiceChanged = false;
let hoveredCellId = null;
let focusCellId = null;
let locatorLocked = false;
let pointerDown = null;
const activeArrowKeys = new Set();
let pendingArrowKeys = null;
let arrowMoveTimer = null;
let hasCameraFocusTarget = false;
let focusHoldUntil = 0;
let webglContextLost = false;
let netNeedsFullUpdate = true;
let previousNetHoverId = null;
let previousNetFocusId = null;
const scheduledWaterCells = new Set();
let scaledVolcanicAshFallRate = new Float32Array(0);
let renderDirty = true;
let renderActiveUntil = 0;
let lastRenderAt = 0;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false
});
const backgroundColor = new THREE.Color(0x20262c);
renderer.setClearColor(backgroundColor, 1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
canvas.addEventListener("webglcontextlost", onWebglContextLost, false);
canvas.addEventListener("webglcontextrestored", onWebglContextRestored, false);

const scene = new THREE.Scene();
scene.background = backgroundColor;
scene.fog = new THREE.Fog(0x111722, 8.5, 18);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
const initialCameraDistance = compactLayoutQuery.matches ? 7.6 : 6.35;
camera.up.set(0, 0, 1);
camera.position.set(initialCameraDistance, 0, 0);
camera.lookAt(0, 0, 0);
const cameraFocusTarget = new THREE.Vector3();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 1.32;
controls.maxDistance = 9.4;
controls.rotateSpeed = 0.62;
controls.zoomSpeed = 0.55;
controls.autoRotate = false;
controls.autoRotateSpeed = 0.16;
controls.addEventListener("start", () => {
  renderActiveUntil = Number.POSITIVE_INFINITY;
  renderDirty = true;
});
controls.addEventListener("change", () => invalidateRender(240));
controls.addEventListener("end", () => {
  renderActiveUntil = performance.now() + 520;
  renderDirty = true;
});

const ambient = new THREE.HemisphereLight(0xe7edf5, 0x181d21, 1.22);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xfff2d0, 2.25);
keyLight.position.set(3.2, 2.4, 4.5);
scene.add(keyLight);

const viewFillLight = new THREE.DirectionalLight(0xf2f7ff, 0.82);
viewFillLight.target.position.set(0, 0, 0);
scene.add(viewFillLight, viewFillLight.target);

const rimLight = new THREE.DirectionalLight(0xf0b45a, 0.8);
rimLight.position.set(-3.4, 1.2, 2.8);
scene.add(rimLight);

const starField = createStarField();
scene.add(starField);

const sunGeometry = new THREE.SphereGeometry(0.09, 24, 14);
const sunGlowGeometry = new THREE.SphereGeometry(0.24, 24, 14);
const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffd79a });
const sunGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0xffa35b,
  transparent: true,
  opacity: 0.24,
  depthWrite: false,
  blending: THREE.AdditiveBlending
});
const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
const sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
scene.add(sunGlow, sunMesh);

const asteroidSilhouette = new THREE.Mesh(
  new THREE.SphereGeometry(1.018, 72, 36),
  new THREE.MeshBasicMaterial({
    color: 0x819083,
    transparent: true,
    opacity: 0.24,
    depthWrite: false
  })
);
scene.add(asteroidSilhouette);

const globe = new THREE.Mesh(
  new THREE.SphereGeometry(0.982, 72, 36),
  new THREE.MeshStandardMaterial({
    color: 0x56615d,
    emissive: 0x222b28,
    emissiveIntensity: 0.65,
    roughness: 0.94,
    metalness: 0,
    transparent: true,
    opacity: 0.92
  })
);
scene.add(globe);

const asteroidRim = new THREE.Mesh(
  new THREE.SphereGeometry(1.012, 72, 36),
  new THREE.MeshBasicMaterial({
    color: 0xc6d1c0,
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide,
    depthWrite: false
  })
);
scene.add(asteroidRim);

const tileGroup = new THREE.Group();
const boundaryGroup = new THREE.Group();
const markerGroup = new THREE.Group();
const locatorGroup = new THREE.Group();
const weatherGroup = new THREE.Group();
const terminatorGroup = new THREE.Group();
scene.add(tileGroup, boundaryGroup, markerGroup, locatorGroup, weatherGroup, terminatorGroup);

const unitY = new THREE.Vector3(0, 1, 0);
const unitZ = new THREE.Vector3(0, 0, 1);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pickSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1.06);
const pickPoint = new THREE.Vector3();
let tileMesh = null;
let localDetailLayers = [];
let tileCellVertexRanges = new Uint32Array(0);
let tileCellByFace = new Int32Array(0);
let pickRingBoundaries = new Float32Array(0);
const netCellByGrid = new Map();
let netDrawCells = [];
const netTransform = {
  cssWidth: 0,
  cssHeight: 0,
  pixelRatio: 1,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  minX: -1,
  minY: 0.35,
  logicalWidth: 1,
  logicalHeight: 1
};
let netCanvasSizeDirty = true;
const netBaseCanvas = document.createElement("canvas");
const netBaseContext = netBaseCanvas.getContext("2d");
let netBaseDirty = true;
let netBaseImageData = null;
let netMarkerCellIds = [];
let netDangerCellIds = [];
let queuedLightRefresh = false;
let queuedNetOverlayRefresh = false;
let lastLocalLodOverlayKey = null;
configureRenderTopology();
const baobabGeometry = new THREE.ConeGeometry(1, 1.35, 7);
const baobabTrunkGeometry = new THREE.CylinderGeometry(0.68, 0.9, 1, 8);
const baobabCrownGeometry = new THREE.SphereGeometry(1, 12, 8);
const baobabLeafGeometry = new THREE.SphereGeometry(1, 8, 6);
const baobabRootGeometry = new THREE.CylinderGeometry(0.32, 0.22, 1, 6);
const volcanoSummitCapGeometry = new THREE.CylinderGeometry(1, 1, 1, 28);
const flameOuterGeometry = new THREE.ConeGeometry(1, 1.65, 9);
const flameInnerGeometry = new THREE.ConeGeometry(1, 1.25, 9);
const roseStemGeometry = new THREE.CylinderGeometry(1, 0.65, 1, 8);
const roseBloomGeometry = new THREE.SphereGeometry(1, 18, 12);
const rosePetalGeometry = new THREE.SphereGeometry(1, 12, 8);
const roseLeafGeometry = new THREE.SphereGeometry(1, 8, 6);
const cloudPatchGeometry = new THREE.CircleGeometry(1, 18);
const cycloneCloudArmGeometry = new THREE.BufferGeometry().setFromPoints(
  Array.from({ length: 28 }, (_, index) => {
    const t = index / 27;
    const radius = 0.08 + t * 0.86;
    const angle = 0.45 + t * Math.PI * 1.58;
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  })
);
const locatorGeometry = new THREE.RingGeometry(0.38, 0.48, 36);
const planeFuselageGeometry = new THREE.CylinderGeometry(1, 0.82, 1, 10);
const planeWingGeometry = new THREE.BoxGeometry(1, 1, 1);
const wellWallGeometry = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
const wellRimGeometry = new THREE.TorusGeometry(1, 0.18, 8, 24);
const princeHouseBodyGeometry = new THREE.BoxGeometry(1, 1, 1);
const princeHouseRoofGeometry = new THREE.ConeGeometry(1, 1, 4);
const princeHouseChimneyGeometry = new THREE.CylinderGeometry(1, 1, 1, 6);
const sheepBodyGeometry = new THREE.SphereGeometry(1, 14, 9);
const sheepHeadGeometry = new THREE.SphereGeometry(1, 10, 7);
const sheepLegGeometry = new THREE.CylinderGeometry(1, 0.85, 1, 6);
const roseStemMaterial = new THREE.MeshStandardMaterial({ color: 0x3f7a42, roughness: 0.66, metalness: 0.02 });
const roseBloomMaterial = new THREE.MeshStandardMaterial({
  color: 0xd91e5b,
  emissive: 0x260712,
  emissiveIntensity: 0.08,
  roughness: 0.44,
  metalness: 0.02
});
const rosePetalMaterial = new THREE.MeshStandardMaterial({
  color: 0xf23b75,
  emissive: 0x310817,
  emissiveIntensity: 0.08,
  roughness: 0.38,
  metalness: 0.02
});
const roseCoreMaterial = new THREE.MeshStandardMaterial({
  color: 0x8b1438,
  emissive: 0x1d030b,
  emissiveIntensity: 0.12,
  roughness: 0.48,
  metalness: 0.02
});
const roseLeafMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6f3e, roughness: 0.68, metalness: 0.01 });
const baobabMaterial = new THREE.MeshStandardMaterial({ color: 0x5f7d37, roughness: 0.72, metalness: 0.02 });
const baobabTrunkMaterial = new THREE.MeshStandardMaterial({ color: 0x7b6643, roughness: 0.82, metalness: 0.01 });
const baobabLeafMaterial = new THREE.MeshStandardMaterial({ color: 0x5f8b45, roughness: 0.7, metalness: 0.01 });
const baobabRootMaterial = new THREE.MeshStandardMaterial({ color: 0x6a563b, roughness: 0.86, metalness: 0.01 });
const flameOuterMaterial = new THREE.MeshBasicMaterial({
  color: 0xff6a1f,
  transparent: true,
  opacity: 0.88,
  depthWrite: false
});
const flameInnerMaterial = new THREE.MeshBasicMaterial({
  color: 0xffd45a,
  transparent: true,
  opacity: 0.92,
  depthWrite: false
});
const planeBodyMaterial = new THREE.MeshStandardMaterial({
  color: 0xb6b4a8,
  roughness: 0.54,
  metalness: 0.28
});
const planeDarkMaterial = new THREE.MeshStandardMaterial({
  color: 0x4a4b47,
  roughness: 0.72,
  metalness: 0.16
});
const wellStoneMaterial = new THREE.MeshStandardMaterial({
  color: 0x8b806d,
  roughness: 0.88,
  metalness: 0.02
});
const wellDarkMaterial = new THREE.MeshBasicMaterial({
  color: 0x151816
});
const princeHouseWallMaterial = new THREE.MeshStandardMaterial({
  color: 0xd9c59b,
  roughness: 0.78,
  metalness: 0.01
});
const princeHouseRoofMaterial = new THREE.MeshStandardMaterial({
  color: 0x8f4f3a,
  roughness: 0.74,
  metalness: 0.02
});
const princeHouseDoorMaterial = new THREE.MeshStandardMaterial({
  color: 0x5b3d2a,
  roughness: 0.82,
  metalness: 0.01
});
const princeHouseWindowMaterial = new THREE.MeshStandardMaterial({
  color: 0xffd47a,
  emissive: 0xffa33a,
  emissiveIntensity: 0.24,
  roughness: 0.34,
  metalness: 0.02
});
const princeHouseTrimMaterial = new THREE.MeshStandardMaterial({
  color: 0xf0dfb9,
  roughness: 0.7,
  metalness: 0.01
});
const princeHouseChimneyMaterial = new THREE.MeshStandardMaterial({
  color: 0x6e685f,
  roughness: 0.84,
  metalness: 0.03
});
const sheepWoolMaterial = new THREE.MeshStandardMaterial({
  color: 0xf1eadf,
  roughness: 0.88,
  metalness: 0.01
});
const sheepFaceMaterial = new THREE.MeshStandardMaterial({
  color: 0x3c342b,
  roughness: 0.82,
  metalness: 0.01
});
const cloudPatchMaterial = new THREE.MeshBasicMaterial({
  color: 0xf0f4ee,
  transparent: true,
  opacity: 0.2,
  side: THREE.DoubleSide,
  depthWrite: false
});
const tropicalCloudPatchMaterial = new THREE.MeshBasicMaterial({
  color: 0xf7fbf4,
  transparent: true,
  opacity: 0.36,
  side: THREE.DoubleSide,
  depthWrite: false
});
const tropicalCloudCoreMaterial = new THREE.MeshBasicMaterial({
  color: 0xd5ddda,
  transparent: true,
  opacity: 0.26,
  side: THREE.DoubleSide,
  depthWrite: false
});
const cycloneCloudArmMaterial = new THREE.LineBasicMaterial({
  color: 0xf7fbf4,
  transparent: true,
  opacity: 0.58,
  depthWrite: false
});
const cycloneCloudEyeMaterial = new THREE.MeshBasicMaterial({
  color: 0x9eb0b8,
  transparent: true,
  opacity: 0.32,
  side: THREE.DoubleSide,
  depthWrite: false
});
const terminatorMaterial = new THREE.LineBasicMaterial({
  color: 0xf6d890,
  transparent: true,
  opacity: 0.22,
  depthWrite: false
});
const locatorMaterial = new THREE.MeshBasicMaterial({
  color: 0xffef9a,
  transparent: true,
  opacity: 0.86,
  side: THREE.DoubleSide
});

const colors = {
  sand: new THREE.Color("#756b55"),
  rock: new THREE.Color("#62615c"),
  crack: new THREE.Color("#554b40"),
  path: new THREE.Color("#6f8a55"),
  volcano: new THREE.Color("#453f3c"),
  moss: new THREE.Color("#627558"),
  meadow: new THREE.Color("#5e8462"),
  water: new THREE.Color("#4f8290"),
  rose: new THREE.Color("#71645a"),
  hover: new THREE.Color("#d98258"),
  focus: new THREE.Color("#ffef9a"),
  baobab: new THREE.Color("#536f35"),
  ash: new THREE.Color("#7d7a74"),
  snowIceSurface: new THREE.Color("#edf5f5"),
  poorSoil: new THREE.Color("#4f4940"),
  moisture: new THREE.Color("#5fa7b8"),
  flower: new THREE.Color("#9aae70")
};
const scratchTileColor = new THREE.Color();
const scratchNetColor = new THREE.Color();
const scratchRenderAggregateColor = new THREE.Color();
const activeVolcanoGlowColor = new THREE.Color(0xff5638);
const activeVolcanoDarkRockColor = new THREE.Color(0x221918);
const dormantVolcanoDarkRockColor = new THREE.Color(0x2f3434);
const landColors = {
  roseLoam: new THREE.Color("#a6657b"),
  roseBorder: new THREE.Color("#8d8f63"),
  waterReserve: new THREE.Color("#3b99ae"),
  waterShore: new THREE.Color("#5c9e8d"),
  sunsetPath: new THREE.Color("#62a04e"),
  sunsetMeadow: new THREE.Color("#74aa4f"),
  activeVolcanoLand: new THREE.Color("#7b3029"),
  dormantVolcanoLand: new THREE.Color("#4e5655"),
  volcanicSkirt: new THREE.Color("#6c706a"),
  freshAshSoil: new THREE.Color("#aaa69d"),
  ashSoil: new THREE.Color("#85837d"),
  baobabWatch: new THREE.Color("#826542"),
  baobabSproutGround: new THREE.Color("#6b7f3d"),
  baobabRooted: new THREE.Color("#4f7a34"),
  baobabDanger: new THREE.Color("#314f2a"),
  wetLoam: new THREE.Color("#69906a"),
  moistBasin: new THREE.Color("#5e8d77"),
  mossLoam: new THREE.Color("#5f935d"),
  dryLoam: new THREE.Color("#89785a"),
  sandySoil: new THREE.Color("#a48654"),
  crustSoil: new THREE.Color("#6d5943"),
  rockySoil: new THREE.Color("#667078"),
  lichenRock: new THREE.Color("#778071"),
  earthRoseGarden: new THREE.Color("#c0718d"),
  earthOcean: new THREE.Color("#245d8f"),
  earthCoast: new THREE.Color("#3a9db1"),
  earthWetland: new THREE.Color("#4d9378"),
  earthForest: new THREE.Color("#2f743f"),
  earthGrassland: new THREE.Color("#73a95a"),
  earthDesert: new THREE.Color("#c2a464"),
  earthMountain: new THREE.Color("#747a76"),
  earthHighland: new THREE.Color("#8f8d69"),
  earthBaobabGrove: new THREE.Color("#536f35")
};
const substrateColors = {
  loam: new THREE.Color("#846745"),
  rock: new THREE.Color("#5e6058"),
  ash: new THREE.Color("#ac9e84"),
  sand: new THREE.Color("#b28b53"),
  crust: new THREE.Color("#67503e")
};
const viewScaleColors = {
  waterLow: new THREE.Color("#2d2f2d"),
  waterHigh: new THREE.Color("#54aeca"),
  groundwaterLow: new THREE.Color("#263036"),
  groundwaterHigh: new THREE.Color("#4276c2"),
  groundwaterHeadLow: new THREE.Color("#22333b"),
  groundwaterHeadHigh: new THREE.Color("#86c7d8"),
  conductivityLow: new THREE.Color("#302a25"),
  conductivityHigh: new THREE.Color("#d8c65a"),
  nutrientLow: new THREE.Color("#4a3329"),
  nutrientHigh: new THREE.Color("#8bb35b"),
  soilCarbonLow: new THREE.Color("#3a302a"),
  soilCarbonHigh: new THREE.Color("#7f8f55"),
  potentialDry: new THREE.Color("#5b3430"),
  potentialWet: new THREE.Color("#58a9b8"),
  rootStressLow: new THREE.Color("#66352f"),
  rootStressHigh: new THREE.Color("#6fbf70"),
  budgetOk: new THREE.Color("#253031"),
  budgetBad: new THREE.Color("#d4503c"),
  surfaceLow: new THREE.Color("#171b1d"),
  surfaceHigh: new THREE.Color("#69b0dc"),
  snowIceLow: new THREE.Color("#242a2d"),
  snowIceHigh: new THREE.Color("#eef8ff"),
  rainLow: new THREE.Color("#181b1e"),
  rainHigh: new THREE.Color("#7bb4e1"),
  cloudLow: new THREE.Color("#1b2024"),
  cloudHigh: new THREE.Color("#eef3f2"),
  tempLow: new THREE.Color("#315eaa"),
  tempMid: new THREE.Color("#f1e8bc"),
  tempHigh: new THREE.Color("#c95336"),
  sunlightLow: new THREE.Color("#151923"),
  sunlightHigh: new THREE.Color("#f1d35b"),
  leafAreaLow: new THREE.Color("#2a2d24"),
  leafAreaHigh: new THREE.Color("#69b45c"),
  aparLow: new THREE.Color("#171b21"),
  aparHigh: new THREE.Color("#f2c95c"),
  elevationDeep: new THREE.Color("#0c2b55"),
  elevationSea: new THREE.Color("#246494"),
  elevationLow: new THREE.Color("#b59b5d"),
  elevationMid: new THREE.Color("#687653"),
  elevationHigh: new THREE.Color("#7b7469"),
  elevationPeak: new THREE.Color("#d7d2bf"),
  asteroidElevationLow: new THREE.Color("#5d5139"),
  asteroidElevationMid: new THREE.Color("#9a7a3f"),
  asteroidElevationHigh: new THREE.Color("#d0b36d"),
  heightBase: new THREE.Color("#332c25"),
  baobabHigh: new THREE.Color("#3f9f5e"),
  roseHigh: new THREE.Color("#cf5382"),
  seedBase: new THREE.Color("#2b2a24"),
  baobabSeed: new THREE.Color("#7bb056"),
  roseSeed: new THREE.Color("#e06f9b")
};
const koppenColors = {
  Asteroid: new THREE.Color("#7c7358"),
  Ocean: new THREE.Color("#275f91"),
  Af: new THREE.Color("#1f6f3b"),
  Am: new THREE.Color("#3f9447"),
  Aw: new THREE.Color("#8fb650"),
  BWh: new THREE.Color("#d4a54c"),
  BWk: new THREE.Color("#c7b071"),
  BSh: new THREE.Color("#c7bd55"),
  BSk: new THREE.Color("#9ca15c"),
  Csa: new THREE.Color("#bd8a3a"),
  Csb: new THREE.Color("#8fa45f"),
  Cfa: new THREE.Color("#5fa870"),
  Cfb: new THREE.Color("#64a89a"),
  Dfa: new THREE.Color("#7294bd"),
  Dfb: new THREE.Color("#697fb0"),
  Dfc: new THREE.Color("#5b6898"),
  ET: new THREE.Color("#b7b7ad"),
  EF: new THREE.Color("#e1e5e0")
};
const sunPhases = Object.freeze([
  Object.freeze({
    sky: new THREE.Color(0x101722),
    sun: new THREE.Color(0xffc36d),
    intensity: 1.25,
    stars: 1
  }),
  Object.freeze({
    sky: new THREE.Color(0x172331),
    sun: new THREE.Color(0xffe0a6),
    intensity: 1.75,
    stars: 0.92
  }),
  Object.freeze({
    sky: new THREE.Color(0x21313a),
    sun: new THREE.Color(0xfff1cf),
    intensity: 2.2,
    stars: 0.72
  }),
  Object.freeze({
    sky: new THREE.Color(0x1b2630),
    sun: new THREE.Color(0xffcf8e),
    intensity: 1.65,
    stars: 0.94
  }),
  Object.freeze({
    sky: new THREE.Color(0x111821),
    sun: new THREE.Color(0xff8b54),
    intensity: 1.05,
    stars: 1
  }),
  Object.freeze({
    sky: new THREE.Color(0x080d16),
    sun: new THREE.Color(0xff6f45),
    intensity: 0.32,
    stars: 1
  })
]);
const daylightSkyColor = new THREE.Color();
const daylightSunColor = new THREE.Color();
const sunPosition = new THREE.Vector3();
const sunDirection = new THREE.Vector3();
const sunRoseNormal = new THREE.Vector3();
const sunEastAxis = new THREE.Vector3();
const sunlightSampleDirection = new THREE.Vector3();
const sunlightSampleRoseNormal = new THREE.Vector3();
const sunlightSampleEastAxis = new THREE.Vector3();
const sunScreenPosition = new THREE.Vector3();
const sunNearScreenPosition = new THREE.Vector3();
const sunsetViewTarget = new THREE.Vector3();
const sunsetViewPosition = new THREE.Vector3();
const sunsetViewDirection = new THREE.Vector3();
const surfaceEdgeA = new THREE.Vector3();
const surfaceEdgeB = new THREE.Vector3();
const surfaceFastScratch = new Float64Array(15);
const lodProjectionPoint = new THREE.Vector3();
const lodCameraDirection = new THREE.Vector3();
const nestedSpreadBitsCache = new Map();
const earthCloudGeometryCache = new WeakMap();

function activeAsteroidInitProfileSink() {
  const sink = globalThis.__HEALPIX_ASTEROID_PROFILE__;
  return sink?.enabled && typeof performance !== "undefined" ? sink : null;
}

function addAsteroidInitProfileTime(name, elapsedMs) {
  const sink = activeAsteroidInitProfileSink();
  if (!sink) {
    return;
  }
  sink.sections ??= {};
  sink.sections[name] = (sink.sections[name] ?? 0) + elapsedMs;
}

let appInitSectionStart = typeof performance !== "undefined" ? performance.now() : 0;
await preloadReferenceDataForPreset(currentPlanetPreset);
if (appInitSectionStart) {
  const now = performance.now();
  addAsteroidInitProfileTime("initPreloadReferenceData", now - appInitSectionStart);
  appInitSectionStart = now;
}
await Promise.all([preloadAsteroidVegetationOperators(topology), preloadAsteroidSimulationCore()]);
if (appInitSectionStart) {
  const now = performance.now();
  addAsteroidInitProfileTime("initPreloadOperatorsAndWasm", now - appInitSectionStart);
  appInitSectionStart = now;
}
let state = createAsteroidState();
if (appInitSectionStart) {
  const now = performance.now();
  addAsteroidInitProfileTime("initCreateAsteroidState", now - appInitSectionStart);
  appInitSectionStart = now;
}
let actionInProgress = false;
let lastActionDiagnostic = null;

if (import.meta.env.DEV) {
  window.__healpixAsteroidDebug = {
    state: () => state,
    vegetationModel: () => vegetationModelState(),
    topology: () => topology,
    renderTopology: () => renderTopology,
    localDetail: () => ({
      visible: localDetailLayers.length > 0,
      cells: localDetailLayers.reduce((sum, layer) => sum + layer.cellIds.length, 0),
      layers: localDetailLayers.map((layer) => ({
        nside: layer.topology.nside,
        cells: layer.cellIds.length
      })),
      renderNside: renderTopology.nside,
      simulationNside: topology.nside
    }),
    markers: () => ({
      visible: markerGroup.visible,
      children: markerGroup.children.length
    }),
    princeHouse: () => ({
      cellId: princeHouseCellId(),
      parts: markerGroup.children.filter((child) => child.userData.princeHouse).length
    }),
    camera: () => ({
      distance: camera.position.distanceTo(controls.target),
      autoRotate: controls.autoRotate,
      minDistance: controls.minDistance
    }),
    advanceTurns: (turns = 1) => advanceTurns(turns)
  };
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("blur", clearArrowKeys);
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointerleave", clearHover);
planetSelect.addEventListener("change", changePlanetPreset);
nsideSelect.addEventListener("change", changeNside);
viewSelect.addEventListener("change", changeViewMode);
colorbarToggle.addEventListener("click", toggleColorbar);
waterButton.addEventListener("click", waterHere);
releaseWaterButton.addEventListener("click", releaseWaterHere);
pullButton.addEventListener("click", pullHere);
burnButton.addEventListener("click", burnHere);
cleanButton.addEventListener("click", cleanHere);
sheepButton.addEventListener("click", releaseSheepHere);
observeButton.addEventListener("click", observeHere);
sunsetButton.addEventListener("click", watchSunset);
restButton.addEventListener("click", restToday);
endDayButton.addEventListener("click", endDay);
resetButton.addEventListener("click", resetGame);
resetSettingsButton.addEventListener("click", resetSimulationSettings);
homeButton.addEventListener("click", goHome);
controlsToggle.addEventListener("click", toggleControlsPanel);
netToggle.addEventListener("click", toggleNetPanel);
for (const control of simulationParamControls) {
  control.input.addEventListener("input", handleSimulationParamInput);
  if (control.input.tagName === "SELECT") {
    control.input.addEventListener("change", handleSimulationParamInput);
  }
}
if (compactLayoutQuery.addEventListener) {
  compactLayoutQuery.addEventListener("change", handleCompactLayoutChange);
} else {
  compactLayoutQuery.addListener(handleCompactLayoutChange);
}

applyLanguage();
syncCurrentViewDetailIfNeeded();
focusCellId = state.selectedCell;
locatorLocked = false;
buildBoard();
focusCameraOnCentralObject();
resize();
refresh(messageWithRoseHelp(startMessage()));
window.requestAnimationFrame(renderLoop);
window.requestAnimationFrame(() => {
  resize();
  refresh();
});

function labels() {
  return TRANSLATIONS[currentLanguage];
}

async function preloadReferenceDataForPreset(preset, nside = currentNside) {
  if (preset === "earth") {
    await Promise.all([
      preloadEarthElevation(),
      preloadEarthClimate(),
      preloadEarthLandFractions(nside),
      preloadEra5CloudClimatology()
    ]);
  }
}

function startMessage() {
  const text = labels();
  return currentPlanetPreset === "earth" ? text.startEarth : text.start;
}

function defaultSimulationSettingsForPreset(preset = currentPlanetPreset) {
  return preset === "earth" ? EARTH_SIMULATION_SETTINGS : ASTEROID_SIMULATION_SETTINGS;
}

function simulationSettingsKey(preset = currentPlanetPreset) {
  return `${SIMULATION_SETTINGS_KEY_PREFIX}:${preset}`;
}

function loadSimulationSettings(preset = currentPlanetPreset) {
  const defaults = defaultSimulationSettingsForPreset(preset);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(simulationSettingsKey(preset)) ?? "{}");
    return applyPresetFixedSettings(normalizeSimulationSettings({ ...defaults, ...parsed }, defaults), preset);
  } catch {
    return applyPresetFixedSettings({ ...defaults }, preset);
  }
}

function applyPresetFixedSettings(settings, preset = currentPlanetPreset) {
  if (preset !== "earth") {
    return settings;
  }

  const nextSettings = { ...settings };
  for (const key of EARTH_FIXED_SETTING_KEYS) {
    nextSettings[key] = EARTH_SIMULATION_SETTINGS[key];
  }
  return nextSettings;
}

function normalizeSimulationSettings(settings, defaults = defaultSimulationSettingsForPreset()) {
  const actionScaleFromLegacyDuration = Number(settings.actionDurationDays) / ACTION_DT_DAYS;
  const actionTimeScale = Number.isFinite(Number(settings.actionTimeScale))
    ? Number(settings.actionTimeScale)
    : actionScaleFromLegacyDuration;
  return {
    annualPrecipMm: clampValue(Number(settings.annualPrecipMm), 0, 1100, defaults.annualPrecipMm),
    dryDays: clampValue(Number(settings.dryDays), 20, 350, defaults.dryDays),
    rainPatchiness: clampValue(Number(settings.rainPatchiness), 0, 1, defaults.rainPatchiness),
    rainScale: clampValue(Number(settings.rainScale), 5, 40, defaults.rainScale),
    asteroidMeanTempC: clampValue(Number(settings.asteroidMeanTempC), -8, 26, defaults.asteroidMeanTempC),
    asteroidDiurnalRangeC: clampValue(Number(settings.asteroidDiurnalRangeC), 4, 28, defaults.asteroidDiurnalRangeC),
    asteroidLatitudeTempRangeC: clampValue(Number(settings.asteroidLatitudeTempRangeC), 0, 12, defaults.asteroidLatitudeTempRangeC),
    evaporation: clampValue(Number(settings.evaporation), 0.5, 1.8, defaults.evaporation),
    gwFlow: clampValue(Number(settings.gwFlow), 0, 0.08, defaults.gwFlow),
    rootDepth: clampValue(Number(settings.rootDepth), 1, 8, defaults.rootDepth),
    shade: clampValue(Number(settings.shade), 0, 2.3, defaults.shade),
    roseGrowth: clampValue(Number(settings.roseGrowth), 0.6, 1.8, defaults.roseGrowth),
    baobabGrowth: clampValue(Number(settings.baobabGrowth), 0.6, 2.2, defaults.baobabGrowth),
    atmosphericCo2Ppm: clampValue(Number(settings.atmosphericCo2Ppm), 280, 900, defaults.atmosphericCo2Ppm),
    storage: clampValue(Number(settings.storage), 0, 1.8, defaults.storage),
    actionTimeScale: clampValue(actionTimeScale, MIN_ACTION_TIME_SCALE, MAX_ACTION_TIME_SCALE, defaults.actionTimeScale)
  };
}

function clampValue(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return THREE.MathUtils.clamp(value, min, max);
}

function vegetationParamsFromSettings() {
  const { actionTimeScale, actionDurationDays, ...vegetationParams } = simulationSettings;
  return vegetationParams;
}

function gameLengthDays() {
  return FIXED_GAME_LENGTH_DAYS;
}

function maxActionTimeScaleForNside(nside = currentNside) {
  return nside < FIXED_ACTION_TIME_SCALE_NSIDE ? MAX_ACTION_TIME_SCALE : MIN_ACTION_TIME_SCALE;
}

function actionTimeScale() {
  return clampValue(
    Number(simulationSettings.actionTimeScale),
    MIN_ACTION_TIME_SCALE,
    maxActionTimeScaleForNside(),
    1
  );
}

function actionDurationDays(turns = 1) {
  return Math.max(0, turns) * ACTION_DT_DAYS * actionTimeScale();
}

function formatActionTimeScale(value) {
  return `${Math.round(value)}x`;
}

function formatDurationForMessage(days) {
  const hours = days * 24;
  if (hours < 24) {
    return currentLanguage === "ja" ? `${Math.round(hours)}時間` : `${Math.round(hours)} hours`;
  }

  if (days < 365) {
    const value = Number.isInteger(days) ? days.toFixed(0) : days.toFixed(1);
    return currentLanguage === "ja" ? `${value}日` : `${value} days`;
  }

  const years = days / 365;
  const value = Number.isInteger(years) ? years.toFixed(0) : years.toFixed(1);
  return currentLanguage === "ja" ? `${value}年` : `${value} years`;
}

function saveSimulationSettings() {
  window.localStorage.setItem(simulationSettingsKey(), JSON.stringify(simulationSettings));
}

function syncSimulationControls() {
  const text = labels();
  for (const control of simulationParamControls) {
    const isAvailable = !control.planet || control.planet === currentPlanetPreset;
    const isActionScale = control.key === "actionTimeScale";
    const actionScaleMax = isActionScale ? maxActionTimeScaleForNside() : null;
    const value = isActionScale ? actionTimeScale() : simulationSettings[control.key];
    control.input.closest("label").hidden = !isAvailable;
    control.input.disabled = !isAvailable || (isActionScale && actionScaleMax <= MIN_ACTION_TIME_SCALE);
    if (isActionScale) {
      control.input.max = String(actionScaleMax);
    }
    control.label.textContent = text.simulationParams[control.key];
    control.input.value = String(value);
    control.output.textContent = control.format(value);
  }
}

function handleSimulationParamInput(event) {
  const control = simulationParamControls.find((item) => item.input === event.currentTarget);
  if (!control) {
    return;
  }

  simulationSettings = applyPresetFixedSettings(
    normalizeSimulationSettings({
      ...simulationSettings,
      [control.key]: Number(control.input.value)
    })
  );
  saveSimulationSettings();
  state.vegetation.setParams(vegetationParamsFromSettings());
  syncSimulationControls();
  updateHud();
}

function resetSimulationSettings() {
  simulationSettings = normalizeSimulationSettings({ ...defaultSimulationSettingsForPreset() });
  saveSimulationSettings();
  state.vegetation.setParams(vegetationParamsFromSettings());
  syncSimulationControls();
  const text = labels();
  addEventLogEntry(text.eventSettingsReset);
  refresh(messageWithRoseHelp(text.eventSettingsReset));
}

function applyLanguage() {
  const text = labels();
  document.documentElement.lang = currentLanguage;
  document.querySelector("h1").textContent = currentPlanetPreset === "earth" ? text.titleEarth : text.title;
  homeButton.textContent = text.home;
  homeButton.setAttribute("aria-label", text.homeLabel);
  dayLabel.textContent = text.day;
  actionLabel.textContent = text.actions;
  healthLabel.textContent = text.selected;
  roseLabel.textContent = currentPlanetPreset === "earth" ? text.roseCell : text.roseStatus;
  waterButton.textContent = text.water;
  releaseWaterButton.textContent = text.releaseWater;
  pullButton.textContent = text.pull;
  burnButton.textContent = text.burn;
  cleanButton.textContent = text.clean;
  sheepButton.textContent = text.sheep;
  observeButton.textContent = text.observe;
  sunsetButton.textContent = text.sunset;
  restButton.textContent = text.rest;
  endDayButton.textContent = text.night;
  resetButton.textContent = text.newGame;
  resetSettingsButton.textContent = text.resetSettings;
  netTitle.textContent = text.map;
  axisTextZ.textContent = text.axisNorth;
  for (const option of planetSelect.options) {
    option.textContent = text.planetPresets[option.value];
  }
  for (const group of viewSelect.querySelectorAll("optgroup[data-view-group]")) {
    group.label = text.viewGroups[group.dataset.viewGroup] ?? group.label;
  }
  for (const option of viewSelect.options) {
    option.textContent = text.viewModes[option.value];
  }
  syncSimulationControls();
  updatePanelVisibility();
  updateColorbarPanel();
}

function changeViewMode() {
  if (!viewModes.has(viewSelect.value)) {
    return;
  }

  const previousRenderNside = renderTopology.nside;
  viewMode = viewSelect.value;
  window.localStorage.setItem(VIEW_SETTINGS_KEY, viewMode);
  configureRenderTopology();
  if (viewMode !== "landUse") {
    syncCurrentViewDetailIfNeeded();
  }
  viewColorScaleCache.clear();
  if (renderTopology.nside !== previousRenderNside) {
    buildBoard();
  } else {
    netNeedsFullUpdate = true;
  }
  refresh();
}

function updatePanelVisibility() {
  const text = labels();
  hud.classList.toggle("controls-collapsed", controlsCollapsed);
  controlStack.hidden = false;
  simulationControls.hidden = controlsCollapsed;
  controlsToggle.setAttribute("aria-expanded", String(!controlsCollapsed));
  controlsToggle.textContent = controlsCollapsed ? text.showSettings : text.hideSettings;
  controlsToggle.setAttribute("aria-label", controlsCollapsed ? text.showSettingsLabel : text.hideSettingsLabel);

  netPanel.classList.toggle("collapsed", netCollapsed);
  netBoard.setAttribute("aria-hidden", String(netCollapsed));
  netToggle.setAttribute("aria-expanded", String(!netCollapsed));
  netToggle.textContent = netCollapsed ? text.showMap : text.hideMap;
  netToggle.setAttribute("aria-label", netCollapsed ? text.showMapLabel : text.hideMapLabel);
  netCanvasSizeDirty = true;
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
  if (!netCollapsed) {
    drawNetBoard();
  }
}

function toggleColorbar() {
  colorbarVisible = !colorbarVisible;
  updateColorbarPanel();
}

function handleCompactLayoutChange(event) {
  enforceNsideAvailability();

  if (panelChoiceChanged) {
    return;
  }

  controlsCollapsed = event.matches;
  netCollapsed = event.matches;
  updatePanelVisibility();
}

function enforceNsideAvailability() {
  const nextNside = normalizeNsideForPreset(currentNside, currentPlanetPreset);
  syncNsideOptions();
  if (nextNside === currentNside) {
    return;
  }

  nsideSelect.value = String(nextNside);
  void changeNside();
}

function selectBaobabWatchParentKeys(blockedKeys) {
  return hierarchyObjectTopology.cells
    .filter((cell) => !blockedKeys.has(hierarchyCellKey(cell)) && cell.polarBand !== "north")
    .sort((a, b) => parentNoise(b, 41) - parentNoise(a, 41))
    .slice(0, 5)
    .map(hierarchyCellKey);
}

function parentNoise(cell, salt) {
  const value = Math.sin(
    (cell.face + 1) * 19.371 +
    (cell.ix + 2) * 43.127 +
    (cell.iy + 3) * 71.641 +
    (salt + 1) * 11.913
  ) * 31991.271;
  return value - Math.floor(value);
}

function sunsetPathHalfWidth() {
  return topology.nside <= 2 ? 0 : Math.max(1, Math.round(topology.nside / 8));
}

var cachedSunsetPathVolcanoAvoidance = null;

function sunsetPathVolcanoAvoidanceData() {
  if (cachedSunsetPathVolcanoAvoidance?.nside === topology.nside) {
    return cachedSunsetPathVolcanoAvoidance;
  }

  const parentCells = defaultAsteroidVolcanoParentCells();
  cachedSunsetPathVolcanoAvoidance = {
    nside: topology.nside,
    parentCells,
    parentKeys: new Set(parentCells.map((parentCell) => hierarchyCellKey(parentCell))),
    centerCellIds: new Set(defaultAsteroidVolcanoCellIds())
  };
  return cachedSunsetPathVolcanoAvoidance;
}

function isSunsetPathCell(cell) {
  if (isSunsetPathBlockedByVolcano(cell)) {
    return false;
  }

  return Math.abs(cell.ring - sunsetPathCenterRing(cell)) <= sunsetPathHalfWidth();
}

function isSunsetPathBlockedByVolcano(cell, volcanoInfluence = null) {
  if (!cell) {
    return true;
  }
  const volcanoData = sunsetPathVolcanoAvoidanceData();
  if (volcanoData.centerCellIds.has(cell.id)) {
    return true;
  }

  const parentKey = hierarchyCellKey(hierarchyParentCell(cell));
  if (volcanoData.parentKeys.has(parentKey)) {
    return true;
  }

  const influence = volcanoInfluence ?? asteroidLocalPatchInfluence(cell, volcanoData.parentCells, 301, 1);
  return influence > 0.18;
}

function sunsetPathCenterRing(cell) {
  const baseRing = 2 * topology.nside;
  if (topology.nside <= 2) {
    return baseRing;
  }

  const meander =
    Math.sin(cell.phi * 2.7 + cell.height * 3.4) *
    Math.min(0.75, Math.max(0.28, topology.nside * 0.035));
  let detour = 0;
  for (const volcanoCell of sunsetPathVolcanoAvoidanceData().parentCells) {
    if (!volcanoCell) {
      continue;
    }

    const delta = Math.abs(signedPhiDelta(cell.phi, volcanoCell.phi));
    const width = 0.52 + Math.min(0.22, topology.nside * 0.0035);
    const strength = Math.exp(-0.5 * (delta / width) ** 2);
    const direction =
      volcanoCell.ring < baseRing ? 1 :
        volcanoCell.ring > baseRing ? -1 :
      volcanoCell.id % 2 === 0 ? 1 : -1;
    detour += direction * strength * Math.max(2.2, topology.nside * 0.34);
  }

  const roseCell = topology.cells[defaultAsteroidRoseCellId()];
  const centerBeforeRose = baseRing + meander + detour;
  if (!roseCell) {
    return THREE.MathUtils.clamp(centerBeforeRose, 1, topology.maxRing);
  }

  const roseDelta = Math.abs(signedPhiDelta(cell.phi, roseCell.phi));
  const roseAnchorWidth = 0.42 + Math.min(0.14, topology.nside * 0.002);
  const roseAnchor = Math.exp(-0.5 * (roseDelta / roseAnchorWidth) ** 2);
  const center = centerBeforeRose * (1 - roseAnchor) + roseCell.ring * roseAnchor;
  return THREE.MathUtils.clamp(center, 1, topology.maxRing);
}

function signedPhiDelta(a, b) {
  let delta = a - b;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
}

function selectWaterParentKey(blockedKeys) {
  const candidates = [];

  for (const parentCell of hierarchyObjectTopology.cells) {
    const key = hierarchyCellKey(parentCell);
    if (blockedKeys.has(key)) {
      continue;
    }
    const pathGap = Math.abs(parentCell.ring - (2 * HIERARCHY_OBJECT_NSIDE));
    if (pathGap <= 0) {
      continue;
    }

    candidates.push({
      key,
      pathGap,
      latitudePreference: Math.abs(parentCell.ring - (2 * HIERARCHY_OBJECT_NSIDE + 1)),
      noise: parentNoise(parentCell, 67)
    });
  }

  candidates.sort((a, b) => a.pathGap - b.pathGap || a.latitudePreference - b.latitudePreference || b.noise - a.noise);
  return candidates[0]?.key ?? null;
}

function hierarchyParentDistances(sourceKeys, maxDistance) {
  const distances = new Map();
  const queue = [];

  for (const key of sourceKeys) {
    distances.set(key, 0);
    queue.push(key);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const key = queue[index];
    const distance = distances.get(key);
    if (distance >= maxDistance) {
      continue;
    }

    const cell = hierarchyParentCellByKey(key);
    if (!cell) {
      continue;
    }

    for (const direction of hierarchyObjectTopology.directions) {
      const neighborId = hierarchyObjectTopology.neighbor(cell.id, direction);
      if (neighborId === null) {
        continue;
      }

      const neighborKey = hierarchyCellKey(hierarchyObjectTopology.cells[neighborId]);
      const nextDistance = distance + 1;
      if (!distances.has(neighborKey) || distances.get(neighborKey) > nextDistance) {
        distances.set(neighborKey, nextDistance);
        queue.push(neighborKey);
      }
    }
  }

  return distances;
}

function hierarchyParentCellByKey(key) {
  return hierarchyObjectCellByKey.get(key) ?? null;
}

function parentCellsFromKeys(keys) {
  const cells = [];
  for (const key of keys) {
    const cell = hierarchyParentCellByKey(key);
    if (cell) {
      cells.push(cell);
    }
  }
  return cells;
}

function asteroidPatchInfluence(cell, sourceCells, salt, radiusScale = 1) {
  if (!sourceCells || sourceCells.length === 0) {
    return 0;
  }

  let closest = Infinity;
  for (const parentCell of sourceCells) {
    if (!parentCell) {
      continue;
    }
    const dot = cellNormalDot(cell, parentCell);
    closest = Math.min(closest, Math.acos(dot < -1 ? -1 : dot > 1 ? 1 : dot));
  }

  if (!Number.isFinite(closest)) {
    return 0;
  }

  const baseRadius = 0.44 * radiusScale;
  const falloff = 0.18 * radiusScale;
  const edgeNoise =
    (asteroidCoherentField(cell, salt) - 0.5) * 0.46 +
    (seededNoise(cell.id, salt + 17) - 0.5) * 0.08;
  return clamp01(0.5 + (baseRadius - closest) / falloff + edgeNoise);
}

function asteroidDrainageBasinInfluence(cell, sourceCells, radiusScale = 1) {
  if (!sourceCells || sourceCells.length === 0) {
    return 0;
  }

  let closest = Infinity;
  for (const parentCell of sourceCells) {
    if (!parentCell) {
      continue;
    }
    const dot = cellNormalDot(cell, parentCell);
    closest = Math.min(closest, Math.acos(dot < -1 ? -1 : dot > 1 ? 1 : dot));
  }

  if (!Number.isFinite(closest)) {
    return 0;
  }

  const sigma = 0.78 * radiusScale;
  const basin = Math.exp(-0.5 * (closest / sigma) ** 2);
  return clamp01(0.04 + basin * 0.96);
}

function asteroidLocalPatchInfluence(cell, sourceCells, salt, radiusScale = 1) {
  if (!sourceCells || sourceCells.length === 0) {
    return 0;
  }

  let closest = Infinity;
  for (const sourceCell of sourceCells) {
    if (!sourceCell) {
      continue;
    }
    const dot = cellNormalDot(cell, sourceCell);
    closest = Math.min(closest, Math.acos(dot < -1 ? -1 : dot > 1 ? 1 : dot));
  }

  if (!Number.isFinite(closest)) {
    return 0;
  }

  const baseRadius = 0.26 * radiusScale;
  const falloff = 0.13 * radiusScale;
  const fineNoise =
    (asteroidFineField(cell, salt) - 0.5) * 0.42 +
    (seededNoise(cell.id, salt + 17) - 0.5) * 0.08;
  return clamp01(0.5 + (baseRadius - closest) / falloff + fineNoise);
}

function asteroidFineField(cell, salt) {
  const waveA = Math.sin(cell.phi * (2.1 + (salt % 4) * 0.34) + cell.height * (4.3 + (salt % 5) * 0.47));
  const waveB = Math.cos(cell.phi * (4.2 + (salt % 3) * 0.55) - cell.height * (6.4 + (salt % 7) * 0.28));
  return clamp01(0.5 + waveA * 0.24 + waveB * 0.18);
}

function asteroidCoherentField(cell, salt) {
  const phase = (salt % 997) * 0.017;
  const waveA = Math.sin(cell.phi * (1.35 + (salt % 5) * 0.17) + cell.height * (2.9 + (salt % 7) * 0.23) + phase);
  const waveB = Math.cos(cell.phi * (2.55 + (salt % 4) * 0.19) - cell.height * (4.8 + (salt % 6) * 0.21) - phase * 1.7);
  const waveC = Math.sin(
    Math.cos(cell.phi + phase) * (2.2 + (salt % 3) * 0.3) +
      cell.height * (3.6 + (salt % 11) * 0.11)
  );
  const local = (seededNoise(cell.id, salt + 41) - 0.5) * 0.035;
  return clamp01(0.5 + waveA * 0.2 + waveB * 0.14 + waveC * 0.1 + local);
}

function asteroidElevationMetersForCell(cell, volcanoInfluence, activeVolcanoInfluence, waterInfluence, waterDrainageInfluence) {
  const broad = (asteroidCoherentField(cell, 887) - 0.5) * 2;
  const fine = (asteroidFineField(cell, 891) - 0.5) * 2;
  const ridge =
    Math.sin(cell.phi * 5.7 + cell.height * 8.1) *
    Math.cos(cell.phi * 2.6 - cell.height * 5.4);
  const ridgeB =
    Math.sin(cell.phi * 3.2 - cell.height * 6.7 + 0.8) *
    Math.sin(cell.phi * 1.7 + cell.height * 4.4 - 0.25);
  const hummock =
    Math.sin(cell.phi * 9.1 + Math.sin(cell.height * 5.2) * 2.3) *
    Math.cos(cell.height * 11.6 - cell.phi * 1.8);
  const broadRelief = Math.sign(broad) * Math.pow(Math.abs(broad), 1.18) * 540;
  const fineRelief = Math.sign(fine) * Math.pow(Math.abs(fine), 1.05) * 220;
  const ridgeRelief = ridge * 170 + ridgeB * 125 + hummock * 72;
  const microRelief = (seededNoise(cell.id, 941) - 0.5) * 52;
  const polarRise = Math.abs(cell.height) * 92;
  const volcanoFoothill = Math.pow(volcanoInfluence, 0.98) * 1180;
  const volcanoPeak = Math.pow(volcanoInfluence, 2.05) * 4200 + Math.pow(activeVolcanoInfluence, 2.35) * 1200;
  const basinSink = Math.pow(waterDrainageInfluence, 1.05) * 1280 + Math.pow(waterInfluence, 1.55) * 720;
  return broadRelief + fineRelief + ridgeRelief + microRelief + polarRise + volcanoFoothill + volcanoPeak - basinSink;
}

function selectEarthCellsByScoreArray(scoreArray, desiredCount, blockedIds, options) {
  const minimumScore = options.minimumScore ?? 0;
  const minDot = Math.cos(options.minimumAngle ?? 0.2);
  const selected = [];
  const candidates = [...topology.cells]
    .map((cell) => ({
      cell,
      score: (scoreArray[cell.id] ?? 0) + seededNoise(cell.id, options.salt ?? 997) * 0.035
    }))
    .filter((candidate) => candidate.score >= minimumScore && !blockedIds.has(candidate.cell.id))
    .sort((a, b) => b.score - a.score);

  for (const candidate of candidates) {
    if (selected.length >= desiredCount) {
      break;
    }
    if (selected.some((cellId) => cellNormalDot(topology.cells[cellId], candidate.cell) > minDot)) {
      continue;
    }
    selected.push(candidate.cell.id);
  }

  if (selected.length >= desiredCount) {
    return selected;
  }

  for (const candidate of candidates) {
    if (selected.length >= desiredCount) {
      break;
    }
    if (!selected.includes(candidate.cell.id)) {
      selected.push(candidate.cell.id);
    }
  }

  return selected;
}

function defaultAsteroidRoseCellId() {
  return topology.cellAt(2 * topology.nside, topology.nside) ?? 0;
}

function defaultAsteroidVolcanoCellIds(roseCell = null) {
  return defaultAsteroidVolcanoParentCells()
    .map((parentCell) => cellIdAtHierarchyParentCenter(parentCell))
    .filter((cellId, index, cells) => cellId !== null && cellId !== roseCell && cells.indexOf(cellId) === index);
}

function defaultAsteroidVolcanoParentCells() {
  const nside = HIERARCHY_OBJECT_NSIDE;
  return [
    hierarchyObjectTopology.cellAt(nside, nside),
    hierarchyObjectTopology.cellAt(3 * nside, 2 * nside),
    hierarchyObjectTopology.cellAt(2 * nside, 3 * nside)
  ]
    .map((cellId) => cellId === null ? null : hierarchyObjectTopology.cells[cellId])
    .filter(Boolean);
}

function cellIdAtHierarchyParentCenter(parentCell) {
  if (!parentCell) {
    return null;
  }

  if (topology.nside <= HIERARCHY_OBJECT_NSIDE) {
    return topology.cells[parentCell.id]?.id ?? null;
  }

  const scale = topology.nside / HIERARCHY_OBJECT_NSIDE;
  const ix = Math.min(topology.nside - 1, Math.floor((parentCell.ix + 0.5) * scale));
  const iy = Math.min(topology.nside - 1, Math.floor((parentCell.iy + 0.5) * scale));
  const cellId = nestedCellIdForGrid(parentCell.face, ix, iy, topology.nside);
  return topology.cells[cellId]?.id ?? null;
}

function nestedCellIdForGrid(face, ix, iy, nside) {
  return face * nside * nside + spreadNestedBits(iy, nside) + 2 * spreadNestedBits(ix, nside);
}

function spreadNestedBits(value, nside) {
  let spread = 0;
  let bit = 0;

  while (1 << bit < nside) {
    spread |= ((value >> bit) & 1) << (2 * bit);
    bit += 1;
  }

  return spread;
}

function selectEarthLandmarkCellFromProfile(targetLon, targetLat, blockedIds, profile) {
  let best = null;
  const terrainCodeArray = profile.terrainCode;
  const elevationArray = profile.elevation;
  const baobabRiskArray = profile.baobabRisk;
  const cellHeightArray = profile.cellHeight;
  const cellPhiArray = profile.cellPhi;
  for (let id = 0; id < terrainCodeArray.length; id += 1) {
    if (blockedIds.has(id) || terrainCodeArray[id] === TERRAIN_CODE.water) {
      continue;
    }
    const lon = ((cellPhiArray[id] * 180) / Math.PI + 540) % 360 - 180;
    const lat = (Math.asin(THREE.MathUtils.clamp(cellHeightArray[id], -1, 1)) * 180) / Math.PI;
    const lonDelta = signedLongitudeDelta(lon, targetLon);
    const latDelta = lat - targetLat;
    const distance = Math.sqrt((lonDelta * Math.cos((targetLat * Math.PI) / 180)) ** 2 + latDelta * latDelta);
    const desertPreference =
      terrainCodeArray[id] === TERRAIN_CODE.sand ? 2.2 :
        terrainCodeArray[id] === TERRAIN_CODE.moss ? 0.35 :
          0;
    const roughPenalty = Math.max(0, elevationArray[id] - 900) / 1200;
    const score = distance - desertPreference - (baobabRiskArray[id] ?? 0) * 2.8 + roughPenalty;
    if (!best || score < best.score) {
      best = { cellId: id, score };
    }
  }
  return best?.cellId ?? topology.cellAt(Math.round(1.45 * topology.nside), Math.round(2.1 * topology.nside)) ?? 0;
}

function packCellHeights(cells) {
  const values = new Float32Array(Math.max(1, cells.length));
  cells.forEach((cell, index) => {
    values[index] = cell?.height ?? 0;
  });
  return values;
}

function packCellPhis(cells) {
  const values = new Float32Array(Math.max(1, cells.length));
  cells.forEach((cell, index) => {
    values[index] = cell?.phi ?? 0;
  });
  return values;
}

function packCellRings(cells) {
  const values = new Int32Array(Math.max(1, cells.length));
  cells.forEach((cell, index) => {
    values[index] = cell?.ring ?? 0;
  });
  return values;
}

function signedLongitudeDelta(a, b) {
  let delta = a - b;
  while (delta <= -180) delta += 360;
  while (delta > 180) delta -= 360;
  return delta;
}

function cellNormalDot(a, b) {
  return a.normal[0] * b.normal[0] + a.normal[1] * b.normal[1] + a.normal[2] * b.normal[2];
}

function createAsteroidState(planetPreset = currentPlanetPreset) {
  const profileStart = activeAsteroidInitProfileSink() ? performance.now() : 0;
  let profileSectionStart = profileStart;
  const markProfile = (name) => {
    if (!profileSectionStart) {
      return;
    }
    const now = performance.now();
    addAsteroidInitProfileTime(name, now - profileSectionStart);
    profileSectionStart = now;
  };
  const isEarth = planetPreset === "earth";
  const count = pixelCount(topology.nside);
  const terrain = new Array(count).fill("sand");
  const moisture = new Float32Array(count);
  const soil = new Float32Array(count);
  const baobab = new Float32Array(count);
  const flower = new Float32Array(count);
  const ash = new Float32Array(count);
  const burning = new Float32Array(count);
  const burnFuel = new Float32Array(count);
  const burnInitialFuel = new Float32Array(count);
  const burnBaobabTarget = new Float32Array(count);
  const burnRoseTarget = new Float32Array(count);
  const burnBaobabSeedTarget = new Float32Array(count);
  const burnRoseSeedTarget = new Float32Array(count);
  const care = new Float32Array(count);
  const pendingWater = new Float32Array(count);
  const baobabRisk = new Float32Array(count);
  const baobabBlocked = new Uint8Array(count);
  const surfaceWater = new Float32Array(count);
  const surfaceWaterMm = new Float32Array(count);
  const snowIce = new Float32Array(count);
  const snowIceMm = new Float32Array(count);
  const snowIceM = new Float32Array(count);
  const topSoilWater = new Float32Array(count);
  const midSoilWater = new Float32Array(count);
  const deepSoilWater = new Float32Array(count);
  const groundwater = new Float32Array(count);
  const topSoilHeadM = new Float32Array(count);
  const midSoilHeadM = new Float32Array(count);
  const deepSoilHeadM = new Float32Array(count);
  const topSoilHeadNorm = new Float32Array(count);
  const midSoilHeadNorm = new Float32Array(count);
  const deepSoilHeadNorm = new Float32Array(count);
  const topSoilConductivityMDay = new Float32Array(count);
  const midSoilConductivityMDay = new Float32Array(count);
  const deepSoilConductivityMDay = new Float32Array(count);
  const topSoilConductivityNorm = new Float32Array(count);
  const midSoilConductivityNorm = new Float32Array(count);
  const deepSoilConductivityNorm = new Float32Array(count);
  const groundwaterHeadM = new Float32Array(count);
  const groundwaterHeadNorm = new Float32Array(count);
  const soilNutrient = new Float32Array(count);
  const soilOrganicCarbon = new Float32Array(count);
  const topMatricPotentialM = new Float32Array(count);
  const soilWaterPotential = new Float32Array(count);
  const rootStressBaobab = new Float32Array(count);
  const rootStressRose = new Float32Array(count);
  const rainfall = new Float32Array(count);
  const rainfallMm = new Float32Array(count);
  const rainfallInstantMm = new Float32Array(count);
  const cloudCover = new Float32Array(count);
  const cloudWeather = new Float32Array(count);
  const meanTempC = new Float32Array(count);
  const koppenClass = new Array(count).fill("Ocean");
  const sunlight = new Float32Array(count);
  const laiBaobab = new Float32Array(count);
  const laiRose = new Float32Array(count);
  const coverBaobab = new Float32Array(count);
  const coverRose = new Float32Array(count);
  const vegetationCover = new Float32Array(count);
  const aparTotal = new Float32Array(count);
  const aparBaobab = new Float32Array(count);
  const aparRose = new Float32Array(count);
  const hydrologyHorizontalMm = new Float32Array(count);
  const hydrologyInfiltrationMm = new Float32Array(count);
  const hydrologyPercolation01Mm = new Float32Array(count);
  const hydrologyPercolation12Mm = new Float32Array(count);
  const hydrologyRechargeMm = new Float32Array(count);
  const soilOrganicCarbonGC = new Float32Array(count);
  const netEcosystemProductionGC = new Float32Array(count);
  const baobabSeedBank = new Float32Array(count);
  const roseSeedBank = new Float32Array(count);
  const baobabGermination = new Float32Array(count);
  const roseGermination = new Float32Array(count);
  const elevation = new Float32Array(count);
  const baobabHeight = new Float32Array(count);
  const roseHeight = new Float32Array(count);
  const roseFertility = new Float32Array(count);
  const volcanicAshFallRate = new Float32Array(count);
  const terrainCode = new Uint8Array(count);
  const koppenCode = new Uint8Array(count);
  const cellHeight = new Float32Array(count);
  const cellPhi = new Float32Array(count);
  const cellRing = new Int32Array(count);
  const climateDiurnalRangeC = new Float32Array(count);
  const rainClimatology = new Float32Array(count);
  const waterNeighborMask = new Uint8Array(count);
  const waterCoastMask = new Uint8Array(count);
  const roseGardenMask = new Uint8Array(count);
  const activeVolcanoCraterMask = new Uint8Array(count);
  const substrate = new Array(count).fill("loam");
  const land = new Array(count).fill("dryLoam");
  const memories = [];
  let earthRoseSeedCells = [];
  let roseCell = isEarth
    ? (topology.cellAt(Math.round(1.65 * topology.nside), topology.nside) ?? 0)
    : defaultAsteroidRoseCellId();
  let crashCell = null;
  let wellCell = null;
  const volcanoCells = isEarth ? [] : defaultAsteroidVolcanoCellIds(roseCell);
  const activeVolcanoCells = volcanoCells.slice(0, 2);
  const volcanoMask = new Uint8Array(count);
  const activeVolcanoMask = new Uint8Array(count);
  for (const cellId of volcanoCells) {
    volcanoMask[cellId] = 1;
  }
  for (const cellId of activeVolcanoCells) {
    activeVolcanoMask[cellId] = 1;
    activeVolcanoCraterMask[cellId] = 1;
  }
  for (const cell of topology.cells) {
    cellHeight[cell.id] = cell.height;
    cellPhi[cell.id] = cell.phi;
    cellRing[cell.id] = cell.ring;
  }
  markProfile("initCellGeometryInputs");
  if (isEarth) {
    const landFractionData = earthLandFractionDataForNside(topology.nside);
    const elevationGridData = earthElevationGridData();
    const climateGridData = earthClimateGridData();
    if (
      !(landFractionData instanceof Uint8Array) ||
      landFractionData.length !== count ||
      !(elevationGridData instanceof Int16Array) ||
      !(climateGridData instanceof Int16Array)
    ) {
      throw new Error("Earth reference typed arrays are not loaded.");
    }
    const initializedEarthProfile = runWasmInitializeEarthProfile({
      size: count,
      nside: topology.nside,
      roseCell,
      cellHeight,
      cellPhi,
      landFraction: landFractionData,
      elevationGrid: elevationGridData,
      climateGrid: climateGridData,
      terrainCode,
      koppenCode,
      moisture,
      soil,
      baobabRisk,
      flower,
      elevation,
      climateMeanTempC: meanTempC,
      climateDiurnalRangeC,
      rainClimatology
    });
    if (!initializedEarthProfile) {
      throw new Error("WASM Earth profile initialization is unavailable.");
    }
    earthRoseSeedCells = selectEarthCellsByScoreArray(
      flower,
      topology.nside <= 2 ? 3 : Math.round(2 + Math.sqrt(topology.nside) * 2.45),
      new Set(),
      {
        salt: 977,
        minimumScore: topology.nside <= 2 ? 0.08 : 0.12,
        minimumAngle: topology.nside <= 2 ? 0.28 : topology.nside <= 4 ? 0.44 : topology.nside <= 8 ? 0.32 : 0.22
      }
    );
    roseCell = earthRoseSeedCells[0] ?? roseCell;
    crashCell = selectEarthLandmarkCellFromProfile(2.2, 23.4, new Set(), {
      terrainCode,
      elevation,
      baobabRisk,
      cellHeight,
      cellPhi
    });
    wellCell = selectEarthLandmarkCellFromProfile(4.8, 24.2, new Set([crashCell]), {
      terrainCode,
      elevation,
      baobabRisk,
      cellHeight,
      cellPhi
    });
    for (const cell of topology.cells) {
      const id = cell.id;
      const terrainKey = TERRAIN_KEY_BY_CODE[terrainCode[id]] ?? "sand";
      terrain[id] = terrainKey;
      substrate[id] = substrateForTerrain(terrainKey);
      koppenClass[id] = KOPPEN_CLASS_BY_CODE[koppenCode[id]] ?? "Ocean";
    }
    markProfile("initEarthProfileWasm");
  }
  const roseParentKey = hierarchyCellKey(hierarchyParentCell(topology.cells[roseCell]));
  const volcanoParentKeys = new Set(volcanoCells.map((cellId) => hierarchyCellKey(hierarchyParentCell(topology.cells[cellId]))));
  const activeVolcanoParentKeys = new Set(activeVolcanoCells.map((cellId) => hierarchyCellKey(hierarchyParentCell(topology.cells[cellId]))));
  const volcanoParentDistances = hierarchyParentDistances(volcanoParentKeys, 2);
  const blockedParentKeys = new Set([roseParentKey, ...volcanoParentKeys]);
  const waterParentKey = selectWaterParentKey(blockedParentKeys);
  if (waterParentKey !== null) {
    blockedParentKeys.add(waterParentKey);
  }
  const baobabWatchParentKeys = new Set(selectBaobabWatchParentKeys(blockedParentKeys));
  const volcanoInfluenceCells = parentCellsFromKeys(volcanoParentKeys);
  const activeVolcanoInfluenceCells = parentCellsFromKeys(activeVolcanoParentKeys);
  const activeVolcanoCenterCells = activeVolcanoCells.map((cellId) => topology.cells[cellId]).filter(Boolean);
  const waterParentCells = waterParentKey === null ? [] : parentCellsFromKeys([waterParentKey]);
  const baobabWatchParentCells = parentCellsFromKeys(baobabWatchParentKeys);
  let asteroidProfileInitialized = false;
  if (!isEarth) {
    asteroidProfileInitialized = runWasmInitializeAsteroidProfile({
      size: count,
      nside: topology.nside,
      roseCell,
      cellHeight,
      cellPhi,
      cellRing,
      volcanoHeight: packCellHeights(volcanoInfluenceCells),
      volcanoPhi: packCellPhis(volcanoInfluenceCells),
      volcanoRing: packCellRings(volcanoInfluenceCells),
      activeVolcanoHeight: packCellHeights(activeVolcanoInfluenceCells),
      activeVolcanoPhi: packCellPhis(activeVolcanoInfluenceCells),
      activeCenterHeight: packCellHeights(activeVolcanoCenterCells),
      activeCenterPhi: packCellPhis(activeVolcanoCenterCells),
      waterHeight: packCellHeights(waterParentCells),
      waterPhi: packCellPhis(waterParentCells),
      baobabWatchHeight: packCellHeights(baobabWatchParentCells),
      baobabWatchPhi: packCellPhis(baobabWatchParentCells),
      volcanoMask,
      activeVolcanoMask,
      terrainCode,
      moisture,
      soil,
      baobabRisk,
      baobabBlocked,
      ash,
      elevation,
      volcanicAshFallRate,
      activeVolcanoCraterMask,
      care,
      volcanoCount: volcanoInfluenceCells.length,
      activeVolcanoCount: activeVolcanoInfluenceCells.length,
      activeCenterCount: activeVolcanoCenterCells.length,
      waterCount: waterParentCells.length,
      baobabWatchCount: baobabWatchParentCells.length
    });
    if (!asteroidProfileInitialized) {
      throw new Error("WASM asteroid profile initialization is unavailable.");
    }
    for (const cell of topology.cells) {
      const id = cell.id;
      const terrainKey = TERRAIN_KEY_BY_CODE[terrainCode[id]] ?? "sand";
      terrain[id] = terrainKey;
      substrate[id] = substrateForTerrain(terrainKey);
      koppenClass[id] = "Asteroid";
    }
    markProfile("initAsteroidProfileWasm");
  }

  markProfile("initTerrainLandUse");

  for (const cell of topology.cells) {
    let hasWaterNeighbor = false;
    let hasNonWaterNeighbor = false;
    for (const neighborId of neighborsOf(cell.id)) {
      if (terrain[neighborId] === "water") {
        hasWaterNeighbor = true;
      } else {
        hasNonWaterNeighbor = true;
      }
    }
    waterNeighborMask[cell.id] = hasWaterNeighbor ? 1 : 0;
    waterCoastMask[cell.id] = terrain[cell.id] === "water" && hasNonWaterNeighbor ? 1 : 0;
  }
  markProfile("initWaterMasks");

  if (isEarth) {
    const rosePatchNeighborCount = topology.nside <= 4 ? 1 : 2;
    for (const cellId of earthRoseSeedCells) {
      const suitability = flower[cellId];
      terrain[cellId] = cellId === roseCell ? "rose" : "moss";
      substrate[cellId] = "loam";
      roseGardenMask[cellId] = 1;
      flower[cellId] = Math.max(flower[cellId], 0.44 + suitability * 0.44);
      moisture[cellId] = Math.max(moisture[cellId], 0.62 + suitability * 0.18);
      soil[cellId] = Math.max(soil[cellId], 0.7 + suitability * 0.16);
      baobabRisk[cellId] *= 0.1;

      const companions = neighborsOf(cellId)
        .filter((neighbor) => terrain[neighbor] !== "water" && terrain[neighbor] !== "rock")
        .map((neighbor) => ({ cellId: neighbor, suitability: flower[neighbor] ?? 0 }))
        .filter((candidate) => candidate.suitability > 0.08)
        .sort((a, b) => b.suitability - a.suitability || seededNoise(b.cellId, 23) - seededNoise(a.cellId, 23))
        .slice(0, rosePatchNeighborCount);
      for (const companion of companions) {
        terrain[companion.cellId] = "moss";
        substrate[companion.cellId] = "loam";
        roseGardenMask[companion.cellId] = 1;
        flower[companion.cellId] = Math.max(flower[companion.cellId], 0.2 + companion.suitability * 0.42);
        moisture[companion.cellId] = Math.max(moisture[companion.cellId], 0.56 + companion.suitability * 0.18);
        soil[companion.cellId] = Math.max(soil[companion.cellId], 0.64 + companion.suitability * 0.18);
        baobabRisk[companion.cellId] *= 0.18;
      }
    }

    terrain[roseCell] = "rose";
    substrate[roseCell] = "loam";
    roseGardenMask[roseCell] = 1;
    flower[roseCell] = Math.max(flower[roseCell], 0.95);
    moisture[roseCell] = Math.max(moisture[roseCell], 0.78);
    soil[roseCell] = Math.max(soil[roseCell], 0.84);
    for (const landmarkCell of [crashCell, wellCell]) {
      if (landmarkCell === null || landmarkCell === undefined) {
        continue;
      }
      terrain[landmarkCell] = "sand";
      substrate[landmarkCell] = "sand";
      flower[landmarkCell] = 0;
      baobabRisk[landmarkCell] *= 0.08;
    }
    if (crashCell !== null && crashCell !== undefined) {
      moisture[crashCell] = Math.min(moisture[crashCell], 0.22);
      soil[crashCell] = Math.max(soil[crashCell], 0.42);
    }
    if (wellCell !== null && wellCell !== undefined) {
      moisture[wellCell] = Math.max(moisture[wellCell], 0.46);
      soil[wellCell] = Math.max(soil[wellCell], 0.62);
    }
  } else {
    terrain[roseCell] = "rose";
    substrate[roseCell] = "loam";
    roseGardenMask[roseCell] = 1;
    flower[roseCell] = 0.85;
    moisture[roseCell] = Math.max(moisture[roseCell], 0.46);
    soil[roseCell] = Math.max(soil[roseCell], 0.66);
    const roseGardenCells = [...new Set([
      ...neighborsOf(roseCell)
        .filter((neighbor) => !volcanoParentDistances.has(hierarchyCellKey(hierarchyParentCell(topology.cells[neighbor]))))
        .sort((a, b) => seededNoise(b, 23) - seededNoise(a, 23))
        .slice(0, topology.nside <= 2 ? 3 : 4)
    ])].filter((cellId) => cellId !== roseCell);
    for (const neighbor of roseGardenCells) {
      if (!volcanoCells.includes(neighbor)) {
        if (terrain[neighbor] !== "water" && terrain[neighbor] !== "path") {
          terrain[neighbor] = "moss";
          substrate[neighbor] = "loam";
        }
        moisture[neighbor] = Math.max(moisture[neighbor], 0.42);
      soil[neighbor] = Math.max(soil[neighbor], 0.66);
      roseGardenMask[neighbor] = 1;
      baobabRisk[neighbor] *= 0.25;
      }
    }
  }
  markProfile("initRoseAndLandmarks");

  for (const volcanoCell of volcanoCells) {
    terrain[volcanoCell] = "volcano";
    substrate[volcanoCell] = "rock";
    ash[volcanoCell] = activeVolcanoCells.includes(volcanoCell) ? 0.3 : 0.12;
    moisture[volcanoCell] = 0.18;
    soil[volcanoCell] = 0.06;
  }
  markProfile("initVolcanoCells");

  let sproutCount = isEarth
    ? (topology.nside === 2 ? 2 : Math.round(2 + topology.nside * 0.5))
    : topology.nside === 2 ? 3 : Math.round(3 + Math.sqrt(topology.nside) * 1.45);
  const sproutBlockedIds = new Set([roseCell]);
  if (crashCell !== null && crashCell !== undefined) {
    sproutBlockedIds.add(crashCell);
  }
  if (wellCell !== null && wellCell !== undefined) {
    sproutBlockedIds.add(wellCell);
  }
  if (isEarth) {
    for (const cell of topology.cells) {
      if (roseGardenMask[cell.id]) {
        sproutBlockedIds.add(cell.id);
      }
    }
  }
  const sproutCandidates = isEarth
    ? selectEarthCellsByScoreArray(baobabRisk, sproutCount, sproutBlockedIds, {
      salt: 983,
      minimumScore: topology.nside <= 2 ? 0.04 : 0.11,
      minimumAngle: topology.nside <= 2 ? 0.24 : topology.nside <= 4 ? 0.38 : topology.nside <= 8 ? 0.28 : 0.18
    }).map((cellId) => topology.cells[cellId])
    : [...topology.cells].sort((a, b) =>
      baobabRisk[b.id] + seededNoise(b.id, 11) * 0.22 - (baobabRisk[a.id] + seededNoise(a.id, 11) * 0.22)
    );
  for (const cell of sproutCandidates) {
    if (sproutCount <= 0) {
      break;
    }

    if (sproutBlockedIds.has(cell.id) || terrain[cell.id] === "water" || terrain[cell.id] === "volcano") {
      continue;
    }

    baobab[cell.id] = isEarth
      ? 0.11 + baobabRisk[cell.id] * 0.18 + seededNoise(cell.id, 19) * 0.06
      : 0.055 + baobabRisk[cell.id] * 0.075 + seededNoise(cell.id, 19) * 0.08;
    sproutCount -= 1;
  }
  markProfile("initBaobabSprouts");

  for (const cell of topology.cells) {
    const id = cell.id;
    terrainCode[id] = TERRAIN_CODE[terrain[id]] ?? TERRAIN_CODE.sand;
    cellHeight[id] = cell.height;
    cellPhi[id] = cell.phi;
    if (isEarth) {
      if (!Number.isFinite(rainClimatology[id]) || rainClimatology[id] <= 0) {
        rainClimatology[id] = earthRainClimatologyForCell(cell, terrain[id] !== "water");
      }
    } else {
      meanTempC[id] = simulationSettings.asteroidMeanTempC;
      climateDiurnalRangeC[id] = simulationSettings.asteroidDiurnalRangeC;
      rainClimatology[id] = 1;
    }
  }
  markProfile("initVegetationInputs");

  const nextState = {
    terrain,
    moisture,
    soil,
    baobab,
    flower,
    ash,
    burning,
    burnFuel,
    burnInitialFuel,
    burnBaobabTarget,
    burnRoseTarget,
    burnBaobabSeedTarget,
    burnRoseSeedTarget,
    care,
    pendingWater,
    baobabRisk,
    baobabBlocked,
    surfaceWater,
    surfaceWaterMm,
    snowIce,
    snowIceMm,
    snowIceM,
    topSoilWater,
    midSoilWater,
    deepSoilWater,
    groundwater,
    topSoilHeadM,
    midSoilHeadM,
    deepSoilHeadM,
    topSoilHeadNorm,
    midSoilHeadNorm,
    deepSoilHeadNorm,
    topSoilConductivityMDay,
    midSoilConductivityMDay,
    deepSoilConductivityMDay,
    topSoilConductivityNorm,
    midSoilConductivityNorm,
    deepSoilConductivityNorm,
    groundwaterHeadM,
    groundwaterHeadNorm,
    soilNutrient,
    soilOrganicCarbon,
    topMatricPotentialM,
    soilWaterPotential,
    rootStressBaobab,
    rootStressRose,
    rainfall,
    rainfallMm,
    rainfallInstantMm,
    cloudCover,
    cloudWeather,
    meanTempC,
    koppenClass,
    sunlight,
    laiBaobab,
    laiRose,
    coverBaobab,
    coverRose,
    vegetationCover,
    aparTotal,
    aparBaobab,
    aparRose,
    hydrologyHorizontalMm,
    hydrologyInfiltrationMm,
    hydrologyPercolation01Mm,
    hydrologyPercolation12Mm,
    hydrologyRechargeMm,
    soilOrganicCarbonGC,
    netEcosystemProductionGC,
    baobabSeedBank,
    roseSeedBank,
    baobabGermination,
    roseGermination,
    elevation,
    baobabHeight,
    roseHeight,
    roseFertility,
    volcanicAshFallRate,
    cellHeight,
    cellPhi,
    waterNeighborMask,
    waterCoastMask,
    roseGardenMask,
    activeVolcanoCraterMask,
    substrate,
    land,
    memories,
    roseCell,
    crashCell,
    wellCell,
    sheep: [],
    sheepCounter: 0,
    sheepEatenCarbon: 0,
    sheepReturnedNutrient: 0,
    volcanoCells,
    activeVolcanoCells,
    volcanoMask,
    activeVolcanoMask,
    planetPreset,
    events: [isEarth ? labels().eventEarth : labels().eventAsteroid],
    selectedCell: isEarth ? crashCell : roseCell,
    day: 1,
    turn: 0,
    roseHealth: 0.72,
    roseMemory: 0,
    roseInsight: 0,
    sunsetCount: 0,
    lastRoseCareDay: 1,
    lastRainEventKey: "",
    lastRoseWeakEventDay: 0,
    lastBaobabEventDay: 0,
    roseWitheredNotified: false,
    gameOver: false
  };

  nextState.vegetation = createAsteroidVegetationModel(topology, {
    terrain,
    moisture,
    soil,
    flower,
    ash,
    baobab,
    roseCell,
    roseGardenMask,
    planetPreset,
    volcanoCells,
    activeVolcanoCells,
    baobabRisk,
    baobabBlocked,
    elevation,
    terrainCode,
    cellHeight,
    cellPhi,
    climateMeanTempC: meanTempC,
    climateDiurnalRangeC,
    rainClimatology,
    snowIceM,
    seededNoise,
    params: vegetationParamsFromSettings()
  });
  markProfile("initVegetationModel");
  nextState.snowIceM = nextState.vegetation.state.snowIceM;
  nextState.ash = nextState.vegetation.state.ashStress;
  updateSunlightField(nextState);
  markProfile("initSunlight");
  nextState.vegetation.syncToGame(nextState, { detail: false });
  markProfile("initVegetationSync");
  updateCloudCoverField(nextState);
  markProfile("initCloudField");
  nextState.roseHealth = nextState.vegetation.roseHealth(roseCell);
  markProfile("initCreateStateFinalize");
  if (profileStart) {
    addAsteroidInitProfileTime("initCreateStateTotal", performance.now() - profileStart);
  }
  return nextState;
}

function seededNoise(a, b) {
  const value = Math.sin((a + 1) * 12.9898 + (b + 1) * 78.233 + topology.nside * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function smoothLimit(value, lower, upper) {
  return THREE.MathUtils.smoothstep(value, lower, upper);
}

function neighborsOf(cellId) {
  return topologyNeighborLists[cellId] ?? [];
}

function buildTopologyNeighborLists(sourceTopology) {
  const lists = new Array(sourceTopology.cells.length);
  for (const cell of sourceTopology.cells) {
    const neighbors = [];
    for (const direction of sourceTopology.directions) {
      const neighbor = sourceTopology.neighbor(cell.id, direction);
      if (neighbor !== null && neighbor !== undefined && !neighbors.includes(neighbor)) {
        neighbors.push(neighbor);
      }
    }
    lists[cell.id] = Object.freeze(neighbors);
  }
  return lists;
}

function configureRenderTopology() {
  const renderNside = renderNsideForSimulationNside(topology.nside);
  renderTopology = renderNside === topology.nside ? topology : createHealpixTopology(renderNside);
  renderCellChildIds = buildRenderCellChildIds();
  simulationCellToRenderCellId = buildSimulationCellToRenderCellIds();
  renderCellRepresentativeIds = buildRenderCellRepresentativeIds();
  cellBoundaryPoints = null;
  netCanvasSizeDirty = true;
  netBaseDirty = true;
  lastLocalLodOverlayKey = null;
}

function renderNsideForSimulationNside(nside) {
  if (nside >= FULL_DETAIL_RENDER_MIN_NSIDE) {
    return nside;
  }

  const maxRenderNside = continuousGlobalRenderViewModes.has(viewMode)
    ? MAX_CONTINUOUS_GLOBAL_RENDER_NSIDE
    : MAX_GLOBAL_RENDER_NSIDE;
  return Math.min(nside, maxRenderNside);
}

function topologyForNside(nside) {
  if (nside === topology.nside) {
    return topology;
  }
  if (nside === renderTopology.nside) {
    return renderTopology;
  }
  let cached = detailTopologyCache.get(nside);
  if (!cached) {
    cached = createHealpixTopology(nside);
    detailTopologyCache.set(nside, cached);
  }
  return cached;
}

function isRenderLodActive() {
  return renderTopology.nside !== topology.nside;
}

function isLocalDetailEnabled() {
  return topology.nside < LOCAL_DETAIL_DISABLE_NSIDE;
}

function buildRenderCellChildIds() {
  const scale = topology.nside / renderTopology.nside;
  const childIdsByRenderCell = new Array(renderTopology.cells.length);
  for (const renderCell of renderTopology.cells) {
    if (scale === 1) {
      childIdsByRenderCell[renderCell.id] = Int32Array.of(renderCell.id);
      continue;
    }

    const ids = new Int32Array(scale * scale);
    let cursor = 0;
    const startIx = renderCell.ix * scale;
    const startIy = renderCell.iy * scale;
    for (let ix = startIx; ix < startIx + scale; ix += 1) {
      for (let iy = startIy; iy < startIy + scale; iy += 1) {
        ids[cursor] = nestedCellIdForNside(renderCell.face, ix, iy, topology.nside);
        cursor += 1;
      }
    }
    childIdsByRenderCell[renderCell.id] = ids;
  }

  return childIdsByRenderCell;
}

function buildSimulationCellToRenderCellIds() {
  const map = new Int32Array(topology.cells.length);
  for (const renderCell of renderTopology.cells) {
    const childIds = renderCellChildIds[renderCell.id] ?? [];
    for (let index = 0; index < childIds.length; index += 1) {
      map[childIds[index]] = renderCell.id;
    }
  }
  return map;
}

function buildRenderCellRepresentativeIds() {
  const representatives = new Int32Array(renderTopology.cells.length);
  for (const renderCell of renderTopology.cells) {
    const childIds = renderCellChildIds[renderCell.id] ?? [];
    let bestCellId = childIds[0] ?? renderCell.id;
    let bestDot = -Infinity;
    for (let index = 0; index < childIds.length; index += 1) {
      const childCell = topology.cells[childIds[index]];
      if (!childCell) {
        continue;
      }
      const dot = cellNormalDot(renderCell, childCell);
      if (dot > bestDot) {
        bestDot = dot;
        bestCellId = childCell.id;
      }
    }
    representatives[renderCell.id] = bestCellId;
  }
  return representatives;
}

function nestedCellIdForNside(face, ix, iy, nside) {
  return face * nside * nside + spreadBitsForNside(iy, nside) + 2 * spreadBitsForNside(ix, nside);
}

function spreadBitsForNside(value, nside) {
  const table = nestedSpreadBitsTableForNside(nside);
  if (table) {
    return table[value] ?? 0;
  }

  let spread = 0;
  let bit = 0;
  while (1 << bit < nside) {
    spread |= ((value >> bit) & 1) << (2 * bit);
    bit += 1;
  }
  return spread;
}

function nestedSpreadBitsTableForNside(nside) {
  let table = nestedSpreadBitsCache.get(nside);
  if (table) {
    return table;
  }

  if (!Number.isInteger(nside) || nside <= 0 || nside > 65536) {
    return null;
  }

  table = new Uint32Array(nside);
  for (let value = 0; value < nside; value += 1) {
    let spread = 0;
    let bit = 0;
    while (1 << bit < nside) {
      spread |= ((value >> bit) & 1) << (2 * bit);
      bit += 1;
    }
    table[value] = spread;
  }
  nestedSpreadBitsCache.set(nside, table);
  return table;
}

function simulationCellIdForRenderCellId(renderCellId) {
  if (renderCellId === null || renderCellId === undefined) {
    return null;
  }
  return renderCellRepresentativeIds[renderCellId] ?? renderCellId;
}

function renderCellIdForSimulationCellId(cellId) {
  if (cellId === null || cellId === undefined) {
    return null;
  }
  return isRenderLodActive() ? simulationCellToRenderCellId[cellId] : cellId;
}

function renderCellContainsSimulationCell(renderCellId, cellId) {
  return cellId !== null && cellId !== undefined && renderCellIdForSimulationCellId(cellId) === renderCellId;
}

function renderCellMax(renderCellId, values) {
  const childIds = renderCellChildIds[renderCellId] ?? [];
  let maximum = 0;
  for (let index = 0; index < childIds.length; index += 1) {
    maximum = Math.max(maximum, values?.[childIds[index]] ?? 0);
  }
  return maximum;
}

function renderCellHasMask(renderCellId, mask) {
  const childIds = renderCellChildIds[renderCellId] ?? [];
  for (let index = 0; index < childIds.length; index += 1) {
    if (mask?.[childIds[index]] === 1) {
      return true;
    }
  }
  return false;
}

function buildBoard() {
  buildPickRingIndex();
  buildTiles();
  boundaryGroup.clear();
  buildNet();
  netNeedsFullUpdate = true;
  rebuildMarkers();
}

function buildPickRingIndex() {
  const maxRing = renderTopology.maxRing;
  const ringHeights = new Float32Array(maxRing + 1);
  for (let ring = 1; ring <= maxRing; ring += 1) {
    const firstCellId = renderTopology.rings.get(ring)?.[0];
    ringHeights[ring] = firstCellId === undefined ? 0 : renderTopology.cells[firstCellId].height;
  }

  pickRingBoundaries = new Float32Array(maxRing + 1);
  pickRingBoundaries[0] = 1;
  for (let ring = 1; ring < maxRing; ring += 1) {
    pickRingBoundaries[ring] = (ringHeights[ring] + ringHeights[ring + 1]) * 0.5;
  }
  pickRingBoundaries[maxRing] = -1;
}

function buildTiles() {
  tileGroup.clear();

  if (tileMesh) {
    tileMesh.geometry.dispose();
    tileMesh.material.dispose();
  }
  disposeLocalDetailTiles();

  const geometry = createSurfaceGeometry(1.026);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
    emissive: 0x141414
  });
  tileMesh = new THREE.Mesh(geometry, material);
  tileMesh.userData.tileCellByFace = tileCellByFace;
  tileGroup.add(tileMesh);
  updateTileColors();
  rebuildLocalDetailTiles();
}

function createSurfaceGeometry(radius) {
  const steps = cellSurfaceSteps(renderTopology);
  const verticesPerCell = steps * steps * 6;
  const trianglesPerCell = steps * steps * 2;
  const positions = new Float32Array(renderTopology.cells.length * verticesPerCell * 3);
  const normals = new Float32Array(renderTopology.cells.length * verticesPerCell * 3);
  const colorsArray = new Float32Array(renderTopology.cells.length * verticesPerCell * 3);
  const faceCellIds = new Int32Array(renderTopology.cells.length * trianglesPerCell);
  const ranges = new Uint32Array(renderTopology.cells.length * 2);
  const scratchNormal = new THREE.Vector3();
  let vertexCursor = 0;
  let triangleCursor = 0;

  for (const cell of renderTopology.cells) {
    const vertexStart = vertexCursor;
    const nextCursor = pushCellSurfaceTyped(
      positions,
      normals,
      faceCellIds,
      scratchNormal,
      cell,
      radius,
      steps,
      renderTopology,
      vertexCursor,
      triangleCursor
    );
    vertexCursor = nextCursor.vertex;
    triangleCursor = nextCursor.triangle;
    const vertexCount = vertexCursor - vertexStart;
    ranges[cell.id * 2] = vertexStart;
    ranges[cell.id * 2 + 1] = vertexCount;
  }

  tileCellVertexRanges = ranges;
  tileCellByFace = faceCellIds;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colorsArray, 3));
  return geometry;
}

function createLocalDetailSurfaceGeometry(layer, radius) {
  const { cellIds, topology: layerTopology } = layer;
  const steps = cellSurfaceSteps(layerTopology);
  const verticesPerCell = steps * steps * 6;
  const trianglesPerCell = steps * steps * 2;
  const positions = new Float32Array(cellIds.length * verticesPerCell * 3);
  const normals = new Float32Array(cellIds.length * verticesPerCell * 3);
  const colorsArray = new Float32Array(cellIds.length * verticesPerCell * 3);
  const faceCellIds = new Int32Array(cellIds.length * trianglesPerCell);
  const ranges = new Uint32Array(cellIds.length * 2);
  const scratchNormal = new THREE.Vector3();
  let vertexCursor = 0;
  let triangleCursor = 0;

  for (let index = 0; index < cellIds.length; index += 1) {
    const cell = layerTopology.cells[cellIds[index]];
    if (!cell) {
      continue;
    }
    const vertexStart = vertexCursor;
    const nextCursor = pushCellSurfaceTyped(
      positions,
      normals,
      faceCellIds,
      scratchNormal,
      cell,
      radius,
      steps,
      layerTopology,
      vertexCursor,
      triangleCursor
    );
    vertexCursor = nextCursor.vertex;
    triangleCursor = nextCursor.triangle;
    ranges[index * 2] = vertexStart;
    ranges[index * 2 + 1] = vertexCursor - vertexStart;
  }

  layer.cellVertexRanges = ranges;
  layer.cellByFace = faceCellIds;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colorsArray, 3));
  return geometry;
}

function pushCellSurfaceTyped(
  positions,
  normals,
  faceCellIds,
  triangleNormal,
  cell,
  radius,
  steps,
  sourceTopology,
  vertexCursor,
  triangleCursor
) {
  if (steps === 1) {
    return pushCellSurfaceTypedQuad(
      positions,
      normals,
      faceCellIds,
      cell,
      radius,
      sourceTopology,
      vertexCursor,
      triangleCursor
    );
  }

  const vertices = [];
  const cellCenter = projectedCellPoint(cell, cell.ix + 0.5, cell.iy + 0.5, sourceTopology);

  for (let y = 0; y <= steps; y += 1) {
    const row = [];
    for (let x = 0; x <= steps; x += 1) {
      row.push(projectedCellPoint(
        cell,
        cell.ix + x / steps,
        cell.iy + y / steps,
        sourceTopology
      ));
    }
    vertices.push(row);
  }

  for (let y = 0; y < steps; y += 1) {
    for (let x = 0; x < steps; x += 1) {
      vertexCursor = pushSurfaceTriangleTyped(positions, normals, triangleNormal, cellCenter, radius, vertexCursor, [
        vertices[y][x],
        vertices[y][x + 1],
        vertices[y + 1][x + 1]
      ]);
      faceCellIds[triangleCursor] = cell.id;
      triangleCursor += 1;
      vertexCursor = pushSurfaceTriangleTyped(positions, normals, triangleNormal, cellCenter, radius, vertexCursor, [
        vertices[y][x],
        vertices[y + 1][x + 1],
        vertices[y + 1][x]
      ]);
      faceCellIds[triangleCursor] = cell.id;
      triangleCursor += 1;
    }
  }

  return { vertex: vertexCursor, triangle: triangleCursor };
}

function pushCellSurfaceTypedQuad(
  positions,
  normals,
  faceCellIds,
  cell,
  radius,
  sourceTopology,
  vertexCursor,
  triangleCursor
) {
  projectedCellPointComponents(cell, cell.ix, cell.iy, sourceTopology, surfaceFastScratch, 0);
  projectedCellPointComponents(cell, cell.ix + 1, cell.iy, sourceTopology, surfaceFastScratch, 3);
  projectedCellPointComponents(cell, cell.ix, cell.iy + 1, sourceTopology, surfaceFastScratch, 6);
  projectedCellPointComponents(cell, cell.ix + 1, cell.iy + 1, sourceTopology, surfaceFastScratch, 9);
  projectedCellPointComponents(cell, cell.ix + 0.5, cell.iy + 0.5, sourceTopology, surfaceFastScratch, 12);

  vertexCursor = pushSurfaceTriangleFromComponents(
    positions,
    normals,
    surfaceFastScratch,
    12,
    radius,
    vertexCursor,
    0,
    3,
    9
  );
  faceCellIds[triangleCursor] = cell.id;
  triangleCursor += 1;

  vertexCursor = pushSurfaceTriangleFromComponents(
    positions,
    normals,
    surfaceFastScratch,
    12,
    radius,
    vertexCursor,
    0,
    9,
    6
  );
  faceCellIds[triangleCursor] = cell.id;
  triangleCursor += 1;

  return { vertex: vertexCursor, triangle: triangleCursor };
}

function projectedCellPointComponents(cell, u, v, sourceTopology, target, offset) {
  const nside = sourceTopology.nside;
  const boundaryRing = FACE_RING_ANCHORS[cell.face] * nside - u - v;
  const projectedRaw = FACE_PHI_ANCHORS[cell.face] * nside - u + v + 1;
  const phiRaw = projectedRawToPhiRaw(projectedRaw, boundaryRing, nside);
  const height = boundaryRingHeight(boundaryRing, nside);
  const phi = ((phiRaw - 1) * Math.PI) / (4 * nside);
  const horizontalRadius = Math.sqrt(Math.max(0, 1 - height * height));

  target[offset] = Math.cos(phi) * horizontalRadius;
  target[offset + 1] = Math.sin(phi) * horizontalRadius;
  target[offset + 2] = height;
}

function pushSurfaceTriangleFromComponents(
  positions,
  normals,
  components,
  centerOffset,
  radius,
  vertexCursor,
  aOffset,
  bOffset,
  cOffset
) {
  const ax = components[aOffset];
  const ay = components[aOffset + 1];
  const az = components[aOffset + 2];
  const bx = components[bOffset];
  const by = components[bOffset + 1];
  const bz = components[bOffset + 2];
  const cx = components[cOffset];
  const cy = components[cOffset + 1];
  const cz = components[cOffset + 2];
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const crossX = aby * acz - abz * acy;
  const crossY = abz * acx - abx * acz;
  const crossZ = abx * acy - aby * acx;
  const outwardDot =
    crossX * components[centerOffset] +
    crossY * components[centerOffset + 1] +
    crossZ * components[centerOffset + 2];

  if (outwardDot >= 0) {
    vertexCursor = writeSurfaceVertexFromComponents(positions, normals, components, radius, vertexCursor, aOffset);
    vertexCursor = writeSurfaceVertexFromComponents(positions, normals, components, radius, vertexCursor, bOffset);
    vertexCursor = writeSurfaceVertexFromComponents(positions, normals, components, radius, vertexCursor, cOffset);
  } else {
    vertexCursor = writeSurfaceVertexFromComponents(positions, normals, components, radius, vertexCursor, aOffset);
    vertexCursor = writeSurfaceVertexFromComponents(positions, normals, components, radius, vertexCursor, cOffset);
    vertexCursor = writeSurfaceVertexFromComponents(positions, normals, components, radius, vertexCursor, bOffset);
  }

  return vertexCursor;
}

function writeSurfaceVertexFromComponents(positions, normals, components, radius, vertexCursor, sourceOffset) {
  const targetOffset = vertexCursor * 3;
  const x = components[sourceOffset];
  const y = components[sourceOffset + 1];
  const z = components[sourceOffset + 2];
  positions[targetOffset] = x * radius;
  positions[targetOffset + 1] = y * radius;
  positions[targetOffset + 2] = z * radius;
  normals[targetOffset] = x;
  normals[targetOffset + 1] = y;
  normals[targetOffset + 2] = z;
  return vertexCursor + 1;
}

function pushCellSurface(positions, normals, faceCellIds, triangleNormal, cell, radius) {
  const steps = cellSurfaceSteps();
  const vertices = [];
  const cellCenter = projectedCellPoint(cell, cell.ix + 0.5, cell.iy + 0.5);

  for (let y = 0; y <= steps; y += 1) {
    const row = [];
    for (let x = 0; x <= steps; x += 1) {
      row.push(projectedCellPoint(
        cell,
        cell.ix + x / steps,
        cell.iy + y / steps
      ));
    }
    vertices.push(row);
  }

  for (let y = 0; y < steps; y += 1) {
    for (let x = 0; x < steps; x += 1) {
      pushSurfaceTriangle(positions, normals, triangleNormal, cellCenter, radius, [
        vertices[y][x],
        vertices[y][x + 1],
        vertices[y + 1][x + 1]
      ]);
      faceCellIds.push(cell.id);
      pushSurfaceTriangle(positions, normals, triangleNormal, cellCenter, radius, [
        vertices[y][x],
        vertices[y + 1][x + 1],
        vertices[y + 1][x]
      ]);
      faceCellIds.push(cell.id);
    }
  }
}

function pushSurfaceTriangleTyped(positions, normals, triangleNormal, cellCenter, radius, vertexCursor, triangle) {
  triangleNormal
    .copy(surfaceEdgeA.subVectors(triangle[1], triangle[0]))
    .cross(surfaceEdgeB.subVectors(triangle[2], triangle[0]));
  const ordered = triangleNormal.dot(cellCenter) >= 0
    ? triangle
    : [triangle[0], triangle[2], triangle[1]];

  for (const point of ordered) {
    const offset = vertexCursor * 3;
    positions[offset] = point.x * radius;
    positions[offset + 1] = point.y * radius;
    positions[offset + 2] = point.z * radius;
    normals[offset] = point.x;
    normals[offset + 1] = point.y;
    normals[offset + 2] = point.z;
    vertexCursor += 1;
  }

  return vertexCursor;
}

function updateTileColors(fullUpdate = true) {
  if (!tileMesh) {
    return;
  }

  if (!fullUpdate) {
    return;
  }

  const colorAttribute = tileMesh.geometry.getAttribute("color");
  for (const cell of renderTopology.cells) {
    updateTileCellColor(cell.id, colorAttribute);
  }

  colorAttribute.needsUpdate = true;
}

function updateTileCellColor(cellId, colorAttribute) {
  if (cellId === null || cellId === undefined) {
    return;
  }

  const cell = renderTopology.cells[cellId];
  if (!cell) {
    return;
  }

  const color = colorForRenderCellInto(cell, scratchTileColor);
  const colorArray = colorAttribute.array;
  const start = tileCellVertexRanges[cellId * 2];
  const count = tileCellVertexRanges[cellId * 2 + 1];
  for (let vertexIndex = start; vertexIndex < start + count; vertexIndex += 1) {
    const offset = vertexIndex * 3;
    colorArray[offset] = color.r;
    colorArray[offset + 1] = color.g;
    colorArray[offset + 2] = color.b;
  }
}

function rebuildLocalDetailTiles() {
  disposeLocalDetailTiles();

  if (!shouldShowLocalDetailMesh()) {
    return;
  }

  for (const spec of localDetailLayerSpecs()) {
    const layer = createLocalDetailLayer(spec);
    if (!layer || layer.cellIds.length === 0) {
      continue;
    }
    localDetailLayers.push(layer);
    tileGroup.add(layer.mesh);
  }
  updateLocalDetailTileColors();
}

function disposeLocalDetailTiles() {
  for (const layer of localDetailLayers) {
    tileGroup.remove(layer.mesh);
    layer.mesh.geometry.dispose();
    layer.mesh.material.dispose();
  }
  localDetailLayers = [];
}

function updateLocalDetailTileColors() {
  if (localDetailLayers.length === 0) {
    return;
  }

  for (const layer of localDetailLayers) {
    const colorAttribute = layer.mesh.geometry.getAttribute("color");
    const colorArray = colorAttribute.array;
    for (let index = 0; index < layer.cellIds.length; index += 1) {
      colorForDetailLayerCellInto(layer, index, scratchTileColor);
      const start = layer.cellVertexRanges[index * 2];
      const count = layer.cellVertexRanges[index * 2 + 1];
      for (let vertexIndex = start; vertexIndex < start + count; vertexIndex += 1) {
        const offset = vertexIndex * 3;
        colorArray[offset] = scratchTileColor.r;
        colorArray[offset + 1] = scratchTileColor.g;
        colorArray[offset + 2] = scratchTileColor.b;
      }
    }
    colorAttribute.needsUpdate = true;
  }
}

function shouldShowLocalDetailMesh() {
  return isLocalDetailEnabled() &&
    isRenderLodActive() &&
    camera.position.distanceTo(controls.target) <= LOD_DETAIL_CAMERA_DISTANCE;
}

function localDetailLayerSpecs() {
  if (!shouldShowLocalDetailMesh()) {
    return [];
  }

  if (topology.nside >= 256 && renderTopology.nside < 128) {
    return [
      { nside: 128, maxCells: LOD_DETAIL_MAX_MID_CELLS, radius: 1.034 },
      { nside: topology.nside, maxCells: LOD_DETAIL_MAX_FINE_CELLS, radius: 1.039 }
    ];
  }

  return [{ nside: topology.nside, maxCells: LOD_DETAIL_MAX_FINE_CELLS, radius: 1.037 }];
}

function createLocalDetailLayer(spec) {
  const layerTopology = topologyForNside(spec.nside);
  const renderIds = detailRenderCellIds(spec.nside, spec.maxCells);
  const cellIds = detailLayerCellIdsForRenderCells(renderIds, layerTopology, spec.maxCells);
  if (cellIds.length === 0) {
    return null;
  }

  const layer = {
    topology: layerTopology,
    cellIds,
    childIdsByIndex: [],
    representativeIdsByCellId: new Int32Array(layerTopology.cells.length).fill(-1),
    cellVertexRanges: new Uint32Array(0),
    cellByFace: new Int32Array(0),
    mesh: null
  };

  for (let index = 0; index < cellIds.length; index += 1) {
    const layerCell = layerTopology.cells[cellIds[index]];
    const childIds = simulationChildIdsForLayerCell(layerCell, layerTopology);
    layer.childIdsByIndex[index] = childIds;
    layer.representativeIdsByCellId[layerCell.id] = representativeSimulationCellId(layerCell, childIds);
  }

  const geometry = createLocalDetailSurfaceGeometry(layer, spec.radius);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
    emissive: 0x111111,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  layer.mesh = new THREE.Mesh(geometry, material);
  layer.mesh.userData.detailLayer = layer;
  layer.mesh.userData.tileCellByFace = layer.cellByFace;
  return layer;
}

function detailLayerCellIdsForRenderCells(renderIds, layerTopology, maxCells) {
  const scale = layerTopology.nside / renderTopology.nside;
  const ids = [];
  for (const renderId of renderIds) {
    const renderCell = renderTopology.cells[renderId];
    if (!renderCell) {
      continue;
    }
    const startIx = renderCell.ix * scale;
    const startIy = renderCell.iy * scale;
    for (let ix = startIx; ix < startIx + scale; ix += 1) {
      for (let iy = startIy; iy < startIy + scale; iy += 1) {
        ids.push(nestedCellIdForNside(renderCell.face, ix, iy, layerTopology.nside));
        if (ids.length >= maxCells) {
          return Int32Array.from(ids);
        }
      }
    }
  }
  return Int32Array.from(ids);
}

function simulationChildIdsForLayerCell(layerCell, layerTopology) {
  const scale = topology.nside / layerTopology.nside;
  if (scale === 1) {
    return Int32Array.of(layerCell.id);
  }

  const ids = new Int32Array(scale * scale);
  let cursor = 0;
  const startIx = layerCell.ix * scale;
  const startIy = layerCell.iy * scale;
  for (let ix = startIx; ix < startIx + scale; ix += 1) {
    for (let iy = startIy; iy < startIy + scale; iy += 1) {
      ids[cursor] = nestedCellIdForNside(layerCell.face, ix, iy, topology.nside);
      cursor += 1;
    }
  }
  return ids;
}

function representativeSimulationCellId(layerCell, childIds) {
  let bestCellId = childIds[0] ?? layerCell.id;
  let bestDot = -Infinity;
  for (let index = 0; index < childIds.length; index += 1) {
    const childCell = topology.cells[childIds[index]];
    if (!childCell) {
      continue;
    }
    const dot = cellNormalDot(layerCell, childCell);
    if (dot > bestDot) {
      bestDot = dot;
      bestCellId = childCell.id;
    }
  }
  return bestCellId;
}

function colorForDetailLayerCellInto(layer, index, target) {
  const childIds = layer.childIdsByIndex[index] ?? [];
  if (childIds.length === 1) {
    return colorForCellInto(topology.cells[childIds[0]], target);
  }

  if (colorForAveragedViewInto(childIds, target)) {
    return target;
  }

  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let childIndex = 0; childIndex < childIds.length; childIndex += 1) {
    const childCell = topology.cells[childIds[childIndex]];
    if (!childCell) {
      continue;
    }
    colorForCellInto(childCell, scratchRenderAggregateColor);
    red += scratchRenderAggregateColor.r;
    green += scratchRenderAggregateColor.g;
    blue += scratchRenderAggregateColor.b;
    count += 1;
  }

  if (count === 0) {
    return target.copy(colors.sand);
  }
  target.setRGB(red / count, green / count, blue / count);
  return applySnowIceSurfaceTintForChildIds(childIds, target);
}

function fineDetailSimulationCellIds() {
  if (!isLocalDetailEnabled()) {
    return [];
  }
  const renderIds = detailRenderCellIds(topology.nside, LOD_DETAIL_MAX_FINE_CELLS);
  const ids = detailLayerCellIdsForRenderCells(renderIds, topology, LOD_DETAIL_MAX_FINE_CELLS);
  return ids;
}

function detailRenderCellIds(targetNside = topology.nside, maxDetailCells = LOD_DETAIL_MAX_FINE_CELLS) {
  if (!shouldShowLocalDetailMesh()) {
    return [];
  }

  const candidates = [];
  const focalPixels = window.innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5));
  lodCameraDirection.copy(camera.position).sub(controls.target);
  if (lodCameraDirection.lengthSq() <= 0) {
    return [];
  }
  lodCameraDirection.normalize();

  for (const cell of renderTopology.cells) {
    const normalX = cell.normal[0];
    const normalY = cell.normal[2];
    const normalZ = cell.normal[1];
    const facing = normalX * lodCameraDirection.x + normalY * lodCameraDirection.y + normalZ * lodCameraDirection.z;
    if (facing < -0.04) {
      continue;
    }

    lodProjectionPoint.set(normalX, normalY, normalZ).multiplyScalar(1.04);
    const distance = camera.position.distanceTo(lodProjectionPoint);
    const sizePixels = (tileSize(cell, renderTopology) * focalPixels) / Math.max(0.15, distance);
    if (sizePixels < LOD_DETAIL_MIN_TILE_PIXELS) {
      continue;
    }

    lodProjectionPoint.project(camera);
    if (
      !Number.isFinite(lodProjectionPoint.x) ||
      !Number.isFinite(lodProjectionPoint.y) ||
      lodProjectionPoint.z < -1 ||
      lodProjectionPoint.z > 1 ||
      lodProjectionPoint.x < -1 - LOD_DETAIL_VIEW_MARGIN ||
      lodProjectionPoint.x > 1 + LOD_DETAIL_VIEW_MARGIN ||
      lodProjectionPoint.y < -1 - LOD_DETAIL_VIEW_MARGIN ||
      lodProjectionPoint.y > 1 + LOD_DETAIL_VIEW_MARGIN
    ) {
      continue;
    }

    const centerPenalty = (lodProjectionPoint.x * lodProjectionPoint.x + lodProjectionPoint.y * lodProjectionPoint.y) * 0.18;
    candidates.push({
      id: cell.id,
      score: sizePixels + facing * 1.4 - centerPenalty
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const childScale = targetNside / renderTopology.nside;
  const childCount = Math.max(1, childScale * childScale);
  const maxRenderTiles = Math.max(1, Math.floor(maxDetailCells / childCount));
  return candidates.slice(0, maxRenderTiles).map((candidate) => candidate.id);
}

function cameraCenterRenderCellId() {
  if (!renderTopology) {
    return null;
  }

  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() <= 0) {
    return null;
  }
  direction.normalize();
  return renderCellIdForSpherePoint(direction);
}

function renderCellIdForSpherePoint(point) {
  const length = point.length();
  if (length <= 0) {
    return null;
  }

  const height = THREE.MathUtils.clamp(point.z / length, -1, 1);
  const phi = Math.atan2(point.y, point.x);
  const ring = ringForHeight(height);
  return renderTopology.cellAtPhi(ring, phi);
}

function createStarField() {
  const starCount = 920;
  const positions = [];

  for (let index = 0; index < starCount; index += 1) {
    const z = deterministicUnit(index, 1) * 2 - 1;
    const theta = deterministicUnit(index, 2) * Math.PI * 2;
    const radius = 18 + deterministicUnit(index, 3) * 6;
    const horizontal = Math.sqrt(Math.max(0, 1 - z * z));
    positions.push(
      Math.cos(theta) * horizontal * radius,
      Math.sin(theta) * horizontal * radius,
      z * radius
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xf5efd8,
    size: 1.35,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    fog: false
  });
  return new THREE.Points(geometry, material);
}

function deterministicUnit(index, salt) {
  const value = Math.sin((index + 1) * 12.9898 + (salt + 1) * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function updateDaylight() {
  const progress = turnProgress();
  const phasePosition = progress * (sunPhases.length - 1);
  const phaseIndex = Math.min(sunPhases.length - 2, Math.floor(phasePosition));
  const phaseT = phasePosition - phaseIndex;
  const current = sunPhases[phaseIndex];
  const next = sunPhases[phaseIndex + 1];
  const intensity = THREE.MathUtils.lerp(current.intensity, next.intensity, phaseT);
  const roseDaylight = updateRoseSunDirection(progress);

  daylightSkyColor.copy(current.sky).lerp(next.sky, phaseT);
  daylightSunColor.copy(current.sun).lerp(next.sun, phaseT);
  backgroundColor.copy(daylightSkyColor);
  renderer.setClearColor(backgroundColor, 1);
  scene.fog.color.copy(backgroundColor);
  starField.material.opacity = THREE.MathUtils.lerp(current.stars, next.stars, phaseT);

  sunPosition.copy(sunDirection).multiplyScalar(SUN_VISUAL_DISTANCE);
  sunMesh.position.copy(sunPosition);
  sunGlow.position.copy(sunPosition);
  sunMesh.material.color.copy(daylightSunColor);
  sunGlow.material.color.copy(daylightSunColor);
  sunGlow.material.opacity = 0.14 + (1 - roseDaylight) * 0.18;
  sunMesh.visible = false;
  sunGlow.visible = false;
  if (sunMarker) {
    sunMarker.style.setProperty("--sun-core", `#${daylightSunColor.getHexString()}`);
    sunMarker.style.opacity = String(0.72 + roseDaylight * 0.2);
  }

  keyLight.position.copy(sunDirection).multiplyScalar(5.2);
  keyLight.color.copy(daylightSunColor);
  keyLight.intensity = intensity * (0.38 + roseDaylight * 0.48);
  ambient.intensity = 1.05 + intensity * 0.12;
  rimLight.color.copy(daylightSunColor).lerp(new THREE.Color(0xf0b45a), 0.35);
  rimLight.intensity = 0.54 + (1 - progress) * 0.18 + progress * 0.26;
}

function computeSunDirectionForCellAt(progress, cellId, out, normalOut, eastOut) {
  normalOut.copy(vectorForCell(topology.cells[cellId]));
  eastOut.crossVectors(unitZ, normalOut);
  if (eastOut.lengthSq() < 0.0001) {
    eastOut.crossVectors(unitY, normalOut);
  }
  eastOut.normalize();

  const solarAngle = progress * Math.PI * 2;
  out
    .copy(eastOut)
    .multiplyScalar(Math.cos(solarAngle))
    .addScaledVector(normalOut, Math.sin(solarAngle))
    .normalize();

  return THREE.MathUtils.clamp(out.dot(normalOut), 0, 1);
}

function computeRoseSunDirectionAt(progress, targetState, out, normalOut, eastOut) {
  return computeSunDirectionForCellAt(progress, solarReferenceCellIdForState(targetState), out, normalOut, eastOut);
}

function updateRoseSunDirection(progress, targetState = state) {
  return computeRoseSunDirectionAt(progress, targetState, sunDirection, sunRoseNormal, sunEastAxis);
}

function updateSunlightField(targetState = state, modelTimeOffsetDays = 0, modelDurationDays = VISIBLE_SUNLIGHT_DURATION_DAYS, updateVisible = true) {
  const simulationSunlight = targetState.vegetation?.state?.sunlight ?? targetState.sunlight;
  const referenceCellId = solarReferenceCellIdForState(targetState);
  if (
    !runWasmSunlightField(sunlightCellNormals, simulationSunlight, {
      roseCell: referenceCellId,
      turn: targetState.turn,
      turnsPerDay: TURNS_PER_DAY,
      modelTimeOffsetDays,
      modelDurationDays,
      sampleCount: SUNLIGHT_AVERAGE_SAMPLES
    })
  ) {
    throw new Error("C/WASM sunlight update is required for asteroid garden simulation.");
  }
  if (updateVisible && simulationSunlight !== targetState.sunlight) {
    if (
      !runWasmSunlightField(sunlightCellNormals, targetState.sunlight, {
        roseCell: referenceCellId,
        turn: targetState.turn,
        turnsPerDay: TURNS_PER_DAY,
        modelTimeOffsetDays,
        modelDurationDays,
        sampleCount: SUNLIGHT_AVERAGE_SAMPLES
      })
    ) {
      throw new Error("C/WASM visible sunlight update is required for asteroid garden simulation.");
    }
  }
  const startProgress = (targetState.turn / TURNS_PER_DAY + modelTimeOffsetDays) % 1;
  updateRoseSunDirection(startProgress, targetState);
}

function rebuildWeatherOverlay() {
  weatherGroup.clear();
  if (shouldHideAllObjectMarkers()) {
    return;
  }
  const cloudRain = (cell) => cloudRainMmForRenderCell(cell);
  const cloudCover = (cell) => cloudWeatherForRenderCell(cell);
  if (state.planetPreset !== "earth") {
    const asteroidCloudCells = selectSeparatedCloudCells(
      renderTopology.cells.filter((cell) => cloudRain(cell) > 0.34),
      renderTopology.nside <= 8 ? 18 : 52,
      renderTopology.nside <= 8 ? 0.28 : 0.12,
      cloudRain
    );
    for (const cell of asteroidCloudCells) {
      addCloudPatch(cell, cloudRain(cell), false);
    }
    return;
  }

  const cloudVisualScore = (cell) => earthCloudVisualScoreForRenderCell(cell);
  const rainyCells = selectSeparatedCloudCells(
    renderTopology.cells.filter((cell) => Math.abs(cell.height) > 0.28 && cloudVisualScore(cell) > 0.32),
    renderTopology.nside <= 8 ? 90 : 180,
    renderTopology.nside <= 8 ? 0.12 : 0.055,
    cloudVisualScore
  );
  const tropicalCells = selectSeparatedCloudCells(
    renderTopology.cells.filter((cell) => Math.abs(cell.height) < 0.32 && tropicalCloudScoreForRenderCell(cell) > 0.2),
    renderTopology.nside <= 8 ? 10 : 36,
    renderTopology.nside <= 8 ? 0.34 : 0.16,
    tropicalCloudScoreForRenderCell
  );
  const cycloneCells = selectSeparatedCloudCells(
    renderTopology.cells.filter((cell) => tropicalCycloneScoreForRenderCell(cell) > 0.26),
    renderTopology.nside <= 8 ? 1 : 4,
    renderTopology.nside <= 8 ? 0.5 : 0.28,
    tropicalCycloneScoreForRenderCell
  );
  if (rainyCells.length === 0 && tropicalCells.length === 0 && cycloneCells.length === 0) {
    return;
  }

  for (const cell of rainyCells) {
    addCloudPatch(cell, cloudVisualScore(cell) * 4.2, false);
  }

  for (const cell of cycloneCells) {
    addCycloneCloudPatch(cell, cloudCover(cell));
  }

  for (let index = 0; index < tropicalCells.length; index += 1) {
    const cell = tropicalCells[index];
    if (isNearCloudCell(cell, cycloneCells, renderTopology.nside <= 8 ? 0.5 : 0.22)) {
      continue;
    }
    addCloudPatch(cell, cloudCover(cell) * 4.8, true, index === 0);
  }
}

function cloudRainMm(cellId) {
  return cloudRainMmForState(state, cellId);
}

function cloudRainMmForState(targetState, cellId) {
  const instant = targetState.rainfallInstantMm?.[cellId] ?? 0;
  const mean = targetState.rainfallMm?.[cellId] ?? 0;
  if (targetState.planetPreset !== "earth") {
    return Math.max(instant, mean * 0.42);
  }
  return Math.max(0, instant - mean * 0.18);
}

function updateCloudCoverField(targetState = state) {
  if (!targetState.cloudCover) {
    return;
  }
  const weatherOut = targetState.cloudWeather ?? targetState.cloudCover;

  if (targetState.planetPreset === "earth" && hasEra5CloudClimatology()) {
    const modelDay = targetState.day + targetState.turn / TURNS_PER_DAY;
    const updateKey = `earth-era5:${modelDay}`;
    if (targetState.cloudCoverUpdateKey === updateKey) {
      return;
    }
    const cloudData = era5CloudCoverData();
    const updatedCloud = runWasmEarthCloudCover({
      size: targetState.cloudCover.length,
      modelDay,
      cellHeight: targetState.cellHeight,
      cellPhi: targetState.cellPhi,
      era5CloudCover: cloudData,
      cloudCover: targetState.cloudCover,
      cloudWeather: weatherOut
    });
    if (!updatedCloud) {
      throw new Error("WASM ERA5 cloud field update is unavailable.");
    }
    targetState.cloudCoverSource = "ERA5";
    targetState.cloudWeatherSource = "ERA5-realization";
    targetState.cloudCoverUpdateKey = updateKey;
    return;
  }

  for (let cellId = 0; cellId < targetState.cloudCover.length; cellId += 1) {
    const rainCloud = cloudRainMmForState(targetState, cellId);
    const value = clamp01(rainCloud / (targetState.planetPreset === "earth" ? 3.0 : 2.4));
    targetState.cloudCover[cellId] = value;
    weatherOut[cellId] = value;
  }
  targetState.cloudCoverSource = "rain";
  targetState.cloudWeatherSource = "rain";
  targetState.cloudCoverUpdateKey = `rain:${targetState.day}:${targetState.turn}:${targetState.maxRainfallMm ?? 0}`;
}

function shouldUpdateCloudCoverForCurrentView(targetState = state) {
  if (viewMode === "cloudCover") {
    return true;
  }
  if (targetState.planetPreset !== "earth") {
    return !shouldHideAllObjectMarkers();
  }
  return !shouldHideAllObjectMarkers();
}

function earthCloudGeometryForTopology(sourceTopology) {
  let cached = earthCloudGeometryCache.get(sourceTopology);
  if (cached) {
    return cached;
  }

  const size = sourceTopology.cells.length;
  const midLatitude = new Float64Array(size);
  const tropical = new Float64Array(size);
  const tropicalPulse = new Float64Array(size);
  const polar = new Float64Array(size);
  for (const cell of sourceTopology.cells) {
    midLatitude[cell.id] = Math.exp(-0.5 * ((Math.abs(cell.height) - 0.62) / 0.22) ** 2);
    tropical[cell.id] = Math.exp(-0.5 * (cell.height / 0.28) ** 2);
    tropicalPulse[cell.id] = Math.exp(-0.5 * (cell.height / 0.24) ** 2);
    polar[cell.id] = smoothLimit(Math.abs(cell.height), 0.74, 0.96);
  }
  cached = { midLatitude, tropical, tropicalPulse, polar };
  earthCloudGeometryCache.set(sourceTopology, cached);
  return cached;
}

function earthWeatherCloudCover(cell, meanCloud, modelDay, geometry = earthCloudGeometryForTopology(topology)) {
  const mean = clamp01(meanCloud);
  const index = cell.id;
  const synoptic = earthCloudCoherentNoise(cell, modelDay, 17, geometry, index);
  const mesoscale = earthCloudCoherentNoise(cell, modelDay * 1.7 + 13.5, 61, geometry, index);
  const tropicalPulse = geometry.tropicalPulse[index];
  const polar = geometry.polar[index];
  const variability = clamp01(0.72 * synoptic + 0.28 * mesoscale + (mesoscale - 0.5) * tropicalPulse * 0.18);
  const polarBreaks = earthCloudCoherentNoise(cell, modelDay * 0.42 + 31.0, 113, geometry, index);
  const threshold = clamp01(1 - mean + polar * 0.11 * (1 - polarBreaks));
  const occurrence = smoothLimit(variability, threshold - 0.055, threshold + 0.055);
  const opticalDepth = clamp01(0.34 + mean * 0.52 + (mesoscale - 0.5) * 0.16);
  return clamp01(occurrence * opticalDepth);
}

function earthCloudCoherentNoise(cell, modelDay, salt, geometry = earthCloudGeometryForTopology(topology), index = cell.id) {
  const phase = salt * 0.031;
  const midLatitude = geometry.midLatitude[index];
  const tropical = geometry.tropical[index];
  const drift = modelDay * (0.11 + midLatitude * 0.18 + tropical * 0.05);
  const waveA = Math.sin(cell.phi * 2.1 + cell.height * 4.8 - drift + phase);
  const waveB = Math.cos(cell.phi * 4.4 - cell.height * 7.1 - drift * 1.45 - phase * 1.7);
  const waveC = Math.sin(Math.cos(cell.phi - drift * 0.62 + phase) * 3.2 + cell.height * 5.5);
  const waveD = Math.cos(cell.phi * 7.0 + cell.height * 10.5 - drift * 2.1 + phase * 0.7);
  return clamp01(0.5 + waveA * 0.23 + waveB * 0.17 + waveC * 0.12 + waveD * 0.07);
}

function cloudRainMmForRenderCell(cell) {
  if (!isRenderLodActive()) {
    return cloudRainMm(cell.id);
  }

  const childIds = renderCellChildIds[cell.id] ?? [];
  if (childIds.length === 0) {
    return 0;
  }
  let total = 0;
  for (let index = 0; index < childIds.length; index += 1) {
    total += cloudRainMm(childIds[index]);
  }
  return total / childIds.length;
}

function cloudCoverAtCell(cellId) {
  return state.cloudCover?.[cellId] ?? clamp01(cloudRainMm(cellId) / (state.planetPreset === "earth" ? 3.0 : 2.4));
}

function cloudWeatherAtCell(cellId) {
  return state.cloudWeather?.[cellId] ?? cloudCoverAtCell(cellId);
}

function cloudCoverForRenderCell(cell) {
  if (!isRenderLodActive()) {
    return cloudCoverAtCell(cell.id);
  }

  const childIds = renderCellChildIds[cell.id] ?? [];
  if (childIds.length === 0) {
    return 0;
  }
  let total = 0;
  for (let index = 0; index < childIds.length; index += 1) {
    total += cloudCoverAtCell(childIds[index]);
  }
  return total / childIds.length;
}

function cloudWeatherForRenderCell(cell) {
  if (!isRenderLodActive()) {
    return cloudWeatherAtCell(cell.id);
  }

  const childIds = renderCellChildIds[cell.id] ?? [];
  if (childIds.length === 0) {
    return 0;
  }
  let total = 0;
  for (let index = 0; index < childIds.length; index += 1) {
    total += cloudWeatherAtCell(childIds[index]);
  }
  return total / childIds.length;
}

function tropicalRainScore(cell) {
  const tropicalMask = Math.exp(-0.5 * (cell.height / 0.22) ** 2);
  return cloudRainMm(cell.id) * tropicalMask;
}

function tropicalRainScoreForRenderCell(cell) {
  const tropicalMask = Math.exp(-0.5 * (cell.height / 0.22) ** 2);
  return cloudRainMmForRenderCell(cell) * tropicalMask;
}

function tropicalCloudScoreForRenderCell(cell) {
  const tropicalMask = Math.exp(-0.5 * (cell.height / 0.22) ** 2);
  return cloudWeatherForRenderCell(cell) * tropicalMask;
}

function tropicalCycloneScoreForRenderCell(cell) {
  if (state.planetPreset !== "earth" || Math.abs(cell.height) > 0.28) {
    return 0;
  }

  const oceanFraction = renderCellOceanFraction(cell);
  if (oceanFraction < 0.72) {
    return 0;
  }

  const cloud = cloudWeatherForRenderCell(cell);
  if (cloud < 0.42) {
    return 0;
  }

  const modelDay = state.day + state.turn / TURNS_PER_DAY;
  const dayBucket = Math.floor(modelDay / 4);
  const intermittent = seededNoise(cell.id, 1301 + dayBucket);
  if (intermittent < 0.46) {
    return 0;
  }

  const tropicalMask = Math.exp(-0.5 * (cell.height / 0.18) ** 2);
  const organization = earthCloudCoherentNoise(cell, modelDay * 0.36 + 7.4, 211);
  return cloud * tropicalMask * oceanFraction * (0.68 + organization * 0.3 + intermittent * 0.18);
}

function renderCellOceanFraction(cell) {
  if (!isRenderLodActive()) {
    return state.terrain[cell.id] === "water" ? 1 : 0;
  }

  const childIds = renderCellChildIds[cell.id] ?? [];
  if (childIds.length === 0) {
    return 0;
  }

  let waterCount = 0;
  for (let index = 0; index < childIds.length; index += 1) {
    if (state.terrain[childIds[index]] === "water") {
      waterCount += 1;
    }
  }
  return waterCount / childIds.length;
}

function isNearCloudCell(cell, selectedCells, minimumAngle) {
  const minDot = Math.cos(minimumAngle);
  return selectedCells.some((selectedCell) => cellNormalDot(selectedCell, cell) > minDot);
}

function earthCloudVisualScoreForRenderCell(cell) {
  const cloud = cloudWeatherForRenderCell(cell);
  const polarStratus = smoothLimit(Math.abs(cell.height), 0.72, 0.96);
  return cloud * (1 - 0.58 * polarStratus);
}

function selectSeparatedCloudCells(cells, limit, minimumAngle, scoreFn) {
  const minDot = Math.cos(minimumAngle);
  const selected = [];
  const candidates = [...cells].sort((a, b) => scoreFn(b) - scoreFn(a));

  for (const cell of candidates) {
    if (selected.length >= limit) {
      break;
    }
    if (selected.some((selectedCell) => cellNormalDot(selectedCell, cell) > minDot)) {
      continue;
    }
    selected.push(cell);
  }

  return selected;
}

function addCloudPatch(cell, rain, isTropical, isStrongTropical = false) {
  const normal = vectorForCell(cell);
  const cloud = new THREE.Mesh(cloudPatchGeometry, isTropical ? tropicalCloudPatchMaterial : cloudPatchMaterial);
  const size = tileSize(cell, renderTopology) * (
    isTropical
      ? (isStrongTropical ? 1.05 : 0.72) + Math.min(isStrongTropical ? 1.45 : 0.95, rain * (isStrongTropical ? 0.34 : 0.22))
      : 0.9 + Math.min(1.4, rain * 0.18)
  );
  cloud.position
    .copy(normal)
    .multiplyScalar(isTropical ? 1.18 + Math.min(0.055, rain * 0.003) : 1.155 + Math.min(0.035, rain * 0.002));
  cloud.quaternion.setFromUnitVectors(unitZ, normal);
  cloud.scale.set(size * (isTropical ? (isStrongTropical ? 1.08 : 0.92) : 1.35), size * (isTropical ? 0.88 : 0.74), 1);
  weatherGroup.add(cloud);

  if (!isTropical) {
    return;
  }

  const { tangentA, tangentB } = tangentFrame(normal);
  const coreCount = isStrongTropical ? 5 : 3;
  for (let index = 0; index < coreCount; index += 1) {
    const angle = (Math.PI * 2 * index) / coreCount + seededNoise(cell.id, 800 + index) * 0.55;
    const offset = Math.cos(angle) * size * (isStrongTropical ? 0.15 : 0.2);
    const crossOffset = Math.sin(angle) * size * (isStrongTropical ? 0.12 : 0.16);
    const core = new THREE.Mesh(cloudPatchGeometry, tropicalCloudCoreMaterial);
    core.position
      .copy(normal)
      .multiplyScalar(1.184 + Math.min(isStrongTropical ? 0.065 : 0.05, rain * 0.0028))
      .addScaledVector(tangentA, offset)
      .addScaledVector(tangentB, crossOffset);
    core.quaternion.setFromUnitVectors(unitZ, normal);
    const coreSize = size * ((isStrongTropical ? 0.5 : 0.42) + seededNoise(cell.id, 820 + index) * (isStrongTropical ? 0.26 : 0.2));
    core.scale.set(coreSize, coreSize * 0.86, 1);
    weatherGroup.add(core);
  }
}

function addCycloneCloudPatch(cell, cloudStrength) {
  const normal = vectorForCell(cell);
  const strength = clamp01(cloudStrength);
  const size = tileSize(cell, renderTopology) * (1.08 + strength * 1.35);
  const baseRadius = 1.192 + Math.min(0.052, strength * 0.034);
  const base = new THREE.Mesh(cloudPatchGeometry, tropicalCloudPatchMaterial);
  base.position.copy(normal).multiplyScalar(baseRadius);
  base.quaternion.setFromUnitVectors(unitZ, normal);
  base.scale.set(size * 1.24, size * 1.0, 1);
  weatherGroup.add(base);

  const spin = seededNoise(cell.id, 1431 + Math.floor((state.day + state.turn / TURNS_PER_DAY) / 4)) * Math.PI * 2;
  for (let index = 0; index < 3; index += 1) {
    const arm = new THREE.Line(cycloneCloudArmGeometry, cycloneCloudArmMaterial);
    arm.position.copy(normal).multiplyScalar(baseRadius + 0.006 + index * 0.0015);
    arm.quaternion.setFromUnitVectors(unitZ, normal);
    arm.rotateZ(spin + (Math.PI * 2 * index) / 3);
    const armScale = size * (0.86 + index * 0.07);
    arm.scale.set(armScale, armScale, 1);
    weatherGroup.add(arm);
  }

  const eye = new THREE.Mesh(cloudPatchGeometry, cycloneCloudEyeMaterial);
  eye.position.copy(normal).multiplyScalar(baseRadius + 0.012);
  eye.quaternion.setFromUnitVectors(unitZ, normal);
  eye.scale.set(size * 0.13, size * 0.13, 1);
  weatherGroup.add(eye);
}

function updateTerminatorOverlay() {
  terminatorGroup.clear();
  const axisA = Math.abs(sunDirection.z) > 0.86 ? unitY.clone() : unitZ.clone();
  const tangentA = new THREE.Vector3().crossVectors(sunDirection, axisA).normalize();
  const tangentB = new THREE.Vector3().crossVectors(sunDirection, tangentA).normalize();
  const points = [];
  const steps = 144;

  for (let index = 0; index <= steps; index += 1) {
    const angle = (Math.PI * 2 * index) / steps;
    const point = tangentA.clone().multiplyScalar(Math.cos(angle))
      .add(tangentB.clone().multiplyScalar(Math.sin(angle)))
      .multiplyScalar(1.071);
    points.push(point.x, point.y, point.z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  terminatorGroup.add(new THREE.Line(geometry, terminatorMaterial));
}

function onWebglContextLost(event) {
  event.preventDefault();
  webglContextLost = true;
}

function onWebglContextRestored() {
  webglContextLost = false;
  buildBoard();
  resize();
  refresh();
}

function buildBoundaries() {
  boundaryGroup.clear();
  if (!cellBoundaryPoints) {
    cellBoundaryPoints = buildCellBoundaryPoints(renderTopology);
  }

  const positions = [];

  for (const cell of renderTopology.cells) {
    const boundaryPoints = cellBoundaryPoints.get(cell.id);
    for (let index = 0; index < boundaryPoints.length; index += 1) {
      const start = boundaryPoints[index].clone().multiplyScalar(1.032);
      const end = boundaryPoints[(index + 1) % boundaryPoints.length].clone().multiplyScalar(1.032);
      positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0xd7cda8,
    transparent: true,
    opacity: 0.22
  });
  boundaryGroup.add(new THREE.LineSegments(geometry, material));
}

function cellSurfaceSteps(sourceTopology = topology) {
  if (sourceTopology.nside >= FULL_DETAIL_RENDER_MIN_NSIDE) {
    return 1;
  }

  if (sourceTopology.nside <= 2) {
    return 8;
  }

  if (sourceTopology.nside <= 4) {
    return 5;
  }

  if (sourceTopology.nside <= 8) {
    return 3;
  }

  return 2;
}

function createCellGeometry(cell, radius, sourceTopology = topology) {
  const steps = cellSurfaceSteps(sourceTopology);
  const vertices = [];
  const positions = [];
  const normals = [];
  const cellCenter = projectedCellPoint(cell, cell.ix + 0.5, cell.iy + 0.5, sourceTopology);
  const triangleNormal = new THREE.Vector3();

  for (let y = 0; y <= steps; y += 1) {
    const row = [];
    for (let x = 0; x <= steps; x += 1) {
      row.push(projectedCellPoint(
        cell,
        cell.ix + x / steps,
        cell.iy + y / steps,
        sourceTopology
      ));
    }
    vertices.push(row);
  }

  for (let y = 0; y < steps; y += 1) {
    for (let x = 0; x < steps; x += 1) {
      pushSurfaceTriangle(positions, normals, triangleNormal, cellCenter, radius, [
        vertices[y][x],
        vertices[y][x + 1],
        vertices[y + 1][x + 1]
      ]);
      pushSurfaceTriangle(positions, normals, triangleNormal, cellCenter, radius, [
        vertices[y][x],
        vertices[y + 1][x + 1],
        vertices[y + 1][x]
      ]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

function pushSurfaceTriangle(positions, normals, triangleNormal, cellCenter, radius, triangle) {
  triangleNormal
    .copy(surfaceEdgeA.subVectors(triangle[1], triangle[0]))
    .cross(surfaceEdgeB.subVectors(triangle[2], triangle[0]));
  const ordered = triangleNormal.dot(cellCenter) >= 0
    ? triangle
    : [triangle[0], triangle[2], triangle[1]];

  for (const point of ordered) {
    positions.push(point.x * radius, point.y * radius, point.z * radius);
    normals.push(point.x, point.y, point.z);
  }
}

function buildCellBoundaryPoints(sourceTopology = topology) {
  const pointsByCell = new Map();
  for (const cell of sourceTopology.cells) {
    pointsByCell.set(cell.id, cellBoundaryPointsForCell(cell, sourceTopology));
  }

  return pointsByCell;
}

function cellBoundaryPointsForCell(cell, sourceTopology = topology) {
  const corners = [
    { u: cell.ix + 1, v: cell.iy + 1 },
    { u: cell.ix + 1, v: cell.iy },
    { u: cell.ix, v: cell.iy },
    { u: cell.ix, v: cell.iy + 1 }
  ];
  const points = [];

  for (let side = 0; side < corners.length; side += 1) {
    const start = corners[side];
    const end = corners[(side + 1) % corners.length];
    for (let step = 0; step < CELL_EDGE_STEPS; step += 1) {
      const t = step / CELL_EDGE_STEPS;
      points.push(projectedCellPoint(
        cell,
        THREE.MathUtils.lerp(start.u, end.u, t),
        THREE.MathUtils.lerp(start.v, end.v, t),
        sourceTopology
      ));
    }
  }

  return points;
}

function projectedCellPoint(cell, u, v, sourceTopology = topology) {
  const nside = sourceTopology.nside;
  const boundaryRing = FACE_RING_ANCHORS[cell.face] * nside - u - v;
  const projectedRaw = FACE_PHI_ANCHORS[cell.face] * nside - u + v + 1;
  const phiRaw = projectedRawToPhiRaw(projectedRaw, boundaryRing, nside);
  const height = boundaryRingHeight(boundaryRing, nside);
  const phi = ((phiRaw - 1) * Math.PI) / (4 * nside);
  const horizontalRadius = Math.sqrt(Math.max(0, 1 - height * height));

  return vectorForNormal([
    Math.cos(phi) * horizontalRadius,
    height,
    Math.sin(phi) * horizontalRadius
  ]);
}

function projectedRawToPhiRaw(projectedRaw, boundaryRing, nside) {
  if (boundaryRing <= 0 || boundaryRing >= 4 * nside) {
    return projectedRaw;
  }

  if (boundaryRing < nside) {
    const anchor = nearestPolarAnchor(projectedRaw, nside);
    return anchor + (projectedRaw - anchor) * (nside / boundaryRing);
  }

  if (boundaryRing > 3 * nside) {
    const anchor = nearestPolarAnchor(projectedRaw, nside);
    return anchor + (projectedRaw - anchor) * (nside / (4 * nside - boundaryRing));
  }

  return projectedRaw;
}

function nearestPolarAnchor(projectedRaw, nside) {
  const period = 8 * nside;
  const anchors = [nside + 1, 3 * nside + 1, 5 * nside + 1, 7 * nside + 1];
  let best = anchors[0];
  let bestDistance = Infinity;

  for (const anchor of anchors) {
    const wrappedAnchor = anchor + Math.round((projectedRaw - anchor) / period) * period;
    const distance = Math.abs(projectedRaw - wrappedAnchor);
    if (distance < bestDistance) {
      best = wrappedAnchor;
      bestDistance = distance;
    }
  }

  return best;
}

function boundaryRingHeight(boundaryRing, nside) {
  if (boundaryRing <= 0) {
    return 1;
  }

  if (boundaryRing >= 4 * nside) {
    return -1;
  }

  if (boundaryRing < nside) {
    return 1 - (boundaryRing * boundaryRing) / (3 * nside * nside);
  }

  if (boundaryRing <= 3 * nside) {
    return ((2 * nside - boundaryRing) * 2) / (3 * nside);
  }

  const mirror = 4 * nside - boundaryRing;
  return -1 + (mirror * mirror) / (3 * nside * nside);
}

function buildNet() {
  netCellByGrid.clear();
  netDrawCells = [];

  for (let ring = 1; ring <= renderTopology.maxRing; ring += 1) {
    const ids = renderTopology.rings.get(ring);
    if (!ids) {
      continue;
    }
    for (const cellId of ids) {
      const cell = renderTopology.cells[cellId];
      netDrawCells.push(cell);
      netCellByGrid.set(netGridKey(cell.gridJp, cell.gridJr), cell.id);
    }
  }

  netBoard.onpointermove = onNetPointerMove;
  netBoard.onpointerleave = onNetPointerLeave;
  netBoard.onclick = onNetClick;
  netCanvasSizeDirty = true;
  netBaseDirty = true;
  resizeNetCanvas();
}

function netCellIdFromEvent(event) {
  const bounds = netBoard.getBoundingClientRect();
  const logicalX = (event.clientX - bounds.left - netTransform.offsetX) / netTransform.scale + netTransform.minX;
  const logicalY = (event.clientY - bounds.top - netTransform.offsetY) / netTransform.scale + netTransform.minY;
  const gridX = Math.round(logicalX);
  const gridY = Math.round(logicalY);
  const renderCellId = netCellByGrid.get(netGridKey(gridX, gridY));
  if (renderCellId === undefined) {
    return null;
  }

  const dx = Math.abs(logicalX - gridX);
  const dy = Math.abs(logicalY - gridY);
  return dx + dy <= NET_CELL_PICK_RADIUS ? simulationCellIdForRenderCellId(renderCellId) : null;
}

function netGridKey(x, y) {
  return x * NET_GRID_KEY_STRIDE + y;
}

function onNetPointerMove(event) {
  if (locatorLocked) {
    return;
  }

  const cellId = netCellIdFromEvent(event);
  if (cellId === null || cellId === hoveredCellId) {
    return;
  }

  hoveredCellId = cellId;
  focusCellId = cellId;
  queueLightRefresh();
}

function onNetPointerLeave() {
  if (locatorLocked) {
    return;
  }

  if (hoveredCellId === null) {
    return;
  }

  hoveredCellId = null;
  queueLightRefresh();
}

function onNetClick(event) {
  const cellId = netCellIdFromEvent(event);
  if (cellId === null) {
    return;
  }

  focusCellId = cellId;
  nudgeCameraTowardCell(cellId);
  handleCellClick(cellId);
}

function rebuildMarkers() {
  markerGroup.clear();
  locatorGroup.clear();
  const hideObjects = shouldHideAllObjectMarkers();
  const showPlantObjectMarkers = !hideObjects && !shouldHidePlantObjectMarkers();
  if (showPlantObjectMarkers) {
    for (const cell of visibleMarkerCells()) {
      const normal = vectorForCell(cell);
      if (state.baobab[cell.id] > 0.08) {
        addBaobabMarker(cell, normal);
      }
      if (cell.id !== state.roseCell && shouldShowRosePatchMarker(cell.id)) {
        addRosePatchMarker(cell, normal);
      }
    }
  }

  if (!hideObjects) {
    for (const cell of visibleBurningMarkerCells()) {
      addBurningMarker(cell, vectorForCell(cell));
    }

    if (state.planetPreset === "earth") {
      addEarthLandmarkMarkers();
      addSheepMarkers();
    } else {
      addPrinceHouseMarker();
    }

    if (showPlantObjectMarkers) {
      addRoseMarker();
    }
  }

  const locator = new THREE.Mesh(locatorGeometry, locatorMaterial);
  locator.userData.locator = true;
  locatorGroup.add(locator);
}

function visibleMarkerCells() {
  let baseCells;
  if (!isRenderLodActive()) {
    baseCells = topology.cells;
  } else {
    if (!shouldShowLocalObjectMarkers()) {
      return [];
    }

    const cells = [];
    const seen = new Set();
    const cellIds = fineDetailSimulationCellIds();
    for (let index = 0; index < cellIds.length; index += 1) {
      const cellId = cellIds[index];
      if (seen.has(cellId)) {
        continue;
      }
      const cell = topology.cells[cellId];
      if (!cell) {
        continue;
      }
      seen.add(cellId);
      cells.push(cell);
    }
    baseCells = cells;
  }

  const limit = objectMarkerLimit();
  if (!Number.isFinite(limit) || baseCells.length <= limit) {
    return baseCells;
  }

  const ranked = [];
  for (const cell of baseCells) {
    const score = objectMarkerScore(cell.id);
    if (score <= 0) {
      continue;
    }
    ranked.push({ cell, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.cell.id - b.cell.id);
  return ranked.slice(0, limit).map((entry) => entry.cell);
}

function shouldHidePlantObjectMarkers() {
  return topology.nside >= 128;
}

function shouldHideAllObjectMarkers() {
  return topology.nside >= FULL_DETAIL_RENDER_MIN_NSIDE;
}

function shouldShowLocalObjectMarkers() {
  return isLocalDetailEnabled() &&
    isRenderLodActive() &&
    camera.position.distanceTo(controls.target) <= LOD_OBJECT_CAMERA_DISTANCE;
}

function objectMarkerLimit() {
  return Infinity;
}

function objectMarkerScore(cellId) {
  const baobab = state.baobab[cellId] ?? 0;
  const baobabHeight = state.baobabHeight?.[cellId] ?? 0;
  const roseAmount = state.flower[cellId] ?? 0;
  const roseHeight = state.roseHeight?.[cellId] ?? 0;
  const burning = state.burning?.[cellId] ?? 0;
  const baobabScore = baobab > 0.08 ? baobab * 1.25 + baobabHeight * 0.45 : 0;
  const roseScore = cellId !== state.roseCell && shouldShowRosePatchMarker(cellId)
    ? Math.max(roseAmount, roseHeight) * (state.planetPreset === "earth" ? 0.72 : 1)
    : 0;
  const burningScore = burning > BURNING_MARKER_THRESHOLD ? 1.8 + burning : 0;
  let score = Math.max(baobabScore, roseScore, burningScore);
  if (score <= 0) {
    return 0;
  }

  if (cellId === state.selectedCell || cellId === focusCellId || cellId === hoveredCellId) {
    score += 2;
  }
  return score;
}

function visibleBurningMarkerCells() {
  const burning = state.burning;
  if (!burning) {
    return [];
  }

  const baseCells = isRenderLodActive()
    ? fineDetailSimulationCellIds().map((cellId) => topology.cells[cellId]).filter(Boolean)
    : topology.cells;
  const cells = [];
  const seen = new Set();
  for (const cell of baseCells) {
    if (seen.has(cell.id) || burning[cell.id] <= BURNING_MARKER_THRESHOLD) {
      continue;
    }
    seen.add(cell.id);
    cells.push(cell);
  }
  cells.sort((a, b) => (burning[b.id] ?? 0) - (burning[a.id] ?? 0) || a.id - b.id);
  return cells.slice(0, 128);
}

function shouldShowRosePatchMarker(cellId) {
  const roseAmount = state.flower[cellId] ?? 0;
  const roseHeight = state.roseHeight?.[cellId] ?? 0;
  if (Math.max(roseAmount, roseHeight) <= ROSE_PATCH_MARKER_THRESHOLD) {
    return false;
  }

  return state.planetPreset === "earth" || state.roseFertility[cellId] > 0.68 || roseAmount > 0.28;
}

function tangentFrame(normal) {
  const seed = Math.abs(normal.z) > 0.82 ? unitY : unitZ;
  const tangentA = new THREE.Vector3().crossVectors(normal, seed).normalize();
  const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();
  return { tangentA, tangentB };
}

function tangentSouthDirection(normal) {
  const north = unitZ.clone().addScaledVector(normal, -unitZ.dot(normal));
  if (north.lengthSq() < 1e-5) {
    return tangentFrame(normal).tangentB.multiplyScalar(-1);
  }
  return north.normalize().multiplyScalar(-1);
}

function addEarthLandmarkMarkers() {
  if (state.crashCell !== null && state.crashCell !== undefined) {
    const cell = topology.cells[state.crashCell];
    if (cell) {
      addCrashedPlaneMarker(cell);
    }
  }
  if (state.wellCell !== null && state.wellCell !== undefined) {
    const cell = topology.cells[state.wellCell];
    if (cell) {
      addWellMarker(cell);
    }
  }
}

function princeHouseCellId() {
  if (state.planetPreset === "earth") {
    return null;
  }

  const roseCell = topology.cells[state.roseCell];
  if (!roseCell) {
    return null;
  }

  const candidates = [];
  let nearestNeighborDistance = Infinity;
  for (const neighborId of neighborsOf(state.roseCell)) {
    const neighbor = topology.cells[neighborId];
    if (!neighbor) {
      continue;
    }
    nearestNeighborDistance = Math.min(
      nearestNeighborDistance,
      Math.acos(THREE.MathUtils.clamp(cellNormalDot(roseCell, neighbor), -1, 1))
    );
  }
  if (!Number.isFinite(nearestNeighborDistance)) {
    nearestNeighborDistance = Math.sqrt((4 * Math.PI) / topology.cells.length);
  }
  const distanceFactor =
    topology.nside <= 2 ? 1.05 :
      topology.nside <= 4 ? 2.1 :
        topology.nside <= 8 ? 2.9 :
          topology.nside <= 16 ? 3.7 :
            5.4;
  const minDistanceFactor =
    topology.nside <= 2 ? 0.2 :
      topology.nside <= 4 ? 1.2 :
        topology.nside <= 8 ? 1.9 :
          topology.nside <= 16 ? 2.6 :
            3.8;
  const maxDistanceFactor =
    topology.nside <= 2 ? 1.9 :
      topology.nside <= 4 ? 3.4 :
        topology.nside <= 8 ? 4.9 :
          topology.nside <= 16 ? 6.5 :
            8.8;
  const targetDistance = nearestNeighborDistance * distanceFactor;
  const minimumDistance = nearestNeighborDistance * minDistanceFactor;
  const maximumDistance = nearestNeighborDistance * maxDistanceFactor;
  const maxSearchDepth =
    topology.nside <= 2 ? 1 :
      topology.nside <= 4 ? 3 :
        topology.nside <= 8 ? 5 :
          topology.nside <= 16 ? 6 :
            8;
  const candidateSeen = new Set();

  const addCandidate = (cellId) => {
    if (cellId === state.roseCell || candidateSeen.has(cellId)) {
      return;
    }
    candidateSeen.add(cellId);
    const cell = topology.cells[cellId];
    if (!cell || state.terrain[cellId] === "water" || state.terrain[cellId] === "volcano" || state.terrain[cellId] === "crack") {
      return;
    }
    const dot = cellNormalDot(roseCell, cell);
    const distance = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
    if (distance < minimumDistance || distance > maximumDistance) {
      return;
    }
    const gardenPenalty = state.roseGardenMask?.[cellId] === 1 ? 0.34 : 0;
    const pathBonus = state.terrain[cellId] === "path" ? 0.08 : 0;
    const score =
      Math.abs(distance - targetDistance) / Math.max(nearestNeighborDistance, 1e-6) -
      pathBonus +
      gardenPenalty +
      Math.abs(cell.height - roseCell.height) * 0.08 -
      seededNoise(cellId, 881) * 0.08;
    candidates.push({ cellId, score, distance });
  };

  const visited = new Set([state.roseCell]);
  let frontier = [state.roseCell];
  for (let depth = 1; depth <= maxSearchDepth; depth += 1) {
    const nextFrontier = [];
    for (const sourceId of frontier) {
      for (const neighborId of neighborsOf(sourceId)) {
        if (visited.has(neighborId)) {
          continue;
        }
        visited.add(neighborId);
        nextFrontier.push(neighborId);
        addCandidate(neighborId);
      }
    }
    frontier = nextFrontier;
  }

  candidates.sort((a, b) =>
    a.score - b.score ||
    a.distance - b.distance ||
    a.cellId - b.cellId
  );
  return candidates[0]?.cellId ?? neighborsOf(state.roseCell).find((cellId) => {
    const cell = topology.cells[cellId];
    return cell && state.terrain[cellId] !== "water" && state.terrain[cellId] !== "volcano";
  }) ?? null;
}

function addPrinceHouseMarker() {
  const cellId = princeHouseCellId();
  const cell = cellId === null ? null : topology.cells[cellId];
  if (!cell) {
    return;
  }

  const normal = vectorForCell(cell);
  const size = THREE.MathUtils.clamp(tileSize(cell) * 3.15, 0.092, 0.21);
  const forward = tangentSouthDirection(normal);
  const side = new THREE.Vector3().crossVectors(forward, normal).normalize();
  const bodyQuat = tangentBasisQuaternion(side, forward, normal);
  const baseRadius = 1.072;
  const bodyHeight = size * 0.42;
  const roofHeight = size * 0.32;
  const bodyWidth = size * 0.56;
  const bodyDepth = size * 0.46;

  const body = new THREE.Mesh(princeHouseBodyGeometry, princeHouseWallMaterial);
  body.userData.pickCellId = cell.id;
  body.userData.princeHouse = true;
  body.position.copy(normal).multiplyScalar(baseRadius + bodyHeight * 0.5);
  body.quaternion.copy(bodyQuat);
  body.scale.set(bodyWidth, bodyDepth, bodyHeight);
  markerGroup.add(body);

  const roofCenterHeight = baseRadius + bodyHeight + roofHeight * 0.12;
  for (const sideSign of [-1, 1]) {
    const roofPanel = new THREE.Mesh(princeHouseBodyGeometry, princeHouseRoofMaterial);
    roofPanel.userData.pickCellId = cell.id;
    roofPanel.userData.princeHouse = true;
    roofPanel.position.copy(normal).multiplyScalar(roofCenterHeight)
      .addScaledVector(side, sideSign * bodyWidth * 0.17);
    roofPanel.quaternion.copy(bodyQuat);
    roofPanel.rotateY(sideSign * 0.58);
    roofPanel.scale.set(bodyWidth * 0.62, bodyDepth * 1.1, size * 0.045);
    markerGroup.add(roofPanel);
  }

  const ridge = new THREE.Mesh(princeHouseChimneyGeometry, princeHouseTrimMaterial);
  ridge.userData.pickCellId = cell.id;
  ridge.userData.princeHouse = true;
  ridge.position.copy(normal).multiplyScalar(baseRadius + bodyHeight + roofHeight * 0.42);
  ridge.quaternion.setFromUnitVectors(unitY, forward);
  ridge.scale.set(size * 0.022, bodyDepth * 0.58, size * 0.022);
  markerGroup.add(ridge);

  const door = new THREE.Mesh(princeHouseBodyGeometry, princeHouseDoorMaterial);
  door.userData.pickCellId = cell.id;
  door.userData.princeHouse = true;
  door.position.copy(normal).multiplyScalar(baseRadius + bodyHeight * 0.38)
    .addScaledVector(forward, -bodyDepth * 0.515);
  door.quaternion.copy(bodyQuat);
  door.scale.set(bodyWidth * 0.2, bodyDepth * 0.04, bodyHeight * 0.48);
  markerGroup.add(door);

  for (const sideSign of [-1, 1]) {
    const window = new THREE.Mesh(princeHouseBodyGeometry, princeHouseWindowMaterial);
    window.userData.pickCellId = cell.id;
    window.userData.princeHouse = true;
    window.position.copy(normal).multiplyScalar(baseRadius + bodyHeight * 0.58)
      .addScaledVector(forward, -bodyDepth * 0.522)
      .addScaledVector(side, sideSign * bodyWidth * 0.26);
    window.quaternion.copy(bodyQuat);
    window.scale.set(bodyWidth * 0.13, bodyDepth * 0.035, bodyHeight * 0.18);
    markerGroup.add(window);
  }

  for (const sideSign of [-1, 1]) {
    const sideWindow = new THREE.Mesh(princeHouseBodyGeometry, princeHouseWindowMaterial);
    sideWindow.userData.pickCellId = cell.id;
    sideWindow.userData.princeHouse = true;
    sideWindow.position.copy(normal).multiplyScalar(baseRadius + bodyHeight * 0.58)
      .addScaledVector(side, sideSign * bodyWidth * 0.522)
      .addScaledVector(forward, bodyDepth * 0.05);
    sideWindow.quaternion.copy(bodyQuat);
    sideWindow.scale.set(bodyWidth * 0.035, bodyDepth * 0.16, bodyHeight * 0.17);
    markerGroup.add(sideWindow);
  }

  const step = new THREE.Mesh(princeHouseBodyGeometry, princeHouseTrimMaterial);
  step.userData.pickCellId = cell.id;
  step.userData.princeHouse = true;
  step.position.copy(normal).multiplyScalar(baseRadius + bodyHeight * 0.08)
    .addScaledVector(forward, -bodyDepth * 0.68);
  step.quaternion.copy(bodyQuat);
  step.scale.set(bodyWidth * 0.38, bodyDepth * 0.16, bodyHeight * 0.08);
  markerGroup.add(step);

  const chimney = new THREE.Mesh(princeHouseChimneyGeometry, princeHouseChimneyMaterial);
  chimney.userData.pickCellId = cell.id;
  chimney.userData.princeHouse = true;
  chimney.position.copy(normal).multiplyScalar(baseRadius + bodyHeight + roofHeight * 0.68)
    .addScaledVector(side, bodyWidth * 0.2)
    .addScaledVector(forward, bodyDepth * 0.08);
  chimney.quaternion.setFromUnitVectors(unitY, normal);
  chimney.scale.set(size * 0.035, size * 0.18, size * 0.035);
  markerGroup.add(chimney);
}

function tangentBasisQuaternion(side, forward, normal) {
  const basis = new THREE.Matrix4().makeBasis(side, forward, normal);
  return new THREE.Quaternion().setFromRotationMatrix(basis);
}

function addCrashedPlaneMarker(cell) {
  const normal = vectorForCell(cell);
  const size = THREE.MathUtils.clamp(tileSize(cell) * 3.25, 0.13, 0.26);
  const { tangentA, tangentB } = tangentFrame(normal);
  const angle = 0.72 + seededNoise(cell.id, 641) * 0.38;
  const forward = tangentA.clone().multiplyScalar(Math.cos(angle)).addScaledVector(tangentB, Math.sin(angle)).normalize();
  const side = new THREE.Vector3().crossVectors(forward, normal).normalize();
  const boxQuat = tangentBasisQuaternion(side, forward, normal);
  const base = normal.clone().multiplyScalar(1.066);

  const fuselage = new THREE.Mesh(planeFuselageGeometry, planeBodyMaterial);
  fuselage.userData.pickCellId = cell.id;
  fuselage.position.copy(base).addScaledVector(forward, size * 0.03);
  fuselage.quaternion.setFromUnitVectors(unitY, forward);
  fuselage.scale.set(size * 0.055, size * 0.62, size * 0.055);
  markerGroup.add(fuselage);

  const wing = new THREE.Mesh(planeWingGeometry, planeBodyMaterial);
  wing.userData.pickCellId = cell.id;
  wing.position.copy(base)
    .addScaledVector(normal, size * 0.006)
    .addScaledVector(forward, -size * 0.025)
    .addScaledVector(side, -size * 0.14);
  wing.quaternion.copy(boxQuat);
  wing.scale.set(size * 0.35, size * 0.11, size * 0.024);
  markerGroup.add(wing);

  const brokenWing = new THREE.Mesh(planeWingGeometry, planeBodyMaterial);
  brokenWing.userData.pickCellId = cell.id;
  brokenWing.position.copy(base)
    .addScaledVector(normal, size * 0.012)
    .addScaledVector(forward, size * 0.08)
    .addScaledVector(side, size * 0.3);
  brokenWing.quaternion.copy(boxQuat);
  brokenWing.rotateZ(0.52);
  brokenWing.scale.set(size * 0.32, size * 0.09, size * 0.022);
  markerGroup.add(brokenWing);

  const tail = new THREE.Mesh(planeWingGeometry, planeBodyMaterial);
  tail.userData.pickCellId = cell.id;
  tail.position.copy(base).addScaledVector(normal, size * 0.04).addScaledVector(forward, -size * 0.32);
  tail.quaternion.copy(boxQuat);
  tail.scale.set(size * 0.18, size * 0.08, size * 0.13);
  markerGroup.add(tail);
}

function addWellMarker(cell) {
  const normal = vectorForCell(cell);
  const size = THREE.MathUtils.clamp(tileSize(cell) * 1.9, 0.065, 0.15);
  const base = normal.clone().multiplyScalar(1.063);
  const wallHeight = size * 0.22;

  const wall = new THREE.Mesh(wellWallGeometry, wellStoneMaterial);
  wall.userData.pickCellId = cell.id;
  wall.position.copy(base).addScaledVector(normal, wallHeight * 0.5);
  wall.quaternion.setFromUnitVectors(unitY, normal);
  wall.scale.set(size * 0.18, wallHeight, size * 0.18);
  markerGroup.add(wall);

  const rim = new THREE.Mesh(wellRimGeometry, wellStoneMaterial);
  rim.userData.pickCellId = cell.id;
  rim.position.copy(base).addScaledVector(normal, wallHeight + size * 0.018);
  rim.quaternion.setFromUnitVectors(unitZ, normal);
  rim.scale.setScalar(size * 0.18);
  markerGroup.add(rim);

  const dark = new THREE.Mesh(volcanoSummitCapGeometry, wellDarkMaterial);
  dark.userData.pickCellId = cell.id;
  dark.position.copy(base).addScaledVector(normal, wallHeight + size * 0.006);
  dark.quaternion.setFromUnitVectors(unitY, normal);
  dark.scale.set(size * 0.125, size * 0.012, size * 0.125);
  markerGroup.add(dark);
}

function addSheepMarkers() {
  if (state.planetPreset !== "earth" || !Array.isArray(state.sheep)) {
    return;
  }

  for (const sheep of state.sheep) {
    addSheepMarker(sheep);
  }
}

function addSheepMarker(sheep) {
  const cell = topology.cells[sheep.cellId];
  if (!cell) {
    return;
  }

  const normal = new THREE.Vector3(sheep.x, sheep.y, sheep.z);
  if (normal.lengthSq() <= 0) {
    normal.copy(vectorForCell(cell));
  } else {
    normal.normalize();
  }

  const size = THREE.MathUtils.clamp(tileSize(cell) * 1.55, 0.035, 0.075);
  const { tangentA, tangentB } = tangentFrame(normal);
  const headingAngle = (sheep.heading ?? seededNoise(sheep.id ?? cell.id, 733) * Math.PI * 2);
  const forward = tangentA.clone().multiplyScalar(Math.cos(headingAngle)).addScaledVector(tangentB, Math.sin(headingAngle)).normalize();
  const side = new THREE.Vector3().crossVectors(forward, normal).normalize();
  const quat = tangentBasisQuaternion(side, forward, normal);
  const base = normal.clone().multiplyScalar(1.082);

  const body = new THREE.Mesh(sheepBodyGeometry, sheepWoolMaterial);
  body.userData.pickCellId = cell.id;
  body.position.copy(base).addScaledVector(normal, size * 0.22);
  body.quaternion.copy(quat);
  body.scale.set(size * 0.34, size * 0.22, size * 0.24);
  markerGroup.add(body);

  const head = new THREE.Mesh(sheepHeadGeometry, sheepFaceMaterial);
  head.userData.pickCellId = cell.id;
  head.position.copy(base)
    .addScaledVector(normal, size * 0.24)
    .addScaledVector(forward, size * 0.28);
  head.scale.set(size * 0.12, size * 0.1, size * 0.12);
  markerGroup.add(head);

  for (const forwardSign of [-1, 1]) {
    for (const sideSign of [-1, 1]) {
      const leg = new THREE.Mesh(sheepLegGeometry, sheepFaceMaterial);
      leg.userData.pickCellId = cell.id;
      leg.position.copy(base)
        .addScaledVector(forward, forwardSign * size * 0.12)
        .addScaledVector(side, sideSign * size * 0.12)
        .addScaledVector(normal, size * 0.04);
      leg.quaternion.setFromUnitVectors(unitY, normal);
      leg.scale.set(size * 0.025, size * 0.16, size * 0.025);
      markerGroup.add(leg);
    }
  }
}

function addBaobabMarker(cell, normal) {
  const value = state.baobab[cell.id];
  const size = baobabIconSize(cell, value);
  const heightNorm = Math.max(0.08, state.baobabHeight[cell.id]);
  const { tangentA, tangentB } = tangentFrame(normal);

  if (value < 0.16) {
    const stemHeight = size * 0.36;
    const sprout = new THREE.Mesh(roseStemGeometry, baobabTrunkMaterial);
    sprout.userData.pickCellId = cell.id;
    sprout.position.copy(normal).multiplyScalar(1.052 + stemHeight * 0.5);
    sprout.quaternion.setFromUnitVectors(unitY, normal);
    sprout.scale.set(size * 0.035, stemHeight, size * 0.035);
    markerGroup.add(sprout);
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(baobabLeafGeometry, baobabLeafMaterial);
      leaf.userData.pickCellId = cell.id;
      leaf.position.copy(normal).multiplyScalar(1.052 + stemHeight * 1.02).addScaledVector(tangentA, side * size * 0.08);
      leaf.scale.set(size * 0.085, size * 0.035, size * 0.045);
      markerGroup.add(leaf);
    }
    return;
  }

  if (value < 0.32) {
    const trunkHeight = size * (0.38 + heightNorm * 0.72);
    const trunk = new THREE.Mesh(baobabTrunkGeometry, baobabTrunkMaterial);
    const crown = new THREE.Mesh(baobabCrownGeometry, baobabLeafMaterial);
    trunk.userData.pickCellId = cell.id;
    crown.userData.pickCellId = cell.id;
    trunk.position.copy(normal).multiplyScalar(1.048 + trunkHeight * 0.5);
    trunk.quaternion.setFromUnitVectors(unitY, normal);
    trunk.scale.set(size * 0.055, trunkHeight, size * 0.055);
    crown.position.copy(normal).multiplyScalar(1.048 + trunkHeight + size * 0.13);
    crown.scale.set(size * 0.16, size * 0.13, size * 0.16);
    markerGroup.add(trunk, crown);
    return;
  }

  const trunkHeight = size * (0.56 + heightNorm * 1.36);
  const trunkRadius = size * (0.075 + Math.sqrt(value) * 0.09);
  const crownRadius = size * (0.17 + Math.sqrt(value) * 0.24);
  const trunk = new THREE.Mesh(baobabTrunkGeometry, baobabTrunkMaterial);
  const crown = new THREE.Mesh(baobabCrownGeometry, value > 0.7 ? baobabMaterial : baobabLeafMaterial);
  trunk.userData.pickCellId = cell.id;
  crown.userData.pickCellId = cell.id;
  trunk.position.copy(normal).multiplyScalar(1.045 + trunkHeight * 0.5);
  trunk.quaternion.setFromUnitVectors(unitY, normal);
  trunk.scale.set(trunkRadius, trunkHeight, trunkRadius);
  crown.position.copy(normal).multiplyScalar(1.045 + trunkHeight + crownRadius * 0.42);
  crown.scale.set(crownRadius * 1.08, crownRadius * 0.82, crownRadius * 1.08);
  markerGroup.add(trunk, crown);

  if (value <= 0.7) {
    return;
  }

  for (let index = 0; index < 5; index += 1) {
    const angle = (Math.PI * 2 * index) / 5 + seededNoise(cell.id, 211 + index) * 0.38;
    const direction = tangentA.clone().multiplyScalar(Math.cos(angle)).add(tangentB.clone().multiplyScalar(Math.sin(angle))).normalize();
    const rootLength = size * (0.34 + seededNoise(cell.id, 231 + index) * 0.22);
    const root = new THREE.Mesh(baobabRootGeometry, baobabRootMaterial);
    root.userData.pickCellId = cell.id;
    root.position.copy(normal).multiplyScalar(1.064).addScaledVector(direction, rootLength * 0.32);
    root.quaternion.setFromUnitVectors(unitY, direction);
    root.scale.set(size * 0.035, rootLength, size * 0.035);
    markerGroup.add(root);
  }
}

function fireIconSize(cell, intensity) {
  const raw = rawCellVisualSize(cell);
  const bounds = objectIconClampForResolution(0.04, 0.1, 0.011, 0.034);
  return THREE.MathUtils.clamp(raw * (2.5 + clamp01(intensity) * 1.45), bounds.min, bounds.max);
}

function addBurningMarker(cell, normal) {
  const intensity = clamp01(state.burning?.[cell.id] ?? 0);
  if (intensity <= BURNING_MARKER_THRESHOLD) {
    return;
  }

  const size = fireIconSize(cell, intensity);
  const height = size * (0.74 + intensity * 0.62);
  const { tangentA, tangentB } = tangentFrame(normal);
  const jitterA = (seededNoise(cell.id, 601) - 0.5) * size * 0.12;
  const jitterB = (seededNoise(cell.id, 607) - 0.5) * size * 0.12;
  const base = normal.clone().multiplyScalar(1.092 + height * 0.5)
    .addScaledVector(tangentA, jitterA)
    .addScaledVector(tangentB, jitterB);

  const outer = new THREE.Mesh(flameOuterGeometry, flameOuterMaterial);
  outer.userData.pickCellId = cell.id;
  outer.position.copy(base);
  outer.quaternion.setFromUnitVectors(unitY, normal);
  outer.scale.set(size * 0.18, height, size * 0.18);

  const inner = new THREE.Mesh(flameInnerGeometry, flameInnerMaterial);
  inner.userData.pickCellId = cell.id;
  inner.position.copy(base).addScaledVector(normal, height * 0.06);
  inner.quaternion.copy(outer.quaternion);
  inner.scale.set(size * 0.1, height * 0.72, size * 0.1);
  markerGroup.add(outer, inner);
}

function addRosePatchMarker(cell, normal) {
  const roseAmount = state.flower[cell.id];
  const roseHeight = state.roseHeight?.[cell.id] ?? 0;
  const vigor = clamp01(Math.max(roseAmount, roseHeight));
  const size = rosePatchIconSize(cell, vigor);
  const { tangentA, tangentB } = tangentFrame(normal);
  const stemHeight = size * (0.18 + vigor * 0.18);
  const bloomRadius = size * (0.1 + vigor * 0.08);
  const stem = new THREE.Mesh(roseStemGeometry, roseStemMaterial);
  const bloomCenter = normal.clone().multiplyScalar(1.07 + stemHeight + bloomRadius * 0.24);

  stem.userData.pickCellId = cell.id;
  stem.position.copy(normal).multiplyScalar(1.07 + stemHeight * 0.5);
  stem.quaternion.setFromUnitVectors(unitY, normal);
  stem.scale.set(size * 0.018, stemHeight, size * 0.018);
  markerGroup.add(stem);

  if (vigor < 0.34) {
    const bud = new THREE.Mesh(rosePetalGeometry, roseBloomMaterial);
    bud.userData.pickCellId = cell.id;
    bud.position.copy(bloomCenter);
    bud.scale.set(bloomRadius * 0.42, bloomRadius * 0.3, bloomRadius * 0.42);
    markerGroup.add(bud);
    return;
  }

  const core = new THREE.Mesh(roseBloomGeometry, roseCoreMaterial);
  core.userData.pickCellId = cell.id;
  core.position.copy(bloomCenter).addScaledVector(normal, bloomRadius * 0.08);
  core.scale.setScalar(bloomRadius * 0.18);
  markerGroup.add(core);

  const petalCount = vigor > 0.48 ? 5 : 4;
  for (let index = 0; index < petalCount; index += 1) {
    const angle = (Math.PI * 2 * index) / petalCount + seededNoise(cell.id, 271 + index) * 0.18;
    const petal = new THREE.Mesh(rosePetalGeometry, rosePetalMaterial);
    petal.userData.pickCellId = cell.id;
    petal.position.copy(bloomCenter)
      .addScaledVector(tangentA, Math.cos(angle) * bloomRadius * 0.46)
      .addScaledVector(tangentB, Math.sin(angle) * bloomRadius * 0.46)
      .addScaledVector(normal, bloomRadius * 0.06);
    petal.scale.set(bloomRadius * 0.48, bloomRadius * 0.16, bloomRadius * 0.28);
    markerGroup.add(petal);
  }
}

function addRoseMarker() {
  const cell = topology.cells[state.roseCell];
  const roseAmount = state.flower[state.roseCell] ?? 0;
  const roseHeight = state.roseHeight[state.roseCell] ?? 0;
  if (roseAmount <= ROSE_PATCH_MARKER_THRESHOLD && roseHeight <= ROSE_PATCH_MARKER_THRESHOLD) {
    return;
  }

  const normal = vectorForCell(cell);
  const size = primaryRoseIconSize(cell, Math.max(roseAmount, roseHeight));
  const { tangentA, tangentB } = tangentFrame(normal);
  const vigor = clamp01(Math.max(roseAmount, roseHeight));
  const stemHeight = size * (0.34 + vigor * 0.48);
  const bloomRadius = size * (0.07 + vigor * 0.11);
  const stem = new THREE.Mesh(roseStemGeometry, roseStemMaterial);
  const core = new THREE.Mesh(roseBloomGeometry, roseCoreMaterial);

  stem.userData.pickCellId = cell.id;
  stem.position.copy(normal).multiplyScalar(1.09 + stemHeight * 0.5);
  stem.quaternion.setFromUnitVectors(unitY, normal);
  stem.scale.set(size * 0.045, stemHeight, size * 0.045);
  markerGroup.add(stem);

  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(roseLeafGeometry, roseLeafMaterial);
    leaf.userData.pickCellId = cell.id;
    leaf.position.copy(normal).multiplyScalar(1.09 + stemHeight * 0.46).addScaledVector(tangentA, side * size * 0.09);
    leaf.scale.set(size * 0.11, size * 0.035, size * 0.055);
    markerGroup.add(leaf);
  }

  const bloomCenter = normal.clone().multiplyScalar(1.09 + stemHeight + bloomRadius * 0.55);
  for (let index = 0; index < 5; index += 1) {
    const angle = (Math.PI * 2 * index) / 5;
    const petal = new THREE.Mesh(rosePetalGeometry, rosePetalMaterial);
    petal.userData.pickCellId = cell.id;
    petal.position.copy(bloomCenter)
      .addScaledVector(tangentA, Math.cos(angle) * bloomRadius * 0.62)
      .addScaledVector(tangentB, Math.sin(angle) * bloomRadius * 0.62)
      .addScaledVector(normal, bloomRadius * 0.08);
    petal.scale.set(bloomRadius * 0.72, bloomRadius * 0.34, bloomRadius * 0.48);
    markerGroup.add(petal);
  }

  core.userData.pickCellId = cell.id;
  core.position.copy(bloomCenter).addScaledVector(normal, bloomRadius * 0.12);
  core.scale.setScalar(bloomRadius * 0.48);
  markerGroup.add(core);
}

function refresh(nextMessage = null) {
  const profileSink = activeAsteroidProfileSink();
  const profileStart = profileSink ? performance.now() : 0;
  let profileSectionStart = profileStart;
  const markRefreshProfile = (name) => {
    if (!profileSink || !profileSectionStart) {
      return;
    }
    const now = performance.now();
    addAsteroidProfileTime(profileSink, `refresh:${name}`, now - profileSectionStart);
    profileSectionStart = now;
  };
  viewColorScaleCache.clear();
  markRefreshProfile("clearViewColorScaleCache");
  const fullDataUpdate = netNeedsFullUpdate;
  if (fullDataUpdate) {
    refreshLandInfo();
    markRefreshProfile("refreshLandInfo");
    updateDaylight();
    markRefreshProfile("updateDaylight");
    updateSunlightField();
    markRefreshProfile("updateSunlightField");
    if (shouldUpdateCloudCoverForCurrentView(state)) {
      updateCloudCoverField(state);
    }
    markRefreshProfile("updateCloudCoverField");
    updateSunMarkerPosition();
    markRefreshProfile("updateSunMarkerPosition");
  }
  const text = labels();
  if (fullDataUpdate) {
    updateTileColors(true);
    markRefreshProfile("updateTileColors");
    updateLocalDetailTileColors();
    markRefreshProfile("updateLocalDetailTileColors");
  }
  updateNetCells(text, fullDataUpdate);
  markRefreshProfile("updateNetCells");

  if (fullDataUpdate) {
    rebuildMarkers();
    markRefreshProfile("rebuildMarkers");
    rebuildWeatherOverlay();
    markRefreshProfile("rebuildWeatherOverlay");
    updateTerminatorOverlay();
    markRefreshProfile("updateTerminatorOverlay");
    updateEventLog();
    markRefreshProfile("updateEventLog");
  }
  updateLayerObjectVisibility();
  markRefreshProfile("updateLayerObjectVisibility");
  updateLocatorMarker();
  markRefreshProfile("updateLocatorMarker");
  updateHud();
  markRefreshProfile("updateHud");
  updateColorbarPanel();
  markRefreshProfile("updateColorbarPanel");
  if (nextMessage !== null) {
    message.textContent = nextMessage;
  }
  markRefreshProfile("message");
  invalidateRender(420);
  if (profileSink && profileStart) {
    addAsteroidProfileTime(profileSink, "refresh:total", performance.now() - profileStart);
  }
}

function queueLightRefresh() {
  if (queuedLightRefresh) {
    return;
  }

  queuedLightRefresh = true;
  window.requestAnimationFrame(() => {
    queuedLightRefresh = false;
    refresh();
  });
}

function updateLayerObjectVisibility() {
  const showObjects = viewMode === "landUse";
  markerGroup.visible = showObjects && !shouldHideAllObjectMarkers();
  weatherGroup.visible = showObjects && !shouldHideAllObjectMarkers();
}

function updateNetCells(_text = null, fullDataUpdate = true) {
  if (fullDataUpdate) {
    netBaseDirty = true;
  }
  drawNetBoard();
  netNeedsFullUpdate = false;
  previousNetHoverId = hoveredCellId;
  previousNetFocusId = focusCellId ?? state.selectedCell;
}

function resizeNetCanvas() {
  const bounds = netBoard.getBoundingClientRect();
  const cssWidth = Math.max(1, bounds.width);
  const cssHeight = Math.max(1, bounds.height);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(cssWidth * pixelRatio);
  const height = Math.round(cssHeight * pixelRatio);
  if (netBoard.width !== width || netBoard.height !== height) {
    netBoard.width = width;
    netBoard.height = height;
    netBaseCanvas.width = width;
    netBaseCanvas.height = height;
    netBaseImageData = null;
    netBaseDirty = true;
  }

  netTransform.cssWidth = cssWidth;
  netTransform.cssHeight = cssHeight;
  netTransform.pixelRatio = pixelRatio;
  netTransform.logicalWidth = 8 * renderTopology.nside + 2;
  netTransform.logicalHeight = 4 * renderTopology.nside - 0.7;
  netTransform.scale = Math.min(cssWidth / netTransform.logicalWidth, cssHeight / netTransform.logicalHeight);
  netTransform.offsetX = (cssWidth - netTransform.logicalWidth * netTransform.scale) * 0.5;
  netTransform.offsetY = (cssHeight - netTransform.logicalHeight * netTransform.scale) * 0.5;
  netCanvasSizeDirty = false;
}

function drawNetBoard() {
  if (!netContext || netCollapsed) {
    return;
  }

  if (netCanvasSizeDirty) {
    resizeNetCanvas();
  }
  if (netBaseDirty) {
    drawNetBaseLayer();
  }

  const dpr = netTransform.pixelRatio;
  netContext.setTransform(1, 0, 0, 1, 0, 0);
  netContext.clearRect(0, 0, netBoard.width, netBoard.height);
  netContext.drawImage(netBaseCanvas, 0, 0);
  netContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  netContext.save();
  applyNetLogicalTransform(netContext);
  drawNetOverlay();
  netContext.restore();
}

function drawNetBaseLayer() {
  if (!netBaseContext) {
    return;
  }

  rebuildNetOverlayLists();
  drawNetRasterBaseLayer();
  netBaseDirty = false;
}

function applyNetLogicalTransform(context) {
  context.translate(netTransform.offsetX, netTransform.offsetY);
  context.scale(netTransform.scale, netTransform.scale);
  context.translate(-netTransform.minX, -netTransform.minY);
}

function drawNetPathBaseLayer() {
  const dpr = netTransform.pixelRatio;
  netBaseContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  netBaseContext.clearRect(0, 0, netTransform.cssWidth, netTransform.cssHeight);
  netBaseContext.save();
  applyNetLogicalTransform(netBaseContext);
  for (const cell of netDrawCells) {
    drawNetCellBasePath(cell, netBaseContext);
  }
  netBaseContext.restore();
}

function drawNetRasterBaseLayer() {
  const width = netBaseCanvas.width;
  const height = netBaseCanvas.height;
  if (!netBaseImageData || netBaseImageData.width !== width || netBaseImageData.height !== height) {
    netBaseImageData = netBaseContext.createImageData(width, height);
  }
  const image = netBaseImageData;
  const data = image.data;
  data.fill(0);
  const scale = netTransform.scale * netTransform.pixelRatio;
  const radius = NET_CELL_DRAW_RADIUS * scale;
  const minX = netTransform.minX;
  const minY = netTransform.minY;
  const offsetX = netTransform.offsetX * netTransform.pixelRatio;
  const offsetY = netTransform.offsetY * netTransform.pixelRatio;

  for (const cell of netDrawCells) {
    const color = colorForRenderCellInto(cell, scratchNetColor);
    const red = Math.round(color.r * 255);
    const green = Math.round(color.g * 255);
    const blue = Math.round(color.b * 255);
    const centerX = offsetX + (cell.gridJp - minX) * scale;
    const centerY = offsetY + (cell.gridJr - minY) * scale;
    const left = Math.max(0, Math.floor(centerX - radius));
    const right = Math.min(width - 1, Math.ceil(centerX + radius));
    const top = Math.max(0, Math.floor(centerY - radius));
    const bottom = Math.min(height - 1, Math.ceil(centerY + radius));

    for (let py = top; py <= bottom; py += 1) {
      const dy = Math.abs(py + 0.5 - centerY);
      const maxDx = radius - dy;
      if (maxDx < 0) {
        continue;
      }
      const rowLeft = Math.max(left, Math.floor(centerX - maxDx));
      const rowRight = Math.min(right, Math.ceil(centerX + maxDx));
      for (let px = rowLeft; px <= rowRight; px += 1) {
        const offset = (py * width + px) * 4;
        data[offset] = red;
        data[offset + 1] = green;
        data[offset + 2] = blue;
        data[offset + 3] = 255;
      }
    }
  }

  netBaseContext.setTransform(1, 0, 0, 1, 0, 0);
  netBaseContext.putImageData(image, 0, 0);
}

function rebuildNetOverlayLists() {
  netMarkerCellIds = [];
  netDangerCellIds = [];
  for (const cell of renderTopology.cells) {
    const renderCellId = cell.id;
    if (renderCellMax(renderCellId, state.baobab) > 0.7) {
      netDangerCellIds.push(renderCellId);
    }
    if (
      renderCellContainsSimulationCell(renderCellId, state.roseCell) ||
      renderCellContainsSimulationCell(renderCellId, state.crashCell) ||
      renderCellContainsSimulationCell(renderCellId, state.wellCell) ||
      state.sheep?.some((sheep) => renderCellContainsSimulationCell(renderCellId, sheep.cellId)) ||
      renderCellMax(renderCellId, state.baobab) > 0.08
    ) {
      netMarkerCellIds.push(renderCellId);
    }
  }
}

function drawNetOverlay() {
  const strokeIds = new Set(netDangerCellIds);
  if (hoveredCellId !== null && hoveredCellId !== undefined) {
    strokeIds.add(renderCellIdForSimulationCellId(hoveredCellId));
  }
  const focusedId = focusCellId ?? state.selectedCell;
  if (focusedId !== null && focusedId !== undefined) {
    strokeIds.add(renderCellIdForSimulationCellId(focusedId));
  }

  for (const cellId of strokeIds) {
    drawNetCellStroke(cellId);
  }
  for (const cellId of netMarkerCellIds) {
    drawNetCellMarker(cellId);
  }
}

function drawNetCellBasePath(cell, context) {
  const x = cell.gridJp;
  const y = cell.gridJr;
  const radius = NET_CELL_DRAW_RADIUS;
  const color = colorForRenderCellInto(cell, scratchNetColor);
  context.beginPath();
  context.moveTo(x, y - radius);
  context.lineTo(x + radius, y);
  context.lineTo(x, y + radius);
  context.lineTo(x - radius, y);
  context.closePath();
  context.fillStyle = `#${color.getHexString()}`;
  context.fill();
}

function drawNetCellStroke(renderCellId) {
  const cell = renderTopology.cells[renderCellId];
  if (!cell) {
    return;
  }
  const x = cell.gridJp;
  const y = cell.gridJr;
  const radius = NET_CELL_DRAW_RADIUS;
  const isDanger = renderCellMax(renderCellId, state.baobab) > 0.7;
  netContext.beginPath();
  netContext.moveTo(x, y - radius);
  netContext.lineTo(x + radius, y);
  netContext.lineTo(x, y + radius);
  netContext.lineTo(x - radius, y);
  netContext.closePath();
  netContext.strokeStyle = isDanger ? "rgba(242, 111, 99, 0.95)" : "rgba(255, 239, 154, 0.92)";
  netContext.lineWidth = isDanger ? 0.09 : 0.08;
  netContext.stroke();
}

function drawNetCellMarker(renderCellId) {
  const cell = renderTopology.cells[renderCellId];
  if (!cell) {
    return;
  }
  const x = cell.gridJp;
  const y = cell.gridJr;
  const isRose = renderCellContainsSimulationCell(renderCellId, state.roseCell);
  const isBaobab = renderCellMax(renderCellId, state.baobab) > 0.08;
  const isCrash = renderCellContainsSimulationCell(renderCellId, state.crashCell);
  const isWell = renderCellContainsSimulationCell(renderCellId, state.wellCell);
  const isSheep = state.planetPreset === "earth" &&
    state.sheep?.some((sheep) => renderCellContainsSimulationCell(renderCellId, sheep.cellId));
  if (!isRose && !isCrash && !isWell && !isBaobab && !isSheep) {
    return;
  }

  netContext.beginPath();
  if (isSheep) {
    netContext.ellipse(x, y, 0.21, 0.13, 0, 0, Math.PI * 2);
    netContext.fillStyle = "#f1eadf";
    netContext.strokeStyle = "rgba(25, 22, 18, 0.85)";
  } else if (isCrash) {
    netContext.rect(x - 0.2, y - 0.08, 0.4, 0.16);
    netContext.fillStyle = "#d3d0bf";
    netContext.strokeStyle = "rgba(20, 20, 18, 0.85)";
  } else if (isWell) {
    netContext.arc(x, y, 0.17, 0, Math.PI * 2);
    netContext.fillStyle = "#8b806d";
    netContext.strokeStyle = "rgba(10, 12, 12, 0.9)";
  } else {
    netContext.arc(x, y, 0.18, 0, Math.PI * 2);
  }
  if (isSheep) {
    // Styles are set when the sheep shape is created above.
  } else if (isRose) {
    netContext.fillStyle = "#f05f8f";
    netContext.strokeStyle = "rgba(8, 10, 10, 0.7)";
  } else if (isCrash || isWell) {
    // Styles are set when the landmark shape is created above.
  } else {
    netContext.fillStyle = "#536f35";
    netContext.strokeStyle = "rgba(8, 10, 10, 0.7)";
  }
  netContext.lineWidth = 0.045;
  netContext.fill();
  netContext.stroke();
}

function drawNetCell(cell) {
  const x = cell.gridJp;
  const y = cell.gridJr;
  const radius = NET_CELL_DRAW_RADIUS;
  const color = colorForCellInto(cell, scratchNetColor);
  const isHovered = hoveredCellId === cell.id;
  const isFocused = focusCellId === cell.id || state.selectedCell === cell.id;
  const isBaobab = state.baobab[cell.id] > 0.08;
  const isCrash = state.crashCell === cell.id;
  const isWell = state.wellCell === cell.id;

  netContext.beginPath();
  netContext.moveTo(x, y - radius);
  netContext.lineTo(x + radius, y);
  netContext.lineTo(x, y + radius);
  netContext.lineTo(x - radius, y);
  netContext.closePath();
  netContext.fillStyle = `#${color.getHexString()}`;
  netContext.fill();

  if (state.baobab[cell.id] > 0.7 || isHovered || isFocused) {
    netContext.strokeStyle = state.baobab[cell.id] > 0.7
      ? "rgba(242, 111, 99, 0.95)"
      : "rgba(255, 239, 154, 0.92)";
    netContext.lineWidth = state.baobab[cell.id] > 0.7 ? 0.09 : 0.08;
    netContext.stroke();
  }

  if (state.roseCell === cell.id || isCrash || isWell || isBaobab) {
    netContext.beginPath();
    if (isCrash) {
      netContext.rect(x - 0.2, y - 0.08, 0.4, 0.16);
      netContext.fillStyle = "#d3d0bf";
      netContext.strokeStyle = "rgba(20, 20, 18, 0.85)";
    } else if (isWell) {
      netContext.arc(x, y, 0.17, 0, Math.PI * 2);
      netContext.fillStyle = "#8b806d";
      netContext.strokeStyle = "rgba(10, 12, 12, 0.9)";
    } else {
      netContext.arc(x, y, 0.18, 0, Math.PI * 2);
    }
    if (state.roseCell === cell.id) {
      netContext.fillStyle = "#f05f8f";
      netContext.strokeStyle = "rgba(8, 10, 10, 0.7)";
    } else if (isCrash || isWell) {
      // Styles are set when the landmark shape is created above.
    } else {
      netContext.fillStyle = "#536f35";
      netContext.strokeStyle = "rgba(8, 10, 10, 0.7)";
    }
    netContext.lineWidth = 0.045;
    netContext.fill();
    netContext.stroke();
  }
}

function addEventLogEntry(text) {
  if (!text || !state.events) {
    return;
  }

  const entry = `${formatTurnTime()} ${text}`;
  if (state.events[state.events.length - 1] === entry) {
    return;
  }

  state.events.push(entry);
  if (state.events.length > 6) {
    state.events.splice(0, state.events.length - 6);
  }
}

function updateEventLog() {
  if (!eventLog) {
    return;
  }

  const items = (state.events ?? []).slice(-4);
  eventLog.replaceChildren(...items.map((entry) => {
    const item = document.createElement("li");
    item.textContent = entry;
    return item;
  }));
}

function colorForCell(cell) {
  return colorForCellInto(cell, new THREE.Color());
}

function colorForRenderCellInto(cell, target) {
  if (!isRenderLodActive()) {
    return colorForCellInto(cell, target);
  }

  const childIds = renderCellChildIds[cell.id] ?? [];
  if (childIds.length === 0) {
    return target.copy(colors.sand);
  }

  if (colorForAveragedViewInto(childIds, target)) {
    return target;
  }

  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let index = 0; index < childIds.length; index += 1) {
    const childCell = topology.cells[childIds[index]];
    if (!childCell) {
      continue;
    }
    colorForCellInto(childCell, scratchRenderAggregateColor);
    red += scratchRenderAggregateColor.r;
    green += scratchRenderAggregateColor.g;
    blue += scratchRenderAggregateColor.b;
    count += 1;
  }

  if (count === 0) {
    return target.copy(colors.sand);
  }
  target.setRGB(red / count, green / count, blue / count);
  return applySnowIceSurfaceTintForChildIds(childIds, target);
}

function snowIceNormalizedForCellId(cellId) {
  const amountM = Math.max(0, state.snowIceM?.[cellId] ?? 0);
  if (amountM <= 0) {
    return 0;
  }
  const displayMax = state.terrain?.[cellId] === "water" ? SEA_ICE_DISPLAY_MAX_M : SNOW_ICE_DISPLAY_MAX_M;
  return clamp01(amountM / Math.max(1e-6, displayMax));
}

function snowIceSurfaceBlendForCellId(cellId) {
  const normalized = snowIceNormalizedForCellId(cellId);
  if (normalized <= 0.002) {
    return 0;
  }
  const maximumBlend = state.terrain?.[cellId] === "water" ? 0.86 : 0.78;
  return Math.min(maximumBlend, 0.16 + normalized * 0.72);
}

function applySnowIceSurfaceTintForCellId(cellId, target) {
  const blend = snowIceSurfaceBlendForCellId(cellId);
  if (blend > 0) {
    target.lerp(colors.snowIceSurface, blend);
  }
  return target;
}

function applySnowIceSurfaceTintForChildIds(childIds, target) {
  if (viewMode !== "landUse" || childIds.length === 0) {
    return target;
  }

  let normalizedTotal = 0;
  let count = 0;
  for (let index = 0; index < childIds.length; index += 1) {
    const cellId = childIds[index];
    if (topology.cells[cellId]) {
      normalizedTotal += snowIceNormalizedForCellId(cellId);
      count += 1;
    }
  }
  if (count <= 0) {
    return target;
  }
  const meanNormalized = normalizedTotal / count;
  if (meanNormalized > 0.002) {
    target.lerp(colors.snowIceSurface, Math.min(0.58, meanNormalized * 0.45));
  }
  return target;
}

function colorForCellInto(cell, target) {
  if (viewMode !== "landUse") {
    return colorForViewLayerInto(cell, target);
  }

  target.copy(landColors[state.land[cell.id]] ?? colors[state.terrain[cell.id]] ?? colors.sand);
  const moisture = state.moisture[cell.id];
  const soil = state.soil[cell.id];
  const baobab = state.baobab[cell.id];
  const ash = state.ash[cell.id];
  const flower = state.flower[cell.id];
  const isActiveVolcanoCenter = state.activeVolcanoMask?.[cell.id] === 1;
  const isActiveVolcanoCrater = state.activeVolcanoCraterMask?.[cell.id] === 1;
  const isActiveVolcano = isActiveVolcanoCenter || isActiveVolcanoCrater || state.land[cell.id] === "activeVolcanoLand";
  const isDormantVolcano = state.volcanoMask?.[cell.id] === 1 && !isActiveVolcano;

  if (soil < 0.42 && state.land[cell.id] !== "activeVolcanoLand" && state.land[cell.id] !== "dormantVolcanoLand") {
    target.lerp(colors.poorSoil, Math.min(0.18, (0.42 - soil) * 0.42));
  }
  if (isActiveVolcanoCenter) {
    target.copy(activeVolcanoDarkRockColor).lerp(activeVolcanoGlowColor, 0.72);
  } else if (isActiveVolcanoCrater) {
    target.copy(activeVolcanoDarkRockColor).lerp(activeVolcanoGlowColor, 0.38);
  } else if (isActiveVolcano) {
    target.copy(activeVolcanoDarkRockColor).lerp(activeVolcanoGlowColor, 0.22);
  } else if (isDormantVolcano) {
    target.lerp(dormantVolcanoDarkRockColor, 0.24);
  }
  if (moisture > 0.55) {
    target.lerp(colors.moisture, (moisture - 0.55) * 0.22);
  }
  if (flower > 0.35) {
    target.lerp(colors.flower, (flower - 0.35) * 0.22);
  }
  if (baobab > 0.08) {
    target.lerp(colors.baobab, Math.min(0.24, baobab * 0.28));
  }
  if (ash > 0.025) {
    const ashBlend = isActiveVolcano
      ? Math.min(0.24, ash * 0.55)
      : Math.min(0.46, 0.12 + ash * 1.35);
    target.lerp(colors.ash, ashBlend);
  }
  if (isActiveVolcanoCenter) {
    target.lerp(activeVolcanoGlowColor, 0.72);
  } else if (isActiveVolcanoCrater) {
    target.lerp(activeVolcanoGlowColor, 0.5);
  }
  applySnowIceSurfaceTintForCellId(cell.id, target);

  return target;
}

function colorForAveragedViewInto(childIds, target) {
  if (viewMode === "landUse" || childIds.length === 0) {
    return false;
  }

  if (viewMode === "substrate") {
    const substrate = dominantChildCategory(childIds, (cellId) => state.substrate[cellId]);
    target.copy(substrateColors[substrate] ?? substrateColors.loam);
    return true;
  }

  if (viewMode === "koppen") {
    const koppenClass = dominantChildCategory(childIds, (cellId) => state.koppenClass?.[cellId]);
    target.copy(koppenColors[koppenClass] ?? koppenColors.Ocean);
    return true;
  }

  if (viewMode === "vegetation") {
    const baobab = averageChildScalar(childIds, (cellId) => state.baobab[cellId]);
    const rose = averageChildScalar(childIds, (cellId) => state.flower[cellId]);
    return colorForVegetationComponentsInto(baobab ?? 0, rose ?? 0, target);
  }

  if (viewMode === "seedBank") {
    const baobabSeed = averageChildScalar(childIds, (cellId) => state.baobabSeedBank?.[cellId] ?? 0);
    const roseSeed = averageChildScalar(childIds, (cellId) => state.roseSeedBank?.[cellId] ?? 0);
    return colorForSeedBankComponentsInto(baobabSeed ?? 0, roseSeed ?? 0, target);
  }

  if (viewMode === "height") {
    const baobabHeightMeters = averageChildScalar(childIds, (cellId) => plantHeightMetersForCell(cellId, "baobab"));
    const roseHeightMeters = averageChildScalar(childIds, (cellId) => plantHeightMetersForCell(cellId, "rose"));
    return colorForHeightComponentsInto(baobabHeightMeters ?? 0, roseHeightMeters ?? 0, target);
  }

  const scalar = averageChildScalar(childIds, scalarValueForCurrentViewCell);
  if (scalar === null) {
    return false;
  }
  return colorForScalarViewValueInto(scalar, target);
}

function averageChildScalar(childIds, valueFn) {
  let sum = 0;
  let count = 0;
  for (let index = 0; index < childIds.length; index += 1) {
    const value = valueFn(childIds[index]);
    if (!Number.isFinite(value)) {
      continue;
    }
    sum += value;
    count += 1;
  }
  return count === 0 ? null : sum / count;
}

function dominantChildCategory(childIds, valueFn) {
  const counts = new Map();
  let bestValue = null;
  let bestCount = -1;
  for (let index = 0; index < childIds.length; index += 1) {
    const value = valueFn(childIds[index]);
    if (value === undefined || value === null) {
      continue;
    }
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  }
  return bestValue;
}

function scalarValueForCurrentViewCell(cellId) {
  if (viewMode === "soilNutrient") {
    return state.soilNutrient?.[cellId] ?? state.soil[cellId];
  }
  if (viewMode === "soilCarbon") {
    return state.soilOrganicCarbon?.[cellId] ?? 0;
  }
  if (viewMode === "carbonBudget") {
    return state.netEcosystemProductionGC?.[cellId] ?? 0;
  }
  if (viewMode === "topSoilWater") {
    return state.topSoilWater[cellId];
  }
  if (viewMode === "midSoilWater") {
    return state.midSoilWater?.[cellId] ?? 0;
  }
  if (viewMode === "deepSoilWater") {
    return state.deepSoilWater?.[cellId] ?? 0;
  }
  if (viewMode === "topSoilHead") {
    return state.topSoilHeadNorm?.[cellId] ?? 0;
  }
  if (viewMode === "midSoilHead") {
    return state.midSoilHeadNorm?.[cellId] ?? 0;
  }
  if (viewMode === "deepSoilHead") {
    return state.deepSoilHeadNorm?.[cellId] ?? 0;
  }
  if (viewMode === "topSoilK") {
    return state.topSoilConductivityNorm?.[cellId] ?? 0;
  }
  if (viewMode === "midSoilK") {
    return state.midSoilConductivityNorm?.[cellId] ?? 0;
  }
  if (viewMode === "deepSoilK") {
    return state.deepSoilConductivityNorm?.[cellId] ?? 0;
  }
  if (viewMode === "groundwater") {
    return state.groundwater[cellId];
  }
  if (viewMode === "groundwaterHead") {
    return state.groundwaterHeadNorm?.[cellId] ?? 0;
  }
  if (viewMode === "waterPotential") {
    return state.soilWaterPotential?.[cellId] ?? 0;
  }
  if (viewMode === "rootStress") {
    return 0.5 * (state.rootStressRose?.[cellId] ?? 0) + 0.5 * (state.rootStressBaobab?.[cellId] ?? 0);
  }
  if (viewMode === "waterBudget") {
    return Math.abs(state.hydrologyHorizontalMm?.[cellId] ?? 0) +
      Math.abs(state.hydrologyInfiltrationMm?.[cellId] ?? 0) +
      Math.abs(state.hydrologyPercolation01Mm?.[cellId] ?? 0) +
      Math.abs(state.hydrologyPercolation12Mm?.[cellId] ?? 0) +
      Math.abs(state.hydrologyRechargeMm?.[cellId] ?? 0);
  }
  if (viewMode === "surfaceWater") {
    return state.surfaceWater[cellId];
  }
  if (viewMode === "snowIce") {
    return state.snowIce?.[cellId] ?? 0;
  }
  if (viewMode === "rainfall") {
    return state.rainfall[cellId];
  }
  if (viewMode === "cloudCover") {
    return state.cloudWeather?.[cellId] ?? state.cloudCover?.[cellId] ?? 0;
  }
  if (viewMode === "meanTemp") {
    return state.meanTempC?.[cellId] ?? 0;
  }
  if (viewMode === "sunlight") {
    return state.sunlight[cellId];
  }
  if (viewMode === "leafArea") {
    return (state.laiRose?.[cellId] ?? 0) + (state.laiBaobab?.[cellId] ?? 0);
  }
  if (viewMode === "apar") {
    return state.aparTotal?.[cellId] ?? 0;
  }
  if (viewMode === "elevation") {
    return state.elevation?.[cellId] ?? 0;
  }
  return null;
}

function colorForScalarViewValueInto(value, target) {
  if (viewMode === "soilNutrient") {
    return target.copy(viewScaleColors.nutrientLow).lerp(viewScaleColors.nutrientHigh, clamp01(value));
  }
  if (viewMode === "soilCarbon") {
    return target.copy(viewScaleColors.soilCarbonLow).lerp(viewScaleColors.soilCarbonHigh, clamp01(value));
  }
  if (viewMode === "carbonBudget") {
    const t = clamp01(Math.abs(value) / carbonFluxColorScale());
    return value >= 0
      ? target.copy(viewScaleColors.budgetOk).lerp(viewScaleColors.soilCarbonHigh, t)
      : target.copy(viewScaleColors.budgetOk).lerp(viewScaleColors.budgetBad, t);
  }
  if (viewMode === "topSoilWater" || viewMode === "midSoilWater" || viewMode === "deepSoilWater") {
    return target.copy(viewScaleColors.waterLow).lerp(viewScaleColors.waterHigh, clamp01(value));
  }
  if (viewMode === "topSoilHead" || viewMode === "midSoilHead" || viewMode === "deepSoilHead" || viewMode === "groundwaterHead") {
    return target.copy(viewScaleColors.groundwaterHeadLow).lerp(viewScaleColors.groundwaterHeadHigh, clamp01(value));
  }
  if (viewMode === "topSoilK" || viewMode === "midSoilK" || viewMode === "deepSoilK") {
    return target.copy(viewScaleColors.conductivityLow).lerp(viewScaleColors.conductivityHigh, clamp01(value));
  }
  if (viewMode === "groundwater") {
    return target.copy(viewScaleColors.groundwaterLow).lerp(viewScaleColors.groundwaterHigh, clamp01(value));
  }
  if (viewMode === "waterPotential") {
    return target.copy(viewScaleColors.potentialDry).lerp(viewScaleColors.potentialWet, clamp01(value));
  }
  if (viewMode === "rootStress") {
    return target.copy(viewScaleColors.rootStressLow).lerp(viewScaleColors.rootStressHigh, clamp01(value));
  }
  if (viewMode === "waterBudget") {
    const t = clamp01(Math.log10(1 + value) / Math.log10(18));
    return target.copy(viewScaleColors.budgetOk).lerp(viewScaleColors.waterHigh, t);
  }
  if (viewMode === "surfaceWater") {
    return target.copy(viewScaleColors.surfaceLow).lerp(viewScaleColors.surfaceHigh, clamp01(value));
  }
  if (viewMode === "snowIce") {
    return target.copy(viewScaleColors.snowIceLow).lerp(viewScaleColors.snowIceHigh, clamp01(value));
  }
  if (viewMode === "rainfall") {
    return target.copy(viewScaleColors.rainLow).lerp(viewScaleColors.rainHigh, clamp01(value));
  }
  if (viewMode === "cloudCover") {
    return target.copy(viewScaleColors.cloudLow).lerp(viewScaleColors.cloudHigh, clamp01(value));
  }
  if (viewMode === "meanTemp") {
    return colorForMeanTemperatureValueInto(value, target);
  }
  if (viewMode === "sunlight") {
    return target.copy(viewScaleColors.sunlightLow).lerp(viewScaleColors.sunlightHigh, clamp01(value));
  }
  if (viewMode === "leafArea") {
    return target.copy(viewScaleColors.leafAreaLow).lerp(viewScaleColors.leafAreaHigh, clamp01(value / 6));
  }
  if (viewMode === "apar") {
    return target.copy(viewScaleColors.aparLow).lerp(viewScaleColors.aparHigh, clamp01(value / 38));
  }
  if (viewMode === "elevation") {
    return colorForElevationValueInto(value, target);
  }
  return target.copy(colors.sand);
}

function colorForViewLayer(cell) {
  return colorForViewLayerInto(cell, new THREE.Color());
}

function colorForViewLayerInto(cell, target) {
  const id = cell.id;
  if (viewMode === "substrate") {
    return target.copy(substrateColors[state.substrate[id]] ?? substrateColors.loam);
  }

  if (viewMode === "koppen") {
    return target.copy(koppenColors[state.koppenClass?.[id]] ?? koppenColors.Ocean);
  }

  if (viewMode === "vegetation") {
    return colorForVegetationComponentsInto(state.baobab[id], state.flower[id], target);
  }

  if (viewMode === "seedBank") {
    return colorForSeedBankComponentsInto(state.baobabSeedBank?.[id] ?? 0, state.roseSeedBank?.[id] ?? 0, target);
  }

  if (viewMode === "height") {
    return colorForHeightComponentsInto(plantHeightMetersForCell(id, "baobab"), plantHeightMetersForCell(id, "rose"), target);
  }

  const scalar = scalarValueForCurrentViewCell(id);
  if (scalar !== null) {
    return colorForScalarViewValueInto(scalar, target);
  }

  return target.copy(landColors[state.land[id]] ?? colors.sand);
}

function colorForVegetationComponentsInto(baobab, rose, target) {
  target.copy(landColors.dryLoam);
  target.lerp(viewScaleColors.baobabHigh, clamp01(baobab * 0.82));
  target.lerp(viewScaleColors.roseHigh, clamp01(rose * 0.62));
  return target;
}

function colorForSeedBankComponentsInto(baobabSeed, roseSeed, target) {
  target.copy(viewScaleColors.seedBase);
  target.lerp(viewScaleColors.baobabSeed, seedBankIntensity(baobabSeed));
  target.lerp(viewScaleColors.roseSeed, seedBankIntensity(roseSeed));
  return target;
}

function colorForHeightComponentsInto(baobabHeightMeters, roseHeightMeters, target) {
  const scalarHeightMeters = Math.max(baobabHeightMeters, roseHeightMeters);
  target.copy(viewScaleColors.heightBase);
  target.lerp(viewScaleColors.baobabHigh, clamp01(scalarHeightMeters / BAOBAB_REFERENCE_HEIGHT_M));
  if (roseHeightMeters > baobabHeightMeters) {
    target.lerp(viewScaleColors.roseHigh, clamp01(roseHeightMeters / ROSE_REFERENCE_HEIGHT_M) * 0.62);
  }
  return target;
}

function seedBankIntensity(value) {
  return clamp01(1 - Math.exp(-clamp01(value) * 34));
}

function plantHeightMetersForCell(cellId, kind) {
  if (kind === "rose") {
    return Math.max(0, state.roseHeight?.[cellId] ?? 0) * ROSE_REFERENCE_HEIGHT_M;
  }
  return Math.max(0, state.baobabHeight?.[cellId] ?? 0) * BAOBAB_REFERENCE_HEIGHT_M;
}

function colorForMeanTemperature(cellId, target) {
  const tempC = state.meanTempC?.[cellId] ?? 0;
  return colorForMeanTemperatureValueInto(tempC, target);
}

function colorForMeanTemperatureValueInto(tempC, target) {
  const t = clamp01((tempC + 55) / 90);
  const zeroPoint = 55 / 90;
  if (t < zeroPoint) {
    return target.copy(viewScaleColors.tempLow).lerp(viewScaleColors.tempMid, t / zeroPoint);
  }

  return target.copy(viewScaleColors.tempMid).lerp(viewScaleColors.tempHigh, (t - zeroPoint) / (1 - zeroPoint));
}

function colorForElevation(cellId, target) {
  const elevation = state.elevation?.[cellId] ?? 0;
  return colorForElevationValueInto(elevation, target);
}

function colorForElevationValueInto(elevation, target) {
  if (state.planetPreset !== "earth") {
    const t = clamp01((elevation + 1600) / 7800);
    target.copy(viewScaleColors.asteroidElevationLow).lerp(viewScaleColors.asteroidElevationMid, Math.min(1, t * 1.4));
    if (t > 0.54) {
      target.lerp(viewScaleColors.asteroidElevationHigh, (t - 0.54) / 0.46);
    }
    return target;
  }

  if (elevation < 0) {
    const t = clamp01((elevation + 6200) / 6200);
    return target.copy(viewScaleColors.elevationDeep).lerp(viewScaleColors.elevationSea, t);
  }

  if (elevation < 900) {
    return target.copy(viewScaleColors.elevationLow).lerp(viewScaleColors.elevationMid, elevation / 900);
  }

  if (elevation < 3200) {
    return target.copy(viewScaleColors.elevationMid).lerp(viewScaleColors.elevationHigh, (elevation - 900) / 2300);
  }

  return target.copy(viewScaleColors.elevationHigh).lerp(viewScaleColors.elevationPeak, clamp01((elevation - 3200) / 3600));
}

function cachedViewScale(key, factory) {
  if (!viewColorScaleCache.has(key)) {
    viewColorScaleCache.set(key, factory());
  }
  return viewColorScaleCache.get(key);
}

function finiteArrayRange(values, fallbackMin = 0, fallbackMax = 1) {
  if (!values || values.length === 0) {
    return { min: fallbackMin, max: fallbackMax };
  }

  let min = Infinity;
  let max = -Infinity;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value)) {
      continue;
    }
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: fallbackMin, max: fallbackMax };
  }
  if (Math.abs(max - min) < 1e-9) {
    const pad = Math.max(1e-6, Math.abs(max) * 0.05);
    return { min: min - pad, max: max + pad };
  }
  return { min, max };
}

function finiteAbsMax(values, fallback = 1) {
  if (!values || values.length === 0) {
    return fallback;
  }

  let max = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = Math.abs(values[index]);
    if (Number.isFinite(value)) {
      max = Math.max(max, value);
    }
  }
  return max > 0 ? max : fallback;
}

function carbonFluxColorScale() {
  return cachedViewScale("carbonFlux", () => {
    const maxAbs = finiteAbsMax(state.netEcosystemProductionGC, 1);
    return Math.max(0.05, maxAbs);
  });
}

function hydrologyMovementMaxMm() {
  return cachedViewScale("hydrologyMovementMax", () => {
    let max = 0;
    const horizontal = state.hydrologyHorizontalMm;
    const infiltration = state.hydrologyInfiltrationMm;
    const percolation01 = state.hydrologyPercolation01Mm;
    const percolation12 = state.hydrologyPercolation12Mm;
    const recharge = state.hydrologyRechargeMm;
    if (!horizontal) {
      return 1;
    }
    for (let index = 0; index < horizontal.length; index += 1) {
      const movement =
        Math.abs(horizontal[index] ?? 0) +
        Math.abs(infiltration?.[index] ?? 0) +
        Math.abs(percolation01?.[index] ?? 0) +
        Math.abs(percolation12?.[index] ?? 0) +
        Math.abs(recharge?.[index] ?? 0);
      if (Number.isFinite(movement)) {
        max = Math.max(max, movement);
      }
    }
    return Math.max(0.25, max);
  });
}

function colorbarSpecForMode() {
  const title = labels().viewModes[viewMode] ?? viewMode;
  const percentWater = {
    title,
    unit: "%",
    min: 0,
    mid: 50,
    max: 100,
    colors: [viewScaleColors.waterLow, viewScaleColors.waterHigh]
  };
  const headSpec = (values) => {
    const range = finiteArrayRange(values, -1, 1);
    return {
      title,
      unit: "m",
      min: range.min,
      mid: (range.min + range.max) * 0.5,
      max: range.max,
      colors: [viewScaleColors.groundwaterHeadLow, viewScaleColors.groundwaterHeadHigh]
    };
  };
  const conductivitySpec = (values) => {
    const range = finiteArrayRange(values, 1e-6, 0.1);
    const min = Math.max(1e-9, range.min);
    const max = Math.max(min * 1.001, range.max);
    return {
      title,
      unit: "m d^-1",
      min,
      mid: Math.sqrt(min * max),
      max,
      colors: [viewScaleColors.conductivityLow, viewScaleColors.conductivityHigh]
    };
  };

  switch (viewMode) {
    case "soilNutrient":
      return {
        title,
        unit: "%",
        min: 0,
        mid: 50,
        max: 100,
        colors: [viewScaleColors.nutrientLow, viewScaleColors.nutrientHigh]
      };
    case "soilCarbon":
      return {
        title,
        unit: "g C m^-2",
        min: 0,
        mid: 700,
        max: 1400,
        colors: [viewScaleColors.soilCarbonLow, viewScaleColors.soilCarbonHigh]
      };
    case "carbonBudget": {
      const scale = carbonFluxColorScale();
      return {
        title,
        unit: "g C m^-2 d^-1",
        min: -scale,
        mid: 0,
        max: scale,
        colors: [viewScaleColors.budgetBad, viewScaleColors.budgetOk, viewScaleColors.soilCarbonHigh]
      };
    }
    case "topSoilWater":
    case "midSoilWater":
    case "deepSoilWater":
      return percentWater;
    case "topSoilHead":
      return headSpec(state.topSoilHeadM);
    case "midSoilHead":
      return headSpec(state.midSoilHeadM);
    case "deepSoilHead":
      return headSpec(state.deepSoilHeadM);
    case "topSoilK":
      return conductivitySpec(state.topSoilConductivityMDay);
    case "midSoilK":
      return conductivitySpec(state.midSoilConductivityMDay);
    case "deepSoilK":
      return conductivitySpec(state.deepSoilConductivityMDay);
    case "groundwater":
      return {
        title,
        unit: "%",
        min: 0,
        mid: 50,
        max: 100,
        colors: [viewScaleColors.groundwaterLow, viewScaleColors.groundwaterHigh]
      };
    case "groundwaterHead":
      return headSpec(state.groundwaterHeadM);
    case "waterPotential":
      return {
        title,
        unit: "%",
        min: 0,
        mid: 50,
        max: 100,
        colors: [viewScaleColors.potentialDry, viewScaleColors.potentialWet]
      };
    case "rootStress":
      return {
        title,
        unit: "%",
        min: 0,
        mid: 50,
        max: 100,
        colors: [viewScaleColors.rootStressLow, viewScaleColors.rootStressHigh]
      };
    case "waterBudget": {
      const max = hydrologyMovementMaxMm();
      return {
        title,
        unit: "mm",
        min: 0,
        mid: max * 0.5,
        max,
        colors: [viewScaleColors.budgetOk, viewScaleColors.waterHigh]
      };
    }
    case "surfaceWater":
      return {
        title,
        unit: "mm",
        min: 0,
        mid: 7.1,
        max: 14.3,
        colors: [viewScaleColors.surfaceLow, viewScaleColors.surfaceHigh]
      };
    case "snowIce":
      return {
        title,
        unit: "mm",
        min: 0,
        mid: (SNOW_ICE_DISPLAY_MAX_M * 1000) * 0.5,
        max: SNOW_ICE_DISPLAY_MAX_M * 1000,
        colors: [viewScaleColors.snowIceLow, viewScaleColors.snowIceHigh]
      };
    case "rainfall":
      return {
        title,
        unit: "mm d^-1",
        min: 0,
        mid: state.planetPreset === "earth" ? 3.13 : 1.39,
        max: state.planetPreset === "earth" ? 6.25 : 2.78,
        colors: [viewScaleColors.rainLow, viewScaleColors.rainHigh]
      };
    case "cloudCover":
      return {
        title,
        unit: "%",
        min: 0,
        mid: 50,
        max: 100,
        colors: [viewScaleColors.cloudLow, viewScaleColors.cloudHigh]
      };
    case "meanTemp":
      return {
        title,
        unit: "deg C",
        min: -55,
        mid: 0,
        max: 35,
        colors: [viewScaleColors.tempLow, viewScaleColors.tempMid, viewScaleColors.tempHigh]
      };
    case "sunlight":
      return {
        title,
        unit: "%",
        min: 0,
        mid: 50,
        max: 100,
        colors: [viewScaleColors.sunlightLow, viewScaleColors.sunlightHigh]
      };
    case "leafArea":
      return {
        title,
        unit: "LAI",
        min: 0,
        mid: 3,
        max: 6,
        colors: [viewScaleColors.leafAreaLow, viewScaleColors.leafAreaHigh]
      };
    case "apar":
      return {
        title,
        unit: "mol m^-2 d^-1",
        min: 0,
        mid: 19,
        max: 38,
        colors: [viewScaleColors.aparLow, viewScaleColors.aparHigh]
      };
    case "elevation":
      return state.planetPreset === "earth"
        ? {
            title,
            unit: "m",
            min: -6200,
            mid: 0,
            max: 6800,
            colors: [
              viewScaleColors.elevationDeep,
              viewScaleColors.elevationSea,
              viewScaleColors.elevationLow,
              viewScaleColors.elevationMid,
              viewScaleColors.elevationHigh,
              viewScaleColors.elevationPeak
            ]
          }
        : {
            title,
            unit: "m",
            min: -1600,
            mid: 2300,
            max: 6200,
            colors: [
              viewScaleColors.asteroidElevationLow,
              viewScaleColors.asteroidElevationMid,
              viewScaleColors.asteroidElevationHigh
            ]
          };
    case "height":
      return {
        title,
        unit: "m",
        min: 0,
        mid: BAOBAB_REFERENCE_HEIGHT_M * 0.5,
        max: BAOBAB_REFERENCE_HEIGHT_M,
        colors: [viewScaleColors.heightBase, viewScaleColors.baobabHigh]
      };
    default:
      return null;
  }
}

function colorbarGradientCss(colorsForScale) {
  if (!colorsForScale || colorsForScale.length === 0) {
    return "linear-gradient(90deg, #202326, #e3d8a2)";
  }
  if (colorsForScale.length === 1) {
    const color = `#${colorsForScale[0].getHexString()}`;
    return `linear-gradient(90deg, ${color}, ${color})`;
  }

  const last = colorsForScale.length - 1;
  const stops = colorsForScale.map((color, index) =>
    `#${color.getHexString()} ${((index / last) * 100).toFixed(1)}%`
  );
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function formatColorbarNumber(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const abs = Math.abs(value);
  if (abs >= 1000) {
    return Math.round(value).toLocaleString("en-US");
  }
  if (abs >= 100) {
    return value.toFixed(0);
  }
  if (abs >= 10) {
    return value.toFixed(1);
  }
  if (abs >= 1) {
    return value.toFixed(2);
  }
  if (abs === 0) {
    return "0";
  }
  return value.toPrecision(2);
}

function updateColorbarPanel() {
  if (!colorbarToggle || !colorbarPanel) {
    return;
  }

  const text = labels();
  const spec = colorbarSpecForMode();
  const active = colorbarVisible && Boolean(spec);
  colorbarToggle.disabled = !spec;
  colorbarToggle.textContent = active ? text.hideColorbar : text.showColorbar;
  colorbarToggle.setAttribute("aria-pressed", String(active));
  colorbarToggle.setAttribute("aria-label", active ? text.hideColorbarLabel : text.showColorbarLabel);

  if (!active) {
    colorbarPanel.hidden = true;
    return;
  }

  colorbarPanel.hidden = false;
  colorbarTitle.textContent = spec.title;
  colorbarUnit.textContent = spec.unit;
  colorbarGradient.style.background = colorbarGradientCss(spec.colors);
  colorbarMin.textContent = formatColorbarNumber(spec.min);
  colorbarMid.textContent = formatColorbarNumber(spec.mid);
  colorbarMax.textContent = formatColorbarNumber(spec.max);
}

function updateHud() {
  const text = labels();
  syncNsideOptions();
  resolutionLabel.textContent = text.resolution(topology.nside, state.day, renderTopology.nside);
  dayValue.textContent = `${state.day}/${gameLengthDays()}`;
  actionValue.textContent = formatTurnTime();
  healthValue.textContent = String(selectedCellId());
  roseLabel.textContent = currentPlanetPreset === "earth" ? text.roseCell : text.roseStatus;
  roseValue.textContent = currentPlanetPreset === "earth"
    ? String(rosePatchCount())
    : `${primaryRoseVisiblePercent()}%`;
  planetSelect.value = currentPlanetPreset;
  nsideSelect.value = String(topology.nside);
  viewSelect.value = viewMode;

  sheepButton.hidden = currentPlanetPreset !== "earth";
  for (const button of [waterButton, releaseWaterButton, pullButton, burnButton, cleanButton, sheepButton, observeButton, sunsetButton, restButton]) {
    button.disabled = state.gameOver;
  }
  sheepButton.disabled = state.gameOver || currentPlanetPreset !== "earth";
  endDayButton.disabled = state.gameOver;
}

function rosePatchCount() {
  if (currentPlanetPreset !== "earth") {
    return state.terrain.filter((terrain) => terrain === "rose").length;
  }

  return state.flower.reduce((count, value, cellId) => {
    const rosePresence = Math.max(value, state.roseHeight?.[cellId] ?? 0);
    return count + (rosePresence > EARTH_ROSE_PULL_THRESHOLD ? 1 : 0);
  }, 0);
}

function turnProgress() {
  return state.turn / TURNS_PER_DAY;
}

function formatTurnTime() {
  const hour = (START_HOUR + state.turn * HOURS_PER_TURN) % 24;
  return `${String(hour).padStart(2, "0")}:00`;
}

function computeHealth() {
  let baobabTotal = 0;
  let ashTotal = 0;
  let moistureTotal = 0;
  let careTotal = 0;
  for (const cell of topology.cells) {
    baobabTotal += state.baobab[cell.id];
    ashTotal += state.ash[cell.id];
    moistureTotal += state.moisture[cell.id];
    careTotal += state.care[cell.id];
  }

  const count = topology.cells.length;
  const score =
    0.58 +
    state.roseHealth * 0.22 +
    (moistureTotal / count) * 0.12 +
    (careTotal / count) * 0.12 +
    Math.min(0.08, state.sunsetCount * 0.006) -
    (baobabTotal / count) * 0.42 -
    (ashTotal / count) * 0.34;
  return clamp01(score);
}

function diagnosticRoseMetric() {
  return currentPlanetPreset === "earth" ? String(rosePatchCount()) : `${primaryRoseVisiblePercent()}%`;
}

function diagnosticTimeMetric(day, turn) {
  return `${day}:${turn}`;
}

function diagnosticCellMetric(cellId) {
  return cellId === state.roseCell ? "rose" : String(cellId);
}

async function spendAction(action, actionKey = "action") {
  if (state.gameOver || actionInProgress) {
    return false;
  }

  actionInProgress = true;
  try {
    const beforeDiagnostic = {
      rose: diagnosticRoseMetric(),
      day: state.day,
      turn: state.turn,
      selected: selectedCellId(),
      scale: actionTimeScale()
    };
    const durationDays = actionDurationDays(1);
    const result = await action(durationDays);
    const actionMessage = typeof result === "string" ? result : result?.message;
    const management = typeof result === "string" ? null : result?.management;
    const timeMessage = await advanceActionTime(1, management);
    lastActionDiagnostic = {
      action: actionKey,
      beforeRose: beforeDiagnostic.rose,
      afterRose: diagnosticRoseMetric(),
      beforeTime: diagnosticTimeMetric(beforeDiagnostic.day, beforeDiagnostic.turn),
      afterTime: diagnosticTimeMetric(state.day, state.turn),
      selected: diagnosticCellMetric(beforeDiagnostic.selected),
      afterSelected: diagnosticCellMetric(selectedCellId()),
      scale: beforeDiagnostic.scale
    };
    const finalActionMessage =
      typeof result?.messageAfter === "function"
        ? result.messageAfter(management)
        : actionMessage;
    refresh(state.gameOver ? timeMessage : messageWithRoseHelp(finalActionMessage, timeMessage));
    return true;
  } finally {
    actionInProgress = false;
  }
}

function combineMessages(...messages) {
  return messages.filter((item) => item).join(" ");
}

function messageWithRoseHelp(...messages) {
  const roseMessage = roseHelpMessage();
  if (!roseMessage || roseMessage === labels().roseHelpStable) {
    return combineMessages(...messages);
  }

  return combineMessages(...messages, roseMessage);
}

function roseHelpMessage() {
  if (state.gameOver) {
    return null;
  }

  if (currentPlanetPreset === "earth") {
    return null;
  }

  if (state.roseWitheredNotified) {
    return null;
  }

  const text = labels();
  const roseArea = [state.roseCell, ...neighborsOf(state.roseCell)];
  const roseMass = state.flower[state.roseCell];
  const plantMass = primaryRosePlantMass();
  if (plantMass <= 0.025 && roseMass <= 0.04) {
    return null;
  }

  const topWater = state.topSoilWater[state.roseCell];
  const ash = average(roseArea, state.ash);
  const baobabAverage = average(roseArea, state.baobab);
  const baobabPeak = roseArea.reduce((maximum, cellId) => Math.max(maximum, state.baobab[cellId]), 0);
  const dryAndWeak = topWater < 0.24 && roseMass < 0.38;
  const tooDryToWait = topWater < 0.18 && roseMass < 0.5;

  if (tooDryToWait || dryAndWeak || state.roseHealth <= 0.38) {
    return text.roseHelpWilting;
  }

  if (roseMass <= 0.18 || state.roseHealth <= 0.26) {
    return text.roseHelpCritical;
  }

  if (topWater < 0.28) {
    return text.roseHelpWater;
  }

  if (ash > 0.12) {
    return text.roseHelpAsh;
  }

  if (baobabPeak > 0.18 || baobabAverage > 0.07) {
    return text.roseHelpBaobab;
  }

  if (state.roseHealth < 0.58) {
    return text.roseHelpCare;
  }

  return text.roseHelpStable;
}

function isRoseAreaCell(cellId) {
  return cellId === state.roseCell || neighborsOf(state.roseCell).includes(cellId);
}

function isProtectedAsteroidRoseCell(cellId) {
  if (state.planetPreset === "earth" || cellId !== state.roseCell) {
    return false;
  }
  return Math.max(state.flower[cellId] ?? 0, state.roseHeight?.[cellId] ?? 0) > 0.005;
}

function rememberRose(memoryAmount, insightAmount = 0) {
  state.roseMemory = clamp01(state.roseMemory + memoryAmount);
  state.roseInsight = clamp01(state.roseInsight + insightAmount);
}

function rosePullMessage() {
  const text = labels();
  if (state.roseMemory < 0.22) {
    return text.pulledRosePlain;
  }

  if (state.roseMemory < 0.55 || state.roseInsight < 0.22) {
    return text.pulledRoseMemory;
  }

  if (state.roseInsight < 0.58) {
    return text.pulledRoseMeaning;
  }

  return text.pulledRoseReturn;
}

function selectedCellId() {
  return state.selectedCell ?? state.roseCell;
}

function syncVegetationToGame(detail = viewMode !== "landUse") {
  state.vegetation.syncToGame(state, { detail });
  if (shouldUpdateCloudCoverForCurrentView(state)) {
    updateCloudCoverField(state);
  }
}

function syncCurrentViewDetailIfNeeded() {
  if (viewMode !== "landUse") {
    syncVegetationToGame(true);
  }
}

function currentViewNeedsEcosystemDiagnostics() {
  return ecosystemDiagnosticViewModes.has(viewMode);
}

function ecosystemSubstepsForPeriod(durationDays) {
  const stableSubsteps = ecosystemSubstepsForDuration(state.vegetation, durationDays);
  const maxStepDays = DEFAULT_MAX_ECOSYSTEM_PERIOD_STEP_DAYS;
  const periodSubsteps = Math.ceil(Math.max(0, durationDays) / maxStepDays);
  return Math.max(1, Math.max(stableSubsteps, periodSubsteps));
}

function clearScheduledCare() {
  scheduledWaterCells.clear();
}

function actionRate(baseActionAmount) {
  return baseActionAmount / ACTION_DT_DAYS;
}

function addCareForcing(management, cellId, baseCareAmount) {
  if (!management.care) {
    management.care = [];
  }
  management.care.push({ cellId, rate: actionRate(baseCareAmount) });
}

function applyManagementForStep(management, dtDays) {
  if (!management || dtDays <= 0) {
    return;
  }

  for (const item of management.water ?? []) {
    const requestedM = item.rateMDay * dtDays;
    const amountM = item.retentionLimited === false
      ? openSurfaceWaterAmountForStep(item.cellId, requestedM)
      : retainedIrrigationAmountForStep(item.cellId, requestedM);
    if (amountM > 1e-7) {
      const frozenFraction = waterInputFrozenFraction(item.cellId);
      const frozenM = amountM * frozenFraction;
      const liquidM = amountM - frozenM;
      if (frozenM > 1e-8) {
        addSnowIce(item.cellId, frozenM);
      }
      if (liquidM > 1e-7) {
        if (item.retentionLimited === false) {
          addSurfaceWaterForcing(item.cellId, liquidM);
        } else {
          state.vegetation.applyWater([item.cellId], liquidM, liquidM / dtDays, dtDays);
        }
      }
    }
  }

  if (management.pullRose) {
    removeRoseWithCarbonClosure(management.pullRose.cellId, management.pullRose.rate * dtDays);
  }

  if (management.pullBaobab) {
    const result = pullBaobabAround(
      management.pullBaobab.cellId,
      management.pullBaobab.workRate * dtDays,
      management.pullBaobab.targets
    );
    management.pullBaobab.removed += result.removed;
    for (const targetId of result.affectedCells) {
      management.pullBaobab.affectedCells.add(targetId);
    }
  }

  if (management.burn) {
    const result = burnAround(
      management.burn.cellId,
      management.burn.workRate * dtDays,
      management.burn.targets
    );
    management.burn.seedBurned += result.seedBurned;
    management.burn.baobabBurned += result.baobabBurned;
    management.burn.roseDamaged += result.roseDamaged;
    management.burn.ashAdded += result.ashAdded;
    management.burn.wetBlocked ||= result.wetBlocked;
    management.burn.volcanoBlocked ||= result.volcanoBlocked;
    for (const targetId of result.affectedCells) {
      management.burn.affectedCells.add(targetId);
    }
  }

  if (management.cleanAsh) {
    const result = cleanAshAround(management.cleanAsh.cellId, management.cleanAsh.workRate * dtDays);
    management.cleanAsh.cleaned += result.cleaned;
    management.cleanAsh.returnedCarbon = (management.cleanAsh.returnedCarbon ?? 0) + result.returnedCarbon;
    for (const targetId of result.affectedCells) {
      management.cleanAsh.affectedCells.add(targetId);
    }
  }

  if (management.cleanSnowIce) {
    const result = cleanSnowIceAround(management.cleanSnowIce.cellId, management.cleanSnowIce.workRate * dtDays);
    management.cleanSnowIce.cleaned += result.cleaned;
    for (const targetId of result.affectedCells) {
      management.cleanSnowIce.affectedCells.add(targetId);
    }
  }

  for (const item of management.care ?? []) {
    state.care[item.cellId] = clamp01(state.care[item.cellId] + item.rate * dtDays);
  }
}

function retainedIrrigationAmountForStep(cellId, requestedAmountM) {
  const modelState = vegetationModelState();
  const requested = Math.max(0, requestedAmountM);
  if (!modelState || requested <= 0 || state.terrain[cellId] === "water" || isIceFreeCraterCell(cellId)) {
    return 0;
  }
  const size = modelState.MR?.length ?? state.npix ?? 0;
  if (size <= 0 || cellId < 0 || cellId >= size) {
    return 0;
  }
  const soilWater = modelState.soilWater;
  const soilCap = modelState.soilCap;
  const groundwater = modelState.groundwaterStorage;
  const groundwaterCap = modelState.groundwaterCap;
  if (!soilWater || !soilCap || !groundwater || !groundwaterCap) {
    return requested;
  }

  const top = cellId;
  const mid = size + cellId;
  const deep = size * 2 + cellId;
  const targetTop = 0.78;
  const targetMid = 0.80;
  const targetDeep = 0.82;
  const targetGround = 0.72;
  const soilDeficit =
    Math.max(0, soilCap[top] * targetTop - soilWater[top]) +
    Math.max(0, soilCap[mid] * targetMid - soilWater[mid]) +
    Math.max(0, soilCap[deep] * targetDeep - soilWater[deep]);
  const groundwaterDeficit =
    Math.max(0, (groundwaterCap[cellId] ?? 0) * targetGround - (groundwater[cellId] ?? 0)) * 0.18;
  const retainable = soilDeficit + groundwaterDeficit;
  return Math.min(requested, Math.max(0, retainable));
}

function openSurfaceWaterAmountForStep(cellId, requestedAmountM) {
  const requested = Math.max(0, requestedAmountM);
  if (requested <= 0 || state.terrain[cellId] === "water" || isIceFreeCraterCell(cellId)) {
    return 0;
  }
  return requested;
}

function addSurfaceWaterForcing(cellId, amountM) {
  const modelState = vegetationModelState();
  if (!modelState?.H || amountM <= 0 || cellId < 0 || cellId >= modelState.H.length) {
    return;
  }
  modelState.H[cellId] = Math.max(0, (modelState.H[cellId] ?? 0) + amountM);
  if (modelState.hydrologyInputM) {
    modelState.hydrologyInputM[cellId] = (modelState.hydrologyInputM[cellId] ?? 0) + amountM;
  }
}

function vegetationModelState() {
  return state.vegetation?.state;
}

function cellSurfaceTempC(cellId) {
  const modelState = vegetationModelState();
  const temp = modelState?.surfaceTempC?.[cellId];
  return Number.isFinite(temp) ? temp : (state.meanTempC?.[cellId] ?? 0);
}

function ringLatitudeTemperatureUnitForCell(cellId) {
  const cell = topology.cells[cellId];
  const ringHeight = THREE.MathUtils.clamp(cell?.height ?? 0, -1, 1);
  return 1 - 2 * Math.abs(ringHeight);
}

function cellMeanClimateTempForSnowC(cellId) {
  const modelState = vegetationModelState();
  if (state.planetPreset === "earth") {
    const climateTemp = modelState?.climateMeanTempC?.[cellId];
    return Number.isFinite(climateTemp) ? climateTemp : (state.meanTempC?.[cellId] ?? cellSurfaceTempC(cellId));
  }

  const latitudeRange = THREE.MathUtils.clamp(simulationSettings.asteroidLatitudeTempRangeC ?? 3, 0, 12);
  const latitudeAnomaly = ringLatitudeTemperatureUnitForCell(cellId) * latitudeRange;
  const terrainCooling = THREE.MathUtils.clamp(Math.max(0, state.elevation?.[cellId] ?? 0) / 5200, 0, 1.6) * 5.4;
  const cloudCooling = THREE.MathUtils.clamp((modelState?.R?.[cellId] ?? 0) * 900, 0, 1);
  const surfaceWaterCooling = THREE.MathUtils.clamp((modelState?.H?.[cellId] ?? 0) * 12, 0, 1) * 1.1;
  return THREE.MathUtils.clamp(
    (simulationSettings.asteroidMeanTempC ?? 16) +
      latitudeAnomaly -
      terrainCooling -
      cloudCooling * 1.3 -
      surfaceWaterCooling,
    -18,
    48
  );
}

function cellDiurnalRangeForSnowC(cellId) {
  const modelState = vegetationModelState();
  if (state.planetPreset === "earth") {
    const climateRange = modelState?.climateDiurnalRangeC?.[cellId];
    return THREE.MathUtils.clamp(
      Number.isFinite(climateRange) ? climateRange : (simulationSettings.asteroidDiurnalRangeC ?? 12),
      2.4,
      28
    );
  }

  const topSat = state.topSoilWater?.[cellId] ?? state.moisture?.[cellId] ?? 0;
  const groundwaterSat = state.groundwater?.[cellId] ?? 0;
  const wetness = clamp01(0.62 * topSat + 0.38 * groundwaterSat);
  const cover = Math.max(state.baobab?.[cellId] ?? 0, state.flower?.[cellId] ?? 0);
  const cloudCooling = THREE.MathUtils.clamp((modelState?.R?.[cellId] ?? 0) * 900, 0, 1);
  const terrainBoost = THREE.MathUtils.clamp(Math.max(0, state.elevation?.[cellId] ?? 0) / 4200, 0, 1.4) * 2.8;
  const damping = wetness * 7.5 + cloudCooling * 5.5 + clamp01(cover) * 4.0;
  return THREE.MathUtils.clamp((simulationSettings.asteroidDiurnalRangeC ?? 16) + terrainBoost - damping, 3, 28);
}

function positiveDegreeDayMeanC(meanTempC, diurnalRangeC) {
  const amplitude = Math.max(0, diurnalRangeC) * 0.5;
  if (amplitude <= 1e-6) {
    return Math.max(0, meanTempC);
  }
  if (meanTempC >= amplitude) {
    return meanTempC;
  }
  if (meanTempC <= -amplitude) {
    return 0;
  }

  const ratio = THREE.MathUtils.clamp(meanTempC / amplitude, -1, 1);
  return (
    meanTempC * (Math.PI + 2 * Math.asin(ratio)) +
    2 * amplitude * Math.sqrt(Math.max(0, 1 - ratio * ratio))
  ) / (2 * Math.PI);
}

function thawFractionFromMeanDiurnal(meanTempC, diurnalRangeC) {
  const amplitude = Math.max(0, diurnalRangeC) * 0.5;
  if (amplitude <= 1e-6) {
    return meanTempC > 0 ? 1 : 0;
  }
  if (meanTempC >= amplitude) {
    return 1;
  }
  if (meanTempC <= -amplitude) {
    return 0;
  }
  return THREE.MathUtils.clamp(0.5 + Math.asin(THREE.MathUtils.clamp(meanTempC / amplitude, -1, 1)) / Math.PI, 0, 1);
}

function cellPositiveDegreeDayMeanC(cellId) {
  return positiveDegreeDayMeanC(
    cellMeanClimateTempForSnowC(cellId),
    cellDiurnalRangeForSnowC(cellId)
  );
}

function cellMeltReleaseFraction(cellId) {
  const meanTempC = cellMeanClimateTempForSnowC(cellId);
  if (meanTempC >= 0) {
    return 1;
  }
  return thawFractionFromMeanDiurnal(meanTempC, cellDiurnalRangeForSnowC(cellId));
}

function isIceFreeCraterCell(cellId) {
  return state.activeVolcanoCraterMask?.[cellId] === 1;
}

function waterInputFrozenFraction(cellId) {
  if (isIceFreeCraterCell(cellId)) {
    return 0;
  }
  const meanTempC = cellMeanClimateTempForSnowC(cellId);
  const diurnalRangeC = cellDiurnalRangeForSnowC(cellId);
  if (meanTempC >= 0 && cellSurfaceTempC(cellId) > 0) {
    return 0;
  }

  const thawFraction = thawFractionFromMeanDiurnal(meanTempC, diurnalRangeC);
  const snowIceCover = clamp01((state.snowIceM?.[cellId] ?? 0) / FREEZE_DAMAGE_ICE_REFERENCE_M);
  const liquidFraction = thawFraction * (1 - 0.65 * snowIceCover);
  return clamp01(1 - liquidFraction);
}

function addSnowIce(cellId, amountM) {
  const amount = Math.max(0, amountM);
  if (!state.snowIceM || amount <= 0 || isIceFreeCraterCell(cellId)) {
    return;
  }
  state.snowIceM[cellId] = Math.max(0, (state.snowIceM[cellId] ?? 0) + amount);
  updateSnowIceDisplayCell(cellId);
  netNeedsFullUpdate = true;
}

function updateSnowIceDisplayCell(cellId) {
  const amountM = Math.max(0, state.snowIceM?.[cellId] ?? 0);
  if (state.snowIceMm) {
    state.snowIceMm[cellId] = amountM * 1000;
  }
  if (state.snowIce) {
    const displayMax = state.terrain?.[cellId] === "water" ? SEA_ICE_DISPLAY_MAX_M : SNOW_ICE_DISPLAY_MAX_M;
    state.snowIce[cellId] = clamp01(amountM / displayMax);
  }
}

function freezeDamageSeverity(cellId) {
  if (isIceFreeCraterCell(cellId)) {
    return 0;
  }

  const meanTempC = cellMeanClimateTempForSnowC(cellId);
  const diurnalRangeC = cellDiurnalRangeForSnowC(cellId);
  const frozenTimeFraction = 1 - thawFractionFromMeanDiurnal(meanTempC, diurnalRangeC);
  const iceCover = clamp01((state.snowIceM?.[cellId] ?? 0) / FREEZE_DAMAGE_ICE_REFERENCE_M);
  const coldStress = clamp01((-meanTempC + 1) / FREEZE_DAMAGE_COLD_REFERENCE_C);
  return clamp01(Math.max(iceCover, frozenTimeFraction * 0.55) * (0.35 + 0.65 * coldStress));
}

function seaIceTargetM(cellId) {
  if (state.terrain?.[cellId] !== "water" || isIceFreeCraterCell(cellId)) {
    return 0;
  }

  const meanTempC = cellMeanClimateTempForSnowC(cellId);
  const frozenTimeFraction = 1 - thawFractionFromMeanDiurnal(meanTempC, cellDiurnalRangeForSnowC(cellId));
  if (frozenTimeFraction <= 0) {
    return 0;
  }

  const coldStrength = clamp01((-meanTempC + 0.5) / 10);
  return SEA_ICE_DISPLAY_MAX_M * frozenTimeFraction * (0.28 + 0.72 * coldStrength);
}

function advanceSeaIceCell(cellId, dtDays) {
  const current = Math.max(0, state.snowIceM?.[cellId] ?? 0);
  const target = seaIceTargetM(cellId);
  const rate = target > current ? SEA_ICE_GROWTH_RATE_PER_DAY : SEA_ICE_DECAY_RATE_PER_DAY;
  const next = current + (target - current) * clamp01(1 - Math.exp(-rate * dtDays));
  if (Math.abs(next - current) <= 1e-7) {
    updateSnowIceDisplayCell(cellId);
    return false;
  }
  state.snowIceM[cellId] = Math.max(0, next);
  updateSnowIceDisplayCell(cellId);
  return true;
}

function removeCarbonFraction(pool, cellId, ratePerDay, exposureDays) {
  if (!pool || ratePerDay <= 0 || exposureDays <= 0) {
    return 0;
  }
  const before = Math.max(0, pool[cellId] ?? 0);
  if (before <= 0) {
    return 0;
  }
  const fraction = clamp01(1 - Math.exp(-ratePerDay * exposureDays));
  const removed = before * fraction;
  pool[cellId] = Math.max(0, before - removed);
  return removed;
}

function refreshPlantCarbonAggregates(cellId) {
  const modelState = vegetationModelState();
  if (!modelState) {
    return;
  }

  const baobabPlant =
    Math.max(0, modelState.baobabLeaf?.[cellId] ?? 0) +
    Math.max(0, modelState.baobabStem?.[cellId] ?? 0) +
    Math.max(0, modelState.baobabRoot?.[cellId] ?? 0);
  const baobabStore = Math.max(0, modelState.baobabStore?.[cellId] ?? 0);
  const rosePlant =
    Math.max(0, modelState.roseLeaf?.[cellId] ?? 0) +
    Math.max(0, modelState.roseFlower?.[cellId] ?? 0) +
    Math.max(0, modelState.roseRoot?.[cellId] ?? 0);
  const roseStore = Math.max(0, modelState.roseStore?.[cellId] ?? 0);
  const seedCarbon =
    Math.max(0, modelState.baobabSeed?.[cellId] ?? 0) +
    Math.max(0, modelState.roseSeed?.[cellId] ?? 0);

  if (modelState.MB) {
    modelState.MB[cellId] = baobabPlant;
  }
  if (modelState.MR) {
    modelState.MR[cellId] = rosePlant;
  }
  if (modelState.SB) {
    modelState.SB[cellId] = baobabStore;
  }
  if (modelState.plantCarbonC) {
    modelState.plantCarbonC[cellId] = baobabPlant + baobabStore + rosePlant + roseStore;
  }
  if (modelState.seedCarbonC) {
    modelState.seedCarbonC[cellId] = seedCarbon;
  }
}

function recomputeCarbonResidualForCell(cellId) {
  const modelState = vegetationModelState();
  if (!modelState?.carbonResidualC) {
    return;
  }
  modelState.carbonResidualC[cellId] =
    (modelState.carbonStorageChangeC?.[cellId] ?? 0) -
    ((modelState.carbonInputC?.[cellId] ?? 0) +
      (modelState.carbonTransportC?.[cellId] ?? 0) -
      (modelState.carbonRespirationC?.[cellId] ?? 0) -
      (modelState.carbonDisturbanceC?.[cellId] ?? 0));
}

function recordGrazingCarbon(sourceCellId, targetCellId, removedCarbon) {
  const modelState = vegetationModelState();
  const removed = Math.max(0, removedCarbon);
  if (!modelState || removed <= 0) {
    return { returnedCarbon: 0, returnedNutrient: 0 };
  }

  const returnedCarbon = removed * SHEEP_DUNG_CARBON_RETURN_FRACTION;
  const respiredCarbon = removed * SHEEP_RESPIRATION_CARBON_FRACTION;
  const bodyCarbon = removed * SHEEP_BODY_CARBON_FRACTION;
  const residualExportCarbon = removed * Math.max(
    0,
    1 - SHEEP_DUNG_CARBON_RETURN_FRACTION - SHEEP_RESPIRATION_CARBON_FRACTION - SHEEP_BODY_CARBON_FRACTION
  );
  const exportedCarbon = respiredCarbon + bodyCarbon + residualExportCarbon;
  const returnedNutrient = removed * SHEEP_DUNG_NUTRIENT_RETURN_FRACTION;

  if (modelState.disturbanceCarbonExportC) {
    modelState.disturbanceCarbonExportC[sourceCellId] = (modelState.disturbanceCarbonExportC[sourceCellId] ?? 0) + exportedCarbon;
  }
  if (modelState.carbonDisturbanceC) {
    modelState.carbonDisturbanceC[sourceCellId] = (modelState.carbonDisturbanceC[sourceCellId] ?? 0) + exportedCarbon;
  }
  if (modelState.carbonStorageChangeC) {
    modelState.carbonStorageChangeC[sourceCellId] = (modelState.carbonStorageChangeC[sourceCellId] ?? 0) - removed;
  }

  if (returnedCarbon > 0) {
    if (modelState.soilCarbonActive) {
      modelState.soilCarbonActive[targetCellId] = (modelState.soilCarbonActive[targetCellId] ?? 0) + returnedCarbon * 0.68;
    }
    if (modelState.litterCarbon) {
      modelState.litterCarbon[targetCellId] = (modelState.litterCarbon[targetCellId] ?? 0) + returnedCarbon;
    }
    if (modelState.litterFastCarbon) {
      modelState.litterFastCarbon[targetCellId] = (modelState.litterFastCarbon[targetCellId] ?? 0) + returnedCarbon * 0.78;
    }
    if (modelState.litterSlowCarbon) {
      modelState.litterSlowCarbon[targetCellId] = (modelState.litterSlowCarbon[targetCellId] ?? 0) + returnedCarbon * 0.22;
    }
    if (modelState.litterInputCarbon) {
      modelState.litterInputCarbon[targetCellId] = (modelState.litterInputCarbon[targetCellId] ?? 0) + returnedCarbon;
    }
    if (modelState.carbonInputC) {
      modelState.carbonInputC[targetCellId] = (modelState.carbonInputC[targetCellId] ?? 0) + returnedCarbon;
    }
    if (modelState.carbonStorageChangeC) {
      modelState.carbonStorageChangeC[targetCellId] = (modelState.carbonStorageChangeC[targetCellId] ?? 0) + returnedCarbon;
    }
  }

  if (returnedNutrient > 0 && modelState.soilMineralN) {
    modelState.soilMineralN[targetCellId] = clamp01((modelState.soilMineralN[targetCellId] ?? 0) + returnedNutrient);
    state.soilNutrient[targetCellId] = clamp01((state.soilNutrient[targetCellId] ?? 0) + returnedNutrient);
  }
  if (modelState.soilCarbonActive && modelState.soilCarbonStable) {
    state.soilOrganicCarbon[targetCellId] = clamp01(
      ((modelState.soilCarbonActive[targetCellId] ?? 0) + (modelState.soilCarbonStable[targetCellId] ?? 0)) / 1.4
    );
  }

  recomputeCarbonResidualForCell(sourceCellId);
  if (targetCellId !== sourceCellId) {
    recomputeCarbonResidualForCell(targetCellId);
  }
  return { returnedCarbon, returnedNutrient };
}

function applyFreezePlantDamageForCell(cellId, dtDays) {
  const modelState = vegetationModelState();
  if (!modelState || dtDays <= 0) {
    return false;
  }

  const severity = freezeDamageSeverity(cellId);
  if (severity <= 0) {
    return false;
  }

  const exposureDays = dtDays * severity;
  let removedCarbon = 0;
  removedCarbon += removeCarbonFraction(modelState.roseFlower, cellId, ROSE_FREEZE_DAMAGE_RATES.flower, exposureDays);
  removedCarbon += removeCarbonFraction(modelState.roseLeaf, cellId, ROSE_FREEZE_DAMAGE_RATES.leaf, exposureDays);
  removedCarbon += removeCarbonFraction(modelState.roseRoot, cellId, ROSE_FREEZE_DAMAGE_RATES.root, exposureDays);
  removedCarbon += removeCarbonFraction(modelState.roseStore, cellId, ROSE_FREEZE_DAMAGE_RATES.store, exposureDays);
  removedCarbon += removeCarbonFraction(modelState.roseSeed, cellId, ROSE_FREEZE_DAMAGE_RATES.seed, exposureDays);

  removedCarbon += removeCarbonFraction(modelState.baobabLeaf, cellId, BAOBAB_FREEZE_DAMAGE_RATES.leaf, exposureDays);
  removedCarbon += removeCarbonFraction(modelState.baobabStem, cellId, BAOBAB_FREEZE_DAMAGE_RATES.stem, exposureDays);
  removedCarbon += removeCarbonFraction(modelState.baobabRoot, cellId, BAOBAB_FREEZE_DAMAGE_RATES.root, exposureDays);
  removedCarbon += removeCarbonFraction(modelState.baobabStore, cellId, BAOBAB_FREEZE_DAMAGE_RATES.store, exposureDays);
  removedCarbon += removeCarbonFraction(modelState.baobabSeed, cellId, BAOBAB_FREEZE_DAMAGE_RATES.seed, exposureDays);

  if (removedCarbon <= 1e-10) {
    return false;
  }

  closeRemovedPlantCarbon(cellId, removedCarbon);
  refreshPlantCarbonAggregates(cellId);
  return true;
}

function advanceSnowIcePeriod(dtDays) {
  if (!state.snowIceM || dtDays <= 0) {
    return;
  }

  const modelState = vegetationModelState();
  if (!modelState?.H) {
    return;
  }

  let changed = false;
  for (let cellId = 0; cellId < state.snowIceM.length; cellId += 1) {
    if (isIceFreeCraterCell(cellId)) {
      if (state.snowIceM[cellId] > 0) {
        state.snowIceM[cellId] = 0;
        updateSnowIceDisplayCell(cellId);
        changed = true;
      }
      continue;
    }

    if (state.terrain[cellId] === "water") {
      if (advanceSeaIceCell(cellId, dtDays)) {
        changed = true;
      }
      continue;
    }

    const tempC = cellSurfaceTempC(cellId);
    if (tempC <= 0) {
      const liquid = Math.max(0, modelState.H[cellId] ?? 0);
      if (liquid > 1e-8) {
        const freezeFraction = clamp01(1 - Math.exp(-Math.max(0.08, (-tempC + 0.25) * SNOW_ICE_FREEZE_RATE_PER_DAY_C) * dtDays));
        const frozen = liquid * freezeFraction;
        if (frozen > 1e-8) {
          modelState.H[cellId] = Math.max(0, liquid - frozen);
          state.snowIceM[cellId] += frozen;
          changed = true;
        }
      }
    }

    const ice = Math.max(0, state.snowIceM[cellId] ?? 0);
    const positiveDegree = cellPositiveDegreeDayMeanC(cellId);
    if (ice > 1e-8 && positiveDegree > 0) {
      const meltPotential = Math.min(ice, (SNOW_ICE_MELT_BASE_M_DAY + positiveDegree * SNOW_ICE_MELT_M_DAY_C) * dtDays);
      const melt = meltPotential * cellMeltReleaseFraction(cellId);
      if (melt > 1e-8) {
        state.snowIceM[cellId] = ice - melt;
        modelState.H[cellId] = Math.max(0, (modelState.H[cellId] ?? 0) + melt);
        changed = true;
      }
    }

    updateSnowIceDisplayCell(cellId);
    if (applyFreezePlantDamageForCell(cellId, dtDays)) {
      changed = true;
    }
  }

  if (changed) {
    netNeedsFullUpdate = true;
  }
}

function baobabPlantCarbonAt(cellId) {
  const modelState = vegetationModelState();
  if (!modelState) {
    return 0;
  }
  return Math.max(0,
    (modelState.baobabLeaf?.[cellId] ?? 0) +
      (modelState.baobabStem?.[cellId] ?? 0) +
      (modelState.baobabRoot?.[cellId] ?? 0) +
      (modelState.baobabStore?.[cellId] ?? 0)
  );
}

function baobabDisplayMassAt(cellId) {
  const modelState = vegetationModelState();
  if (modelState?.MB) {
    return clamp01((modelState.MB[cellId] ?? 0) / 1.05);
  }
  return state.baobab[cellId] ?? 0;
}

function rosePlantCarbonAt(cellId) {
  const modelState = vegetationModelState();
  if (!modelState) {
    return 0;
  }
  return Math.max(0,
    (modelState.roseLeaf?.[cellId] ?? 0) +
      (modelState.roseFlower?.[cellId] ?? 0) +
      (modelState.roseRoot?.[cellId] ?? 0) +
      (modelState.roseStore?.[cellId] ?? 0)
  );
}

function closeRemovedPlantCarbon(cellId, removedCarbon) {
  const modelState = vegetationModelState();
  const returnedCarbon = Math.max(0, removedCarbon);
  if (!modelState || returnedCarbon <= 0) {
    return 0;
  }

  modelState.soilCarbonActive[cellId] = (modelState.soilCarbonActive[cellId] ?? 0) + returnedCarbon;
  modelState.soilCarbonActiveN[cellId] = Math.max(modelState.soilCarbonActiveN[cellId] ?? 0, modelState.soilCarbonActive[cellId]);
  modelState.litterInputCarbon[cellId] = (modelState.litterInputCarbon[cellId] ?? 0) + returnedCarbon;

  const disturbance = Math.min(returnedCarbon, modelState.disturbanceCarbonExportC?.[cellId] ?? 0);
  if (disturbance > 0) {
    modelState.disturbanceCarbonExportC[cellId] -= disturbance;
    modelState.carbonDisturbanceC[cellId] = Math.max(0, (modelState.carbonDisturbanceC[cellId] ?? 0) - disturbance);
  }
  modelState.carbonStorageChangeC[cellId] = (modelState.carbonStorageChangeC[cellId] ?? 0) + returnedCarbon;
  modelState.carbonResidualC[cellId] =
    (modelState.carbonStorageChangeC[cellId] ?? 0) -
    ((modelState.carbonInputC[cellId] ?? 0) +
      (modelState.carbonTransportC[cellId] ?? 0) -
      (modelState.carbonRespirationC[cellId] ?? 0) -
      (modelState.carbonDisturbanceC[cellId] ?? 0));
  return returnedCarbon;
}

function removeRoseWithCarbonClosure(cellId, amount) {
  const before = rosePlantCarbonAt(cellId);
  state.vegetation.removeRose(cellId, amount);
  const removedCarbon = Math.max(0, before - rosePlantCarbonAt(cellId));
  return closeRemovedPlantCarbon(cellId, removedCarbon);
}

function removeBaobabWithCarbonClosure(cellId, amount) {
  const before = baobabPlantCarbonAt(cellId);
  state.vegetation.removeBaobab(cellId, amount);
  const removedCarbon = Math.max(0, before - baobabPlantCarbonAt(cellId));
  return closeRemovedPlantCarbon(cellId, removedCarbon);
}

function returnCleanedAshToSoil(cellId, removedAsh) {
  const modelState = vegetationModelState();
  const ashAmount = Math.max(0, removedAsh);
  if (!modelState || ashAmount <= 0) {
    return 0;
  }

  const returnedCarbon = ashAmount * CLEANED_ASH_SOIL_CARBON_EQUIVALENT;
  const returnedNutrient = ashAmount * CLEANED_ASH_NUTRIENT_EQUIVALENT;

  if (returnedCarbon > 0) {
    const fastCarbon = returnedCarbon * 0.62;
    const stableCarbon = returnedCarbon - fastCarbon;
    modelState.litterCarbon[cellId] = (modelState.litterCarbon[cellId] ?? 0) + fastCarbon;
    modelState.litterFastCarbon[cellId] = (modelState.litterFastCarbon[cellId] ?? 0) + fastCarbon * 0.72;
    modelState.litterSlowCarbon[cellId] = (modelState.litterSlowCarbon[cellId] ?? 0) + fastCarbon * 0.28;
    modelState.soilCarbonActive[cellId] = (modelState.soilCarbonActive[cellId] ?? 0) + stableCarbon * 0.35;
    modelState.soilCarbonStable[cellId] = (modelState.soilCarbonStable[cellId] ?? 0) + stableCarbon * 0.65;
    modelState.litterInputCarbon[cellId] = (modelState.litterInputCarbon[cellId] ?? 0) + returnedCarbon;

    let unbalancedCarbon = returnedCarbon;
    const disturbance = Math.min(unbalancedCarbon, modelState.disturbanceCarbonExportC?.[cellId] ?? 0);
    if (disturbance > 0) {
      modelState.disturbanceCarbonExportC[cellId] -= disturbance;
      modelState.carbonDisturbanceC[cellId] = Math.max(0, (modelState.carbonDisturbanceC[cellId] ?? 0) - disturbance);
      unbalancedCarbon -= disturbance;
    }
    if (unbalancedCarbon > 0) {
      modelState.carbonInputC[cellId] = (modelState.carbonInputC[cellId] ?? 0) + unbalancedCarbon;
    }
    modelState.carbonStorageChangeC[cellId] = (modelState.carbonStorageChangeC[cellId] ?? 0) + returnedCarbon;
    modelState.carbonResidualC[cellId] =
      (modelState.carbonStorageChangeC[cellId] ?? 0) -
      ((modelState.carbonInputC[cellId] ?? 0) +
        (modelState.carbonTransportC[cellId] ?? 0) -
        (modelState.carbonRespirationC[cellId] ?? 0) -
        (modelState.carbonDisturbanceC[cellId] ?? 0));
  }

  if (returnedNutrient > 0) {
    state.soilNutrient[cellId] = clamp01((state.soilNutrient[cellId] ?? 0) + returnedNutrient);
    modelState.soilMineralN[cellId] = clamp01((modelState.soilMineralN[cellId] ?? 0) + returnedNutrient);
  }
  state.soilOrganicCarbon[cellId] = clamp01(
    ((modelState.soilCarbonActive[cellId] ?? 0) + (modelState.soilCarbonStable[cellId] ?? 0)) / 1.4
  );
  return returnedCarbon;
}

function waterHere() {
  spendAction(() => {
    const cellId = selectedCellId();
    const message = waterMessageForCell(cellId);
    const targets = irrigationTargetCells(cellId);
    const management = {
      water: targets.map((target) => ({
        cellId: target.cellId,
        rateMDay: WATERING_RATE_M_DAY * target.weight
      }))
    };
    for (const target of targets) {
      addCareForcing(management, target.cellId, 0.18 * target.weight);
    }
    if (state.terrain[cellId] === "sand" && state.moisture[cellId] > 0.68 && state.baobab[cellId] < 0.05) {
      state.terrain[cellId] = "moss";
    }
    if (isRoseAreaCell(cellId)) {
      rememberRose(0.12, 0.02);
    }
    return { message, management };
  }, "water");
}

function releaseWaterHere() {
  spendAction(() => {
    const cellId = selectedCellId();
    const targets = dischargeTargetCells(cellId);
    const fireResult = extinguishBurningTargets(targets);
    const message = fireResult.extinguished > 0
      ? labels().releasedFire
      : fireResult.weakened > 0
        ? labels().releasedFireWeakened
        : releaseWaterMessageForCell(cellId);
    const management = {
      water: targets.map((target) => ({
        cellId: target.cellId,
        rateMDay: DISCHARGE_RATE_M_DAY * target.weight,
        retentionLimited: false
      }))
    };
    return { message, management };
  }, "release");
}

function extinguishBurningTargets(targets) {
  if (!state.burning || !targets?.length) {
    return { affected: 0, extinguished: 0, weakened: 0 };
  }

  const result = { affected: 0, extinguished: 0, weakened: 0 };
  for (const target of targets) {
    const cellId = target.cellId;
    if ((state.burning[cellId] ?? 0) <= BURNING_MARKER_THRESHOLD) {
      continue;
    }
    const initialFuel = Math.max(1e-5, state.burnInitialFuel[cellId] ?? state.burnFuel[cellId] ?? 0);
    const remainingFuel = Math.max(0, state.burnFuel[cellId] ?? 0);
    const consumedFraction = clamp01((initialFuel - remainingFuel) / initialFuel);
    const intensity = state.burning[cellId] ?? 0;
    const cooling = DISCHARGE_FIRE_COOLING * clamp01(target.weight ?? 1);
    const nextIntensity = Math.max(0, intensity - cooling);
    const nextFuel = remainingFuel * Math.max(0.15, 1 - DISCHARGE_FIRE_FUEL_REDUCTION * clamp01(target.weight ?? 1));
    if (intensity > 1.05 && nextIntensity > DISCHARGE_FIRE_CLEAR_INTENSITY && nextFuel > 1e-5) {
      state.burning[cellId] = nextIntensity;
      state.burnFuel[cellId] = nextFuel;
      applyBurnAshCover(cellId, consumedFraction);
      result.affected += 1;
      result.weakened += 1;
      continue;
    }
    completeBurningCell(cellId, consumedFraction);
    result.affected += 1;
    result.extinguished += 1;
  }
  if (result.affected > 0) {
    netNeedsFullUpdate = true;
  }
  return result;
}

function irrigationTargetCells(cellId) {
  return [{ cellId, weight: 1 }];
}

function dischargeTargetCells(cellId) {
  const cell = topology.cells[cellId];
  if (!cell) {
    return [{ cellId, weight: 1 }];
  }

  let nearestNeighborDistance = Infinity;
  for (const neighborId of neighborsOf(cellId)) {
    const neighbor = topology.cells[neighborId];
    if (!neighbor) {
      continue;
    }
    const dot = cellNormalDot(cell, neighbor);
    const distance = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
    nearestNeighborDistance = Math.min(nearestNeighborDistance, distance);
  }
  if (!Number.isFinite(nearestNeighborDistance)) {
    nearestNeighborDistance = Math.sqrt((4 * Math.PI) / topology.cells.length);
  }

  const radius = nearestNeighborDistance * DISCHARGE_RADIUS_NEIGHBOR_SCALE;
  const targets = topology.cells
    .filter((candidate) => {
      const dot = cellNormalDot(cell, candidate);
      const distance = candidate.id === cellId ? 0 : Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
      return distance <= radius;
    })
    .map((candidate) => {
      const dot = cellNormalDot(cell, candidate);
      const distance = candidate.id === cellId ? 0 : Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
      return { cellId: candidate.id, distance, weight: 1 };
    });

  for (const target of targets) {
    target.weight = target.distance <= 0
      ? 1
      : Math.max(DISCHARGE_EDGE_WEIGHT, Math.exp(-((target.distance / radius) ** 2)));
  }

  return targets.sort((a, b) => b.weight - a.weight || a.distance - b.distance);
}

function waterMessageForCell(cellId) {
  const text = labels();
  if (isIceFreeCraterCell(cellId)) {
    return text.wateredActiveVolcano;
  }

  const frozenFraction = waterInputFrozenFraction(cellId);
  if (frozenFraction > 0.88) {
    return text.wateredFrozen;
  }
  if (frozenFraction > 0.08) {
    return text.wateredPartlyFrozen;
  }

  if (state.terrain[cellId] === "water") {
    return state.planetPreset === "earth" ? text.wateredOcean : text.wateredWaterReserve;
  }

  if (state.planetPreset !== "earth" && state.waterNeighborMask?.[cellId] === 1) {
    return text.wateredWaterShore;
  }

  return text.watered;
}

function releaseWaterMessageForCell(cellId) {
  const text = labels();
  if (isIceFreeCraterCell(cellId)) {
    return text.releasedActiveVolcano;
  }

  const frozenFraction = waterInputFrozenFraction(cellId);
  if (frozenFraction > 0.88) {
    return text.releasedFrozen;
  }
  if (frozenFraction > 0.08) {
    return text.releasedPartlyFrozen;
  }

  if (state.terrain[cellId] === "water") {
    return state.planetPreset === "earth" ? text.releasedOcean : text.releasedWaterReserve;
  }

  if (state.planetPreset !== "earth" && isRoseAreaCell(cellId)) {
    return text.releasedRose;
  }

  if (state.planetPreset !== "earth" && state.waterNeighborMask?.[cellId] === 1) {
    return text.releasedWaterShore;
  }

  return text.released;
}

function releaseSheepHere() {
  spendAction(() => {
    const cellId = selectedCellId();
    if (state.planetPreset !== "earth") {
      return labels().sheepAsteroidUnavailable;
    }
    if (!isSheepLandCell(cellId)) {
      return labels().sheepOcean;
    }

    const sheep = createSheepParticle(cellId);
    state.sheep.push(sheep);
    netNeedsFullUpdate = true;
    return {
      message: labels().sheepReleased,
      messageAfter: () => sheep.eatenCarbon > 0 ? labels().sheepGrazed : labels().sheepNoSprouts
    };
  }, "sheep");
}

function createSheepParticle(cellId) {
  const cell = topology.cells[cellId] ?? topology.cells[state.crashCell] ?? topology.cells[state.roseCell];
  const normal = vectorForCell(cell);
  const id = state.sheepCounter ?? 0;
  state.sheepCounter = id + 1;
  return {
    id,
    x: normal.x,
    y: normal.y,
    z: normal.z,
    cellId: cell.id,
    step: 0,
    ageDays: 0,
    energy: SHEEP_INITIAL_ENERGY,
    seed: 1379 + id * 7919 + cell.id * 17,
    heading: seededNoise(cell.id, 1397 + id) * Math.PI * 2,
    memory: {},
    trail: [cell.id],
    eatenCarbon: 0,
    returnedNutrient: 0
  };
}

function isSheepLandCell(cellId) {
  if (state.planetPreset !== "earth") {
    return false;
  }
  const cell = topology.cells[cellId];
  if (!cell) {
    return false;
  }
  return state.terrain[cellId] !== "water" &&
    state.land[cellId] !== "earthOcean" &&
    state.land[cellId] !== "earthCoast";
}

function advanceSheepPeriod(dtDays) {
  if (state.planetPreset !== "earth" || !Array.isArray(state.sheep) || state.sheep.length === 0 || dtDays <= 0) {
    return;
  }

  let changed = false;
  const survivors = [];
  let removedCount = 0;
  for (const sheep of state.sheep) {
    sheep.ageDays = (sheep.ageDays ?? 0) + dtDays;
    sheep.energy = Math.max(0, (sheep.energy ?? SHEEP_INITIAL_ENERGY) - SHEEP_MAINTENANCE_COST_PER_DAY * dtDays);
    decaySheepMemory(sheep, dtDays);
    const beforeCell = sheep.cellId;
    moveSheepParticle(sheep, dtDays);
    const grazed = grazeSheepAtCell(sheep.cellId, SHEEP_GRAZE_WORK_PER_DAY * dtDays, sheep);
    if (grazed.eatenCarbon > 0 || sheep.cellId !== beforeCell) {
      changed = true;
    }
    if ((sheep.energy ?? 0) > 0) {
      survivors.push(sheep);
    } else {
      removedCount += 1;
      changed = true;
    }
  }
  if (removedCount > 0) {
    state.sheep = survivors;
    addEventLogEntry(labels().sheepGone);
  }
  if (changed) {
    netNeedsFullUpdate = true;
  }
}

function moveSheepParticle(sheep, dtDays) {
  const candidates = sheepMoveCandidateCells(sheep.cellId);
  if (candidates.length === 0) {
    return;
  }

  const currentCellId = sheep.cellId;
  const acceptedCellId = sampleSheepSoftmaxCandidate(sheep, currentCellId, candidates);
  const nextPosition = sheepPositionWithinCell(acceptedCellId, sheep, sheep.step);
  const heading = sheepHeadingForMove(currentCellId, acceptedCellId, sheep);
  setSheepParticlePosition(sheep, nextPosition, acceptedCellId, heading);
  sheep.step += 1;
}

function sheepMoveCandidateCells(cellId) {
  const candidates = [cellId];
  for (const neighborId of neighborsOf(cellId)) {
    if (isSheepLandCell(neighborId)) {
      candidates.push(neighborId);
    }
  }
  return candidates;
}

function sampleSheepSoftmaxCandidate(sheep, originCellId, candidates) {
  if (candidates.length === 1) {
    return candidates[0];
  }

  const utilities = candidates.map((cellId) => sheepMoveUtility(sheep, originCellId, cellId));
  const maxUtility = utilities.reduce((maximum, value) => Math.max(maximum, value), -Infinity);
  const temperature = sheepPolicyTemperature();
  let totalWeight = 0;
  const weights = new Float64Array(candidates.length);
  for (let index = 0; index < candidates.length; index += 1) {
    const weight = Math.exp((utilities[index] - maxUtility) / temperature);
    weights[index] = weight;
    totalWeight += weight;
  }
  if (!(totalWeight > 0) || !Number.isFinite(totalWeight)) {
    const fallbackIndex = Math.floor(seededNoise(sheep.seed + sheep.step, 211) * candidates.length) % candidates.length;
    return candidates[fallbackIndex];
  }

  let draw = seededNoise(sheep.seed + sheep.step, 307) * totalWeight;
  for (let index = 0; index < candidates.length; index += 1) {
    draw -= weights[index];
    if (draw <= 0) {
      return candidates[index];
    }
  }
  return candidates[candidates.length - 1];
}

function sheepMoveUtility(sheep, originCellId, cellId) {
  const local = sheepCellUtility(sheep, cellId);
  const lookahead = SHEEP_LOOKAHEAD_WEIGHT * sheepLookaheadValue(sheep, cellId);
  const recentPenalty = sheepRecentVisitPenalty(sheep, originCellId, cellId);
  return local + lookahead - recentPenalty;
}

function sheepCellUtility(sheep, cellId) {
  if (!isSheepLandCell(cellId)) {
    return -100;
  }
  const forage = sheepLocalForageValue(cellId);
  const memory = SHEEP_MEMORY_WEIGHT * sheepMemoryValue(sheep, cellId);
  const firePenalty = (state.burning?.[cellId] ?? 0) * SHEEP_FIRE_AVOIDANCE;
  const wetPenalty =
    Math.max(0, (state.surfaceWater?.[cellId] ?? 0) - 0.08) * SHEEP_WET_AVOIDANCE +
    Math.max(0, (state.topSoilWater?.[cellId] ?? 0) - 0.72) * SHEEP_WET_AVOIDANCE;
  return forage + memory - firePenalty - wetPenalty;
}

function sheepLocalForageValue(cellId) {
  return SHEEP_BAOBAB_SPROUT_VALUE * sheepBaobabSproutForage(cellId) +
    SHEEP_ROSE_SPROUT_VALUE * sheepRoseSproutForage(cellId);
}

function sheepLookaheadValue(sheep, startCellId) {
  if (!isSheepLandCell(startCellId)) {
    return -100;
  }

  const visited = new Set([startCellId]);
  let frontier = [startCellId];
  let best = 0;
  let bulk = 0;
  for (let ring = 0; ring <= SHEEP_LOOKAHEAD_RINGS && frontier.length > 0; ring += 1) {
    const ringWeight = Math.exp(-SHEEP_LOOKAHEAD_DECAY * ring);
    const nextFrontier = [];
    for (const cellId of frontier) {
      const value = Math.max(0, sheepCellUtility(sheep, cellId));
      const weightedValue = value * ringWeight;
      best = Math.max(best, weightedValue);
      bulk += weightedValue;
      if (ring >= SHEEP_LOOKAHEAD_RINGS) {
        continue;
      }
      for (const neighborId of neighborsOf(cellId)) {
        if (visited.has(neighborId) || !isSheepLandCell(neighborId)) {
          continue;
        }
        visited.add(neighborId);
        nextFrontier.push(neighborId);
      }
    }
    frontier = nextFrontier;
  }
  return best + bulk * SHEEP_LOOKAHEAD_BULK_WEIGHT;
}

function sheepRecentVisitPenalty(sheep, originCellId, cellId) {
  if (cellId === originCellId || !Array.isArray(sheep.trail)) {
    return 0;
  }
  const index = sheep.trail.lastIndexOf(cellId);
  if (index < 0) {
    return 0;
  }
  const age = sheep.trail.length - 1 - index;
  return SHEEP_RECENT_VISIT_PENALTY / (1 + age);
}

function sheepBaobabSproutForage(cellId) {
  const mass = baobabPlantCarbonAt(cellId);
  return mass > BAOBAB_HIDDEN_THRESHOLD && mass <= SHEEP_MAX_BAOBAB_SPROUT_MASS ? sheepBaobabEdibleCarbon(cellId) : 0;
}

function sheepRoseSproutForage(cellId) {
  const mass = rosePlantCarbonAt(cellId);
  return mass > 0.01 && mass <= SHEEP_MAX_ROSE_SPROUT_MASS ? sheepRoseEdibleCarbon(cellId) : 0;
}

function sheepBaobabEdibleCarbon(cellId) {
  const modelState = vegetationModelState();
  if (!modelState) {
    return 0;
  }
  const leaf = Math.max(0, modelState.baobabLeaf?.[cellId] ?? 0);
  const stem = Math.max(0, modelState.baobabStem?.[cellId] ?? 0);
  const store = Math.max(0, modelState.baobabStore?.[cellId] ?? 0);
  return leaf + stem * 0.35 + store * 0.08;
}

function sheepRoseEdibleCarbon(cellId) {
  const modelState = vegetationModelState();
  if (!modelState) {
    return 0;
  }
  const leaf = Math.max(0, modelState.roseLeaf?.[cellId] ?? 0);
  const flower = Math.max(0, modelState.roseFlower?.[cellId] ?? 0);
  const store = Math.max(0, modelState.roseStore?.[cellId] ?? 0);
  return leaf + flower * 0.55 + store * 0.06;
}

function sheepPolicyTemperature() {
  return Math.max(SHEEP_SOFTMAX_TEMPERATURE_MIN, SHEEP_SOFTMAX_TEMPERATURE);
}

function sheepMemoryValue(sheep, cellId) {
  return Math.max(0, Number(sheep.memory?.[cellId] ?? 0));
}

function updateSheepMemoryFromVisit(sheep, cellId, rewardCarbon) {
  sheep.memory ??= {};
  const previous = sheepMemoryValue(sheep, cellId);
  const target = Math.min(SHEEP_MEMORY_MAX, Math.max(0, rewardCarbon) * SHEEP_MEMORY_REWARD_SCALE);
  const next = previous + SHEEP_MEMORY_LEARNING_RATE * (target - previous);
  if (next < 0.001) {
    delete sheep.memory[cellId];
  } else {
    sheep.memory[cellId] = next;
  }
}

function decaySheepMemory(sheep, dtDays) {
  if (!sheep.memory || dtDays <= 0) {
    return;
  }
  const factor = Math.exp(-SHEEP_MEMORY_DECAY_PER_DAY * dtDays);
  for (const key of Object.keys(sheep.memory)) {
    const next = Number(sheep.memory[key]) * factor;
    if (next < 0.001) {
      delete sheep.memory[key];
    } else {
      sheep.memory[key] = next;
    }
  }
}

function sheepPositionWithinCell(cellId, sheep, salt) {
  const cell = topology.cells[cellId];
  if (!cell) {
    return new THREE.Vector3(sheep.x, sheep.y, sheep.z).normalize();
  }
  const normal = vectorForCell(cell);
  const spacing = sheepCellAngularSpacing(cellId);
  const jitterAngle = spacing * 0.16 * Math.sqrt(seededNoise(cellId + sheep.id * 43, salt + 419));
  const jitterPhase = seededNoise(cellId + sheep.id * 47, salt + 421) * Math.PI * 2;
  const { tangentA, tangentB } = tangentFrame(normal);
  const direction = tangentA.multiplyScalar(Math.cos(jitterPhase)).addScaledVector(tangentB, Math.sin(jitterPhase)).normalize();
  const point = normal.multiplyScalar(Math.cos(jitterAngle)).addScaledVector(direction, Math.sin(jitterAngle)).normalize();
  const actualCellId = cellIdForSimulationSpherePoint(point);
  if (actualCellId === cellId) {
    return point;
  }
  return vectorForCell(cell);
}

function sheepHeadingForMove(fromCellId, toCellId, sheep) {
  if (fromCellId === toCellId) {
    return sheep.heading ?? seededNoise(toCellId, 431 + sheep.id) * Math.PI * 2;
  }
  const from = topology.cells[fromCellId];
  const to = topology.cells[toCellId];
  if (!from || !to) {
    return sheep.heading ?? 0;
  }
  const normal = vectorForCell(to);
  const fromVector = vectorForCell(from);
  const diff = normal.clone().sub(fromVector);
  const travel = diff.addScaledVector(normal, -normal.dot(diff));
  if (travel.lengthSq() <= 1e-8) {
    return sheep.heading ?? 0;
  }
  travel.normalize();
  const { tangentA, tangentB } = tangentFrame(normal);
  return Math.atan2(travel.dot(tangentB), travel.dot(tangentA));
}

function setSheepParticlePosition(sheep, position, cellId, heading) {
  sheep.x = position.x;
  sheep.y = position.y;
  sheep.z = position.z;
  sheep.cellId = cellId;
  sheep.heading = heading;
  sheep.trail ??= [];
  sheep.trail.push(cellId);
  if (sheep.trail.length > SHEEP_TRAIL_LENGTH) {
    sheep.trail.splice(0, sheep.trail.length - SHEEP_TRAIL_LENGTH);
  }
}

function sheepCellAngularSpacing(cellId) {
  const cell = topology.cells[cellId];
  if (!cell) {
    return Math.sqrt((4 * Math.PI) / topology.cells.length);
  }
  let nearest = Infinity;
  for (const neighborId of neighborsOf(cellId)) {
    const neighbor = topology.cells[neighborId];
    if (!neighbor) {
      continue;
    }
    nearest = Math.min(nearest, Math.acos(THREE.MathUtils.clamp(cellNormalDot(cell, neighbor), -1, 1)));
  }
  return Number.isFinite(nearest) ? nearest : Math.sqrt((4 * Math.PI) / topology.cells.length);
}

function cellIdForSimulationSpherePoint(point) {
  const length = point.length();
  if (length <= 0) {
    return null;
  }
  const height = THREE.MathUtils.clamp(point.z / length, -1, 1);
  const phi = Math.atan2(point.y, point.x);
  const ring = ringForHeightInTopology(height, topology);
  return topology.cellAtPhi(ring, phi);
}

function ringForHeightInTopology(height, sourceTopology) {
  let bestRing = 1;
  let bestDistance = Infinity;
  for (let ring = 1; ring <= sourceTopology.maxRing; ring += 1) {
    const firstCellId = sourceTopology.rings.get(ring)?.[0];
    if (firstCellId === undefined) {
      continue;
    }
    const distance = Math.abs((sourceTopology.cells[firstCellId]?.height ?? 0) - height);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestRing = ring;
    }
  }
  return bestRing;
}

function grazeSheepAtCell(cellId, work, sheep) {
  const modelState = vegetationModelState();
  if (!modelState || !isSheepLandCell(cellId) || work <= 0) {
    return { eatenCarbon: 0, returnedNutrient: 0 };
  }

  let remainingWork = work;
  let eatenCarbon = 0;
  let returnedNutrient = 0;

  const baobabMass = baobabPlantCarbonAt(cellId);
  if (baobabMass > BAOBAB_HIDDEN_THRESHOLD && baobabMass <= SHEEP_MAX_BAOBAB_SPROUT_MASS && remainingWork > 0) {
    const forage = sheepBaobabEdibleCarbon(cellId);
    const pressure = Math.min(remainingWork, forage);
    const removed = grazeBaobabSproutCarbon(cellId, pressure);
    if (removed > 0) {
      const targetId = sheepDungTargetCell(cellId, sheep, 301);
      const returned = recordGrazingCarbon(cellId, targetId, removed);
      eatenCarbon += removed;
      returnedNutrient += returned.returnedNutrient;
      remainingWork = Math.max(0, remainingWork - pressure);
    }
  }

  const roseMass = rosePlantCarbonAt(cellId);
  if (roseMass > 0.01 && roseMass <= SHEEP_MAX_ROSE_SPROUT_MASS && remainingWork > 0) {
    const forage = sheepRoseEdibleCarbon(cellId);
    const pressure = Math.min(remainingWork, forage);
    const removed = grazeRoseSproutCarbon(cellId, pressure);
    if (removed > 0) {
      const targetId = sheepDungTargetCell(cellId, sheep, 503);
      const returned = recordGrazingCarbon(cellId, targetId, removed);
      eatenCarbon += removed;
      returnedNutrient += returned.returnedNutrient;
      remainingWork = Math.max(0, remainingWork - pressure);
    }
  }

  updateSheepMemoryFromVisit(sheep, cellId, eatenCarbon);

  if (eatenCarbon > 0) {
    sheep.energy = Math.min(
      SHEEP_MAX_ENERGY,
      (sheep.energy ?? SHEEP_INITIAL_ENERGY) + eatenCarbon * SHEEP_ENERGY_GAIN_PER_CARBON
    );
    sheep.eatenCarbon += eatenCarbon;
    sheep.returnedNutrient += returnedNutrient;
    state.sheepEatenCarbon = (state.sheepEatenCarbon ?? 0) + eatenCarbon;
    state.sheepReturnedNutrient = (state.sheepReturnedNutrient ?? 0) + returnedNutrient;
  }
  return { eatenCarbon, returnedNutrient };
}

function sheepDungTargetCell(cellId, sheep, salt) {
  const candidates = [cellId, ...neighborsOf(cellId).filter((neighborId) => isSheepLandCell(neighborId))];
  if (candidates.length <= 1) {
    return cellId;
  }
  const index = Math.floor(seededNoise(sheep.seed + sheep.step, salt) * candidates.length) % candidates.length;
  return candidates[index];
}

function grazeBaobabSproutCarbon(cellId, pressure) {
  const modelState = vegetationModelState();
  if (!modelState || pressure <= 0) {
    return 0;
  }
  const edibleCarbon = Math.max(1e-6, sheepBaobabEdibleCarbon(cellId));
  const fraction = clamp01(pressure / edibleCarbon);
  const before = baobabPlantCarbonAt(cellId);
  modelState.baobabLeaf[cellId] = Math.max(0, (modelState.baobabLeaf[cellId] ?? 0) * (1 - fraction));
  modelState.baobabStem[cellId] = Math.max(0, (modelState.baobabStem[cellId] ?? 0) * (1 - fraction * 0.35));
  modelState.baobabRoot[cellId] = Math.max(0, (modelState.baobabRoot[cellId] ?? 0) * (1 - fraction * 0.08));
  modelState.baobabStore[cellId] = Math.max(0, (modelState.baobabStore[cellId] ?? 0) * (1 - fraction * 0.08));
  refreshPlantCarbonAggregates(cellId);
  return Math.max(0, before - baobabPlantCarbonAt(cellId));
}

function grazeRoseSproutCarbon(cellId, pressure) {
  const modelState = vegetationModelState();
  if (!modelState || pressure <= 0) {
    return 0;
  }
  const edibleCarbon = Math.max(1e-6, sheepRoseEdibleCarbon(cellId));
  const fraction = clamp01(pressure / edibleCarbon);
  const before = rosePlantCarbonAt(cellId);
  modelState.roseLeaf[cellId] = Math.max(0, (modelState.roseLeaf[cellId] ?? 0) * (1 - fraction));
  modelState.roseFlower[cellId] = Math.max(0, (modelState.roseFlower[cellId] ?? 0) * (1 - fraction * 0.55));
  modelState.roseRoot[cellId] = Math.max(0, (modelState.roseRoot[cellId] ?? 0) * (1 - fraction * 0.08));
  modelState.roseStore[cellId] = Math.max(0, (modelState.roseStore[cellId] ?? 0) * (1 - fraction * 0.06));
  refreshPlantCarbonAggregates(cellId);
  return Math.max(0, before - rosePlantCarbonAt(cellId));
}

function pullHere() {
  spendAction(() => {
    const cellId = selectedCellId();
    const pullTargets = pullBaobabTargetCells(cellId);
    if (canPullRoseAtCell(cellId) && !hasPullableBaobabInTargets(pullTargets)) {
      return pullNonPrimaryRose(cellId);
    }

    const management = {
      pullBaobab: {
        cellId,
        targets: pullTargets,
        workRate: actionRate(BAOBAB_PULL_WORK),
        centerBefore: baobabDisplayMassAt(cellId),
        affectedCells: new Set(),
        removed: 0
      }
    };
    addCareForcing(management, cellId, 0.16);
    const messageAfter = (currentManagement) => {
      const result = currentManagement?.pullBaobab;
      if (!result || result.removed <= 0) {
        if (hasHiddenBaobabInTargets(result?.targets ?? pullTargets)) {
          return labels().pulledTooSmall;
        }
        if (cellId === state.roseCell) {
          return rosePullMessage();
        }
        return labels().pulledNone;
      }

      syncVegetationToGame();
      if (isRoseAreaCell(cellId)) {
        rememberRose(0.1, 0.04);
        state.lastRoseCareDay = state.day;
      }
      for (const targetId of result.affectedCells) {
        if (targetId !== cellId) {
          state.care[targetId] = clamp01(state.care[targetId] + 0.06);
        }
      }
      if (result.centerBefore >= 0.7 && state.baobab[cellId] >= BAOBAB_PULL_THRESHOLD) {
        return labels().pulledWeakened;
      }
      if (result.affectedCells.size > 1) {
        return labels().pulledPatch;
      }
      return labels().pulled;
    };
    return { message: labels().pulled, management, messageAfter };
  }, "pull");
}

function hasPullableBaobabAtCell(cellId) {
  return baobabDisplayMassAt(cellId) >= BAOBAB_PULL_THRESHOLD;
}

function hasPullableBaobabInTargets(targets) {
  return targets.some((target) => hasPullableBaobabAtCell(target.cellId));
}

function burnHere() {
  spendAction(() => {
    const cellId = selectedCellId();
    if (isProtectedAsteroidRoseCell(cellId)) {
      return labels().burnedProtectedRose;
    }
    if (state.terrain[cellId] === "water") {
      return burnWaterMessageForCell(cellId);
    }

    const burnTargets = burnTargetCells(cellId);
    const result = igniteBurnAround(cellId, BURN_WORK, burnTargets);
    const management = {};
    addCareForcing(management, cellId, 0.04);
    let messageText = labels().burned;
    if (result.affectedCells.size === 0) {
      if (result.volcanoBlocked || state.activeVolcanoMask?.[cellId] === 1 || state.volcanoMask?.[cellId] === 1) {
        messageText = labels().burnedVolcano;
      } else if (result.wetBlocked || state.topSoilWater[cellId] > 0.62) {
        messageText = labels().burnedWet;
      } else {
        messageText = labels().burnedNone;
      }
    } else if (result.earthRoseBurned > 0) {
      messageText = labels().burnedEarthRose;
    } else if (result.stackedFire > 0) {
      messageText = labels().burnedStacked;
    } else if (result.roseDamaged > 0) {
      messageText = labels().burnedRose;
    }
    return { message: messageText, management };
  }, "burn");
}

function burnWaterMessageForCell(cellId) {
  if (state.planetPreset === "earth" || state.land[cellId] === "earthOcean" || state.land[cellId] === "earthCoast") {
    return labels().burnedOcean;
  }
  return labels().burnedWaterReserve;
}

function igniteBurnAround(cellId, work = BURN_WORK, targetCells = burnTargetCells(cellId)) {
  const modelState = vegetationModelState();
  if (!modelState || work <= 0) {
    return emptyBurnResult();
  }

  const result = emptyBurnResult();
  const candidates = [];
  for (const target of targetCells) {
    const cell = topology.cells[target.cellId];
    if (!cell) {
      continue;
    }

    const wetness = Math.max(state.topSoilWater[target.cellId] ?? 0, state.moisture[target.cellId] ?? 0, state.snowIce?.[target.cellId] ?? 0);
    const directEarthRose = state.planetPreset === "earth" &&
      target.cellId === cellId &&
      roseDisplayMassIndex(target.cellId) > EARTH_ROSE_PULL_THRESHOLD;
    if (state.terrain[target.cellId] === "water" || (!directEarthRose && wetness > 0.78)) {
      result.wetBlocked = true;
      continue;
    }
    if (state.activeVolcanoMask?.[target.cellId] === 1 || state.volcanoMask?.[target.cellId] === 1) {
      result.volcanoBlocked = true;
      continue;
    }

    const dryness = directEarthRose
      ? Math.max(0.42, clamp01((0.82 - wetness) / 0.52))
      : clamp01((0.82 - wetness) / 0.52);
    const roseFuel = state.planetPreset === "earth"
      ? Math.min(0.42, roseDisplayMassIndex(target.cellId)) * 1.05
      : Math.min(0.22, state.flower[target.cellId] ?? 0) * 0.24;
    const fuel =
      (modelState.baobabSeed?.[target.cellId] ?? 0) * 1.9 +
      Math.min(0.34, baobabDisplayMassAt(target.cellId)) * 0.9 +
      (modelState.roseSeed?.[target.cellId] ?? 0) * 1.9 +
      roseFuel;
    if (dryness <= 0.02 || fuel <= 0.002) {
      if (dryness <= 0.02) {
        result.wetBlocked = true;
      }
      continue;
    }

    const weight = Math.max(BURN_MIN_SPATIAL_WEIGHT, target.spatialWeight) * dryness * Math.sqrt(fuel);
    candidates.push({ ...target, dryness, fuel, weight });
  }

  for (const target of candidates) {
    const fuelExposure = 0.35 + 0.65 * Math.sqrt(clamp01(target.fuel * 2.4));
    const burnPressure = work * target.weight * target.dryness * fuelExposure;
    const burned = igniteBurnCell(target.cellId, burnPressure);
    result.seedBurned += burned.seedBurned;
    result.baobabBurned += burned.baobabBurned;
    result.roseDamaged += burned.roseDamaged;
    result.earthRoseBurned += burned.earthRoseBurned ?? 0;
    result.stackedFire += burned.stackedFire ?? 0;
    result.ashAdded += burned.ashAdded ?? 0;
    if (burned.total > 0) {
      result.affectedCells.add(target.cellId);
    }
  }

  if (result.affectedCells.size > 0) {
    netNeedsFullUpdate = true;
  }
  return result;
}

function igniteBurnCell(cellId, burnPressure) {
  const modelState = vegetationModelState();
  const result = { seedBurned: 0, baobabBurned: 0, roseDamaged: 0, earthRoseBurned: 0, stackedFire: 0, ashAdded: 0, total: 0 };
  if (!modelState || burnPressure <= 0) {
    return result;
  }

  const baobabSeed = Math.max(0, modelState.baobabSeed?.[cellId] ?? 0);
  const roseSeed = Math.max(0, modelState.roseSeed?.[cellId] ?? 0);
  const seedBurnLimit = burnPressure * 0.5;
  const baobabSeedTarget = Math.min(baobabSeed, seedBurnLimit);
  const roseSeedTarget = Math.min(roseSeed, seedBurnLimit);
  const baobabMass = baobabDisplayMassAt(cellId);
  const ignitionFraction = clamp01((burnPressure - 0.025) / 0.16);
  const baobabTarget =
    baobabMass > BAOBAB_HIDDEN_THRESHOLD
      ? Math.min(baobabMass, baobabMass * ignitionFraction)
      : 0;
  const roseMass = roseDisplayMassIndex(cellId);
  const roseTarget =
    roseMass > 0.03 && burnPressure > (state.planetPreset === "earth" ? 0.02 : 0.05)
      ? state.planetPreset === "earth"
        ? roseMass
        : Math.min(roseMass, burnPressure * (isRoseAreaCell(cellId) ? 0.05 : 0.022))
      : 0;
  const hasEarthRoseTarget = state.planetPreset === "earth" && roseTarget > 0;
  const roseFuelFactor = hasEarthRoseTarget ? EARTH_ROSE_BURN_FUEL_FACTOR : 0.9;
  const heatFuelFactor = hasEarthRoseTarget ? EARTH_ROSE_BURN_HEAT_FUEL_FACTOR : 0.08;
  const addedFuel =
    baobabSeedTarget * 0.5 +
    roseSeedTarget * 0.42 +
    baobabTarget * 1.65 +
    roseTarget * roseFuelFactor +
    burnPressure * heatFuelFactor;

  if (addedFuel <= 1e-5) {
    return result;
  }

  state.burnBaobabSeedTarget[cellId] = Math.min(baobabSeed, (state.burnBaobabSeedTarget[cellId] ?? 0) + baobabSeedTarget);
  state.burnRoseSeedTarget[cellId] = Math.min(roseSeed, (state.burnRoseSeedTarget[cellId] ?? 0) + roseSeedTarget);
  state.burnBaobabTarget[cellId] = Math.min(baobabMass, (state.burnBaobabTarget[cellId] ?? 0) + baobabTarget);
  state.burnRoseTarget[cellId] = Math.min(roseMass, (state.burnRoseTarget[cellId] ?? 0) + roseTarget);
  const currentFuel = state.burnFuel[cellId] ?? 0;
  const currentInitialFuel = state.burnInitialFuel[cellId] ?? 0;
  const currentIntensity = state.burning[cellId] ?? 0;
  const ignitionIntensity = 0.38 + Math.sqrt(clamp01(burnPressure)) * 0.52 + (hasEarthRoseTarget ? 0.7 : 0);
  const stackBoost = currentIntensity > BURNING_MARKER_THRESHOLD
    ? BURN_INTENSITY_STACK_BOOST * (0.45 + 0.55 * clamp01(burnPressure))
    : 0;
  state.burnFuel[cellId] = currentFuel + addedFuel;
  state.burnInitialFuel[cellId] = currentInitialFuel > 0
    ? currentInitialFuel + addedFuel
    : state.burnFuel[cellId];
  state.burning[cellId] = Math.min(
    BURN_INTENSITY_MAX,
    Math.max(ignitionIntensity, currentIntensity + stackBoost)
  );

  result.seedBurned = baobabSeedTarget;
  result.baobabBurned = baobabTarget;
  result.roseDamaged += roseSeedTarget + roseTarget;
  if (state.planetPreset === "earth" && roseTarget > 0) {
    result.earthRoseBurned += roseTarget;
  }
  result.stackedFire = currentIntensity > BURNING_MARKER_THRESHOLD ? 1 : 0;
  result.total = addedFuel;
  return result;
}

function burnAround(cellId, work = BURN_WORK, targetCells = burnTargetCells(cellId)) {
  const modelState = vegetationModelState();
  if (!modelState || work <= 0) {
    return emptyBurnResult();
  }

  const result = emptyBurnResult();
  const candidates = [];
  for (const target of targetCells) {
    const cell = topology.cells[target.cellId];
    if (!cell) {
      continue;
    }

    const wetness = Math.max(state.topSoilWater[target.cellId] ?? 0, state.moisture[target.cellId] ?? 0, state.snowIce?.[target.cellId] ?? 0);
    const directEarthRose = state.planetPreset === "earth" &&
      target.cellId === cellId &&
      roseDisplayMassIndex(target.cellId) > EARTH_ROSE_PULL_THRESHOLD;
    if (state.terrain[target.cellId] === "water" || (!directEarthRose && wetness > 0.78)) {
      result.wetBlocked = true;
      continue;
    }
    if (state.activeVolcanoMask?.[target.cellId] === 1 || state.volcanoMask?.[target.cellId] === 1) {
      result.volcanoBlocked = true;
      continue;
    }

    const dryness = directEarthRose
      ? Math.max(0.42, clamp01((0.82 - wetness) / 0.52))
      : clamp01((0.82 - wetness) / 0.52);
    const roseFuel = state.planetPreset === "earth"
      ? Math.min(0.42, roseDisplayMassIndex(target.cellId)) * 1.05
      : Math.min(0.22, state.flower[target.cellId] ?? 0) * 0.24;
    const fuel =
      (modelState.baobabSeed?.[target.cellId] ?? 0) * 1.9 +
      Math.min(0.34, baobabDisplayMassAt(target.cellId)) * 0.9 +
      (modelState.roseSeed?.[target.cellId] ?? 0) * 1.9 +
      roseFuel;
    if (dryness <= 0.02 || fuel <= 0.002) {
      if (dryness <= 0.02) {
        result.wetBlocked = true;
      }
      continue;
    }

    const weight = Math.max(BURN_MIN_SPATIAL_WEIGHT, target.spatialWeight) * dryness * Math.sqrt(fuel);
    candidates.push({ ...target, dryness, fuel, weight });
  }

  if (candidates.length === 0) {
    return result;
  }

  for (const target of candidates) {
    const fuelExposure = 0.35 + 0.65 * Math.sqrt(clamp01(target.fuel * 2.4));
    const burnPressure = work * target.weight * target.dryness * fuelExposure;
    const burned = burnCell(target.cellId, burnPressure);
    result.seedBurned += burned.seedBurned;
    result.baobabBurned += burned.baobabBurned;
    result.roseDamaged += burned.roseDamaged;
    result.ashAdded += burned.ashAdded;
    if (burned.total > 0) {
      result.affectedCells.add(target.cellId);
    }
  }

  return result;
}

function emptyBurnResult() {
  return {
    affectedCells: new Set(),
    seedBurned: 0,
    baobabBurned: 0,
    roseDamaged: 0,
    earthRoseBurned: 0,
    stackedFire: 0,
    ashAdded: 0,
    wetBlocked: false,
    volcanoBlocked: false
  };
}

function burnCell(cellId, burnPressure) {
  const modelState = vegetationModelState();
  const result = { seedBurned: 0, baobabBurned: 0, roseDamaged: 0, ashAdded: 0, total: 0 };
  if (!modelState || burnPressure <= 0) {
    return result;
  }

  const baobabSeedBefore = Math.max(0, modelState.baobabSeed?.[cellId] ?? 0);
  const roseSeedBefore = Math.max(0, modelState.roseSeed?.[cellId] ?? 0);
  const seedBurnLimit = burnPressure * 0.5;
  const baobabSeedBurned = Math.min(baobabSeedBefore, seedBurnLimit);
  const roseSeedBurned = Math.min(roseSeedBefore, seedBurnLimit);
  if (baobabSeedBurned > 0) {
    modelState.baobabSeed[cellId] = Math.max(0, baobabSeedBefore - baobabSeedBurned);
    recordBurnCarbon(cellId, baobabSeedBurned, 0.08, 0.018);
    result.seedBurned += baobabSeedBurned;
  }
  if (roseSeedBurned > 0) {
    modelState.roseSeed[cellId] = Math.max(0, roseSeedBefore - roseSeedBurned);
    recordBurnCarbon(cellId, roseSeedBurned, 0.08, 0.014);
    result.roseDamaged += roseSeedBurned;
  }

  const baobabMass = baobabDisplayMassAt(cellId);
  if (baobabMass > BAOBAB_HIDDEN_THRESHOLD && baobabMass < 0.7) {
    const smallPlantFactor = baobabMass < 0.32 ? 0.18 : 0.055;
    const baobabReduction = Math.min(baobabMass, burnPressure * smallPlantFactor);
    if (baobabReduction > 0) {
      const beforeCarbon = baobabPlantCarbonAt(cellId);
      state.vegetation.removeBaobab(cellId, baobabReduction);
      const removedCarbon = Math.max(0, beforeCarbon - baobabPlantCarbonAt(cellId));
      closeRemovedPlantCarbon(cellId, removedCarbon * 0.08);
      result.baobabBurned += baobabReduction;
    }
  }

  const roseMass = state.flower[cellId] ?? 0;
  if (roseMass > 0.03 && burnPressure > 0.05) {
    const roseReduction = Math.min(roseMass, burnPressure * (isRoseAreaCell(cellId) ? 0.05 : 0.022));
    if (roseReduction > 0) {
      const beforeCarbon = rosePlantCarbonAt(cellId);
      state.vegetation.removeRose(cellId, roseReduction);
      const removedCarbon = Math.max(0, beforeCarbon - rosePlantCarbonAt(cellId));
      closeRemovedPlantCarbon(cellId, removedCarbon * 0.08);
      result.roseDamaged += roseReduction;
    }
  }

  const ashGenerated = Math.min(0.24, burnPressure * 0.13 + result.seedBurned * 0.14 + result.baobabBurned * 0.06);
  if (ashGenerated > 0) {
    result.ashAdded = spreadBurnAsh(cellId, ashGenerated);
  }
  result.total = result.seedBurned + result.baobabBurned + result.roseDamaged + result.ashAdded;
  return result;
}

function advanceBurningPeriod(dtDays) {
  if (!state.burning || dtDays <= 0) {
    return;
  }

  const modelState = vegetationModelState();
  let changed = false;
  for (let cellId = 0; cellId < state.burning.length; cellId += 1) {
    let intensity = state.burning[cellId] ?? 0;
    let fuel = state.burnFuel[cellId] ?? 0;
    if (intensity <= BURNING_MARKER_THRESHOLD || fuel <= 0) {
      continue;
    }

    const initialFuel = Math.max(1e-5, state.burnInitialFuel[cellId] ?? fuel);
    const rainDepthMm = Math.max(0, modelState?.R?.[cellId] ?? 0) * 1000 * dtDays;
    let rainDamping = 1;
    if (rainDepthMm > 0.01) {
      const burnedFractionBeforeRain = clamp01(1 - fuel / initialFuel);
      intensity = Math.max(0, intensity - rainDepthMm * RAIN_FIRE_COOLING_PER_MM);
      rainDamping = 1 / (1 + rainDepthMm * RAIN_FIRE_DAMPING_PER_MM);
      if (intensity <= RAIN_FIRE_CLEAR_INTENSITY) {
        completeBurningCell(cellId, burnedFractionBeforeRain);
        changed = true;
        continue;
      }
      state.burning[cellId] = intensity;
    }
    const burnIntensity = Math.min(BURN_INTENSITY_MAX, intensity);
    const burnsEarthRose = state.planetPreset === "earth" && (state.burnRoseTarget[cellId] ?? 0) > 0;
    const wetness = Math.max(state.topSoilWater[cellId] ?? 0, state.moisture[cellId] ?? 0, state.snowIce?.[cellId] ?? 0);
    const dryness = burnsEarthRose
      ? Math.max(0.5, clamp01((0.86 - wetness) / 0.58))
      : clamp01((0.86 - wetness) / 0.58);
    const burnedFractionBefore = clamp01(1 - fuel / initialFuel);
    const burnRate = BURN_FUEL_CONSUMPTION_PER_DAY *
      (0.55 + burnIntensity * 0.7) *
      (0.45 + dryness * 0.9) *
      (burnsEarthRose ? EARTH_ROSE_BURN_RATE_MULTIPLIER : 1) *
      rainDamping;
    const consumed = Math.min(fuel, burnRate * dtDays);
    if (consumed <= 0) {
      continue;
    }

    state.burnFuel[cellId] = Math.max(0, fuel - consumed);
    const burnedFraction = clamp01(1 - state.burnFuel[cellId] / initialFuel);
    const burnedFractionDelta = Math.max(0, burnedFraction - burnedFractionBefore);
    if (burnsEarthRose && burnedFractionDelta > 1e-6) {
      burnRoseCarbon(cellId, (state.burnRoseTarget[cellId] ?? 0) * burnedFractionDelta);
    }
    const ashGenerated = consumed * BURN_ASH_PER_FUEL;
    if (ashGenerated > 0) {
      spreadBurnAsh(cellId, ashGenerated);
    }
    applyBurnAshCover(cellId, burnedFraction);

    if (state.burnFuel[cellId] <= 1e-5) {
      completeBurningCell(cellId, 1);
    } else {
      const remainingFraction = clamp01(state.burnFuel[cellId] / initialFuel);
      state.burning[cellId] = Math.min(
        BURN_INTENSITY_MAX,
        Math.max(0.24, burnIntensity * Math.sqrt(remainingFraction))
      );
    }
    changed = true;
  }

  if (changed) {
    netNeedsFullUpdate = true;
  }
}

function completeBurningCell(cellId, consumedFraction = 1) {
  const modelState = vegetationModelState();
  const fraction = clamp01(consumedFraction);
  if (modelState && fraction > 0) {
    const storedBaobabSeedTarget = state.burnBaobabSeedTarget[cellId] ?? 0;
    const storedRoseSeedTarget = state.burnRoseSeedTarget[cellId] ?? 0;
    const storedBaobabTarget = state.burnBaobabTarget[cellId] ?? 0;
    const storedRoseTarget = state.burnRoseTarget[cellId] ?? 0;
    const completesFire = fraction >= 0.999;
    const burnsBaobabCell = storedBaobabTarget > BAOBAB_HIDDEN_THRESHOLD || storedBaobabSeedTarget > 0;
    const burnsRoseCell = storedRoseTarget > 0.001 || storedRoseSeedTarget > 0;
    const baobabSeedCurrent = modelState.baobabSeed?.[cellId] ?? 0;
    const roseSeedCurrent = modelState.roseSeed?.[cellId] ?? 0;
    const baobabSeedTarget = Math.min(
      baobabSeedCurrent,
      completesFire && burnsBaobabCell ? baobabSeedCurrent : storedBaobabSeedTarget * fraction
    );
    const roseSeedTarget = Math.min(
      roseSeedCurrent,
      completesFire && burnsRoseCell ? roseSeedCurrent : storedRoseSeedTarget * fraction
    );
    if (baobabSeedTarget > 0) {
      modelState.baobabSeed[cellId] = Math.max(0, modelState.baobabSeed[cellId] - baobabSeedTarget);
      recordBurnCarbon(cellId, baobabSeedTarget, 0.08, 0.018);
    }
    if (roseSeedTarget > 0) {
      modelState.roseSeed[cellId] = Math.max(0, modelState.roseSeed[cellId] - roseSeedTarget);
      recordBurnCarbon(cellId, roseSeedTarget, 0.08, 0.014);
    }

    const currentBaobabMass = baobabDisplayMassAt(cellId);
    const baobabTarget = Math.min(
      currentBaobabMass,
      completesFire && storedBaobabTarget > BAOBAB_HIDDEN_THRESHOLD
        ? currentBaobabMass
        : storedBaobabTarget * fraction
    );
    if (baobabTarget > 0) {
      burnBaobabCarbon(cellId, baobabTarget);
    }

    const currentRoseMass = roseDisplayMassIndex(cellId);
    const roseTarget = Math.min(
      currentRoseMass,
      completesFire && storedRoseTarget > 0.001
        ? currentRoseMass
        : storedRoseTarget * fraction
    );
    if (roseTarget > 0) {
      burnRoseCarbon(cellId, roseTarget);
    }
  }

  applyBurnAshCover(cellId, fraction);
  clearBurningCell(cellId);
}

function burnBaobabCarbon(cellId, amount) {
  const modelState = vegetationModelState();
  const burnAmount = Math.max(0, amount);
  if (!modelState || burnAmount <= 0) {
    return 0;
  }

  const leaf = modelState.baobabLeaf?.[cellId] ?? 0;
  const stem = modelState.baobabStem?.[cellId] ?? 0;
  const root = modelState.baobabRoot?.[cellId] ?? 0;
  const store = modelState.baobabStore?.[cellId] ?? 0;
  const displayMass = Math.max(1e-6, baobabDisplayMassAt(cellId));
  const fraction = clamp01(burnAmount / displayMass);
  const before = leaf + stem + root + store;

  modelState.baobabLeaf[cellId] = leaf * (1 - fraction);
  modelState.baobabStem[cellId] = stem * (1 - fraction);
  modelState.baobabRoot[cellId] = root * (1 - fraction);
  modelState.baobabStore[cellId] = store * (1 - fraction);
  modelState.MB[cellId] =
    modelState.baobabLeaf[cellId] +
    modelState.baobabStem[cellId] +
    modelState.baobabRoot[cellId];
  modelState.SB[cellId] = modelState.baobabStore[cellId];

  const after =
    modelState.baobabLeaf[cellId] +
    modelState.baobabStem[cellId] +
    modelState.baobabRoot[cellId] +
    modelState.baobabStore[cellId];
  const removed = Math.max(0, before - after);
  recordBurnCarbon(cellId, removed, 0.08, 0.018);
  return removed;
}

function burnRoseCarbon(cellId, amount) {
  const modelState = vegetationModelState();
  const burnAmount = Math.max(0, amount);
  if (!modelState || burnAmount <= 0) {
    return 0;
  }

  const leaf = modelState.roseLeaf?.[cellId] ?? 0;
  const flower = modelState.roseFlower?.[cellId] ?? 0;
  const root = modelState.roseRoot?.[cellId] ?? 0;
  const store = modelState.roseStore?.[cellId] ?? 0;
  const displayMass = Math.max(1e-6, roseDisplayMassIndex(cellId));
  const fraction = clamp01(burnAmount / displayMass);
  const before = leaf + flower + root + store;

  modelState.roseLeaf[cellId] = leaf * (1 - fraction);
  modelState.roseFlower[cellId] = flower * (1 - fraction);
  modelState.roseRoot[cellId] = root * (1 - fraction);
  modelState.roseStore[cellId] = store * (1 - fraction);
  modelState.MR[cellId] =
    modelState.roseLeaf[cellId] +
    modelState.roseFlower[cellId] +
    modelState.roseRoot[cellId];
  if (modelState.SR) {
    modelState.SR[cellId] = modelState.roseStore[cellId];
  }

  const after =
    modelState.roseLeaf[cellId] +
    modelState.roseFlower[cellId] +
    modelState.roseRoot[cellId] +
    modelState.roseStore[cellId];
  const removed = Math.max(0, before - after);
  recordBurnCarbon(cellId, removed, 0.08, 0.014);
  return removed;
}

function applyBurnAshCover(cellId, consumedFraction = 1) {
  const modelState = vegetationModelState();
  const fuel = Math.max(0, state.burnInitialFuel[cellId] ?? state.burnFuel[cellId] ?? 0);
  const cover = clamp01((0.055 + Math.sqrt(fuel) * 0.18) * clamp01(consumedFraction));
  if (cover <= 0) {
    return;
  }
  for (const target of burnAshDepositCells(cellId)) {
    const tierFactor =
      target.tier === 0 ? 1 :
        target.tier === 1 ? 0.72 :
          target.tier === 2 ? 0.46 :
            0.28;
    const distanceFactor = target.distance <= 0 ? 1 : Math.exp(-((target.distance / 0.08) ** 2));
    const targetCover = cover * tierFactor * (0.45 + 0.55 * distanceFactor);
    const before = state.ash[target.cellId] ?? 0;
    const after = Math.max(before, targetCover);
    state.ash[target.cellId] = after;
    if (modelState?.ashStress) {
      modelState.ashStress[target.cellId] = Math.max(modelState.ashStress[target.cellId] ?? before, after);
    }
  }
}

function clearBurningCell(cellId) {
  state.burning[cellId] = 0;
  state.burnFuel[cellId] = 0;
  state.burnInitialFuel[cellId] = 0;
  state.burnBaobabTarget[cellId] = 0;
  state.burnRoseTarget[cellId] = 0;
  state.burnBaobabSeedTarget[cellId] = 0;
  state.burnRoseSeedTarget[cellId] = 0;
}

function spreadBurnAsh(sourceCellId, ashAmount) {
  const modelState = vegetationModelState();
  const sourceCell = topology.cells[sourceCellId];
  if (!modelState || !sourceCell || ashAmount <= 0) {
    return 0;
  }

  const targets = burnAshDepositCells(sourceCellId);
  let totalWeight = 0;
  for (const target of targets) {
    const cell = topology.cells[target.cellId];
    if (!cell) {
      continue;
    }
    const waterDamping = state.terrain[target.cellId] === "water" ? 0.25 : 1;
    const wetDamping = 1 - 0.35 * clamp01(state.topSoilWater[target.cellId] ?? 0);
    target.weight = Math.max(0, target.weight * waterDamping * wetDamping);
    totalWeight += target.weight;
  }

  if (totalWeight <= 0) {
    return 0;
  }

  const totalAsh = ashAmount * BURN_ASH_SPREAD_MULTIPLIER;
  let added = 0;
  for (const target of targets) {
    if (target.weight <= 0) {
      continue;
    }
    const targetId = target.cellId;
    const deposit = totalAsh * (target.weight / totalWeight);
    const before = state.ash[targetId] ?? 0;
    const after = clamp01(before + deposit);
    const actual = Math.max(0, after - before);
    if (actual <= 0) {
      continue;
    }
    state.ash[targetId] = after;
    if (modelState.ashStress) {
      modelState.ashStress[targetId] = clamp01((modelState.ashStress[targetId] ?? before) + actual);
    }
    const nutrientPulse = actual * 0.11;
    state.soilNutrient[targetId] = clamp01((state.soilNutrient[targetId] ?? 0) + nutrientPulse);
    if (modelState.soilMineralN) {
      modelState.soilMineralN[targetId] = clamp01((modelState.soilMineralN[targetId] ?? 0) + nutrientPulse);
    }
    added += actual;
  }
  return added;
}

function burnAshDepositCells(sourceCellId) {
  const sourceCell = topology.cells[sourceCellId];
  if (!sourceCell) {
    return [];
  }

  const targets = [];
  const seen = new Set();
  const addTarget = (targetId, tier) => {
    if (seen.has(targetId)) {
      return;
    }
    const targetCell = topology.cells[targetId];
    if (!targetCell) {
      return;
    }
    seen.add(targetId);
    const dot = cellNormalDot(sourceCell, targetCell);
    const distance = targetId === sourceCellId ? 0 : Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
    targets.push({ cellId: targetId, distance, tier, weight: 1 });
  };

  addTarget(sourceCellId, 0);
  for (const neighborId of neighborsOf(sourceCellId)) {
    addTarget(neighborId, 1);
    for (const secondNeighborId of neighborsOf(neighborId)) {
      addTarget(secondNeighborId, 2);
    }
  }
  for (const targetId of burnAshPatchCells(sourceCellId)) {
    addTarget(targetId, 3);
  }

  let nearestNeighborDistance = Infinity;
  let maximumDistance = 0;
  for (const target of targets) {
    if (target.distance > 0) {
      nearestNeighborDistance = Math.min(nearestNeighborDistance, target.distance);
      maximumDistance = Math.max(maximumDistance, target.distance);
    }
  }
  if (!Number.isFinite(nearestNeighborDistance)) {
    nearestNeighborDistance = Math.sqrt((4 * Math.PI) / topology.cells.length);
  }
  const radius = Math.max(nearestNeighborDistance * 2.35, maximumDistance * 0.42, 1e-6);
  for (const target of targets) {
    const distanceWeight = target.distance <= 0
      ? 1
      : Math.exp(-((target.distance / radius) ** 2));
    const tierWeight =
      target.tier === 0 ? 2.2 :
        target.tier === 1 ? 1.05 :
          target.tier === 2 ? 0.72 :
            0.48;
    target.weight = distanceWeight * tierWeight;
  }

  return targets;
}

function burnAshPatchCells(cellId) {
  const cell = topology.cells[cellId];
  if (!cell || topology.nside <= BURN_ASH_SPREAD_NSIDE) {
    return [cellId];
  }

  const scale = topology.nside / BURN_ASH_SPREAD_NSIDE;
  const patchIx = Math.floor(cell.ix / scale);
  const patchIy = Math.floor(cell.iy / scale);
  return topology.cells
    .filter((candidate) =>
      candidate.face === cell.face &&
      Math.floor(candidate.ix / scale) === patchIx &&
      Math.floor(candidate.iy / scale) === patchIy
    )
    .map((candidate) => candidate.id);
}

function recordBurnCarbon(cellId, removedCarbon, returnedFraction = 0.08, nutrientFraction = 0.015) {
  const modelState = vegetationModelState();
  const removed = Math.max(0, removedCarbon);
  if (!modelState || removed <= 0) {
    return;
  }

  const returned = removed * THREE.MathUtils.clamp(returnedFraction, 0, 1);
  const emitted = Math.max(0, removed - returned);
  if (returned > 0) {
    modelState.soilCarbonActive[cellId] = (modelState.soilCarbonActive[cellId] ?? 0) + returned * 0.35;
    modelState.soilCarbonStable[cellId] = (modelState.soilCarbonStable[cellId] ?? 0) + returned * 0.65;
    modelState.litterInputCarbon[cellId] = (modelState.litterInputCarbon[cellId] ?? 0) + returned;
  }
  if (emitted > 0) {
    modelState.disturbanceCarbonExportC[cellId] = (modelState.disturbanceCarbonExportC[cellId] ?? 0) + emitted;
    modelState.carbonDisturbanceC[cellId] = (modelState.carbonDisturbanceC[cellId] ?? 0) + emitted;
    modelState.carbonStorageChangeC[cellId] = (modelState.carbonStorageChangeC[cellId] ?? 0) - emitted;
  }
  if (nutrientFraction > 0 && modelState.soilMineralN) {
    modelState.soilMineralN[cellId] = clamp01((modelState.soilMineralN[cellId] ?? 0) + removed * nutrientFraction);
  }
  modelState.carbonResidualC[cellId] =
    (modelState.carbonStorageChangeC[cellId] ?? 0) -
    ((modelState.carbonInputC[cellId] ?? 0) +
      (modelState.carbonTransportC[cellId] ?? 0) -
      (modelState.carbonRespirationC[cellId] ?? 0) -
      (modelState.carbonDisturbanceC[cellId] ?? 0));
}

function burnTargetCells(cellId) {
  const centerCell = topology.cells[cellId];
  if (!centerCell) {
    return [];
  }

  const targets = [];
  const seen = new Set();
  const addTarget = (targetId, tier) => {
    if (seen.has(targetId)) {
      return;
    }
    seen.add(targetId);
    const targetCell = topology.cells[targetId];
    if (!targetCell) {
      return;
    }
    const dot = cellNormalDot(centerCell, targetCell);
    const distance = targetId === cellId ? 0 : Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
    targets.push({ cellId: targetId, distance, tier, spatialWeight: 1 });
  };

  addTarget(cellId, 0);
  for (const neighborId of neighborsOf(cellId)) {
    addTarget(neighborId, 1);
  }
  for (const targetId of burnPatchCells(cellId)) {
    addTarget(targetId, 2);
  }

  let nearestNeighborDistance = Infinity;
  let maximumDistance = 0;
  for (const target of targets) {
    if (target.distance > 0) {
      nearestNeighborDistance = Math.min(nearestNeighborDistance, target.distance);
      maximumDistance = Math.max(maximumDistance, target.distance);
    }
  }
  if (!Number.isFinite(nearestNeighborDistance)) {
    nearestNeighborDistance = Math.sqrt((4 * Math.PI) / topology.cells.length);
  }
  const radius = Math.max(nearestNeighborDistance * 1.85, maximumDistance * 0.58, 1e-6);
  for (const target of targets) {
    const distanceWeight = target.distance <= 0
      ? 1
      : Math.exp(-((target.distance / radius) ** 2));
    const tierWeight = target.tier === 0 ? 1 : target.tier === 1 ? 0.78 : 0.48;
    target.spatialWeight = Math.max(BURN_MIN_SPATIAL_WEIGHT, distanceWeight * tierWeight);
  }

  return targets.sort((a, b) =>
    b.spatialWeight - a.spatialWeight ||
    a.distance - b.distance
  );
}

function burnPatchCells(cellId) {
  const cell = topology.cells[cellId];
  if (!cell || topology.nside <= BURN_PATCH_NSIDE) {
    return [cellId];
  }

  const scale = topology.nside / BURN_PATCH_NSIDE;
  const patchIx = Math.floor(cell.ix / scale);
  const patchIy = Math.floor(cell.iy / scale);
  return topology.cells
    .filter((candidate) =>
      candidate.face === cell.face &&
      Math.floor(candidate.ix / scale) === patchIx &&
      Math.floor(candidate.iy / scale) === patchIy
    )
    .map((candidate) => candidate.id);
}

function canPullRoseAtCell(cellId) {
  if (state.planetPreset !== "earth" && cellId === state.roseCell) {
    return false;
  }

  const rosePresence = Math.max(state.flower[cellId] ?? 0, state.roseHeight?.[cellId] ?? 0);
  return rosePresence > EARTH_ROSE_PULL_THRESHOLD;
}

function pullNonPrimaryRose(cellId) {
  const management = {
    pullRose: { cellId, rate: actionRate(0.72) }
  };
  addCareForcing(management, cellId, 0.08);
  rememberRose(0.08, 0.12);
  const message = state.planetPreset === "earth" ? labels().pulledEarthRose : labels().pulledWildRose;
  return { message, management, messageAfter: () => {
    syncVegetationToGame();
    return message;
  } };
}

function hasHiddenBaobab(cellId) {
  const value = baobabDisplayMassAt(cellId);
  return value >= BAOBAB_HIDDEN_THRESHOLD && value < BAOBAB_PULL_THRESHOLD;
}

function hasHiddenBaobabInTargets(targets) {
  return targets.some((target) => hasHiddenBaobab(target.cellId));
}

function pullBaobabAround(cellId, work = BAOBAB_PULL_WORK, targetCells = pullBaobabTargetCells(cellId)) {
  const candidates = pullBaobabCandidates(targetCells);
  let remainingWork = work;
  let removed = 0;
  const affectedCellSet = new Set();
  const centerBefore = baobabDisplayMassAt(cellId);

  for (let pass = 0; pass < BAOBAB_PULL_REDISTRIBUTION_PASSES; pass += 1) {
    if (remainingWork <= 1e-9) {
      break;
    }

    let totalWeight = 0;
    for (const target of candidates) {
      if (target.capacityWork > 1e-9 && target.current > BAOBAB_PULL_THRESHOLD * 0.05) {
        totalWeight += target.weight;
      }
    }
    if (totalWeight <= 0) {
      break;
    }

    let spentThisPass = 0;
    for (const target of candidates) {
      if (remainingWork <= 1e-9 || target.capacityWork <= 1e-9 || target.current <= BAOBAB_PULL_THRESHOLD * 0.05) {
        continue;
      }

      const proposedWork = remainingWork * (target.weight / totalWeight);
      const usedWork = Math.min(target.capacityWork, proposedWork);
      const reduction = Math.min(target.current, (usedWork * target.efficiency) / target.cost);
      if (reduction <= 0) {
        continue;
      }

      removeBaobabWithCarbonClosure(target.cellId, reduction * 1.05);
      target.current = Math.max(0, target.current - reduction);
      target.capacityWork = Math.max(0, target.capacityWork - usedWork);
      spentThisPass += usedWork;
      removed += reduction;
      affectedCellSet.add(target.cellId);
    }

    if (spentThisPass <= 1e-9) {
      break;
    }
    remainingWork = Math.max(0, remainingWork - spentThisPass);
  }

  return { affectedCells: [...affectedCellSet], centerBefore, removed };
}

function pullBaobabCandidates(targetCells) {
  const targets = [];
  for (const target of targetCells) {
    if (state.baobabBlocked[target.cellId]) {
      continue;
    }

    const current = baobabDisplayMassAt(target.cellId);
    if (current < BAOBAB_PULL_THRESHOLD) {
      continue;
    }

    const sizeEfficiency = current >= 0.7 ? 0.34 : current >= 0.32 ? 0.58 : 1;
    const efficiency = Math.max(0.025, target.spatialWeight * sizeEfficiency);
    const cost = baobabPullCost(current);
    const capacityWork = (current * cost) / efficiency;
    const weight = target.spatialWeight * sizeEfficiency * Math.sqrt(Math.max(current, BAOBAB_PULL_THRESHOLD));
    targets.push({
      cellId: target.cellId,
      current,
      cost,
      efficiency,
      capacityWork,
      weight
    });
  }

  return targets.sort((a, b) =>
    b.weight - a.weight ||
    a.cost - b.cost ||
    b.current - a.current
  );
}

function pullBaobabTargetCells(cellId) {
  const centerCell = topology.cells[cellId];
  if (!centerCell) {
    return [];
  }

  const targets = [];
  const seen = new Set();
  const addTarget = (targetId, tier) => {
    if (seen.has(targetId)) {
      return;
    }
    seen.add(targetId);
    const targetCell = topology.cells[targetId];
    if (!targetCell) {
      return;
    }
    const dot = cellNormalDot(centerCell, targetCell);
    const distance = targetId === cellId ? 0 : Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
    targets.push({ cellId: targetId, distance, tier, spatialWeight: 1 });
  };

  addTarget(cellId, 0);
  for (const neighborId of neighborsOf(cellId)) {
    addTarget(neighborId, 1);
  }
  for (const targetId of pullPatchCells(cellId)) {
    addTarget(targetId, 2);
  }

  let nearestNeighborDistance = Infinity;
  let maximumDistance = 0;
  for (const target of targets) {
    if (target.distance > 0) {
      nearestNeighborDistance = Math.min(nearestNeighborDistance, target.distance);
      maximumDistance = Math.max(maximumDistance, target.distance);
    }
  }
  if (!Number.isFinite(nearestNeighborDistance)) {
    nearestNeighborDistance = Math.sqrt((4 * Math.PI) / topology.cells.length);
  }

  const radius = Math.max(nearestNeighborDistance * 1.65, maximumDistance * 0.52, 1e-6);
  for (const target of targets) {
    const distanceWeight = target.distance <= 0
      ? 1
      : Math.exp(-((target.distance / radius) ** 2));
    const tierWeight = target.tier === 0 ? 1 : target.tier === 1 ? 0.82 : 0.56;
    target.spatialWeight = Math.max(BAOBAB_PULL_MIN_SPATIAL_WEIGHT, distanceWeight * tierWeight);
  }

  return targets.sort((a, b) =>
    b.spatialWeight - a.spatialWeight ||
    a.distance - b.distance
  );
}

function pullPatchCells(cellId) {
  const cell = topology.cells[cellId];
  if (!cell || topology.nside <= BAOBAB_PULL_PATCH_NSIDE) {
    return [cellId];
  }

  const scale = topology.nside / BAOBAB_PULL_PATCH_NSIDE;
  const patchIx = Math.floor(cell.ix / scale);
  const patchIy = Math.floor(cell.iy / scale);
  return topology.cells
    .filter((candidate) =>
      candidate.face === cell.face &&
      Math.floor(candidate.ix / scale) === patchIx &&
      Math.floor(candidate.iy / scale) === patchIy
    )
    .map((candidate) => candidate.id);
}

function baobabPullCost(value) {
  if (value >= 0.7) {
    return 2.65;
  }

  if (value >= 0.32) {
    return 1.55;
  }

  return 0.72;
}

function cleanHere() {
  spendAction(() => {
    const cellId = selectedCellId();
    const management = {
      cleanAsh: {
        cellId,
        workRate: actionRate(ASH_CLEAN_WORK),
        centerBefore: state.ash[cellId],
        affectedCells: new Set(),
        cleaned: 0,
        returnedCarbon: 0
      },
      cleanSnowIce: {
        cellId,
        workRate: actionRate(SNOW_ICE_CLEAN_WORK_M),
        centerBefore: state.snowIceM?.[cellId] ?? 0,
        affectedCells: new Set(),
        cleaned: 0
      }
    };
    addCareForcing(management, cellId, 0.14);
    const messageAfter = (currentManagement) => {
      const ashResult = currentManagement?.cleanAsh;
      const snowIceResult = currentManagement?.cleanSnowIce;
      if (!ashResult && !snowIceResult) {
        return labels().cleaned;
      }

      const affectedCells = new Set([
        ...(ashResult?.affectedCells ?? []),
        ...(snowIceResult?.affectedCells ?? [])
      ]);
      for (const targetId of affectedCells) {
        if (targetId !== cellId) {
          state.care[targetId] = clamp01(state.care[targetId] + 0.045);
        }
      }

      const cleanedAsh = (ashResult?.cleaned ?? 0) > 1e-6;
      const cleanedSnowIce = (snowIceResult?.cleaned ?? 0) > 1e-6;
      if (cleanedAsh && cleanedSnowIce) {
        return labels().cleanedAshAndSnowIce;
      }

      if (cleanedSnowIce) {
        return labels().cleanedSnowIce;
      }

      if (ashResult?.centerBefore >= 0.45 && state.ash[cellId] >= ASH_CLEAN_THRESHOLD) {
        return labels().cleanedHeavy;
      }

      if ((ashResult?.affectedCells.size ?? 0) > 1) {
        return labels().cleanedPatch;
      }

      return labels().cleaned;
    };
    return { message: labels().cleaned, management, messageAfter };
  }, "clean");
}

function cleanAshAround(cellId, work = ASH_CLEAN_WORK) {
  const candidates = cleanAshTargets(cellId);
  const centerBefore = state.ash[cellId];
  if (candidates.length === 0) {
    return { affectedCells: [], centerBefore, cleaned: 0 };
  }

  const targetIds = new Int32Array(candidates.length);
  const efficiencies = new Float32Array(candidates.length);
  const before = new Float32Array(candidates.length);
  for (let index = 0; index < candidates.length; index += 1) {
    const target = candidates[index];
    targetIds[index] = target.cellId;
    efficiencies[index] = target.efficiency;
    before[index] = state.ash[target.cellId];
  }

  const affectedCells = runWasmCleanAsh(state.ash, targetIds, efficiencies, work, ASH_CLEAN_THRESHOLD);
  if (!affectedCells) {
    throw new Error("C/WASM ash cleaning is required for asteroid garden simulation.");
  }
  let cleaned = 0;
  let returnedCarbon = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const removedAsh = Math.max(0, before[index] - state.ash[targetIds[index]]);
    cleaned += removedAsh;
    returnedCarbon += returnCleanedAshToSoil(targetIds[index], removedAsh);
  }
  return { affectedCells, centerBefore, cleaned, returnedCarbon };
}

function cleanSnowIceAround(cellId, work = SNOW_ICE_CLEAN_WORK_M) {
  const candidates = cleanSnowIceTargets(cellId);
  const centerBefore = state.snowIceM?.[cellId] ?? 0;
  if (!state.snowIceM || candidates.length === 0 || work <= 0) {
    return { affectedCells: [], centerBefore, cleaned: 0 };
  }

  let remainingWork = work;
  let cleaned = 0;
  const affectedCellSet = new Set();

  for (let pass = 0; pass < 3; pass += 1) {
    if (remainingWork <= 1e-9) {
      break;
    }

    let totalWeight = 0;
    for (const target of candidates) {
      target.current = Math.max(0, state.snowIceM[target.cellId] ?? 0);
      if (target.current > SNOW_ICE_CLEAN_THRESHOLD_M) {
        totalWeight += target.weight;
      }
    }
    if (totalWeight <= 0) {
      break;
    }

    let spentThisPass = 0;
    for (const target of candidates) {
      if (remainingWork <= 1e-9 || target.current <= SNOW_ICE_CLEAN_THRESHOLD_M) {
        continue;
      }

      const proposedWork = remainingWork * (target.weight / totalWeight);
      const removed = Math.min(target.current, proposedWork * target.efficiency);
      if (removed <= 1e-10) {
        continue;
      }

      const spent = removed / Math.max(1e-6, target.efficiency);
      state.snowIceM[target.cellId] = Math.max(0, target.current - removed);
      updateSnowIceDisplayCell(target.cellId);
      cleaned += removed;
      spentThisPass += spent;
      affectedCellSet.add(target.cellId);
    }

    if (spentThisPass <= 1e-9) {
      break;
    }
    remainingWork = Math.max(0, remainingWork - spentThisPass);
  }

  if (cleaned > 0) {
    netNeedsFullUpdate = true;
  }

  return { affectedCells: [...affectedCellSet], centerBefore, cleaned };
}

function cleanAshTargets(cellId) {
  const centerCell = topology.cells[cellId];
  if (!centerCell) {
    return [];
  }

  const targets = [];
  const seen = new Set();
  const neighborSet = new Set(neighborsOf(cellId));
  const addTarget = (targetId, tier) => {
    if (seen.has(targetId)) {
      return;
    }
    const targetCell = topology.cells[targetId];
    if (!targetCell) {
      return;
    }

    seen.add(targetId);
    const dot = cellNormalDot(centerCell, targetCell);
    const distance = targetId === cellId ? 0 : Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
    const efficiency =
      tier === 0 ? 1 :
        tier === 1 ? 0.72 :
          0.46;
    targets.push({ cellId: targetId, distance, tier, efficiency });
  };

  addTarget(cellId, 0);

  for (const neighborId of neighborSet) {
    if (state.ash[neighborId] >= ASH_CLEAN_THRESHOLD) {
      addTarget(neighborId, 1);
    }
  }

  for (const targetId of cleanPatchCells(cellId)
    .filter((targetId) => targetId !== cellId)
    .filter((targetId) => !neighborSet.has(targetId))
    .filter((targetId) => state.ash[targetId] >= ASH_CLEAN_THRESHOLD)) {
    addTarget(targetId, 2);
  }

  return targets.sort((a, b) =>
    a.tier - b.tier ||
    a.distance - b.distance ||
    state.ash[b.cellId] - state.ash[a.cellId]
  );
}

function cleanSnowIceTargets(cellId) {
  const centerCell = topology.cells[cellId];
  if (!centerCell || !state.snowIceM) {
    return [];
  }

  const targets = [];
  const seen = new Set();
  const neighborSet = new Set(neighborsOf(cellId));
  const addTarget = (targetId, tier) => {
    if (seen.has(targetId) || isIceFreeCraterCell(targetId)) {
      return;
    }
    const targetCell = topology.cells[targetId];
    if (!targetCell) {
      return;
    }
    const current = Math.max(0, state.snowIceM[targetId] ?? 0);
    if (current < SNOW_ICE_CLEAN_THRESHOLD_M) {
      return;
    }

    seen.add(targetId);
    const dot = cellNormalDot(centerCell, targetCell);
    const distance = targetId === cellId ? 0 : Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
    const tierEfficiency =
      tier === 0 ? 1 :
        tier === 1 ? 0.66 :
          0.38;
    const distanceWeight = distance <= 0 ? 1 : Math.exp(-((distance * topology.nside * 0.78) ** 2));
    const weight = Math.max(0.08, tierEfficiency * distanceWeight) * Math.sqrt(current / SNOW_ICE_CLEAN_THRESHOLD_M);
    targets.push({ cellId: targetId, distance, tier, efficiency: tierEfficiency, weight, current });
  };

  addTarget(cellId, 0);

  for (const neighborId of neighborSet) {
    addTarget(neighborId, 1);
  }

  for (const targetId of cleanPatchCells(cellId)
    .filter((targetId) => targetId !== cellId)
    .filter((targetId) => !neighborSet.has(targetId))) {
    addTarget(targetId, 2);
  }

  return targets.sort((a, b) =>
    a.tier - b.tier ||
    a.distance - b.distance ||
    (state.snowIceM?.[b.cellId] ?? 0) - (state.snowIceM?.[a.cellId] ?? 0)
  );
}

function cleanPatchCells(cellId) {
  const cell = topology.cells[cellId];
  if (!cell || topology.nside <= ASH_CLEAN_PATCH_NSIDE) {
    return [cellId];
  }

  const scale = topology.nside / ASH_CLEAN_PATCH_NSIDE;
  const patchIx = Math.floor(cell.ix / scale);
  const patchIy = Math.floor(cell.iy / scale);
  return topology.cells
    .filter((candidate) =>
      candidate.face === cell.face &&
      Math.floor(candidate.ix / scale) === patchIx &&
      Math.floor(candidate.iy / scale) === patchIy
    )
    .map((candidate) => candidate.id);
}

function observeHere() {
  spendAction(() => {
    const cellId = selectedCellId();
    state.care[cellId] = clamp01(state.care[cellId] + 0.06);
    if (isRoseAreaCell(cellId)) {
      rememberRose(0.08, cellId === state.roseCell ? 0.18 : 0.1);
    }
    syncVegetationToGame(true);
    return describeCell(cellId);
  }, "observe");
}

async function watchSunset() {
  if (state.gameOver || actionInProgress) {
    refresh(labels().noActions);
    return;
  }

  actionInProgress = true;
  try {
  const turnsToSunset = scaledTurnsUntilNextSunset();
  const timeMessage = turnsToSunset > 0 ? await advanceTurns(turnsToSunset) : null;
  if (state.gameOver) {
    refresh(timeMessage);
    return;
  }

  updateCloudCoverField(state);
  if (sunsetCloudCellId() !== null) {
    recordCloudedSunset();
    focusCameraOnSunset();
    refresh(messageWithRoseHelp(timeMessage, labels().sunsetCloudy));
    return;
  }

  const sunsetMessage = recordSunsetMemory();
  focusCameraOnSunset();
  refresh(messageWithRoseHelp(timeMessage, sunsetMessage));
  } finally {
    actionInProgress = false;
  }
}

function focusCameraOnSunset(holdMs = 5200) {
  const referenceCell = topology.cells[sunsetReferenceCellId()];
  if (!referenceCell) {
    return;
  }

  computeSunDirectionForCellAt(turnProgress(), sunsetReferenceCellId(), sunDirection, sunRoseNormal, sunEastAxis);
  const referenceNormal = vectorForCell(referenceCell);
  if (state.planetPreset === "earth") {
    sunsetViewDirection.copy(sunEastAxis).multiplyScalar(-1);
  } else {
    sunsetViewDirection.copy(sunDirection).addScaledVector(referenceNormal, -sunDirection.dot(referenceNormal));
  }
  if (sunsetViewDirection.lengthSq() < 0.0001) {
    sunsetViewDirection.copy(sunEastAxis).multiplyScalar(state.planetPreset === "earth" ? -1 : 1);
  }
  sunsetViewDirection.normalize();

  const distance = compactLayoutQuery.matches ? 7.2 : 6.1;
  const lift = compactLayoutQuery.matches ? 1.9 : 1.7;
  sunsetViewTarget.copy(referenceNormal).multiplyScalar(1.08).addScaledVector(sunsetViewDirection, 0.42);
  sunsetViewPosition.copy(referenceNormal).multiplyScalar(lift).addScaledVector(sunsetViewDirection, -distance);

  controls.target.copy(sunsetViewTarget);
  cameraFocusTarget.copy(sunsetViewPosition);
  hasCameraFocusTarget = true;
  focusHoldUntil = performance.now() + holdMs;
  invalidateRender(holdMs);
}

function sunsetReferenceCellId() {
  if (state.planetPreset === "earth" && state.crashCell !== null && state.crashCell !== undefined) {
    return state.crashCell;
  }

  return state.roseCell;
}

function solarReferenceCellIdForState(targetState = state) {
  if (targetState.planetPreset === "earth" && targetState.crashCell !== null && targetState.crashCell !== undefined) {
    return targetState.crashCell;
  }

  return targetState.roseCell;
}

function turnsUntilNextSunset() {
  const alreadyWatchedThisSunset = state.turn === SUNSET_TURN && state.memories.some((memory) =>
    (memory.type === "sunset" || memory.type === "sunsetCloudy") && memory.day === state.day && memory.turn === state.turn
  );
  if (state.turn < SUNSET_TURN) {
    return SUNSET_TURN - state.turn;
  }

  if (state.turn === SUNSET_TURN && !alreadyWatchedThisSunset) {
    return 0;
  }

  return TURNS_PER_DAY - state.turn + SUNSET_TURN;
}

function scaledTurnsUntilNextSunset() {
  const baseTurns = turnsUntilNextSunset();
  if (baseTurns <= 0) {
    return 0;
  }

  const scaledTurns = Math.max(1, Math.round(baseTurns * actionTimeScale()));
  const finalTurn = (state.turn + scaledTurns) % TURNS_PER_DAY;
  const snapToSunset = (SUNSET_TURN - finalTurn + TURNS_PER_DAY) % TURNS_PER_DAY;
  return scaledTurns + snapToSunset;
}

function sunsetCloudCellId() {
  if (state.planetPreset === "earth") {
    const reference = sunsetReferenceCellId();
    return isCloudyAtCell(reference) ? reference : null;
  }

  const selected = selectedCellId();
  if (isCloudyAtCell(selected)) {
    return selected;
  }

  return isCloudyAtCell(state.roseCell) ? state.roseCell : null;
}

function isCloudyAtCell(cellId) {
  if (state.planetPreset === "earth") {
    return cloudWeatherAtCell(cellId) > 0.58;
  }
  return cloudRainMm(cellId) > 0.58;
}

function recordCloudedSunset() {
  const cellId = state.planetPreset === "earth" ? sunsetReferenceCellId() : selectedCellId();
  state.memories.push({ day: state.day, turn: state.turn, cellId, type: "sunsetCloudy" });
  state.care[cellId] = clamp01(state.care[cellId] + 0.03);
  rememberRose(0, 0.02);
  return labels().sunsetCloudy;
}

function recordSunsetMemory() {
  const cellId = state.planetPreset === "earth" ? sunsetReferenceCellId() : selectedCellId();
  state.sunsetCount += 1;
  state.memories.push({ day: state.day, turn: state.turn, cellId, type: "sunset" });
  addEventLogEntry(labels().eventSunset);
  state.care[cellId] = clamp01(state.care[cellId] + 0.1);
  if (isRoseAreaCell(cellId)) {
    rememberRose(0.16, 0.2);
    state.roseHealth = clamp01(state.roseHealth + 0.05);
    state.lastRoseCareDay = state.day;
  } else {
    rememberRose(0, 0.03);
  }
  return labels().sunsetMemory;
}

async function restToday() {
  if (state.gameOver || actionInProgress) {
    refresh(labels().noActions);
    return;
  }

  actionInProgress = true;
  try {
    const durationDays = actionDurationDays(REST_TURN_SKIP);
    const timeMessage = await advanceActionTime(REST_TURN_SKIP);
    refresh(state.gameOver ? timeMessage : messageWithRoseHelp(labels().restMessage(formatDurationForMessage(durationDays)), timeMessage));
  } finally {
    actionInProgress = false;
  }
}

async function endDay() {
  if (state.gameOver || actionInProgress) {
    return;
  }

  actionInProgress = true;
  try {
    const durationDays = actionDurationDays(1);
    const timeMessage = await advanceActionTime(1);
    refresh(state.gameOver ? timeMessage : messageWithRoseHelp(labels().waitMessage(formatDurationForMessage(durationDays)), timeMessage));
  } finally {
    actionInProgress = false;
  }
}

async function advanceActionTime(actionUnits = 1, management = null) {
  const requestedTurns = Math.max(1, Math.round(actionTimeScale() * Math.max(1, actionUnits)));
  return advanceTimeByTurns(requestedTurns, management);
}

async function advanceTurns(turns) {
  return advanceTimeByTurns(turns, null);
}

async function advanceTimeByTurns(turns, management = null) {
  const requestedTurns = Math.max(0, Math.round(turns));
  const clockTurns = Math.min(requestedTurns, remainingGameTurns());
  const durationDays = clockTurns * ACTION_DT_DAYS;
  if (clockTurns <= 0 || durationDays <= 0) {
    return null;
  }

  timeIntegrationDepth += 1;
  try {
    const ecosystemMessage = await advanceEcosystemPeriod(durationDays, management);
    if (ecosystemMessage) {
      return ecosystemMessage;
    }

    return advanceClockTurns(clockTurns);
  } finally {
    timeIntegrationDepth = Math.max(0, timeIntegrationDepth - 1);
  }
}

function remainingGameTurns() {
  if (state.gameOver) {
    return 0;
  }

  return Math.max(0, (gameLengthDays() - state.day + 1) * TURNS_PER_DAY - state.turn);
}

function advanceClockTurns(turns) {
  let boundaryMessage = null;
  for (let index = 0; index < turns && !state.gameOver; index += 1) {
    state.turn += 1;
    if (state.turn >= TURNS_PER_DAY) {
      state.turn = 0;
      boundaryMessage = advanceDay();
    }
  }

  return boundaryMessage;
}

function activeAsteroidProfileSink() {
  const sink = globalThis.__HEALPIX_ASTEROID_PROFILE__;
  return sink?.enabled && typeof performance !== "undefined" ? sink : null;
}

function addAsteroidProfileTime(sink, name, elapsedMs) {
  if (!sink.sections) {
    sink.sections = {};
  }
  sink.sections[name] = (sink.sections[name] ?? 0) + elapsedMs;
}

async function advanceEcosystemPeriod(durationDays, management = null) {
  const profileSink = activeAsteroidProfileSink();
  const profileTurnStart = profileSink ? performance.now() : 0;
  let profileSectionStart = profileTurnStart;
  state.vegetation.setDiagnosticsEnabled(currentViewNeedsEcosystemDiagnostics());

  const ecosystemSubsteps = ecosystemSubstepsForPeriod(durationDays);
  const modelDtDays = durationDays / ecosystemSubsteps;
  let remainingSubsteps = ecosystemSubsteps;

  if (profileSink) {
    const now = performance.now();
    addAsteroidProfileTime(profileSink, "outerSunlight", now - profileSectionStart);
    profileSectionStart = now;
  }

  const sheepActive = state.planetPreset === "earth" && Array.isArray(state.sheep) && state.sheep.length > 0;
  if (management || sheepActive) {
    while (remainingSubsteps > 0 && !state.gameOver) {
      if (management) {
        applyManagementForStep(management, modelDtDays);
      }
      if (sheepActive) {
        advanceSheepPeriod(modelDtDays);
      }
      await runEcosystemSteps(modelDtDays, 1);
      advanceSnowIcePeriod(modelDtDays);
      advanceVolcanicAshPeriod(modelDtDays);
      advanceBurningPeriod(modelDtDays);
      decayCarePeriod(modelDtDays);
      syncVegetationToGame(false);
      remainingSubsteps -= 1;
    }
  } else {
    while (remainingSubsteps > 0 && !state.gameOver) {
      const repeatCount = Math.min(MAX_ECOSYSTEM_SUBSTEPS_PER_TURN, remainingSubsteps);
      await runEcosystemSteps(modelDtDays, repeatCount);
      advanceSnowIcePeriod(modelDtDays * repeatCount);
      advanceVolcanicAshPeriod(modelDtDays * repeatCount);
      advanceBurningPeriod(modelDtDays * repeatCount);
      decayCarePeriod(modelDtDays * repeatCount);
      remainingSubsteps -= repeatCount;
    }
  }

  if (profileSink) {
    const now = performance.now();
    addAsteroidProfileTime(profileSink, "outerVegetationStepCall", now - profileSectionStart);
    profileSectionStart = now;
  }

  syncVegetationToGame();
  if (profileSink) {
    const now = performance.now();
    addAsteroidProfileTime(profileSink, "outerSyncVegetationToGame", now - profileSectionStart);
    profileSectionStart = now;
  }
  updateRoseHealth();
  if (profileSink) {
    const now = performance.now();
    addAsteroidProfileTime(profileSink, "outerRoseHealth", now - profileSectionStart);
    profileSectionStart = now;
  }
  recordEcosystemEvents();
  if (profileSink) {
    const now = performance.now();
    addAsteroidProfileTime(profileSink, "outerRecordEvents", now - profileSectionStart);
    profileSectionStart = now;
  }
  netNeedsFullUpdate = true;
  const witheredMessage = checkRoseWithered();
  if (profileSink) {
    const now = performance.now();
    addAsteroidProfileTime(profileSink, "outerCheckRoseWithered", now - profileSectionStart);
    addAsteroidProfileTime(profileSink, "outerTotalTurn", now - profileTurnStart);
  }
  return witheredMessage;
}

async function runEcosystemSteps(modelDtDays, repeatCount) {
  const defaultSlowStepInterval = Math.max(1, Math.round(1 / Math.max(1e-6, modelDtDays)));
  await state.vegetation.stepAsync({
    repeatCount,
    modelDtDays,
    slowStepInterval: defaultSlowStepInterval,
    sunlightNormals: sunlightCellNormals,
    sunlightRoseCell: solarReferenceCellIdForState(state),
    sunlightTurn: state.turn,
    sunlightTurnsPerDay: TURNS_PER_DAY,
    sunlightModelTimeOffsetDays: 0,
    sunlightModelDurationDays: SIMULATION_SUNLIGHT_DURATION_DAYS,
    sunlightSampleCount: SUNLIGHT_AVERAGE_SAMPLES
  });
}

function recordEcosystemEvents() {
  const text = labels();
  const eventKey = `${state.day}:${state.turn}`;
  const maxRain =
    typeof state.maxRainfallMm === "number"
      ? state.maxRainfallMm
      : state.rainfallMm.reduce((maximum, value) => Math.max(maximum, value), 0);
  const maxBaobab =
    typeof state.maxBaobab === "number"
      ? state.maxBaobab
      : state.baobab.reduce((maximum, value) => Math.max(maximum, value), 0);

  if (state.planetPreset !== "earth" && maxRain > 1.6 && state.lastRainEventKey !== eventKey) {
    addEventLogEntry(text.eventRain);
    state.lastRainEventKey = eventKey;
  }

  if (
    state.planetPreset !== "earth" &&
    !state.roseWitheredNotified &&
    primaryRosePlantMass() > 0.025 &&
    state.roseHealth < 0.38 &&
    state.lastRoseWeakEventDay !== state.day
  ) {
    addEventLogEntry(text.eventRoseWeak);
    state.lastRoseWeakEventDay = state.day;
  }

  if (state.planetPreset !== "earth" && maxBaobab > 0.62 && state.lastBaobabEventDay !== state.day) {
    addEventLogEntry(text.eventBaobabLarge);
    state.lastBaobabEventDay = state.day;
  }
}

function advanceVolcanicAshPeriod(dtDays) {
  if (dtDays <= 0) {
    return;
  }

  const rates = state.volcanicAshFallRate;
  const scale = dtDays / ACTION_DT_DAYS;
  if (Math.abs(scale - 1) < 1e-6) {
    if (runWasmAdvanceAsh(state.ash, rates)) {
      return;
    }
    throw new Error("C/WASM ash update is required for asteroid garden simulation.");
  }

  if (scaledVolcanicAshFallRate.length !== rates.length) {
    scaledVolcanicAshFallRate = new Float32Array(rates.length);
  }
  for (let index = 0; index < rates.length; index += 1) {
    scaledVolcanicAshFallRate[index] = rates[index] * scale;
  }
  if (runWasmAdvanceAsh(state.ash, scaledVolcanicAshFallRate)) {
    return;
  }
  throw new Error("C/WASM ash update is required for asteroid garden simulation.");
}

function decayCarePeriod(dtDays) {
  if (dtDays <= 0) {
    return;
  }

  const factor = Math.pow(0.965, dtDays / ACTION_DT_DAYS);
  for (let i = 0; i < state.care.length; i += 1) {
    state.care[i] *= factor;
  }
}

function advanceDay() {
  const days = gameLengthDays();
  if (state.day >= days) {
    state.gameOver = true;
    const health = computeHealth();
    const text = labels();
    const finalText = health > 0.72 ? text.finalGood(days) : health > 0.45 ? text.finalOk(days) : text.finalBad(days);
    return finalText;
  }

  state.day += 1;
  if (state.planetPreset === "earth") {
    return labels().nightMessageEarth;
  }

  if (state.roseWitheredNotified || primaryRosePlantMass() <= 0.025) {
    return labels().nightMessage;
  }

  return `${labels().nightMessage} ${labels().roseMood(Math.round(state.roseHealth * 100))}`;
}

function average(ids, values) {
  if (ids.length === 0) {
    return 0;
  }

  return ids.reduce((sum, id) => sum + values[id], 0) / ids.length;
}

function updateRoseHealth() {
  const roseArea = [state.roseCell, ...neighborsOf(state.roseCell)];
  const ash = average(roseArea, state.ash);
  const baobab = average(roseArea, state.baobab);
  const care = average(roseArea, state.care);
  const loneliness = Math.min(1, (state.day - state.lastRoseCareDay) / 7);
  const modeledHealth = state.vegetation.roseHealth(state.roseCell);
  state.roseHealth = clamp01(modeledHealth + care * 0.08 - ash * 0.07 - baobab * 0.08 - loneliness * 0.018);
}

function primaryRosePlantMass() {
  return rosePlantMassIndex(state.roseCell);
}

function primaryRoseVisiblePercent() {
  return roseVisiblePercentIndex(state.roseCell);
}

function roseVisiblePercentIndex(cellId) {
  return Math.round(roseDisplayMassIndex(cellId) * 100);
}

function roseDisplayMassIndex(cellId) {
  if (currentPlanetPreset !== "earth" && state.roseWitheredNotified && cellId === state.roseCell) {
    return 0;
  }

  return clamp01(rosePlantMassIndex(cellId));
}

function rosePlantMassIndex(cellId) {
  const id = state.roseCell;
  const targetId = cellId ?? id;
  if (targetId === null || targetId === undefined) {
    return 0;
  }

  const visibleMass = state.flower[targetId] ?? 0;
  const modelState = state.vegetation?.state;
  if (!modelState) {
    return visibleMass;
  }

  const adultMass = modelState.MR?.[targetId] ?? 0;
  const organMass =
    (modelState.roseLeaf?.[targetId] ?? 0) +
    (modelState.roseFlower?.[targetId] ?? 0) +
    (modelState.roseRoot?.[targetId] ?? 0);

  return Math.max(visibleMass, adultMass, organMass);
}

function checkRoseWithered() {
  if (state.gameOver) {
    return null;
  }

  if (state.planetPreset === "earth") {
    return null;
  }

  const visibleMass = state.flower[state.roseCell] ?? 0;
  const plantMass = primaryRosePlantMass();
  if (plantMass > 0.025 || visibleMass > 0.035 || state.roseHealth > 0.08) {
    return null;
  }

  if (state.roseWitheredNotified) {
    return null;
  }

  state.roseWitheredNotified = true;
  state.roseHealth = 0;
  return labels().roseWithered;
}

function refreshLandInfo(targetState = state) {
  for (const cell of topology.cells) {
    targetState.land[cell.id] = landKeyForCell(cell.id, targetState);
  }
}

function landKeyForCell(cellId, targetState = state) {
  if (targetState.planetPreset === "earth") {
    return earthLandKeyForCell(cellId, targetState);
  }

  const terrain = targetState.terrain[cellId];
  const substrate = targetState.substrate[cellId];
  const moisture = targetState.moisture[cellId];
  const ash = targetState.ash[cellId];
  const flower = targetState.flower[cellId];
  const baobab = targetState.baobab[cellId];
  const baobabRisk = targetState.baobabRisk[cellId];
  const visibleRose = hasVisibleRose(cellId, targetState);
  const formerRoseGround = !visibleRose && (terrain === "rose" || targetState.roseFertility[cellId] > 1);

  if (targetState.activeVolcanoCraterMask?.[cellId] === 1) {
    return "activeVolcanoLand";
  }

  if (terrain === "volcano") {
    return isActiveVolcanoCoreCell(cellId, targetState) ? "activeVolcanoLand" : "dormantVolcanoLand";
  }

  if (terrain === "water") {
    return "waterReserve";
  }

  if (targetState.waterNeighborMask?.[cellId] === 1 && moisture > 0.48) {
    return "waterShore";
  }

  if (terrain === "path") {
    return moisture > 0.48 || flower > 0.18 ? "sunsetMeadow" : "sunsetPath";
  }

  if (ash > 0.18) {
    return "freshAshSoil";
  }

  if (ash > 0.055) {
    return "ashSoil";
  }

  if ((substrate === "rock" || substrate === "ash") && ash > 0.045) {
    return "volcanicSkirt";
  }

  if (substrate === "ash") {
    return "volcanicSkirt";
  }

  if (visibleRose && (terrain === "rose" || targetState.roseFertility[cellId] > 1)) {
    return "roseLoam";
  }

  if (targetState.roseGardenMask?.[cellId] === 1 && flower > 0.18) {
    return "roseBorder";
  }

  if (baobab > 0.72) {
    return "baobabDanger";
  }

  if (baobab > 0.32) {
    return "baobabRooted";
  }

  if (baobab > 0.08) {
    return "baobabSproutGround";
  }

  if (formerRoseGround && substrate === "loam") {
    return moisture > 0.58 ? "wetLoam" : "loamGround";
  }

  if (terrain === "crack" || baobabRisk > 0.64) {
    return "baobabWatch";
  }

  if (flower > 0.18 || terrain === "moss" || terrain === "meadow") {
    return "mossLoam";
  }

  if (moisture > 0.58) {
    return targetState.topSoilWater[cellId] > 0.62 ? "moistBasin" : "wetLoam";
  }

  if (substrate === "sand") {
    return "sandySoil";
  }

  if (substrate === "crust") {
    return "crustSoil";
  }

  if (substrate === "rock") {
    return flower > 0.06 || moisture > 0.42 ? "lichenRock" : "rockySoil";
  }

  return "dryLoam";
}

function substrateForTerrain(terrainKey) {
  if (terrainKey === "rock" || terrainKey === "volcano") {
    return "rock";
  }

  if (terrainKey === "sand") {
    return "sand";
  }

  if (terrainKey === "crack") {
    return "crust";
  }

  return "loam";
}

function hasVisibleRose(cellId, targetState = state) {
  if (targetState === state) {
    return roseDisplayMassIndex(cellId) > ROSE_PATCH_MARKER_THRESHOLD;
  }

  return (targetState.flower[cellId] ?? 0) > ROSE_PATCH_MARKER_THRESHOLD;
}

function earthLandKeyForCell(cellId, targetState = state) {
  const terrain = targetState.terrain[cellId];
  const moisture = targetState.moisture[cellId];
  const flower = targetState.flower[cellId];
  const baobab = targetState.baobab[cellId];
  const cell = topology.cells[cellId];

  if (baobab > 0.18) {
    return "earthBaobabGrove";
  }

  if ((terrain === "rose" && flower > EARTH_ROSE_PULL_THRESHOLD) || flower > 0.12) {
    return "earthRoseGarden";
  }

  if (terrain === "water") {
    return targetState.waterCoastMask?.[cellId] === 1 ? "earthCoast" : "earthOcean";
  }

  if (terrain === "rock") {
    return (targetState.elevation?.[cellId] ?? 0) > 1800 || Math.abs(cell.height) > 0.66 ? "earthMountain" : "earthHighland";
  }

  if (terrain === "sand") {
    return "earthDesert";
  }

  if (moisture > 0.72 || targetState.topSoilWater[cellId] > 0.64) {
    return "earthWetland";
  }

  if (flower > 0.24 || moisture > 0.58) {
    return "earthForest";
  }

  return "earthGrassland";
}

function isRoseAreaForState(cellId, targetState = state) {
  return cellId === targetState.roseCell || targetState.roseGardenMask?.[cellId] === 1;
}

function cellObservationNotes(cellId, text = labels()) {
  const notes = [];
  const roseMass = roseDisplayMassIndex(cellId);
  const baobabMass = state.baobab[cellId];
  const topWater = state.topSoilWater[cellId];
  const ash = state.ash[cellId];
  const sunlight = state.sunlight[cellId];
  const rain = state.rainfallMm[cellId];
  const snowIce = state.snowIceMm?.[cellId] ?? 0;
  const tempNote = temperatureObservationNote(state.meanTempC?.[cellId] ?? 0, text);
  if (tempNote) {
    notes.push(tempNote);
  }

  if (hasVisibleRose(cellId)) {
    notes.push(roseMass < 0.24 ? text.observeNotes.roseWeak : text.observeNotes.roseHere);
  }
  if (topWater < 0.26) {
    notes.push(text.observeNotes.dry);
  } else if (topWater > 0.58 || state.surfaceWater[cellId] > 0.08) {
    notes.push(text.observeNotes.wet);
  }
  if (snowIce > 0.5) {
    notes.push(text.observeNotes.snowIce);
  }
  if (ash > 0.13) {
    notes.push(text.observeNotes.ash);
  }
  if (baobabMass >= 0.7) {
    notes.push(text.observeNotes.baobabLarge);
  } else if (baobabMass >= BAOBAB_PULL_THRESHOLD) {
    notes.push(text.observeNotes.baobabSprout);
  } else if (baobabMass >= BAOBAB_HIDDEN_THRESHOLD) {
    notes.push(text.observeNotes.baobabHidden);
  }
  if (sunlight < 0.18) {
    notes.push(text.observeNotes.poorLight);
  }
  if (rain > 0.7) {
    notes.push(text.observeNotes.rain);
  }

  return notes;
}

function temperatureObservationNote(tempC, text = labels()) {
  if (!Number.isFinite(tempC)) {
    return null;
  }
  if (tempC < 5) {
    return text.observeNotes.cold;
  }
  if (tempC >= 30) {
    return text.observeNotes.hot;
  }
  if (tempC >= 22) {
    return text.observeNotes.warm;
  }
  return text.observeNotes.mild;
}

function summarizeCell(cellId) {
  refreshLandInfo();
  const text = labels();
  const land = text.land[state.land[cellId]] ?? state.land[cellId];
  return text.summaryLine(land, [
    ...cellObservationNotes(cellId, text),
    ...cellPlantInventoryNotes(cellId, text)
  ]);
}

function cellPlantInventoryNotes(cellId, text = labels()) {
  const notes = [];
  const roseMass = clamp01(roseDisplayMassIndex(cellId));
  const roseHeight = plantHeightMetersForCell(cellId, "rose");
  const roseSeed = clamp01(state.roseSeedBank?.[cellId] ?? 0);
  const baobabMass = clamp01(state.baobab[cellId] ?? 0);
  const baobabHeight = plantHeightMetersForCell(cellId, "baobab");
  const baobabSeed = clamp01(state.baobabSeedBank?.[cellId] ?? 0);

  if (Math.max(roseMass, roseHeight / ROSE_REFERENCE_HEIGHT_M, roseSeed) > 0.03) {
    notes.push(text.plantBriefRose(
      formatPercentValue(roseMass),
      formatHeightMeters(roseHeight),
      formatPercentValue(roseSeed)
    ));
  }
  if (Math.max(baobabMass, baobabHeight / BAOBAB_REFERENCE_HEIGHT_M, baobabSeed) > 0.03) {
    notes.push(text.plantBriefBaobab(
      formatPercentValue(baobabMass),
      formatHeightMeters(baobabHeight),
      formatPercentValue(baobabSeed)
    ));
  }
  if (notes.length === 0 && topology.nside >= 128) {
    notes.push(text.plantBriefNone);
  }

  return notes;
}

function formatPercentValue(value) {
  return String(Math.round(clamp01(value) * 100));
}

function formatHeightMeters(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }
  if (value >= 10) {
    return value.toFixed(0);
  }
  if (value >= 1) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

function describeCell(cellId) {
  refreshLandInfo();
  const text = labels();
  const terrain = terrainLabelForCell(cellId, text);
  const land = text.land[state.land[cellId]] ?? state.land[cellId];
  const substrate = text.substrate[state.substrate[cellId]] ?? state.substrate[cellId];
  const top = Math.round(state.topSoilWater[cellId] * 100);
  const mid = Math.round((state.midSoilWater?.[cellId] ?? 0) * 100);
  const deep = Math.round((state.deepSoilWater?.[cellId] ?? 0) * 100);
  const ground = Math.round(state.groundwater[cellId] * 100);
  const nutrient = Math.round((state.soilNutrient?.[cellId] ?? state.soil[cellId] ?? 0) * 100);
  const temp = (state.meanTempC?.[cellId] ?? 0).toFixed(1);
  const rain = state.rainfallMm[cellId].toFixed(1);
  const snowIce = (state.snowIceMm?.[cellId] ?? 0).toFixed(1);
  const sunlight = Math.round(state.sunlight[cellId] * 100);
  const roseMass = roseVisiblePercentIndex(cellId);
  const baobabMass = Math.round(state.baobab[cellId] * 100);
  const baobab = text.baobabStage(state.baobab[cellId]);
  const ash = Math.round(state.ash[cellId] * 100);
  return text.observeLine(
    land,
    terrain,
    substrate,
    top,
    mid,
    deep,
    ground,
    nutrient,
    temp,
    rain,
    snowIce,
    sunlight,
    roseMass,
    baobabMass,
    baobab,
    ash
  );
}

function terrainLabelForCell(cellId, text = labels()) {
  if (state.terrain[cellId] === "volcano") {
    return text.terrain[isActiveVolcanoCoreCell(cellId) ? "activeVolcano" : "dormantVolcano"];
  }

  if (state.terrain[cellId] === "rose" && !hasVisibleRose(cellId)) {
    return text.substrate[state.substrate[cellId]] ?? state.substrate[cellId];
  }

  return text.terrain[state.terrain[cellId]];
}

function isActiveVolcanoCoreCell(cellId, targetState = state) {
  return targetState.activeVolcanoMask?.[cellId] === 1 || targetState.activeVolcanoCraterMask?.[cellId] === 1;
}

function isActiveVolcanoCell(cellId, targetState = state) {
  const parentKey = hierarchyCellKey(hierarchyParentCell(topology.cells[cellId]));
  return targetState.activeVolcanoCells.some((activeCellId) =>
    hierarchyCellKey(hierarchyParentCell(topology.cells[activeCellId])) === parentKey
  );
}

function handleCellClick(cellId) {
  if (state.gameOver) {
    return;
  }

  locatorLocked = !locatorLocked;
  hoveredCellId = locatorLocked ? null : cellId;
  selectCell(cellId);
}

function selectCell(cellId, shouldNudgeCamera = false) {
  state.selectedCell = cellId;
  focusCellId = cellId;
  if (shouldNudgeCamera) {
    nudgeCameraTowardCell(cellId, 520);
  }
  refresh(messageWithRoseHelp(summarizeCell(cellId)));
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  if (!ARROW_KEYS.has(event.key) || isFormControl(event.target)) {
    return;
  }

  event.preventDefault();
  activeArrowKeys.add(event.key);

  if (event.repeat) {
    cancelPendingArrowMove();
    moveByArrowKeys(activeArrowKeys);
    return;
  }

  pendingArrowKeys = new Set(activeArrowKeys);
  cancelPendingArrowMove();

  if (pendingArrowKeys.size >= 2) {
    moveByArrowKeys(pendingArrowKeys);
    pendingArrowKeys = null;
    return;
  }

  arrowMoveTimer = window.setTimeout(() => {
    arrowMoveTimer = null;
    moveByArrowKeys(pendingArrowKeys);
    pendingArrowKeys = null;
  }, 42);
}

function onKeyUp(event) {
  if (!ARROW_KEYS.has(event.key)) {
    return;
  }

  activeArrowKeys.delete(event.key);
}

function clearArrowKeys() {
  activeArrowKeys.clear();
  pendingArrowKeys = null;
  cancelPendingArrowMove();
}

function cancelPendingArrowMove() {
  if (arrowMoveTimer !== null) {
    window.clearTimeout(arrowMoveTimer);
    arrowMoveTimer = null;
  }
}

function moveByArrowKeys(keys) {
  if (!keys || keys.size === 0) {
    return;
  }

  const nextCellId = arrowNeighborCell(selectedCellId(), keys);
  if (nextCellId === null) {
    return;
  }

  selectCell(nextCellId, true);
}

function isFormControl(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest("input, select, textarea, [contenteditable='true']"));
}

function arrowNeighborCell(cellId, keys) {
  const cell = topology.cells[cellId];
  if (!cell) {
    return null;
  }

  const verticalDirection = arrowAxis(keys, "ArrowDown", "ArrowUp");
  const horizontalDirection = arrowAxis(keys, "ArrowRight", "ArrowLeft");
  const neighborCells = neighborsOf(cellId).map((id) => topology.cells[id]).filter(Boolean);
  if (verticalDirection !== 0 && horizontalDirection !== 0) {
    return diagonalNeighbor(cell, neighborCells, verticalDirection, horizontalDirection);
  }

  if (horizontalDirection !== 0) {
    return sameRingNeighbor(cell, neighborCells, horizontalDirection);
  }

  if (verticalDirection !== 0) {
    return northSouthNeighbor(cell, neighborCells, verticalDirection);
  }

  return null;
}

function arrowAxis(keys, positiveKey, negativeKey) {
  const positive = keys.has(positiveKey);
  const negative = keys.has(negativeKey);
  if (positive === negative) {
    return 0;
  }

  return positive ? 1 : -1;
}

function sameRingNeighbor(cell, neighborCells, columnDirection) {
  const candidates = neighborCells
    .filter((neighbor) => neighbor.ring === cell.ring)
    .map((neighbor) => ({
      id: neighbor.id,
      distance: columnDirection > 0
        ? circularDistance(neighbor.column - cell.column, cell.nphi)
        : circularDistance(cell.column - neighbor.column, cell.nphi)
    }))
    .filter((candidate) => candidate.distance > 0)
    .sort((a, b) => a.distance - b.distance);

  return candidates[0]?.id ?? null;
}

function northSouthNeighbor(cell, neighborCells, ringDirection) {
  const candidates = neighborCells
    .filter((neighbor) => Math.sign(neighbor.ring - cell.ring) === ringDirection)
    .map((neighbor) => ({
      id: neighbor.id,
      phiDistance: angularDistance(neighbor.phi, cell.phi),
      columnDistance: Math.abs(neighbor.column - cell.column)
    }))
    .sort((a, b) => a.phiDistance - b.phiDistance || a.columnDistance - b.columnDistance);

  return candidates[0]?.id ?? null;
}

function diagonalNeighbor(cell, neighborCells, ringDirection, columnDirection) {
  const candidates = neighborCells
    .filter((neighbor) => Math.sign(neighbor.ring - cell.ring) === ringDirection)
    .map((neighbor) => {
      const phiDelta = signedAngularDelta(neighbor.phi, cell.phi);
      return {
        id: neighbor.id,
        directionScore: phiDelta * columnDirection,
        phiDistance: Math.abs(phiDelta),
        ringDistance: Math.abs(neighbor.ring - cell.ring)
      };
    })
    .filter((candidate) => candidate.directionScore > 0.000001)
    .sort((a, b) => b.directionScore - a.directionScore || a.ringDistance - b.ringDistance || a.phiDistance - b.phiDistance);

  return candidates[0]?.id ?? northSouthNeighbor(cell, neighborCells, ringDirection);
}

function circularDistance(delta, size) {
  return ((delta % size) + size) % size;
}

function angularDistance(a, b) {
  return Math.abs(signedAngularDelta(a, b));
}

function signedAngularDelta(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

async function changePlanetPreset() {
  const nextPreset = planetSelect.value;
  if (!supportedPlanetPresets.has(nextPreset) || nextPreset === currentPlanetPreset) {
    planetSelect.value = currentPlanetPreset;
    return;
  }

  currentPlanetPreset = nextPreset;
  currentNside = normalizeNsideForPreset(currentNside, currentPlanetPreset);
  window.localStorage.setItem("healpixAsteroidPlanetPreset", currentPlanetPreset);
  window.localStorage.setItem("healpixAsteroidNside", String(currentNside));
  simulationSettings = loadSimulationSettings(currentPlanetPreset);
  clearScheduledCare();
  const url = new URL(window.location.href);
  url.searchParams.set("planet", currentPlanetPreset);
  url.searchParams.set("nside", String(currentNside));
  url.searchParams.set("lang", currentLanguage);
  window.history.replaceState(null, "", url);
  topology = createHealpixTopology(currentNside);
  topologyNeighborLists = buildTopologyNeighborLists(topology);
  sunlightCellNormals = buildSunlightCellNormals(topology);
  configureRenderTopology();
  await preloadReferenceDataForPreset(currentPlanetPreset);
  await Promise.all([preloadAsteroidVegetationOperators(topology), preloadAsteroidSimulationCore()]);
  state = createAsteroidState();
  syncCurrentViewDetailIfNeeded();
  hoveredCellId = null;
  focusCellId = state.selectedCell;
  locatorLocked = false;
  buildBoard();
  focusCameraOnCentralObject();
  syncSimulationControls();
  applyLanguage();
  refresh(messageWithRoseHelp(labels().eventNewGame, startMessage()));
}

async function changeNside() {
  const selectedNside = Number(nsideSelect.value);
  const nextNside = normalizeNsideForPreset(selectedNside, currentPlanetPreset);
  if (!supportedNsides.has(selectedNside) || selectedNside !== nextNside || nextNside === topology.nside) {
    nsideSelect.value = String(topology.nside);
    return;
  }

  currentNside = nextNside;
  window.localStorage.setItem("healpixAsteroidNside", String(currentNside));
  clearScheduledCare();
  const url = new URL(window.location.href);
  url.searchParams.set("nside", String(currentNside));
  url.searchParams.set("planet", currentPlanetPreset);
  url.searchParams.set("lang", currentLanguage);
  window.history.replaceState(null, "", url);
  topology = createHealpixTopology(currentNside);
  topologyNeighborLists = buildTopologyNeighborLists(topology);
  sunlightCellNormals = buildSunlightCellNormals(topology);
  configureRenderTopology();
  await preloadReferenceDataForPreset(currentPlanetPreset);
  await Promise.all([preloadAsteroidVegetationOperators(topology), preloadAsteroidSimulationCore()]);
  state = createAsteroidState();
  syncCurrentViewDetailIfNeeded();
  hoveredCellId = null;
  focusCellId = state.selectedCell;
  locatorLocked = false;
  buildBoard();
  focusCameraOnCentralObject();
  refresh(messageWithRoseHelp(startMessage()));
}

function resetGame() {
  clearScheduledCare();
  state = createAsteroidState();
  syncCurrentViewDetailIfNeeded();
  hoveredCellId = null;
  focusCellId = state.selectedCell;
  locatorLocked = false;
  buildBoard();
  focusCameraOnCentralObject();
  refresh(messageWithRoseHelp(labels().eventNewGame, startMessage()));
}

function goHome() {
  const url = new URL("./", window.location.href);
  url.searchParams.set("lang", currentLanguage);
  window.location.href = url.href;
}

function vectorForCell(cell) {
  return vectorForNormal(cell.normal);
}

function buildSunlightCellNormals(sourceTopology) {
  const normals = new Float32Array(sourceTopology.cells.length * 3);
  for (const cell of sourceTopology.cells) {
    const offset = cell.id * 3;
    const x = cell.normal[0];
    const y = cell.normal[2];
    const z = cell.normal[1];
    const length = Math.hypot(x, y, z) || 1;
    normals[offset] = x / length;
    normals[offset + 1] = y / length;
    normals[offset + 2] = z / length;
  }
  return normals;
}

function vectorForNormal(normal) {
  return new THREE.Vector3(normal[0], normal[2], normal[1]).normalize();
}

function tileSize(cell, sourceTopology = topology) {
  return tileSizeForNside(cell, sourceTopology.nside);
}

function rawCellVisualSize(cell) {
  const latitudeRadius = Math.sqrt(Math.max(0.04, 1 - cell.height * cell.height));
  return ((Math.PI * 2 * latitudeRadius) / cell.nphi) * 0.72;
}

function objectIconClampForResolution(lowResMin, lowResMax, highResMin, highResMax) {
  if (topology.nside >= 256) {
    return { min: highResMin, max: highResMax };
  }
  if (topology.nside >= 128) {
    return { min: highResMin * 1.2, max: highResMax * 1.35 };
  }
  if (topology.nside >= 64) {
    return { min: Math.min(lowResMin, 0.022), max: Math.min(lowResMax, 0.07) };
  }
  return { min: lowResMin, max: lowResMax };
}

function baobabIconSize(cell, value) {
  const raw = rawCellVisualSize(cell);
  const scale = 3.0 + Math.sqrt(Math.max(0, value)) * 1.15;
  const bounds = objectIconClampForResolution(0.045, 0.13, 0.012, 0.044);
  return THREE.MathUtils.clamp(raw * scale, bounds.min, bounds.max);
}

function rosePatchIconSize(cell, vigor) {
  const raw = rawCellVisualSize(cell);
  const scale = state.planetPreset === "earth"
    ? 2.35 + vigor * 0.95
    : 2.75 + vigor * 1.1;
  const bounds = state.planetPreset === "earth"
    ? objectIconClampForResolution(0.038, 0.082, 0.009, 0.026)
    : objectIconClampForResolution(0.052, 0.095, 0.012, 0.038);
  return THREE.MathUtils.clamp(raw * scale, bounds.min, bounds.max);
}

function primaryRoseIconSize(cell, vigor) {
  const raw = rawCellVisualSize(cell);
  const scale = state.planetPreset === "earth"
    ? 2.6 + vigor * 1.1
    : 3.6 + vigor * 1.5;
  const bounds = state.planetPreset === "earth"
    ? objectIconClampForResolution(0.045, 0.09, 0.011, 0.03)
    : objectIconClampForResolution(0.07, 0.15, 0.015, 0.052);
  return THREE.MathUtils.clamp(raw * scale, bounds.min, bounds.max);
}

function hierarchyObjectSize(cell) {
  return tileSizeForNside(hierarchyParentCell(cell), HIERARCHY_OBJECT_NSIDE);
}

function hierarchyParentCell(cell) {
  if (topology.nside <= HIERARCHY_OBJECT_NSIDE) {
    return cell;
  }

  const scale = topology.nside / HIERARCHY_OBJECT_NSIDE;
  const parentIx = Math.min(HIERARCHY_OBJECT_NSIDE - 1, Math.floor(cell.ix / scale));
  const parentIy = Math.min(HIERARCHY_OBJECT_NSIDE - 1, Math.floor(cell.iy / scale));
  const parentId = cell.face * HIERARCHY_OBJECT_NSIDE * HIERARCHY_OBJECT_NSIDE + parentIy + HIERARCHY_OBJECT_NSIDE * parentIx;
  return hierarchyObjectTopology.cells[parentId] ?? cell;
}

function hierarchyCellKey(cell) {
  return `${cell.face}:${cell.ix}:${cell.iy}`;
}

function tileSizeForNside(cell, nside) {
  const latitudeRadius = Math.sqrt(Math.max(0.04, 1 - cell.height * cell.height));
  const eastArc = (Math.PI * 2 * latitudeRadius) / cell.nphi;
  const minSize = nside <= 2 ? 0.17 : 0.05;
  const maxSize = nside <= 2 ? 0.34 : 0.2;
  return THREE.MathUtils.clamp(eastArc * 0.72, minSize, maxSize);
}

function focusCameraOnCentralObject() {
  if (state.planetPreset !== "earth") {
    return;
  }

  focusCameraOnCell(state.crashCell ?? state.selectedCell);
}

function focusCameraOnCell(cellId) {
  const cell = topology.cells[cellId];
  if (!cell) {
    return;
  }

  const normal = vectorForCell(cell);
  const distance = camera.position.distanceTo(controls.target) || initialCameraDistance;
  controls.target.set(0, 0, 0);
  camera.position.copy(normal).multiplyScalar(distance);
  camera.lookAt(controls.target);
  cameraFocusTarget.copy(camera.position);
  hasCameraFocusTarget = false;
  focusHoldUntil = 0;
  controls.update();
  invalidateRender(420);
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
  invalidateRender(holdMs);
}

function updateLocatorMarker() {
  const cellId = locatorLocked ? state.selectedCell : hoveredCellId ?? focusCellId ?? state.selectedCell;
  const cell = cellId === null ? null : topology.cells[cellId];
  const locator = locatorGroup.children.find((item) => item.userData.locator);

  if (!cell || !locator) {
    if (locator) {
      locator.visible = false;
    }
    return;
  }

  const normal = vectorForCell(cell);
  const renderCellId = renderCellIdForSimulationCellId(cellId);
  const renderCell = renderCellId === null ? null : renderTopology.cells[renderCellId];
  const sizeSourceCell = renderCell ?? cell;
  const sizeSourceTopology = renderCell ? renderTopology : topology;
  const size = tileSize(sizeSourceCell, sizeSourceTopology) * (isRenderLodActive() ? 0.48 : 0.66);
  locator.position.copy(normal).multiplyScalar(1.112);
  locator.quaternion.setFromUnitVectors(unitZ, normal);
  locator.scale.set(size, size, 1);
  locator.visible = true;
}

function render() {
  if (webglContextLost) {
    updateSunMarkerPosition();
    return;
  }
  if (timeIntegrationDepth > 0) {
    return;
  }

  if (hasCameraFocusTarget) {
    camera.position.lerp(cameraFocusTarget, 0.07);
    if (camera.position.distanceTo(cameraFocusTarget) < 0.008) {
      camera.position.copy(cameraFocusTarget);
      hasCameraFocusTarget = false;
    }
  }

  const focusHold = hasCameraFocusTarget || performance.now() < focusHoldUntil;
  controls.autoRotate = false;
  controls.update();
  updateLodObjectMarkersForCamera();
  updateViewFillLight();
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.setScissorTest(false);
  renderer.render(scene, camera);
  positionAxisWidget();
  updateSunMarkerPosition();
}

function invalidateRender(activeMs = 180) {
  renderDirty = true;
  if (Number.isFinite(activeMs) && activeMs > 0) {
    renderActiveUntil = Math.max(renderActiveUntil, performance.now() + activeMs);
  }
}

function updateLodObjectMarkersForCamera() {
  if (!isRenderLodActive()) {
    if (lastLocalLodOverlayKey !== null) {
      lastLocalLodOverlayKey = null;
      disposeLocalDetailTiles();
    }
    return;
  }

  const centerRenderId = cameraCenterRenderCellId()
    ?? renderCellIdForSimulationCellId(focusCellId ?? state.selectedCell ?? state.roseCell);
  const key = [
    shouldShowLocalDetailMesh() ? "detail" : "coarse",
    shouldShowLocalObjectMarkers() ? "objects" : "plain",
    centerRenderId ?? "none",
    detailCameraLodBucket(),
    viewMode
  ].join(":");
  if (key === lastLocalLodOverlayKey) {
    return;
  }

  lastLocalLodOverlayKey = key;
  rebuildLocalDetailTiles();
  rebuildMarkers();
  updateLayerObjectVisibility();
  updateLocatorMarker();
}

function detailCameraLodBucket() {
  const distance = camera.position.distanceTo(controls.target);
  lodCameraDirection.copy(camera.position).sub(controls.target);
  if (lodCameraDirection.lengthSq() <= 0) {
    return `d${Math.round(distance * 10)}`;
  }
  lodCameraDirection.normalize();
  return [
    `d${Math.round(distance * 12)}`,
    `x${Math.round(lodCameraDirection.x * 24)}`,
    `y${Math.round(lodCameraDirection.y * 24)}`,
    `z${Math.round(lodCameraDirection.z * 24)}`
  ].join(",");
}

function renderLoop(now = performance.now()) {
  const focusActive = hasCameraFocusTarget || now < focusHoldUntil;
  const interactionActive = now < renderActiveUntil;
  const periodicRefreshDue = now - lastRenderAt > 1000;
  if (renderDirty || focusActive || interactionActive || periodicRefreshDue) {
    render();
    renderDirty = false;
    lastRenderAt = now;
  }
  window.requestAnimationFrame(renderLoop);
}

function updateViewFillLight() {
  viewFillLight.position.copy(camera.position).normalize().multiplyScalar(4.8);
  viewFillLight.target.updateMatrixWorld();
}

function updateSunMarkerPosition() {
  if (!sunMarker) {
    return;
  }

  const roseAltitude = sunDirection.dot(sunRoseNormal);
  const overheadWeight = smoothLimit(roseAltitude, 0.45, 0.92);
  sunScreenPosition.copy(sunDirection).multiplyScalar(SUN_VISUAL_DISTANCE).project(camera);
  sunNearScreenPosition.copy(sunDirection).multiplyScalar(1.22).project(camera);
  const width = window.innerWidth;
  const height = window.innerHeight;
  let projectedX = THREE.MathUtils.lerp(
    (sunScreenPosition.x * 0.5 + 0.5) * width,
    (sunNearScreenPosition.x * 0.5 + 0.5) * width,
    overheadWeight
  );
  let projectedY = THREE.MathUtils.lerp(
    (-sunScreenPosition.y * 0.5 + 0.5) * height,
    (-sunNearScreenPosition.y * 0.5 + 0.5) * height,
    overheadWeight
  );
  if (!Number.isFinite(projectedX) || !Number.isFinite(projectedY)) {
    sunMarker.hidden = true;
    return;
  }

  const asteroidCenter = new THREE.Vector3(0, 0, 0).project(camera);
  const asteroidRimPoint = camera.up.clone().normalize().multiplyScalar(1.18).project(camera);
  const asteroidX = (asteroidCenter.x * 0.5 + 0.5) * width;
  const asteroidY = (-asteroidCenter.y * 0.5 + 0.5) * height;
  const rimX = (asteroidRimPoint.x * 0.5 + 0.5) * width;
  const rimY = (-asteroidRimPoint.y * 0.5 + 0.5) * height;
  const protectedRadius = Math.hypot(rimX - asteroidX, rimY - asteroidY) + THREE.MathUtils.lerp(72, 150, overheadWeight);
  let offsetX = projectedX - asteroidX;
  let offsetY = projectedY - asteroidY;
  let offsetLength = Math.hypot(offsetX, offsetY);
  if (offsetLength < protectedRadius) {
    if (offsetLength < 0.001) {
      offsetX = sunEastAxis.x >= 0 ? 1 : -1;
      offsetY = 0;
      offsetLength = 1;
    }
    projectedX = asteroidX + (offsetX / offsetLength) * protectedRadius;
    projectedY = asteroidY + (offsetY / offsetLength) * protectedRadius;
  }

  const markerMargin = 44;
  const hudBottom = hud ? hud.getBoundingClientRect().bottom : 0;
  const minX = markerMargin;
  const maxX = width - markerMargin;
  const minY = Math.max(markerMargin, hudBottom + 26);
  const maxY = height - markerMargin;
  const x = THREE.MathUtils.clamp(projectedX, minX, maxX);
  const y = THREE.MathUtils.clamp(projectedY, minY, maxY);

  sunMarker.hidden = false;
  sunMarker.style.left = `${x}px`;
  sunMarker.style.top = `${y}px`;
}

function positionAxisWidget() {
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
  netCanvasSizeDirty = true;
  drawNetBoard();
  invalidateRender(520);
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
  invalidateRender(900);
}

function onPointerMove(event) {
  if (locatorLocked) {
    return;
  }

  const cellId = pickCell(event);
  if (cellId !== hoveredCellId) {
    hoveredCellId = cellId;
    if (cellId !== null) {
      focusCellId = cellId;
    }
    queueLightRefresh();
  }
}

function onPointerUp(event) {
  if (!pointerDown || pointerDown.id !== event.pointerId) {
    return;
  }

  const dragDistance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  const tapMoveLimit = pointerDown.type === "touch" || pointerDown.type === "pen" ? 16 : 7;
  pointerDown = null;

  if (dragDistance > tapMoveLimit) {
    return;
  }

  const cellId = pickCell(event);
  if (cellId !== null) {
    nudgeCameraTowardCell(cellId);
    handleCellClick(cellId);
  }
}

function clearHover() {
  if (locatorLocked) {
    pointerDown = null;
    return;
  }

  if (hoveredCellId !== null) {
    hoveredCellId = null;
    queueLightRefresh();
  }
  pointerDown = null;
}

function pickCell(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);

  for (let layerIndex = localDetailLayers.length - 1; layerIndex >= 0; layerIndex -= 1) {
    const layer = localDetailLayers[layerIndex];
    if (!layer.mesh?.visible) {
      continue;
    }
    const detailIntersections = raycaster.intersectObject(layer.mesh, false);
    for (const intersection of detailIntersections) {
      if (intersection.point.dot(camera.position) <= 0) {
        continue;
      }
      const layerCellId = layer.mesh.userData.tileCellByFace?.[intersection.faceIndex];
      if (layerCellId !== undefined && layerCellId !== null) {
        const representativeId = layer.representativeIdsByCellId[layerCellId];
        return representativeId >= 0 ? representativeId : layerCellId;
      }
    }
  }

  const sphereHit = raycaster.ray.intersectSphere(pickSphere, pickPoint);
  if (sphereHit && pickPoint.dot(camera.position) > 0) {
    return cellIdForSpherePoint(pickPoint);
  }

  if (markerGroup.visible) {
    const markerIntersections = raycaster.intersectObjects(markerGroup.children, false);
    for (const intersection of markerIntersections) {
      const pickCellId = intersection.object.userData.pickCellId;
      if (pickCellId !== undefined && intersection.point.dot(camera.position) > 0) {
        return pickCellId;
      }
    }
  }

  return null;
}

function cellIdForSpherePoint(point) {
  return simulationCellIdForRenderCellId(renderCellIdForSpherePoint(point));
}

function ringForHeight(height) {
  if (pickRingBoundaries.length === 0) {
    return Math.max(1, Math.min(renderTopology.maxRing, Math.round((1 - height) * renderTopology.nside * 2)));
  }

  let low = 1;
  let high = renderTopology.maxRing;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (height < pickRingBoundaries[middle]) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}
