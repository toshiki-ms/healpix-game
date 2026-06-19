import { earthClimateForCell, earthRainClimatologyForCell } from "./earth-reference.js";
import {
  bindAsteroidSimulationModel,
  canRunWasmPhotosynthesis,
  canRunWasmSoilBiogeochemistry,
  preloadAsteroidSimulationCore,
  runWasmBuildRoseSeedDispersalKernel,
  runWasmApplyWater,
  runWasmAsteroidDaysideRain,
  runWasmCanopyEnvironment,
  runWasmCanopyOptics,
  runWasmDarcyWaterColumns,
  runWasmEarthRain,
  runWasmEcosystemStep,
  runWasmEcosystemStepsInPlace,
  runWasmEcosystemStepsThreaded,
  runWasmHydraulicState,
  runWasmInitializeVegetationState,
  runWasmPlantCarbonSeeds,
  runWasmPlantWaterFluxes,
  runWasmPhotosynthesis,
  runWasmPrepareAndPhotosynthesis,
  runWasmPreparePhotosynthesisInputs,
  runWasmRainMemory,
  runWasmRemoveBaobab,
  runWasmRemoveRose,
  runWasmRichardsColumns,
  runWasmRoseSeedProductionAndDispersal,
  runWasmSoilBiogeochemistry,
  runWasmStableSurfaceWaterTransport,
  runWasmSurfaceNutrientTransport
} from "./asteroid-sim-core.js";

export { preloadAsteroidSimulationCore };

export const MODEL_DT_DAYS = 3 / 24;
const HYDROLOGY_SUBSTEPS = 1;
const IRRIGATION_INFILTRATION_DAYS = 0.18;
const IRRIGATION_INFILTRATION_SUBSTEPS = 6;
const IRRIGATION_INFILTRATION_SUBSTEP_DAYS = IRRIGATION_INFILTRATION_DAYS / IRRIGATION_INFILTRATION_SUBSTEPS;
const PLANET_RADIUS_M = 6_371_000;
const CELL_SIZE_M = PLANET_RADIUS_M * Math.sqrt((4 * Math.PI) / (12 * 16 * 16));
const SEED_DISPERSAL_REFERENCE_NSIDE = 64;
const SEED_DISPERSAL_REFERENCE_CELL_SIZE_M =
  PLANET_RADIUS_M * Math.sqrt((4 * Math.PI) / (12 * SEED_DISPERSAL_REFERENCE_NSIDE * SEED_DISPERSAL_REFERENCE_NSIDE));
const TOP_SOIL_WATER_CAP_M = 0.045;
const DEEP_SOIL_WATER_CAP_M = 0.16;
const SOIL_LAYER_COUNT = 3;
const DEEP_SOIL_LAYER_FRACTIONS = Object.freeze([0.44, 0.56]);
const AQUIFER_WATER_CAP_M = 0.14;
const SURFACE_WATER_DIFF_M2_DAY = 90000;
const SURFACE_SLOPE_VELOCITY_M_DAY = 920;
const SURFACE_SLOPE_MAX_VELOCITY_M_DAY = 12000;
const SURFACE_MANNING_ROUGHNESS = 0.055;
const SECONDS_PER_DAY = 86400;
const SURFACE_TRANSPORT_DIFFUSION_CFL = 0.2;
const SURFACE_TRANSPORT_ADVECTION_CFL = 0.25;
const SURFACE_WATER_NUMERIC_FLOOR_M = 1e-10;
const MIN_EFFECTIVE_SATURATION = 0.012;
const MAX_MATRIC_SUCTION_M = 240;
const SURFACE_FILM_THRESHOLD_M = 0.00025;
const GROUNDWATER_DEFAULT_FLOW = 0.006;
const CLEAR_SKY_PAR_MOL_M2_DAY = 42;
const DIURNAL_SUNLIGHT_TO_DAILY_PAR_SCALE = Math.PI;
const SECONDS_PER_ASSIMILATION_DAY = 43200;
const PAR_MJ_PER_MOL = 0.218;
const PAR_FRACTION_OF_SHORTWAVE = 0.45;
const PSYCHROMETRIC_CONSTANT_KPA_C = 0.066;
const REFERENCE_WIND_SPEED_M_S = 1.65;
const REFERENCE_AERODYNAMIC_CONDUCTANCE_M_S = REFERENCE_WIND_SPEED_M_S / 208;
const REFERENCE_SURFACE_CONDUCTANCE_M_S =
  REFERENCE_AERODYNAMIC_CONDUCTANCE_M_S / Math.max(0.05, 0.34 * REFERENCE_WIND_SPEED_M_S);
const BARE_SOIL_AERODYNAMIC_CONDUCTANCE_M_S = Math.min(
  0.018,
  Math.max(0.0035, REFERENCE_AERODYNAMIC_CONDUCTANCE_M_S * (0.72 + 0.18 * REFERENCE_WIND_SPEED_M_S))
);
const MOLAR_VOLUME_AIR_M3_MOL = 0.02445;
const ATMOSPHERIC_CO2_UMOL_MOL = 420;
const ATMOSPHERIC_O2_UMOL_MOL = 210000;
const GAS_CONSTANT_J_MOL_K = 8.314;
const SEED_DIFF_BAOBAB_M2_DAY = 430;
const ROSE_SEED_DISPERSAL_LENGTH_M = SEED_DISPERSAL_REFERENCE_CELL_SIZE_M * 0.25;
const ROSE_SEED_DISPERSAL_COHORTS = 4;
const ROSE_SEED_MATURITY_C = 0.12;
const ROSE_SEED_STORE_FRACTION_PER_DAY = 0.28;
const ROSE_SEED_PRODUCTION_COEFF = 0.015;
const ROSE_SEED_BASE_MORTALITY = 0.0035;
const ROSE_SEED_STRESS_MORTALITY = 0.026;
const ROSE_BACKGROUND_MORTALITY = 0.00002;
const NUTRIENT_DIFF_M2_DAY = 95;
const NUTRIENT_MIN_MOBILE_FRACTION = 0.012;
const NUTRIENT_MAX_MOBILE_FRACTION = 0.24;
const RAIN_DISPLAY_AVERAGE_DAYS = 4;
const RBF_FD_STENCIL_SIZE = 9;
const RBF_FD_ASSET_MAGIC = 0x48424652;
const RBF_FD_ASSET_VERSION = 4;
const RBF_FD_HEADER_BYTES = 64;
const RBF_FD_CANONICAL_DIGITS = 8;
const RBF_FD_TRANSFORM_STRIDE = 6;
const RBF_FD_PHS_POWER = 5;
const RBF_FD_POLY_PAIRS = Object.freeze([
  Object.freeze([0, 0]),
  Object.freeze([1, 0]),
  Object.freeze([0, 1]),
  Object.freeze([2, 0]),
  Object.freeze([1, 1]),
  Object.freeze([0, 2])
]);
const HYDRAULIC_LOOKUP_STEPS = 16384;
const PHOTOSYNTHESIS_TEMP_MIN_C = -25;
const PHOTOSYNTHESIS_TEMP_MAX_C = 55;
const PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS = 2049;
const PHOTOSYNTHESIS_TEMP_LOOKUP_SCALE =
  (PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS - 1) / (PHOTOSYNTHESIS_TEMP_MAX_C - PHOTOSYNTHESIS_TEMP_MIN_C);
const IS_VITE_DEV = Boolean(import.meta.env?.DEV);

const RBF_FD_OPERATOR_URLS = Object.freeze({
  2: new URL("./assets/rbf-fd/operators-nside2.bin", import.meta.url).href,
  4: new URL("./assets/rbf-fd/operators-nside4.bin", import.meta.url).href,
  8: new URL("./assets/rbf-fd/operators-nside8.bin", import.meta.url).href,
  16: new URL("./assets/rbf-fd/operators-nside16.bin", import.meta.url).href,
  32: new URL("./assets/rbf-fd/operators-nside32.bin", import.meta.url).href,
  64: new URL("./assets/rbf-fd/operators-nside64.bin", import.meta.url).href
});

function isLocalHighResolutionOperator(nside) {
  return IS_VITE_DEV && (nside === 128 || nside === 256);
}

function rbfFdOperatorUrl(nside) {
  const url = RBF_FD_OPERATOR_URLS[nside];
  if (url) {
    return url;
  }
  if (isLocalHighResolutionOperator(nside)) {
    const moduleUrl = new URL(import.meta.url);
    moduleUrl.pathname = moduleUrl.pathname.replace(
      /\/[^/]*$/,
      `/assets/rbf-fd/operators-nside${nside}.bin`
    );
    moduleUrl.search = "";
    moduleUrl.hash = "";
    return moduleUrl.href;
  }
  return null;
}

const SUBSTRATES = Object.freeze([
  Object.freeze({
    key: "loam",
    cap0: 1.0,
    cap1: 1.0,
    infBare: 1.0,
    infVeg: 1.0,
    percolation: 1.0,
    leak: 1.0,
    evap: 1.0,
    rootB: 1.0,
    rootR: 1.0,
    nutrientB: 1.0,
    nutrientR: 1.0,
    thetaS: 0.46,
    thetaR: 0.08,
    vgAlpha: 1.55,
    vgN: 1.42,
    ksat0: 0.42,
    ksat1: 0.09,
    gwK: 0.018
  }),
  Object.freeze({
    key: "rock",
    cap0: 0.48,
    cap1: 0.38,
    infBare: 0.38,
    infVeg: 0.62,
    percolation: 0.42,
    leak: 1.45,
    evap: 1.18,
    rootB: 0.48,
    rootR: 0.38,
    nutrientB: 0.62,
    nutrientR: 0.55,
    thetaS: 0.32,
    thetaR: 0.06,
    vgAlpha: 0.75,
    vgN: 1.32,
    ksat0: 0.045,
    ksat1: 0.012,
    gwK: 0.004
  }),
  Object.freeze({
    key: "ash",
    cap0: 1.34,
    cap1: 1.28,
    infBare: 1.42,
    infVeg: 1.25,
    percolation: 1.18,
    leak: 0.74,
    evap: 0.86,
    rootB: 1.12,
    rootR: 1.1,
    nutrientB: 1.14,
    nutrientR: 1.2,
    thetaS: 0.55,
    thetaR: 0.1,
    vgAlpha: 1.25,
    vgN: 1.36,
    ksat0: 0.34,
    ksat1: 0.08,
    gwK: 0.014
  }),
  Object.freeze({
    key: "sand",
    cap0: 0.7,
    cap1: 0.72,
    infBare: 1.62,
    infVeg: 1.22,
    percolation: 1.72,
    leak: 1.56,
    evap: 1.08,
    rootB: 0.98,
    rootR: 0.86,
    nutrientB: 0.76,
    nutrientR: 0.7,
    thetaS: 0.38,
    thetaR: 0.035,
    vgAlpha: 4.4,
    vgN: 1.82,
    ksat0: 1.15,
    ksat1: 0.26,
    gwK: 0.032
  }),
  Object.freeze({
    key: "crust",
    cap0: 1.12,
    cap1: 0.96,
    infBare: 0.34,
    infVeg: 0.7,
    percolation: 0.5,
    leak: 0.66,
    evap: 1.26,
    rootB: 0.78,
    rootR: 0.64,
    nutrientB: 0.92,
    nutrientR: 0.86,
    thetaS: 0.44,
    thetaR: 0.12,
    vgAlpha: 0.52,
    vgN: 1.28,
    ksat0: 0.035,
    ksat1: 0.01,
    gwK: 0.0035
  })
]);

const SUBSTRATE_BAOBAB_GERMINATION_FACTOR = new Float32Array([1, 0.45, 1.12, 1, 0.82]);
const SUBSTRATE_LITTER_DECOMPOSITION_FACTOR = new Float32Array([1, 0.62, 1.08, 0.86, 0.72]);
const SUBSTRATE_ACTIVE_SOC_DECAY_FACTOR = new Float32Array([1, 1, 1.08, 0.82, 1]);

const DEFAULT_PARAMS = Object.freeze({
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
  roseGrowth: 1.8,
  baobabGrowth: 1.0,
  baobabSpread: 1,
  storage: 1.12,
  atmosphericCo2Ppm: 900
});

const BAOBAB_PHOTOSYNTHESIS = Object.freeze({
  vcmax25: 82,
  jmax25: 155,
  rd25: 0.52,
  quantumYield: 0.48,
  curvature: 0.72,
  ciMin: 0.46,
  ciMax: 0.72,
  extinction: 0.58,
  g0Mol: 0.012,
  g1: 3.1,
  maxConductanceMps: 0.014
});

const ROSE_PHOTOSYNTHESIS = Object.freeze({
  vcmax25: 100,
  jmax25: 200,
  rd25: 0.7,
  quantumYield: 0.5,
  curvature: 0.7,
  ciMin: 0.5,
  ciMax: 0.76,
  extinction: 0.68,
  g0Mol: 0.016,
  g1: 6.1,
  maxConductanceMps: 0.018
});

const BAOBAB_ROOT_WATER = Object.freeze({
  wetStressM: 0.06,
  optimalDryM: 105,
  wiltingM: 520
});

const ROSE_ROOT_WATER = Object.freeze({
  wetStressM: 0.05,
  optimalDryM: 18,
  wiltingM: 82
});

const BAOBAB_CARBON_TRAITS = Object.freeze({
  storageFraction: 0.16,
  storageMobilization: 0.9,
  growthRespirationFraction: 0.16,
  q10: 1.82,
  leafMaintenance: 0.00082,
  stemMaintenance: 0.00017,
  rootMaintenance: 0.00034,
  storageMaintenance: 0.00008,
  seedEstablishment: 0.26,
  leafTurnover: 0.0011,
  stemTurnover: 0.00004,
  rootTurnover: 0.00032
});

const ROSE_LEAF_MEAN_LIFETIME_DAYS = 900;
const ROSE_BLOOM_COHORT_MEAN_LIFETIME_DAYS = 420;
const ROSE_FINE_ROOT_MEAN_LIFETIME_DAYS = 1200;
const dailyTurnoverFromMeanLifetime = (days) => 1 / Math.max(1, days);

const ROSE_CARBON_TRAITS = Object.freeze({
  storageFraction: 0.16,
  storageMobilization: 0.9,
  growthRespirationFraction: 0.14,
  q10: 2.05,
  leafMaintenance: 0.00062,
  flowerMaintenance: 0.00082,
  rootMaintenance: 0.00028,
  storageMaintenance: 0.00008,
  seedEstablishment: 0.45,
  leafTurnover: dailyTurnoverFromMeanLifetime(ROSE_LEAF_MEAN_LIFETIME_DAYS),
  flowerTurnover: dailyTurnoverFromMeanLifetime(ROSE_BLOOM_COHORT_MEAN_LIFETIME_DAYS),
  rootTurnover: dailyTurnoverFromMeanLifetime(ROSE_FINE_ROOT_MEAN_LIFETIME_DAYS)
});

const LITTER_FAST_INPUT_FRACTION = 0.62;
const LITTER_FAST_INITIAL_FRACTION = 0.65;
const LITTER_HUMIFICATION_FRACTION = 0.34;
const ACTIVE_SOC_STABILIZATION_FRACTION = 0.18;
const BAOBAB_SPECIFIC_LEAF_AREA = 6.2;
const ROSE_SPECIFIC_LEAF_AREA = 6.4;
const ROSE_FLOWER_DISPLAY_LAI = 0.7;
const PFT_TRAITS = Object.freeze({
  baobab: Object.freeze({
    photosynthesis: BAOBAB_PHOTOSYNTHESIS,
    carbon: BAOBAB_CARBON_TRAITS,
    specificLeafArea: BAOBAB_SPECIFIC_LEAF_AREA,
    lightUseEfficiencyKgCPerMol: 0.00072,
    tempOptC: 28,
    tempMinC: -4,
    tempMaxC: 50,
    vpdSensitivityKpa: 3.7,
    co2HalfSaturationPpm: 260,
    maxLai: 8.5
  }),
  rose: Object.freeze({
    photosynthesis: ROSE_PHOTOSYNTHESIS,
    carbon: ROSE_CARBON_TRAITS,
    specificLeafArea: ROSE_SPECIFIC_LEAF_AREA,
    flowerDisplayLai: ROSE_FLOWER_DISPLAY_LAI,
    lightUseEfficiencyKgCPerMol: 0.00076,
    tempOptC: 24,
    tempMinC: 1,
    tempMaxC: 39,
    vpdSensitivityKpa: 2.1,
    co2HalfSaturationPpm: 230,
    maxLai: 6.5
  })
});

const photosynthesisTempLookupCache = new WeakMap();
const respirationQ10LookupCache = new Map();
const pftTempResponseCache = new WeakMap();
const q10TempLookupCache = new Map();
const farquharTempScratch = {
  vcmax: 0,
  jmax: 0,
  rd: 0,
  gammaStar: 0,
  kc: 0,
  ko: 0
};
const baobabFarquharTempScratch = {
  vcmax: 0,
  jmax: 0,
  rd: 0,
  gammaStar: 0,
  kc: 0,
  ko: 0
};
const roseFarquharTempScratch = {
  vcmax: 0,
  jmax: 0,
  rd: 0,
  gammaStar: 0,
  kc: 0,
  ko: 0
};

const operatorCache = new Map();

function activeProfileSink() {
  const sink = globalThis.__HEALPIX_ASTEROID_PROFILE__;
  return sink?.enabled && typeof performance !== "undefined" ? sink : null;
}

function addProfileTime(sink, name, elapsedMs) {
  if (!sink.sections) {
    sink.sections = {};
  }
  sink.sections[name] = (sink.sections[name] ?? 0) + elapsedMs;
}

export async function preloadAsteroidVegetationOperators(topology) {
  const cached = operatorCache.get(topology.nside);
  if (cached) {
    return cached;
  }

  const url = rbfFdOperatorUrl(topology.nside);
  if (!url || typeof fetch !== "function") {
    return operatorsFor(topology);
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`RBF-FD operator asset returned ${response.status}`);
    }
    const operators = decodeRbfFdOperatorData(await response.arrayBuffer(), topology);
    operatorCache.set(topology.nside, operators);
    return operators;
  } catch (error) {
    if (isLocalHighResolutionOperator(topology.nside)) {
      throw new Error(
        `Missing local RBF-FD operator asset for nside=${topology.nside}. ` +
          `Run: npm run generate:rbf-fd -- ${topology.nside}`,
        { cause: error }
      );
    }
    console.warn("Falling back to runtime RBF-FD operator generation.", error);
    return operatorsFor(topology);
  }
}

export function createAsteroidVegetationModel(topology, initial) {
  warmVegetationLookups();
  const profileSink = activeProfileSink();
  const profileStart = profileSink ? performance.now() : 0;
  let profileSectionStart = profileStart;
  const markProfile = (name) => {
    if (!profileSink || !profileSectionStart) {
      return;
    }
    const now = performance.now();
    addProfileTime(profileSink, name, now - profileSectionStart);
    profileSectionStart = now;
  };
  const size = topology.cells.length;
  const state = {
    H: new Float32Array(size),
    R: new Float32Array(size),
    W0: new Float32Array(size),
    W1: new Float32Array(size),
    soilWater: new Float32Array(size * SOIL_LAYER_COUNT),
    soilWaterN: new Float32Array(size * SOIL_LAYER_COUNT),
    soilHead: new Float32Array(size * SOIL_LAYER_COUNT),
    soilHydraulicK: new Float32Array(size * SOIL_LAYER_COUNT),
    soilTransmissivity: new Float32Array(size * SOIL_LAYER_COUNT),
    soilTransport: new Float32Array(size * SOIL_LAYER_COUNT),
    soilCap: new Float32Array(size * SOIL_LAYER_COUNT),
    soilResidual: new Float32Array(size * SOIL_LAYER_COUNT),
    soilThickness: new Float32Array(size * SOIL_LAYER_COUNT),
    soilCenterDepth: new Float32Array(size * SOIL_LAYER_COUNT),
    groundwaterStorage: new Float32Array(size),
    groundwaterStorageN: new Float32Array(size),
    groundwaterTransport: new Float32Array(size),
    groundwaterRecharge: new Float32Array(size),
    groundwaterCap: new Float32Array(size),
    groundwaterThickness: new Float32Array(size),
    groundwaterTopDepth: new Float32Array(size),
    hydrologyThroughfall: new Float32Array(size),
    hydrologyVegFeedback: new Float32Array(size),
    hydrologySink0: new Float32Array(size),
    hydrologySink1: new Float32Array(size),
    hydrologySink2: new Float32Array(size),
    hydrologyGroundwaterSink: new Float32Array(size),
    hydrologyInputM: new Float32Array(size),
    hydrologyCanopyEvapM: new Float32Array(size),
    hydrologySoilEvapM: new Float32Array(size),
    hydrologyRootUptakeM: new Float32Array(size),
    hydrologyLitterWaterM: new Float32Array(size),
    hydrologyHorizontalM: new Float32Array(size),
    hydrologyInfiltrationM: new Float32Array(size),
    hydrologyPercolation01M: new Float32Array(size),
    hydrologyPercolation12M: new Float32Array(size),
    hydrologyRechargeM: new Float32Array(size),
    hydrologyLeakageM: new Float32Array(size),
    hydrologySurfaceEvapDemandM: new Float32Array(size),
    hydrologySurfaceEvapM: new Float32Array(size),
    hydrologySurfaceDrainM: new Float32Array(size),
    hydrologyStorageBeforeM: new Float32Array(size),
    hydrologyStorageChangeM: new Float32Array(size),
    hydrologyResidualM: new Float32Array(size),
    MB: new Float32Array(size),
    MR: new Float32Array(size),
    SB: new Float32Array(size),
    baobabLeaf: new Float32Array(size),
    baobabStem: new Float32Array(size),
    baobabRoot: new Float32Array(size),
    baobabStore: new Float32Array(size),
    baobabSeed: new Float32Array(size),
    baobabLeafN: new Float32Array(size),
    baobabStemN: new Float32Array(size),
    baobabRootN: new Float32Array(size),
    baobabStoreN: new Float32Array(size),
    baobabSeedN: new Float32Array(size),
    roseLeaf: new Float32Array(size),
    roseFlower: new Float32Array(size),
    roseRoot: new Float32Array(size),
    roseStore: new Float32Array(size),
    roseSeed: new Float32Array(size),
    roseLeafN: new Float32Array(size),
    roseFlowerN: new Float32Array(size),
    roseRootN: new Float32Array(size),
    roseStoreN: new Float32Array(size),
    roseSeedN: new Float32Array(size),
    roseSeedProduction: new Float32Array(size),
    roseSeedArrival: new Float32Array(size),
    rainMemory: new Float32Array(size),
    snowIceM:
      initial.snowIceM instanceof Float32Array && initial.snowIceM.length === size
        ? initial.snowIceM
        : new Float32Array(size),
    par: new Float32Array(size),
    laiBaobab: new Float32Array(size),
    laiRose: new Float32Array(size),
    coverBaobab: new Float32Array(size),
    coverRose: new Float32Array(size),
    vegetationCover: new Float32Array(size),
    canopyLightBaobab: new Float32Array(size),
    canopyLightRose: new Float32Array(size),
    lightBaobab: new Float32Array(size),
    lightRose: new Float32Array(size),
    aparTotal: new Float32Array(size),
    aparBaobab: new Float32Array(size),
    aparRose: new Float32Array(size),
    surfaceTempC: new Float32Array(size),
    vpdKpa: new Float32Array(size),
    vaporSlopeKpaC: new Float32Array(size),
    et0: new Float32Array(size),
    canopyWater: new Float32Array(size),
    canopyWaterN: new Float32Array(size),
    canopyEvapM: new Float32Array(size),
    soilEvapM: new Float32Array(size),
    transpirationBaobabM: new Float32Array(size),
    transpirationRoseM: new Float32Array(size),
    photoWaterStressBaobab: new Float32Array(size),
    photoWaterStressRose: new Float32Array(size),
    photoNutrientBaobab: new Float32Array(size),
    photoNutrientRose: new Float32Array(size),
    gppBaobab: new Float32Array(size),
    gppRose: new Float32Array(size),
    lueGppBaobab: new Float32Array(size),
    lueGppRose: new Float32Array(size),
    nppBaobab: new Float32Array(size),
    nppRose: new Float32Array(size),
    carbonBalanceBaobab: new Float32Array(size),
    carbonBalanceRose: new Float32Array(size),
    maintenanceRespirationBaobab: new Float32Array(size),
    maintenanceRespirationRose: new Float32Array(size),
    growthRespirationBaobab: new Float32Array(size),
    growthRespirationRose: new Float32Array(size),
    autotrophicRespirationBaobab: new Float32Array(size),
    autotrophicRespirationRose: new Float32Array(size),
    carbonInputC: new Float32Array(size),
    carbonRespirationC: new Float32Array(size),
    carbonTransportC: new Float32Array(size),
    carbonDisturbanceC: new Float32Array(size),
    carbonStorageBeforeC: new Float32Array(size),
    carbonStorageChangeC: new Float32Array(size),
    carbonResidualC: new Float32Array(size),
    disturbanceCarbonExportC: new Float32Array(size),
    ecosystemCarbonC: new Float32Array(size),
    plantCarbonC: new Float32Array(size),
    seedCarbonC: new Float32Array(size),
    litterPoolCarbonC: new Float32Array(size),
    soilOrganicCarbonC: new Float32Array(size),
    netEcosystemProductionC: new Float32Array(size),
    baobabAllocLeaf: new Float32Array(size),
    baobabAllocStem: new Float32Array(size),
    baobabAllocRoot: new Float32Array(size),
    baobabAllocStore: new Float32Array(size),
    baobabAllocLeafC: new Float32Array(size),
    baobabAllocStemC: new Float32Array(size),
    baobabAllocRootC: new Float32Array(size),
    baobabAllocStoreC: new Float32Array(size),
    roseAllocLeaf: new Float32Array(size),
    roseAllocFlower: new Float32Array(size),
    roseAllocRoot: new Float32Array(size),
    roseAllocStore: new Float32Array(size),
    roseAllocLeafC: new Float32Array(size),
    roseAllocFlowerC: new Float32Array(size),
    roseAllocRootC: new Float32Array(size),
    roseAllocStoreC: new Float32Array(size),
    baobabLeafLossCarbon: new Float32Array(size),
    baobabStemLossCarbon: new Float32Array(size),
    baobabRootLossCarbon: new Float32Array(size),
    baobabLeafResidualCarbon: new Float32Array(size),
    baobabStemResidualCarbon: new Float32Array(size),
    baobabRootResidualCarbon: new Float32Array(size),
    baobabStoreResidualCarbon: new Float32Array(size),
    roseLeafLossCarbon: new Float32Array(size),
    roseFlowerLossCarbon: new Float32Array(size),
    roseRootLossCarbon: new Float32Array(size),
    roseLeafResidualCarbon: new Float32Array(size),
    roseFlowerResidualCarbon: new Float32Array(size),
    roseRootResidualCarbon: new Float32Array(size),
    roseStoreResidualCarbon: new Float32Array(size),
    stomatalConductanceBaobabMps: new Float32Array(size),
    stomatalConductanceRoseMps: new Float32Array(size),
    ciBaobab: new Float32Array(size),
    ciRose: new Float32Array(size),
    soilMineralN: new Float32Array(size),
    soilMineralNN: new Float32Array(size),
    soilMineralTransport: new Float32Array(size),
    litterCarbon: new Float32Array(size),
    litterCarbonN: new Float32Array(size),
    litterFastCarbon: new Float32Array(size),
    litterSlowCarbon: new Float32Array(size),
    litterFastCarbonN: new Float32Array(size),
    litterSlowCarbonN: new Float32Array(size),
    litterInputCarbon: new Float32Array(size),
    litterInputBaobabCarbon: new Float32Array(size),
    litterInputRoseCarbon: new Float32Array(size),
    litterInputSeedCarbon: new Float32Array(size),
    litterFastInputCarbon: new Float32Array(size),
    litterSlowInputCarbon: new Float32Array(size),
    litterFastDecayCarbon: new Float32Array(size),
    litterSlowDecayCarbon: new Float32Array(size),
    litterHumificationCarbon: new Float32Array(size),
    litterFastResidualCarbon: new Float32Array(size),
    litterSlowResidualCarbon: new Float32Array(size),
    soilCarbonActive: new Float32Array(size),
    soilCarbonStable: new Float32Array(size),
    soilCarbonActiveN: new Float32Array(size),
    soilCarbonStableN: new Float32Array(size),
    soilActiveDecayCarbon: new Float32Array(size),
    soilStabilizationCarbon: new Float32Array(size),
    soilStableDecayCarbon: new Float32Array(size),
    litterRespirationCarbon: new Float32Array(size),
    soilActiveRespirationCarbon: new Float32Array(size),
    soilStableRespirationCarbon: new Float32Array(size),
    soilActiveResidualCarbon: new Float32Array(size),
    soilStableResidualCarbon: new Float32Array(size),
    soilCarbonRespiration: new Float32Array(size),
    soilBioWetness: new Float32Array(size),
    soilBioTempC: new Float32Array(size),
    soilBioAshLoad: new Float32Array(size),
    soilBioTopSat: new Float32Array(size),
    soilBioGroundwaterSat: new Float32Array(size),
    soilBioLitterFastInput: new Float32Array(size),
    soilBioLitterSlowInput: new Float32Array(size),
    soilBioPlantNutrientUptake: new Float32Array(size),
    nutrientStressBaobab: new Float32Array(size),
    nutrientStressRose: new Float32Array(size),
    tempStressBaobab: new Float32Array(size),
    tempStressRose: new Float32Array(size),
    vpdStressBaobab: new Float32Array(size),
    vpdStressRose: new Float32Array(size),
    co2StressBaobab: new Float32Array(size),
    co2StressRose: new Float32Array(size),
    photosynthesisStressBaobab: new Float32Array(size),
    photosynthesisStressRose: new Float32Array(size),
    topMatricPotentialM: new Float32Array(size),
    rootStressBaobab: new Float32Array(size),
    rootStressRose: new Float32Array(size),
    slowEnvGppBaobab: new Float32Array(size),
    slowEnvGppRose: new Float32Array(size),
    slowEnvRootStressBaobab: new Float32Array(size),
    slowEnvRootStressRose: new Float32Array(size),
    slowEnvCanopyLightBaobab: new Float32Array(size),
    slowEnvCanopyLightRose: new Float32Array(size),
    slowEnvLightBaobab: new Float32Array(size),
    slowEnvLightRose: new Float32Array(size),
    slowEnvVegetationCover: new Float32Array(size),
    slowEnvSurfaceTempC: new Float32Array(size),
    slowEnvAshStress: new Float32Array(size),
    slowEnvWetness: new Float32Array(size),
    slowEnvTopSat: new Float32Array(size),
    slowEnvGroundwaterSat: new Float32Array(size),
    baobabSeedBank: new Float32Array(size),
    roseSeedBank: new Float32Array(size),
    baobabGermination: new Float32Array(size),
    roseGermination: new Float32Array(size),
    baobabGerminationReadiness: new Float32Array(size),
    roseGerminationReadiness: new Float32Array(size),
    baobabGerminationReadinessN: new Float32Array(size),
    roseGerminationReadinessN: new Float32Array(size),
    Hn: new Float32Array(size),
    W0n: new Float32Array(size),
    W1n: new Float32Array(size),
    fluxX: new Float32Array(size),
    fluxY: new Float32Array(size),
    surfaceUx: new Float32Array(size),
    surfaceUy: new Float32Array(size),
    topSoilUx: new Float32Array(size),
    topSoilUy: new Float32Array(size),
    groundwaterUx: new Float32Array(size),
    groundwaterUy: new Float32Array(size),
    Htransport: new Float32Array(size),
    baobabSeedTransport: new Float32Array(size),
    roseSeedTransport: new Float32Array(size),
    groundwaterHead: new Float32Array(size),
    groundwaterT: new Float32Array(size),
    MBn: new Float32Array(size),
    MRn: new Float32Array(size),
    SBn: new Float32Array(size),
    depth: new Float32Array(size),
    roseFertility: new Float32Array(size),
    baobabRisk: new Float32Array(size),
    ashStress: new Float32Array(size),
    baobabBlocked: new Uint8Array(size),
    sunlight: new Float32Array(size),
    rainClimatology: new Float32Array(size),
    cellHeight: new Float32Array(size),
    climateMeanTempC: new Float32Array(size),
    climateDiurnalRangeC: new Float32Array(size),
    elevation: new Float32Array(size),
    slopeX: new Float32Array(size),
    slopeY: new Float32Array(size),
    gwSlope: new Float32Array(size),
    substrate: new Uint8Array(size),
    landActive: new Uint8Array(size)
  };
  markProfile("vegetationInitAllocateState");

  const model = {
    topology,
    size,
    state,
    radiusM: sphereRadiusMForTopology(topology),
    cellSizeM: cellSizeMForTopology(topology),
    day: 0,
    lastRainM: 0,
    rng: mulberry32(7331 + topology.nside * 1009),
    rainMap: buildRainMap(topology),
    operators: operatorsFor(topology),
    planetPreset: initial.planetPreset ?? "asteroid",
    diagnosticsEnabled: false,
    params: { ...DEFAULT_PARAMS, ...(initial.params ?? {}) }
  };
  markProfile("vegetationInitModelObject");

  bindAsteroidSimulationModel(model, { primeBindings: false, copyState: false });
  markProfile("vegetationInitBindEmptyWasm");
  initialize(model, initial);
  markProfile("vegetationInitWasmState");
  model.activeCellIds = model.planetPreset === "earth" ? buildActiveCellIds(state.landActive) : null;
  model.inactiveCellIds = model.planetPreset === "earth" ? buildInactiveCellIds(state.landActive) : null;
  model.activeCellCount = model.activeCellIds ? model.activeCellIds.length : size;
  markProfile("vegetationInitActiveMasks");
  model.roseSeedDispersalKernel = buildRoseSeedDispersalKernel(model);
  markProfile("vegetationInitRoseSeedKernel");
  initializeInactiveCellState(model);
  markProfile("vegetationInitInactiveCells");
  updateHydraulicState(model);
  markProfile("vegetationInitHydraulicState");
  updateWaterStressDiagnostics(model);
  markProfile("vegetationInitWaterStressDiagnostics");
  refreshCarbonDiagnosticsFromPools(model, MODEL_DT_DAYS, true);
  markProfile("vegetationInitCarbonDiagnostics");
  bindAsteroidSimulationModel(model);
  markProfile("vegetationInitBindWasm");
  model.step = (options) => step(model, options);
  model.stepAsync = (options) => step(model, {
    ...options,
    threaded: shouldUseThreadedEcosystem()
  });
  model.applyWater = (cellIds, amountM, rateMDay = null, durationDays = IRRIGATION_INFILTRATION_DAYS) =>
    applyWater(model, cellIds, amountM, rateMDay, durationDays);
  model.removeBaobab = (cellId, amount) => removeBaobab(model, cellId, amount);
  model.removeRose = (cellId, amount) => removeRose(model, cellId, amount);
  model.tendRose = (cellId, roseCell, amount) => tendRose(model, cellId, roseCell, amount);
  model.roseHealth = (roseCell) => roseHealth(model, roseCell);
  model.syncToGame = (gameState, options) => syncToGame(model, gameState, options);
  model.setParams = (updates) => {
    if (Object.hasOwn(updates, "gwFlow")) {
      model.hydraulicStateCurrent = false;
    }
    model.params = { ...model.params, ...updates };
  };
  model.setDiagnosticsEnabled = (enabled) => {
    const nextEnabled = Boolean(enabled);
    if (nextEnabled && !model.diagnosticsEnabled) {
      refreshFastDiagnostics(model);
    }
    model.diagnosticsEnabled = nextEnabled;
  };
  model.getParams = () => ({ ...model.params });
  return model;
}

function shouldUseThreadedEcosystem() {
  if (globalThis.__HEALPIX_ASTEROID_ENABLE_THREADED__ === false) {
    return false;
  }
  if (globalThis.__HEALPIX_ASTEROID_ENABLE_THREADED__ === true) {
    return true;
  }
  return typeof SharedArrayBuffer !== "undefined" && globalThis.crossOriginIsolated === true;
}

function sphereRadiusMForTopology() {
  return PLANET_RADIUS_M;
}

function cellSizeMForTopology(topology) {
  return sphereRadiusMForTopology(topology) * Math.sqrt((4 * Math.PI) / topology.cells.length);
}

function initialize(model, initial) {
  if (runWasmInitializeVegetationState(model, initial)) {
    updateGroundwaterDirections(model);
    return;
  }
  throw new Error("WASM vegetation initialization is required.");

  const { topology, state } = model;
  const {
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
    seededNoise
  } = initial;
  const volcanoSet = new Set(volcanoCells);
  const activeVolcanoSet = new Set(activeVolcanoCells);
  const isEarth = planetPreset === "earth";

  for (const cell of topology.cells) {
    const id = cell.id;
    const terrainType = terrain[id];
    state.landActive[id] = terrainType === "water" ? 0 : 1;
    const isRoseGarden = id === roseCell || roseGardenMask?.[id] === 1;
    const localBaobabRisk = baobabRisk?.[id] ?? 0;
    const localBaobabBlocked = baobabBlocked?.[id] ?? 0;
    const noise = isEarth ? seededNoise(id, 503) : asteroidSoilField(cell, seededNoise, 503);
    let substrateId = 0;

    if (terrainType === "volcano" || volcanoSet.has(id)) {
      substrateId = 1;
    } else if ((ash?.[id] ?? 0) > 0.07 || activeVolcanoSet.has(id)) {
      substrateId = 2;
    } else if (terrainType === "crack") {
      substrateId = noise > 0.5 ? 3 : 4;
    } else if (terrainType === "path") {
      substrateId = 4;
    } else if (terrainType === "rock") {
      substrateId = 1;
    } else if (terrainType === "water") {
      substrateId = 0;
    } else {
      substrateId = noise > 0.72 ? 3 : 0;
    }

    if (isRoseGarden) {
      substrateId = 0;
    }

    const sub = SUBSTRATES[substrateId];
    const dryBias =
      terrainType === "volcano" ? -0.24 :
        terrainType === "water" ? 0.42 :
          terrainType === "crack" ? -0.18 :
            0;
    const initialRoseCoverForDepth = flower?.[id] ?? 0;
    const earthRoseDepthBoost = isEarth ? 0.22 * clamp(initialRoseCoverForDepth / 0.45) : 0;
    const basinNoise = isEarth ? seededNoise(id, 509) : asteroidSoilField(cell, seededNoise, 509);
    const basin = 0.46 + basinNoise * 0.2 + dryBias;
    const baobabRootingDepthBoost =
      !isEarth && !localBaobabBlocked && terrainType !== "volcano"
        ? 0.34 * clamp(localBaobabRisk)
        : 0;
    state.depth[id] = clamp(
      (id === roseCell ? (isEarth ? 1.22 : 1.62) : 0.72 + basin * 0.36) *
        (terrainType === "volcano" ? 0.56 : 1) +
        earthRoseDepthBoost +
        baobabRootingDepthBoost,
      0.32,
      1.65
    );
    state.substrate[id] = substrateId;
    if (isEarth) {
      const initialRose = flower?.[id] ?? 0;
      const unsuitableRoseGround =
        terrainType === "water" ||
        terrainType === "rock" ||
        terrainType === "volcano";
      const localMoisture = moisture?.[id] ?? 0.4;
      const earthRoseFertility = unsuitableRoseGround
        ? 0.08
        : clamp(
          0.34 +
            initialRose * 2.16 +
            (terrainType === "moss" || terrainType === "meadow" ? 0.34 : 0) +
            Math.max(0, localMoisture - 0.34) * 0.48 -
            (terrainType === "sand" ? 0.2 : 0) +
            (isRoseGarden ? 0.5 : 0),
          0.1,
          isRoseGarden ? 1.78 : 1.66
        );
      state.roseFertility[id] = id === roseCell ? Math.max(earthRoseFertility, 1.55) : earthRoseFertility;
    } else {
      const localMoisture = moisture?.[id] ?? 0.25;
      const localSoil = soil?.[id] ?? 0.48;
      const ashLoad = ash?.[id] ?? 0;
      const waterFit = clamp((localMoisture - 0.3) / 0.45);
      const soilFit = clamp((localSoil - 0.38) / 0.42);
      const terrainFit =
        terrainType === "rose" ? 0.46 :
          terrainType === "moss" ? 0.28 :
            terrainType === "path" ? 0.16 :
              terrainType === "sand" ? -0.06 :
                terrainType === "rock" ? -0.2 :
                  terrainType === "crack" ? -0.28 :
                    terrainType === "water" ? -0.18 :
                      0;
      const asteroidRoseFertility = clamp(
        0.16 +
          soilFit * 0.5 +
          waterFit * 0.32 +
          terrainFit -
          ashLoad * 0.62 -
          localBaobabRisk * 0.16,
        0.12,
        1.18
      );
      state.roseFertility[id] =
        id === roseCell ? 1.85 :
          isRoseGarden ? Math.max(1.12, asteroidRoseFertility) :
            asteroidRoseFertility;
    }
    state.baobabRisk[id] = localBaobabRisk;
    state.baobabBlocked[id] = localBaobabBlocked;
    state.sunlight[id] = 1;
    state.cellHeight[id] = cell.height;
    if (isEarth) {
      const climate = earthClimateForCell(cell);
      state.climateMeanTempC[id] = climate.meanTempC;
      state.climateDiurnalRangeC[id] = climate.diurnalRangeC;
    } else {
      state.climateMeanTempC[id] = 0;
      state.climateDiurnalRangeC[id] = 0;
    }
    state.elevation[id] = elevation?.[id] ?? 0;
    state.rainClimatology[id] = isEarth ? earthRainClimatologyForCell(cell, terrainType !== "water") : 1;
    updateSoilGeometryForCell(state, model.size, id, sub, state.depth[id]);
    state.H[id] = 0;
    state.R[id] = 0;
    state.rainMemory[id] = 0;
    state.ashStress[id] = ash?.[id] ?? 0;
    initializeSoilNutrients(state, id, sub, terrainType, isEarth, seededNoise(id, 533));

    const initialMoisture = moisture ? clamp(moisture[id]) : null;
    const initialWetness =
      initialMoisture !== null ? initialMoisture :
        terrainType === "water" ? 0.78 :
          id === roseCell ? 0.19 :
            terrainType === "volcano" ? 0.08 :
              0.14 + seededNoise(id, 521) * 0.12;
    initializeSoilProfile(
      state,
      id,
      model.size,
      sub,
      state.depth[id],
      initialWetness,
      seededNoise(id, 523)
    );
    initializeGroundwaterStorage(state, id, sub, state.depth[id], initialWetness, terrainType, seededNoise(id, 529));
    if (!isEarth && !localBaobabBlocked && terrainType !== "volcano" && localBaobabRisk > 0.45) {
      const cap = state.groundwaterCap[id];
      const fractureStorage = cap * (0.22 + 0.22 * clamp(localBaobabRisk));
      state.groundwaterStorage[id] = Math.max(state.groundwaterStorage[id], fractureStorage);
      state.W1[id] = state.groundwaterStorage[id];
    }
    const initialBaobabMass = state.baobabBlocked[id] ? 0 : clamp((baobab?.[id] ?? 0) * 1.25, 0, 1.1);
    const initialRoseCover = flower?.[id] ?? 0;
    const initialRoseMass =
      id === roseCell ? 0.42 :
        initialRoseCover > 0.04 ? clamp(initialRoseCover * (isRoseGarden ? 0.78 : 0.66), 0.055, isRoseGarden ? 0.5 : 0.36) :
          isEarth && isRoseGarden ? clamp(0.38 * 0.45, 0.08, 0.26) :
            0;
    initializeBaobabPools(state, id, initialBaobabMass, seededNoise(id, 541));
    initializeRosePools(state, id, initialRoseMass, id === roseCell ? 0.13 : 0.14);
    const baobabSeedBackground =
      isEarth
        ? state.baobabRisk[id] * 0.026
        : state.baobabRisk[id] > 0.72 && seededNoise(id, 547) > 0.92
          ? state.baobabRisk[id] * 0.006
          : 0;
    state.baobabSeed[id] = state.baobabBlocked[id] ? 0 : clamp(
      (baobabSeedBackground + initialBaobabMass * 0.018) * (0.65 + seededNoise(id, 547) * 0.7),
      0,
      0.16
    );
    const habitatSeedBank = isEarth ? state.roseFertility[id] * 0.01 : 0;
    const localRoseSeedBank = initialRoseMass * (isEarth ? 0.026 : 0.025);
    state.roseSeed[id] = clamp(
      (localRoseSeedBank + habitatSeedBank) *
        (0.72 + seededNoise(id, 549) * 0.55),
      0,
      isEarth ? 0.14 : 0.08
    );
    state.baobabGerminationReadiness[id] = clamp((initialWetness - 0.14) * 0.55 + seededNoise(id, 551) * 0.08, 0, 0.42);
    state.roseGerminationReadiness[id] = clamp(
      (initialWetness - 0.2) * 0.62 +
        isRoseGarden * 0.12 +
        clamp(state.roseFertility[id] / 1.6) * 0.08 +
        seededNoise(id, 553) * 0.06,
      0,
      0.52
    );

    if (isEarth && !state.baobabBlocked[id] && state.MB[id] <= 0 && (baobabRisk?.[id] ?? 0) > 0.72 && seededNoise(id, 557) > 0.78) {
      initializeBaobabPools(state, id, 0.045 + seededNoise(id, 563) * 0.05, 0.24);
      state.baobabSeed[id] = Math.max(state.baobabSeed[id], 0.03 + state.baobabRisk[id] * 0.02);
    }
  }

  updateGroundwaterDirections(model);
}

function buildActiveCellIds(landActive) {
  let count = 0;
  for (let i = 0; i < landActive.length; i += 1) {
    count += landActive[i] ? 1 : 0;
  }

  if (count === landActive.length) {
    return null;
  }

  const ids = new Uint32Array(count);
  let offset = 0;
  for (let i = 0; i < landActive.length; i += 1) {
    if (landActive[i]) {
      ids[offset] = i;
      offset += 1;
    }
  }
  return ids;
}

function buildInactiveCellIds(landActive) {
  let count = 0;
  for (let i = 0; i < landActive.length; i += 1) {
    count += landActive[i] ? 0 : 1;
  }

  if (count <= 0) {
    return null;
  }

  const ids = new Uint32Array(count);
  let offset = 0;
  for (let i = 0; i < landActive.length; i += 1) {
    if (!landActive[i]) {
      ids[offset] = i;
      offset += 1;
    }
  }
  return ids;
}

const INACTIVE_ZERO_CELL_ARRAY_KEYS = Object.freeze([
  "MB", "MR", "SB", "MBn", "MRn", "SBn",
  "baobabLeaf", "baobabStem", "baobabRoot", "baobabStore", "baobabSeed",
  "baobabLeafN", "baobabStemN", "baobabRootN", "baobabStoreN", "baobabSeedN",
  "roseLeaf", "roseFlower", "roseRoot", "roseStore", "roseSeed",
  "roseLeafN", "roseFlowerN", "roseRootN", "roseStoreN", "roseSeedN",
  "roseSeedProduction", "roseSeedArrival",
  "baobabGerminationReadiness", "roseGerminationReadiness",
  "baobabGerminationReadinessN", "roseGerminationReadinessN",
  "baobabGermination", "roseGermination",
  "laiBaobab", "laiRose", "coverBaobab", "coverRose", "vegetationCover",
  "aparTotal", "aparBaobab", "aparRose",
  "gppBaobab", "gppRose", "lueGppBaobab", "lueGppRose", "nppBaobab", "nppRose",
  "carbonBalanceBaobab", "carbonBalanceRose",
  "maintenanceRespirationBaobab", "maintenanceRespirationRose",
  "growthRespirationBaobab", "growthRespirationRose",
  "autotrophicRespirationBaobab", "autotrophicRespirationRose",
  "transpirationBaobabM", "transpirationRoseM",
  "baobabSeedTransport", "roseSeedTransport",
  "rootStressBaobab", "rootStressRose",
  "nutrientStressBaobab", "nutrientStressRose",
  "tempStressBaobab", "tempStressRose", "vpdStressBaobab", "vpdStressRose",
  "co2StressBaobab", "co2StressRose",
  "photosynthesisStressBaobab", "photosynthesisStressRose",
  "plantCarbonC", "seedCarbonC", "litterPoolCarbonC", "soilOrganicCarbonC",
  "ecosystemCarbonC", "netEcosystemProductionC",
  "carbonInputC", "carbonRespirationC", "carbonTransportC", "carbonDisturbanceC",
  "carbonStorageBeforeC", "carbonStorageChangeC", "carbonResidualC"
]);

function initializeInactiveCellState(model) {
  const { state, size } = model;
  const inactiveCellIds = model.inactiveCellIds;
  if (!inactiveCellIds) {
    return;
  }

  for (let offset = 0; offset < inactiveCellIds.length; offset += 1) {
    const i = inactiveCellIds[offset];
    state.H[i] = 0;
    state.Hn[i] = 0;
    state.R[i] = 0;
    state.fluxX[i] = 0;
    state.fluxY[i] = 0;
    state.surfaceUx[i] = 0;
    state.surfaceUy[i] = 0;
    state.topSoilUx[i] = 0;
    state.topSoilUy[i] = 0;
    state.groundwaterUx[i] = 0;
    state.groundwaterUy[i] = 0;
    state.Htransport[i] = 0;
    state.groundwaterTransport[i] = 0;
    state.groundwaterT[i] = 0;
    state.groundwaterStorageN[i] = state.groundwaterStorage[i];
    for (let layer = 0; layer < SOIL_LAYER_COUNT; layer += 1) {
      const index = soilIndex(size, layer, i);
      state.soilWaterN[index] = state.soilWater[index];
      state.soilHydraulicK[index] = 0;
      state.soilTransmissivity[index] = 0;
      state.soilTransport[index] = 0;
    }
  }

  for (const key of INACTIVE_ZERO_CELL_ARRAY_KEYS) {
    const values = state[key];
    if (!values) {
      continue;
    }
    for (let offset = 0; offset < inactiveCellIds.length; offset += 1) {
      values[inactiveCellIds[offset]] = 0;
    }
  }
}

function updateSoilGeometryForCell(state, size, id, substrate, depth) {
  let topDepth = 0;
  for (let layer = 0; layer < SOIL_LAYER_COUNT; layer += 1) {
    const index = soilIndex(size, layer, id);
    const cap = soilLayerCapacity(depth, substrate, layer);
    const thickness = soilLayerThickness(cap, substrate);
    state.soilCap[index] = cap;
    state.soilResidual[index] = residualStorage(cap, substrate);
    state.soilThickness[index] = thickness;
    state.soilCenterDepth[index] = topDepth + 0.5 * thickness;
    topDepth += thickness;
  }
  const groundwaterCapValue = groundwaterCapacity(depth, substrate);
  state.groundwaterCap[id] = groundwaterCapValue;
  state.groundwaterThickness[id] = groundwaterThickness(groundwaterCapValue, substrate);
  state.groundwaterTopDepth[id] = topDepth;
}

function initializeSoilProfile(state, id, size, substrate, depth, initialWetness, deepNoise) {
  for (let layer = 0; layer < SOIL_LAYER_COUNT; layer += 1) {
    const cap = state.soilCap[soilIndex(size, layer, id)] || soilLayerCapacity(depth, substrate, layer);
    const wetness =
      layer === 0
        ? initialWetness
        : initialWetness + 0.08 + layer * 0.055 + deepNoise * 0.08;
    state.soilWater[soilIndex(size, layer, id)] = clamp(cap * wetness, 0.01 * cap, 0.9 * cap);
  }
  syncWaterAggregatesForCell(state, id, size);
}

function initializeGroundwaterStorage(state, id, substrate, depth, initialWetness, terrainType, deepNoise) {
  const cap = state.groundwaterCap[id] || groundwaterCapacity(depth, substrate);
  const basinWetness =
    terrainType === "water" ? 0.72 :
      terrainType === "volcano" ? 0.16 :
        initialWetness + 0.2 + deepNoise * 0.16;
  state.groundwaterStorage[id] = clamp(cap * basinWetness, 0.02 * cap, 0.92 * cap);
  state.W1[id] = state.groundwaterStorage[id];
}

function initializeSoilNutrients(state, id, substrate, terrainType, isEarth, noise) {
  const terrainFactor =
    terrainType === "volcano" ? 0.18 :
      terrainType === "rock" ? 0.38 :
        terrainType === "crack" ? 0.52 :
          terrainType === "water" ? 0.72 :
            terrainType === "path" ? 0.46 :
              0.74;
  const ashPulse = clamp(state.ashStress[id] * 1.35);
  const fertility = clamp(state.roseFertility[id] / 1.8);
  const earthOrganicSoil =
    isEarth
      ? 0.06 + fertility * 0.16 + (terrainType === "moss" || terrainType === "meadow" ? 0.08 : 0)
      : 0;
  state.soilMineralN[id] = clamp(
    0.08 +
      terrainFactor * 0.18 +
      substrate.nutrientR * 0.22 +
      fertility * 0.18 +
      earthOrganicSoil * 0.34 +
      ashPulse * 0.12 +
      (isEarth ? 0.08 : 0) +
      (noise - 0.5) * 0.04,
    0.03,
    0.95
  );
  state.litterCarbon[id] = clamp((fertility * 0.08 + earthOrganicSoil * 0.16 + ashPulse * 0.025 + noise * 0.035) * (isEarth ? 1.35 : 0.72), 0, 0.28);
  state.litterFastCarbon[id] = state.litterCarbon[id] * LITTER_FAST_INITIAL_FRACTION;
  state.litterSlowCarbon[id] = state.litterCarbon[id] * (1 - LITTER_FAST_INITIAL_FRACTION);
  const soilCarbonBase = clamp(0.04 + state.soilMineralN[id] * 0.42 + fertility * 0.18 + earthOrganicSoil + (terrainType === "water" ? 0.18 : 0), 0.02, 1.12);
  state.soilCarbonActive[id] = soilCarbonBase * 0.28;
  state.soilCarbonStable[id] = soilCarbonBase * 0.72;
  state.nutrientStressBaobab[id] = nutrientStress(state.soilMineralN[id], substrate.nutrientB);
  state.nutrientStressRose[id] = nutrientStress(state.soilMineralN[id], substrate.nutrientR * clamp(0.45 + 0.55 * state.roseFertility[id], 0.32, 1.45));
}

function initializeBaobabPools(state, id, mass, storeFraction = 0.28) {
  const biomass = Math.max(0, mass);
  state.baobabLeaf[id] = biomass * 0.24;
  state.baobabStem[id] = biomass * 0.34;
  state.baobabRoot[id] = biomass * 0.42;
  state.baobabStore[id] = biomass * clamp(storeFraction, 0.08, 0.52);
  syncBaobabMassFromPools(state, id);
}

function initializeRosePools(state, id, mass, flowerFraction = 0.36) {
  const biomass = Math.max(0, mass);
  const flowerShare = clamp(flowerFraction, 0.03, 0.32);
  state.roseLeaf[id] = biomass * 0.38;
  state.roseFlower[id] = biomass * flowerShare;
  state.roseRoot[id] = biomass * Math.max(0.12, 1 - 0.38 - flowerShare);
  state.roseStore[id] = biomass * 0.12;
  syncRoseMassFromPools(state, id);
}

function syncBaobabMassFromPools(state, id) {
  state.MB[id] = state.baobabLeaf[id] + state.baobabStem[id] + state.baobabRoot[id];
  state.SB[id] = state.baobabStore[id];
}

function syncRoseMassFromPools(state, id) {
  state.MR[id] = state.roseLeaf[id] + state.roseFlower[id] + state.roseRoot[id];
}

function updateGroundwaterDirections(model) {
  const { state, size } = model;
  for (let i = 0; i < size; i += 1) {
    const gx = gradX(model, state.elevation, i);
    const gy = gradY(model, state.elevation, i);
    const slope = Math.hypot(gx, gy);
    state.slopeX[i] = gx;
    state.slopeY[i] = gy;
    state.gwSlope[i] = slope;
  }
}

function asteroidSoilField(cell, seededNoise, salt) {
  const waveA = Math.sin(cell.phi * (1.8 + (salt % 5) * 0.27) + cell.height * (3.2 + (salt % 7) * 0.31));
  const waveB = Math.cos(cell.phi * (3.1 + (salt % 4) * 0.22) - cell.height * (5.1 + (salt % 6) * 0.24));
  const local = (seededNoise(cell.id, salt + 41) - 0.5) * 0.08;
  return clamp(0.5 + waveA * 0.23 + waveB * 0.18 + local);
}

function seasonalRain(model) {
  const { params, rng } = model;
  const wetDays = Math.max(25, 365 - params.dryDays);
  const wetFraction = wetDays / 365;
  const phase = model.day % 365;
  const inWet = phase < wetDays;

  if (model.planetPreset !== "earth") {
    const annualWaterM = params.annualPrecipMm / 1000;
    const meanDaily = annualWaterM / 365;
    const gentleCycle = 0.9 + 0.1 * Math.sin(model.day * 0.85);
    return meanDaily * gentleCycle;
  }

  const backgroundMean = 0.45;
  const seasonalMean = 0.55;
  if (!inWet) {
    const dryProbPerDay = 0.014;
    const dryPulse = rng() < dryProbPerDay * MODEL_DT_DAYS ? (seasonalMean * 0.08) / dryProbPerDay : 0;
    return backgroundMean + dryPulse;
  }

  const wetMean = seasonalMean / wetFraction;
  const pulseProbPerDay = 0.18 + 0.1 * Math.sin((2 * Math.PI * phase) / wetDays) ** 2;
  if (rng() >= pulseProbPerDay * MODEL_DT_DAYS) {
    return backgroundMean;
  }

  return backgroundMean + (wetMean / pulseProbPerDay) * (0.65 + 0.7 * rng());
}

function updateRainField(model, meanRain) {
  const { params, rainMap, size, state } = model;
  const rainField = state.R;
  if (meanRain <= 0) {
    rainField.fill(0);
    return;
  }

  if (model.planetPreset !== "earth") {
    updateAsteroidDaysideRainField(model, meanRain);
    return;
  }

  const patchiness = clamp(params.rainPatchiness);
  if (patchiness < 0.01) {
    for (let i = 0; i < size; i += 1) {
      rainField[i] = state.rainClimatology[i] * meanRain;
    }
    return;
  }

  const rainScale = clamp(params.rainScale, 5, 40);
  const tropicalScale = rainScale * 0.48;
  const midLatitudeScale = rainScale * 0.92;
  const stormSystems = movingRainSystems(model, rainScale);
  if (
    runWasmEarthRain(model, {
      meanRain,
      patchiness,
      tropicalScale,
      midLatitudeScale,
      stormSystems
    })
  ) {
    return;
  }

  rainField.fill(0);
  let rawSum = 0;
  let climatologySum = 0;
  for (let i = 0; i < size; i += 1) {
    const x = rainMap.x[i];
    const y = rainMap.y[i];
    const tropics = rainMap.tropics[i];
    const midLatitude = rainMap.midLatitude[i];
    let tropicalRain = 0;
    let midLatitudeRain = 0;

    for (const storm of stormSystems.tropical) {
      const dx = periodicDelta(x, storm.x, rainMap.renderSize);
      const dy = y - storm.y;
      const distance2 = dx * dx + dy * dy;
      const radius = tropicalScale * storm.radius;
      const envelope = Math.exp(-0.5 * distance2 / (radius * radius));
      const coreRadius = Math.max(0.35, radius * storm.coreRadius);
      const core = Math.exp(-0.5 * distance2 / (coreRadius * coreRadius));
      tropicalRain += storm.amp * (0.34 * envelope + storm.coreAmp * core);
    }

    for (const storm of stormSystems.midLatitude) {
      const dx = periodicDelta(x, storm.x, rainMap.renderSize);
      const dy = y - storm.y;
      const radius = midLatitudeScale * storm.radius;
      const distance2 = dx * dx + dy * dy;
      const core = Math.exp(-0.5 * distance2 / (radius * radius));
      const angle = Math.atan2(dy, dx);
      const lopsided = 0.78 + 0.22 * Math.cos(angle - storm.phase);
      midLatitudeRain += storm.amp * core * lopsided;
    }

    const broadClimateRain = 0.16 + 0.44 * (1 - patchiness);
    const weakBackground = rainMap.weakBackground[i];
    const climate = Math.max(0, state.rainClimatology[i]);
    const local = climate * (broadClimateRain + weakBackground + patchiness * (0.58 * tropics * tropicalRain + 0.72 * midLatitude * midLatitudeRain));
    rainField[i] = local;
    rawSum += local;
    climatologySum += climate;
  }

  const stormScale = rawSum > 0 ? (climatologySum * meanRain) / rawSum : 0;
  for (let i = 0; i < size; i += 1) {
    rainField[i] *= stormScale;
  }
}

function snowPrecipFractionFromMeanDiurnal(meanTempC, diurnalRangeC) {
  const amplitude = Math.max(0, diurnalRangeC) * 0.5;
  if (amplitude <= 1e-6) {
    return meanTempC < 0 ? 1 : 0;
  }
  if (meanTempC >= amplitude) {
    return 0;
  }
  if (meanTempC <= -amplitude) {
    return 1;
  }
  return clamp(0.5 - Math.asin(clamp(meanTempC / amplitude, -1, 1)) / Math.PI);
}

function partitionEarthPrecipitationPhase(model, dtDays) {
  if (model.planetPreset !== "earth" || dtDays <= 0) {
    return;
  }

  const { state, size } = model;
  const { R, snowIceM, climateMeanTempC, climateDiurnalRangeC } = state;
  if (!R || !snowIceM || !climateMeanTempC || !climateDiurnalRangeC) {
    return;
  }

  for (let i = 0; i < size; i += 1) {
    const precipitationRate = Math.max(0, R[i]);
    const snowFraction = snowPrecipFractionFromMeanDiurnal(climateMeanTempC[i], climateDiurnalRangeC[i]);
    const snowfallRate = precipitationRate * snowFraction;
    R[i] = Math.max(0, precipitationRate - snowfallRate);
    snowIceM[i] = Math.max(0, snowIceM[i] + snowfallRate * dtDays);
  }
}

function updateAsteroidDaysideRainField(model, meanRain) {
  const { params, rainMap, size, state } = model;
  const rainField = state.R;
  const day = model.day;
  const dayKey = Math.floor(day * 2.2);
  const renderSize = rainMap.renderSize;
  const rainScale = clamp(params.rainScale, 5, 40);
  const cloudCount = Math.max(2, Math.min(8, Math.round(Math.sqrt(size) / 11)));
  const patchiness = clamp(params.rainPatchiness);
  if (
    runWasmAsteroidDaysideRain(model, {
      meanRain,
      day,
      rainScale,
      patchiness,
      cloudCount
    })
  ) {
    return;
  }
  const clouds = [];
  for (let index = 0; index < cloudCount; index += 1) {
    const key = dayKey * 53 + index * 17;
    const phase = deterministicUnit(index, 731) * renderSize;
    const drift = day * (0.42 + deterministicUnit(index, 733) * 0.36);
    const centerX = moduloFloat(phase + drift + (deterministicUnit(key, 735) - 0.5) * rainScale * 0.55, renderSize);
    const centerY = renderSize * (0.5 + (deterministicUnit(index, 737) - 0.5) * 0.8) +
      Math.sin(day * (0.22 + deterministicUnit(index, 739) * 0.12) + deterministicUnit(index, 741) * Math.PI * 2) * rainScale * 0.42;
    const radius = rainScale * (0.24 + deterministicUnit(index, 743) * 0.3);
    clouds.push({
      centerX,
      centerY,
      invRadius2: 1 / (radius * radius),
      amp: 0.78 + deterministicUnit(index, 745) * 0.72
    });
  }
  rainField.fill(0);
  let rawSum = 0;

  for (let i = 0; i < size; i += 1) {
    const x = rainMap.x[i];
    const y = rainMap.y[i];
    const daylight = clamp((state.sunlight[i] - 0.03) / 0.68);
    const broadDayRain = Math.pow(daylight, 0.58);
    let cloudiness = 0;
    for (const cloud of clouds) {
      const dx = periodicDelta(x, cloud.centerX, renderSize);
      const dy = y - cloud.centerY;
      const core = Math.exp(-0.5 * (dx * dx + dy * dy) * cloud.invRadius2);
      cloudiness += core * core * cloud.amp;
    }

    cloudiness = clamp((cloudiness - 0.12) / 0.78);
    const movingVeil = asteroidRainVeil(x, y, renderSize, dayKey, day);
    const cloudMask = (1 - patchiness) * 0.58 + patchiness * (0.035 + 0.965 * cloudiness);
    const local = broadDayRain * clamp(movingVeil * cloudMask, 0.025, 1.18);
    rainField[i] = local;
    rawSum += local;
  }

  const scale = rawSum > 0 ? (meanRain * size) / rawSum : 0;
  for (let i = 0; i < size; i += 1) {
    rainField[i] *= scale;
  }
}

function asteroidRainVeil(x, y, renderSize, dayKey, day) {
  const invSize = renderSize > 0 ? 1 / renderSize : 0;
  const nx = x * invSize;
  const ny = y * invSize - 0.5;
  const tau = Math.PI * 2;
  const phaseA = dayKey * 0.91 + tau * (2 * nx + 0.75 * ny);
  const phaseB = day * 0.37 + tau * (3 * nx - 1.1 * ny);
  const phaseC = day * 0.19 + tau * (nx + 1.7 * ny);
  return 0.82 + 0.085 * Math.sin(phaseA) + 0.045 * Math.sin(phaseB) * Math.cos(phaseC);
}

function movingRainSystems(model, rainScale) {
  const { rainMap } = model;
  const day = model.day;
  const renderSize = rainMap.renderSize;
  const tropicalCount = Math.max(4, Math.min(12, Math.round(renderSize / Math.max(8, rainScale * 0.72))));
  const midCount = Math.max(4, Math.min(11, Math.round(renderSize / Math.max(10, rainScale * 0.82))));
  const tropical = [];
  const midLatitude = [];
  const convectiveKey = Math.floor(day * 1.45);
  const burstKey = Math.floor(day * 3.1);
  const strongIndex = Math.floor(deterministicUnit(convectiveKey, 161) * tropicalCount);

  for (let index = 0; index < tropicalCount; index += 1) {
    const key = convectiveKey * 37 + index * 11;
    const burst = burstKey * 41 + index * 13;
    const phase = deterministicUnit(key, 101) * renderSize;
    const drift = (day * (0.2 + deterministicUnit(index, 102) * 0.22)) % renderSize;
    const jitter = (deterministicUnit(key, 103) - 0.5) * renderSize * 0.22;
    const latitudeJitter = (deterministicUnit(key, 104) - 0.5) * 0.28;
    const isStrongCore = index === strongIndex;
    const activePulse =
      isStrongCore
        ? 1.2 + deterministicUnit(burst, 116) * 0.55
        : deterministicUnit(burst, 105) > 0.36
          ? 0.74 + deterministicUnit(burst, 106) * 0.68
          : 0.1 + deterministicUnit(burst, 107) * 0.18;
    tropical.push({
      x: moduloFloat(phase + drift + jitter, renderSize),
      y: renderSize * (0.5 + latitudeJitter),
      radius: isStrongCore ? 0.22 + deterministicUnit(key, 108) * 0.12 : 0.32 + deterministicUnit(key, 109) * 0.28,
      coreRadius: isStrongCore ? 0.16 + deterministicUnit(key, 110) * 0.08 : 0.24 + deterministicUnit(key, 111) * 0.14,
      coreAmp: isStrongCore ? 3.2 + deterministicUnit(key, 112) * 1.6 : 0.7 + deterministicUnit(key, 113) * 0.9,
      amp: (isStrongCore ? 1.85 + deterministicUnit(key, 114) * 1.45 : 0.46 + deterministicUnit(key, 115) * 0.95) * activePulse
    });
  }

  for (let index = 0; index < midCount; index += 1) {
    const hemisphere = deterministicUnit(index, 206) < 0.54 ? -1 : 1;
    const phase = deterministicUnit(index, 201) * renderSize;
    const eastwardDrift = day * (1.55 + deterministicUnit(index, 202) * 0.55);
    const latitude =
      0.19 +
      deterministicUnit(index, 203) * 0.17 +
      0.045 * Math.sin(day * (0.12 + deterministicUnit(index, 207) * 0.08) + deterministicUnit(index, 208) * Math.PI * 2);
    const meander = 0.035 * Math.sin(day * (0.18 + deterministicUnit(index, 209) * 0.11) + deterministicUnit(index, 210) * Math.PI * 2);
    midLatitude.push({
      x: moduloFloat(phase + eastwardDrift, renderSize),
      y: renderSize * (0.5 + hemisphere * latitude + meander),
      radius: 0.72 + deterministicUnit(index, 204) * 0.46,
      phase: deterministicUnit(index, 211) * Math.PI * 2 + day * (0.09 + deterministicUnit(index, 212) * 0.08),
      amp: 0.68 + deterministicUnit(index, 205) * 0.95
    });
  }

  return { tropical, midLatitude };
}

function polarRainMask(height) {
  return Math.exp(-0.5 * (height / 0.76) ** 4);
}

function updateHydraulicState(model) {
  const { params, state, size } = model;
  const gwMultiplier = clamp(params.gwFlow / GROUNDWATER_DEFAULT_FLOW, 0, 8);
  if (
    runWasmHydraulicState(model, {
      lookupSteps: HYDRAULIC_LOOKUP_STEPS,
      groundwaterFlowMultiplier: gwMultiplier,
      ...hydraulicLookupTablesForWasm()
    })
  ) {
    model.hydraulicStateCurrent = true;
    return;
  }
  const activeCellIds = model.activeCellIds;
  const cellCount = activeCellIds ? activeCellIds.length : size;
  const lookupByIndex = hydraulicLookups();
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    updateHydraulicStateForCell(model, activeCellIds ? activeCellIds[cellOffset] : cellOffset, lookupByIndex, gwMultiplier);
  }
  model.hydraulicStateCurrent = true;
}

function updateHydraulicStateForCell(
  model,
  i,
  lookupByIndex = hydraulicLookups(),
  gwMultiplier = clamp(model.params.gwFlow / GROUNDWATER_DEFAULT_FLOW, 0, 8)
) {
  const { state, size } = model;
  const size2 = size * 2;
  const {
    W0,
    W1,
    soilWater,
    soilCap,
    soilCenterDepth,
    soilHead,
    soilHydraulicK,
    soilThickness,
    soilTransmissivity,
    groundwaterStorage,
    groundwaterCap,
    groundwaterThickness,
    groundwaterTopDepth,
    groundwaterHead,
    groundwaterT,
    elevation,
    substrate
  } = state;
  const layer1Index = size + i;
  const layer2Index = size2 + i;
  const substrateIndex = substrate[i];
  const sub = SUBSTRATES[substrateIndex];
  const lookup = lookupByIndex[substrateIndex] ?? lookupByIndex[0];
  const psiTable = lookup.psi;
  const relativeKTable = lookup.relativeK;
  const localElevation = elevation[i];

  W0[i] = soilWater[i];
  W1[i] = groundwaterStorage[i];

  let sat = clamp(soilWater[i] / soilCap[i]);
  let x = sat * HYDRAULIC_LOOKUP_STEPS;
  let tableIndex = x | 0;
  if (tableIndex >= HYDRAULIC_LOOKUP_STEPS) {
    tableIndex = HYDRAULIC_LOOKUP_STEPS - 1;
  }
  let fraction = x - tableIndex;
  let psi = psiTable[tableIndex] + (psiTable[tableIndex + 1] - psiTable[tableIndex]) * fraction;
  let relK = relativeKTable[tableIndex] + (relativeKTable[tableIndex + 1] - relativeKTable[tableIndex]) * fraction;
  soilHead[i] = localElevation - soilCenterDepth[i] + psi;
  soilHydraulicK[i] = sub.ksat0 * relK;
  soilTransmissivity[i] = soilHydraulicK[i] * soilThickness[i];

  sat = clamp(soilWater[layer1Index] / soilCap[layer1Index]);
  x = sat * HYDRAULIC_LOOKUP_STEPS;
  tableIndex = x | 0;
  if (tableIndex >= HYDRAULIC_LOOKUP_STEPS) {
    tableIndex = HYDRAULIC_LOOKUP_STEPS - 1;
  }
  fraction = x - tableIndex;
  psi = psiTable[tableIndex] + (psiTable[tableIndex + 1] - psiTable[tableIndex]) * fraction;
  relK = relativeKTable[tableIndex] + (relativeKTable[tableIndex + 1] - relativeKTable[tableIndex]) * fraction;
  soilHead[layer1Index] = localElevation - soilCenterDepth[layer1Index] + psi;
  soilHydraulicK[layer1Index] = sub.ksat1 * relK;
  soilTransmissivity[layer1Index] = soilHydraulicK[layer1Index] * soilThickness[layer1Index];

  sat = clamp(soilWater[layer2Index] / soilCap[layer2Index]);
  x = sat * HYDRAULIC_LOOKUP_STEPS;
  tableIndex = x | 0;
  if (tableIndex >= HYDRAULIC_LOOKUP_STEPS) {
    tableIndex = HYDRAULIC_LOOKUP_STEPS - 1;
  }
  fraction = x - tableIndex;
  psi = psiTable[tableIndex] + (psiTable[tableIndex + 1] - psiTable[tableIndex]) * fraction;
  relK = relativeKTable[tableIndex] + (relativeKTable[tableIndex + 1] - relativeKTable[tableIndex]) * fraction;
  soilHead[layer2Index] = localElevation - soilCenterDepth[layer2Index] + psi;
  soilHydraulicK[layer2Index] = sub.ksat1 * relK;
  soilTransmissivity[layer2Index] = soilHydraulicK[layer2Index] * soilThickness[layer2Index];

  const gwCap = groundwaterCap[i];
  const gwThickness = groundwaterThickness[i];
  const gwSat = clamp(groundwaterStorage[i] / gwCap);
  const gwTopDepth = groundwaterTopDepth[i];
  groundwaterHead[i] = localElevation - gwTopDepth - gwThickness + gwThickness * gwSat;
  groundwaterT[i] = sub.gwK * gwThickness * (0.08 + 0.92 * gwSat ** 1.7) * gwMultiplier;
}

function updateSurfaceVelocityRbf(model) {
  const { state } = model;
  const { m, stencil, gxW, gyW } = model.operators;
  const elevation = state.elevation;
  const activeCellIds = model.activeCellIds;
  if (activeCellIds) {
    state.surfaceUx.fill(0);
    state.surfaceUy.fill(0);
  }
  const cellCount = activeCellIds ? activeCellIds.length : model.size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const offset = i * m;
    let filmGx = 0;
    let filmGy = 0;
    let surfaceMfdX = 0;
    let surfaceMfdY = 0;
    const centerSurfaceHead = elevation ? elevation[i] + state.H[i] : 0;
    for (let k = 0; k < m; k += 1) {
      const weightIndex = offset + k;
      const cellId = stencil[weightIndex];
      const value = state.H[cellId];
      filmGx += gxW[weightIndex] * value;
      filmGy += gyW[weightIndex] * value;
      if (elevation) {
        const surfaceDrop = centerSurfaceHead - (elevation[cellId] + value);
        if (surfaceDrop > 0) {
          surfaceMfdX += gxW[weightIndex] * surfaceDrop;
          surfaceMfdY += gyW[weightIndex] * surfaceDrop;
        }
      }
    }
    const downhillX = elevation ? surfaceMfdX : -(state.slopeX[i] + filmGx);
    const downhillY = elevation ? surfaceMfdY : -(state.slopeY[i] + filmGy);
    const surfaceScale = surfaceWaterVelocityScale(state.H[i], downhillX, downhillY);
    const surfaceVx = downhillX * surfaceScale;
    const surfaceVy = downhillY * surfaceScale;
    state.surfaceUx[i] = surfaceVx;
    state.surfaceUy[i] = surfaceVy;
  }
}

function surfaceWaterVelocityScale(surfaceWaterM, downhillX, downhillY) {
  const slope = Math.hypot(downhillX, downhillY);
  const mobileDepth = Math.max(0, surfaceWaterM - SURFACE_FILM_THRESHOLD_M);
  if (slope <= 1e-9 || mobileDepth <= 1e-8) {
    return 0;
  }
  const velocity =
    (SECONDS_PER_DAY / SURFACE_MANNING_ROUGHNESS) *
    Math.pow(Math.max(0.0005, mobileDepth), 2 / 3) *
    Math.sqrt(slope);
  return Math.min(SURFACE_SLOPE_MAX_VELOCITY_M_DAY, velocity) / slope;
}

function updateWaterStressDiagnostics(model) {
  const { params, state, size } = model;
  const activeCellIds = model.activeCellIds;
  const cellCount = activeCellIds ? activeCellIds.length : size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const sub = SUBSTRATES[state.substrate[i]];
    const layer0Index = soilIndex(size, 0, i);
    const layer1Index = soilIndex(size, 1, i);
    const layer2Index = soilIndex(size, 2, i);
    const s0 = clamp(state.soilWater[layer0Index] / state.soilCap[layer0Index]);
    const s1 = clamp(state.soilWater[layer1Index] / state.soilCap[layer1Index]);
    const s2 = clamp(state.soilWater[layer2Index] / state.soilCap[layer2Index]);
    const gwSat = clamp(state.groundwaterStorage[i] / state.groundwaterCap[i]);
    const baobabMass = Math.max(0, state.MB[i]);
    const roseMass = Math.max(0, state.MR[i]);
    const baobabRootFrac = baobabMass > 0 ? state.baobabRoot[i] / baobabMass : 0.42;
    const roseRootFrac = roseMass > 0 ? state.roseRoot[i] / roseMass : 0.24;
    const psi0 = matricPotentialM(sub, s0);
    const layerStressB = [
      rootWaterStressFromPsi(psi0, BAOBAB_ROOT_WATER),
      rootWaterStressFromPsi(matricPotentialM(sub, s1), BAOBAB_ROOT_WATER),
      rootWaterStressFromPsi(matricPotentialM(sub, s2), BAOBAB_ROOT_WATER),
      clamp(0.18 + 0.82 * gwSat)
    ];
    const layerStressR = [
      rootWaterStressFromPsi(psi0, ROSE_ROOT_WATER),
      rootWaterStressFromPsi(matricPotentialM(sub, s1), ROSE_ROOT_WATER),
      rootWaterStressFromPsi(matricPotentialM(sub, s2), ROSE_ROOT_WATER),
      0
    ];
    state.topMatricPotentialM[i] = psi0;
    state.rootStressBaobab[i] = weightedRootStress(baobabRootLayerFractions(params.rootDepth, baobabRootFrac), layerStressB, sub.rootB);
    state.rootStressRose[i] = weightedRootStress(roseRootLayerFractions(roseRootFrac), layerStressR, sub.rootR);
  }
}

function refreshFastDiagnostics(model) {
  const { state, size } = model;
  const activeCellIds = model.activeCellIds;
  const cellCount = activeCellIds ? activeCellIds.length : size;
  const baobabPft = PFT_TRAITS.baobab;
  const rosePft = PFT_TRAITS.rose;
  updateWaterStressDiagnostics(model);

  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const baobabMass = state.baobabLeaf[i] + state.baobabStem[i] + state.baobabRoot[i];
    const roseMass = state.roseLeaf[i] + state.roseFlower[i] + state.roseRoot[i];
    state.MB[i] = baobabMass;
    state.MR[i] = roseMass;
    state.SB[i] = state.baobabStore[i];

    const laiB = clamp(baobabPft.specificLeafArea * Math.max(0, state.baobabLeaf[i]), 0, baobabPft.maxLai);
    const laiR = clamp(
      rosePft.specificLeafArea * Math.max(0, state.roseLeaf[i]) +
        rosePft.flowerDisplayLai * Math.max(0, state.roseFlower[i]),
      0,
      rosePft.maxLai
    );
    const laiTotal = laiB + laiR;
    const opticalDepthB = baobabPft.photosynthesis.extinction * laiB;
    const opticalDepthR = rosePft.photosynthesis.extinction * laiR;
    const opticalDepthTotal = opticalDepthB + opticalDepthR;
    const aparTotal = state.par[i] > 0 && laiTotal > 1e-9 ? state.par[i] * (1 - Math.exp(-opticalDepthTotal)) : 0;
    state.laiBaobab[i] = laiB;
    state.laiRose[i] = laiR;
    state.coverBaobab[i] = clamp(1 - Math.exp(-opticalDepthB));
    state.coverRose[i] = clamp(1 - Math.exp(-opticalDepthR));
    state.vegetationCover[i] = clamp(1 - Math.exp(-opticalDepthTotal));
    state.aparTotal[i] = aparTotal;
    state.aparBaobab[i] = laiTotal > 1e-9 ? aparTotal * laiB / laiTotal : 0;
    state.aparRose[i] = laiTotal > 1e-9 ? aparTotal * laiR / laiTotal : 0;

    const sub = SUBSTRATES[state.substrate[i]];
    const roseSoil = state.roseFertility[i];
    state.nutrientStressBaobab[i] = nutrientStress(state.soilMineralN[i], sub.nutrientB);
    state.nutrientStressRose[i] = nutrientStress(
      state.soilMineralN[i],
      sub.nutrientR * clamp(0.45 + 0.55 * roseSoil, 0.32, 1.45)
    );
  }
}

function setVelocityFromHeadGradient(targetX, targetY, index, gradientX, gradientY, scale, maxSpeed) {
  let vx = -scale * gradientX;
  let vy = -scale * gradientY;
  const speed = Math.hypot(vx, vy);
  if (speed > maxSpeed && speed > 0) {
    const factor = maxSpeed / speed;
    vx *= factor;
    vy *= factor;
  }
  targetX[index] = vx;
  targetY[index] = vy;
}

function prepareFlux(model, field, ux, uy, threshold = 0) {
  const { fluxX, fluxY } = model.state;
  const activeCellIds = model.activeCellIds;
  if (activeCellIds) {
    fluxX.fill(0);
    fluxY.fill(0);
  }
  const cellCount = activeCellIds ? activeCellIds.length : model.size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const mobile = Math.max(0, field[i] - threshold);
    fluxX[i] = ux[i] * mobile;
    fluxY[i] = uy[i] * mobile;
  }
}

function prepareRichardsLayerFlux(model, layer, dtDays = MODEL_DT_DAYS) {
  const { state, size } = model;
  const { m, stencil, gxW, gyW } = model.operators;
  const cellSizeM = model.cellSizeM ?? CELL_SIZE_M;
  const offset = layer * size;
  const activeCellIds = model.activeCellIds;
  if (activeCellIds) {
    state.fluxX.fill(0);
    state.fluxY.fill(0);
    if (layer === 0) {
      state.topSoilUx.fill(0);
      state.topSoilUy.fill(0);
    }
  }
  const cellCount = activeCellIds ? activeCellIds.length : size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const storageIndex = offset + i;
    const transmissivity = state.soilHydraulicK[storageIndex] * state.soilThickness[storageIndex];
    const stencilOffset = i * m;
    let gx = 0;
    let gy = 0;
    for (let k = 0; k < m; k += 1) {
      const stencilIndex = offset + stencil[stencilOffset + k];
      const headValue = state.soilHead[stencilIndex];
      gx += gxW[stencilOffset + k] * headValue;
      gy += gyW[stencilOffset + k] * headValue;
    }
    const storage = state.soilWater[storageIndex];
    const maxFlux = Math.max(1e-7, storage * cellSizeM * 0.16 / dtDays);
    setLimitedDarcyFlux(state, i, transmissivity, gx, gy, maxFlux);
    if (layer === 0) {
      const speedScale = storage > 1e-9 ? 1 / storage : 0;
      state.topSoilUx[i] = state.fluxX[i] * speedScale;
      state.topSoilUy[i] = state.fluxY[i] * speedScale;
    }
  }
}

function prepareGroundwaterFlux(model, dtDays = MODEL_DT_DAYS) {
  const { state } = model;
  const { m, stencil, gxW, gyW } = model.operators;
  const cellSizeM = model.cellSizeM ?? CELL_SIZE_M;
  const activeCellIds = model.activeCellIds;
  if (activeCellIds) {
    state.fluxX.fill(0);
    state.fluxY.fill(0);
    state.groundwaterUx.fill(0);
    state.groundwaterUy.fill(0);
  }
  const cellCount = activeCellIds ? activeCellIds.length : model.size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const offset = i * m;
    let gx = 0;
    let gy = 0;
    for (let k = 0; k < m; k += 1) {
      const stencilIndex = stencil[offset + k];
      const headValue = state.groundwaterHead[stencilIndex];
      gx += gxW[offset + k] * headValue;
      gy += gyW[offset + k] * headValue;
    }
    const maxFlux = Math.max(1e-7, state.groundwaterStorage[i] * cellSizeM * 0.12 / dtDays);
    setLimitedDarcyFlux(state, i, state.groundwaterT[i], gx, gy, maxFlux);
    const speedScale = state.groundwaterStorage[i] > 1e-9 ? 1 / state.groundwaterStorage[i] : 0;
    state.groundwaterUx[i] = state.fluxX[i] * speedScale;
    state.groundwaterUy[i] = state.fluxY[i] * speedScale;
  }
}

function setLimitedDarcyFlux(state, i, transmissivity, gradientX, gradientY, maxFlux) {
  let qx = -transmissivity * gradientX;
  let qy = -transmissivity * gradientY;
  const magnitude = Math.hypot(qx, qy);
  if (magnitude > maxFlux && magnitude > 0) {
    const scale = maxFlux / magnitude;
    qx *= scale;
    qy *= scale;
  }
  state.fluxX[i] = qx;
  state.fluxY[i] = qy;
}

function transportRbf(model, field, diffusionM2Day, output) {
  const { state, size } = model;
  const { m, stencil, lapW, gxW, gyW } = model.operators;
  const elevation = state.elevation;
  const activeCellIds = model.activeCellIds;
  if (activeCellIds) {
    output.fill(0);
  }
  const cellCount = activeCellIds ? activeCellIds.length : size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const offset = i * m;
    let lapField = 0;
    let fluxDivergenceX = 0;
    let fluxDivergenceY = 0;
    for (let k = 0; k < m; k += 1) {
      const weightIndex = offset + k;
      const stencilIndex = stencil[weightIndex];
      lapField += lapW[weightIndex] * field[stencilIndex];
      fluxDivergenceX += gxW[weightIndex] * state.fluxX[stencilIndex];
      fluxDivergenceY += gyW[weightIndex] * state.fluxY[stencilIndex];
    }
    output[i] = diffusionM2Day * lapField - fluxDivergenceX - fluxDivergenceY;
  }
}

function surfaceTransportSubstepCount(model, dtDays = MODEL_DT_DAYS) {
  const cellSizeM = model.cellSizeM ?? CELL_SIZE_M;
  const diffusionDt =
    SURFACE_WATER_DIFF_M2_DAY > 0
      ? (SURFACE_TRANSPORT_DIFFUSION_CFL * cellSizeM * cellSizeM) / SURFACE_WATER_DIFF_M2_DAY
      : dtDays;
  const advectionDt =
    SURFACE_SLOPE_MAX_VELOCITY_M_DAY > 0
      ? (SURFACE_TRANSPORT_ADVECTION_CFL * cellSizeM) / SURFACE_SLOPE_MAX_VELOCITY_M_DAY
      : dtDays;
  const stableDt = Math.max(1e-6, Math.min(dtDays, diffusionDt, advectionDt));
  return Math.max(1, Math.ceil(dtDays / stableDt));
}

export function ecosystemSubstepsForDuration(model, dtDays = MODEL_DT_DAYS) {
  const durationDays = Number.isFinite(dtDays) && dtDays > 0 ? dtDays : MODEL_DT_DAYS;
  const cellSizeM = model?.cellSizeM ?? CELL_SIZE_M;
  const diffusionDt =
    SURFACE_WATER_DIFF_M2_DAY > 0
      ? (SURFACE_TRANSPORT_DIFFUSION_CFL * cellSizeM * cellSizeM) / SURFACE_WATER_DIFF_M2_DAY
      : durationDays;
  const advectionDt =
    SURFACE_SLOPE_MAX_VELOCITY_M_DAY > 0
      ? (SURFACE_TRANSPORT_ADVECTION_CFL * cellSizeM) / SURFACE_SLOPE_MAX_VELOCITY_M_DAY
      : durationDays;
  const transportDt = Math.max(1e-6, Math.min(1, diffusionDt, advectionDt));
  return Math.max(1, Math.ceil(durationDays / transportDt));
}

function computeSurfaceWaterTransportRbf(model, field, output) {
  const { state, size } = model;
  const { m, stencil, lapW, gxW, gyW } = model.operators;
  const activeCellIds = model.activeCellIds;
  const cellCount = activeCellIds ? activeCellIds.length : size;
  if (activeCellIds) {
    output.fill(0);
    state.surfaceUx.fill(0);
    state.surfaceUy.fill(0);
  }

  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const offset = i * m;
    let filmGx = 0;
    let filmGy = 0;
    let surfaceMfdX = 0;
    let surfaceMfdY = 0;
    let lapSurfaceWater = 0;
    const centerSurfaceHead = elevation ? elevation[i] + field[i] : 0;
    for (let k = 0; k < m; k += 1) {
      const weightIndex = offset + k;
      const cellId = stencil[weightIndex];
      const value = field[cellId];
      filmGx += gxW[weightIndex] * value;
      filmGy += gyW[weightIndex] * value;
      if (elevation) {
        const surfaceDrop = centerSurfaceHead - (elevation[cellId] + value);
        if (surfaceDrop > 0) {
          surfaceMfdX += gxW[weightIndex] * surfaceDrop;
          surfaceMfdY += gyW[weightIndex] * surfaceDrop;
        }
      }
      lapSurfaceWater += lapW[weightIndex] * value;
    }

    const downhillX = elevation ? surfaceMfdX : -(state.slopeX[i] + filmGx);
    const downhillY = elevation ? surfaceMfdY : -(state.slopeY[i] + filmGy);
    const surfaceScale = surfaceWaterVelocityScale(field[i], downhillX, downhillY);
    const surfaceVx = downhillX * surfaceScale;
    const surfaceVy = downhillY * surfaceScale;
    state.surfaceUx[i] = surfaceVx;
    state.surfaceUy[i] = surfaceVy;
    output[i] = SURFACE_WATER_DIFF_M2_DAY * lapSurfaceWater;
  }

  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const offset = i * m;
    let surfaceFluxDivergenceX = 0;
    let surfaceFluxDivergenceY = 0;
    for (let k = 0; k < m; k += 1) {
      const weightIndex = offset + k;
      const cellId = stencil[weightIndex];
      const mobileSurfaceWater = Math.max(0, field[cellId] - SURFACE_FILM_THRESHOLD_M);
      surfaceFluxDivergenceX += gxW[weightIndex] * state.surfaceUx[cellId] * mobileSurfaceWater;
      surfaceFluxDivergenceY += gyW[weightIndex] * state.surfaceUy[cellId] * mobileSurfaceWater;
    }
    output[i] -= surfaceFluxDivergenceX + surfaceFluxDivergenceY;
  }
}

function computeStableSurfaceWaterTransport(model, dtDays = MODEL_DT_DAYS) {
  const { state, size } = model;
  const activeCellIds = model.activeCellIds;
  const cellCount = activeCellIds ? activeCellIds.length : size;
  const substeps = surfaceTransportSubstepCount(model, dtDays);
  model.lastSurfaceTransportSubsteps = substeps;
  if (
    runWasmStableSurfaceWaterTransport(model, {
      substeps,
      dtDays,
      surfaceWaterDiffM2Day: SURFACE_WATER_DIFF_M2_DAY,
      surfaceSlopeVelocityMDay: SURFACE_SLOPE_VELOCITY_M_DAY,
      surfaceSlopeMaxVelocityMDay: SURFACE_SLOPE_MAX_VELOCITY_M_DAY,
      surfaceFilmThresholdM: SURFACE_FILM_THRESHOLD_M,
      surfaceWaterNumericFloorM: SURFACE_WATER_NUMERIC_FLOOR_M
    })
  ) {
    return;
  }

  const subDt = dtDays / substeps;

  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    state.Hn[i] = state.H[i];
  }

  for (let substep = 0; substep < substeps; substep += 1) {
    computeSurfaceWaterTransportRbf(model, state.Hn, state.Htransport);
    for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
      const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
      const next = state.Hn[i] + subDt * state.Htransport[i];
      if (!Number.isFinite(next)) {
        throw new Error(`Surface water transport diverged at cell ${i}.`);
      }
      state.Hn[i] = next < 0 && next > -SURFACE_WATER_NUMERIC_FLOOR_M ? 0 : next;
    }
  }

  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    state.Htransport[i] = (state.Hn[i] - state.H[i]) / dtDays;
  }
}

function transportDarcyRbf(model, head, transmissivity, output, dtDays = MODEL_DT_DAYS, updateGroundwaterVelocity = false) {
  const { state, size } = model;
  const { m, stencil, lapW, gxW, gyW } = model.operators;
  const cellSizeM = model.cellSizeM ?? CELL_SIZE_M;
  const activeCellIds = model.activeCellIds;
  if (activeCellIds) {
    output.fill(0);
    if (updateGroundwaterVelocity) {
      state.groundwaterUx.fill(0);
      state.groundwaterUy.fill(0);
    }
  }
  const cellCount = activeCellIds ? activeCellIds.length : size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const offset = i * m;
    let lapHead = 0;
    let gxHead = 0;
    let gyHead = 0;
    let gxTransmissivity = 0;
    let gyTransmissivity = 0;
    for (let k = 0; k < m; k += 1) {
      const weightIndex = offset + k;
      const stencilIndex = stencil[weightIndex];
      const headValue = head[stencilIndex];
      const transmissivityValue = transmissivity[stencilIndex];
      lapHead += lapW[weightIndex] * headValue;
      gxHead += gxW[weightIndex] * headValue;
      gyHead += gyW[weightIndex] * headValue;
      gxTransmissivity += gxW[weightIndex] * transmissivityValue;
      gyTransmissivity += gyW[weightIndex] * transmissivityValue;
    }
    const localTransmissivity = transmissivity[i];
    output[i] = localTransmissivity * lapHead + gxTransmissivity * gxHead + gyTransmissivity * gyHead;
    if (updateGroundwaterVelocity) {
      let qx = -localTransmissivity * gxHead;
      let qy = -localTransmissivity * gyHead;
      const maxFlux = Math.max(1e-7, state.groundwaterStorage[i] * cellSizeM * 0.12 / dtDays);
      const magnitude = Math.hypot(qx, qy);
      if (magnitude > maxFlux && magnitude > 0) {
        const scale = maxFlux / magnitude;
        qx *= scale;
        qy *= scale;
      }
      const speedScale = state.groundwaterStorage[i] > 1e-9 ? 1 / state.groundwaterStorage[i] : 0;
      state.groundwaterUx[i] = qx * speedScale;
      state.groundwaterUy[i] = qy * speedScale;
    }
  }
}

function transportSoilDarcyLayerRbf(model, layer, dtDays = MODEL_DT_DAYS, updateTopVelocity = false) {
  const { state, size } = model;
  const { m, stencil, lapW, gxW, gyW } = model.operators;
  const cellSizeM = model.cellSizeM ?? CELL_SIZE_M;
  const layerOffset = layer * size;
  const activeCellIds = model.activeCellIds;
  if (activeCellIds) {
    state.soilTransport.subarray(layerOffset, layerOffset + size).fill(0);
    if (updateTopVelocity) {
      state.topSoilUx.fill(0);
      state.topSoilUy.fill(0);
    }
  }
  const cellCount = activeCellIds ? activeCellIds.length : size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const stencilOffset = i * m;
    let lapHead = 0;
    let gxHead = 0;
    let gyHead = 0;
    let gxTransmissivity = 0;
    let gyTransmissivity = 0;
    for (let k = 0; k < m; k += 1) {
      const weightIndex = stencilOffset + k;
      const stencilIndex = layerOffset + stencil[weightIndex];
      const headValue = state.soilHead[stencilIndex];
      const transmissivityValue = state.soilTransmissivity[stencilIndex];
      lapHead += lapW[weightIndex] * headValue;
      gxHead += gxW[weightIndex] * headValue;
      gyHead += gyW[weightIndex] * headValue;
      gxTransmissivity += gxW[weightIndex] * transmissivityValue;
      gyTransmissivity += gyW[weightIndex] * transmissivityValue;
    }
    const outputIndex = layerOffset + i;
    const localTransmissivity = state.soilTransmissivity[outputIndex];
    state.soilTransport[outputIndex] =
      localTransmissivity * lapHead + gxTransmissivity * gxHead + gyTransmissivity * gyHead;
    if (updateTopVelocity) {
      const storage = state.soilWater[outputIndex];
      let qx = -localTransmissivity * gxHead;
      let qy = -localTransmissivity * gyHead;
      const maxFlux = Math.max(1e-7, storage * cellSizeM * 0.16 / dtDays);
      const magnitude = Math.hypot(qx, qy);
      if (magnitude > maxFlux && magnitude > 0) {
        const scale = maxFlux / magnitude;
        qx *= scale;
        qy *= scale;
      }
      const speedScale = storage > 1e-9 ? 1 / storage : 0;
      state.topSoilUx[i] = qx * speedScale;
      state.topSoilUy[i] = qy * speedScale;
    }
  }
}

function transportDarcyWaterColumnsRbf(
  model,
  dtDays = MODEL_DT_DAYS,
  baobabSeedDiffusionM2Day = 0,
  roseSeedDiffusionM2Day = 0,
  combineSurfaceNutrient = false
) {
  if (
    runWasmDarcyWaterColumns(model, {
      dtDays,
      cellSizeM: model.cellSizeM ?? CELL_SIZE_M,
      surfaceWaterDiffM2Day: SURFACE_WATER_DIFF_M2_DAY,
      surfaceSlopeVelocityMDay: SURFACE_SLOPE_VELOCITY_M_DAY,
      surfaceSlopeMaxVelocityMDay: SURFACE_SLOPE_MAX_VELOCITY_M_DAY,
      nutrientDiffM2Day: NUTRIENT_DIFF_M2_DAY,
      baobabSeedDiffusionM2Day,
      roseSeedDiffusionM2Day,
      combineSurfaceNutrient,
      surfaceFilmThresholdM: SURFACE_FILM_THRESHOLD_M
    })
  ) {
    return true;
  }

  const { state, size } = model;
  const { m, stencil, lapW, gxW, gyW } = model.operators;
  const cellSizeM = model.cellSizeM ?? CELL_SIZE_M;
  const activeCellIds = model.activeCellIds;
  if (activeCellIds) {
    state.soilTransport.fill(0);
    state.groundwaterTransport.fill(0);
    state.Htransport.fill(0);
    state.soilMineralTransport.fill(0);
    state.baobabSeedTransport.fill(0);
    state.roseSeedTransport.fill(0);
    state.surfaceUx.fill(0);
    state.surfaceUy.fill(0);
    state.topSoilUx.fill(0);
    state.topSoilUy.fill(0);
    state.groundwaterUx.fill(0);
    state.groundwaterUy.fill(0);
  }

  const {
    H,
    soilWater,
    soilHead,
    soilTransmissivity,
    soilResidual,
    soilCap,
    groundwaterStorage,
    groundwaterCap,
    groundwaterHead,
    groundwaterT,
    soilMineralN,
    soilCarbonActive,
    soilCarbonStable,
    baobabSeed,
    roseSeed,
    soilTransport,
    groundwaterTransport,
    Htransport,
    soilMineralTransport,
    baobabSeedTransport,
    roseSeedTransport,
    slopeX,
    slopeY,
    surfaceUx,
    surfaceUy,
    topSoilUx,
    topSoilUy,
    groundwaterUx,
	    groundwaterUy
	  } = state;
  const elevation = state.elevation;

  const size2 = size * 2;
  const cellCount = activeCellIds ? activeCellIds.length : size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const stencilOffset = i * m;

    let lapHead0 = 0;
    let gxHead0 = 0;
    let gyHead0 = 0;
    let gxTransmissivity0 = 0;
    let gyTransmissivity0 = 0;
    let lapHead1 = 0;
    let gxHead1 = 0;
    let gyHead1 = 0;
    let gxTransmissivity1 = 0;
    let gyTransmissivity1 = 0;
    let lapHead2 = 0;
    let gxHead2 = 0;
    let gyHead2 = 0;
    let gxTransmissivity2 = 0;
    let gyTransmissivity2 = 0;
    let lapGroundwaterHead = 0;
    let gxGroundwaterHead = 0;
    let gyGroundwaterHead = 0;
    let gxGroundwaterT = 0;
    let gyGroundwaterT = 0;
    let filmGx = 0;
    let filmGy = 0;
    let lapSurfaceWater = 0;
    let lapNutrient = 0;
    let lapBaobabSeed = 0;
    let lapRoseSeed = 0;
    let mobileNutrient = 0;

    let weightIndex = stencilOffset;
    let cellId = stencil[weightIndex];
    let lapWeight = lapW[weightIndex];
    let gxWeight = gxW[weightIndex];
    let gyWeight = gyW[weightIndex];
    let layer1StencilIndex = size + cellId;
    let layer2StencilIndex = size2 + cellId;
    let head0 = soilHead[cellId];
    let transmissivity0 = soilTransmissivity[cellId];
    lapHead0 += lapWeight * head0;
    gxHead0 += gxWeight * head0;
    gyHead0 += gyWeight * head0;
    gxTransmissivity0 += gxWeight * transmissivity0;
    gyTransmissivity0 += gyWeight * transmissivity0;
    let head1 = soilHead[layer1StencilIndex];
    let transmissivity1 = soilTransmissivity[layer1StencilIndex];
    lapHead1 += lapWeight * head1;
    gxHead1 += gxWeight * head1;
    gyHead1 += gyWeight * head1;
    gxTransmissivity1 += gxWeight * transmissivity1;
    gyTransmissivity1 += gyWeight * transmissivity1;
    let head2 = soilHead[layer2StencilIndex];
    let transmissivity2 = soilTransmissivity[layer2StencilIndex];
    lapHead2 += lapWeight * head2;
    gxHead2 += gxWeight * head2;
    gyHead2 += gyWeight * head2;
    gxTransmissivity2 += gxWeight * transmissivity2;
    gyTransmissivity2 += gyWeight * transmissivity2;
    let groundwaterHeadValue = groundwaterHead[cellId];
    let groundwaterTValue = groundwaterT[cellId];
    lapGroundwaterHead += lapWeight * groundwaterHeadValue;
    gxGroundwaterHead += gxWeight * groundwaterHeadValue;
    gyGroundwaterHead += gyWeight * groundwaterHeadValue;
    gxGroundwaterT += gxWeight * groundwaterTValue;
    gyGroundwaterT += gyWeight * groundwaterTValue;
    let surfaceWater = H[cellId];
    filmGx += gxWeight * surfaceWater;
    filmGy += gyWeight * surfaceWater;
    lapSurfaceWater += lapWeight * surfaceWater;
    mobileNutrient =
      soilMineralN[cellId] *
      nutrientMobileFraction(
        soilWater[cellId] / soilCap[cellId],
        groundwaterStorage[cellId] / groundwaterCap[cellId],
        soilCarbonActive[cellId],
        soilCarbonStable[cellId]
      );
    lapNutrient += lapWeight * mobileNutrient;
    lapBaobabSeed += lapWeight * baobabSeed[cellId];
    lapRoseSeed += lapWeight * roseSeed[cellId];

    weightIndex = stencilOffset + 1;
    cellId = stencil[weightIndex];
    lapWeight = lapW[weightIndex];
    gxWeight = gxW[weightIndex];
    gyWeight = gyW[weightIndex];
    layer1StencilIndex = size + cellId;
    layer2StencilIndex = size2 + cellId;
    head0 = soilHead[cellId];
    transmissivity0 = soilTransmissivity[cellId];
    lapHead0 += lapWeight * head0;
    gxHead0 += gxWeight * head0;
    gyHead0 += gyWeight * head0;
    gxTransmissivity0 += gxWeight * transmissivity0;
    gyTransmissivity0 += gyWeight * transmissivity0;
    head1 = soilHead[layer1StencilIndex];
    transmissivity1 = soilTransmissivity[layer1StencilIndex];
    lapHead1 += lapWeight * head1;
    gxHead1 += gxWeight * head1;
    gyHead1 += gyWeight * head1;
    gxTransmissivity1 += gxWeight * transmissivity1;
    gyTransmissivity1 += gyWeight * transmissivity1;
    head2 = soilHead[layer2StencilIndex];
    transmissivity2 = soilTransmissivity[layer2StencilIndex];
    lapHead2 += lapWeight * head2;
    gxHead2 += gxWeight * head2;
    gyHead2 += gyWeight * head2;
    gxTransmissivity2 += gxWeight * transmissivity2;
    gyTransmissivity2 += gyWeight * transmissivity2;
    groundwaterHeadValue = groundwaterHead[cellId];
    groundwaterTValue = groundwaterT[cellId];
    lapGroundwaterHead += lapWeight * groundwaterHeadValue;
    gxGroundwaterHead += gxWeight * groundwaterHeadValue;
    gyGroundwaterHead += gyWeight * groundwaterHeadValue;
    gxGroundwaterT += gxWeight * groundwaterTValue;
    gyGroundwaterT += gyWeight * groundwaterTValue;
    surfaceWater = H[cellId];
    filmGx += gxWeight * surfaceWater;
    filmGy += gyWeight * surfaceWater;
    lapSurfaceWater += lapWeight * surfaceWater;
    mobileNutrient =
      soilMineralN[cellId] *
      nutrientMobileFraction(
        soilWater[cellId] / soilCap[cellId],
        groundwaterStorage[cellId] / groundwaterCap[cellId],
        soilCarbonActive[cellId],
        soilCarbonStable[cellId]
      );
    lapNutrient += lapWeight * mobileNutrient;
    lapBaobabSeed += lapWeight * baobabSeed[cellId];
    lapRoseSeed += lapWeight * roseSeed[cellId];

    weightIndex = stencilOffset + 2;
    cellId = stencil[weightIndex];
    lapWeight = lapW[weightIndex];
    gxWeight = gxW[weightIndex];
    gyWeight = gyW[weightIndex];
    layer1StencilIndex = size + cellId;
    layer2StencilIndex = size2 + cellId;
    head0 = soilHead[cellId];
    transmissivity0 = soilTransmissivity[cellId];
    lapHead0 += lapWeight * head0;
    gxHead0 += gxWeight * head0;
    gyHead0 += gyWeight * head0;
    gxTransmissivity0 += gxWeight * transmissivity0;
    gyTransmissivity0 += gyWeight * transmissivity0;
    head1 = soilHead[layer1StencilIndex];
    transmissivity1 = soilTransmissivity[layer1StencilIndex];
    lapHead1 += lapWeight * head1;
    gxHead1 += gxWeight * head1;
    gyHead1 += gyWeight * head1;
    gxTransmissivity1 += gxWeight * transmissivity1;
    gyTransmissivity1 += gyWeight * transmissivity1;
    head2 = soilHead[layer2StencilIndex];
    transmissivity2 = soilTransmissivity[layer2StencilIndex];
    lapHead2 += lapWeight * head2;
    gxHead2 += gxWeight * head2;
    gyHead2 += gyWeight * head2;
    gxTransmissivity2 += gxWeight * transmissivity2;
    gyTransmissivity2 += gyWeight * transmissivity2;
    groundwaterHeadValue = groundwaterHead[cellId];
    groundwaterTValue = groundwaterT[cellId];
    lapGroundwaterHead += lapWeight * groundwaterHeadValue;
    gxGroundwaterHead += gxWeight * groundwaterHeadValue;
    gyGroundwaterHead += gyWeight * groundwaterHeadValue;
    gxGroundwaterT += gxWeight * groundwaterTValue;
    gyGroundwaterT += gyWeight * groundwaterTValue;
    surfaceWater = H[cellId];
    filmGx += gxWeight * surfaceWater;
    filmGy += gyWeight * surfaceWater;
    lapSurfaceWater += lapWeight * surfaceWater;
    mobileNutrient =
      soilMineralN[cellId] *
      nutrientMobileFraction(
        soilWater[cellId] / soilCap[cellId],
        groundwaterStorage[cellId] / groundwaterCap[cellId],
        soilCarbonActive[cellId],
        soilCarbonStable[cellId]
      );
    lapNutrient += lapWeight * mobileNutrient;
    lapBaobabSeed += lapWeight * baobabSeed[cellId];
    lapRoseSeed += lapWeight * roseSeed[cellId];

    weightIndex = stencilOffset + 3;
    cellId = stencil[weightIndex];
    lapWeight = lapW[weightIndex];
    gxWeight = gxW[weightIndex];
    gyWeight = gyW[weightIndex];
    layer1StencilIndex = size + cellId;
    layer2StencilIndex = size2 + cellId;
    head0 = soilHead[cellId];
    transmissivity0 = soilTransmissivity[cellId];
    lapHead0 += lapWeight * head0;
    gxHead0 += gxWeight * head0;
    gyHead0 += gyWeight * head0;
    gxTransmissivity0 += gxWeight * transmissivity0;
    gyTransmissivity0 += gyWeight * transmissivity0;
    head1 = soilHead[layer1StencilIndex];
    transmissivity1 = soilTransmissivity[layer1StencilIndex];
    lapHead1 += lapWeight * head1;
    gxHead1 += gxWeight * head1;
    gyHead1 += gyWeight * head1;
    gxTransmissivity1 += gxWeight * transmissivity1;
    gyTransmissivity1 += gyWeight * transmissivity1;
    head2 = soilHead[layer2StencilIndex];
    transmissivity2 = soilTransmissivity[layer2StencilIndex];
    lapHead2 += lapWeight * head2;
    gxHead2 += gxWeight * head2;
    gyHead2 += gyWeight * head2;
    gxTransmissivity2 += gxWeight * transmissivity2;
    gyTransmissivity2 += gyWeight * transmissivity2;
    groundwaterHeadValue = groundwaterHead[cellId];
    groundwaterTValue = groundwaterT[cellId];
    lapGroundwaterHead += lapWeight * groundwaterHeadValue;
    gxGroundwaterHead += gxWeight * groundwaterHeadValue;
    gyGroundwaterHead += gyWeight * groundwaterHeadValue;
    gxGroundwaterT += gxWeight * groundwaterTValue;
    gyGroundwaterT += gyWeight * groundwaterTValue;
    surfaceWater = H[cellId];
    filmGx += gxWeight * surfaceWater;
    filmGy += gyWeight * surfaceWater;
    lapSurfaceWater += lapWeight * surfaceWater;
    mobileNutrient =
      soilMineralN[cellId] *
      nutrientMobileFraction(
        soilWater[cellId] / soilCap[cellId],
        groundwaterStorage[cellId] / groundwaterCap[cellId],
        soilCarbonActive[cellId],
        soilCarbonStable[cellId]
      );
    lapNutrient += lapWeight * mobileNutrient;
    lapBaobabSeed += lapWeight * baobabSeed[cellId];
    lapRoseSeed += lapWeight * roseSeed[cellId];

    weightIndex = stencilOffset + 4;
    cellId = stencil[weightIndex];
    lapWeight = lapW[weightIndex];
    gxWeight = gxW[weightIndex];
    gyWeight = gyW[weightIndex];
    layer1StencilIndex = size + cellId;
    layer2StencilIndex = size2 + cellId;
    head0 = soilHead[cellId];
    transmissivity0 = soilTransmissivity[cellId];
    lapHead0 += lapWeight * head0;
    gxHead0 += gxWeight * head0;
    gyHead0 += gyWeight * head0;
    gxTransmissivity0 += gxWeight * transmissivity0;
    gyTransmissivity0 += gyWeight * transmissivity0;
    head1 = soilHead[layer1StencilIndex];
    transmissivity1 = soilTransmissivity[layer1StencilIndex];
    lapHead1 += lapWeight * head1;
    gxHead1 += gxWeight * head1;
    gyHead1 += gyWeight * head1;
    gxTransmissivity1 += gxWeight * transmissivity1;
    gyTransmissivity1 += gyWeight * transmissivity1;
    head2 = soilHead[layer2StencilIndex];
    transmissivity2 = soilTransmissivity[layer2StencilIndex];
    lapHead2 += lapWeight * head2;
    gxHead2 += gxWeight * head2;
    gyHead2 += gyWeight * head2;
    gxTransmissivity2 += gxWeight * transmissivity2;
    gyTransmissivity2 += gyWeight * transmissivity2;
    groundwaterHeadValue = groundwaterHead[cellId];
    groundwaterTValue = groundwaterT[cellId];
    lapGroundwaterHead += lapWeight * groundwaterHeadValue;
    gxGroundwaterHead += gxWeight * groundwaterHeadValue;
    gyGroundwaterHead += gyWeight * groundwaterHeadValue;
    gxGroundwaterT += gxWeight * groundwaterTValue;
    gyGroundwaterT += gyWeight * groundwaterTValue;
    surfaceWater = H[cellId];
    filmGx += gxWeight * surfaceWater;
    filmGy += gyWeight * surfaceWater;
    lapSurfaceWater += lapWeight * surfaceWater;
    mobileNutrient =
      soilMineralN[cellId] *
      nutrientMobileFraction(
        soilWater[cellId] / soilCap[cellId],
        groundwaterStorage[cellId] / groundwaterCap[cellId],
        soilCarbonActive[cellId],
        soilCarbonStable[cellId]
      );
    lapNutrient += lapWeight * mobileNutrient;
    lapBaobabSeed += lapWeight * baobabSeed[cellId];
    lapRoseSeed += lapWeight * roseSeed[cellId];

    weightIndex = stencilOffset + 5;
    cellId = stencil[weightIndex];
    lapWeight = lapW[weightIndex];
    gxWeight = gxW[weightIndex];
    gyWeight = gyW[weightIndex];
    layer1StencilIndex = size + cellId;
    layer2StencilIndex = size2 + cellId;
    head0 = soilHead[cellId];
    transmissivity0 = soilTransmissivity[cellId];
    lapHead0 += lapWeight * head0;
    gxHead0 += gxWeight * head0;
    gyHead0 += gyWeight * head0;
    gxTransmissivity0 += gxWeight * transmissivity0;
    gyTransmissivity0 += gyWeight * transmissivity0;
    head1 = soilHead[layer1StencilIndex];
    transmissivity1 = soilTransmissivity[layer1StencilIndex];
    lapHead1 += lapWeight * head1;
    gxHead1 += gxWeight * head1;
    gyHead1 += gyWeight * head1;
    gxTransmissivity1 += gxWeight * transmissivity1;
    gyTransmissivity1 += gyWeight * transmissivity1;
    head2 = soilHead[layer2StencilIndex];
    transmissivity2 = soilTransmissivity[layer2StencilIndex];
    lapHead2 += lapWeight * head2;
    gxHead2 += gxWeight * head2;
    gyHead2 += gyWeight * head2;
    gxTransmissivity2 += gxWeight * transmissivity2;
    gyTransmissivity2 += gyWeight * transmissivity2;
    groundwaterHeadValue = groundwaterHead[cellId];
    groundwaterTValue = groundwaterT[cellId];
    lapGroundwaterHead += lapWeight * groundwaterHeadValue;
    gxGroundwaterHead += gxWeight * groundwaterHeadValue;
    gyGroundwaterHead += gyWeight * groundwaterHeadValue;
    gxGroundwaterT += gxWeight * groundwaterTValue;
    gyGroundwaterT += gyWeight * groundwaterTValue;
    surfaceWater = H[cellId];
    filmGx += gxWeight * surfaceWater;
    filmGy += gyWeight * surfaceWater;
    lapSurfaceWater += lapWeight * surfaceWater;
    mobileNutrient =
      soilMineralN[cellId] *
      nutrientMobileFraction(
        soilWater[cellId] / soilCap[cellId],
        groundwaterStorage[cellId] / groundwaterCap[cellId],
        soilCarbonActive[cellId],
        soilCarbonStable[cellId]
      );
    lapNutrient += lapWeight * mobileNutrient;
    lapBaobabSeed += lapWeight * baobabSeed[cellId];
    lapRoseSeed += lapWeight * roseSeed[cellId];

    weightIndex = stencilOffset + 6;
    cellId = stencil[weightIndex];
    lapWeight = lapW[weightIndex];
    gxWeight = gxW[weightIndex];
    gyWeight = gyW[weightIndex];
    layer1StencilIndex = size + cellId;
    layer2StencilIndex = size2 + cellId;
    head0 = soilHead[cellId];
    transmissivity0 = soilTransmissivity[cellId];
    lapHead0 += lapWeight * head0;
    gxHead0 += gxWeight * head0;
    gyHead0 += gyWeight * head0;
    gxTransmissivity0 += gxWeight * transmissivity0;
    gyTransmissivity0 += gyWeight * transmissivity0;
    head1 = soilHead[layer1StencilIndex];
    transmissivity1 = soilTransmissivity[layer1StencilIndex];
    lapHead1 += lapWeight * head1;
    gxHead1 += gxWeight * head1;
    gyHead1 += gyWeight * head1;
    gxTransmissivity1 += gxWeight * transmissivity1;
    gyTransmissivity1 += gyWeight * transmissivity1;
    head2 = soilHead[layer2StencilIndex];
    transmissivity2 = soilTransmissivity[layer2StencilIndex];
    lapHead2 += lapWeight * head2;
    gxHead2 += gxWeight * head2;
    gyHead2 += gyWeight * head2;
    gxTransmissivity2 += gxWeight * transmissivity2;
    gyTransmissivity2 += gyWeight * transmissivity2;
    groundwaterHeadValue = groundwaterHead[cellId];
    groundwaterTValue = groundwaterT[cellId];
    lapGroundwaterHead += lapWeight * groundwaterHeadValue;
    gxGroundwaterHead += gxWeight * groundwaterHeadValue;
    gyGroundwaterHead += gyWeight * groundwaterHeadValue;
    gxGroundwaterT += gxWeight * groundwaterTValue;
    gyGroundwaterT += gyWeight * groundwaterTValue;
    surfaceWater = H[cellId];
    filmGx += gxWeight * surfaceWater;
    filmGy += gyWeight * surfaceWater;
    lapSurfaceWater += lapWeight * surfaceWater;
    mobileNutrient =
      soilMineralN[cellId] *
      nutrientMobileFraction(
        soilWater[cellId] / soilCap[cellId],
        groundwaterStorage[cellId] / groundwaterCap[cellId],
        soilCarbonActive[cellId],
        soilCarbonStable[cellId]
      );
    lapNutrient += lapWeight * mobileNutrient;
    lapBaobabSeed += lapWeight * baobabSeed[cellId];
    lapRoseSeed += lapWeight * roseSeed[cellId];

    weightIndex = stencilOffset + 7;
    cellId = stencil[weightIndex];
    lapWeight = lapW[weightIndex];
    gxWeight = gxW[weightIndex];
    gyWeight = gyW[weightIndex];
    layer1StencilIndex = size + cellId;
    layer2StencilIndex = size2 + cellId;
    head0 = soilHead[cellId];
    transmissivity0 = soilTransmissivity[cellId];
    lapHead0 += lapWeight * head0;
    gxHead0 += gxWeight * head0;
    gyHead0 += gyWeight * head0;
    gxTransmissivity0 += gxWeight * transmissivity0;
    gyTransmissivity0 += gyWeight * transmissivity0;
    head1 = soilHead[layer1StencilIndex];
    transmissivity1 = soilTransmissivity[layer1StencilIndex];
    lapHead1 += lapWeight * head1;
    gxHead1 += gxWeight * head1;
    gyHead1 += gyWeight * head1;
    gxTransmissivity1 += gxWeight * transmissivity1;
    gyTransmissivity1 += gyWeight * transmissivity1;
    head2 = soilHead[layer2StencilIndex];
    transmissivity2 = soilTransmissivity[layer2StencilIndex];
    lapHead2 += lapWeight * head2;
    gxHead2 += gxWeight * head2;
    gyHead2 += gyWeight * head2;
    gxTransmissivity2 += gxWeight * transmissivity2;
    gyTransmissivity2 += gyWeight * transmissivity2;
    groundwaterHeadValue = groundwaterHead[cellId];
    groundwaterTValue = groundwaterT[cellId];
    lapGroundwaterHead += lapWeight * groundwaterHeadValue;
    gxGroundwaterHead += gxWeight * groundwaterHeadValue;
    gyGroundwaterHead += gyWeight * groundwaterHeadValue;
    gxGroundwaterT += gxWeight * groundwaterTValue;
    gyGroundwaterT += gyWeight * groundwaterTValue;
    surfaceWater = H[cellId];
    filmGx += gxWeight * surfaceWater;
    filmGy += gyWeight * surfaceWater;
    lapSurfaceWater += lapWeight * surfaceWater;
    mobileNutrient =
      soilMineralN[cellId] *
      nutrientMobileFraction(
        soilWater[cellId] / soilCap[cellId],
        groundwaterStorage[cellId] / groundwaterCap[cellId],
        soilCarbonActive[cellId],
        soilCarbonStable[cellId]
      );
    lapNutrient += lapWeight * mobileNutrient;
    lapBaobabSeed += lapWeight * baobabSeed[cellId];
    lapRoseSeed += lapWeight * roseSeed[cellId];

    weightIndex = stencilOffset + 8;
    cellId = stencil[weightIndex];
    lapWeight = lapW[weightIndex];
    gxWeight = gxW[weightIndex];
    gyWeight = gyW[weightIndex];
    layer1StencilIndex = size + cellId;
    layer2StencilIndex = size2 + cellId;
    head0 = soilHead[cellId];
    transmissivity0 = soilTransmissivity[cellId];
    lapHead0 += lapWeight * head0;
    gxHead0 += gxWeight * head0;
    gyHead0 += gyWeight * head0;
    gxTransmissivity0 += gxWeight * transmissivity0;
    gyTransmissivity0 += gyWeight * transmissivity0;
    head1 = soilHead[layer1StencilIndex];
    transmissivity1 = soilTransmissivity[layer1StencilIndex];
    lapHead1 += lapWeight * head1;
    gxHead1 += gxWeight * head1;
    gyHead1 += gyWeight * head1;
    gxTransmissivity1 += gxWeight * transmissivity1;
    gyTransmissivity1 += gyWeight * transmissivity1;
    head2 = soilHead[layer2StencilIndex];
    transmissivity2 = soilTransmissivity[layer2StencilIndex];
    lapHead2 += lapWeight * head2;
    gxHead2 += gxWeight * head2;
    gyHead2 += gyWeight * head2;
    gxTransmissivity2 += gxWeight * transmissivity2;
    gyTransmissivity2 += gyWeight * transmissivity2;
    groundwaterHeadValue = groundwaterHead[cellId];
    groundwaterTValue = groundwaterT[cellId];
    lapGroundwaterHead += lapWeight * groundwaterHeadValue;
    gxGroundwaterHead += gxWeight * groundwaterHeadValue;
    gyGroundwaterHead += gyWeight * groundwaterHeadValue;
    gxGroundwaterT += gxWeight * groundwaterTValue;
    gyGroundwaterT += gyWeight * groundwaterTValue;
    surfaceWater = H[cellId];
    filmGx += gxWeight * surfaceWater;
    filmGy += gyWeight * surfaceWater;
    lapSurfaceWater += lapWeight * surfaceWater;
    mobileNutrient =
      soilMineralN[cellId] *
      nutrientMobileFraction(
        soilWater[cellId] / soilCap[cellId],
        groundwaterStorage[cellId] / groundwaterCap[cellId],
        soilCarbonActive[cellId],
        soilCarbonStable[cellId]
      );
    lapNutrient += lapWeight * mobileNutrient;
    lapBaobabSeed += lapWeight * baobabSeed[cellId];
    lapRoseSeed += lapWeight * roseSeed[cellId];

    const layer0Index = i;
    const layer1Index = size + i;
    const layer2Index = size2 + i;
    const localT0 = soilTransmissivity[layer0Index];
    const localT1 = soilTransmissivity[layer1Index];
    const localT2 = soilTransmissivity[layer2Index];
    const localGroundwaterT = groundwaterT[i];
    const storage0 = soilWater[layer0Index];
    const storage1 = soilWater[layer1Index];
    const storage2 = soilWater[layer2Index];
    const groundwaterStorageValue = groundwaterStorage[i];

    const rawTransport0 = localT0 * lapHead0 + gxTransmissivity0 * gxHead0 + gyTransmissivity0 * gyHead0;
    const rawTransport1 = localT1 * lapHead1 + gxTransmissivity1 * gxHead1 + gyTransmissivity1 * gyHead1;
    const rawTransport2 = localT2 * lapHead2 + gxTransmissivity2 * gxHead2 + gyTransmissivity2 * gyHead2;
    const maxLoss0 = Math.max(0, storage0 - soilResidual[layer0Index]) * 0.42 / dtDays;
    const maxGain0 = Math.max(0, soilCap[layer0Index] - storage0) * 0.42 / dtDays;
    const maxLoss1 = Math.max(0, storage1 - soilResidual[layer1Index]) * 0.42 / dtDays;
    const maxGain1 = Math.max(0, soilCap[layer1Index] - storage1) * 0.42 / dtDays;
    const maxLoss2 = Math.max(0, storage2 - soilResidual[layer2Index]) * 0.42 / dtDays;
    const maxGain2 = Math.max(0, soilCap[layer2Index] - storage2) * 0.42 / dtDays;
    soilTransport[layer0Index] = clamp(rawTransport0, -maxLoss0, maxGain0);
    soilTransport[layer1Index] = clamp(rawTransport1, -maxLoss1, maxGain1);
    soilTransport[layer2Index] = clamp(rawTransport2, -maxLoss2, maxGain2);

    const rawGroundwaterTransport =
      localGroundwaterT * lapGroundwaterHead + gxGroundwaterT * gxGroundwaterHead + gyGroundwaterT * gyGroundwaterHead;
    const maxGroundwaterLoss = Math.max(0, groundwaterStorageValue) * 0.36 / dtDays;
    const maxGroundwaterGain = Math.max(0, groundwaterCap[i] - groundwaterStorageValue) * 0.36 / dtDays;
    groundwaterTransport[i] = clamp(rawGroundwaterTransport, -maxGroundwaterLoss, maxGroundwaterGain);

    let surfaceMfdX = 0;
    let surfaceMfdY = 0;
    if (elevation) {
      const centerSurfaceHead = elevation[i] + H[i];
      for (let k = 0; k < m; k += 1) {
        const surfaceWeightIndex = stencilOffset + k;
        const surfaceCellId = stencil[surfaceWeightIndex];
        const surfaceDrop = centerSurfaceHead - (elevation[surfaceCellId] + H[surfaceCellId]);
        if (surfaceDrop > 0) {
          surfaceMfdX += gxW[surfaceWeightIndex] * surfaceDrop;
          surfaceMfdY += gyW[surfaceWeightIndex] * surfaceDrop;
        }
      }
    }

    const downhillX = elevation ? surfaceMfdX : -(slopeX[i] + filmGx);
    const downhillY = elevation ? surfaceMfdY : -(slopeY[i] + filmGy);
    const surfaceScale = surfaceWaterVelocityScale(H[i], downhillX, downhillY);
    const surfaceVx = downhillX * surfaceScale;
    const surfaceVy = downhillY * surfaceScale;
    surfaceUx[i] = surfaceVx;
    surfaceUy[i] = surfaceVy;

    let topQx = -localT0 * gxHead0;
    let topQy = -localT0 * gyHead0;
    const topMaxFlux = Math.max(1e-7, storage0 * cellSizeM * 0.16 / dtDays);
    const topMagnitude2 = topQx * topQx + topQy * topQy;
    const topMaxFlux2 = topMaxFlux * topMaxFlux;
    if (topMagnitude2 > topMaxFlux2 && topMagnitude2 > 0) {
      const scale = topMaxFlux / Math.sqrt(topMagnitude2);
      topQx *= scale;
      topQy *= scale;
    }
    const topSpeedScale = storage0 > 1e-9 ? 1 / storage0 : 0;
    topSoilUx[i] = topQx * topSpeedScale;
    topSoilUy[i] = topQy * topSpeedScale;

    let groundwaterQx = -localGroundwaterT * gxGroundwaterHead;
    let groundwaterQy = -localGroundwaterT * gyGroundwaterHead;
    const groundwaterMaxFlux = Math.max(1e-7, groundwaterStorageValue * cellSizeM * 0.12 / dtDays);
    const groundwaterMagnitude2 = groundwaterQx * groundwaterQx + groundwaterQy * groundwaterQy;
    const groundwaterMaxFlux2 = groundwaterMaxFlux * groundwaterMaxFlux;
    if (groundwaterMagnitude2 > groundwaterMaxFlux2 && groundwaterMagnitude2 > 0) {
      const scale = groundwaterMaxFlux / Math.sqrt(groundwaterMagnitude2);
      groundwaterQx *= scale;
      groundwaterQy *= scale;
    }
    const groundwaterSpeedScale = groundwaterStorageValue > 1e-9 ? 1 / groundwaterStorageValue : 0;
    groundwaterUx[i] = groundwaterQx * groundwaterSpeedScale;
    groundwaterUy[i] = groundwaterQy * groundwaterSpeedScale;

    Htransport[i] = SURFACE_WATER_DIFF_M2_DAY * lapSurfaceWater;
    soilMineralTransport[i] = NUTRIENT_DIFF_M2_DAY * lapNutrient;
    baobabSeedTransport[i] = baobabSeedDiffusionM2Day * lapBaobabSeed;
    roseSeedTransport[i] = roseSeedDiffusionM2Day * lapRoseSeed;
  }
  return false;
}

function darcyWaterColumnsConstants(
  model,
  dtDays = MODEL_DT_DAYS,
  baobabSeedDiffusionM2Day = 0,
  roseSeedDiffusionM2Day = 0
) {
  return {
    dtDays,
    cellSizeM: model.cellSizeM ?? CELL_SIZE_M,
    surfaceWaterDiffM2Day: SURFACE_WATER_DIFF_M2_DAY,
    surfaceSlopeVelocityMDay: SURFACE_SLOPE_VELOCITY_M_DAY,
    surfaceSlopeMaxVelocityMDay: SURFACE_SLOPE_MAX_VELOCITY_M_DAY,
    nutrientDiffM2Day: NUTRIENT_DIFF_M2_DAY,
    baobabSeedDiffusionM2Day,
    roseSeedDiffusionM2Day
  };
}

function transportNutrientRbf(model, output) {
  const { state, size } = model;
  const { m, stencil, lapW, gxW, gyW } = model.operators;
  const activeCellIds = model.activeCellIds;
  if (activeCellIds) {
    state.fluxX.fill(0);
    state.fluxY.fill(0);
    output.fill(0);
  }
  const cellCount = activeCellIds ? activeCellIds.length : size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const topSat = clamp(state.W0[i] / state.soilCap[i]);
    const gwSat = clamp(state.W1[i] / state.groundwaterCap[i]);
    const mobileFraction = nutrientMobileFraction(topSat, gwSat, state.soilCarbonActive[i], state.soilCarbonStable[i]);
    const mobileN = state.soilMineralN[i] * mobileFraction;
    const topWeight = clamp(0.68 + 0.18 * topSat - 0.12 * gwSat, 0.45, 0.86);
    const groundWeight = 1 - topWeight;
    state.fluxX[i] = mobileN * (topWeight * state.topSoilUx[i] + groundWeight * state.groundwaterUx[i]);
    state.fluxY[i] = mobileN * (topWeight * state.topSoilUy[i] + groundWeight * state.groundwaterUy[i]);
  }

  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const offset = i * m;
    let lapN = 0;
    let fluxDivergenceX = 0;
    let fluxDivergenceY = 0;
    for (let k = 0; k < m; k += 1) {
      const weightIndex = offset + k;
      const stencilIndex = stencil[weightIndex];
      lapN += lapW[weightIndex] * state.soilMineralN[stencilIndex];
      fluxDivergenceX += gxW[weightIndex] * state.fluxX[stencilIndex];
      fluxDivergenceY += gyW[weightIndex] * state.fluxY[stencilIndex];
    }
    output[i] = NUTRIENT_DIFF_M2_DAY * lapN - fluxDivergenceX - fluxDivergenceY;
  }
  limitNutrientTransport(model, output);
}

function nutrientMobileFraction(topSat, gwSat, activeSoilCarbon = 0, stableSoilCarbon = 0) {
  const waterMobility = topSat * topSat * 0.22 + gwSat * 0.035;
  const sorption = clamp(activeSoilCarbon * 0.9 + stableSoilCarbon * 0.32, 0, 1.2);
  const retardation = 1 / (1 + 1.8 * sorption);
  return clamp(
    (NUTRIENT_MIN_MOBILE_FRACTION + waterMobility) * retardation,
    NUTRIENT_MIN_MOBILE_FRACTION,
    NUTRIENT_MAX_MOBILE_FRACTION
  );
}

function transportSurfaceNutrientSeedsRbf(model) {
  const { state, size } = model;
  const profileSink = activeProfileSink();
  const wasmProfileStart = profileSink ? performance.now() : 0;
  if (
    runWasmSurfaceNutrientTransport(model, {
      surfaceFilmThresholdM: SURFACE_FILM_THRESHOLD_M,
      modelDtDays: MODEL_DT_DAYS
    })
  ) {
    if (profileSink) {
      addProfileTime(profileSink, "horizontalSurfaceNutrientWasm", performance.now() - wasmProfileStart);
    }
    return;
  }

  const { m, stencil, gxW, gyW } = model.operators;
  const {
    H,
    W0,
    W1,
    soilCap,
    groundwaterCap,
    soilMineralN,
    topSoilUx,
    topSoilUy,
    groundwaterUx,
    groundwaterUy,
    surfaceUx,
    surfaceUy,
    fluxX,
    fluxY,
    Htransport,
    soilMineralTransport
  } = state;
  let profileSectionStart = profileSink ? performance.now() : 0;
  const activeCellIds = model.activeCellIds;
  if (activeCellIds) {
    fluxX.fill(0);
    fluxY.fill(0);
  }

  const cellCount = activeCellIds ? activeCellIds.length : size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const topSat = clamp(W0[i] / soilCap[i]);
    const gwSat = clamp(W1[i] / groundwaterCap[i]);
    const mobileFraction = nutrientMobileFraction(topSat, gwSat, state.soilCarbonActive[i], state.soilCarbonStable[i]);
    const mobileN = soilMineralN[i] * mobileFraction;
    const topWeight = clamp(0.68 + 0.18 * topSat - 0.12 * gwSat, 0.45, 0.86);
    const groundWeight = 1 - topWeight;
    fluxX[i] = mobileN * (topWeight * topSoilUx[i] + groundWeight * groundwaterUx[i]);
    fluxY[i] = mobileN * (topWeight * topSoilUy[i] + groundWeight * groundwaterUy[i]);
  }
  if (profileSink) {
    const now = performance.now();
    addProfileTime(profileSink, "horizontalSurfaceNutrientFlux", now - profileSectionStart);
    profileSectionStart = now;
  }

  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const offset = i * m;
    let surfaceFluxDivergenceX = 0;
    let surfaceFluxDivergenceY = 0;
    let nutrientFluxDivergenceX = 0;
    let nutrientFluxDivergenceY = 0;

    let weightIndex = offset;
    let cellId = stencil[weightIndex];
    let gxWeight = gxW[weightIndex];
    let gyWeight = gyW[weightIndex];
    let surfaceWater = H[cellId];
    let mobileSurfaceWater = Math.max(0, surfaceWater - SURFACE_FILM_THRESHOLD_M);
    surfaceFluxDivergenceX += gxWeight * surfaceUx[cellId] * mobileSurfaceWater;
    surfaceFluxDivergenceY += gyWeight * surfaceUy[cellId] * mobileSurfaceWater;
    nutrientFluxDivergenceX += gxWeight * fluxX[cellId];
    nutrientFluxDivergenceY += gyWeight * fluxY[cellId];

    weightIndex = offset + 1;
    cellId = stencil[weightIndex];
    gxWeight = gxW[weightIndex];
    gyWeight = gyW[weightIndex];
    surfaceWater = H[cellId];
    mobileSurfaceWater = Math.max(0, surfaceWater - SURFACE_FILM_THRESHOLD_M);
    surfaceFluxDivergenceX += gxWeight * surfaceUx[cellId] * mobileSurfaceWater;
    surfaceFluxDivergenceY += gyWeight * surfaceUy[cellId] * mobileSurfaceWater;
    nutrientFluxDivergenceX += gxWeight * fluxX[cellId];
    nutrientFluxDivergenceY += gyWeight * fluxY[cellId];

    weightIndex = offset + 2;
    cellId = stencil[weightIndex];
    gxWeight = gxW[weightIndex];
    gyWeight = gyW[weightIndex];
    surfaceWater = H[cellId];
    mobileSurfaceWater = Math.max(0, surfaceWater - SURFACE_FILM_THRESHOLD_M);
    surfaceFluxDivergenceX += gxWeight * surfaceUx[cellId] * mobileSurfaceWater;
    surfaceFluxDivergenceY += gyWeight * surfaceUy[cellId] * mobileSurfaceWater;
    nutrientFluxDivergenceX += gxWeight * fluxX[cellId];
    nutrientFluxDivergenceY += gyWeight * fluxY[cellId];

    weightIndex = offset + 3;
    cellId = stencil[weightIndex];
    gxWeight = gxW[weightIndex];
    gyWeight = gyW[weightIndex];
    surfaceWater = H[cellId];
    mobileSurfaceWater = Math.max(0, surfaceWater - SURFACE_FILM_THRESHOLD_M);
    surfaceFluxDivergenceX += gxWeight * surfaceUx[cellId] * mobileSurfaceWater;
    surfaceFluxDivergenceY += gyWeight * surfaceUy[cellId] * mobileSurfaceWater;
    nutrientFluxDivergenceX += gxWeight * fluxX[cellId];
    nutrientFluxDivergenceY += gyWeight * fluxY[cellId];

    weightIndex = offset + 4;
    cellId = stencil[weightIndex];
    gxWeight = gxW[weightIndex];
    gyWeight = gyW[weightIndex];
    surfaceWater = H[cellId];
    mobileSurfaceWater = Math.max(0, surfaceWater - SURFACE_FILM_THRESHOLD_M);
    surfaceFluxDivergenceX += gxWeight * surfaceUx[cellId] * mobileSurfaceWater;
    surfaceFluxDivergenceY += gyWeight * surfaceUy[cellId] * mobileSurfaceWater;
    nutrientFluxDivergenceX += gxWeight * fluxX[cellId];
    nutrientFluxDivergenceY += gyWeight * fluxY[cellId];

    weightIndex = offset + 5;
    cellId = stencil[weightIndex];
    gxWeight = gxW[weightIndex];
    gyWeight = gyW[weightIndex];
    surfaceWater = H[cellId];
    mobileSurfaceWater = Math.max(0, surfaceWater - SURFACE_FILM_THRESHOLD_M);
    surfaceFluxDivergenceX += gxWeight * surfaceUx[cellId] * mobileSurfaceWater;
    surfaceFluxDivergenceY += gyWeight * surfaceUy[cellId] * mobileSurfaceWater;
    nutrientFluxDivergenceX += gxWeight * fluxX[cellId];
    nutrientFluxDivergenceY += gyWeight * fluxY[cellId];

    weightIndex = offset + 6;
    cellId = stencil[weightIndex];
    gxWeight = gxW[weightIndex];
    gyWeight = gyW[weightIndex];
    surfaceWater = H[cellId];
    mobileSurfaceWater = Math.max(0, surfaceWater - SURFACE_FILM_THRESHOLD_M);
    surfaceFluxDivergenceX += gxWeight * surfaceUx[cellId] * mobileSurfaceWater;
    surfaceFluxDivergenceY += gyWeight * surfaceUy[cellId] * mobileSurfaceWater;
    nutrientFluxDivergenceX += gxWeight * fluxX[cellId];
    nutrientFluxDivergenceY += gyWeight * fluxY[cellId];

    weightIndex = offset + 7;
    cellId = stencil[weightIndex];
    gxWeight = gxW[weightIndex];
    gyWeight = gyW[weightIndex];
    surfaceWater = H[cellId];
    mobileSurfaceWater = Math.max(0, surfaceWater - SURFACE_FILM_THRESHOLD_M);
    surfaceFluxDivergenceX += gxWeight * surfaceUx[cellId] * mobileSurfaceWater;
    surfaceFluxDivergenceY += gyWeight * surfaceUy[cellId] * mobileSurfaceWater;
    nutrientFluxDivergenceX += gxWeight * fluxX[cellId];
    nutrientFluxDivergenceY += gyWeight * fluxY[cellId];

    weightIndex = offset + 8;
    cellId = stencil[weightIndex];
    gxWeight = gxW[weightIndex];
    gyWeight = gyW[weightIndex];
    surfaceWater = H[cellId];
    mobileSurfaceWater = Math.max(0, surfaceWater - SURFACE_FILM_THRESHOLD_M);
    surfaceFluxDivergenceX += gxWeight * surfaceUx[cellId] * mobileSurfaceWater;
    surfaceFluxDivergenceY += gyWeight * surfaceUy[cellId] * mobileSurfaceWater;
    nutrientFluxDivergenceX += gxWeight * fluxX[cellId];
    nutrientFluxDivergenceY += gyWeight * fluxY[cellId];

    Htransport[i] -= surfaceFluxDivergenceX + surfaceFluxDivergenceY;
    soilMineralTransport[i] -= nutrientFluxDivergenceX + nutrientFluxDivergenceY;
  }
  if (profileSink) {
    const now = performance.now();
    addProfileTime(profileSink, "horizontalSurfaceNutrientStencil", now - profileSectionStart);
    profileSectionStart = now;
  }
  limitNutrientTransport(model, soilMineralTransport);
  if (profileSink) {
    addProfileTime(profileSink, "horizontalSurfaceNutrientLimit", performance.now() - profileSectionStart);
  }
}

const ROSE_SEED_DISPERSAL_SCRATCH_SIZE = 4096;
const roseSeedDispersalScratch = new Int32Array(ROSE_SEED_DISPERSAL_SCRATCH_SIZE);

function roseSeedTargetIndex(target, count) {
  for (let index = 0; index < count; index += 1) {
    if (roseSeedDispersalScratch[index] === target) {
      return index;
    }
  }
  return -1;
}

function addRoseSeedDispersalTarget(state, target, count) {
  if (target === null || target === undefined || state.landActive[target] !== 1) {
    return count;
  }

  if (roseSeedTargetIndex(target, count) >= 0) {
    return count;
  }

  if (count >= roseSeedDispersalScratch.length) {
    return count;
  }

  roseSeedDispersalScratch[count] = target;
  return count + 1;
}

function buildRoseSeedDispersalKernel(model) {
  const maxGraphSteps = 1;
  const kernel = runWasmBuildRoseSeedDispersalKernel(model, {
    maxGraphSteps,
    radiusM: model.radiusM,
    dispersalLengthM: ROSE_SEED_DISPERSAL_LENGTH_M
  });
  if (!kernel) {
    throw new Error("WASM rose seed dispersal kernel builder is required.");
  }
  return kernel;
}

function distributeRoseSeedProduction(model) {
  const { state } = model;
  state.roseSeedProduction.fill(0);
  state.roseSeedArrival.fill(0);

  if (
    runWasmRoseSeedProductionAndDispersal(model, {
      cohorts: ROSE_SEED_DISPERSAL_COHORTS,
      asteroidMeanTempC: model.params.asteroidMeanTempC ?? 16,
      asteroidDiurnalRangeC: model.params.asteroidDiurnalRangeC ?? 16,
      asteroidLatitudeTempRangeC: model.params.asteroidLatitudeTempRangeC ?? 3,
      shade: model.params.shade ?? DEFAULT_PARAMS.shade,
      modelDtDays: MODEL_DT_DAYS
    })
  ) {
    return;
  }

  throw new Error("WASM rose seed production and dispersal kernel is required.");
}

function limitSoilTransport(model, layer, dtDays = MODEL_DT_DAYS) {
  const { state, size } = model;
  const offset = layer * size;
  const activeCellIds = model.activeCellIds;
  const cellCount = activeCellIds ? activeCellIds.length : size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const storage = state.soilWater[offset + i];
    const residual = state.soilResidual[offset + i];
    const cap = state.soilCap[offset + i];
    const maxLoss = Math.max(0, storage - residual) * 0.42 / dtDays;
    const maxGain = Math.max(0, cap - storage) * 0.42 / dtDays;
    state.soilTransport[offset + i] = clamp(state.soilTransport[offset + i], -maxLoss, maxGain);
  }
}

function limitNutrientTransport(model, output) {
  const { state, size } = model;
  const activeCellIds = model.activeCellIds;
  const cellCount = activeCellIds ? activeCellIds.length : size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const maxLoss = Math.max(0, state.soilMineralN[i] - 0.002) * 0.32 / MODEL_DT_DAYS;
    const maxGain = Math.max(0, 1.4 - state.soilMineralN[i]) * 0.32 / MODEL_DT_DAYS;
    output[i] = clamp(output[i], -maxLoss, maxGain);
  }
}

function updateSoilBiogeochemistryFromInputs(model) {
  const { state, size } = model;
  const activeCellIds = model.activeCellIds;
  const cellCount = activeCellIds ? activeCellIds.length : size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const substrateIndex = state.substrate[i];
    const sub = SUBSTRATES[substrateIndex] ?? SUBSTRATES[0];
    const wetness = state.soilBioWetness[i];
    const tempC = state.soilBioTempC[i];
    const ashLoad = state.soilBioAshLoad[i];
    const aggregateLitter = Math.max(0, state.litterCarbon[i]);
    let fastCarbon = state.litterFastCarbon[i];
    let slowCarbon = state.litterSlowCarbon[i];
    const pooledLitter = fastCarbon + slowCarbon;
    if (Math.abs(pooledLitter - aggregateLitter) > 1e-6) {
      fastCarbon = aggregateLitter * LITTER_FAST_INITIAL_FRACTION;
      slowCarbon = aggregateLitter * (1 - LITTER_FAST_INITIAL_FRACTION);
    }
    const wetnessClamped = clamp(wetness);
    const decomposition = litterDecompositionRate(wetness, tempC, substrateIndex, ashLoad);
    const fastDecay = decomposition * 1.42 * fastCarbon;
    const slowDecay = decomposition * 0.32 * slowCarbon;
    const litterDecay = fastDecay + slowDecay;
    const humified = litterDecay * LITTER_HUMIFICATION_FRACTION;
    const activeDecayRate = (0.0035 + 0.018 * wetnessClamped * temperatureResponse(tempC, 25, -5, 45)) *
      (SUBSTRATE_ACTIVE_SOC_DECAY_FACTOR[substrateIndex] || 1);
    const stableDecayRate = 0.00018 + 0.0011 * wetnessClamped * temperatureResponse(tempC, 22, -6, 42);
    const activeDecay = activeDecayRate * state.soilCarbonActive[i];
    const stableDecay = stableDecayRate * state.soilCarbonStable[i];
    const stabilized = activeDecay * ACTIVE_SOC_STABILIZATION_FRACTION;
    const mineralization = 0.32 * litterDecay + 0.24 * activeDecay + 0.08 * stableDecay;
    const ashWeathering = 0.00018 * clamp(ashLoad) * (0.35 + 0.65 * wetness);
    const mineralWeathering =
      0.00022 *
      sub.nutrientR *
      (0.42 + 0.58 * clamp(state.depth[i] / 1.35)) *
      (0.35 + 0.65 * wetnessClamped) *
      temperatureResponse(tempC, 18, -8, 42);
    const organicNitrogenRelease =
      0.00042 *
      (state.soilCarbonActive[i] + 0.28 * state.soilCarbonStable[i]) *
      wetnessClamped *
      temperatureResponse(tempC, 20, -6, 42);
    const leachableN =
      state.soilMineralN[i] *
      nutrientMobileFraction(
        state.soilBioTopSat[i],
        state.soilBioGroundwaterSat[i],
        state.soilCarbonActive[i],
        state.soilCarbonStable[i]
      );
    const leaching = (0.00045 + 0.0032 * wetness * wetness) * leachableN;
    state.litterFastCarbonN[i] = clamp(
      fastCarbon + MODEL_DT_DAYS * (state.soilBioLitterFastInput[i] - fastDecay),
      0,
      1.4
    );
    state.litterSlowCarbonN[i] = clamp(
      slowCarbon + MODEL_DT_DAYS * (state.soilBioLitterSlowInput[i] - slowDecay),
      0,
      1.8
    );
    state.soilCarbonActiveN[i] = clamp(state.soilCarbonActive[i] + MODEL_DT_DAYS * (humified - activeDecay), 0, 2.4);
    state.soilCarbonStableN[i] = clamp(state.soilCarbonStable[i] + MODEL_DT_DAYS * (stabilized - stableDecay), 0, 4.2);
    state.litterCarbonN[i] = clamp(state.litterFastCarbonN[i] + state.litterSlowCarbonN[i], 0, 1.8);
    state.soilMineralNN[i] = clamp(
      state.soilMineralN[i] +
        MODEL_DT_DAYS *
          (
            state.soilMineralTransport[i] +
            0.38 * mineralization +
            organicNitrogenRelease +
            mineralWeathering +
            ashWeathering -
            state.soilBioPlantNutrientUptake[i] -
            leaching
          ),
      0.005,
      1.35 + 0.25 * clamp(state.roseFertility[i] / 1.8)
    );
  }
}

function limitGroundwaterTransport(model, dtDays = MODEL_DT_DAYS) {
  const { state, size } = model;
  const activeCellIds = model.activeCellIds;
  const cellCount = activeCellIds ? activeCellIds.length : size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const cap = state.groundwaterCap[i];
    const storage = state.groundwaterStorage[i];
    const maxLoss = Math.max(0, storage) * 0.36 / dtDays;
    const maxGain = Math.max(0, cap - storage) * 0.36 / dtDays;
    state.groundwaterTransport[i] = clamp(state.groundwaterTransport[i], -maxLoss, maxGain);
  }
}

function diffuseRbf(model, field, diffusionM2Day, output) {
  const { m, stencil, lapW } = model.operators;
  const activeCellIds = model.activeCellIds;
  if (activeCellIds) {
    output.fill(0);
  }
  const cellCount = activeCellIds ? activeCellIds.length : model.size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const offset = i * m;
    let lapField = 0;
    for (let k = 0; k < m; k += 1) {
      const weightIndex = offset + k;
      lapField += lapW[weightIndex] * field[stencil[weightIndex]];
    }
    output[i] = diffusionM2Day * lapField;
  }
}

function localHydraulicColumn(model, i, values) {
  const { state } = model;
  const sub = SUBSTRATES[state.substrate[i]];
  const caps = [
    soilLayerCapacity(state.depth[i], sub, 0),
    soilLayerCapacity(state.depth[i], sub, 1),
    soilLayerCapacity(state.depth[i], sub, 2)
  ];
  const heads = [0, 0, 0];
  const hydraulicK = [0, 0, 0];
  for (let layer = 0; layer < SOIL_LAYER_COUNT; layer += 1) {
    const sat = clamp(values.soil[layer] / caps[layer]);
    heads[layer] = state.elevation[i] - soilLayerCenterDepth(state.depth[i], sub, layer) + matricPotentialM(sub, sat);
    hydraulicK[layer] = unsaturatedHydraulicConductivity(sub, sat, layer === 0 ? 0 : 1);
  }
  const gwCap = groundwaterCapacity(state.depth[i], sub);
  const gwThickness = groundwaterThickness(gwCap, sub);
  const gwSat = clamp(values.groundwater / gwCap);
  const gwTopDepth = soilLayerTopDepth(state.depth[i], sub, SOIL_LAYER_COUNT);
  return {
    sub,
    caps,
    heads,
    hydraulicK,
    groundwaterCap: gwCap,
    groundwaterHead: state.elevation[i] - gwTopDepth - gwThickness + gwThickness * gwSat,
    groundwaterThickness: gwThickness
  };
}

function surfaceInfiltrationFluxForColumn(model, i, values, column, rain, vegFeedback, dtDays) {
  const { state } = model;
  const { sub, caps, heads, hydraulicK } = column;
  const sat0 = clamp(values.soil[0] / caps[0]);
  const topThickness = soilLayerThickness(caps[0], sub);
  const verticalDistance = Math.max(0.025, topThickness * 0.5);
  const surfaceHead = state.elevation[i] + Math.max(0, values.surface);
  const headGradient = Math.max(0, (surfaceHead - heads[0]) / verticalDistance);
  const openPores = clamp(1 - sat0, 0.015, 1);
  const surfaceK =
    Math.max(hydraulicK[0], sub.ksat0 * 0.012) *
    (0.35 * sub.infBare + 0.65 * sub.infVeg * (0.25 + 0.75 * vegFeedback));
  const capacity = surfaceK * headGradient * openPores;
  const available = values.surface / dtDays + rain;
  const poreSpace = Math.max(0, caps[0] - values.soil[0]) / dtDays;
  return Math.min(available, poreSpace, Math.max(0, capacity));
}

function verticalRichardsFluxForColumn(model, i, values, column, upperLayer, dtDays) {
  const { state } = model;
  const lowerLayer = upperLayer + 1;
  const { sub, caps, heads, hydraulicK } = column;
  const upperThickness = soilLayerThickness(caps[upperLayer], sub);
  const lowerThickness = soilLayerThickness(caps[lowerLayer], sub);
  const distance = Math.max(0.02, 0.5 * (upperThickness + lowerThickness));
  const headGradientDown = (heads[upperLayer] - heads[lowerLayer]) / distance;
  const interfaceK = harmonicMean(hydraulicK[upperLayer], hydraulicK[lowerLayer]) * sub.percolation;
  const flux = interfaceK * headGradientDown;
  const upperResidual = residualStorage(caps[upperLayer], sub);
  const lowerResidual = residualStorage(caps[lowerLayer], sub);
  const maxDown = Math.min(
    Math.max(0, values.soil[upperLayer] - upperResidual) / dtDays,
    Math.max(0, caps[lowerLayer] - values.soil[lowerLayer]) / dtDays
  );
  const maxUp = Math.min(
    Math.max(0, values.soil[lowerLayer] - lowerResidual) / dtDays,
    Math.max(0, caps[upperLayer] - values.soil[upperLayer]) / dtDays
  );
  return clamp(flux, -maxUp, maxDown);
}

function groundwaterRechargeFluxForColumn(model, i, values, column, dtDays) {
  const { state } = model;
  const { sub, caps, heads, hydraulicK, groundwaterCap, groundwaterHead, groundwaterThickness: gwThickness } = column;
  const layer = SOIL_LAYER_COUNT - 1;
  const layerThickness = soilLayerThickness(caps[layer], sub);
  const distance = Math.max(0.025, 0.5 * layerThickness + 0.5 * gwThickness);
  const gradientDown = (heads[layer] - groundwaterHead) / distance;
  const interfaceK = harmonicMean(hydraulicK[layer], sub.ksat1 * sub.leak) * sub.percolation;
  const flux = interfaceK * gradientDown;
  const residual = residualStorage(caps[layer], sub);
  const maxDown = Math.min(
    Math.max(0, values.soil[layer] - residual) / dtDays,
    Math.max(0, groundwaterCap - values.groundwater) / dtDays
  );
  const maxUp = Math.min(
    Math.max(0, values.groundwater) / dtDays,
    Math.max(0, caps[layer] - values.soil[layer]) / dtDays
  );
  return clamp(flux, -maxUp, maxDown);
}

function groundwaterLeakageFluxForColumn(values, column, dtDays) {
  const { sub, groundwaterCap } = column;
  const sat = clamp(values.groundwater / groundwaterCap);
  const excess = clamp((sat - 0.92) / 0.08);
  const leakage = sub.leak * sub.gwK * excess * excess * 0.04;
  return Math.min(Math.max(0, values.groundwater) / dtDays, leakage);
}

function richardsColumnSemiImplicitUpdateInPlace(
  model,
  i,
  dtDays,
  throughfall,
  vegFeedback,
  sink0,
  sink1,
  sink2,
  groundwaterSink,
  surfaceTransport,
  surfaceEvap,
  soilTransport0,
  soilTransport1,
  soilTransport2,
  groundwaterTransport,
  writeDiagnostics = false
) {
  const { state, size } = model;
  const substrateIndex = state.substrate[i];
  const sub = SUBSTRATES[substrateIndex];
  const layer0Index = i;
  const layer1Index = size + i;
  const layer2Index = size * 2 + i;
  const elevation = state.elevation[i];
  const cap0 = state.soilCap[layer0Index];
  const cap1 = state.soilCap[layer1Index];
  const cap2 = state.soilCap[layer2Index];
  const thick0 = state.soilThickness[layer0Index];
  const thick1 = state.soilThickness[layer1Index];
  const thick2 = state.soilThickness[layer2Index];
  const residual0 = state.soilResidual[layer0Index];
  const residual1 = state.soilResidual[layer1Index];
  const residual2 = state.soilResidual[layer2Index];
  const groundwaterCap = state.groundwaterCap[i];
  const groundwaterThicknessValue = state.groundwaterThickness[i];
  const groundwaterTopDepth = state.groundwaterTopDepth[i];
  const initialSurface = state.H[i];
  const initialSoil0 = state.soilWater[layer0Index];
  const initialSoil1 = state.soilWater[layer1Index];
  const initialSoil2 = state.soilWater[layer2Index];
  const initialGroundwater = state.groundwaterStorage[i];

  let surface = initialSurface;
  let soil0 = initialSoil0;
  let soil1 = initialSoil1;
  let soil2 = initialSoil2;
  let groundwater = initialGroundwater;
  let qInf = 0;
  let q01 = 0;
  let q12 = 0;
  let recharge = 0;
  let leak = 0;
  let surfaceSink = 0;

  const sat0 = clamp(initialSoil0 / cap0);
  const groundwaterSat = clamp(initialGroundwater / groundwaterCap);
  const head0 = state.soilHead[layer0Index];
  const head1 = state.soilHead[layer1Index];
  const head2 = state.soilHead[layer2Index];
  const hydraulicK0 = state.soilHydraulicK[layer0Index];
  const hydraulicK1 = state.soilHydraulicK[layer1Index];
  const hydraulicK2 = state.soilHydraulicK[layer2Index];
  const groundwaterHead = state.groundwaterHead[i];

  const infiltrationDistance = Math.max(0.025, thick0 * 0.5);
  const surfaceHead = elevation + Math.max(0, initialSurface);
  const infiltrationGradient = Math.max(0, (surfaceHead - head0) / infiltrationDistance);
  const openPores = clamp(1 - sat0, 0.015, 1);
  const surfaceK =
    Math.max(hydraulicK0, sub.ksat0 * 0.012) *
    (0.35 * sub.infBare + 0.65 * sub.infVeg * (0.25 + 0.75 * vegFeedback));
  const infiltrationCapacity = surfaceK * infiltrationGradient * openPores;
  const infiltrationAvailable = initialSurface / dtDays + throughfall;
  const infiltrationPoreSpace = Math.max(0, cap0 - initialSoil0) / dtDays;
  qInf = Math.min(infiltrationAvailable, infiltrationPoreSpace, Math.max(0, infiltrationCapacity));

  const distance01 = Math.max(0.02, 0.5 * (thick0 + thick1));
  const flux01 = harmonicMean(hydraulicK0, hydraulicK1) * sub.percolation * ((head0 - head1) / distance01);
  const maxDown01 = Math.min(Math.max(0, initialSoil0 - residual0) / dtDays, Math.max(0, cap1 - initialSoil1) / dtDays);
  const maxUp01 = Math.min(Math.max(0, initialSoil1 - residual1) / dtDays, Math.max(0, cap0 - initialSoil0) / dtDays);
  q01 = clamp(flux01, -maxUp01, maxDown01);

  const distance12 = Math.max(0.02, 0.5 * (thick1 + thick2));
  const flux12 = harmonicMean(hydraulicK1, hydraulicK2) * sub.percolation * ((head1 - head2) / distance12);
  const maxDown12 = Math.min(Math.max(0, initialSoil1 - residual1) / dtDays, Math.max(0, cap2 - initialSoil2) / dtDays);
  const maxUp12 = Math.min(Math.max(0, initialSoil2 - residual2) / dtDays, Math.max(0, cap1 - initialSoil1) / dtDays);
  q12 = clamp(flux12, -maxUp12, maxDown12);

  const rechargeDistance = Math.max(0.025, 0.5 * thick2 + 0.5 * groundwaterThicknessValue);
  const rechargeFlux =
    harmonicMean(hydraulicK2, sub.ksat1 * sub.leak) *
    sub.percolation *
    ((head2 - groundwaterHead) / rechargeDistance);
  const maxRechargeDown = Math.min(
    Math.max(0, initialSoil2 - residual2) / dtDays,
    Math.max(0, groundwaterCap - initialGroundwater) / dtDays
  );
  const maxRechargeUp = Math.min(Math.max(0, initialGroundwater) / dtDays, Math.max(0, cap2 - initialSoil2) / dtDays);
  recharge = clamp(rechargeFlux, -maxRechargeUp, maxRechargeDown);

  const excessGroundwater = clamp((groundwaterSat - 0.92) / 0.08);
  leak = Math.min(Math.max(0, initialGroundwater) / dtDays, sub.leak * sub.gwK * excessGroundwater * excessGroundwater * 0.04);
  const surfaceSinkDemand = Math.max(0, surfaceEvap);
  const surfaceBeforeSink = initialSurface + dtDays * (surfaceTransport + throughfall - qInf);
  surfaceSink = Math.min(surfaceSinkDemand, Math.max(0, surfaceBeforeSink) / dtDays);

  surface = Math.max(0, surfaceBeforeSink - dtDays * surfaceSink);
  soil0 = clamp(initialSoil0 + dtDays * (soilTransport0 + qInf - q01 - sink0), 0, cap0);
  soil1 = clamp(initialSoil1 + dtDays * (soilTransport1 + q01 - q12 - sink1), 0, cap1);
  soil2 = clamp(initialSoil2 + dtDays * (soilTransport2 + q12 - recharge - sink2), 0, cap2);
  groundwater = clamp(
    initialGroundwater + dtDays * (groundwaterTransport + recharge - leak - groundwaterSink),
    0,
    groundwaterCap
  );

  state.Hn[i] = surface;
  state.soilWaterN[layer0Index] = soil0;
  state.soilWaterN[layer1Index] = soil1;
  state.soilWaterN[layer2Index] = soil2;
  state.groundwaterStorageN[i] = groundwater;
  if (writeDiagnostics) {
    state.groundwaterRecharge[i] = recharge;
    state.hydrologyHorizontalM[i] +=
      (surfaceTransport + soilTransport0 + soilTransport1 + soilTransport2 + groundwaterTransport) * dtDays;
    state.hydrologyInfiltrationM[i] += qInf * dtDays;
    state.hydrologyPercolation01M[i] += q01 * dtDays;
    state.hydrologyPercolation12M[i] += q12 * dtDays;
    state.hydrologyRechargeM[i] += recharge * dtDays;
    state.hydrologyLeakageM[i] += leak * dtDays;
    state.hydrologySurfaceEvapM[i] += surfaceSink * dtDays;
  }
}

function runHydrologySubsteps(model, usePrecomputedTransport = false) {
  const { state, size } = model;
  const writeDiagnostics = model.diagnosticsEnabled;
  model.lastHydrologySubsteps = HYDROLOGY_SUBSTEPS;
  const dtDays = MODEL_DT_DAYS / HYDROLOGY_SUBSTEPS;
  const activeCellIds = model.activeCellIds;
  const cellCount = activeCellIds ? activeCellIds.length : size;
  const {
    Htransport,
    hydrologyThroughfall,
    hydrologyVegFeedback,
    hydrologySink0,
    hydrologySink1,
    hydrologySink2,
    hydrologyGroundwaterSink,
    hydrologyHorizontalM,
    hydrologyInfiltrationM,
    hydrologyPercolation01M,
    hydrologyPercolation12M,
    hydrologyRechargeM,
    hydrologyLeakageM,
    hydrologySurfaceEvapDemandM,
    hydrologySurfaceEvapM,
    hydrologySurfaceDrainM,
    hydrologyStorageBeforeM,
    hydrologyStorageChangeM,
    hydrologyResidualM,
    groundwaterTransport
  } = state;

  if (writeDiagnostics) {
    hydrologyHorizontalM.fill(0);
    hydrologyInfiltrationM.fill(0);
    hydrologyPercolation01M.fill(0);
    hydrologyPercolation12M.fill(0);
    hydrologyRechargeM.fill(0);
    hydrologyLeakageM.fill(0);
    hydrologySurfaceEvapM.fill(0);
    hydrologySurfaceDrainM.fill(0);
    hydrologyStorageChangeM.fill(0);
    hydrologyResidualM.fill(0);
    if (activeCellIds) {
      hydrologyStorageBeforeM.fill(0);
    }
    for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
      const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
      hydrologyStorageBeforeM[i] = hydrologyCellStorage(model, i);
    }
  }

  const invModelDt = 1 / MODEL_DT_DAYS;
  const reuseTransport = usePrecomputedTransport && HYDROLOGY_SUBSTEPS === 1;
  if (reuseTransport) {
    computeStableSurfaceWaterTransport(model, MODEL_DT_DAYS);
  }
  for (let substep = 0; substep < HYDROLOGY_SUBSTEPS; substep += 1) {
    if (!reuseTransport || substep > 0) {
      updateHydraulicState(model);
      computeStableSurfaceWaterTransport(model, dtDays);

      for (let layer = 0; layer < SOIL_LAYER_COUNT; layer += 1) {
        transportSoilDarcyLayerRbf(model, layer, dtDays, false);
        limitSoilTransport(model, layer, dtDays);
      }

      transportDarcyRbf(model, state.groundwaterHead, state.groundwaterT, groundwaterTransport, dtDays, false);
      limitGroundwaterTransport(model, dtDays);
    }

    const usedWasmRichards = runWasmRichardsColumns(model, {
      dtDays,
      modelDtDays: MODEL_DT_DAYS,
      writeDiagnostics
    });
    if (!usedWasmRichards) {
      for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
        const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
        const layer1Index = size + i;
        const layer2Index = size * 2 + i;
        richardsColumnSemiImplicitUpdateInPlace(
          model,
          i,
          dtDays,
          hydrologyThroughfall[i],
          hydrologyVegFeedback[i],
          hydrologySink0[i],
          hydrologySink1[i],
          hydrologySink2[i],
          hydrologyGroundwaterSink[i],
          Htransport[i],
          hydrologySurfaceEvapDemandM[i] * invModelDt,
          state.soilTransport[i],
          state.soilTransport[layer1Index],
          state.soilTransport[layer2Index],
          groundwaterTransport[i],
          writeDiagnostics
        );
      }
    }

    swap(state, "H", "Hn");
    swap(state, "soilWater", "soilWaterN");
    swap(state, "groundwaterStorage", "groundwaterStorageN");
  }

  updateHydraulicState(model);
  if (writeDiagnostics) {
    for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
      const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
      const storageChange = hydrologyCellStorage(model, i) - hydrologyStorageBeforeM[i];
      const expectedChange =
        state.hydrologyInputM[i] +
        state.hydrologyLitterWaterM[i] +
        hydrologyHorizontalM[i] -
        state.hydrologySoilEvapM[i] -
        state.hydrologyRootUptakeM[i] -
        hydrologyLeakageM[i] -
        hydrologySurfaceEvapM[i] -
        hydrologySurfaceDrainM[i];
      hydrologyStorageChangeM[i] = storageChange;
      hydrologyResidualM[i] = storageChange - expectedChange;
    }
  }
}

function baobabLai(leafCarbon) {
  const pft = PFT_TRAITS.baobab;
  return clamp(pft.specificLeafArea * Math.max(0, leafCarbon), 0, pft.maxLai);
}

function roseLai(leafCarbon, flowerCarbon) {
  const pft = PFT_TRAITS.rose;
  return clamp(
    pft.specificLeafArea * Math.max(0, leafCarbon) + pft.flowerDisplayLai * Math.max(0, flowerCarbon),
    0,
    pft.maxLai
  );
}

function vegetationCoverFromLai(laiB, laiR) {
  return clamp(1 - Math.exp(-(PFT_TRAITS.baobab.photosynthesis.extinction * laiB + PFT_TRAITS.rose.photosynthesis.extinction * laiR)));
}

function pftCoverFromLai(pftKey, lai) {
  const pft = PFT_TRAITS[pftKey];
  return clamp(1 - Math.exp(-pft.photosynthesis.extinction * Math.max(0, lai)));
}

function partitionAparInto(out, par, laiB, laiR) {
  const baobabLaiValue = Math.max(0, laiB);
  const roseLaiValue = Math.max(0, laiR);
  const laiTotal = baobabLaiValue + roseLaiValue;
  if (par <= 0 || laiTotal <= 1e-9) {
    out.total = 0;
    out.baobab = 0;
    out.rose = 0;
    return out;
  }
  const opticalDepthTotal =
    PFT_TRAITS.baobab.photosynthesis.extinction * baobabLaiValue +
    PFT_TRAITS.rose.photosynthesis.extinction * roseLaiValue;
  const total = par * (1 - Math.exp(-opticalDepthTotal));
  out.total = total;
  out.baobab = total * baobabLaiValue / laiTotal;
  out.rose = total * roseLaiValue / laiTotal;
  return out;
}

function baobabStoreCapacity(params, stemCarbon, rootCarbon) {
  return params.storage * (1.14 * Math.max(0, stemCarbon) + 0.54 * Math.max(0, rootCarbon) + 0.035);
}

function roseStoreCapacity(rootCarbon, leafCarbon) {
  return 0.16 * Math.max(0, rootCarbon) + 0.045 * Math.max(0, leafCarbon) + 0.012;
}

function baobabWaterDemand(leafCarbon, stemCarbon, rootCarbon, light) {
  return (0.0016 * leafCarbon + 0.00028 * stemCarbon + 0.0005 * rootCarbon) * (0.22 + 0.78 * light);
}

function roseWaterDemand(leafCarbon, flowerCarbon, rootCarbon, light) {
  return (0.0045 * leafCarbon + 0.0032 * flowerCarbon + 0.0012 * rootCarbon) * (0.32 + 0.68 * light);
}

function baobabMaintenanceRespiration(leafCarbon, stemCarbon, rootCarbon, storeCarbon, tempC) {
  const traits = PFT_TRAITS.baobab.carbon;
  const q10 = q10TemperatureFactor(traits.q10, tempC);
  return q10 * (
    traits.leafMaintenance * leafCarbon +
    traits.stemMaintenance * stemCarbon +
    traits.rootMaintenance * rootCarbon +
    traits.storageMaintenance * storeCarbon
  );
}

function roseMaintenanceRespiration(leafCarbon, flowerCarbon, rootCarbon, storeCarbon, tempC) {
  const traits = PFT_TRAITS.rose.carbon;
  const q10 = q10TemperatureFactor(traits.q10, tempC);
  return q10 * (
    traits.leafMaintenance * leafCarbon +
    traits.flowerMaintenance * flowerCarbon +
    traits.rootMaintenance * rootCarbon +
    traits.storageMaintenance * storeCarbon
  );
}

function maintenanceRespiration(traits, pools, tempC) {
  const q10 = q10TemperatureFactor(traits.q10, tempC);
  return q10 * (
    (traits.leafMaintenance ?? 0) * (pools.leaf ?? 0) +
    (traits.stemMaintenance ?? 0) * (pools.stem ?? 0) +
    (traits.flowerMaintenance ?? 0) * (pools.flower ?? 0) +
    (traits.rootMaintenance ?? 0) * (pools.root ?? 0) +
    (traits.storageMaintenance ?? 0) * (pools.storage ?? 0)
  );
}

function carbonProductionBudget(gpp, maintenanceRespirationValue, traits) {
  const assimilateAfterMaintenance = gpp - maintenanceRespirationValue;
  const growthRespiration = Math.max(0, assimilateAfterMaintenance) * traits.growthRespirationFraction;
  const npp = Math.max(0, assimilateAfterMaintenance - growthRespiration);
  return {
    growthRespiration,
    npp,
    carbonBalance: assimilateAfterMaintenance > 0 ? npp : assimilateAfterMaintenance,
    autotrophicRespiration: maintenanceRespirationValue + growthRespiration
  };
}

function refreshCarbonDiagnosticsFromPools(model, dtDays = MODEL_DT_DAYS, initialize = false) {
  const { state, size } = model;
  const safeDtDays = Math.max(1e-6, Number.isFinite(dtDays) ? dtDays : MODEL_DT_DAYS);
  for (let i = 0; i < size; i += 1) {
    if (state.landActive?.[i] === 0) {
      state.plantCarbonC[i] = 0;
      state.seedCarbonC[i] = 0;
      state.litterPoolCarbonC[i] = 0;
      state.soilOrganicCarbonC[i] = 0;
      state.carbonStorageBeforeC[i] = 0;
      state.carbonStorageChangeC[i] = 0;
      state.ecosystemCarbonC[i] = 0;
      state.netEcosystemProductionC[i] = 0;
      state.carbonInputC[i] = 0;
      state.carbonRespirationC[i] = 0;
      state.carbonTransportC[i] = 0;
      state.carbonDisturbanceC[i] = 0;
      state.carbonResidualC[i] = 0;
      continue;
    }

    const plantCarbon =
      state.baobabLeaf[i] +
      state.baobabStem[i] +
      state.baobabRoot[i] +
      state.baobabStore[i] +
      state.roseLeaf[i] +
      state.roseFlower[i] +
      state.roseRoot[i] +
      state.roseStore[i];
    const seedCarbon = state.baobabSeed[i] + state.roseSeed[i];
    const litterCarbon = state.litterFastCarbon[i] + state.litterSlowCarbon[i];
    const soilOrganicCarbon = state.soilCarbonActive[i] + state.soilCarbonStable[i];
    const ecosystemCarbon = plantCarbon + seedCarbon + litterCarbon + soilOrganicCarbon;
    const previousCarbon = state.ecosystemCarbonC[i];
    const storageChange = initialize ? 0 : ecosystemCarbon - previousCarbon;

    const tempValue = state.surfaceTempC[i];
    const tempC = Number.isFinite(tempValue) ? tempValue : 15;
    const baobabMaintenance = maintenanceRespiration(
      BAOBAB_CARBON_TRAITS,
      {
        leaf: state.baobabLeaf[i],
        stem: state.baobabStem[i],
        root: state.baobabRoot[i],
        storage: state.baobabStore[i]
      },
      tempC
    );
    const roseMaintenance = maintenanceRespiration(
      ROSE_CARBON_TRAITS,
      {
        leaf: state.roseLeaf[i],
        flower: state.roseFlower[i],
        root: state.roseRoot[i],
        storage: state.roseStore[i]
      },
      tempC
    );
    const baobabBudget = carbonProductionBudget(state.gppBaobab[i], baobabMaintenance, BAOBAB_CARBON_TRAITS);
    const roseBudget = carbonProductionBudget(state.gppRose[i], roseMaintenance, ROSE_CARBON_TRAITS);
    const gppInput = (state.gppBaobab[i] + state.gppRose[i]) * safeDtDays;
    const inferredRespiration = Math.max(0, gppInput - storageChange - (state.disturbanceCarbonExportC[i] ?? 0));

    state.plantCarbonC[i] = plantCarbon;
    state.seedCarbonC[i] = seedCarbon;
    state.litterPoolCarbonC[i] = litterCarbon;
    state.soilOrganicCarbonC[i] = soilOrganicCarbon;
    state.carbonStorageBeforeC[i] = previousCarbon;
    state.carbonStorageChangeC[i] = storageChange;
    state.ecosystemCarbonC[i] = ecosystemCarbon;
    state.netEcosystemProductionC[i] = storageChange / safeDtDays;
    state.carbonInputC[i] = gppInput;
    state.carbonRespirationC[i] = inferredRespiration;
    state.carbonTransportC[i] = 0;
    state.carbonDisturbanceC[i] = state.disturbanceCarbonExportC[i] ?? 0;
    state.carbonResidualC[i] =
      storageChange -
      (state.carbonInputC[i] -
        state.carbonRespirationC[i] -
        state.carbonDisturbanceC[i]);
    state.maintenanceRespirationBaobab[i] = baobabMaintenance;
    state.maintenanceRespirationRose[i] = roseMaintenance;
    state.growthRespirationBaobab[i] = baobabBudget.growthRespiration;
    state.growthRespirationRose[i] = roseBudget.growthRespiration;
    state.autotrophicRespirationBaobab[i] = baobabBudget.autotrophicRespiration;
    state.autotrophicRespirationRose[i] = roseBudget.autotrophicRespiration;
    state.nppBaobab[i] = baobabBudget.npp;
    state.nppRose[i] = roseBudget.npp;
    state.carbonBalanceBaobab[i] = baobabBudget.carbonBalance;
    state.carbonBalanceRose[i] = roseBudget.carbonBalance;
  }
}

function rootWaterStressFromPsi(psiM, thresholds) {
  const suction = Math.max(0, -psiM);
  const wetStress = suction < thresholds.wetStressM
    ? clamp(0.24 + 0.76 * suction / Math.max(1e-6, thresholds.wetStressM))
    : 1;
  const dryStress = suction <= thresholds.optimalDryM
    ? 1
    : clamp((thresholds.wiltingM - suction) / Math.max(1e-6, thresholds.wiltingM - thresholds.optimalDryM));
  return clamp(wetStress * dryStress);
}

function normalizeWeights(weights) {
  let total = 0;
  for (let i = 0; i < weights.length; i += 1) {
    total += Math.max(0, weights[i]);
  }
  if (total <= 1e-12) {
    for (let i = 0; i < weights.length; i += 1) {
      weights[i] = 0;
    }
    return weights;
  }
  for (let i = 0; i < weights.length; i += 1) {
    weights[i] = Math.max(0, weights[i]) / total;
  }
  return weights;
}

function baobabRootLayerFractions(rootDepthParam, rootFraction, out = [0, 0, 0, 0]) {
  const deepBias = clamp((rootDepthParam - 1) / 7);
  const structuralBias = clamp((rootFraction - 0.32) / 0.36);
  out[0] = 0.34 - 0.22 * deepBias;
  out[1] = 0.24 + 0.01 * structuralBias;
  out[2] = 0.25 + 0.13 * deepBias + 0.05 * structuralBias;
  out[3] = 0.17 + 0.16 * deepBias + 0.05 * structuralBias;
  return normalizeWeights(out);
}

function roseRootLayerFractions(rootFraction, out = [0, 0, 0, 0]) {
  const deeper = clamp((rootFraction - 0.2) / 0.26);
  out[0] = 0.7 - 0.18 * deeper;
  out[1] = 0.22 + 0.08 * deeper;
  out[2] = 0.08 + 0.1 * deeper;
  out[3] = 0;
  return normalizeWeights(out);
}

function weightedRootStress(rootFractions, layerStress, substrateFactor) {
  let total = 0;
  for (let layer = 0; layer < rootFractions.length; layer += 1) {
    total += rootFractions[layer] * layerStress[layer];
  }
  return clamp(total * substrateFactor);
}

function plantWaterPotentialM(thresholds, demandMDay, vpdKpa) {
  const demandMmDay = Math.max(0, demandMDay) * 1000;
  const basePull = thresholds.optimalDryM * 0.12;
  const demandPull = thresholds.optimalDryM * 0.16 * Math.log1p(demandMmDay * 36);
  const atmospherePull = thresholds.optimalDryM * 0.075 * Math.max(0, vpdKpa);
  return -clamp(basePull + demandPull + atmospherePull, thresholds.wetStressM, thresholds.wiltingM * 0.92);
}

function rootPotentialGradientFactor(soilPotentialM, plantPotentialM, scaleM) {
  return clamp((soilPotentialM - plantPotentialM) / Math.max(1e-6, scaleM), 0, 2.4);
}

function distributeUptake(
  demand,
  rootFractions,
  layerStress,
  saturations,
  soilPotentialsM,
  plantPotentialM,
  potentialScaleM,
  out = [0, 0, 0, 0]
) {
  let total = 0;
  for (let layer = 0; layer < rootFractions.length; layer += 1) {
    const potentialFactor = rootPotentialGradientFactor(soilPotentialsM[layer], plantPotentialM, potentialScaleM);
    const weight = rootFractions[layer] * layerStress[layer] * (0.18 + 0.82 * clamp(saturations[layer])) * potentialFactor;
    out[layer] = Math.max(0, weight);
    total += out[layer];
  }
  if (total <= 1e-12) {
    for (let layer = 0; layer < rootFractions.length; layer += 1) {
      out[layer] = 0;
    }
    return out;
  }
  const scale = demand / total;
  for (let layer = 0; layer < rootFractions.length; layer += 1) {
    out[layer] *= scale;
  }
  return out;
}

function rootHydraulicSupply(
  rootFractions,
  layerStress,
  conductivities,
  saturations,
  soilPotentialsM,
  plantPotentialM,
  potentialScaleM,
  substrateFactor,
  multiplier,
  out = [0, 0, 0, 0]
) {
  for (let layer = 0; layer < rootFractions.length; layer += 1) {
    const k = Math.max(0, conductivities[layer] ?? 0);
    const potentialFactor = rootPotentialGradientFactor(soilPotentialsM[layer], plantPotentialM, potentialScaleM);
    const hydraulicConductance = 0.0038 + 0.32 * k;
    out[layer] =
      multiplier *
      substrateFactor *
      rootFractions[layer] *
      layerStress[layer] *
      potentialFactor *
      hydraulicConductance *
      (0.18 + 0.82 * clamp(saturations[layer]));
  }
  return out;
}

function limitUptakeByHydraulicSupply(uptake, supply) {
  for (let layer = 0; layer < uptake.length; layer += 1) {
    uptake[layer] = Math.min(Math.max(0, uptake[layer]), Math.max(0, supply[layer] ?? 0));
  }
  return uptake;
}

function rootHydraulicUptake4Into(
  out,
  demand,
  rootFractions,
  layerStress,
  conductivities,
  saturations,
  soilPotentialsM,
  plantPotentialM,
  potentialScaleM,
  substrateFactor,
  multiplier
) {
  let totalWeight = 0;
  let potential0 = (soilPotentialsM[0] - plantPotentialM) / Math.max(1e-6, potentialScaleM);
  let potential1 = (soilPotentialsM[1] - plantPotentialM) / Math.max(1e-6, potentialScaleM);
  let potential2 = (soilPotentialsM[2] - plantPotentialM) / Math.max(1e-6, potentialScaleM);
  let potential3 = (soilPotentialsM[3] - plantPotentialM) / Math.max(1e-6, potentialScaleM);
  potential0 = clamp(potential0, 0, 2.4);
  potential1 = clamp(potential1, 0, 2.4);
  potential2 = clamp(potential2, 0, 2.4);
  potential3 = clamp(potential3, 0, 2.4);
  const saturation0 = 0.18 + 0.82 * clamp(saturations[0]);
  const saturation1 = 0.18 + 0.82 * clamp(saturations[1]);
  const saturation2 = 0.18 + 0.82 * clamp(saturations[2]);
  const saturation3 = 0.18 + 0.82 * clamp(saturations[3]);
  const weight0 = Math.max(0, rootFractions[0] * layerStress[0] * saturation0 * potential0);
  const weight1 = Math.max(0, rootFractions[1] * layerStress[1] * saturation1 * potential1);
  const weight2 = Math.max(0, rootFractions[2] * layerStress[2] * saturation2 * potential2);
  const weight3 = Math.max(0, rootFractions[3] * layerStress[3] * saturation3 * potential3);
  totalWeight = weight0 + weight1 + weight2 + weight3;
  if (totalWeight <= 1e-12) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    return out;
  }

  const demandScale = demand / totalWeight;
  const supplyScale = multiplier * substrateFactor;
  const supply0 =
    supplyScale *
    rootFractions[0] *
    layerStress[0] *
    potential0 *
    (0.0038 + 0.32 * Math.max(0, conductivities[0])) *
    saturation0;
  const supply1 =
    supplyScale *
    rootFractions[1] *
    layerStress[1] *
    potential1 *
    (0.0038 + 0.32 * Math.max(0, conductivities[1])) *
    saturation1;
  const supply2 =
    supplyScale *
    rootFractions[2] *
    layerStress[2] *
    potential2 *
    (0.0038 + 0.32 * Math.max(0, conductivities[2])) *
    saturation2;
  const supply3 =
    supplyScale *
    rootFractions[3] *
    layerStress[3] *
    potential3 *
    (0.0038 + 0.32 * Math.max(0, conductivities[3])) *
    saturation3;
  out[0] = Math.min(weight0 * demandScale, Math.max(0, supply0));
  out[1] = Math.min(weight1 * demandScale, Math.max(0, supply1));
  out[2] = Math.min(weight2 * demandScale, Math.max(0, supply2));
  out[3] = Math.min(weight3 * demandScale, Math.max(0, supply3));
  return out;
}

function sumPositive(values) {
  let total = 0;
  for (const value of values) {
    total += Math.max(0, value);
  }
  return total;
}

const rootLayerSaturationsScratch = new Float32Array(4);
const rootLayerPotentialsScratch = new Float32Array(4);
const rootLayerConductivityScratch = new Float32Array(4);
const baobabRootFractionScratch = new Float32Array(4);
const roseRootFractionScratch = new Float32Array(4);
const baobabLayerStressScratch = new Float32Array(4);
const roseLayerStressScratch = new Float32Array(4);
const baobabSupplyScratch = new Float32Array(4);
const roseSupplyScratch = new Float32Array(4);
const baobabUptakeScratch = new Float32Array(4);
const roseUptakeScratch = new Float32Array(4);
const baobabAllocationScratch = { leaf: 0, stem: 0, root: 0 };
const roseAllocationScratch = { leaf: 0, flower: 0, root: 0 };
const baobabPhotoScratch = { gpp: 0, conductanceMps: 0, ci: 0 };
const rosePhotoScratch = { gpp: 0, conductanceMps: 0, ci: 0 };
const baobabStressFactorsScratch = { temp: 0, water: 0, vpd: 0, co2: 0, nutrient: 0, total: 0, lueGpp: 0 };
const roseStressFactorsScratch = { temp: 0, water: 0, vpd: 0, co2: 0, nutrient: 0, total: 0, lueGpp: 0 };
const aparScratch = { total: 0, baobab: 0, rose: 0 };
const canopyWaterFluxScratch = { throughfall: 0, evaporation: 0 };
const baobabLitterScratch = { fast: 0, slow: 0, total: 0 };
const roseLitterScratch = { fast: 0, slow: 0, total: 0 };
const PHOTOSYNTHESIS_PICARD_ITERATIONS = 2;

function hydraulicStressFromUptakeDemand(uptakeMDay, demandMDay, baselineStress) {
  if (demandMDay <= 1e-9) {
    return baselineStress;
  }
  const demandRatio = clamp(uptakeMDay / demandMDay);
  return clamp(Math.min(baselineStress, 0.08 + 0.92 * demandRatio));
}

function baobabStressMortality(stress, canopyLight, substrate, ashLoad = 0, wetness = 0.45) {
  const wetExcess = clamp((wetness - 0.68) / 0.22);
  return 0.00008 + 0.0011 * (1 - stress) ** 2 + 0.00028 * (1 - canopyLight) + 0.00016 * (1 - substrate.rootB) + 0.0065 * ashLoad + 0.014 * wetExcess * wetExcess;
}

function roseStressMortality(stress, canopyLight, substrate, ashLoad) {
  return ROSE_BACKGROUND_MORTALITY +
    0.029 * (1 - stress) ** 2 +
    0.0065 * (1 - canopyLight) ** 2 +
    0.00045 * (1 - substrate.rootR) +
    0.008 * ashLoad;
}

function ringMeanDailyInsolationFromHeight(height) {
  const ringHeight = clamp(height, -1, 1);
  const cosLatitude = Math.sqrt(Math.max(0, 1 - ringHeight * ringHeight));
  return clamp(cosLatitude / Math.PI, 0.035, 0.36);
}

function ringLatitudeTemperatureUnitFromHeight(height) {
  return 1 - 2 * Math.abs(clamp(height, -1, 1));
}

function diurnalTemperatureAnomaly(sunlight, meanInsolation, diurnalRangeC) {
  return (diurnalRangeC * 0.5) * ((sunlight - meanInsolation) / 0.5);
}

function earthMeanClimateC(model, i, wetness, cloudCooling) {
  const climate = earthClimateForCell(model.topology.cells[i]);
  const wetAnomaly = (0.5 - clamp(wetness)) * 0.8;
  return clamp(climate.meanTempC + wetAnomaly - cloudCooling * 0.55, -34, 34);
}

function earthDiurnalRangeC(model, i, wetness, cloudCooling, cover) {
  const climate = earthClimateForCell(model.topology.cells[i]);
  const damping = cloudCooling * 2.5 + clamp(cover) * 1.2 + clamp(wetness) * 0.8;
  return clamp(climate.diurnalRangeC - damping, 2.4, 27);
}

function asteroidMeanClimateC(model, i, cloudCooling) {
  const { state, topology } = model;
  const cell = topology.cells[i];
  const latitudeAnomaly =
    ringLatitudeTemperatureUnitFromHeight(cell?.height ?? 0) *
    clamp(model.params.asteroidLatitudeTempRangeC ?? 3, 0, 12);
  const terrainCooling = clamp(Math.max(0, state.elevation[i]) / 5200, 0, 1.6) * 5.4;
  return clamp((model.params.asteroidMeanTempC ?? 16) + latitudeAnomaly - terrainCooling - cloudCooling * 1.3, -18, 32);
}

function asteroidDiurnalRangeC(model, i, wetness, cloudCooling, cover) {
  const { state } = model;
  const terrainBoost = clamp(Math.max(0, state.elevation[i]) / 4200, 0, 1.4) * 2.8;
  const damping = clamp(wetness) * 7.5 + cloudCooling * 5.5 + clamp(cover) * 4.0;
  return clamp((model.params.asteroidDiurnalRangeC ?? 16) + terrainBoost - damping, 3, 28);
}

function updateCanopyEnvironment(model, i, wetness, cover, laiTotal) {
  const { state } = model;
  const sunlight = clamp(state.sunlight[i]);
  const cloudCooling = clamp(state.R[i] * 900);
  const meanInsolation = ringMeanDailyInsolationFromHeight(model.topology.cells[i]?.height ?? 0);
  const meanClimate =
    model.planetPreset === "earth"
      ? earthMeanClimateC(model, i, wetness, cloudCooling)
      : asteroidMeanClimateC(model, i, cloudCooling);
  const diurnalRange =
    model.planetPreset === "earth"
      ? earthDiurnalRangeC(model, i, wetness, cloudCooling, cover)
      : asteroidDiurnalRangeC(model, i, wetness, cloudCooling, cover);
  const surfaceWaterCooling = clamp(state.H[i] * 12) * (model.planetPreset === "earth" ? 1.6 : 1.1);
  const tempC = clamp(meanClimate + diurnalTemperatureAnomaly(sunlight, meanInsolation, diurnalRange) - surfaceWaterCooling, -18, 48);
  const saturatedVaporPressure = saturationVaporPressureKpa(tempC);
  const relativeHumidity = clamp(0.22 + 0.62 * wetness + 0.08 * clamp(state.H[i] * 12) + 0.04 * Math.min(1, laiTotal / 4.5));
  state.surfaceTempC[i] = tempC;
  state.vpdKpa[i] = Math.max(0, saturatedVaporPressure * (1 - relativeHumidity));
  state.par[i] =
    CLEAR_SKY_PAR_MOL_M2_DAY *
    sunlight *
    DIURNAL_SUNLIGHT_TO_DAILY_PAR_SCALE *
    (0.74 + 0.26 * Math.exp(-0.18 * laiTotal));
}

function updateCanopyEnvironmentFields(model) {
  if (
    runWasmCanopyEnvironment(model, {
      asteroidMeanTempC: model.params.asteroidMeanTempC ?? 16,
      asteroidDiurnalRangeC: model.params.asteroidDiurnalRangeC ?? 16,
      asteroidLatitudeTempRangeC: model.params.asteroidLatitudeTempRangeC ?? 3
    })
  ) {
    return true;
  }
  updateCanopyEnvironmentFieldsFromInputs(model);
  return false;
}

function updateCanopyEnvironmentFieldsFromInputs(model) {
  const { state, size } = model;
  const activeCellIds = model.activeCellIds;
  const cellCount = activeCellIds ? activeCellIds.length : size;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const topSat = clamp(state.W0[i] / state.soilCap[i]);
    const groundwaterSat = clamp(state.W1[i] / state.groundwaterCap[i]);
    const wetness = clamp(0.62 * topSat + 0.38 * groundwaterSat);
    const cover = clamp(state.vegetationCover[i]);
    const laiTotal = state.laiBaobab[i] + state.laiRose[i];
    updateCanopyEnvironment(model, i, wetness, cover, laiTotal);
  }
}

function saturationVaporPressureKpa(tempC) {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

function temperatureResponse(tempC, optimumC, minC, maxC) {
  if (tempC <= minC || tempC >= maxC) {
    return 0;
  }
  const left = clamp((tempC - minC) / Math.max(1e-6, optimumC - minC));
  const right = clamp((maxC - tempC) / Math.max(1e-6, maxC - optimumC));
  return Math.sqrt(left * right);
}

function temperatureLookupIndex(tempC) {
  if (tempC <= PHOTOSYNTHESIS_TEMP_MIN_C) {
    return 0;
  }
  if (tempC >= PHOTOSYNTHESIS_TEMP_MAX_C) {
    return PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS - 1;
  }
  return (tempC - PHOTOSYNTHESIS_TEMP_MIN_C) * PHOTOSYNTHESIS_TEMP_LOOKUP_SCALE;
}

function lookupTemperatureTable(values, tempC) {
  const scaled = temperatureLookupIndex(tempC);
  const index = scaled | 0;
  if (index >= PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS - 1) {
    return values[PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS - 1];
  }
  const fraction = scaled - index;
  return values[index] + (values[index + 1] - values[index]) * fraction;
}

function buildPftTempResponseLookup(pft) {
  const values = new Float32Array(PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS);
  const stepC = (PHOTOSYNTHESIS_TEMP_MAX_C - PHOTOSYNTHESIS_TEMP_MIN_C) / (PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS - 1);
  for (let index = 0; index < PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS; index += 1) {
    const tempC = PHOTOSYNTHESIS_TEMP_MIN_C + index * stepC;
    values[index] = temperatureResponse(tempC, pft.tempOptC, pft.tempMinC, pft.tempMaxC);
  }
  return values;
}

function pftTemperatureResponse(pft, tempC) {
  let lookup = pftTempResponseCache.get(pft);
  if (!lookup) {
    lookup = buildPftTempResponseLookup(pft);
    pftTempResponseCache.set(pft, lookup);
  }
  return lookupTemperatureTable(lookup, tempC);
}

function buildQ10TempLookup(q10) {
  const values = new Float32Array(PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS);
  const stepC = (PHOTOSYNTHESIS_TEMP_MAX_C - PHOTOSYNTHESIS_TEMP_MIN_C) / (PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS - 1);
  for (let index = 0; index < PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS; index += 1) {
    const tempC = PHOTOSYNTHESIS_TEMP_MIN_C + index * stepC;
    values[index] = q10 ** ((tempC - 20) / 10);
  }
  return values;
}

function q10TemperatureFactor(q10, tempC) {
  let lookup = q10TempLookupCache.get(q10);
  if (!lookup) {
    lookup = buildQ10TempLookup(q10);
    q10TempLookupCache.set(q10, lookup);
  }
  return lookupTemperatureTable(lookup, tempC);
}

function warmVegetationLookups() {
  photosynthesisTempLookupFor(BAOBAB_PHOTOSYNTHESIS);
  photosynthesisTempLookupFor(ROSE_PHOTOSYNTHESIS);
  pftTemperatureResponse(PFT_TRAITS.baobab, 20);
  pftTemperatureResponse(PFT_TRAITS.rose, 20);
  q10TemperatureFactor(PFT_TRAITS.baobab.carbon.q10, 20);
  q10TemperatureFactor(PFT_TRAITS.rose.carbon.q10, 20);
}

function vpdResponse(vpdKpa, sensitivityKpa, shape = 1.4) {
  return 1 / (1 + (Math.max(0, vpdKpa) / sensitivityKpa) ** shape);
}

function co2Response(atmosphericCo2Ppm, halfSaturationPpm) {
  const ca = clamp(atmosphericCo2Ppm, 120, 1200);
  const response = ca / (ca + Math.max(1, halfSaturationPpm));
  const reference = 900 / (900 + Math.max(1, halfSaturationPpm));
  return clamp(response / reference);
}

function photosynthesisLimitationDiagnosticsInto(
  out,
  pft,
  tempC,
  waterStress,
  vpdKpa,
  atmosphericCo2Ppm,
  nutrientStressValue,
  aparMolM2Day,
  multiplier = 1
) {
  const temp = pftTemperatureResponse(pft, tempC);
  const water = clamp(waterStress);
  const vpd = vpdResponse(vpdKpa, pft.vpdSensitivityKpa);
  const co2 = co2Response(atmosphericCo2Ppm, pft.co2HalfSaturationPpm);
  const nutrient = clamp(nutrientStressValue);
  const total = temp * water * vpd * co2 * nutrient;
  out.temp = temp;
  out.water = water;
  out.vpd = vpd;
  out.co2 = co2;
  out.nutrient = nutrient;
  out.total = total;
  out.lueGpp =
    Math.max(0, aparMolM2Day) *
    pft.lightUseEfficiencyKgCPerMol *
    clamp(total) *
    Math.max(0, multiplier);
  return out;
}

function potentialEvapotranspirationM(state, i, cover) {
  const tempC = state.surfaceTempC[i];
  const vpd = state.vpdKpa[i];
  const par = state.par[i];
  const wind = REFERENCE_WIND_SPEED_M_S;
  const netRadiation = netRadiationMjM2Day(par, cover, state.R[i]);
  const referenceAerodynamic = REFERENCE_AERODYNAMIC_CONDUCTANCE_M_S;
  const referenceSurface = referenceAerodynamic / Math.max(0.05, 0.34 * wind);
  return penmanMonteithDemandM(tempC, vpd, netRadiation, referenceSurface, referenceAerodynamic);
}

function penmanMonteithDemandM(tempC, vpdKpa, netRadiationMjM2DayValue, surfaceConductanceMps, aerodynamicConductanceMps) {
  if (netRadiationMjM2DayValue <= 0 && vpdKpa <= 0) {
    return 0;
  }

  const delta = saturationVaporPressureSlopeKpaC(tempC);
  const aerodynamicRatio = clamp(aerodynamicConductanceMps / REFERENCE_AERODYNAMIC_CONDUCTANCE_M_S, 0.15, 3.2);
  const wind = REFERENCE_WIND_SPEED_M_S * aerodynamicRatio;
  const resistanceRatio =
    surfaceConductanceMps > 1e-7
      ? clamp(aerodynamicConductanceMps / surfaceConductanceMps, 0.02, 180)
      : 180;
  const numerator =
    0.408 * delta * netRadiationMjM2DayValue +
    PSYCHROMETRIC_CONSTANT_KPA_C * (900 / (tempC + 273.15)) * wind * Math.max(0, vpdKpa);
  const denominator = delta + PSYCHROMETRIC_CONSTANT_KPA_C * (1 + resistanceRatio);
  return Math.max(0, numerator / Math.max(1e-6, denominator)) / 1000;
}

function aerodynamicConductanceMps(lai) {
  return clamp(
    REFERENCE_AERODYNAMIC_CONDUCTANCE_M_S * (0.72 + 0.18 * REFERENCE_WIND_SPEED_M_S + 0.12 * Math.sqrt(Math.max(0, lai))),
    0.0035,
    0.018
  );
}

function saturationVaporPressureSlopeKpaC(tempC) {
  const es = saturationVaporPressureKpa(tempC);
  return (4098 * es) / ((tempC + 237.3) ** 2);
}

function netRadiationMjM2Day(parMolM2Day, cover, rainRateMDay) {
  const shortwave = (Math.max(0, parMolM2Day) * PAR_MJ_PER_MOL) / PAR_FRACTION_OF_SHORTWAVE;
  const albedo = clamp(0.22 - 0.06 * cover + 0.04 * clamp(rainRateMDay * 700), 0.12, 0.31);
  const netShortwave = (1 - albedo) * shortwave;
  const cloudLongwaveReduction = 0.04 + 0.12 * clamp(rainRateMDay * 650);
  return Math.max(0, netShortwave * (0.72 - cloudLongwaveReduction));
}

function buildPhotosynthesisTempLookup(species) {
  const vcmax = new Float32Array(PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS);
  const jmax = new Float32Array(PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS);
  const rd = new Float32Array(PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS);
  const gammaStar = new Float32Array(PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS);
  const kc = new Float32Array(PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS);
  const ko = new Float32Array(PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS);
  const stepC = (PHOTOSYNTHESIS_TEMP_MAX_C - PHOTOSYNTHESIS_TEMP_MIN_C) / (PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS - 1);
  for (let index = 0; index < PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS; index += 1) {
    const tempK = PHOTOSYNTHESIS_TEMP_MIN_C + index * stepC + 273.15;
    vcmax[index] = arrheniusRate(species.vcmax25, 65330, tempK);
    jmax[index] = peakedArrheniusRate(species.jmax25, 43540, 200000, 650, tempK);
    rd[index] = arrheniusRate(species.rd25, 46390, tempK);
    gammaStar[index] = arrheniusRate(42.75, 37830, tempK);
    kc[index] = arrheniusRate(404.9, 79430, tempK);
    ko[index] = arrheniusRate(278400, 36380, tempK);
  }
  return { vcmax, jmax, rd, gammaStar, kc, ko };
}

function photosynthesisTempLookupFor(species) {
  let lookup = photosynthesisTempLookupCache.get(species);
  if (!lookup) {
    lookup = buildPhotosynthesisTempLookup(species);
    photosynthesisTempLookupCache.set(species, lookup);
  }
  return lookup;
}

function respirationQ10LookupFor(q10) {
  let lookup = respirationQ10LookupCache.get(q10);
  if (!lookup) {
    lookup = new Float32Array(PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS);
    for (let index = 0; index < PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS; index += 1) {
      const tempC = PHOTOSYNTHESIS_TEMP_MIN_C + index / PHOTOSYNTHESIS_TEMP_LOOKUP_SCALE;
      lookup[index] = Math.pow(q10, (tempC - 20) / 10);
    }
    respirationQ10LookupCache.set(q10, lookup);
  }
  return lookup;
}

function samplePhotosynthesisTemperature(out, species, tempC) {
  const lookup = photosynthesisTempLookupFor(species);
  const scaled = temperatureLookupIndex(tempC);
  const index = scaled | 0;
  if (index >= PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS - 1) {
    const last = PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS - 1;
    out.vcmax = lookup.vcmax[last];
    out.jmax = lookup.jmax[last];
    out.rd = lookup.rd[last];
    out.gammaStar = lookup.gammaStar[last];
    out.kc = lookup.kc[last];
    out.ko = lookup.ko[last];
    return out;
  }

  const fraction = scaled - index;
  out.vcmax = lookup.vcmax[index] + (lookup.vcmax[index + 1] - lookup.vcmax[index]) * fraction;
  out.jmax = lookup.jmax[index] + (lookup.jmax[index + 1] - lookup.jmax[index]) * fraction;
  out.rd = lookup.rd[index] + (lookup.rd[index + 1] - lookup.rd[index]) * fraction;
  out.gammaStar = lookup.gammaStar[index] + (lookup.gammaStar[index + 1] - lookup.gammaStar[index]) * fraction;
  out.kc = lookup.kc[index] + (lookup.kc[index + 1] - lookup.kc[index]) * fraction;
  out.ko = lookup.ko[index] + (lookup.ko[index + 1] - lookup.ko[index]) * fraction;
  return out;
}

function farquharAssimilationUmolM2S(par, species, lai, tempC, ci, aparMolM2Day = null) {
  const availablePar = aparMolM2Day ?? par;
  if (availablePar <= 0 || lai <= 0) {
    return 0;
  }

  const temp = samplePhotosynthesisTemperature(farquharTempScratch, species, tempC);
  const vcmax = temp.vcmax;
  const jmax = temp.jmax;
  const gammaStar = temp.gammaStar;
  const kc = temp.kc;
  const ko = temp.ko;
  const canopyAbsorption = 1 - Math.exp(-species.extinction * lai);
  const absorbedParMolM2Day = aparMolM2Day ?? Math.max(0, par) * canopyAbsorption;
  const parUmolM2S = (absorbedParMolM2Day * 1_000_000) / SECONDS_PER_ASSIMILATION_DAY;
  const absorbedPar = parUmolM2S * species.quantumYield;
  const electronTerm = absorbedPar + jmax;
  const discriminant = Math.max(0, electronTerm * electronTerm - 4 * species.curvature * absorbedPar * jmax);
  const electronTransport = (electronTerm - Math.sqrt(discriminant)) / (2 * species.curvature);
  const rubiscoLimited = vcmax * Math.max(0, ci - gammaStar) / (ci + kc * (1 + ATMOSPHERIC_O2_UMOL_MOL / ko));
  const electronLimited = electronTransport * Math.max(0, ci - gammaStar) / (4 * (ci + 2 * gammaStar));
  return Math.max(0, Math.min(rubiscoLimited, electronLimited));
}

function canopyPhotosynthesisInto(
  out,
  par,
  species,
  lai,
  tempC,
  waterStress,
  vpdKpa,
  nutrient,
  multiplier = 1,
  aparMolM2Day = null,
  atmosphericCo2 = ATMOSPHERIC_CO2_UMOL_MOL,
  initialCi = null
) {
  return canopyPhotosynthesisWithTemperatureInto(
    out,
    par,
    species,
    lai,
    samplePhotosynthesisTemperature(farquharTempScratch, species, tempC),
    waterStress,
    vpdKpa,
    nutrient,
    multiplier,
    aparMolM2Day,
    atmosphericCo2,
    initialCi
  );
}

function canopyPhotosynthesisWithTemperatureInto(
  out,
  par,
  species,
  lai,
  temp,
  waterStress,
  vpdKpa,
  nutrient,
  multiplier = 1,
  aparMolM2Day = null,
  atmosphericCo2 = ATMOSPHERIC_CO2_UMOL_MOL,
  initialCi = null
) {
  const ca = clamp(atmosphericCo2, 180, 1200);
  const ciLower = species.ciMin * ca;
  const ciUpper = species.ciMax * ca;
  const availablePar = aparMolM2Day ?? par;
  if (availablePar <= 0 || lai <= 0 || waterStress <= 0 || nutrient <= 0) {
    out.gpp = 0;
    out.conductanceMps = 0;
    out.ci = Number.isFinite(initialCi) && initialCi >= ciLower && initialCi <= ciUpper ? initialCi : ciLower;
    return out;
  }

  const hydraulicStress = clamp(waterStress);
  const nutrientStressValue = clamp(nutrient);
  const biochemicalStress = hydraulicStress * nutrientStressValue * Math.max(0, multiplier);
  const sqrtD = Math.sqrt(Math.max(0.05, vpdKpa));
  const heuristicCi = ca * (species.ciMin + (species.ciMax - species.ciMin) * hydraulicStress / (1 + 0.18 * Math.max(0, vpdKpa)));
  let ci = Number.isFinite(initialCi) && initialCi >= ciLower && initialCi <= ciUpper ? initialCi : heuristicCi;
  let assimilation = 0;
  let conductanceMps = 0;
  const absorbedParMolM2Day =
    aparMolM2Day ?? Math.max(0, par) * (1 - Math.exp(-species.extinction * lai));
  const parUmolM2S = (absorbedParMolM2Day * 1_000_000) / SECONDS_PER_ASSIMILATION_DAY;
  const absorbedPar = parUmolM2S * species.quantumYield;
  const electronTerm = absorbedPar + temp.jmax;
  const discriminant = Math.max(0, electronTerm * electronTerm - 4 * species.curvature * absorbedPar * temp.jmax);
  const electronTransport = (electronTerm - Math.sqrt(discriminant)) / (2 * species.curvature);
  const rubiscoDenomConstant = temp.kc * (1 + ATMOSPHERIC_O2_UMOL_MOL / temp.ko);

  for (let iteration = 0; iteration < PHOTOSYNTHESIS_PICARD_ITERATIONS; iteration += 1) {
    const positiveCiDelta = Math.max(0, ci - temp.gammaStar);
    const rubiscoLimited = temp.vcmax * positiveCiDelta / (ci + rubiscoDenomConstant);
    const electronLimited = electronTransport * positiveCiDelta / (4 * (ci + 2 * temp.gammaStar));
    assimilation = Math.max(0, Math.min(rubiscoLimited, electronLimited));
    const effectiveAssimilation = Math.max(0, assimilation * biochemicalStress);
    const stomatalMol =
      (species.g0Mol + (1 + species.g1 / sqrtD) * effectiveAssimilation / ca) *
      hydraulicStress *
      (0.22 + 0.78 * nutrientStressValue);
    conductanceMps = clamp(stomatalMol * MOLAR_VOLUME_AIR_M3_MOL, 0, species.maxConductanceMps);
    const conductanceCo2Mol = Math.max(1e-5, (conductanceMps / MOLAR_VOLUME_AIR_M3_MOL) / 1.6);
    ci = clamp(ca - effectiveAssimilation / conductanceCo2Mol, ciLower, ciUpper);
  }

  const positiveCiDelta = Math.max(0, ci - temp.gammaStar);
  const rubiscoLimited = temp.vcmax * positiveCiDelta / (ci + rubiscoDenomConstant);
  const electronLimited = electronTransport * positiveCiDelta / (4 * (ci + 2 * temp.gammaStar));
  const finalAssimilation = Math.max(0, Math.min(rubiscoLimited, electronLimited));
  out.gpp = finalAssimilation * SECONDS_PER_ASSIMILATION_DAY * 1e-6 * 0.012 * biochemicalStress;
  out.conductanceMps = conductanceMps;
  out.ci = ci;
  return out;
}

function photosynthesisConstantsForWasm(model) {
  const baobabLookup = photosynthesisTempLookupFor(BAOBAB_PHOTOSYNTHESIS);
  const roseLookup = photosynthesisTempLookupFor(ROSE_PHOTOSYNTHESIS);
  return {
    lookupSteps: PHOTOSYNTHESIS_TEMP_LOOKUP_STEPS,
    tempMinC: PHOTOSYNTHESIS_TEMP_MIN_C,
    tempLookupScale: PHOTOSYNTHESIS_TEMP_LOOKUP_SCALE,
    atmosphericCo2Ppm: model.params.atmosphericCo2Ppm ?? ATMOSPHERIC_CO2_UMOL_MOL,
    baobabMultiplier: model.params.baobabGrowth ?? 1,
    roseMultiplier: model.params.roseGrowth ?? 1,
    baobab: BAOBAB_PHOTOSYNTHESIS,
    rose: ROSE_PHOTOSYNTHESIS,
    baobabVcmax: baobabLookup.vcmax,
    baobabJmax: baobabLookup.jmax,
    baobabRd: baobabLookup.rd,
    baobabGammaStar: baobabLookup.gammaStar,
    baobabKc: baobabLookup.kc,
    baobabKo: baobabLookup.ko,
    roseVcmax: roseLookup.vcmax,
    roseJmax: roseLookup.jmax,
    roseRd: roseLookup.rd,
    roseGammaStar: roseLookup.gammaStar,
    roseKc: roseLookup.kc,
    roseKo: roseLookup.ko,
    baobabRespirationQ10: respirationQ10LookupFor(1.82),
    roseRespirationQ10: respirationQ10LookupFor(2.05)
  };
}

function photosynthesisInputConstantsForWasm(model) {
  return {
    lookupSteps: HYDRAULIC_LOOKUP_STEPS,
    rootDepth: model.params.rootDepth ?? DEFAULT_PARAMS.rootDepth,
    storage: model.params.storage ?? DEFAULT_PARAMS.storage,
    ...hydraulicLookupTablesForWasm()
  };
}

function plantWaterFluxConstantsForWasm(model) {
  return {
    ...photosynthesisConstantsForWasm(model),
    hydraulicLookupSteps: HYDRAULIC_LOOKUP_STEPS,
    rootDepth: model.params.rootDepth ?? DEFAULT_PARAMS.rootDepth,
    evaporation: model.params.evaporation ?? DEFAULT_PARAMS.evaporation,
    ...hydraulicLookupTablesForWasm()
  };
}

function updatePhotosynthesisFromInputs(model) {
  const { state, size } = model;
  const activeCellIds = model.activeCellIds;
  const cellCount = activeCellIds ? activeCellIds.length : size;
  const atmosphericCo2 = model.params.atmosphericCo2Ppm ?? ATMOSPHERIC_CO2_UMOL_MOL;
  const baobabMultiplier = model.params.baobabGrowth ?? 1;
  const roseMultiplier = model.params.roseGrowth ?? 1;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const tempC = state.surfaceTempC[i];
    const baobabPhoto = canopyPhotosynthesisWithTemperatureInto(
      baobabPhotoScratch,
      state.par[i],
      BAOBAB_PHOTOSYNTHESIS,
      state.laiBaobab[i],
      samplePhotosynthesisTemperature(baobabFarquharTempScratch, BAOBAB_PHOTOSYNTHESIS, tempC),
      state.photoWaterStressBaobab[i],
      state.vpdKpa[i],
      state.photoNutrientBaobab[i],
      baobabMultiplier,
      state.aparBaobab[i],
      atmosphericCo2,
      state.ciBaobab[i]
    );
    const rosePhoto = canopyPhotosynthesisWithTemperatureInto(
      rosePhotoScratch,
      state.par[i],
      ROSE_PHOTOSYNTHESIS,
      state.laiRose[i],
      samplePhotosynthesisTemperature(roseFarquharTempScratch, ROSE_PHOTOSYNTHESIS, tempC),
      state.photoWaterStressRose[i],
      state.vpdKpa[i],
      state.photoNutrientRose[i],
      roseMultiplier,
      state.aparRose[i],
      atmosphericCo2,
      state.ciRose[i]
    );
    state.gppBaobab[i] = baobabPhoto.gpp;
    state.gppRose[i] = rosePhoto.gpp;
    state.stomatalConductanceBaobabMps[i] = baobabPhoto.conductanceMps;
    state.stomatalConductanceRoseMps[i] = rosePhoto.conductanceMps;
    state.ciBaobab[i] = baobabPhoto.ci;
    state.ciRose[i] = rosePhoto.ci;
  }
}

function updatePhotosynthesisBatch(model) {
  if (runWasmPhotosynthesis(model, photosynthesisConstantsForWasm(model))) {
    return true;
  }
  updatePhotosynthesisFromInputs(model);
  return false;
}

function prepareInitialPhotosynthesisInputsBatch(model) {
  if (runWasmPreparePhotosynthesisInputs(model, photosynthesisInputConstantsForWasm(model))) {
    return true;
  }
  prepareInitialPhotosynthesisInputs(model);
  return false;
}

function prepareInitialPhotosynthesisInputs(model) {
  const { state, params, size } = model;
  const activeCellIds = model.activeCellIds;
  const cellCount = activeCellIds ? activeCellIds.length : size;
  const size2 = size * 2;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const substrateIndex = state.substrate[i];
    const sub = SUBSTRATES[substrateIndex];
    const layer0Index = i;
    const layer1Index = size + i;
    const layer2Index = size2 + i;
    const s0 = clamp(state.soilWater[layer0Index] / state.soilCap[layer0Index]);
    const s1 = clamp(state.soilWater[layer1Index] / state.soilCap[layer1Index]);
    const s2 = clamp(state.soilWater[layer2Index] / state.soilCap[layer2Index]);
    const gwSat = clamp(state.groundwaterStorage[i] / state.groundwaterCap[i]);
    const baobabMass = state.baobabLeaf[i] + state.baobabStem[i] + state.baobabRoot[i];
    const roseMass = state.roseLeaf[i] + state.roseFlower[i] + state.roseRoot[i];
    const baobabRootFrac = baobabMass > 0 ? state.baobabRoot[i] / baobabMass : 0.42;
    const roseRootFrac = roseMass > 0 ? state.roseRoot[i] / roseMass : 0.24;
    const psi0 = matricPotentialBySubstrateIndex(substrateIndex, s0);
    const psi1 = matricPotentialBySubstrateIndex(substrateIndex, s1);
    const psi2 = matricPotentialBySubstrateIndex(substrateIndex, s2);
    const groundwaterRootStress = clamp(0.18 + 0.82 * gwSat);
    baobabLayerStressScratch[0] = rootWaterStressFromPsi(psi0, BAOBAB_ROOT_WATER);
    baobabLayerStressScratch[1] = rootWaterStressFromPsi(psi1, BAOBAB_ROOT_WATER);
    baobabLayerStressScratch[2] = rootWaterStressFromPsi(psi2, BAOBAB_ROOT_WATER);
    baobabLayerStressScratch[3] = groundwaterRootStress;
    roseLayerStressScratch[0] = rootWaterStressFromPsi(psi0, ROSE_ROOT_WATER);
    roseLayerStressScratch[1] = rootWaterStressFromPsi(psi1, ROSE_ROOT_WATER);
    roseLayerStressScratch[2] = rootWaterStressFromPsi(psi2, ROSE_ROOT_WATER);
    roseLayerStressScratch[3] = rootWaterStressFromPsi(0, ROSE_ROOT_WATER);
    const baobabRootFractions = baobabRootLayerFractions(params.rootDepth, baobabRootFrac, baobabRootFractionScratch);
    const roseRootFractions = roseRootLayerFractions(roseRootFrac, roseRootFractionScratch);
    const rootWaterOnly = weightedRootStress(baobabRootFractions, baobabLayerStressScratch, sub.rootB);
    const roseRootWater = weightedRootStress(roseRootFractions, roseLayerStressScratch, sub.rootR);
    const storeCap = baobabStoreCapacity(params, state.baobabStem[i], state.baobabRoot[i]);
    const storeNorm = storeCap > 0 ? clamp(state.baobabStore[i] / storeCap) : 0;
    const surfaceWater = state.H[i];
    const roseSoil = state.roseFertility[i];
    const nutrientB = nutrientStress(state.soilMineralN[i], sub.nutrientB);
    const roseSiteNutrient = sub.nutrientR * clamp(0.45 + 0.55 * roseSoil, 0.32, 1.45);
    const nutrientR = nutrientStress(state.soilMineralN[i], roseSiteNutrient);
    const stressB = clamp(0.06 + 0.78 * rootWaterOnly + 0.22 * storeNorm);
    const stressR = roseWaterStressWithAeration(roseRootWater, roseSoil, surfaceWater, s0);
    const laiB = state.laiBaobab[i];
    const laiR = state.laiRose[i];
    const laiTotal = laiB + laiR;
    let aparTotal = 0;
    let aparBaobab = 0;
    let aparRose = 0;
    if (state.par[i] > 0 && laiTotal > 1e-9) {
      aparTotal = state.par[i] * state.vegetationCover[i];
      aparBaobab = aparTotal * laiB / laiTotal;
      aparRose = aparTotal * laiR / laiTotal;
    }
    state.aparTotal[i] = aparTotal;
    state.aparBaobab[i] = aparBaobab;
    state.aparRose[i] = aparRose;
    state.photoWaterStressBaobab[i] = stressB;
    state.photoWaterStressRose[i] = stressR;
    state.photoNutrientBaobab[i] = nutrientB;
    state.photoNutrientRose[i] = nutrientR;
  }
}

function roseRootAerationFactor(surfaceWater, topSaturation) {
  const airFilledPore = clamp(1 - topSaturation);
  const airFactor = clamp((airFilledPore - 0.04) / 0.08);
  const gasDiffusionFactor = airFactor * airFactor * (3 - 2 * airFactor);
  const surfaceFilmFactor = 1 / (1 + Math.max(0, surfaceWater) / 0.0035);
  return clamp(gasDiffusionFactor * surfaceFilmFactor);
}

function roseWaterStressWithAeration(rootWater, roseSoil, surfaceWater, topSaturation) {
  const pondSupport = clamp(surfaceWater * 10);
  const baseStress = clamp(rootWater * (0.84 + roseSoil * 0.1) + 0.1 * pondSupport - 0.015);
  const oxygenFactor = 0.18 + 0.82 * roseRootAerationFactor(surfaceWater, topSaturation);
  return clamp(baseStress * oxygenFactor);
}

function arrheniusRate(value25, activationEnergy, tempK) {
  return value25 * Math.exp((activationEnergy * (tempK - 298.15)) / (298.15 * GAS_CONSTANT_J_MOL_K * tempK));
}

function peakedArrheniusRate(value25, activationEnergy, deactivationEnergy, entropy, tempK) {
  const arrhenius = arrheniusRate(value25, activationEnergy, tempK);
  const numerator = 1 + Math.exp((298.15 * entropy - deactivationEnergy) / (GAS_CONSTANT_J_MOL_K * 298.15));
  const denominator = 1 + Math.exp((tempK * entropy - deactivationEnergy) / (GAS_CONSTANT_J_MOL_K * tempK));
  return arrhenius * numerator / denominator;
}

function soilEvaporationDemand(state, i, netRadiation, cover, wetness, substrate, evapFactor) {
  if (evapFactor <= 0) {
    return 0;
  }
  const bareFraction = Math.exp(-2.35 * cover);
  const surfaceWetness = clamp(wetness * 1.35 + state.H[i] * 18);
  const surfaceConductance = 0.00012 + 0.0062 * surfaceWetness * bareFraction * substrate.evap * evapFactor;
  return penmanMonteithDemandM(
    state.surfaceTempC[i],
    state.vpdKpa[i],
    netRadiation * bareFraction,
    surfaceConductance,
    aerodynamicConductanceMps(0)
  );
}

function canopyTranspirationDemand(state, i, netRadiation, lai, stomatalConductanceMps, speciesFactor) {
  if (lai <= 0 || stomatalConductanceMps <= 0) {
    return 0;
  }
  const activeCanopy = 1 - Math.exp(-0.55 * lai);
  return (
    speciesFactor *
    penmanMonteithDemandM(
      state.surfaceTempC[i],
      state.vpdKpa[i],
      netRadiation * activeCanopy,
      stomatalConductanceMps,
      aerodynamicConductanceMps(lai)
    )
  );
}

function canopyWaterCapacity(laiTotal) {
  return 0.00018 + 0.00082 * (1 - Math.exp(-0.52 * Math.max(0, laiTotal))) * Math.max(0, laiTotal);
}

function canopyInterceptionFluxInto(out, state, i, rain, laiTotal, et0) {
  const capacity = canopyWaterCapacity(laiTotal);
  if (capacity <= 0 || laiTotal <= 0) {
    state.canopyWaterN[i] = 0;
    state.canopyEvapM[i] = 0;
    out.throughfall = rain;
    out.evaporation = 0;
    return out;
  }

  const interceptionFraction = 1 - Math.exp(-0.42 * laiTotal);
  const maxCapture = Math.max(0, capacity - state.canopyWater[i]) / MODEL_DT_DAYS;
  const capture = Math.min(Math.max(0, rain * interceptionFraction), maxCapture);
  const availableCanopyWater = state.canopyWater[i] / MODEL_DT_DAYS + capture;
  const evaporation = Math.min(
    availableCanopyWater,
    et0 * (0.32 + 0.68 * interceptionFraction)
  );
  state.canopyWaterN[i] = clamp(
    state.canopyWater[i] + MODEL_DT_DAYS * (capture - evaporation),
    0,
    capacity
  );
  state.canopyEvapM[i] = evaporation;
  out.throughfall = Math.max(0, rain - capture);
  out.evaporation = evaporation;
  return out;
}

function baobabSeedProduction(stemCarbon, leafCarbon, stress, tempStress) {
  const maturity = clamp((stemCarbon - 0.08) / 0.55);
  return 0.0048 * maturity * (0.35 + 0.65 * stress) * (0.25 + 0.75 * tempStress) * (0.45 + leafCarbon);
}

function roseSeedProduction(adultCarbon, flowerCarbon, stress, tempStress, roseSoil, light) {
  const adult = Math.max(0, adultCarbon);
  if (adult <= 0) {
    return 0;
  }
  const maturity = adult / (adult + ROSE_SEED_MATURITY_C);
  const flowering = clamp((flowerCarbon + 0.12 * adult) / 0.34);
  const lightStress = clamp(light / 0.32);
  return (
    ROSE_SEED_PRODUCTION_COEFF *
    adult *
    maturity *
    (0.25 + 0.75 * flowering) *
    (0.25 + 0.75 * stress) *
    (0.25 + 0.75 * tempStress) *
    clamp(0.2 + 0.8 * lightStress) *
    clamp(roseSoil * 0.7)
  );
}

function roseSeedProductionFromCarbonSurplus(adultCarbon, flowerCarbon, stress, tempStress, roseSoil, light, carbonSurplus) {
  const adult = Math.max(0, adultCarbon);
  const surplus = Math.max(0, carbonSurplus);
  if (adult <= 0 || surplus <= 0) {
    return 0;
  }
  const maturity = adult / (adult + ROSE_SEED_MATURITY_C);
  const flowering = clamp((flowerCarbon + 0.12 * adult) / 0.34);
  const environment =
    (0.25 + 0.75 * clamp(stress)) *
    (0.25 + 0.75 * clamp(tempStress)) *
    clamp(0.2 + 0.8 * clamp(light / 0.32)) *
    clamp(roseSoil * 0.7);
  const reproductiveAllocation =
    0.38 *
    maturity *
    (0.18 + 0.82 * flowering) *
    environment;
  return Math.min(
    roseSeedProduction(adult, flowerCarbon, stress, tempStress, roseSoil, light),
    surplus * reproductiveAllocation
  );
}

function seedReadinessProgress(wetness, tempC, species) {
  const water =
    species === "baobab"
      ? clamp((wetness - 0.16) / 0.36) * (1 - 0.9 * clamp((wetness - 0.64) / 0.28))
      : clamp((wetness - 0.26) / 0.38);
  const temp =
    species === "baobab"
      ? temperatureResponse(tempC, 31, 7, 46)
      : temperatureResponse(tempC, 23, 4, 35);
  return water * temp;
}

function updateSeedReadiness(previous, wetness, tempC, species) {
  const progress = seedReadinessProgress(wetness, tempC, species);
  const drySetback =
    species === "baobab"
      ? clamp((0.16 - wetness) / 0.16) * 0.12
      : clamp((0.26 - wetness) / 0.26) * 0.32;
  const coldSetback =
    species === "baobab"
      ? clamp((7 - tempC) / 18) * 0.18
      : clamp((4 - tempC) / 14) * 0.24;
  return clamp(previous + MODEL_DT_DAYS * (0.86 * progress - drySetback - coldSetback) - 0.012 * previous);
}

function baobabGerminationRate(state, i, wetness, tempStress, light, substrateIndex, readiness) {
  if (state.baobabBlocked[i]) {
    return 0;
  }
  const wetPenalty = 1 - 0.92 * clamp((wetness - 0.64) / 0.28);
  const dryPulse = clamp((wetness - 0.18) / 0.34) * Math.max(0.04, wetPenalty);
  const risk = clamp(0.25 + state.baobabRisk[i] * 0.95);
  const ashPenalty = 1 - clamp(state.ashStress[i] * 1.4) * 0.86;
  const substrateFactor = SUBSTRATE_BAOBAB_GERMINATION_FACTOR[substrateIndex] || 1;
  const readinessFactor = clamp((readiness - 0.08) / 0.58);
  return 0.11 * readinessFactor * dryPulse * tempStress * clamp(0.25 + 0.75 * light) * risk * Math.max(0.08, ashPenalty) * substrateFactor;
}

function roseGerminationRate(state, i, wetness, tempStress, light, ashLoad, readiness, openFraction) {
  const moisture = clamp((wetness - 0.28) / 0.42);
  const fertility = clamp(state.roseFertility[i] / 1.6);
  const ashPenalty = 1 - clamp(ashLoad * 0.8);
  const readinessFactor = clamp((readiness - 0.12) / 0.58);
  return 0.24 * readinessFactor * moisture * tempStress * clamp(0.35 + 0.65 * light) * fertility * ashPenalty * clamp(openFraction);
}

function nutrientStress(mineralN, substrateFactor) {
  const halfSaturation = 0.16;
  const available = Math.max(0, mineralN);
  const substrate = clamp(substrateFactor, 0.25, 1.45);
  return clamp(0.12 + 0.88 * substrate * available / (available + halfSaturation));
}

function updateCanopyOptics(model) {
  if (runWasmCanopyOptics(model, { shade: model.params.shade })) {
    return true;
  }
  updateCanopyOpticsFromInputs(model);
  return false;
}

function updateCanopyOpticsFromInputs(model) {
  const { state, size } = model;
  const activeCellIds = model.activeCellIds;
  const cellCount = activeCellIds ? activeCellIds.length : size;
  const baobabPft = PFT_TRAITS.baobab;
  const rosePft = PFT_TRAITS.rose;
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    const baobabLeafCarbon = state.baobabBlocked[i] ? 0 : state.baobabLeaf[i];
    const laiB = clamp(baobabPft.specificLeafArea * Math.max(0, baobabLeafCarbon), 0, baobabPft.maxLai);
    const laiR = clamp(
      rosePft.specificLeafArea * Math.max(0, state.roseLeaf[i]) +
        rosePft.flowerDisplayLai * Math.max(0, state.roseFlower[i]),
      0,
      rosePft.maxLai
    );
    const opticalDepthB = baobabPft.photosynthesis.extinction * laiB;
    const opticalDepthR = rosePft.photosynthesis.extinction * laiR;
    const coverB = clamp(1 - Math.exp(-opticalDepthB));
    const coverR = clamp(1 - Math.exp(-opticalDepthR));
    const cover = clamp(1 - Math.exp(-(opticalDepthB + opticalDepthR)));
    const canopyLightB = Math.exp(-0.11 * laiB);
    const canopyLightR = Math.exp(-(0.57 * model.params.shade * laiB + 0.18 * laiR));
    const solarLight = clamp(state.sunlight[i]);
    state.laiBaobab[i] = laiB;
    state.laiRose[i] = laiR;
    state.coverBaobab[i] = coverB;
    state.coverRose[i] = coverR;
    state.vegetationCover[i] = cover;
    state.canopyLightBaobab[i] = canopyLightB;
    state.canopyLightRose[i] = canopyLightR;
    state.lightBaobab[i] = solarLight * canopyLightB;
    state.lightRose[i] = solarLight * canopyLightR;
  }
}

function litterDecompositionRate(wetness, tempC, substrateIndex, ashLoad) {
  const moisture = clamp((wetness - 0.08) / 0.62);
  const temp = temperatureResponse(tempC, 27, -4, 46);
  const substrateFactor = SUBSTRATE_LITTER_DECOMPOSITION_FACTOR[substrateIndex] || 1;
  return (0.012 + 0.048 * moisture * temp * substrateFactor) * (1 + 0.24 * clamp(ashLoad));
}

function storageAllocationFraction(traits, positiveNpp, stress, store, storeCap, maxFraction) {
  if (positiveNpp <= 0 || storeCap <= 1e-9) {
    return 0;
  }

  const storageDeficit = clamp(1 - Math.max(0, store) / storeCap);
  const waterStress = 1 - clamp(stress);
  const baseline = traits.storageFraction * (0.35 + 0.65 * clamp(stress));
  const reserveRefill = traits.storageFraction * storageDeficit * (1.18 + 0.44 * clamp(stress));
  const droughtReserve = traits.storageFraction * storageDeficit * waterStress * 0.48;
  return clamp(baseline + reserveRefill + droughtReserve, 0, maxFraction);
}

function seedMortalityRate(wetness, tempC, baseRate, droughtSensitivity) {
  const drought = clamp((0.22 - wetness) / 0.22);
  const heat = clamp((tempC - 38) / 12);
  return baseRate + droughtSensitivity * drought + 0.035 * heat;
}

function updateBaobabCarbonPoolsInto(
  out,
  state,
  i,
  carbonBalance,
  mortality,
  seedInput,
  seedOutput,
  stress,
  light,
  blocked,
  storeCap,
  writeDiagnostics
) {
  if (blocked) {
    state.baobabLeafN[i] = 0;
    state.baobabStemN[i] = 0;
    state.baobabRootN[i] = 0;
    state.baobabStoreN[i] = 0;
    if (writeDiagnostics) {
      state.baobabAllocLeaf[i] = 0;
      state.baobabAllocStem[i] = 0;
      state.baobabAllocRoot[i] = 0;
      state.baobabAllocStore[i] = 0;
      state.baobabAllocLeafC[i] = 0;
      state.baobabAllocStemC[i] = 0;
      state.baobabAllocRootC[i] = 0;
      state.baobabAllocStoreC[i] = 0;
      state.baobabLeafLossCarbon[i] = 0;
      state.baobabStemLossCarbon[i] = 0;
      state.baobabRootLossCarbon[i] = 0;
      state.baobabLeafResidualCarbon[i] = 0;
      state.baobabStemResidualCarbon[i] = 0;
      state.baobabRootResidualCarbon[i] = 0;
      state.baobabStoreResidualCarbon[i] = 0;
    }
    out.fast = 0;
    out.slow = 0;
    out.total = 0;
    return out;
  }

  const traits = BAOBAB_CARBON_TRAITS;
  const leaf = state.baobabLeaf[i];
  const stem = state.baobabStem[i];
  const root = state.baobabRoot[i];
  const mass = Math.max(1e-9, leaf + stem + root);
  const store = state.baobabStore[i];
  const deficit = Math.max(0, -carbonBalance);
  const mobilized = Math.min(store / MODEL_DT_DAYS, deficit * traits.storageMobilization);
  const unmetDeficit = Math.max(0, deficit - mobilized);
  const positiveNpp = Math.max(0, carbonBalance);
  const seedOutputRate = Math.max(0, seedOutput ?? 0);
  const seedFromNpp = Math.min(positiveNpp, seedOutputRate);
  const seedFromStore = Math.max(0, seedOutputRate - seedFromNpp);
  const vegetativeNpp = positiveNpp - seedFromNpp;
  const storeFraction = storageAllocationFraction(traits, vegetativeNpp, stress, store, storeCap, 0.38);
  const storageSink = vegetativeNpp * storeFraction;
  const growthCarbon = vegetativeNpp - storageSink;
  const allocation = baobabCarbonAllocation(stress, light, leaf, stem, root);
  const structuralFraction = 1 - storeFraction;
  const allocLeaf = vegetativeNpp > 0 ? structuralFraction * allocation.leaf : 0;
  const allocStem = vegetativeNpp > 0 ? structuralFraction * allocation.stem : 0;
  const allocRoot = vegetativeNpp > 0 ? structuralFraction * allocation.root : 0;
  const allocStore = vegetativeNpp > 0 ? storeFraction : 0;
  if (writeDiagnostics) {
    state.baobabAllocLeaf[i] = allocLeaf;
    state.baobabAllocStem[i] = allocStem;
    state.baobabAllocRoot[i] = allocRoot;
    state.baobabAllocStore[i] = allocStore;
    state.baobabAllocLeafC[i] = vegetativeNpp * allocLeaf;
    state.baobabAllocStemC[i] = vegetativeNpp * allocStem;
    state.baobabAllocRootC[i] = vegetativeNpp * allocRoot;
    state.baobabAllocStoreC[i] = vegetativeNpp * allocStore;
  }
  const seedEstablishment = Math.max(0, seedInput) * traits.seedEstablishment;
  const drought = 1 - clamp(stress);
  const shade = 1 - clamp(light);
  const starvation = unmetDeficit / mass;
  const leafLossRate = traits.leafTurnover * (1 + 1.05 * drought + 0.34 * shade) + mortality * 0.42 + starvation * 0.18;
  const stemLossRate = traits.stemTurnover * (1 + 0.04 * drought) + mortality * 0.06 + starvation * 0.01;
  const rootLossRate = traits.rootTurnover * (1 + 0.08 * drought) + mortality * 0.1 + starvation * 0.03;
  const leafLoss = leafLossRate * leaf;
  const stemLoss = stemLossRate * stem;
  const rootLoss = rootLossRate * root;
  if (writeDiagnostics) {
    state.baobabLeafLossCarbon[i] = leafLoss;
    state.baobabStemLossCarbon[i] = stemLoss;
    state.baobabRootLossCarbon[i] = rootLoss;
  }

  state.baobabLeafN[i] = Math.max(0, leaf + MODEL_DT_DAYS * (growthCarbon * allocation.leaf + seedEstablishment * 0.18 - leafLoss));
  state.baobabStemN[i] = Math.max(0, stem + MODEL_DT_DAYS * (growthCarbon * allocation.stem + seedEstablishment * 0.22 - stemLoss));
  state.baobabRootN[i] = Math.max(0, root + MODEL_DT_DAYS * (growthCarbon * allocation.root + seedEstablishment * 0.6 - rootLoss));
  state.baobabStoreN[i] = clamp(
    store + MODEL_DT_DAYS * (storageSink - mobilized - seedFromStore),
    0,
    storeCap
  );
  if (writeDiagnostics) {
    state.baobabLeafResidualCarbon[i] =
      (state.baobabLeafN[i] - leaf) - MODEL_DT_DAYS * (growthCarbon * allocation.leaf + seedEstablishment * 0.18 - leafLoss);
    state.baobabStemResidualCarbon[i] =
      (state.baobabStemN[i] - stem) - MODEL_DT_DAYS * (growthCarbon * allocation.stem + seedEstablishment * 0.22 - stemLoss);
    state.baobabRootResidualCarbon[i] =
      (state.baobabRootN[i] - root) - MODEL_DT_DAYS * (growthCarbon * allocation.root + seedEstablishment * 0.6 - rootLoss);
    state.baobabStoreResidualCarbon[i] =
      (state.baobabStoreN[i] - store) - MODEL_DT_DAYS * (storageSink - mobilized - seedFromStore);
  }
  out.fast = leafLoss * 0.72 + rootLoss * 0.42;
  out.slow = stemLoss + leafLoss * 0.28 + rootLoss * 0.58;
  out.total = leafLoss + stemLoss + rootLoss;
  return out;
}

function updateRoseCarbonPoolsInto(
  out,
  state,
  i,
  carbonBalance,
  mortality,
  seedInput,
  seedOutput,
  stress,
  light,
  roseSoil,
  ashLoad,
  storeCap,
  writeDiagnostics
) {
  const traits = ROSE_CARBON_TRAITS;
  const leaf = state.roseLeaf[i];
  const flower = state.roseFlower[i];
  const root = state.roseRoot[i];
  const mass = Math.max(1e-9, leaf + flower + root);
  const store = state.roseStore[i];
  const deficit = Math.max(0, -carbonBalance);
  const mobilized = Math.min(store / MODEL_DT_DAYS, deficit * traits.storageMobilization);
  const unmetDeficit = Math.max(0, deficit - mobilized);
  const positiveNpp = Math.max(0, carbonBalance);
  const seedOutputRate = Math.max(0, seedOutput ?? 0);
  const seedFromNpp = Math.min(positiveNpp, seedOutputRate);
  const seedFromStore = Math.max(0, seedOutputRate - seedFromNpp);
  const vegetativeNpp = positiveNpp - seedFromNpp;
  const storeFraction = storageAllocationFraction(traits, vegetativeNpp, stress, store, storeCap, 0.22);
  const storageSink = vegetativeNpp * storeFraction;
  const growthCarbon = vegetativeNpp - storageSink;
  const allocation = roseCarbonAllocation(stress, light, roseSoil, ashLoad, leaf, flower, root);
  const structuralFraction = 1 - storeFraction;
  const allocLeaf = vegetativeNpp > 0 ? structuralFraction * allocation.leaf : 0;
  const allocFlower = vegetativeNpp > 0 ? structuralFraction * allocation.flower : 0;
  const allocRoot = vegetativeNpp > 0 ? structuralFraction * allocation.root : 0;
  const allocStore = vegetativeNpp > 0 ? storeFraction : 0;
  if (writeDiagnostics) {
    state.roseAllocLeaf[i] = allocLeaf;
    state.roseAllocFlower[i] = allocFlower;
    state.roseAllocRoot[i] = allocRoot;
    state.roseAllocStore[i] = allocStore;
    state.roseAllocLeafC[i] = vegetativeNpp * allocLeaf;
    state.roseAllocFlowerC[i] = vegetativeNpp * allocFlower;
    state.roseAllocRootC[i] = vegetativeNpp * allocRoot;
    state.roseAllocStoreC[i] = vegetativeNpp * allocStore;
  }
  const siteEstablishment = clamp(0.72 + 2.65 * clamp((roseSoil - 0.42) / 1.12), 0.72, 3.15);
  const seedEstablishment = Math.max(0, seedInput) * traits.seedEstablishment * siteEstablishment;
  const establishmentFlowerShare = clamp((roseSoil - 0.72) / 0.74) * 0.18 * clamp(stress);
  const drought = 1 - clamp(stress);
  const shade = 1 - clamp(light);
  const starvation = unmetDeficit / mass;
  const leafLossRate = traits.leafTurnover * (1 + 1.15 * drought + 0.4 * shade + 0.45 * ashLoad) + mortality * 0.95 + starvation;
  const flowerLossRate = traits.flowerTurnover * (1 + 1.5 * drought + 0.65 * shade + 0.7 * ashLoad) + mortality * 1.32 + starvation * 1.45;
  const rootLossRate = traits.rootTurnover * (1 + 0.45 * drought) + mortality * 0.68 + starvation * 0.78;
  const leafLoss = leafLossRate * leaf;
  const flowerLoss = flowerLossRate * flower;
  const rootLoss = rootLossRate * root;
  if (writeDiagnostics) {
    state.roseLeafLossCarbon[i] = leafLoss;
    state.roseFlowerLossCarbon[i] = flowerLoss;
    state.roseRootLossCarbon[i] = rootLoss;
  }

  state.roseLeafN[i] = Math.max(0, leaf + MODEL_DT_DAYS * (growthCarbon * allocation.leaf + seedEstablishment * (0.4 - establishmentFlowerShare * 0.45) - leafLoss));
  state.roseFlowerN[i] = Math.max(0, flower + MODEL_DT_DAYS * (growthCarbon * allocation.flower + seedEstablishment * establishmentFlowerShare - flowerLoss));
  state.roseRootN[i] = Math.max(0, root + MODEL_DT_DAYS * (growthCarbon * allocation.root + seedEstablishment * (0.6 - establishmentFlowerShare * 0.55) - rootLoss));
  state.roseStoreN[i] = clamp(
    store + MODEL_DT_DAYS * (storageSink - mobilized - seedFromStore),
    0,
    storeCap
  );
  if (writeDiagnostics) {
    state.roseLeafResidualCarbon[i] =
      (state.roseLeafN[i] - leaf) - MODEL_DT_DAYS * (growthCarbon * allocation.leaf + seedEstablishment * (0.4 - establishmentFlowerShare * 0.45) - leafLoss);
    state.roseFlowerResidualCarbon[i] =
      (state.roseFlowerN[i] - flower) - MODEL_DT_DAYS * (growthCarbon * allocation.flower + seedEstablishment * establishmentFlowerShare - flowerLoss);
    state.roseRootResidualCarbon[i] =
      (state.roseRootN[i] - root) - MODEL_DT_DAYS * (growthCarbon * allocation.root + seedEstablishment * (0.6 - establishmentFlowerShare * 0.55) - rootLoss);
    state.roseStoreResidualCarbon[i] =
      (state.roseStoreN[i] - store) - MODEL_DT_DAYS * (storageSink - mobilized - seedFromStore);
  }
  out.fast = flowerLoss + leafLoss * 0.84 + rootLoss * 0.38;
  out.slow = leafLoss * 0.16 + rootLoss * 0.62;
  out.total = leafLoss + flowerLoss + rootLoss;
  return out;
}

function baobabCarbonAllocation(stress, light, leaf, stem, root) {
  const total = Math.max(1e-9, leaf + stem + root);
  const rootTarget = clamp(0.34 + 0.24 * (1 - stress), 0.28, 0.62);
  const stemTarget = clamp(0.31 + 0.1 * stress + 0.06 * clamp(stem / total), 0.24, 0.48);
  const leafTarget = Math.max(0.08, 1 - rootTarget - stemTarget + 0.08 * (1 - light));
  const targetTotal = Math.max(0, leafTarget) + Math.max(0, stemTarget) + Math.max(0, rootTarget);
  const leafTargetNorm = targetTotal > 1e-12 ? Math.max(0, leafTarget) / targetTotal : 0;
  const stemTargetNorm = targetTotal > 1e-12 ? Math.max(0, stemTarget) / targetTotal : 0;
  const rootTargetNorm = targetTotal > 1e-12 ? Math.max(0, rootTarget) / targetTotal : 0;
  const leafWeight = leafTargetNorm + 0.72 * Math.max(0, leafTargetNorm - leaf / total);
  const stemWeight = stemTargetNorm + 0.72 * Math.max(0, stemTargetNorm - stem / total);
  const rootWeight = rootTargetNorm + 0.72 * Math.max(0, rootTargetNorm - root / total);
  const weightTotal = Math.max(0, leafWeight) + Math.max(0, stemWeight) + Math.max(0, rootWeight);
  baobabAllocationScratch.leaf = weightTotal > 1e-12 ? Math.max(0, leafWeight) / weightTotal : 0;
  baobabAllocationScratch.stem = weightTotal > 1e-12 ? Math.max(0, stemWeight) / weightTotal : 0;
  baobabAllocationScratch.root = weightTotal > 1e-12 ? Math.max(0, rootWeight) / weightTotal : 0;
  return baobabAllocationScratch;
}

function roseCarbonAllocation(stress, light, roseSoil, ashLoad, leaf, flower, root) {
  const total = Math.max(1e-9, leaf + flower + root);
  const rootTarget = clamp(0.24 + 0.26 * (1 - stress), 0.18, 0.56);
  const flowerTarget = clamp(0.075 + 0.22 * stress * clamp(roseSoil / 1.4) * (1 - 0.65 * ashLoad), 0.05, 0.34);
  const leafTarget = Math.max(0.1, 1 - rootTarget - flowerTarget + 0.07 * (1 - light));
  const targetTotal = Math.max(0, leafTarget) + Math.max(0, flowerTarget) + Math.max(0, rootTarget);
  const leafTargetNorm = targetTotal > 1e-12 ? Math.max(0, leafTarget) / targetTotal : 0;
  const flowerTargetNorm = targetTotal > 1e-12 ? Math.max(0, flowerTarget) / targetTotal : 0;
  const rootTargetNorm = targetTotal > 1e-12 ? Math.max(0, rootTarget) / targetTotal : 0;
  const leafWeight = leafTargetNorm + 0.8 * Math.max(0, leafTargetNorm - leaf / total);
  const flowerWeight = flowerTargetNorm + 0.8 * Math.max(0, flowerTargetNorm - flower / total);
  const rootWeight = rootTargetNorm + 0.8 * Math.max(0, rootTargetNorm - root / total);
  const weightTotal = Math.max(0, leafWeight) + Math.max(0, flowerWeight) + Math.max(0, rootWeight);
  roseAllocationScratch.leaf = weightTotal > 1e-12 ? Math.max(0, leafWeight) / weightTotal : 0;
  roseAllocationScratch.flower = weightTotal > 1e-12 ? Math.max(0, flowerWeight) / weightTotal : 0;
  roseAllocationScratch.root = weightTotal > 1e-12 ? Math.max(0, rootWeight) / weightTotal : 0;
  return roseAllocationScratch;
}

function swapHydrologyStepState(state) {
  swap(state, "H", "Hn");
  swap(state, "soilWater", "soilWaterN");
  swap(state, "groundwaterStorage", "groundwaterStorageN");
  swap(state, "canopyWater", "canopyWaterN");
}

function swapBiologyStepState(state) {
  swap(state, "baobabLeaf", "baobabLeafN");
  swap(state, "baobabStem", "baobabStemN");
  swap(state, "baobabRoot", "baobabRootN");
  swap(state, "baobabStore", "baobabStoreN");
  swap(state, "baobabSeed", "baobabSeedN");
  swap(state, "baobabGerminationReadiness", "baobabGerminationReadinessN");
  swap(state, "roseLeaf", "roseLeafN");
  swap(state, "roseFlower", "roseFlowerN");
  swap(state, "roseRoot", "roseRootN");
  swap(state, "roseStore", "roseStoreN");
  swap(state, "roseSeed", "roseSeedN");
  swap(state, "roseGerminationReadiness", "roseGerminationReadinessN");
  swap(state, "soilMineralN", "soilMineralNN");
  swap(state, "litterCarbon", "litterCarbonN");
  swap(state, "litterFastCarbon", "litterFastCarbonN");
  swap(state, "litterSlowCarbon", "litterSlowCarbonN");
  swap(state, "soilCarbonActive", "soilCarbonActiveN");
  swap(state, "soilCarbonStable", "soilCarbonStableN");
  swap(state, "MB", "MBn");
  swap(state, "MR", "MRn");
  swap(state, "SB", "SBn");
}

function swapStepState(state, includeHydrology = false) {
  if (includeHydrology) {
    swapHydrologyStepState(state);
  } else {
    swap(state, "canopyWater", "canopyWaterN");
  }
  swapBiologyStepState(state);
}

function step(model, options = {}) {
  const { params, state, size } = model;
  const writeDiagnostics = model.diagnosticsEnabled;
  const profileSink = activeProfileSink();
  const profileStepStart = profileSink ? performance.now() : 0;
  let profileSectionStart = profileStepStart;
  const {
    H,
    R,
    W0,
    W1,
    groundwaterStorage,
    groundwaterStorageN,
    groundwaterTransport,
    groundwaterRecharge,
    MB,
    MR,
    SB,
    baobabLeaf,
    baobabStem,
    baobabRoot,
    baobabStore,
    baobabSeed,
    baobabLeafN,
    baobabStemN,
    baobabRootN,
    baobabStoreN,
    baobabSeedN,
    roseLeaf,
    roseFlower,
    roseRoot,
    roseStore,
    roseSeed,
    roseLeafN,
    roseFlowerN,
    roseRootN,
    roseStoreN,
    roseSeedN,
    roseSeedProduction: roseSeedProductionRate,
    roseSeedArrival,
    baobabGerminationReadiness,
    roseGerminationReadiness,
    baobabGerminationReadinessN,
    roseGerminationReadinessN,
    canopyWater,
    canopyWaterN,
    rainMemory,
    Hn,
    W0n,
    W1n,
    Htransport,
    baobabSeedTransport,
    roseSeedTransport,
    MBn,
    MRn,
    SBn,
    soilMineralNN,
    soilMineralTransport,
    litterFastCarbon,
    litterSlowCarbon,
    litterFastCarbonN,
    litterSlowCarbonN,
    litterCarbonN,
    soilCarbonActive,
    soilCarbonStable,
    soilCarbonActiveN,
    soilCarbonStableN,
    soilBioWetness,
    soilBioTempC,
    soilBioAshLoad,
    soilBioTopSat,
    soilBioGroundwaterSat,
    soilBioLitterFastInput,
    soilBioLitterSlowInput,
    soilBioPlantNutrientUptake,
    plantCarbonC,
    seedCarbonC,
    litterPoolCarbonC,
    soilOrganicCarbonC,
    ecosystemCarbonC,
    netEcosystemProductionC,
    carbonInputC,
    carbonRespirationC,
    carbonTransportC,
    carbonDisturbanceC,
    carbonStorageBeforeC,
    carbonStorageChangeC,
    carbonResidualC,
    depth,
    ashStress,
    baobabBlocked,
    sunlight,
    substrate,
    roseFertility
  } = state;
  const evapFactor = params.evaporation;
  const useWasmSoilBiogeochemistry = !writeDiagnostics && canRunWasmSoilBiogeochemistry();

  const rainAverageDays = model.planetPreset === "earth" ? RAIN_DISPLAY_AVERAGE_DAYS : 1.1;
  const modelDtDays = Number.isFinite(options.modelDtDays) && options.modelDtDays > 0
    ? options.modelDtDays
    : MODEL_DT_DAYS;
  const rainAverageWeight = 1 - Math.exp(-modelDtDays / rainAverageDays);
  const configuredSlowStepInterval = Number(options.slowStepInterval);
  const slowStepInterval = Math.max(1, Math.min(32, Math.round(
    Number.isFinite(configuredSlowStepInterval) && configuredSlowStepInterval > 0
      ? configuredSlowStepInterval
      : 1
  )));
  if (model.slowStepInterval !== slowStepInterval) {
    model.slowStepPhase = 0;
    model.slowStepInterval = slowStepInterval;
    for (const key of [
      "slowEnvGppBaobab", "slowEnvGppRose",
      "slowEnvRootStressBaobab", "slowEnvRootStressRose",
      "slowEnvCanopyLightBaobab", "slowEnvCanopyLightRose",
      "slowEnvLightBaobab", "slowEnvLightRose",
      "slowEnvVegetationCover", "slowEnvSurfaceTempC", "slowEnvAshStress",
      "slowEnvWetness", "slowEnvTopSat", "slowEnvGroundwaterSat"
    ]) {
      state[key]?.fill(0);
    }
  }
  const baobabSeedDiffusionM2Day = SEED_DIFF_BAOBAB_M2_DAY * params.baobabSpread;
  const roseSeedDiffusionM2Day = 0;
  const rainScale = clamp(params.rainScale, 5, 40);
  const rainPatchiness = clamp(params.rainPatchiness);
  const asteroidCloudCount = Math.max(2, Math.min(8, Math.round(Math.sqrt(size) / 11)));
  const repeatCount = Math.max(1, Math.min(32, options.repeatCount | 0 || 1));
  const slowStepPhaseBefore = Math.max(0, Math.min(
    slowStepInterval - 1,
    Math.round(model.slowStepPhase ?? 0)
  ));
  const runEcosystem =
    options.threaded ? runWasmEcosystemStepsThreaded :
      runWasmEcosystemStepsInPlace;
  const usedEcosystemWasm =
    !writeDiagnostics &&
    runEcosystem(model, {
      ...plantWaterFluxConstantsForWasm(model),
      modelDtDays,
      slowStepInterval,
      slowStepPhase: model.slowStepPhase ?? 0,
      rainAverageWeight,
      annualPrecipMm: params.annualPrecipMm,
      dryDays: params.dryDays,
      day: model.day,
      rainRenderSize: model.rainMap.renderSize,
      rainScale,
      rainPatchiness,
      asteroidCloudCount,
      earthTropicalScale: rainScale * 0.48,
      earthMidLatitudeScale: rainScale * 0.92,
      cellSizeM: model.cellSizeM ?? CELL_SIZE_M,
      surfaceWaterDiffM2Day: SURFACE_WATER_DIFF_M2_DAY,
      surfaceSlopeVelocityMDay: SURFACE_SLOPE_VELOCITY_M_DAY,
      surfaceSlopeMaxVelocityMDay: SURFACE_SLOPE_MAX_VELOCITY_M_DAY,
      nutrientDiffM2Day: NUTRIENT_DIFF_M2_DAY,
      baobabSeedDiffusionM2Day,
      roseSeedDiffusionM2Day,
      surfaceFilmThresholdM: SURFACE_FILM_THRESHOLD_M,
      groundwaterFlowMultiplier: clamp(params.gwFlow / GROUNDWATER_DEFAULT_FLOW, 0, 8),
      asteroidMeanTempC: params.asteroidMeanTempC ?? 16,
      asteroidDiurnalRangeC: params.asteroidDiurnalRangeC ?? 16,
      asteroidLatitudeTempRangeC: params.asteroidLatitudeTempRangeC ?? 3,
      shade: params.shade ?? DEFAULT_PARAMS.shade,
      cohorts: ROSE_SEED_DISPERSAL_COHORTS,
      sunlightNormals: options.sunlightNormals,
      sunlightRoseCell: options.sunlightRoseCell,
      sunlightTurn: options.sunlightTurn,
      sunlightTurnsPerDay: options.sunlightTurnsPerDay,
      sunlightModelTimeOffsetDays: options.sunlightModelTimeOffsetDays,
      sunlightModelDurationDays: options.sunlightModelDurationDays,
      sunlightSampleCount: options.sunlightSampleCount
  }, repeatCount);
  if (usedEcosystemWasm) {
    const finalizeWasmStep = () => {
      const completedSteps = model.lastEcosystemStepCount || 1;
      const completedSlowSteps = Math.floor((slowStepPhaseBefore + completedSteps) / slowStepInterval);
      if (completedSteps & 1) {
        swapHydrologyStepState(state);
      }
      if (completedSlowSteps & 1) {
        swapBiologyStepState(state);
      }
      refreshCarbonDiagnosticsFromPools(model, modelDtDays * completedSteps);
      model.day += modelDtDays * completedSteps;
      if (profileSink) {
        const now = performance.now();
        addProfileTime(profileSink, "ecosystemStepWasm", now - profileSectionStart);
        addProfileTime(profileSink, "totalStep", now - profileStepStart);
        profileSink.stepCount = (profileSink.stepCount ?? 0) + completedSteps;
      }
    };
    if (typeof usedEcosystemWasm.then === "function") {
      return usedEcosystemWasm.then((ok) => {
        if (!ok) {
          throw new Error("C/WASM threaded ecosystem step failed.");
        }
        finalizeWasmStep();
      });
    }
    finalizeWasmStep();
    return;
  }
  if (!writeDiagnostics) {
    throw new Error("C/WASM ecosystem step is required for normal asteroid garden simulation.");
  }
  const meanRain = seasonalRain(model);
  model.lastRainM = meanRain;
  updateRainField(model, meanRain);
  if (!runWasmRainMemory(model, { rainAverageWeight })) {
    for (let i = 0; i < size; i += 1) {
      rainMemory[i] += (R[i] - rainMemory[i]) * rainAverageWeight;
    }
  }
  partitionEarthPrecipitationPhase(model, modelDtDays);
  if (profileSink) {
    const now = performance.now();
    addProfileTime(profileSink, "rain", now - profileSectionStart);
    profileSectionStart = now;
  }
  const horizontalProfileStart = profileSectionStart;
  updateHydraulicState(model);
  if (profileSink) {
    const now = performance.now();
    addProfileTime(profileSink, "horizontalHydraulicState", now - profileSectionStart);
    profileSectionStart = now;
  }
  const usedCombinedDarcySurfaceTransport = transportDarcyWaterColumnsRbf(
    model,
    MODEL_DT_DAYS,
    baobabSeedDiffusionM2Day,
    roseSeedDiffusionM2Day,
    true
  );
  if (profileSink) {
    const now = performance.now();
    addProfileTime(profileSink, "horizontalDarcyColumns", now - profileSectionStart);
    profileSectionStart = now;
  }
  const surfaceNutrientSeedBlockStart = profileSectionStart;
  if (!usedCombinedDarcySurfaceTransport) {
    transportSurfaceNutrientSeedsRbf(model);
  }
  if (profileSink) {
    const now = performance.now();
    addProfileTime(profileSink, "surfaceNutrientSeedsTransport", now - profileSectionStart);
    profileSectionStart = now;
  }
  updateCanopyOptics(model);
  if (profileSink) {
    const now = performance.now();
    addProfileTime(profileSink, "canopyOptics", now - profileSectionStart);
    profileSectionStart = now;
  }
  updateCanopyEnvironmentFields(model);
  if (profileSink) {
    const now = performance.now();
    addProfileTime(profileSink, "canopyEnvironment", now - profileSectionStart);
    addProfileTime(profileSink, "horizontalSurfaceNutrientSeeds", now - surfaceNutrientSeedBlockStart);
    addProfileTime(profileSink, "horizontalTransport", now - horizontalProfileStart);
    profileSectionStart = now;
  }
  let usedInitialPhotosynthesisBatch = false;
  if (canRunWasmPhotosynthesis()) {
    const batchProfileStart = profileSink ? performance.now() : 0;
    usedInitialPhotosynthesisBatch = runWasmPrepareAndPhotosynthesis(model, {
      ...photosynthesisConstantsForWasm(model),
      hydraulicLookupSteps: HYDRAULIC_LOOKUP_STEPS,
      rootDepth: model.params.rootDepth ?? DEFAULT_PARAMS.rootDepth,
      storage: model.params.storage ?? DEFAULT_PARAMS.storage,
      ...hydraulicLookupTablesForWasm()
    });
    if (!usedInitialPhotosynthesisBatch) {
      prepareInitialPhotosynthesisInputsBatch(model);
      usedInitialPhotosynthesisBatch = runWasmPhotosynthesis(model, photosynthesisConstantsForWasm(model));
    }
    if (profileSink) {
      const now = performance.now();
      addProfileTime(profileSink, "photosynthesisBatch", now - batchProfileStart);
      profileSectionStart = now;
    }
  }
  let usedPlantWaterFluxBatch = false;
  if (usedInitialPhotosynthesisBatch && !writeDiagnostics) {
    const batchProfileStart = profileSink ? performance.now() : 0;
    usedPlantWaterFluxBatch = runWasmPlantWaterFluxes(model, plantWaterFluxConstantsForWasm(model));
    if (profileSink) {
      const now = performance.now();
      addProfileTime(profileSink, "plantWaterFluxBatch", now - batchProfileStart);
      profileSectionStart = now;
    }
  }
  distributeRoseSeedProduction(model);
  if (profileSink) {
    const now = performance.now();
    addProfileTime(profileSink, "roseSeedProductionDistribution", now - profileSectionStart);
    profileSectionStart = now;
  }
  let usedPlantCarbonSeedBatch = false;
  if (usedPlantWaterFluxBatch && useWasmSoilBiogeochemistry) {
    const batchProfileStart = profileSink ? performance.now() : 0;
    usedPlantCarbonSeedBatch = runWasmPlantCarbonSeeds(model, {
      ...photosynthesisConstantsForWasm(model),
      modelDtDays: MODEL_DT_DAYS,
      storage: params.storage ?? DEFAULT_PARAMS.storage
    });
    if (profileSink) {
      const now = performance.now();
      addProfileTime(profileSink, "plantCarbonSeedBatch", now - batchProfileStart);
      profileSectionStart = now;
    }
  }

  const activeCellIds = model.activeCellIds;
  const cellCount = activeCellIds ? activeCellIds.length : size;
  const size2 = size * 2;
  if (!usedPlantCarbonSeedBatch) {
  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
    if (baobabBlocked[i]) {
      baobabLeaf[i] = 0;
      baobabStem[i] = 0;
      baobabRoot[i] = 0;
      baobabStore[i] = 0;
    }
    let carbonStorageBefore = 0;
    if (writeDiagnostics) {
      const plantCarbonBefore =
        baobabLeaf[i] +
        baobabStem[i] +
        baobabRoot[i] +
        baobabStore[i] +
        roseLeaf[i] +
        roseFlower[i] +
        roseRoot[i] +
        roseStore[i];
      const seedCarbonBefore = baobabSeed[i] + roseSeed[i];
      const litterCarbonBefore = litterFastCarbon[i] + litterSlowCarbon[i];
      const soilOrganicCarbonBefore = soilCarbonActive[i] + soilCarbonStable[i];
      carbonStorageBefore = plantCarbonBefore + seedCarbonBefore + litterCarbonBefore + soilOrganicCarbonBefore;
    }

    const substrateIndex = substrate[i];
    const sub = SUBSTRATES[substrateIndex];
    const layer0Index = i;
    const layer1Index = size + i;
    const layer2Index = size2 + i;
    const cap0 = state.soilCap[layer0Index];
    const cap1 = state.soilCap[layer1Index];
    const cap2 = state.soilCap[layer2Index];
    const gwCap = state.groundwaterCap[i];
    const s0 = clamp(state.soilWater[layer0Index] / cap0);
    const s1 = clamp(state.soilWater[layer1Index] / cap1);
    const s2 = clamp(state.soilWater[layer2Index] / cap2);
    const gwSat = clamp(groundwaterStorage[i] / gwCap);
    const w0n = s0;
    const w1n = gwSat;
    const baobabPft = PFT_TRAITS.baobab;
    const rosePft = PFT_TRAITS.rose;
    const baobabMass = baobabLeaf[i] + baobabStem[i] + baobabRoot[i];
    const roseMass = roseLeaf[i] + roseFlower[i] + roseRoot[i];
    MB[i] = baobabMass;
    MR[i] = roseMass;
    SB[i] = baobabStore[i];
    const laiB = state.laiBaobab[i];
    const laiR = state.laiRose[i];
    const laiTotal = laiB + laiR;
    const rain = R[i];

    const coverB = writeDiagnostics ? state.coverBaobab[i] : 0;
    const coverR = writeDiagnostics ? state.coverRose[i] : 0;
    const cover = state.vegetationCover[i];
    const vegFeedback = cover;
    const canopyLightB = state.canopyLightBaobab[i];
    const canopyLightR = state.canopyLightRose[i];
    const lightB = state.lightBaobab[i];
    const lightR = state.lightRose[i];
    let psi0 = 0;
    let psi1 = 0;
    let psi2 = 0;
    let layerSaturations = rootLayerSaturationsScratch;
    let baobabLayerStress = baobabLayerStressScratch;
    let roseLayerStress = roseLayerStressScratch;
    let baobabRootFractions = baobabRootFractionScratch;
    let roseRootFractions = roseRootFractionScratch;
    let rootWaterOnly = 0;
    let roseRootWater = 0;
    if (!usedPlantWaterFluxBatch) {
      const baobabRootFrac = baobabMass > 0 ? baobabRoot[i] / baobabMass : 0.42;
      const roseRootFrac = roseMass > 0 ? roseRoot[i] / roseMass : 0.24;
      psi0 = matricPotentialBySubstrateIndex(substrateIndex, s0);
      psi1 = matricPotentialBySubstrateIndex(substrateIndex, s1);
      psi2 = matricPotentialBySubstrateIndex(substrateIndex, s2);
      layerSaturations[0] = s0;
      layerSaturations[1] = s1;
      layerSaturations[2] = s2;
      layerSaturations[3] = gwSat;
      const groundwaterRootStress = clamp(0.18 + 0.82 * gwSat);
      baobabLayerStress[0] = rootWaterStressFromPsi(psi0, BAOBAB_ROOT_WATER);
      baobabLayerStress[1] = rootWaterStressFromPsi(psi1, BAOBAB_ROOT_WATER);
      baobabLayerStress[2] = rootWaterStressFromPsi(psi2, BAOBAB_ROOT_WATER);
      baobabLayerStress[3] = groundwaterRootStress;
      roseLayerStress[0] = rootWaterStressFromPsi(psi0, ROSE_ROOT_WATER);
      roseLayerStress[1] = rootWaterStressFromPsi(psi1, ROSE_ROOT_WATER);
      roseLayerStress[2] = rootWaterStressFromPsi(psi2, ROSE_ROOT_WATER);
      roseLayerStress[3] = rootWaterStressFromPsi(0, ROSE_ROOT_WATER);
      baobabRootFractions = baobabRootLayerFractions(params.rootDepth, baobabRootFrac, baobabRootFractionScratch);
      roseRootFractions = roseRootLayerFractions(roseRootFrac, roseRootFractionScratch);
      rootWaterOnly = usedInitialPhotosynthesisBatch && !writeDiagnostics
        ? 0
        : weightedRootStress(baobabRootFractions, baobabLayerStress, sub.rootB);
      roseRootWater = usedInitialPhotosynthesisBatch && !writeDiagnostics
        ? 0
        : weightedRootStress(roseRootFractions, roseLayerStress, sub.rootR);
    }
    if (writeDiagnostics) {
      state.topMatricPotentialM[i] = psi0;
      state.rootStressBaobab[i] = rootWaterOnly;
      state.rootStressRose[i] = roseRootWater;
    }
    const storeCap = baobabStoreCapacity(params, baobabStem[i], baobabRoot[i]);
    const storeNorm = usedInitialPhotosynthesisBatch ? 0 : (storeCap > 0 ? clamp(baobabStore[i] / storeCap) : 0);
    let stressB = usedInitialPhotosynthesisBatch
      ? state.photoWaterStressBaobab[i]
      : clamp(0.06 + 0.78 * rootWaterOnly + 0.22 * storeNorm);
    const surfaceWater = H[i];
    const roseSoil = roseFertility[i];
    const ashLoad = clamp(ashStress[i] * 1.8);
  const ashGrowthFactor = 1 - 0.82 * ashLoad;
  const roseAshFactor = ashGrowthFactor;
  const baobabAshFactor = ashGrowthFactor;
    const nutrientB = usedInitialPhotosynthesisBatch
      ? state.photoNutrientBaobab[i]
      : nutrientStress(state.soilMineralN[i], sub.nutrientB);
    const nutrientR = usedInitialPhotosynthesisBatch
      ? state.photoNutrientRose[i]
      : nutrientStress(state.soilMineralN[i], sub.nutrientR * clamp(0.45 + 0.55 * roseSoil, 0.32, 1.45));
    if (writeDiagnostics) {
      state.nutrientStressBaobab[i] = nutrientB;
      state.nutrientStressRose[i] = nutrientR;
    }
    let stressR = usedInitialPhotosynthesisBatch
      ? state.photoWaterStressRose[i]
      : roseWaterStressWithAeration(roseRootWater, roseSoil, surfaceWater, w0n);
    const wetness = clamp(0.62 * w0n + 0.38 * w1n);
    const par = state.par[i];
    const tempC = state.surfaceTempC[i];
    const vpdKpa = state.vpdKpa[i];
    let baobabPhotoTemp = usedInitialPhotosynthesisBatch
      ? null
      : par > 0 && laiB > 0
        ? samplePhotosynthesisTemperature(baobabFarquharTempScratch, BAOBAB_PHOTOSYNTHESIS, tempC)
        : baobabFarquharTempScratch;
    let rosePhotoTemp = usedInitialPhotosynthesisBatch
      ? null
      : par > 0 && laiR > 0
        ? samplePhotosynthesisTemperature(roseFarquharTempScratch, ROSE_PHOTOSYNTHESIS, tempC)
        : roseFarquharTempScratch;
    let aparTotal = usedInitialPhotosynthesisBatch ? state.aparTotal[i] : 0;
    let aparBaobab = usedInitialPhotosynthesisBatch ? state.aparBaobab[i] : 0;
    let aparRose = usedInitialPhotosynthesisBatch ? state.aparRose[i] : 0;
    if (!usedInitialPhotosynthesisBatch && par > 0 && laiTotal > 1e-9) {
      aparTotal = par * cover;
      aparBaobab = aparTotal * laiB / laiTotal;
      aparRose = aparTotal * laiR / laiTotal;
      state.aparTotal[i] = aparTotal;
      state.aparBaobab[i] = aparBaobab;
      state.aparRose[i] = aparRose;
    }
    if (writeDiagnostics) {
      state.laiBaobab[i] = laiB;
      state.laiRose[i] = laiR;
      state.coverBaobab[i] = coverB;
      state.coverRose[i] = coverR;
      state.vegetationCover[i] = cover;
    }
    let et0 = 0;
    let soilEvap = 0;
    let surfaceEvap = 0;
    let throughfall = rain;
    let canopyEvaporation = 0;
    let baobabTranspiration = 0;
    let uR = 0;
    let uB0 = 0;
    let uB1 = 0;
    let uB2 = 0;
    let uB3 = 0;
    let uR0 = 0;
    let uR1 = 0;
    let uR2 = 0;
    let baobabPhoto;
    let rosePhoto;
    if (usedPlantWaterFluxBatch) {
      stressB = state.rootStressBaobab[i];
      stressR = state.rootStressRose[i];
      baobabPhotoScratch.gpp = state.gppBaobab[i];
      baobabPhotoScratch.conductanceMps = state.stomatalConductanceBaobabMps[i];
      baobabPhotoScratch.ci = state.ciBaobab[i];
      rosePhotoScratch.gpp = state.gppRose[i];
      rosePhotoScratch.conductanceMps = state.stomatalConductanceRoseMps[i];
      rosePhotoScratch.ci = state.ciRose[i];
      baobabPhoto = baobabPhotoScratch;
      rosePhoto = rosePhotoScratch;
      throughfall = state.hydrologyThroughfall[i];
      canopyEvaporation = state.canopyEvapM[i];
    } else {
    const netRadiation = netRadiationMjM2Day(par, cover, rain);
    et0 = penmanMonteithDemandM(
      tempC,
      vpdKpa,
      netRadiation,
      REFERENCE_SURFACE_CONDUCTANCE_M_S,
      REFERENCE_AERODYNAMIC_CONDUCTANCE_M_S
    );
    const canopyWaterFlux = canopyInterceptionFluxInto(canopyWaterFluxScratch, state, i, rain, laiTotal, et0);
    throughfall = canopyWaterFlux.throughfall;
    canopyEvaporation = canopyWaterFlux.evaporation;
    const remainingEt0 = Math.max(0, et0 - canopyWaterFlux.evaporation);
    const remainingNetRadiation = et0 > 0 ? netRadiation * clamp(remainingEt0 / et0) : netRadiation;
    soilEvap = 0;
    if (evapFactor > 0) {
      const bareFraction = Math.exp(-2.35 * cover);
      const surfaceWetness = clamp(w0n * 1.35 + surfaceWater * 18);
      const surfaceConductance = 0.00012 + 0.0062 * surfaceWetness * bareFraction * sub.evap * evapFactor;
      soilEvap = penmanMonteithDemandM(
        tempC,
        vpdKpa,
        remainingNetRadiation * bareFraction,
        surfaceConductance,
        BARE_SOIL_AERODYNAMIC_CONDUCTANCE_M_S
      );
    }
    surfaceEvap = Math.min(soilEvap, Math.max(0, surfaceWater) / MODEL_DT_DAYS);
    soilEvap -= surfaceEvap;

    if (usedInitialPhotosynthesisBatch) {
      baobabPhotoScratch.gpp = state.gppBaobab[i];
      baobabPhotoScratch.conductanceMps = state.stomatalConductanceBaobabMps[i];
      baobabPhotoScratch.ci = state.ciBaobab[i];
      rosePhotoScratch.gpp = state.gppRose[i];
      rosePhotoScratch.conductanceMps = state.stomatalConductanceRoseMps[i];
      rosePhotoScratch.ci = state.ciRose[i];
      baobabPhoto = baobabPhotoScratch;
      rosePhoto = rosePhotoScratch;
    } else {
      baobabPhoto = canopyPhotosynthesisWithTemperatureInto(
        baobabPhotoScratch,
        par,
        BAOBAB_PHOTOSYNTHESIS,
        laiB,
        (baobabPhotoTemp ??= par > 0 && laiB > 0
          ? samplePhotosynthesisTemperature(baobabFarquharTempScratch, BAOBAB_PHOTOSYNTHESIS, tempC)
          : baobabFarquharTempScratch),
        stressB,
        vpdKpa,
        nutrientB,
        params.baobabGrowth,
        aparBaobab,
        params.atmosphericCo2Ppm,
        state.ciBaobab[i]
      );
      rosePhoto = canopyPhotosynthesisWithTemperatureInto(
        rosePhotoScratch,
        par,
        ROSE_PHOTOSYNTHESIS,
        laiR,
        (rosePhotoTemp ??= par > 0 && laiR > 0
          ? samplePhotosynthesisTemperature(roseFarquharTempScratch, ROSE_PHOTOSYNTHESIS, tempC)
          : roseFarquharTempScratch),
        stressR,
        vpdKpa,
        nutrientR,
        params.roseGrowth,
        aparRose,
        params.atmosphericCo2Ppm,
        state.ciRose[i]
      );
    }
    let bDemand = canopyTranspirationDemand(state, i, remainingNetRadiation, laiB, baobabPhoto.conductanceMps, 0.45) +
      baobabWaterDemand(baobabLeaf[i], baobabStem[i], baobabRoot[i], lightB) * 0.28;
    let rDemand = canopyTranspirationDemand(state, i, remainingNetRadiation, laiR, rosePhoto.conductanceMps, 0.92) +
      roseWaterDemand(roseLeaf[i], roseFlower[i], roseRoot[i], lightR) * 0.22;
    const layerPotentialsM = rootLayerPotentialsScratch;
    layerPotentialsM[0] = psi0;
    layerPotentialsM[1] = psi1;
    layerPotentialsM[2] = psi2;
    layerPotentialsM[3] = 0;
    let baobabPlantPsi = plantWaterPotentialM(BAOBAB_ROOT_WATER, bDemand, vpdKpa);
    let rosePlantPsi = plantWaterPotentialM(ROSE_ROOT_WATER, rDemand, vpdKpa);
    const gwHydraulicK = state.groundwaterT[i] / Math.max(1e-6, state.groundwaterThickness[i]);
    const layerHydraulicK = rootLayerConductivityScratch;
    layerHydraulicK[0] = state.soilHydraulicK[layer0Index];
    layerHydraulicK[1] = state.soilHydraulicK[layer1Index];
    layerHydraulicK[2] = state.soilHydraulicK[layer2Index];
    layerHydraulicK[3] = gwHydraulicK;
    let baobabUptake = rootHydraulicUptake4Into(
      baobabUptakeScratch,
      bDemand * sub.rootB,
      baobabRootFractions,
      baobabLayerStress,
      layerHydraulicK,
      layerSaturations,
      layerPotentialsM,
      baobabPlantPsi,
      BAOBAB_ROOT_WATER.optimalDryM,
      sub.rootB,
      2.1
    );
    let roseUptake = rootHydraulicUptake4Into(
      roseUptakeScratch,
      rDemand * sub.rootR,
      roseRootFractions,
      roseLayerStress,
      layerHydraulicK,
      layerSaturations,
      layerPotentialsM,
      rosePlantPsi,
      ROSE_ROOT_WATER.optimalDryM,
      sub.rootR,
      0.92
    );
    const baobabHydraulicStress = hydraulicStressFromUptakeDemand(
      Math.max(0, baobabUptake[0]) + Math.max(0, baobabUptake[1]) + Math.max(0, baobabUptake[2]) + Math.max(0, baobabUptake[3]),
      bDemand * sub.rootB,
      stressB
    );
    if (baobabHydraulicStress < stressB - 0.005) {
      stressB = baobabHydraulicStress;
      baobabPhoto = canopyPhotosynthesisWithTemperatureInto(
        baobabPhotoScratch,
        par,
        BAOBAB_PHOTOSYNTHESIS,
        laiB,
        (baobabPhotoTemp ??= par > 0 && laiB > 0
          ? samplePhotosynthesisTemperature(baobabFarquharTempScratch, BAOBAB_PHOTOSYNTHESIS, tempC)
          : baobabFarquharTempScratch),
        stressB,
        vpdKpa,
        nutrientB,
        params.baobabGrowth,
        aparBaobab,
        params.atmosphericCo2Ppm,
        baobabPhoto?.ci ?? state.ciBaobab[i]
      );
      bDemand = canopyTranspirationDemand(state, i, remainingNetRadiation, laiB, baobabPhoto.conductanceMps, 0.45) +
        baobabWaterDemand(baobabLeaf[i], baobabStem[i], baobabRoot[i], lightB) * 0.28;
      baobabPlantPsi = plantWaterPotentialM(BAOBAB_ROOT_WATER, bDemand, vpdKpa);
      baobabUptake = rootHydraulicUptake4Into(
        baobabUptakeScratch,
        bDemand * sub.rootB,
        baobabRootFractions,
        baobabLayerStress,
        layerHydraulicK,
        layerSaturations,
        layerPotentialsM,
        baobabPlantPsi,
        BAOBAB_ROOT_WATER.optimalDryM,
        sub.rootB,
        2.1
      );
    }
    const roseHydraulicStress = hydraulicStressFromUptakeDemand(
      Math.max(0, roseUptake[0]) + Math.max(0, roseUptake[1]) + Math.max(0, roseUptake[2]) + Math.max(0, roseUptake[3]),
      rDemand * sub.rootR,
      stressR
    );
    if (roseHydraulicStress < stressR - 0.005) {
      stressR = roseHydraulicStress;
      rosePhoto = canopyPhotosynthesisWithTemperatureInto(
        rosePhotoScratch,
        par,
        ROSE_PHOTOSYNTHESIS,
        laiR,
        (rosePhotoTemp ??= par > 0 && laiR > 0
          ? samplePhotosynthesisTemperature(roseFarquharTempScratch, ROSE_PHOTOSYNTHESIS, tempC)
          : roseFarquharTempScratch),
        stressR,
        vpdKpa,
        nutrientR,
        params.roseGrowth,
        aparRose,
        params.atmosphericCo2Ppm,
        rosePhoto?.ci ?? state.ciRose[i]
      );
      rDemand = canopyTranspirationDemand(state, i, remainingNetRadiation, laiR, rosePhoto.conductanceMps, 0.92) +
        roseWaterDemand(roseLeaf[i], roseFlower[i], roseRoot[i], lightR) * 0.22;
      rosePlantPsi = plantWaterPotentialM(ROSE_ROOT_WATER, rDemand, vpdKpa);
      roseUptake = rootHydraulicUptake4Into(
        roseUptakeScratch,
        rDemand * sub.rootR,
        roseRootFractions,
        roseLayerStress,
        layerHydraulicK,
        layerSaturations,
        layerPotentialsM,
        rosePlantPsi,
        ROSE_ROOT_WATER.optimalDryM,
        sub.rootR,
        0.92
      );
    }
    uB0 = baobabUptake[0];
    uB1 = baobabUptake[1];
    uB2 = baobabUptake[2];
    uB3 = baobabUptake[3];
    uR0 = roseUptake[0];
    uR1 = roseUptake[1];
    uR2 = roseUptake[2];
    const maxSoilEvap = Math.max(0, state.soilWater[layer0Index] * 0.38) / MODEL_DT_DAYS;
    soilEvap = Math.min(soilEvap, maxSoilEvap);

    const totalU0 = uB0 + uR0 + soilEvap;
    if (totalU0 * MODEL_DT_DAYS > state.soilWater[layer0Index] * 0.72 && totalU0 > 0) {
      const scale = (state.soilWater[layer0Index] * 0.72) / (totalU0 * MODEL_DT_DAYS);
      uB0 *= scale;
      uR0 *= scale;
      soilEvap *= scale;
    }
    const totalU1 = uB1 + uR1;
    if (totalU1 * MODEL_DT_DAYS > state.soilWater[layer1Index] * 0.66 && totalU1 > 0) {
      const scale = (state.soilWater[layer1Index] * 0.66) / (totalU1 * MODEL_DT_DAYS);
      uB1 *= scale;
      uR1 *= scale;
    }
    const totalU2 = uB2 + uR2;
    if (totalU2 * MODEL_DT_DAYS > state.soilWater[layer2Index] * 0.66 && totalU2 > 0) {
      const scale = (state.soilWater[layer2Index] * 0.66) / (totalU2 * MODEL_DT_DAYS);
      uB2 *= scale;
      uR2 *= scale;
    }
    if (uB3 * MODEL_DT_DAYS > groundwaterStorage[i] * 0.68 && uB3 > 0) {
      uB3 *= (groundwaterStorage[i] * 0.68) / (uB3 * MODEL_DT_DAYS);
    }
    baobabTranspiration = uB0 + uB1 + uB2 + uB3;
    uR = uR0 + uR1 + uR2;
    const finalBaobabHydraulicStress = hydraulicStressFromUptakeDemand(
      baobabTranspiration,
      bDemand * sub.rootB,
      stressB
    );
    if (finalBaobabHydraulicStress < stressB - 0.005) {
      stressB = finalBaobabHydraulicStress;
      baobabPhoto = canopyPhotosynthesisWithTemperatureInto(
        baobabPhotoScratch,
        par,
        BAOBAB_PHOTOSYNTHESIS,
        laiB,
        (baobabPhotoTemp ??= par > 0 && laiB > 0
          ? samplePhotosynthesisTemperature(baobabFarquharTempScratch, BAOBAB_PHOTOSYNTHESIS, tempC)
          : baobabFarquharTempScratch),
        stressB,
        vpdKpa,
        nutrientB,
        params.baobabGrowth,
        aparBaobab,
        params.atmosphericCo2Ppm,
        baobabPhoto?.ci ?? state.ciBaobab[i]
      );
    }
    const finalRoseHydraulicStress = hydraulicStressFromUptakeDemand(
      uR,
      rDemand * sub.rootR,
      stressR
    );
    if (finalRoseHydraulicStress < stressR - 0.005) {
      stressR = finalRoseHydraulicStress;
      rosePhoto = canopyPhotosynthesisWithTemperatureInto(
        rosePhotoScratch,
        par,
        ROSE_PHOTOSYNTHESIS,
        laiR,
        (rosePhotoTemp ??= par > 0 && laiR > 0
          ? samplePhotosynthesisTemperature(roseFarquharTempScratch, ROSE_PHOTOSYNTHESIS, tempC)
          : roseFarquharTempScratch),
        stressR,
        vpdKpa,
        nutrientR,
        params.roseGrowth,
        aparRose,
        params.atmosphericCo2Ppm,
        rosePhoto?.ci ?? state.ciRose[i]
      );
    }
    if (writeDiagnostics) {
      state.rootStressBaobab[i] = stressB;
      state.rootStressRose[i] = stressR;
      state.stomatalConductanceBaobabMps[i] = baobabPhoto.conductanceMps;
      state.stomatalConductanceRoseMps[i] = rosePhoto.conductanceMps;
      state.ciBaobab[i] = baobabPhoto.ci;
      state.ciRose[i] = rosePhoto.ci;
    }
    }

    const baobabTempStress = pftTemperatureResponse(baobabPft, tempC);
    const roseTempStress = pftTemperatureResponse(rosePft, tempC);
    if (writeDiagnostics) {
      const baobabVpdStress = vpdResponse(vpdKpa, baobabPft.vpdSensitivityKpa);
      const roseVpdStress = vpdResponse(vpdKpa, rosePft.vpdSensitivityKpa);
      const baobabCo2Stress = co2Response(params.atmosphericCo2Ppm, baobabPft.co2HalfSaturationPpm);
      const roseCo2Stress = co2Response(params.atmosphericCo2Ppm, rosePft.co2HalfSaturationPpm);
      const baobabPhotoStress =
        baobabTempStress * clamp(stressB) * baobabVpdStress * baobabCo2Stress * clamp(nutrientB);
      const rosePhotoStress =
        roseTempStress * clamp(stressR) * roseVpdStress * roseCo2Stress * clamp(nutrientR);
      const lueGppB =
        Math.max(0, aparBaobab) *
        baobabPft.lightUseEfficiencyKgCPerMol *
        clamp(baobabPhotoStress) *
        Math.max(0, baobabAshFactor) *
        Math.max(0, params.baobabGrowth);
      const lueGppR =
        Math.max(0, aparRose) *
        rosePft.lightUseEfficiencyKgCPerMol *
        clamp(rosePhotoStress) *
        Math.max(0, params.roseGrowth) *
        Math.max(0, roseAshFactor);
      state.tempStressBaobab[i] = baobabTempStress;
      state.tempStressRose[i] = roseTempStress;
      state.vpdStressBaobab[i] = baobabVpdStress;
      state.vpdStressRose[i] = roseVpdStress;
      state.co2StressBaobab[i] = baobabCo2Stress;
      state.co2StressRose[i] = roseCo2Stress;
      state.photosynthesisStressBaobab[i] = baobabPhotoStress;
      state.photosynthesisStressRose[i] = rosePhotoStress;
      state.lueGppBaobab[i] = lueGppB;
      state.lueGppRose[i] = lueGppR;
    }
    const gppB = baobabPhoto.gpp * Math.max(0, baobabAshFactor);
    const gppR = rosePhoto.gpp * Math.max(0, roseAshFactor);
    const lightBStress = clamp(lightB / 0.32);
    const lightRStress = clamp(lightR / 0.32);
    const canopyLightBStress = clamp(canopyLightB / 0.32);
    const canopyLightRStress = clamp(canopyLightR / 0.32);
    const baobabCarbonTraits = baobabPft.carbon;
    const roseCarbonTraits = rosePft.carbon;
    const baobabQ10 = q10TemperatureFactor(baobabCarbonTraits.q10, tempC);
    const roseQ10 = q10TemperatureFactor(roseCarbonTraits.q10, tempC);
    const maintenanceRespB =
      baobabQ10 *
      (baobabCarbonTraits.leafMaintenance * baobabLeaf[i] +
        baobabCarbonTraits.stemMaintenance * baobabStem[i] +
        baobabCarbonTraits.rootMaintenance * baobabRoot[i] +
        baobabCarbonTraits.storageMaintenance * baobabStore[i]);
    const maintenanceRespR =
      roseQ10 *
      (roseCarbonTraits.leafMaintenance * roseLeaf[i] +
        roseCarbonTraits.flowerMaintenance * roseFlower[i] +
        roseCarbonTraits.rootMaintenance * roseRoot[i] +
        roseCarbonTraits.storageMaintenance * roseStore[i]);
    const assimilateAfterMaintenanceB = gppB - maintenanceRespB;
    const assimilateAfterMaintenanceR = gppR - maintenanceRespR;
    const growthRespB = Math.max(0, assimilateAfterMaintenanceB) * baobabCarbonTraits.growthRespirationFraction;
    const growthRespR = Math.max(0, assimilateAfterMaintenanceR) * roseCarbonTraits.growthRespirationFraction;
    const nppB = Math.max(0, assimilateAfterMaintenanceB - growthRespB);
    const nppR = Math.max(0, assimilateAfterMaintenanceR - growthRespR);
    const carbonBalanceB = assimilateAfterMaintenanceB > 0 ? nppB : assimilateAfterMaintenanceB;
    const carbonBalanceR = assimilateAfterMaintenanceR > 0 ? nppR : assimilateAfterMaintenanceR;
    const autotrophicRespirationB = maintenanceRespB + growthRespB;
    const autotrophicRespirationR = maintenanceRespR + growthRespR;
    if (writeDiagnostics) {
      state.gppBaobab[i] = gppB;
      state.gppRose[i] = gppR;
      state.nppBaobab[i] = nppB;
      state.nppRose[i] = nppR;
      state.carbonBalanceBaobab[i] = carbonBalanceB;
      state.carbonBalanceRose[i] = carbonBalanceR;
      state.maintenanceRespirationBaobab[i] = maintenanceRespB;
      state.maintenanceRespirationRose[i] = maintenanceRespR;
      state.growthRespirationBaobab[i] = growthRespB;
      state.growthRespirationRose[i] = growthRespR;
      state.autotrophicRespirationBaobab[i] = autotrophicRespirationB;
      state.autotrophicRespirationRose[i] = autotrophicRespirationR;
    }
    if (writeDiagnostics) {
      state.et0[i] = et0;
      state.soilEvapM[i] = soilEvap + surfaceEvap;
      state.transpirationBaobabM[i] = baobabTranspiration;
      state.transpirationRoseM[i] = uR;
    }
    const baobabMortality = baobabStressMortality(stressB, canopyLightBStress, sub, ashLoad, wetness);
    const roseMortality = roseStressMortality(stressR, canopyLightRStress, sub, ashLoad);

    const baobabSeedProdPotential = baobabBlocked[i] ? 0 : baobabSeedProduction(baobabStem[i], baobabLeaf[i], stressB, baobabTempStress);
    const baobabSeedProd = Math.min(baobabSeedProdPotential, Math.max(0, baobabStore[i]) * 0.32 / MODEL_DT_DAYS);
    const roseSeedProd = roseSeedProductionRate[i];
    const roseSeedInput = roseSeedArrival[i];
    const nextBaobabReadiness = baobabBlocked[i]
      ? 0
      : updateSeedReadiness(baobabGerminationReadiness[i], wetness, tempC, "baobab");
    const nextRoseReadiness = updateSeedReadiness(roseGerminationReadiness[i], wetness, tempC, "rose");
    baobabGerminationReadinessN[i] = nextBaobabReadiness;
    roseGerminationReadinessN[i] = nextRoseReadiness;
    const effectiveBaobabSeedPool = baobabSeed[i] + baobabSeedProd * MODEL_DT_DAYS * 0.18;
    const effectiveRoseSeedPool = roseSeed[i] + roseSeedInput * MODEL_DT_DAYS;
    const openFraction = Math.max(0, 1 - cover);
    const baobabGerminationFlux = effectiveBaobabSeedPool * baobabGerminationRate(state, i, wetness, baobabTempStress, lightBStress, substrateIndex, nextBaobabReadiness);
    const roseGerminationFlux = effectiveRoseSeedPool * roseGerminationRate(state, i, wetness, roseTempStress, lightRStress, ashLoad, nextRoseReadiness, openFraction);
    const baobabSeedDeath =
      (seedMortalityRate(wetness, tempC, 0.0022, 0.014) + 0.035 * clamp((wetness - 0.68) / 0.24)) *
      baobabSeed[i];
    const roseSeedDeath = seedMortalityRate(wetness, tempC, ROSE_SEED_BASE_MORTALITY, ROSE_SEED_STRESS_MORTALITY) * roseSeed[i];
    const seedB = baobabBlocked[i] ? 0 : Math.min(baobabSeed[i] / MODEL_DT_DAYS + baobabSeedProd, baobabGerminationFlux);
    const seedFromRoseBank = Math.min(roseSeed[i] / MODEL_DT_DAYS + roseSeedInput, roseGerminationFlux);
    const seedR = seedFromRoseBank;
    if (writeDiagnostics) {
      state.baobabGermination[i] = seedB;
      state.roseGermination[i] = seedR;
    }
    baobabSeedN[i] = baobabBlocked[i] ? 0 : clamp(
      baobabSeed[i] + MODEL_DT_DAYS * (baobabSeedTransport[i] + baobabSeedProd - seedB - baobabSeedDeath),
      0,
      0.7
    );
    roseSeedN[i] = clamp(
      roseSeed[i] + MODEL_DT_DAYS * (roseSeedTransport[i] + roseSeedInput - seedFromRoseBank - roseSeedDeath),
      0,
      0.35
    );
    const baobabLitter = updateBaobabCarbonPoolsInto(
      baobabLitterScratch,
      state,
      i,
      carbonBalanceB,
      baobabMortality,
      seedB,
      baobabSeedProd,
      stressB,
      lightBStress,
      baobabBlocked[i] === 1,
      storeCap,
      writeDiagnostics
    );
    const roseLitter = updateRoseCarbonPoolsInto(
      roseLitterScratch,
      state,
      i,
      carbonBalanceR,
      roseMortality,
      seedR,
      roseSeedProd,
      stressR,
      canopyLightRStress,
      roseSoil,
      ashLoad,
      roseStoreCapacity(roseRoot[i], roseLeaf[i]),
      writeDiagnostics
    );
    const failedBaobabEstablishment = seedB * (1 - BAOBAB_CARBON_TRAITS.seedEstablishment);
    const failedRoseEstablishment = seedR * (1 - ROSE_CARBON_TRAITS.seedEstablishment);
    const seedLitterFast = baobabSeedDeath + roseSeedDeath + failedBaobabEstablishment + failedRoseEstablishment;
    const litterFastInput = baobabLitter.fast + roseLitter.fast + seedLitterFast;
    const litterSlowInput = baobabLitter.slow + roseLitter.slow;
    if (writeDiagnostics) {
      state.litterInputBaobabCarbon[i] = baobabLitter.total;
      state.litterInputRoseCarbon[i] = roseLitter.total;
      state.litterInputSeedCarbon[i] = seedLitterFast;
    }
    const plantNutrientUptake = 0.052 * Math.max(0, gppB) + 0.068 * Math.max(0, gppR);
    if (useWasmSoilBiogeochemistry) {
      soilBioWetness[i] = wetness;
      soilBioTempC[i] = tempC;
      soilBioAshLoad[i] = ashLoad;
      soilBioTopSat[i] = s0;
      soilBioGroundwaterSat[i] = gwSat;
      soilBioLitterFastInput[i] = litterFastInput;
      soilBioLitterSlowInput[i] = litterSlowInput;
      soilBioPlantNutrientUptake[i] = plantNutrientUptake;
    } else {
      const aggregateLitter = Math.max(0, state.litterCarbon[i]);
      const pooledLitter = litterFastCarbon[i] + litterSlowCarbon[i];
      if (Math.abs(pooledLitter - aggregateLitter) > 1e-6) {
        litterFastCarbon[i] = aggregateLitter * LITTER_FAST_INITIAL_FRACTION;
        litterSlowCarbon[i] = aggregateLitter * (1 - LITTER_FAST_INITIAL_FRACTION);
      }
      const wetnessClamped = clamp(wetness);
      const decomposition = litterDecompositionRate(wetness, tempC, substrateIndex, ashLoad);
      const fastDecay = decomposition * 1.42 * litterFastCarbon[i];
      const slowDecay = decomposition * 0.32 * litterSlowCarbon[i];
      const litterDecay = fastDecay + slowDecay;
      const humified = litterDecay * LITTER_HUMIFICATION_FRACTION;
      const litterRespiration = Math.max(0, litterDecay - humified);
      const activeDecayRate = (0.0035 + 0.018 * wetnessClamped * temperatureResponse(tempC, 25, -5, 45)) *
        (SUBSTRATE_ACTIVE_SOC_DECAY_FACTOR[substrateIndex] || 1);
      const stableDecayRate = 0.00018 + 0.0011 * wetnessClamped * temperatureResponse(tempC, 22, -6, 42);
      const activeDecay = activeDecayRate * soilCarbonActive[i];
      const stableDecay = stableDecayRate * soilCarbonStable[i];
      const stabilized = activeDecay * ACTIVE_SOC_STABILIZATION_FRACTION;
      const activeRespiration = Math.max(0, activeDecay - stabilized);
      const soilRespiration = litterRespiration + activeRespiration + stableDecay;
      const mineralization = 0.32 * litterDecay + 0.24 * activeDecay + 0.08 * stableDecay;
      const ashWeathering = 0.00018 * clamp(ashLoad) * (0.35 + 0.65 * wetness);
      const mineralWeathering =
        0.00022 *
        sub.nutrientR *
        (0.42 + 0.58 * clamp(depth[i] / 1.35)) *
        (0.35 + 0.65 * wetnessClamped) *
        temperatureResponse(tempC, 18, -8, 42);
      const organicNitrogenRelease =
        0.00042 *
        (soilCarbonActive[i] + 0.28 * soilCarbonStable[i]) *
        wetnessClamped *
        temperatureResponse(tempC, 20, -6, 42);
      const leachableN = state.soilMineralN[i] * nutrientMobileFraction(s0, gwSat, soilCarbonActive[i], soilCarbonStable[i]);
      const leaching = (0.00045 + 0.0032 * wetness * wetness) * leachableN;
      litterFastCarbonN[i] = clamp(litterFastCarbon[i] + MODEL_DT_DAYS * (litterFastInput - fastDecay), 0, 1.4);
      litterSlowCarbonN[i] = clamp(litterSlowCarbon[i] + MODEL_DT_DAYS * (litterSlowInput - slowDecay), 0, 1.8);
      soilCarbonActiveN[i] = clamp(soilCarbonActive[i] + MODEL_DT_DAYS * (humified - activeDecay), 0, 2.4);
      soilCarbonStableN[i] = clamp(soilCarbonStable[i] + MODEL_DT_DAYS * (stabilized - stableDecay), 0, 4.2);
      litterCarbonN[i] = clamp(litterFastCarbonN[i] + litterSlowCarbonN[i], 0, 1.8);
      if (writeDiagnostics) {
        state.litterInputCarbon[i] = litterFastInput + litterSlowInput;
        state.litterFastInputCarbon[i] = litterFastInput;
        state.litterSlowInputCarbon[i] = litterSlowInput;
        state.litterFastDecayCarbon[i] = fastDecay;
        state.litterSlowDecayCarbon[i] = slowDecay;
        state.litterHumificationCarbon[i] = humified;
        state.litterFastResidualCarbon[i] =
          (litterFastCarbonN[i] - litterFastCarbon[i]) - MODEL_DT_DAYS * (litterFastInput - fastDecay);
        state.litterSlowResidualCarbon[i] =
          (litterSlowCarbonN[i] - litterSlowCarbon[i]) - MODEL_DT_DAYS * (litterSlowInput - slowDecay);
        state.soilActiveDecayCarbon[i] = activeDecay;
        state.soilStabilizationCarbon[i] = stabilized;
        state.soilStableDecayCarbon[i] = stableDecay;
        state.litterRespirationCarbon[i] = litterRespiration;
        state.soilActiveRespirationCarbon[i] = activeRespiration;
        state.soilStableRespirationCarbon[i] = stableDecay;
        state.soilActiveResidualCarbon[i] =
          (soilCarbonActiveN[i] - soilCarbonActive[i]) - MODEL_DT_DAYS * (humified - activeDecay);
        state.soilStableResidualCarbon[i] =
          (soilCarbonStableN[i] - soilCarbonStable[i]) - MODEL_DT_DAYS * (stabilized - stableDecay);
      }
      if (writeDiagnostics) {
        state.soilCarbonRespiration[i] = soilRespiration;
      }
      soilMineralNN[i] = clamp(
        state.soilMineralN[i] +
          MODEL_DT_DAYS * (soilMineralTransport[i] + 0.38 * mineralization + organicNitrogenRelease + mineralWeathering + ashWeathering - plantNutrientUptake - leaching),
        0.005,
        1.35 + 0.25 * clamp(roseSoil / 1.8)
      );
      if (writeDiagnostics) {
        state.nutrientStressBaobab[i] = nutrientStress(soilMineralNN[i], sub.nutrientB);
        state.nutrientStressRose[i] = nutrientStress(soilMineralNN[i], sub.nutrientR * clamp(0.45 + 0.55 * roseSoil, 0.32, 1.45));
      }
    }
    const litterWater = 0.00018 * (baobabLitter.total + roseLitter.total + baobabSeedDeath + roseSeedDeath);
    if (writeDiagnostics) {
      const carbonInput = (gppB + gppR) * MODEL_DT_DAYS;
      const carbonRespiration =
        (autotrophicRespirationB + autotrophicRespirationR + state.soilCarbonRespiration[i]) *
        MODEL_DT_DAYS;
      const carbonTransport =
        (baobabSeedTransport[i] + roseSeedTransport[i] + roseSeedInput - roseSeedProd) *
        MODEL_DT_DAYS;
      const plantCarbonAfter =
        baobabLeafN[i] +
        baobabStemN[i] +
        baobabRootN[i] +
        baobabStoreN[i] +
        roseLeafN[i] +
        roseFlowerN[i] +
        roseRootN[i] +
        roseStoreN[i];
      const seedCarbonAfter = baobabSeedN[i] + roseSeedN[i];
      const litterCarbonAfter = litterFastCarbonN[i] + litterSlowCarbonN[i];
      const soilOrganicCarbonAfter = soilCarbonActiveN[i] + soilCarbonStableN[i];
      const carbonStorageAfter = plantCarbonAfter + seedCarbonAfter + litterCarbonAfter + soilOrganicCarbonAfter;
      const carbonStorageChange = carbonStorageAfter - carbonStorageBefore;
      plantCarbonC[i] = plantCarbonAfter;
      seedCarbonC[i] = seedCarbonAfter;
      litterPoolCarbonC[i] = litterCarbonAfter;
      soilOrganicCarbonC[i] = soilOrganicCarbonAfter;
      ecosystemCarbonC[i] = carbonStorageAfter;
      netEcosystemProductionC[i] =
        gppB + gppR -
        autotrophicRespirationB -
        autotrophicRespirationR -
        state.soilCarbonRespiration[i];
      carbonInputC[i] = carbonInput;
      carbonRespirationC[i] = carbonRespiration;
      carbonTransportC[i] = carbonTransport;
      carbonDisturbanceC[i] = 0;
      carbonStorageBeforeC[i] = carbonStorageBefore;
      carbonStorageChangeC[i] = carbonStorageChange;
      carbonResidualC[i] = carbonStorageChange - (carbonInput + carbonTransport - carbonRespiration - carbonDisturbanceC[i]);
    }

    if (usedPlantWaterFluxBatch) {
      state.hydrologySink0[i] -= litterWater;
    } else {
      state.hydrologyThroughfall[i] = throughfall;
      state.hydrologyVegFeedback[i] = vegFeedback;
      state.hydrologySink0[i] = soilEvap + uB0 + uR0 - litterWater;
      state.hydrologySink1[i] = uB1 + uR1;
      state.hydrologySink2[i] = uB2 + uR2;
      state.hydrologyGroundwaterSink[i] = uB3;
      state.hydrologySurfaceEvapDemandM[i] = surfaceEvap * MODEL_DT_DAYS;
      if (writeDiagnostics) {
        state.hydrologyInputM[i] = throughfall * MODEL_DT_DAYS;
        state.hydrologyCanopyEvapM[i] = canopyEvaporation * MODEL_DT_DAYS;
        state.hydrologySoilEvapM[i] = soilEvap * MODEL_DT_DAYS;
        state.hydrologyRootUptakeM[i] = (uB0 + uB1 + uB2 + uB3 + uR0 + uR1 + uR2) * MODEL_DT_DAYS;
        state.hydrologyLitterWaterM[i] = litterWater * MODEL_DT_DAYS;
      }
    }
    MBn[i] = baobabLeafN[i] + baobabStemN[i] + baobabRootN[i];
    MRn[i] = roseLeafN[i] + roseFlowerN[i] + roseRootN[i];

    roseStoreN[i] = clamp(roseStoreN[i], 0, roseStoreCapacity(roseRootN[i], roseLeafN[i]));
    SBn[i] = baobabStoreN[i];
  }
  }
  if (profileSink) {
    const now = performance.now();
    addProfileTime(profileSink, "cellLoop", now - profileSectionStart);
    profileSectionStart = now;
  }

  if (useWasmSoilBiogeochemistry) {
    const soilBioProfileStart = profileSink ? performance.now() : 0;
    if (!runWasmSoilBiogeochemistry(model, { modelDtDays: MODEL_DT_DAYS })) {
      updateSoilBiogeochemistryFromInputs(model);
    }
    if (profileSink) {
      const now = performance.now();
      addProfileTime(profileSink, "soilBiogeochemistryWasm", now - soilBioProfileStart);
      profileSectionStart = now;
    }
  }

  runHydrologySubsteps(model, true);
  if (profileSink) {
    const now = performance.now();
    addProfileTime(profileSink, "verticalHydrology", now - profileSectionStart);
    profileSectionStart = now;
  }

  swap(state, "canopyWater", "canopyWaterN");
  swap(state, "baobabLeaf", "baobabLeafN");
  swap(state, "baobabStem", "baobabStemN");
  swap(state, "baobabRoot", "baobabRootN");
  swap(state, "baobabStore", "baobabStoreN");
  swap(state, "baobabSeed", "baobabSeedN");
  swap(state, "baobabGerminationReadiness", "baobabGerminationReadinessN");
  swap(state, "roseLeaf", "roseLeafN");
  swap(state, "roseFlower", "roseFlowerN");
  swap(state, "roseRoot", "roseRootN");
  swap(state, "roseStore", "roseStoreN");
  swap(state, "roseSeed", "roseSeedN");
  swap(state, "roseGerminationReadiness", "roseGerminationReadinessN");
  swap(state, "soilMineralN", "soilMineralNN");
  swap(state, "litterCarbon", "litterCarbonN");
  swap(state, "litterFastCarbon", "litterFastCarbonN");
  swap(state, "litterSlowCarbon", "litterSlowCarbonN");
  swap(state, "soilCarbonActive", "soilCarbonActiveN");
  swap(state, "soilCarbonStable", "soilCarbonStableN");
  swap(state, "MB", "MBn");
  swap(state, "MR", "MRn");
  swap(state, "SB", "SBn");
  model.day += MODEL_DT_DAYS;
  if (profileSink) {
    const now = performance.now();
    addProfileTime(profileSink, "swap", now - profileSectionStart);
    addProfileTime(profileSink, "totalStep", now - profileStepStart);
    profileSink.stepCount = (profileSink.stepCount ?? 0) + 1;
  }
}

function infiltrateIrrigationPulse(model, cellIds) {
  const { state, size } = model;
  const ids = Array.isArray(cellIds) ? cellIds : Array.from(cellIds);
  const lookupByIndex = hydraulicLookups();
  const gwMultiplier = clamp(model.params.gwFlow / GROUNDWATER_DEFAULT_FLOW, 0, 8);
  const dtDays = IRRIGATION_INFILTRATION_DAYS / IRRIGATION_INFILTRATION_SUBSTEPS;
  for (let stepIndex = 0; stepIndex < IRRIGATION_INFILTRATION_SUBSTEPS; stepIndex += 1) {
    for (const cellId of ids) {
      updateHydraulicStateForCell(model, cellId, lookupByIndex, gwMultiplier);
      richardsColumnSemiImplicitUpdateInPlace(
        model,
        cellId,
        dtDays,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        false
      );
    }
    for (const cellId of ids) {
      const layer0Index = soilIndex(size, 0, cellId);
      const layer1Index = soilIndex(size, 1, cellId);
      const layer2Index = soilIndex(size, 2, cellId);
      state.H[cellId] = state.Hn[cellId];
      state.soilWater[layer0Index] = state.soilWaterN[layer0Index];
      state.soilWater[layer1Index] = state.soilWaterN[layer1Index];
      state.soilWater[layer2Index] = state.soilWaterN[layer2Index];
      state.groundwaterStorage[cellId] = state.groundwaterStorageN[cellId];
      syncWaterAggregatesForCell(state, cellId, size);
    }
  }
  for (const cellId of ids) {
    updateHydraulicStateForCell(model, cellId, lookupByIndex, gwMultiplier);
  }
}

function recordIrrigationRainDiagnostic(model, targetIds, targetWeights, amountM, rateMDay, durationDays) {
  void model;
  void targetIds;
  void targetWeights;
  void amountM;
  void rateMDay;
  void durationDays;
}

function applyWater(model, cellIds, amountM = 0.018, rateMDay = null, durationDays = IRRIGATION_INFILTRATION_DAYS) {
  const weightedIds = new Map();
  for (const cellId of cellIds) {
    weightedIds.set(cellId, Math.max(weightedIds.get(cellId) ?? 0, 1));
  }

  const entries = [...weightedIds];
  const targetIds = new Int32Array(entries.length);
  const targetWeights = new Float32Array(entries.length);
  for (let index = 0; index < entries.length; index += 1) {
    targetIds[index] = entries[index][0];
    targetWeights[index] = entries[index][1];
  }
  const totalDtDays = Math.max(
    IRRIGATION_INFILTRATION_SUBSTEP_DAYS,
    Number.isFinite(durationDays) && durationDays > 0 ? durationDays : IRRIGATION_INFILTRATION_DAYS
  );
  const substeps = Math.max(
    1,
    Math.min(64, Math.ceil(totalDtDays / IRRIGATION_INFILTRATION_SUBSTEP_DAYS))
  );
  if (
    runWasmApplyWater(model, targetIds, targetWeights, amountM, {
      ...hydraulicLookupTablesForWasm(),
      totalDtDays,
      substeps,
      hydraulicLookupSteps: HYDRAULIC_LOOKUP_STEPS,
      groundwaterFlowMultiplier: clamp(model.params.gwFlow / GROUNDWATER_DEFAULT_FLOW, 0, 8)
    })
  ) {
    recordIrrigationRainDiagnostic(model, targetIds, targetWeights, amountM, rateMDay, durationDays);
    return;
  }
  throw new Error("C/WASM water action is required for asteroid garden simulation.");
}

function removeBaobab(model, cellId, amount = 0.48) {
  if (runWasmRemoveBaobab(model, cellId, amount)) {
    return;
  }
  throw new Error("C/WASM baobab removal is required for asteroid garden simulation.");
}

function removeRose(model, cellId, amount = 0.48) {
  if (runWasmRemoveRose(model, cellId, amount)) {
    return;
  }
  throw new Error("C/WASM rose removal is required for asteroid garden simulation.");
}

function recordDisturbanceExport(state, cellId, exportedCarbon) {
  const exported = Math.max(0, exportedCarbon);
  if (exported <= 0) {
    return;
  }

  state.disturbanceCarbonExportC[cellId] += exported;
  state.carbonDisturbanceC[cellId] += exported;
  state.carbonStorageChangeC[cellId] -= exported;
  state.carbonResidualC[cellId] =
    state.carbonStorageChangeC[cellId] -
    (state.carbonInputC[cellId] + state.carbonTransportC[cellId] - state.carbonRespirationC[cellId] - state.carbonDisturbanceC[cellId]);
}

function tendRose(model, cellId, roseCell, amount = 0.035) {
  if (cellId !== roseCell) {
    return;
  }

  const { state } = model;
  state.roseLeaf[cellId] = clamp(state.roseLeaf[cellId] + amount * 0.45, 0, 0.85);
  state.roseFlower[cellId] = clamp(state.roseFlower[cellId] + amount * 0.32, 0, 0.52);
  state.roseRoot[cellId] = clamp(state.roseRoot[cellId] + amount * 0.23, 0, 0.5);
  state.roseStore[cellId] = clamp(state.roseStore[cellId] + amount * 0.12, 0, roseStoreCapacity(state.roseRoot[cellId], state.roseLeaf[cellId]));
  syncRoseMassFromPools(state, cellId);
}

function roseHealth(model, roseCell) {
  const { state } = model;
  const cap0 = state.soilCap[roseCell] || soilLayerCapacity(state.depth[roseCell], SUBSTRATES[state.substrate[roseCell]], 0);
  const w0n = clamp(state.W0[roseCell] / cap0);
  const roseMass = roseVigorIndex(state, roseCell);
  const baobabShade = clamp(state.MB[roseCell] * 0.9);
  return clamp(0.16 + roseMass * 0.55 + w0n * 0.24 - baobabShade * 0.25);
}

function syncBasicToGame(model, gameState) {
  const { state, size } = model;
  const {
    W0,
    W1,
    H,
    R,
    MB,
    soilCap,
    soilMineralN,
    groundwaterCap,
    depth,
    roseFertility,
    rainMemory,
    sunlight,
    baobabStem,
    baobabRoot,
    baobabStore,
    roseLeaf,
    roseFlower,
    roseRoot,
    roseStore
  } = state;
  const moisture = gameState.moisture;
  const soil = gameState.soil;
  const baobab = gameState.baobab;
  const flower = gameState.flower;
  const surfaceWater = gameState.surfaceWater;
  const topSoilWater = gameState.topSoilWater;
  const rainfallMm = gameState.rainfallMm;
  const rainfallInstantMm = gameState.rainfallInstantMm;
  const meanTempC = gameState.meanTempC;
  const sunlightOut = gameState.sunlight;
  const baobabHeight = gameState.baobabHeight;
  const roseHeight = gameState.roseHeight;
  const roseFertilityOut = gameState.roseFertility;
  let maxRainfallMm = 0;
  let maxBaobab = 0;

  for (let i = 0; i < size; i += 1) {
    const rawW0n = W0[i] / soilCap[i];
    const rawW1n = W1[i] / groundwaterCap[i];
    const w0n = rawW0n <= 0 ? 0 : rawW0n >= 1 ? 1 : rawW0n;
    const w1n = rawW1n <= 0 ? 0 : rawW1n >= 1 ? 1 : rawW1n;
    const rawSoilNutrient = soilMineralN[i] / 0.95;
    const soilNutrient = rawSoilNutrient <= 0 ? 0 : rawSoilNutrient >= 1 ? 1 : rawSoilNutrient;
    const rawMoisture = 0.66 * w0n + 0.34 * w1n;
    moisture[i] = rawMoisture <= 0 ? 0 : rawMoisture >= 1 ? 1 : rawMoisture;
    const rawSoil = 0.1 + depth[i] * 0.34 + soilNutrient * 0.32 + roseFertility[i] * 0.12;
    soil[i] = rawSoil <= 0 ? 0 : rawSoil >= 1 ? 1 : rawSoil;
    const rawBaobab = MB[i] / 1.05;
    const baobabValue = rawBaobab <= 0 ? 0 : rawBaobab >= 1 ? 1 : rawBaobab;
    const rLeaf = roseLeaf[i] > 0 ? roseLeaf[i] : 0;
    const rFlower = roseFlower[i] > 0 ? roseFlower[i] : 0;
    const rRoot = roseRoot[i] > 0 ? roseRoot[i] : 0;
    const rStore = roseStore[i] > 0 ? roseStore[i] : 0;
    let flowerValue = 0;
    if (rLeaf > 0 || rFlower > 0 || rRoot > 0 || rStore > 0) {
      const perennialCarbon = rLeaf + rRoot + 0.35 * rStore;
      const rawVigor = (perennialCarbon + 0.18 * rFlower) / 0.43;
      const vigor = rawVigor <= 0 ? 0 : rawVigor >= 1 ? 1 : rawVigor;
      const bloom = 1 - Math.exp(-34 * rFlower);
      const rawVisible = 0.62 * vigor + 0.38 * (bloom <= 0 ? 0 : bloom >= 1 ? 1 : bloom);
      flowerValue = rawVisible <= 0 ? 0 : rawVisible >= 1 ? 1 : rawVisible;
    }
    baobab[i] = baobabValue;
    flower[i] = flowerValue;
    if (baobabValue > maxBaobab) {
      maxBaobab = baobabValue;
    }
    if (surfaceWater) {
      const rawSurface = H[i] * 70;
      surfaceWater[i] = rawSurface <= 0 ? 0 : rawSurface >= 1 ? 1 : rawSurface;
    }
    if (gameState.surfaceWaterMm) {
      gameState.surfaceWaterMm[i] = H[i] * 1000;
    }
    if (topSoilWater) {
      topSoilWater[i] = w0n;
    }
    if (rainfallMm) {
      const rainfallMmValue = rainMemory[i] * 1000;
      rainfallMm[i] = rainfallMmValue;
      if (rainfallMmValue > maxRainfallMm) {
        maxRainfallMm = rainfallMmValue;
      }
    }
    if (rainfallInstantMm) {
      rainfallInstantMm[i] = R[i] * 1000;
    }
    if (meanTempC) {
      meanTempC[i] = model.planetPreset === "earth" ? state.climateMeanTempC[i] : (state.surfaceTempC[i] || meanTempC[i]);
    }
    if (sunlightOut) {
      const rawSunlight = sunlight[i];
      sunlightOut[i] = rawSunlight <= 0 ? 0 : rawSunlight >= 1 ? 1 : rawSunlight;
    }
    if (baobabHeight) {
      if (baobabValue > 0.08) {
        const woody = baobabStem[i] > 0 ? baobabStem[i] : 0;
        const root = baobabRoot[i] > 0 ? baobabRoot[i] : 0;
        const support = root / Math.max(0.04, woody + root);
        const reserve = baobabStore[i] / Math.max(0.04, baobabStore[i] + woody);
        const structuralHeight = 1 - Math.exp(-1.65 * Math.pow(woody, 0.58));
        const rawHeight = structuralHeight * (0.82 + 0.18 * support) * (0.9 + 0.1 * reserve);
        baobabHeight[i] = rawHeight <= 0 ? 0 : rawHeight >= 1 ? 1 : rawHeight;
      } else {
        baobabHeight[i] = 0;
      }
    }
    if (roseHeight) {
      if (flowerValue > 0.03) {
        const canopy = 1 - Math.exp(-2.7 * rLeaf - 2.2 * rFlower);
        const rootSupportRaw = rRoot / Math.max(0.04, rLeaf + rFlower + rRoot);
        const rootSupport = rootSupportRaw <= 0 ? 0 : rootSupportRaw >= 1 ? 1 : rootSupportRaw;
        const flowering = 1 - Math.exp(-4.4 * rFlower);
        const rawHeight = canopy * (0.74 + 0.16 * rootSupport + 0.1 * flowering);
        roseHeight[i] = rawHeight <= 0 ? 0 : rawHeight >= 1 ? 1 : rawHeight;
      } else {
        roseHeight[i] = 0;
      }
    }
    if (roseFertilityOut) {
      roseFertilityOut[i] = roseFertility[i];
    }
  }
  gameState.maxRainfallMm = maxRainfallMm;
  gameState.maxBaobab = maxBaobab;
}

function syncToGame(model, gameState, options = {}) {
  const detail = options.detail !== false;
  if (!detail) {
    syncBasicToGame(model, gameState);
    return;
  }

  const { params, state, size } = model;
  const soilHeadMin = [Infinity, Infinity, Infinity];
  const soilHeadMax = [-Infinity, -Infinity, -Infinity];
  const soilKLogMin = [Infinity, Infinity, Infinity];
  const soilKLogMax = [-Infinity, -Infinity, -Infinity];
  if (
    detail &&
    (
    gameState.topSoilHeadM || gameState.midSoilHeadM || gameState.deepSoilHeadM ||
    gameState.topSoilHeadNorm || gameState.midSoilHeadNorm || gameState.deepSoilHeadNorm ||
    gameState.topSoilConductivityMDay || gameState.midSoilConductivityMDay || gameState.deepSoilConductivityMDay ||
    gameState.topSoilConductivityNorm || gameState.midSoilConductivityNorm || gameState.deepSoilConductivityNorm
    )
  ) {
    for (let i = 0; i < size; i += 1) {
      for (let layer = 0; layer < SOIL_LAYER_COUNT; layer += 1) {
        const index = soilIndex(size, layer, i);
        const head = state.soilHead[index];
        const kLog = Math.log10(Math.max(1e-9, state.soilHydraulicK[index]));
        soilHeadMin[layer] = Math.min(soilHeadMin[layer], head);
        soilHeadMax[layer] = Math.max(soilHeadMax[layer], head);
        soilKLogMin[layer] = Math.min(soilKLogMin[layer], kLog);
        soilKLogMax[layer] = Math.max(soilKLogMax[layer], kLog);
      }
    }
  }
  const soilHeadRange = soilHeadMin.map((min, layer) => Math.max(1e-6, soilHeadMax[layer] - min));
  const soilKLogRange = soilKLogMin.map((min, layer) => Math.max(1e-6, soilKLogMax[layer] - min));
  let groundwaterHeadMin = Infinity;
  let groundwaterHeadMax = -Infinity;
  if (detail && (gameState.groundwaterHeadM || gameState.groundwaterHeadNorm)) {
    for (let i = 0; i < size; i += 1) {
      groundwaterHeadMin = Math.min(groundwaterHeadMin, state.groundwaterHead[i]);
      groundwaterHeadMax = Math.max(groundwaterHeadMax, state.groundwaterHead[i]);
    }
  }
  const groundwaterHeadRange = Math.max(1e-6, groundwaterHeadMax - groundwaterHeadMin);
  let maxRainfallMm = 0;
  let maxBaobab = 0;
  for (let i = 0; i < size; i += 1) {
    const sub = SUBSTRATES[state.substrate[i]];
    const cap0 = state.soilCap[i];
    const gwCap = state.groundwaterCap[i];
    const w0n = clamp(state.W0[i] / cap0);
    const w1n = clamp(state.W1[i] / gwCap);
    const wet = clamp(0.66 * w0n + 0.34 * w1n);
    gameState.moisture[i] = wet;
    const soilNutrient = clamp(state.soilMineralN[i] / 0.95);
    gameState.soil[i] = clamp(0.1 + state.depth[i] * 0.34 + soilNutrient * 0.32 + state.roseFertility[i] * 0.12);
    if (detail && gameState.soilNutrient) {
      gameState.soilNutrient[i] = soilNutrient;
    }
    if (detail && gameState.litterCarbon) {
      gameState.litterCarbon[i] = clamp(state.litterCarbon[i] / 0.7);
    }
    if (detail && gameState.litterFastCarbonGC) {
      gameState.litterFastCarbonGC[i] = state.litterFastCarbon[i] * 1000;
    }
    if (detail && gameState.litterSlowCarbonGC) {
      gameState.litterSlowCarbonGC[i] = state.litterSlowCarbon[i] * 1000;
    }
    if (detail && gameState.soilOrganicCarbon) {
      gameState.soilOrganicCarbon[i] = clamp((state.soilCarbonActive[i] + state.soilCarbonStable[i]) / 1.4);
    }
    if (detail && gameState.soilActiveCarbon) {
      gameState.soilActiveCarbon[i] = clamp(state.soilCarbonActive[i] / 0.55);
    }
    if (detail && gameState.soilStableCarbon) {
      gameState.soilStableCarbon[i] = clamp(state.soilCarbonStable[i] / 1.25);
    }
    if (detail && gameState.soilActiveCarbonGC) {
      gameState.soilActiveCarbonGC[i] = state.soilCarbonActive[i] * 1000;
    }
    if (detail && gameState.soilStableCarbonGC) {
      gameState.soilStableCarbonGC[i] = state.soilCarbonStable[i] * 1000;
    }
    if (detail && gameState.soilCarbonRespiration) {
      gameState.soilCarbonRespiration[i] = state.soilCarbonRespiration[i];
    }
    if (detail && gameState.nutrientStressBaobab) {
      gameState.nutrientStressBaobab[i] = state.nutrientStressBaobab[i];
    }
    if (detail && gameState.nutrientStressRose) {
      gameState.nutrientStressRose[i] = state.nutrientStressRose[i];
    }
    const baobabValue = clamp(state.MB[i] / 1.05);
    gameState.baobab[i] = baobabValue;
    maxBaobab = Math.max(maxBaobab, baobabValue);
    gameState.flower[i] = roseVisibleIndex(state, i);
    if (gameState.surfaceWater) {
      gameState.surfaceWater[i] = clamp(state.H[i] * 70);
    }
    if (gameState.surfaceWaterMm) {
      gameState.surfaceWaterMm[i] = state.H[i] * 1000;
    }
    if (gameState.topSoilWater) {
      gameState.topSoilWater[i] = w0n;
    }
    if (detail && gameState.midSoilWater) {
      gameState.midSoilWater[i] = clamp(state.soilWater[soilIndex(size, 1, i)] / state.soilCap[size + i]);
    }
    if (detail && gameState.deepSoilWater) {
      gameState.deepSoilWater[i] = clamp(state.soilWater[soilIndex(size, 2, i)] / state.soilCap[size * 2 + i]);
    }
    if (detail && gameState.groundwater) {
      gameState.groundwater[i] = w1n;
    }
    if (detail && gameState.rainfall) {
      gameState.rainfall[i] = clamp(state.rainMemory[i] * (model.planetPreset === "earth" ? 160 : 360));
    }
    if (gameState.rainfallMm) {
      const rainfallMmValue = state.rainMemory[i] * 1000;
      gameState.rainfallMm[i] = rainfallMmValue;
      maxRainfallMm = Math.max(maxRainfallMm, rainfallMmValue);
    }
    if (gameState.rainfallInstantMm) {
      gameState.rainfallInstantMm[i] = state.R[i] * 1000;
    }
    if (gameState.meanTempC) {
      gameState.meanTempC[i] = model.planetPreset === "earth" ? state.climateMeanTempC[i] : (state.surfaceTempC[i] || gameState.meanTempC[i]);
    }
    if (gameState.sunlight) {
      gameState.sunlight[i] = clamp(state.sunlight[i]);
    }
    if (gameState.baobabHeight) {
      gameState.baobabHeight[i] = baobabHeightIndex(state, i);
    }
    if (gameState.roseHeight) {
      gameState.roseHeight[i] = roseHeightIndex(state, i);
    }
    if (gameState.substrate) {
      gameState.substrate[i] = sub.key;
    }
    if (gameState.roseFertility) {
      gameState.roseFertility[i] = state.roseFertility[i];
    }
    if (!detail) {
      continue;
    }
    const topHead = state.soilHead[soilIndex(size, 0, i)];
    const midHead = state.soilHead[soilIndex(size, 1, i)];
    const deepHead = state.soilHead[soilIndex(size, 2, i)];
    const topK = state.soilHydraulicK[soilIndex(size, 0, i)];
    const midK = state.soilHydraulicK[soilIndex(size, 1, i)];
    const deepK = state.soilHydraulicK[soilIndex(size, 2, i)];
    if (gameState.topSoilHeadM) {
      gameState.topSoilHeadM[i] = topHead;
    }
    if (gameState.midSoilHeadM) {
      gameState.midSoilHeadM[i] = midHead;
    }
    if (gameState.deepSoilHeadM) {
      gameState.deepSoilHeadM[i] = deepHead;
    }
    if (gameState.topSoilHeadNorm) {
      gameState.topSoilHeadNorm[i] = clamp((topHead - soilHeadMin[0]) / soilHeadRange[0]);
    }
    if (gameState.midSoilHeadNorm) {
      gameState.midSoilHeadNorm[i] = clamp((midHead - soilHeadMin[1]) / soilHeadRange[1]);
    }
    if (gameState.deepSoilHeadNorm) {
      gameState.deepSoilHeadNorm[i] = clamp((deepHead - soilHeadMin[2]) / soilHeadRange[2]);
    }
    if (gameState.topSoilConductivityMDay) {
      gameState.topSoilConductivityMDay[i] = topK;
    }
    if (gameState.midSoilConductivityMDay) {
      gameState.midSoilConductivityMDay[i] = midK;
    }
    if (gameState.deepSoilConductivityMDay) {
      gameState.deepSoilConductivityMDay[i] = deepK;
    }
    if (gameState.topSoilConductivityNorm) {
      gameState.topSoilConductivityNorm[i] = clamp((Math.log10(Math.max(1e-9, topK)) - soilKLogMin[0]) / soilKLogRange[0]);
    }
    if (gameState.midSoilConductivityNorm) {
      gameState.midSoilConductivityNorm[i] = clamp((Math.log10(Math.max(1e-9, midK)) - soilKLogMin[1]) / soilKLogRange[1]);
    }
    if (gameState.deepSoilConductivityNorm) {
      gameState.deepSoilConductivityNorm[i] = clamp((Math.log10(Math.max(1e-9, deepK)) - soilKLogMin[2]) / soilKLogRange[2]);
    }
    if (gameState.groundwaterHeadM) {
      gameState.groundwaterHeadM[i] = state.groundwaterHead[i];
    }
    if (gameState.groundwaterHeadNorm) {
      gameState.groundwaterHeadNorm[i] = clamp((state.groundwaterHead[i] - groundwaterHeadMin) / groundwaterHeadRange);
    }
    if (gameState.rainfall) {
      gameState.rainfall[i] = clamp(state.rainMemory[i] * (model.planetPreset === "earth" ? 160 : 360));
    }
    if (gameState.rainfallMm) {
      gameState.rainfallMm[i] = state.rainMemory[i] * 1000;
    }
    if (gameState.rainfallInstantMm) {
      gameState.rainfallInstantMm[i] = state.R[i] * 1000;
    }
    if (gameState.sunlight) {
      gameState.sunlight[i] = clamp(state.sunlight[i]);
    }
    if (gameState.par) {
      gameState.par[i] = state.par[i];
    }
    if (gameState.atmosphericCo2Ppm) {
      gameState.atmosphericCo2Ppm[i] = params.atmosphericCo2Ppm;
    }
    if (gameState.laiBaobab) {
      gameState.laiBaobab[i] = state.laiBaobab[i];
    }
    if (gameState.laiRose) {
      gameState.laiRose[i] = state.laiRose[i];
    }
    if (gameState.coverBaobab) {
      gameState.coverBaobab[i] = state.coverBaobab[i];
    }
    if (gameState.coverRose) {
      gameState.coverRose[i] = state.coverRose[i];
    }
    if (gameState.vegetationCover) {
      gameState.vegetationCover[i] = state.vegetationCover[i];
    }
    if (gameState.aparTotal) {
      gameState.aparTotal[i] = state.aparTotal[i];
    }
    if (gameState.aparBaobab) {
      gameState.aparBaobab[i] = state.aparBaobab[i];
    }
    if (gameState.aparRose) {
      gameState.aparRose[i] = state.aparRose[i];
    }
    if (gameState.surfaceTempC) {
      gameState.surfaceTempC[i] = state.surfaceTempC[i];
    }
    if (gameState.vpdKpa) {
      gameState.vpdKpa[i] = state.vpdKpa[i];
    }
    if (gameState.tempStressBaobab) {
      gameState.tempStressBaobab[i] = state.tempStressBaobab[i];
    }
    if (gameState.tempStressRose) {
      gameState.tempStressRose[i] = state.tempStressRose[i];
    }
    if (gameState.vpdStressBaobab) {
      gameState.vpdStressBaobab[i] = state.vpdStressBaobab[i];
    }
    if (gameState.vpdStressRose) {
      gameState.vpdStressRose[i] = state.vpdStressRose[i];
    }
    if (gameState.co2StressBaobab) {
      gameState.co2StressBaobab[i] = state.co2StressBaobab[i];
    }
    if (gameState.co2StressRose) {
      gameState.co2StressRose[i] = state.co2StressRose[i];
    }
    if (gameState.photosynthesisStressBaobab) {
      gameState.photosynthesisStressBaobab[i] = state.photosynthesisStressBaobab[i];
    }
    if (gameState.photosynthesisStressRose) {
      gameState.photosynthesisStressRose[i] = state.photosynthesisStressRose[i];
    }
    if (gameState.et0) {
      gameState.et0[i] = state.et0[i];
    }
    if (gameState.soilEvapM) {
      gameState.soilEvapM[i] = state.soilEvapM[i];
    }
    if (gameState.transpirationBaobabM) {
      gameState.transpirationBaobabM[i] = state.transpirationBaobabM[i];
    }
    if (gameState.transpirationRoseM) {
      gameState.transpirationRoseM[i] = state.transpirationRoseM[i];
    }
    if (gameState.hydrologyInputMm) {
      gameState.hydrologyInputMm[i] = state.hydrologyInputM[i] * 1000;
    }
    if (gameState.hydrologyLossMm) {
      gameState.hydrologyLossMm[i] = (
        state.hydrologySurfaceEvapM[i] +
        state.hydrologySoilEvapM[i] +
        state.hydrologyRootUptakeM[i] +
        state.hydrologyLeakageM[i] +
        state.hydrologySurfaceDrainM[i]
      ) * 1000;
    }
    if (gameState.hydrologyHorizontalMm) {
      gameState.hydrologyHorizontalMm[i] = state.hydrologyHorizontalM[i] * 1000;
    }
    if (gameState.hydrologyInfiltrationMm) {
      gameState.hydrologyInfiltrationMm[i] = state.hydrologyInfiltrationM[i] * 1000;
    }
    if (gameState.hydrologyPercolation01Mm) {
      gameState.hydrologyPercolation01Mm[i] = state.hydrologyPercolation01M[i] * 1000;
    }
    if (gameState.hydrologyPercolation12Mm) {
      gameState.hydrologyPercolation12Mm[i] = state.hydrologyPercolation12M[i] * 1000;
    }
    if (gameState.hydrologyRechargeMm) {
      gameState.hydrologyRechargeMm[i] = state.hydrologyRechargeM[i] * 1000;
    }
    if (gameState.hydrologyLeakageMm) {
      gameState.hydrologyLeakageMm[i] = state.hydrologyLeakageM[i] * 1000;
    }
    if (gameState.hydrologyStorageChangeMm) {
      gameState.hydrologyStorageChangeMm[i] = state.hydrologyStorageChangeM[i] * 1000;
    }
    if (gameState.hydrologyResidualMm) {
      gameState.hydrologyResidualMm[i] = state.hydrologyResidualM[i] * 1000;
    }
    if (gameState.gppBaobab) {
      gameState.gppBaobab[i] = state.gppBaobab[i];
    }
    if (gameState.gppRose) {
      gameState.gppRose[i] = state.gppRose[i];
    }
    if (gameState.lueGppBaobab) {
      gameState.lueGppBaobab[i] = state.lueGppBaobab[i];
    }
    if (gameState.lueGppRose) {
      gameState.lueGppRose[i] = state.lueGppRose[i];
    }
    if (gameState.nppBaobab) {
      gameState.nppBaobab[i] = state.nppBaobab[i];
    }
    if (gameState.nppRose) {
      gameState.nppRose[i] = state.nppRose[i];
    }
    if (gameState.carbonBalanceBaobab) {
      gameState.carbonBalanceBaobab[i] = state.carbonBalanceBaobab[i];
    }
    if (gameState.carbonBalanceRose) {
      gameState.carbonBalanceRose[i] = state.carbonBalanceRose[i];
    }
    if (gameState.maintenanceRespirationBaobab) {
      gameState.maintenanceRespirationBaobab[i] = state.maintenanceRespirationBaobab[i];
    }
    if (gameState.maintenanceRespirationRose) {
      gameState.maintenanceRespirationRose[i] = state.maintenanceRespirationRose[i];
    }
    if (gameState.growthRespirationBaobab) {
      gameState.growthRespirationBaobab[i] = state.growthRespirationBaobab[i];
    }
    if (gameState.growthRespirationRose) {
      gameState.growthRespirationRose[i] = state.growthRespirationRose[i];
    }
    if (gameState.autotrophicRespirationBaobab) {
      gameState.autotrophicRespirationBaobab[i] = state.autotrophicRespirationBaobab[i];
    }
    if (gameState.autotrophicRespirationRose) {
      gameState.autotrophicRespirationRose[i] = state.autotrophicRespirationRose[i];
    }
    if (gameState.carbonInputGC) {
      gameState.carbonInputGC[i] = state.carbonInputC[i] * 1000;
    }
    if (gameState.carbonRespirationGC) {
      gameState.carbonRespirationGC[i] = state.carbonRespirationC[i] * 1000;
    }
    if (gameState.carbonTransportGC) {
      gameState.carbonTransportGC[i] = state.carbonTransportC[i] * 1000;
    }
    if (gameState.carbonDisturbanceGC) {
      gameState.carbonDisturbanceGC[i] = state.carbonDisturbanceC[i] * 1000;
    }
    if (gameState.carbonStorageChangeGC) {
      gameState.carbonStorageChangeGC[i] = state.carbonStorageChangeC[i] * 1000;
    }
    if (gameState.carbonResidualGC) {
      gameState.carbonResidualGC[i] = state.carbonResidualC[i] * 1000;
    }
    if (gameState.disturbanceCarbonExportGC) {
      gameState.disturbanceCarbonExportGC[i] = state.disturbanceCarbonExportC[i] * 1000;
    }
    if (gameState.ecosystemCarbonGC) {
      gameState.ecosystemCarbonGC[i] = state.ecosystemCarbonC[i] * 1000;
    }
    if (gameState.plantCarbonGC) {
      gameState.plantCarbonGC[i] = state.plantCarbonC[i] * 1000;
    }
    if (gameState.seedCarbonGC) {
      gameState.seedCarbonGC[i] = state.seedCarbonC[i] * 1000;
    }
    if (gameState.litterPoolCarbonGC) {
      gameState.litterPoolCarbonGC[i] = state.litterPoolCarbonC[i] * 1000;
    }
    if (gameState.soilOrganicCarbonGC) {
      gameState.soilOrganicCarbonGC[i] = state.soilOrganicCarbonC[i] * 1000;
    }
    if (gameState.netEcosystemProductionGC) {
      gameState.netEcosystemProductionGC[i] = state.netEcosystemProductionC[i] * 1000;
    }
    if (gameState.baobabPlantCarbonGC) {
      gameState.baobabPlantCarbonGC[i] = (
        state.baobabLeaf[i] +
        state.baobabStem[i] +
        state.baobabRoot[i] +
        state.baobabStore[i]
      ) * 1000;
    }
    if (gameState.baobabLeafCarbonGC) {
      gameState.baobabLeafCarbonGC[i] = state.baobabLeaf[i] * 1000;
    }
    if (gameState.baobabStemCarbonGC) {
      gameState.baobabStemCarbonGC[i] = state.baobabStem[i] * 1000;
    }
    if (gameState.baobabRootCarbonGC) {
      gameState.baobabRootCarbonGC[i] = state.baobabRoot[i] * 1000;
    }
    if (gameState.baobabStoreCarbonGC) {
      gameState.baobabStoreCarbonGC[i] = state.baobabStore[i] * 1000;
    }
    if (gameState.rosePlantCarbonGC) {
      gameState.rosePlantCarbonGC[i] = (
        state.roseLeaf[i] +
        state.roseFlower[i] +
        state.roseRoot[i] +
        state.roseStore[i]
      ) * 1000;
    }
    if (gameState.roseLeafCarbonGC) {
      gameState.roseLeafCarbonGC[i] = state.roseLeaf[i] * 1000;
    }
    if (gameState.roseFlowerCarbonGC) {
      gameState.roseFlowerCarbonGC[i] = state.roseFlower[i] * 1000;
    }
    if (gameState.roseRootCarbonGC) {
      gameState.roseRootCarbonGC[i] = state.roseRoot[i] * 1000;
    }
    if (gameState.roseStoreCarbonGC) {
      gameState.roseStoreCarbonGC[i] = state.roseStore[i] * 1000;
    }
    if (gameState.baobabAllocLeaf) {
      gameState.baobabAllocLeaf[i] = state.baobabAllocLeaf[i];
    }
    if (gameState.baobabAllocStem) {
      gameState.baobabAllocStem[i] = state.baobabAllocStem[i];
    }
    if (gameState.baobabAllocRoot) {
      gameState.baobabAllocRoot[i] = state.baobabAllocRoot[i];
    }
    if (gameState.baobabAllocStore) {
      gameState.baobabAllocStore[i] = state.baobabAllocStore[i];
    }
    if (gameState.baobabAllocLeafGC) {
      gameState.baobabAllocLeafGC[i] = state.baobabAllocLeafC[i] * 1000;
    }
    if (gameState.baobabAllocStemGC) {
      gameState.baobabAllocStemGC[i] = state.baobabAllocStemC[i] * 1000;
    }
    if (gameState.baobabAllocRootGC) {
      gameState.baobabAllocRootGC[i] = state.baobabAllocRootC[i] * 1000;
    }
    if (gameState.baobabAllocStoreGC) {
      gameState.baobabAllocStoreGC[i] = state.baobabAllocStoreC[i] * 1000;
    }
    if (gameState.roseAllocLeaf) {
      gameState.roseAllocLeaf[i] = state.roseAllocLeaf[i];
    }
    if (gameState.roseAllocFlower) {
      gameState.roseAllocFlower[i] = state.roseAllocFlower[i];
    }
    if (gameState.roseAllocRoot) {
      gameState.roseAllocRoot[i] = state.roseAllocRoot[i];
    }
    if (gameState.roseAllocStore) {
      gameState.roseAllocStore[i] = state.roseAllocStore[i];
    }
    if (gameState.roseAllocLeafGC) {
      gameState.roseAllocLeafGC[i] = state.roseAllocLeafC[i] * 1000;
    }
    if (gameState.roseAllocFlowerGC) {
      gameState.roseAllocFlowerGC[i] = state.roseAllocFlowerC[i] * 1000;
    }
    if (gameState.roseAllocRootGC) {
      gameState.roseAllocRootGC[i] = state.roseAllocRootC[i] * 1000;
    }
    if (gameState.roseAllocStoreGC) {
      gameState.roseAllocStoreGC[i] = state.roseAllocStoreC[i] * 1000;
    }
    if (gameState.baobabLeafLossGC) {
      gameState.baobabLeafLossGC[i] = state.baobabLeafLossCarbon[i] * 1000;
    }
    if (gameState.baobabStemLossGC) {
      gameState.baobabStemLossGC[i] = state.baobabStemLossCarbon[i] * 1000;
    }
    if (gameState.baobabRootLossGC) {
      gameState.baobabRootLossGC[i] = state.baobabRootLossCarbon[i] * 1000;
    }
    if (gameState.baobabLeafResidualGC) {
      gameState.baobabLeafResidualGC[i] = state.baobabLeafResidualCarbon[i] * 1000;
    }
    if (gameState.baobabStemResidualGC) {
      gameState.baobabStemResidualGC[i] = state.baobabStemResidualCarbon[i] * 1000;
    }
    if (gameState.baobabRootResidualGC) {
      gameState.baobabRootResidualGC[i] = state.baobabRootResidualCarbon[i] * 1000;
    }
    if (gameState.baobabStoreResidualGC) {
      gameState.baobabStoreResidualGC[i] = state.baobabStoreResidualCarbon[i] * 1000;
    }
    if (gameState.roseLeafLossGC) {
      gameState.roseLeafLossGC[i] = state.roseLeafLossCarbon[i] * 1000;
    }
    if (gameState.roseFlowerLossGC) {
      gameState.roseFlowerLossGC[i] = state.roseFlowerLossCarbon[i] * 1000;
    }
    if (gameState.roseRootLossGC) {
      gameState.roseRootLossGC[i] = state.roseRootLossCarbon[i] * 1000;
    }
    if (gameState.roseLeafResidualGC) {
      gameState.roseLeafResidualGC[i] = state.roseLeafResidualCarbon[i] * 1000;
    }
    if (gameState.roseFlowerResidualGC) {
      gameState.roseFlowerResidualGC[i] = state.roseFlowerResidualCarbon[i] * 1000;
    }
    if (gameState.roseRootResidualGC) {
      gameState.roseRootResidualGC[i] = state.roseRootResidualCarbon[i] * 1000;
    }
    if (gameState.roseStoreResidualGC) {
      gameState.roseStoreResidualGC[i] = state.roseStoreResidualCarbon[i] * 1000;
    }
    if (gameState.litterInputCarbon) {
      gameState.litterInputCarbon[i] = state.litterInputCarbon[i];
    }
    if (gameState.litterInputBaobabGC) {
      gameState.litterInputBaobabGC[i] = state.litterInputBaobabCarbon[i] * 1000;
    }
    if (gameState.litterInputRoseGC) {
      gameState.litterInputRoseGC[i] = state.litterInputRoseCarbon[i] * 1000;
    }
    if (gameState.litterInputSeedGC) {
      gameState.litterInputSeedGC[i] = state.litterInputSeedCarbon[i] * 1000;
    }
    if (gameState.litterFastInputGC) {
      gameState.litterFastInputGC[i] = state.litterFastInputCarbon[i] * 1000;
    }
    if (gameState.litterSlowInputGC) {
      gameState.litterSlowInputGC[i] = state.litterSlowInputCarbon[i] * 1000;
    }
    if (gameState.litterFastDecayGC) {
      gameState.litterFastDecayGC[i] = state.litterFastDecayCarbon[i] * 1000;
    }
    if (gameState.litterSlowDecayGC) {
      gameState.litterSlowDecayGC[i] = state.litterSlowDecayCarbon[i] * 1000;
    }
    if (gameState.litterHumificationGC) {
      gameState.litterHumificationGC[i] = state.litterHumificationCarbon[i] * 1000;
    }
    if (gameState.litterFastResidualGC) {
      gameState.litterFastResidualGC[i] = state.litterFastResidualCarbon[i] * 1000;
    }
    if (gameState.litterSlowResidualGC) {
      gameState.litterSlowResidualGC[i] = state.litterSlowResidualCarbon[i] * 1000;
    }
    if (gameState.soilActiveDecayGC) {
      gameState.soilActiveDecayGC[i] = state.soilActiveDecayCarbon[i] * 1000;
    }
    if (gameState.soilStabilizationGC) {
      gameState.soilStabilizationGC[i] = state.soilStabilizationCarbon[i] * 1000;
    }
    if (gameState.soilStableDecayGC) {
      gameState.soilStableDecayGC[i] = state.soilStableDecayCarbon[i] * 1000;
    }
    if (gameState.litterRespirationGC) {
      gameState.litterRespirationGC[i] = state.litterRespirationCarbon[i] * 1000;
    }
    if (gameState.soilActiveRespirationGC) {
      gameState.soilActiveRespirationGC[i] = state.soilActiveRespirationCarbon[i] * 1000;
    }
    if (gameState.soilStableRespirationGC) {
      gameState.soilStableRespirationGC[i] = state.soilStableRespirationCarbon[i] * 1000;
    }
    if (gameState.soilActiveResidualGC) {
      gameState.soilActiveResidualGC[i] = state.soilActiveResidualCarbon[i] * 1000;
    }
    if (gameState.soilStableResidualGC) {
      gameState.soilStableResidualGC[i] = state.soilStableResidualCarbon[i] * 1000;
    }
    if (gameState.topMatricPotentialM) {
      gameState.topMatricPotentialM[i] = state.topMatricPotentialM[i];
    }
    if (gameState.soilWaterPotential) {
      gameState.soilWaterPotential[i] = clamp(1 - Math.log10(1 + Math.max(0, -state.topMatricPotentialM[i])) / Math.log10(1 + MAX_MATRIC_SUCTION_M));
    }
    if (gameState.rootStressBaobab) {
      gameState.rootStressBaobab[i] = state.rootStressBaobab[i];
    }
    if (gameState.rootStressRose) {
      gameState.rootStressRose[i] = state.rootStressRose[i];
    }
    if (gameState.baobabSeedBank) {
      gameState.baobabSeedBank[i] = clamp(state.baobabSeed[i] / 0.7);
    }
    if (gameState.roseSeedBank) {
      gameState.roseSeedBank[i] = clamp(state.roseSeed[i] / 0.35);
    }
    if (gameState.baobabGermination) {
      gameState.baobabGermination[i] = state.baobabGermination[i];
    }
    if (gameState.roseGermination) {
      gameState.roseGermination[i] = state.roseGermination[i];
    }
    if (gameState.baobabHeight) {
      gameState.baobabHeight[i] = baobabHeightIndex(state, i);
    }
    if (gameState.roseHeight) {
      gameState.roseHeight[i] = roseHeightIndex(state, i);
    }
    if (gameState.substrate) {
      gameState.substrate[i] = sub.key;
    }
    if (gameState.roseFertility) {
      gameState.roseFertility[i] = state.roseFertility[i];
    }
  }
  gameState.maxRainfallMm = maxRainfallMm;
  gameState.maxBaobab = maxBaobab;
}

function baobabHeightIndex(state, i) {
  const woody = Math.max(0, state.baobabStem[i]);
  const root = Math.max(0, state.baobabRoot[i]);
  const support = root / Math.max(0.04, woody + root);
  const reserve = state.baobabStore[i] / Math.max(0.04, state.baobabStore[i] + woody);
  const structuralHeight = 1 - Math.exp(-1.65 * Math.pow(woody, 0.58));
  return clamp(structuralHeight * (0.82 + 0.18 * support) * (0.9 + 0.1 * reserve));
}

function roseHeightIndex(state, i) {
  const leaf = Math.max(0, state.roseLeaf[i]);
  const flower = Math.max(0, state.roseFlower[i]);
  const root = Math.max(0, state.roseRoot[i]);
  const canopy = 1 - Math.exp(-2.7 * leaf - 2.2 * flower);
  const rootSupport = clamp(root / Math.max(0.04, leaf + flower + root));
  const flowering = 1 - Math.exp(-4.4 * flower);
  return clamp(canopy * (0.74 + 0.16 * rootSupport + 0.1 * flowering));
}

function roseVigorIndex(state, i) {
  const leaf = Math.max(0, state.roseLeaf[i]);
  const flower = Math.max(0, state.roseFlower[i]);
  const root = Math.max(0, state.roseRoot[i]);
  const store = Math.max(0, state.roseStore[i]);
  const perennialCarbon = leaf + root + 0.35 * store;
  const floweringSignal = 0.18 * flower;
  return clamp((perennialCarbon + floweringSignal) / 0.43);
}

function roseBloomIndex(state, i) {
  const flower = Math.max(0, state.roseFlower[i]);
  return clamp(1 - Math.exp(-34 * flower));
}

function roseVisibleIndex(state, i) {
  if (
    state.roseLeaf[i] <= 0 &&
    state.roseFlower[i] <= 0 &&
    state.roseRoot[i] <= 0 &&
    state.roseStore[i] <= 0
  ) {
    return 0;
  }
  return clamp(0.62 * roseVigorIndex(state, i) + 0.38 * roseBloomIndex(state, i));
}

function operatorsFor(topology) {
  const key = topology.nside;
  const cached = operatorCache.get(key);
  if (cached) {
    return cached;
  }

  const operators = buildRbfFdOperators(topology);
  operatorCache.set(key, operators);
  return operators;
}

function buildRainMap(topology) {
  const renderSize = 96;
  const x = new Float32Array(topology.cells.length);
  const y = new Float32Array(topology.cells.length);
  const height = new Float32Array(topology.cells.length);
  const tropics = new Float32Array(topology.cells.length);
  const midLatitude = new Float32Array(topology.cells.length);
  const weakBackground = new Float32Array(topology.cells.length);
  for (const cell of topology.cells) {
    x[cell.id] = (cell.phi / (Math.PI * 2)) * renderSize;
    y[cell.id] = ((1 - cell.height) / 2) * renderSize;
    height[cell.id] = cell.height;
    const absHeight = Math.abs(cell.height);
    tropics[cell.id] = Math.exp(-0.5 * (cell.height / 0.24) ** 2);
    midLatitude[cell.id] =
      Math.exp(-0.5 * ((absHeight - 0.48) / 0.16) ** 2) +
      0.5 * Math.exp(-0.5 * ((absHeight - 0.68) / 0.12) ** 2);
    weakBackground[cell.id] = 0.08 * polarRainMask(cell.height);
  }
  return { renderSize, x, y, height, tropics, midLatitude, weakBackground };
}

function deterministicUnit(index, salt) {
  const value = Math.sin((index + 1) * 12.9898 + (salt + 1) * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function moduloFloat(value, size) {
  return ((value % size) + size) % size;
}

function periodicDelta(a, b, period) {
  const delta = a - b;
  if (delta > period / 2) {
    return delta - period;
  }
  if (delta < -period / 2) {
    return delta + period;
  }
  return delta;
}

function mulberry32(initial) {
  function next() {
    next.state = (next.state + 0x6d2b79f5) >>> 0;
    let t = next.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  next.state = initial >>> 0;
  next.setState = (state) => {
    next.state = state >>> 0;
  };
  return next;
}

function buildRbfFdOperators(topology) {
  return expandCompressedRbfFdOperators(buildCompressedRbfFdOperatorData(topology));
}

export function buildCompressedRbfFdOperatorData(topology) {
  const size = topology.cells.length;
  const asteroidRadiusM = sphereRadiusMForTopology(topology);
  const m = RBF_FD_STENCIL_SIZE;
  const stencil = new Int32Array(size * m);
  const classIndex = size <= 65535 ? new Uint16Array(size) : new Uint32Array(size);
  const permutation = new Uint8Array(size * m);
  const transform = new Float64Array(size * RBF_FD_TRANSFORM_STRIDE);
  const classMap = new Map();
  const classWeights = [];

  for (let i = 0; i < size; i += 1) {
    const ids = neighborStencil8(topology, i);
    const coords = localCoordinates(topology, asteroidRadiusM, i, ids);
    const canonical = canonicalStencilGeometry(coords);
    let weights = classMap.get(canonical.key);
    if (!weights) {
      weights = {
        id: classWeights.length,
        lap: rbfFdWeights(canonical.points, "lap"),
        gx: rbfFdWeights(canonical.points, "gx"),
        gy: rbfFdWeights(canonical.points, "gy")
      };
      classMap.set(canonical.key, weights);
      classWeights.push(weights);
    }
    const offset = i * m;
    for (let k = 0; k < m; k += 1) {
      stencil[offset + k] = ids[k];
      permutation[offset + k] = canonical.permutation[k];
    }
    classIndex[i] = weights.id;
    const transformOffset = i * RBF_FD_TRANSFORM_STRIDE;
    transform[transformOffset] = canonical.a00;
    transform[transformOffset + 1] = canonical.a01;
    transform[transformOffset + 2] = canonical.a10;
    transform[transformOffset + 3] = canonical.a11;
    transform[transformOffset + 4] = canonical.invScale;
    transform[transformOffset + 5] = canonical.invScale2;
  }

  const weights = new Float32Array(classWeights.length * 3 * m);
  for (const item of classWeights) {
    const offset = item.id * 3 * m;
    weights.set(item.lap, offset);
    weights.set(item.gx, offset + m);
    weights.set(item.gy, offset + 2 * m);
  }

  return {
    version: RBF_FD_ASSET_VERSION,
    nside: topology.nside,
    size,
    m,
    classCount: classWeights.length,
    stencil,
    classIndex,
    permutation,
    transform,
    weights
  };
}

function expandCompressedRbfFdOperators(data) {
  const { size, m, stencil, classIndex, permutation, transform, weights } = data;
  const lapW = new Float32Array(size * m);
  const gxW = new Float32Array(size * m);
  const gyW = new Float32Array(size * m);

  for (let i = 0; i < size; i += 1) {
    const cellOffset = i * m;
    const classOffset = classIndex[i] * 3 * m;
    const transformOffset = i * RBF_FD_TRANSFORM_STRIDE;
    const a00 = transform[transformOffset];
    const a01 = transform[transformOffset + 1];
    const a10 = transform[transformOffset + 2];
    const a11 = transform[transformOffset + 3];
    const invScale = transform[transformOffset + 4];
    const invScale2 = transform[transformOffset + 5];

    for (let sortedIndex = 0; sortedIndex < m; sortedIndex += 1) {
      const stencilIndex = permutation[cellOffset + sortedIndex];
      const outputIndex = cellOffset + stencilIndex;
      const lapCanonical = weights[classOffset + sortedIndex];
      const gxCanonical = weights[classOffset + m + sortedIndex];
      const gyCanonical = weights[classOffset + 2 * m + sortedIndex];
      lapW[outputIndex] = lapCanonical * invScale2;
      gxW[outputIndex] = (a00 * gxCanonical + a10 * gyCanonical) * invScale;
      gyW[outputIndex] = (a01 * gxCanonical + a11 * gyCanonical) * invScale;
    }
  }

  return {
    m,
    stencil,
    lapW,
    gxW,
    gyW,
    classCount: data.classCount,
    compressed: true
  };
}

function canonicalStencilGeometry(coords) {
  const m = coords.length;
  const distances = new Float32Array(m);
  let distanceSum = 0;
  let nonCenterCount = 0;

  for (let i = 0; i < m; i += 1) {
    const distance = Math.hypot(coords[i][0], coords[i][1]);
    distances[i] = distance;
    if (distance > 1e-9) {
      distanceSum += distance;
      nonCenterCount += 1;
    }
  }

  const scale = nonCenterCount > 0 ? distanceSum / nonCenterCount : 1;
  const invScale = scale > 0 ? 1 / scale : 1;
  let best = null;

  for (let anchor = 0; anchor < m; anchor += 1) {
    if (distances[anchor] <= 1e-9) {
      continue;
    }

    const ax = coords[anchor][0] * invScale;
    const ay = coords[anchor][1] * invScale;
    const anchorLength = Math.hypot(ax, ay);
    if (anchorLength <= 1e-12) {
      continue;
    }

    const e1x = ax / anchorLength;
    const e1y = ay / anchorLength;
    const e2x = -e1y;
    const e2y = e1x;

    for (const reflect of [1, -1]) {
      const entries = new Array(m);
      for (let i = 0; i < m; i += 1) {
        const x = coords[i][0] * invScale;
        const y = coords[i][1] * invScale;
        entries[i] = {
          index: i,
          x: x * e1x + y * e1y,
          y: reflect * (x * e2x + y * e2y)
        };
      }
      entries.sort((a, b) => a.x - b.x || a.y - b.y || a.index - b.index);
      const key = canonicalGeometryKey(entries);

      if (!best || key < best.key) {
        const points = entries.map((entry) => [entry.x, entry.y]);
        const permutation = entries.map((entry) => entry.index);
        best = {
          key,
          points,
          permutation,
          a00: e1x,
          a01: e1y,
          a10: reflect * e2x,
          a11: reflect * e2y,
          invScale,
          invScale2: invScale * invScale
        };
      }
    }
  }

  return best;
}

function canonicalGeometryKey(entries) {
  return entries
    .map((entry) => `${entry.x.toFixed(RBF_FD_CANONICAL_DIGITS)},${entry.y.toFixed(RBF_FD_CANONICAL_DIGITS)}`)
    .join(";");
}

export function encodeRbfFdOperatorData(data) {
  const classIndexBytes = data.classIndex.BYTES_PER_ELEMENT;
  const stencilOffset = RBF_FD_HEADER_BYTES;
  const classIndexOffset = align(stencilOffset + data.stencil.byteLength, classIndexBytes);
  const permutationOffset = classIndexOffset + data.classIndex.byteLength;
  const transformOffset = align(permutationOffset + data.permutation.byteLength, Float64Array.BYTES_PER_ELEMENT);
  const weightsOffset = align(transformOffset + data.transform.byteLength, Float32Array.BYTES_PER_ELEMENT);
  const byteLength = weightsOffset + data.weights.byteLength;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);

  view.setUint32(0, RBF_FD_ASSET_MAGIC, true);
  view.setUint32(4, RBF_FD_ASSET_VERSION, true);
  view.setUint32(8, data.nside, true);
  view.setUint32(12, data.size, true);
  view.setUint32(16, data.m, true);
  view.setUint32(20, data.classCount, true);
  view.setUint32(24, classIndexBytes, true);
  view.setUint32(28, RBF_FD_TRANSFORM_STRIDE, true);
  view.setUint32(32, stencilOffset, true);
  view.setUint32(36, classIndexOffset, true);
  view.setUint32(40, permutationOffset, true);
  view.setUint32(44, transformOffset, true);
  view.setUint32(48, weightsOffset, true);

  new Int32Array(buffer, stencilOffset, data.stencil.length).set(data.stencil);
  if (classIndexBytes === Uint16Array.BYTES_PER_ELEMENT) {
    new Uint16Array(buffer, classIndexOffset, data.classIndex.length).set(data.classIndex);
  } else {
    new Uint32Array(buffer, classIndexOffset, data.classIndex.length).set(data.classIndex);
  }
  new Uint8Array(buffer, permutationOffset, data.permutation.length).set(data.permutation);
  new Float64Array(buffer, transformOffset, data.transform.length).set(data.transform);
  new Float32Array(buffer, weightsOffset, data.weights.length).set(data.weights);

  return buffer;
}

export function decodeRbfFdOperatorData(buffer, topology) {
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const nside = view.getUint32(8, true);
  const size = view.getUint32(12, true);
  const m = view.getUint32(16, true);
  const classCount = view.getUint32(20, true);
  const classIndexBytes = view.getUint32(24, true);
  const transformStride = view.getUint32(28, true);
  const stencilOffset = view.getUint32(32, true);
  const classIndexOffset = view.getUint32(36, true);
  const permutationOffset = view.getUint32(40, true);
  const transformOffset = view.getUint32(44, true);
  const weightsOffset = view.getUint32(48, true);

  if (magic !== RBF_FD_ASSET_MAGIC || version !== RBF_FD_ASSET_VERSION) {
    throw new Error("Unsupported RBF-FD operator asset.");
  }
  if (nside !== topology.nside || size !== topology.cells.length || m !== RBF_FD_STENCIL_SIZE) {
    throw new Error("RBF-FD operator asset does not match the current topology.");
  }
  if (transformStride !== RBF_FD_TRANSFORM_STRIDE) {
    throw new Error("RBF-FD operator asset has an incompatible transform layout.");
  }

  const classIndex =
    classIndexBytes === Uint16Array.BYTES_PER_ELEMENT
      ? new Uint16Array(buffer, classIndexOffset, size)
      : new Uint32Array(buffer, classIndexOffset, size);
  const data = {
    version,
    nside,
    size,
    m,
    classCount,
    stencil: new Int32Array(buffer, stencilOffset, size * m),
    classIndex,
    permutation: new Uint8Array(buffer, permutationOffset, size * m),
    transform: new Float64Array(buffer, transformOffset, size * RBF_FD_TRANSFORM_STRIDE),
    weights: new Float32Array(buffer, weightsOffset, classCount * 3 * m)
  };

  return expandCompressedRbfFdOperators(data);
}

function align(offset, byteSize) {
  return Math.ceil(offset / byteSize) * byteSize;
}

function neighborStencil8(topology, cellId) {
  const ids = new Set([cellId]);
  for (const direction of topology.directions) {
    const neighbor = topology.neighbor(cellId, direction);
    if (neighbor !== null && neighbor !== undefined) {
      ids.add(neighbor);
    }
  }

  if (ids.size < 9) {
    for (const id of [...ids]) {
      for (const direction of topology.directions) {
        const neighbor = topology.neighbor(id, direction);
        if (neighbor !== null && neighbor !== undefined) {
          ids.add(neighbor);
        }
        if (ids.size >= 9) {
          break;
        }
      }
      if (ids.size >= 9) {
        break;
      }
    }
  }

  if (ids.size < 9) {
    const cell = topology.cells[cellId];
    const nearest = topology.cells
      .map((other) => ({ id: other.id, score: dot3(cell.normal, other.normal) }))
      .sort((a, b) => b.score - a.score);
    for (const item of nearest) {
      ids.add(item.id);
      if (ids.size >= 9) {
        break;
      }
    }
  }

  return [...ids].slice(0, 9);
}

function localCoordinates(topology, asteroidRadiusM, cellId, stencil) {
  const center = topology.cells[cellId];
  const normal = center.normal;
  const east = normalize3([-Math.sin(center.phi), 0, Math.cos(center.phi)]);
  const north = normalize3(cross3(east, normal));
  return stencil.map((id) => {
    const targetNormal = topology.cells[id].normal;
    const cosTheta = clamp(dot3(normal, targetNormal), -1, 1);
    const theta = Math.acos(cosTheta);
    if (theta <= 1e-14) {
      return [0, 0];
    }
    const sinTheta = Math.max(1e-14, Math.sin(theta));
    const tangent = [
      targetNormal[0] - cosTheta * normal[0],
      targetNormal[1] - cosTheta * normal[1],
      targetNormal[2] - cosTheta * normal[2]
    ];
    const scale = (asteroidRadiusM * theta) / sinTheta;
    return [scale * dot3(tangent, east), scale * dot3(tangent, north)];
  });
}

function rbfFdWeights(coords, op) {
  const m = coords.length;
  const p = RBF_FD_POLY_PAIRS.length;
  const dim = m + p;
  const matrix = Array.from({ length: dim }, () => Array(dim).fill(0));
  const rhs = Array(dim).fill(0);

  for (let a = 0; a < m; a += 1) {
    const [xa, ya] = coords[a];
    for (let b = 0; b < m; b += 1) {
      const [xb, yb] = coords[b];
      const r = Math.hypot(xa - xb, ya - yb);
      matrix[a][b] = phsRbf(r);
    }
    for (let poly = 0; poly < p; poly += 1) {
      const [px, py] = RBF_FD_POLY_PAIRS[poly];
      const value = monomial2(xa, ya, px, py);
      matrix[a][m + poly] = value;
      matrix[m + poly][a] = value;
    }
  }

  for (let b = 0; b < m; b += 1) {
    const [xb, yb] = coords[b];
    rhs[b] = phsDerivativeAtOrigin(xb, yb, op);
  }
  for (let poly = 0; poly < p; poly += 1) {
    rhs[m + poly] = monomialDerivativeAtOrigin(RBF_FD_POLY_PAIRS[poly], op);
  }

  return solveLinearTranspose(matrix, rhs).slice(0, m);
}

function phsRbf(r) {
  return r > 0 ? r ** RBF_FD_PHS_POWER : 0;
}

function phsDerivativeAtOrigin(x, y, op) {
  const r = Math.hypot(x, y);
  if (r <= 1e-14) {
    return 0;
  }
  const radial = RBF_FD_PHS_POWER * r ** (RBF_FD_PHS_POWER - 2);
  if (op === "gx") {
    return -radial * x;
  }
  if (op === "gy") {
    return -radial * y;
  }
  if (op === "lap") {
    return RBF_FD_PHS_POWER * RBF_FD_PHS_POWER * r ** (RBF_FD_PHS_POWER - 2);
  }
  return 0;
}

function monomial2(x, y, px, py) {
  return x ** px * y ** py;
}

function monomialDerivativeAtOrigin(pair, op) {
  const [px, py] = pair;
  if (op === "gx") {
    return px === 1 && py === 0 ? 1 : 0;
  }
  if (op === "gy") {
    return px === 0 && py === 1 ? 1 : 0;
  }
  if (op === "lap") {
    return (px === 2 && py === 0 ? 2 : 0) + (px === 0 && py === 2 ? 2 : 0);
  }
  return 0;
}

function solveLinearTranspose(matrix, rhs) {
  const nrow = rhs.length;
  const transposed = Array.from({ length: nrow }, (_, row) =>
    Array.from({ length: nrow }, (_, col) => matrix[col][row])
  );
  return solveLinear(transposed, rhs);
}

function solveLinear(matrix, rhs) {
  const nrow = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < nrow; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < nrow; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) {
        pivot = row;
      }
    }
    if (pivot !== col) {
      const tmp = a[col];
      a[col] = a[pivot];
      a[pivot] = tmp;
    }
    const div = Math.abs(a[col][col]) > 1e-18 ? a[col][col] : 1e-18;
    for (let k = col; k <= nrow; k += 1) {
      a[col][k] /= div;
    }
    for (let row = 0; row < nrow; row += 1) {
      if (row === col) {
        continue;
      }
      const factor = a[row][col];
      if (factor === 0) {
        continue;
      }
      for (let k = col; k <= nrow; k += 1) {
        a[row][k] -= factor * a[col][k];
      }
    }
  }
  return a.map((row) => row[nrow]);
}

function applyStencil(model, field, i, weights) {
  const { operators } = model;
  const offset = i * operators.m;
  let total = 0;
  for (let k = 0; k < operators.m; k += 1) {
    total += weights[offset + k] * field[operators.stencil[offset + k]];
  }
  return total;
}

function lap(model, field, i) {
  return applyStencil(model, field, i, model.operators.lapW);
}

function gradX(model, field, i) {
  return applyStencil(model, field, i, model.operators.gxW);
}

function gradY(model, field, i) {
  return applyStencil(model, field, i, model.operators.gyW);
}

function roseSeedDispersalWeightDistribution(model, sourceCellId) {
  const { state, topology } = model;
  let targetCount = 0;
  targetCount = addRoseSeedDispersalTarget(state, sourceCellId, targetCount);
  const maxGraphSteps = 1;
  for (const direction of topology.directions) {
    targetCount = addRoseSeedDispersalTarget(state, topology.neighbor(sourceCellId, direction), targetCount);
  }

  const sourceCell = topology.cells[sourceCellId];
  const asteroidRadiusM = model.radiusM;
  const targets = new Int32Array(targetCount);
  const weights = new Float64Array(targetCount);
  let weightSum = 0;
  let offSourceWeight = 0;
  for (let index = 0; index < targetCount; index += 1) {
    const target = roseSeedDispersalScratch[index];
    const targetCell = topology.cells[target];
    const cosDistance = clamp(dot3(sourceCell.normal, targetCell.normal), -1, 1);
    const distanceM = asteroidRadiusM * Math.acos(cosDistance);
    const normalizedDistance = distanceM / ROSE_SEED_DISPERSAL_LENGTH_M;
    const weight = Math.exp(-normalizedDistance);
    targets[index] = target;
    weights[index] = weight;
    weightSum += weight;
    if (target !== sourceCellId) {
      offSourceWeight += weight;
    }
  }

  return { targets, weights, weightSum, offSourceWeight, maxGraphSteps };
}

function roseSeedDispersalStats(model, sourceCellId) {
  const distribution = roseSeedDispersalWeightDistribution(model, sourceCellId);
  const offCohortProbability =
    distribution.weightSum > 0 ? distribution.offSourceWeight / distribution.weightSum : 0;
  const anyOffProbability = -Math.expm1(
    ROSE_SEED_DISPERSAL_COHORTS * Math.log1p(-Math.min(1, offCohortProbability))
  );
  return {
    lengthM: ROSE_SEED_DISPERSAL_LENGTH_M,
    cohorts: ROSE_SEED_DISPERSAL_COHORTS,
    targetCount: distribution.targets.length,
    maxGraphSteps: distribution.maxGraphSteps,
    offCohortProbability,
    anyOffProbability
  };
}

function sampleRoseSeedDispersal(model, sourceCellId, trials = 1000, seed = 1) {
  const distribution = roseSeedDispersalWeightDistribution(model, sourceCellId);
  const rng = mulberry32(seed);
  let offCohorts = 0;
  let anyOffTrials = 0;
  for (let trial = 0; trial < trials; trial += 1) {
    let trialHasOffSource = false;
    for (let cohort = 0; cohort < ROSE_SEED_DISPERSAL_COHORTS; cohort += 1) {
      let draw = rng() * distribution.weightSum;
      let selectedTarget = sourceCellId;
      for (let index = 0; index < distribution.targets.length; index += 1) {
        draw -= distribution.weights[index];
        if (draw <= 0) {
          selectedTarget = distribution.targets[index];
          break;
        }
      }
      if (selectedTarget !== sourceCellId) {
        offCohorts += 1;
        trialHasOffSource = true;
      }
    }
    if (trialHasOffSource) {
      anyOffTrials += 1;
    }
  }
  return {
    trials,
    offCohortRate: offCohorts / Math.max(1, trials * ROSE_SEED_DISPERSAL_COHORTS),
    anyOffTrialRate: anyOffTrials / Math.max(1, trials)
  };
}

export const __asteroidVegetationDiagnostics = Object.freeze({
  lap,
  gradX,
  gradY,
  transportDarcyRbf,
  transportDarcyWaterColumnsRbf,
  transportSurfaceNutrientSeedsRbf,
  limitNutrientTransport,
  updateCanopyOpticsFromInputs,
  updateCanopyEnvironmentFieldsFromInputs,
  prepareInitialPhotosynthesisInputs,
  prepareInitialPhotosynthesisInputsBatch,
  updatePhotosynthesisFromInputs,
  updatePhotosynthesisBatch,
  photosynthesisConstantsForWasm,
  photosynthesisInputConstantsForWasm,
  plantWaterFluxConstantsForWasm,
  updateSoilBiogeochemistryFromInputs,
  richardsColumnSemiImplicitUpdateInPlace,
  updateHydraulicStateForCell,
  hydraulicLookupTablesForWasm,
  darcyWaterColumnsConstants,
  surfaceNutrientTransportConstants: () => ({
    surfaceFilmThresholdM: SURFACE_FILM_THRESHOLD_M,
    modelDtDays: MODEL_DT_DAYS
  }),
  roseSeedDispersalStats,
  sampleRoseSeedDispersal,
  soilLayerCapacityForCell,
  groundwaterCapacityForCell,
  soilWaterTotal,
  hydrologyWaterTotal,
  hydrologyBudgetTotals,
  landCarbonTotal
});

function cap0For(depth, substrate) {
  return TOP_SOIL_WATER_CAP_M * depth * substrate.cap0;
}

function cap1For(depth, substrate) {
  return DEEP_SOIL_WATER_CAP_M * depth * substrate.cap1;
}

function soilIndex(size, layer, cellId) {
  return layer * size + cellId;
}

function soilLayerCapacity(depth, substrate, layer) {
  if (layer === 0) {
    return cap0For(depth, substrate);
  }
  return cap1For(depth, substrate) * DEEP_SOIL_LAYER_FRACTIONS[layer - 1];
}

function soilLayerTopDepth(depth, substrate, layer) {
  let topDepth = 0;
  for (let currentLayer = 0; currentLayer < layer; currentLayer += 1) {
    topDepth += soilLayerThickness(soilLayerCapacity(depth, substrate, currentLayer), substrate);
  }
  return topDepth;
}

function soilLayerCenterDepth(depth, substrate, layer) {
  const cap = soilLayerCapacity(depth, substrate, layer);
  return soilLayerTopDepth(depth, substrate, layer) + 0.5 * soilLayerThickness(cap, substrate);
}

function syncWaterAggregatesForCell(state, cellId, size) {
  state.W0[cellId] = state.soilWater[soilIndex(size, 0, cellId)];
  state.W1[cellId] = state.groundwaterStorage[cellId];
}

function soilLayerCapacityForCell(model, cellId, layer) {
  const { state } = model;
  return soilLayerCapacity(state.depth[cellId], SUBSTRATES[state.substrate[cellId]], layer);
}

function groundwaterCapacityForCell(model, cellId) {
  const { state } = model;
  return groundwaterCapacity(state.depth[cellId], SUBSTRATES[state.substrate[cellId]]);
}

function soilWaterTotal(model) {
  let total = 0;
  for (let i = 0; i < model.state.soilWater.length; i += 1) {
    total += model.state.soilWater[i];
  }
  for (let i = 0; i < model.state.groundwaterStorage.length; i += 1) {
    total += model.state.groundwaterStorage[i];
  }
  return total;
}

function hydrologyCellStorage(model, cellId) {
  const { state, size } = model;
  return (
    state.H[cellId] +
    state.soilWater[soilIndex(size, 0, cellId)] +
    state.soilWater[soilIndex(size, 1, cellId)] +
    state.soilWater[soilIndex(size, 2, cellId)] +
    state.groundwaterStorage[cellId]
  );
}

function hydrologyWaterTotal(model) {
  let total = 0;
  for (let i = 0; i < model.size; i += 1) {
    total += hydrologyCellStorage(model, i);
  }
  return total;
}

function landCarbonTotal(model) {
  const { state, size } = model;
  let total = 0;
  for (let i = 0; i < size; i += 1) {
    total += landCarbonCellStorage(state, i);
  }
  return total;
}

function landCarbonCellStorage(state, i, useNext = false) {
  return (
    plantCarbonCellStorage(state, i, useNext) +
    seedCarbonCellStorage(state, i, useNext) +
    litterCarbonCellStorage(state, i, useNext) +
    soilOrganicCarbonCellStorage(state, i, useNext)
  );
}

function plantCarbonCellStorage(state, i, useNext = false) {
  const suffix = useNext ? "N" : "";
  return (
    state[`baobabLeaf${suffix}`][i] +
    state[`baobabStem${suffix}`][i] +
    state[`baobabRoot${suffix}`][i] +
    state[`baobabStore${suffix}`][i] +
    state[`roseLeaf${suffix}`][i] +
    state[`roseFlower${suffix}`][i] +
    state[`roseRoot${suffix}`][i] +
    state[`roseStore${suffix}`][i]
  );
}

function seedCarbonCellStorage(state, i, useNext = false) {
  const suffix = useNext ? "N" : "";
  return (
    state[`baobabSeed${suffix}`][i] +
    state[`roseSeed${suffix}`][i]
  );
}

function litterCarbonCellStorage(state, i, useNext = false) {
  const suffix = useNext ? "N" : "";
  return (
    state[`litterFastCarbon${suffix}`][i] +
    state[`litterSlowCarbon${suffix}`][i]
  );
}

function soilOrganicCarbonCellStorage(state, i, useNext = false) {
  const suffix = useNext ? "N" : "";
  return (
    state[`soilCarbonActive${suffix}`][i] +
    state[`soilCarbonStable${suffix}`][i]
  );
}

function hydrologyBudgetTotals(model) {
  const { state } = model;
  const totals = {
    input: 0,
    canopyEvap: 0,
    surfaceEvap: 0,
    soilEvap: 0,
    rootUptake: 0,
    litterWater: 0,
    horizontal: 0,
    infiltration: 0,
    percolation01: 0,
    percolation12: 0,
    recharge: 0,
    leakage: 0,
    surfaceDrain: 0,
    storageBefore: 0,
    storageChange: 0,
    residual: 0,
    residualAbs: 0,
    residualMaxAbs: 0,
    residualMaxCell: -1
  };
  for (let i = 0; i < model.size; i += 1) {
    const residualAbs = Math.abs(state.hydrologyResidualM[i]);
    totals.input += state.hydrologyInputM[i];
    totals.canopyEvap += state.hydrologyCanopyEvapM[i];
    totals.surfaceEvap += state.hydrologySurfaceEvapM[i];
    totals.soilEvap += state.hydrologySoilEvapM[i];
    totals.rootUptake += state.hydrologyRootUptakeM[i];
    totals.litterWater += state.hydrologyLitterWaterM[i];
    totals.horizontal += state.hydrologyHorizontalM[i];
    totals.infiltration += state.hydrologyInfiltrationM[i];
    totals.percolation01 += state.hydrologyPercolation01M[i];
    totals.percolation12 += state.hydrologyPercolation12M[i];
    totals.recharge += state.hydrologyRechargeM[i];
    totals.leakage += state.hydrologyLeakageM[i];
    totals.surfaceDrain += state.hydrologySurfaceDrainM[i];
    totals.storageBefore += state.hydrologyStorageBeforeM[i];
    totals.storageChange += state.hydrologyStorageChangeM[i];
    totals.residual += state.hydrologyResidualM[i];
    totals.residualAbs += residualAbs;
    if (residualAbs > totals.residualMaxAbs) {
      totals.residualMaxAbs = residualAbs;
      totals.residualMaxCell = i;
    }
  }
  return totals;
}

function groundwaterCapacity(depth, substrate) {
  return AQUIFER_WATER_CAP_M * depth * substrate.cap1;
}

function groundwaterThickness(capacity, substrate) {
  return capacity / Math.max(0.12, substrate.thetaS);
}

function soilLayerThickness(capacity, substrate) {
  return capacity / Math.max(0.12, substrate.thetaS);
}

function residualStorage(capacity, substrate) {
  return capacity * residualSaturationFraction(substrate);
}

function residualSaturationFraction(substrate) {
  return clamp(substrate.thetaR / Math.max(substrate.thetaS, substrate.thetaR + 1e-6), 0, 0.72);
}

let hydraulicLookupByIndex = null;

function buildHydraulicLookup(substrate) {
  const psi = new Float32Array(HYDRAULIC_LOOKUP_STEPS + 1);
  const relativeK = new Float32Array(HYDRAULIC_LOOKUP_STEPS + 1);
  const residual = residualSaturationFraction(substrate);
  const n = Math.max(1.08, substrate.vgN);
  const m = 1 - 1 / n;
  const alpha = Math.max(0.05, substrate.vgAlpha);
  for (let index = 0; index <= HYDRAULIC_LOOKUP_STEPS; index += 1) {
    const saturation = index / HYDRAULIC_LOOKUP_STEPS;
    const se = clamp((saturation - residual) / Math.max(1e-6, 1 - residual), MIN_EFFECTIVE_SATURATION, 0.9995);
    const suction = Math.pow(Math.pow(se, -1 / m) - 1, 1 / n) / alpha;
    const inner = 1 - Math.pow(1 - Math.pow(se, 1 / m), m);
    psi[index] = -Math.min(MAX_MATRIC_SUCTION_M, suction);
    relativeK[index] = clamp(Math.sqrt(se) * inner * inner, 0, 1);
  }

  return { psi, relativeK };
}

function hydraulicLookups() {
  if (!hydraulicLookupByIndex) {
    hydraulicLookupByIndex = SUBSTRATES.map((substrate) => buildHydraulicLookup(substrate));
  }
  return hydraulicLookupByIndex;
}

let hydraulicLookupTablesForWasmCache = null;

function hydraulicLookupTablesForWasm() {
  if (hydraulicLookupTablesForWasmCache) {
    return hydraulicLookupTablesForWasmCache;
  }

  const lookups = hydraulicLookups();
  const stride = HYDRAULIC_LOOKUP_STEPS + 1;
  const hydraulicPsi = new Float32Array(SUBSTRATES.length * stride);
  const hydraulicRelativeK = new Float32Array(SUBSTRATES.length * stride);
  const groundwaterPow17 = new Float32Array(stride);
  for (let substrateIndex = 0; substrateIndex < SUBSTRATES.length; substrateIndex += 1) {
    const offset = substrateIndex * stride;
    hydraulicPsi.set(lookups[substrateIndex].psi, offset);
    hydraulicRelativeK.set(lookups[substrateIndex].relativeK, offset);
  }
  for (let index = 0; index < stride; index += 1) {
    groundwaterPow17[index] = (index / HYDRAULIC_LOOKUP_STEPS) ** 1.7;
  }
  hydraulicLookupTablesForWasmCache = { hydraulicPsi, hydraulicRelativeK, groundwaterPow17 };
  return hydraulicLookupTablesForWasmCache;
}

function hydraulicLookupForIndex(index) {
  return hydraulicLookups()[index] ?? hydraulicLookups()[0];
}

function hydraulicLookupFor(substrate) {
  const index = SUBSTRATES.indexOf(substrate);
  return hydraulicLookupForIndex(index >= 0 ? index : 0);
}

function interpolateHydraulicTable(table, saturation) {
  const x = clamp(saturation) * HYDRAULIC_LOOKUP_STEPS;
  const index = Math.min(HYDRAULIC_LOOKUP_STEPS - 1, Math.max(0, Math.floor(x)));
  const fraction = x - index;
  return table[index] + (table[index + 1] - table[index]) * fraction;
}

function effectiveSaturation(substrate, saturation) {
  const residual = residualSaturationFraction(substrate);
  return clamp((saturation - residual) / Math.max(1e-6, 1 - residual), MIN_EFFECTIVE_SATURATION, 0.9995);
}

function matricPotentialM(substrate, saturation) {
  return interpolateHydraulicTable(hydraulicLookupFor(substrate).psi, saturation);
}

function matricPotentialBySubstrateIndex(substrateIndex, saturation) {
  return interpolateHydraulicTable(hydraulicLookupForIndex(substrateIndex).psi, saturation);
}

function relativeHydraulicConductivity(substrate, saturation) {
  return interpolateHydraulicTable(hydraulicLookupFor(substrate).relativeK, saturation);
}

function relativeHydraulicConductivityBySubstrateIndex(substrateIndex, saturation) {
  return interpolateHydraulicTable(hydraulicLookupForIndex(substrateIndex).relativeK, saturation);
}

function unsaturatedHydraulicConductivity(substrate, saturation, layer) {
  const saturatedK = layer === 0 ? substrate.ksat0 : substrate.ksat1;
  return saturatedK * relativeHydraulicConductivity(substrate, saturation);
}

function unsaturatedHydraulicConductivityBySubstrateIndex(substrateIndex, saturation, layer) {
  const substrate = SUBSTRATES[substrateIndex] ?? SUBSTRATES[0];
  const saturatedK = layer === 0 ? substrate.ksat0 : substrate.ksat1;
  return saturatedK * relativeHydraulicConductivityBySubstrateIndex(substrateIndex, saturation);
}

function groundwaterTransmissivity(substrate, saturation, layerThickness, multiplier) {
  const activeThickness = layerThickness * (0.08 + 0.92 * clamp(saturation) ** 1.7);
  return substrate.gwK * activeThickness * multiplier;
}

function harmonicMean(a, b) {
  return a > 0 && b > 0 ? (2 * a * b) / (a + b) : 0;
}

function clamp(value, lower = 0, upper = 1) {
  return Math.max(lower, Math.min(upper, value));
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function normalize3(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function swap(state, a, b) {
  const tmp = state[a];
  state[a] = state[b];
  state[b] = tmp;
}
