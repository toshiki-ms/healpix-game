export const SIM_WASM_VERSION = "20260624-terrain-meander4";
const SIM_WASM_URL = `${import.meta.env?.BASE_URL ?? "./"}assets/sim/asteroid_sim.wasm?v=${SIM_WASM_VERSION}`;
const SIM_WASM_SHARED_URL = `${import.meta.env?.BASE_URL ?? "./"}assets/sim/asteroid_sim_shared.wasm?v=${SIM_WASM_VERSION}`;
const SIM_WORKER_URL = new URL("./asteroid-sim-worker.js", import.meta.url);
const MIN_BOUND_MODEL_SPARE_BYTES = 16 * 1024 * 1024;
const BOUND_MODEL_SPARE_BYTES_PER_CELL = 512;
const SHARED_WASM_INITIAL_PAGES = 4096;
const SHARED_WASM_MAXIMUM_PAGES = 32768;
const MAX_SIM_WORKERS = 8;
const ECOSYSTEM_WORKER_STACK_BYTES = 2 * 1024 * 1024;
const ECOSYSTEM_WORKER_PROFILE_PHASES = [
  "setup",
  "hydraulicZero",
  "sunlightRain",
  "mobileNutrient",
  "rainSerial",
  "rainScaleMemory",
  "darcyCore",
  "darcyBarrier",
  "divergence",
  "roseProduce",
  "roseDistribute",
  "cellUpdates",
  "swapSetup",
  "cellCanopyPhotosynthesis",
  "cellPlantWater",
  "cellPlantCarbon",
  "cellSoilBio",
  "cellRichardsHydraulic",
  "darcyCoreHalo",
  "darcyCoreStencil",
  "divergenceHalo",
  "divergenceStencil"
];
const WASM_RBF_STENCIL_STRIDE = 12;
const WASM_ACTIVE_RANGE_START_ZERO = 1;
const RBF_TRANSPORT_BLOCK_EDGE = 16;
const RBF_TRANSPORT_SCRATCH_FIELDS = 16;
const ECOSYSTEM_STEP_FIELDS = [
  "SIZE",
  "ACTIVE_COUNT",
  "ACTIVE_OFFSET",
  "RBF_M",
  "TRANSPORT_BLOCK_COUNT",
  "TRANSPORT_BLOCK_CELL_OFFSETS_OFFSET",
  "TRANSPORT_BLOCK_CELL_IDS_OFFSET",
  "TRANSPORT_BLOCK_HALO_OFFSETS_OFFSET",
  "TRANSPORT_BLOCK_HALO_IDS_OFFSET",
  "TRANSPORT_BLOCK_LOCAL_STENCIL_OFFSET",
  "TRANSPORT_BLOCK_MAX_HALO_COUNT",
  "TRANSPORT_BLOCK_SCRATCH_OFFSET",
  "TRANSPORT_BLOCK_SCRATCH_STRIDE",
  "IS_EARTH",
  "RNG_STATE",
  "RNG_STATE_OUT_OFFSET",
  "MODEL_DT_DAYS",
  "SLOW_STEP_INTERVAL",
  "SLOW_STEP_PHASE",
  "SLOW_STEP_PHASE_OUT_OFFSET",
  "RAIN_AVERAGE_WEIGHT",
  "MEAN_RAIN",
  "ANNUAL_PRECIP_MM",
  "DRY_DAYS",
  "LAST_RAIN_OUT_OFFSET",
  "DAY",
  "RAIN_RENDER_SIZE",
  "RAIN_SCALE",
  "RAIN_PATCHINESS",
  "ASTEROID_CLOUD_COUNT",
  "EARTH_TROPICAL_SCALE",
  "EARTH_MID_LATITUDE_SCALE",
  "EARTH_TROPICAL_COUNT",
  "EARTH_MID_LATITUDE_COUNT",
  "CELL_SIZE_M",
  "SURFACE_WATER_DIFF_M2_DAY",
  "SURFACE_SLOPE_VELOCITY_M_DAY",
  "SURFACE_SLOPE_MAX_VELOCITY_M_DAY",
  "NUTRIENT_DIFF_M2_DAY",
  "BAOBAB_SEED_DIFFUSION_M2_DAY",
  "ROSE_SEED_DIFFUSION_M2_DAY",
  "SURFACE_FILM_THRESHOLD_M",
  "HYDRAULIC_LOOKUP_STEPS",
  "GROUNDWATER_FLOW_MULTIPLIER",
  "HYDRAULIC_STATE_CURRENT",
  "PHOTO_LOOKUP_STEPS",
  "PHOTO_TEMP_MIN_C",
  "PHOTO_TEMP_LOOKUP_SCALE",
  "ROOT_DEPTH",
  "STORAGE",
  "EVAPORATION",
  "ATMOSPHERIC_CO2",
  "BAOBAB_QUANTUM_YIELD",
  "BAOBAB_CURVATURE",
  "BAOBAB_CI_MIN",
  "BAOBAB_CI_MAX",
  "BAOBAB_EXTINCTION",
  "BAOBAB_G0_MOL",
  "BAOBAB_G1",
  "BAOBAB_MAX_CONDUCTANCE_MPS",
  "BAOBAB_MULTIPLIER",
  "ROSE_QUANTUM_YIELD",
  "ROSE_CURVATURE",
  "ROSE_CI_MIN",
  "ROSE_CI_MAX",
  "ROSE_EXTINCTION",
  "ROSE_G0_MOL",
  "ROSE_G1",
  "ROSE_MAX_CONDUCTANCE_MPS",
  "ROSE_MULTIPLIER",
  "ASTEROID_MEAN_TEMP_C",
  "ASTEROID_DIURNAL_RANGE_C",
  "ASTEROID_LATITUDE_TEMP_RANGE_C",
  "SHADE",
  "ROSE_COHORTS",
  "SUNLIGHT_NORMAL_XYZ_OFFSET",
  "SUNLIGHT_ROSE_CELL",
  "SUNLIGHT_TURN",
  "SUNLIGHT_TURNS_PER_DAY",
  "SUNLIGHT_MODEL_TIME_OFFSET_DAYS",
  "SUNLIGHT_MODEL_DURATION_DAYS",
  "SUNLIGHT_SAMPLE_COUNT",
  "STENCIL_OFFSET",
  "LAP_OFFSET",
  "GX_OFFSET",
  "GY_OFFSET",
  "RAIN_X_OFFSET",
  "RAIN_Y_OFFSET",
  "RAIN_TROPICS_OFFSET",
  "RAIN_MID_LATITUDE_OFFSET",
  "RAIN_WEAK_BACKGROUND_OFFSET",
  "RAIN_CLIMATOLOGY_OFFSET",
  "TROPICAL_X_OFFSET",
  "TROPICAL_Y_OFFSET",
  "TROPICAL_RADIUS_OFFSET",
  "TROPICAL_CORE_RADIUS_OFFSET",
  "TROPICAL_CORE_AMP_OFFSET",
  "TROPICAL_AMP_OFFSET",
  "MID_X_OFFSET",
  "MID_Y_OFFSET",
  "MID_RADIUS_OFFSET",
  "MID_COS_PHASE_OFFSET",
  "MID_SIN_PHASE_OFFSET",
  "MID_AMP_OFFSET",
  "HYDRAULIC_PSI_OFFSET",
  "HYDRAULIC_RELATIVE_K_OFFSET",
  "GROUNDWATER_POW17_OFFSET",
  "BAOBAB_VCMAX_OFFSET",
  "BAOBAB_JMAX_OFFSET",
  "BAOBAB_RD_OFFSET",
  "BAOBAB_GAMMA_STAR_OFFSET",
  "BAOBAB_KC_OFFSET",
  "BAOBAB_KO_OFFSET",
  "ROSE_VCMAX_OFFSET",
  "ROSE_JMAX_OFFSET",
  "ROSE_RD_OFFSET",
  "ROSE_GAMMA_STAR_OFFSET",
  "ROSE_KC_OFFSET",
  "ROSE_KO_OFFSET",
  "BAOBAB_RESPIRATION_Q10_OFFSET",
  "ROSE_RESPIRATION_Q10_OFFSET",
  "DISPERSAL_OFFSETS_OFFSET",
  "DISPERSAL_TARGETS_OFFSET",
  "DISPERSAL_WEIGHTS_OFFSET",
  "DISPERSAL_WEIGHT_SUMS_OFFSET",
  "SUBSTRATE_OFFSET",
  "LAND_ACTIVE_OFFSET",
  "BAOBAB_BLOCKED_OFFSET",
  "CELL_HEIGHT_OFFSET",
  "CLIMATE_MEAN_TEMP_C_OFFSET",
  "CLIMATE_DIURNAL_RANGE_C_OFFSET",
  "ELEVATION_OFFSET",
  "DEPTH_OFFSET",
  "H_OFFSET",
  "H_NEXT_OFFSET",
  "H_TRANSPORT_OFFSET",
  "R_OFFSET",
  "RAIN_MEMORY_OFFSET",
  "SNOW_ICE_M_OFFSET",
  "W0_OFFSET",
  "W1_OFFSET",
  "SOIL_WATER_OFFSET",
  "SOIL_WATER_NEXT_OFFSET",
  "SOIL_HEAD_OFFSET",
  "SOIL_HYDRAULIC_K_OFFSET",
  "SOIL_TRANSMISSIVITY_OFFSET",
  "SOIL_RESIDUAL_OFFSET",
  "SOIL_CAP_OFFSET",
  "SOIL_THICKNESS_OFFSET",
  "SOIL_CENTER_DEPTH_OFFSET",
  "SOIL_TRANSPORT_OFFSET",
  "GROUNDWATER_STORAGE_OFFSET",
  "GROUNDWATER_STORAGE_NEXT_OFFSET",
  "GROUNDWATER_CAP_OFFSET",
  "GROUNDWATER_HEAD_OFFSET",
  "GROUNDWATER_T_OFFSET",
  "GROUNDWATER_THICKNESS_OFFSET",
  "GROUNDWATER_TOP_DEPTH_OFFSET",
  "GROUNDWATER_TRANSPORT_OFFSET",
  "GROUNDWATER_RECHARGE_OFFSET",
  "SOIL_MINERAL_N_OFFSET",
  "SOIL_MINERAL_N_NEXT_OFFSET",
  "SOIL_MINERAL_TRANSPORT_OFFSET",
  "SOIL_CARBON_ACTIVE_OFFSET",
  "SOIL_CARBON_ACTIVE_NEXT_OFFSET",
  "SOIL_CARBON_STABLE_OFFSET",
  "SOIL_CARBON_STABLE_NEXT_OFFSET",
  "LITTER_CARBON_OFFSET",
  "LITTER_CARBON_NEXT_OFFSET",
  "LITTER_FAST_CARBON_OFFSET",
  "LITTER_FAST_CARBON_NEXT_OFFSET",
  "LITTER_SLOW_CARBON_OFFSET",
  "LITTER_SLOW_CARBON_NEXT_OFFSET",
  "ROSE_FERTILITY_OFFSET",
  "MOBILE_NUTRIENT_OFFSET",
  "BAOBAB_SEED_OFFSET",
  "BAOBAB_SEED_NEXT_OFFSET",
  "BAOBAB_SEED_TRANSPORT_OFFSET",
  "BAOBAB_READINESS_OFFSET",
  "BAOBAB_READINESS_NEXT_OFFSET",
  "ROSE_SEED_OFFSET",
  "ROSE_SEED_NEXT_OFFSET",
  "ROSE_SEED_TRANSPORT_OFFSET",
  "ROSE_READINESS_OFFSET",
  "ROSE_READINESS_NEXT_OFFSET",
  "ROSE_SEED_PRODUCTION_OFFSET",
  "ROSE_SEED_ARRIVAL_OFFSET",
  "ROSE_SEED_ARRIVAL_THREAD_OFFSET",
  "SLOPE_X_OFFSET",
  "SLOPE_Y_OFFSET",
  "SURFACE_UX_OFFSET",
  "SURFACE_UY_OFFSET",
  "TOP_SOIL_UX_OFFSET",
  "TOP_SOIL_UY_OFFSET",
  "GROUNDWATER_UX_OFFSET",
  "GROUNDWATER_UY_OFFSET",
  "FLUX_X_OFFSET",
  "FLUX_Y_OFFSET",
  "SUNLIGHT_OFFSET",
  "LAI_BAOBAB_OFFSET",
  "LAI_ROSE_OFFSET",
  "COVER_BAOBAB_OFFSET",
  "COVER_ROSE_OFFSET",
  "VEGETATION_COVER_OFFSET",
  "CANOPY_LIGHT_BAOBAB_OFFSET",
  "CANOPY_LIGHT_ROSE_OFFSET",
  "LIGHT_BAOBAB_OFFSET",
  "LIGHT_ROSE_OFFSET",
  "SURFACE_TEMP_C_OFFSET",
  "VPD_KPA_OFFSET",
  "VAPOR_SLOPE_KPA_C_OFFSET",
  "PAR_OFFSET",
  "APAR_TOTAL_OFFSET",
  "APAR_BAOBAB_OFFSET",
  "APAR_ROSE_OFFSET",
  "PHOTO_WATER_STRESS_BAOBAB_OFFSET",
  "PHOTO_WATER_STRESS_ROSE_OFFSET",
  "PHOTO_NUTRIENT_BAOBAB_OFFSET",
  "PHOTO_NUTRIENT_ROSE_OFFSET",
  "GPP_BAOBAB_OFFSET",
  "GPP_ROSE_OFFSET",
  "STOMATAL_CONDUCTANCE_BAOBAB_OFFSET",
  "STOMATAL_CONDUCTANCE_ROSE_OFFSET",
  "CI_BAOBAB_OFFSET",
  "CI_ROSE_OFFSET",
  "ROOT_STRESS_BAOBAB_OFFSET",
  "ROOT_STRESS_ROSE_OFFSET",
  "SLOW_ENV_GPP_BAOBAB_OFFSET",
  "SLOW_ENV_GPP_ROSE_OFFSET",
  "SLOW_ENV_ROOT_STRESS_BAOBAB_OFFSET",
  "SLOW_ENV_ROOT_STRESS_ROSE_OFFSET",
  "SLOW_ENV_CANOPY_LIGHT_BAOBAB_OFFSET",
  "SLOW_ENV_CANOPY_LIGHT_ROSE_OFFSET",
  "SLOW_ENV_LIGHT_BAOBAB_OFFSET",
  "SLOW_ENV_LIGHT_ROSE_OFFSET",
  "SLOW_ENV_VEGETATION_COVER_OFFSET",
  "SLOW_ENV_SURFACE_TEMP_C_OFFSET",
  "SLOW_ENV_ASH_STRESS_OFFSET",
  "SLOW_ENV_WETNESS_OFFSET",
  "SLOW_ENV_TOP_SAT_OFFSET",
  "SLOW_ENV_GROUNDWATER_SAT_OFFSET",
  "CANOPY_WATER_OFFSET",
  "CANOPY_WATER_NEXT_OFFSET",
  "CANOPY_EVAP_M_OFFSET",
  "BAOBAB_LEAF_OFFSET",
  "BAOBAB_LEAF_NEXT_OFFSET",
  "BAOBAB_STEM_OFFSET",
  "BAOBAB_STEM_NEXT_OFFSET",
  "BAOBAB_ROOT_OFFSET",
  "BAOBAB_ROOT_NEXT_OFFSET",
  "BAOBAB_STORE_OFFSET",
  "BAOBAB_STORE_NEXT_OFFSET",
  "ROSE_LEAF_OFFSET",
  "ROSE_LEAF_NEXT_OFFSET",
  "ROSE_FLOWER_OFFSET",
  "ROSE_FLOWER_NEXT_OFFSET",
  "ROSE_ROOT_OFFSET",
  "ROSE_ROOT_NEXT_OFFSET",
  "ROSE_STORE_OFFSET",
  "ROSE_STORE_NEXT_OFFSET",
  "MB_OFFSET",
  "MR_OFFSET",
  "SB_OFFSET",
  "MB_NEXT_OFFSET",
  "MR_NEXT_OFFSET",
  "SB_NEXT_OFFSET",
  "HYDROLOGY_THROUGHFALL_OFFSET",
  "HYDROLOGY_VEG_FEEDBACK_OFFSET",
  "HYDROLOGY_SINK0_OFFSET",
  "HYDROLOGY_SINK1_OFFSET",
  "HYDROLOGY_SINK2_OFFSET",
  "HYDROLOGY_GROUNDWATER_SINK_OFFSET",
  "HYDROLOGY_SURFACE_EVAP_DEMAND_M_OFFSET",
  "HYDROLOGY_HORIZONTAL_M_OFFSET",
  "HYDROLOGY_INFILTRATION_M_OFFSET",
  "HYDROLOGY_PERCOLATION01_M_OFFSET",
  "HYDROLOGY_PERCOLATION12_M_OFFSET",
  "HYDROLOGY_RECHARGE_M_OFFSET",
  "HYDROLOGY_LEAKAGE_M_OFFSET",
  "HYDROLOGY_SURFACE_EVAP_M_OFFSET",
  "SOIL_BIO_WETNESS_OFFSET",
  "SOIL_BIO_TEMP_C_OFFSET",
  "SOIL_BIO_ASH_LOAD_OFFSET",
  "SOIL_BIO_TOP_SAT_OFFSET",
  "SOIL_BIO_GROUNDWATER_SAT_OFFSET",
  "SOIL_BIO_LITTER_FAST_INPUT_OFFSET",
  "SOIL_BIO_LITTER_SLOW_INPUT_OFFSET",
  "SOIL_BIO_PLANT_NUTRIENT_UPTAKE_OFFSET",
  "ASH_STRESS_OFFSET",
  "BAOBAB_RISK_OFFSET"
];

const ECOSYSTEM_STEP_FIELD_INDEX = Object.freeze(
  Object.fromEntries(ECOSYSTEM_STEP_FIELDS.map((name, index) => [name, index]))
);
const ECOSYSTEM_STEP_INTEGER_FIELDS = new Set([
  "SIZE",
  "ACTIVE_COUNT",
  "ACTIVE_OFFSET",
  "RBF_M",
  "TRANSPORT_BLOCK_COUNT",
  "TRANSPORT_BLOCK_CELL_OFFSETS_OFFSET",
  "TRANSPORT_BLOCK_CELL_IDS_OFFSET",
  "TRANSPORT_BLOCK_HALO_OFFSETS_OFFSET",
  "TRANSPORT_BLOCK_HALO_IDS_OFFSET",
  "TRANSPORT_BLOCK_LOCAL_STENCIL_OFFSET",
  "TRANSPORT_BLOCK_MAX_HALO_COUNT",
  "TRANSPORT_BLOCK_SCRATCH_OFFSET",
  "TRANSPORT_BLOCK_SCRATCH_STRIDE",
  "IS_EARTH",
  "RNG_STATE",
  "RNG_STATE_OUT_OFFSET",
  "SLOW_STEP_INTERVAL",
  "SLOW_STEP_PHASE",
  "SLOW_STEP_PHASE_OUT_OFFSET",
  "ASTEROID_CLOUD_COUNT",
  "EARTH_TROPICAL_COUNT",
  "EARTH_MID_LATITUDE_COUNT",
  "HYDRAULIC_LOOKUP_STEPS",
  "HYDRAULIC_STATE_CURRENT",
  "PHOTO_LOOKUP_STEPS",
  "ROSE_COHORTS",
  "SUNLIGHT_ROSE_CELL",
  "SUNLIGHT_SAMPLE_COUNT"
]);
const ECOSYSTEM_STEP_STATE_OFFSET_FIELDS = Object.freeze({
  SUBSTRATE_OFFSET: "substrate",
  LAND_ACTIVE_OFFSET: "landActive",
  BAOBAB_BLOCKED_OFFSET: "baobabBlocked",
  CELL_HEIGHT_OFFSET: "cellHeight",
  CLIMATE_MEAN_TEMP_C_OFFSET: "climateMeanTempC",
  CLIMATE_DIURNAL_RANGE_C_OFFSET: "climateDiurnalRangeC",
  ELEVATION_OFFSET: "elevation",
  DEPTH_OFFSET: "depth",
  H_OFFSET: "H",
  H_NEXT_OFFSET: "Hn",
  H_TRANSPORT_OFFSET: "Htransport",
  R_OFFSET: "R",
  RAIN_MEMORY_OFFSET: "rainMemory",
  SNOW_ICE_M_OFFSET: "snowIceM",
  W0_OFFSET: "W0",
  W1_OFFSET: "W1",
  SOIL_WATER_OFFSET: "soilWater",
  SOIL_WATER_NEXT_OFFSET: "soilWaterN",
  SOIL_HEAD_OFFSET: "soilHead",
  SOIL_HYDRAULIC_K_OFFSET: "soilHydraulicK",
  SOIL_TRANSMISSIVITY_OFFSET: "soilTransmissivity",
  SOIL_RESIDUAL_OFFSET: "soilResidual",
  SOIL_CAP_OFFSET: "soilCap",
  SOIL_THICKNESS_OFFSET: "soilThickness",
  SOIL_CENTER_DEPTH_OFFSET: "soilCenterDepth",
  SOIL_TRANSPORT_OFFSET: "soilTransport",
  GROUNDWATER_STORAGE_OFFSET: "groundwaterStorage",
  GROUNDWATER_STORAGE_NEXT_OFFSET: "groundwaterStorageN",
  GROUNDWATER_CAP_OFFSET: "groundwaterCap",
  GROUNDWATER_HEAD_OFFSET: "groundwaterHead",
  GROUNDWATER_T_OFFSET: "groundwaterT",
  GROUNDWATER_THICKNESS_OFFSET: "groundwaterThickness",
  GROUNDWATER_TOP_DEPTH_OFFSET: "groundwaterTopDepth",
  GROUNDWATER_TRANSPORT_OFFSET: "groundwaterTransport",
  GROUNDWATER_RECHARGE_OFFSET: "groundwaterRecharge",
  SOIL_MINERAL_N_OFFSET: "soilMineralN",
  SOIL_MINERAL_N_NEXT_OFFSET: "soilMineralNN",
  SOIL_MINERAL_TRANSPORT_OFFSET: "soilMineralTransport",
  SOIL_CARBON_ACTIVE_OFFSET: "soilCarbonActive",
  SOIL_CARBON_ACTIVE_NEXT_OFFSET: "soilCarbonActiveN",
  SOIL_CARBON_STABLE_OFFSET: "soilCarbonStable",
  SOIL_CARBON_STABLE_NEXT_OFFSET: "soilCarbonStableN",
  LITTER_CARBON_OFFSET: "litterCarbon",
  LITTER_CARBON_NEXT_OFFSET: "litterCarbonN",
  LITTER_FAST_CARBON_OFFSET: "litterFastCarbon",
  LITTER_FAST_CARBON_NEXT_OFFSET: "litterFastCarbonN",
  LITTER_SLOW_CARBON_OFFSET: "litterSlowCarbon",
  LITTER_SLOW_CARBON_NEXT_OFFSET: "litterSlowCarbonN",
  ROSE_FERTILITY_OFFSET: "roseFertility",
  BAOBAB_SEED_OFFSET: "baobabSeed",
  BAOBAB_SEED_NEXT_OFFSET: "baobabSeedN",
  BAOBAB_SEED_TRANSPORT_OFFSET: "baobabSeedTransport",
  BAOBAB_READINESS_OFFSET: "baobabGerminationReadiness",
  BAOBAB_READINESS_NEXT_OFFSET: "baobabGerminationReadinessN",
  ROSE_SEED_OFFSET: "roseSeed",
  ROSE_SEED_NEXT_OFFSET: "roseSeedN",
  ROSE_SEED_TRANSPORT_OFFSET: "roseSeedTransport",
  ROSE_READINESS_OFFSET: "roseGerminationReadiness",
  ROSE_READINESS_NEXT_OFFSET: "roseGerminationReadinessN",
  ROSE_SEED_PRODUCTION_OFFSET: "roseSeedProduction",
  ROSE_SEED_ARRIVAL_OFFSET: "roseSeedArrival",
  SLOPE_X_OFFSET: "slopeX",
  SLOPE_Y_OFFSET: "slopeY",
  SURFACE_UX_OFFSET: "surfaceUx",
  SURFACE_UY_OFFSET: "surfaceUy",
  TOP_SOIL_UX_OFFSET: "topSoilUx",
  TOP_SOIL_UY_OFFSET: "topSoilUy",
  GROUNDWATER_UX_OFFSET: "groundwaterUx",
  GROUNDWATER_UY_OFFSET: "groundwaterUy",
  FLUX_X_OFFSET: "fluxX",
  FLUX_Y_OFFSET: "fluxY",
  SUNLIGHT_OFFSET: "sunlight",
  LAI_BAOBAB_OFFSET: "laiBaobab",
  LAI_ROSE_OFFSET: "laiRose",
  COVER_BAOBAB_OFFSET: "coverBaobab",
  COVER_ROSE_OFFSET: "coverRose",
  VEGETATION_COVER_OFFSET: "vegetationCover",
  CANOPY_LIGHT_BAOBAB_OFFSET: "canopyLightBaobab",
  CANOPY_LIGHT_ROSE_OFFSET: "canopyLightRose",
  LIGHT_BAOBAB_OFFSET: "lightBaobab",
  LIGHT_ROSE_OFFSET: "lightRose",
  SURFACE_TEMP_C_OFFSET: "surfaceTempC",
  VPD_KPA_OFFSET: "vpdKpa",
  VAPOR_SLOPE_KPA_C_OFFSET: "vaporSlopeKpaC",
  PAR_OFFSET: "par",
  APAR_TOTAL_OFFSET: "aparTotal",
  APAR_BAOBAB_OFFSET: "aparBaobab",
  APAR_ROSE_OFFSET: "aparRose",
  PHOTO_WATER_STRESS_BAOBAB_OFFSET: "photoWaterStressBaobab",
  PHOTO_WATER_STRESS_ROSE_OFFSET: "photoWaterStressRose",
  PHOTO_NUTRIENT_BAOBAB_OFFSET: "photoNutrientBaobab",
  PHOTO_NUTRIENT_ROSE_OFFSET: "photoNutrientRose",
  GPP_BAOBAB_OFFSET: "gppBaobab",
  GPP_ROSE_OFFSET: "gppRose",
  STOMATAL_CONDUCTANCE_BAOBAB_OFFSET: "stomatalConductanceBaobabMps",
  STOMATAL_CONDUCTANCE_ROSE_OFFSET: "stomatalConductanceRoseMps",
  CI_BAOBAB_OFFSET: "ciBaobab",
  CI_ROSE_OFFSET: "ciRose",
  ROOT_STRESS_BAOBAB_OFFSET: "rootStressBaobab",
  ROOT_STRESS_ROSE_OFFSET: "rootStressRose",
  SLOW_ENV_GPP_BAOBAB_OFFSET: "slowEnvGppBaobab",
  SLOW_ENV_GPP_ROSE_OFFSET: "slowEnvGppRose",
  SLOW_ENV_ROOT_STRESS_BAOBAB_OFFSET: "slowEnvRootStressBaobab",
  SLOW_ENV_ROOT_STRESS_ROSE_OFFSET: "slowEnvRootStressRose",
  SLOW_ENV_CANOPY_LIGHT_BAOBAB_OFFSET: "slowEnvCanopyLightBaobab",
  SLOW_ENV_CANOPY_LIGHT_ROSE_OFFSET: "slowEnvCanopyLightRose",
  SLOW_ENV_LIGHT_BAOBAB_OFFSET: "slowEnvLightBaobab",
  SLOW_ENV_LIGHT_ROSE_OFFSET: "slowEnvLightRose",
  SLOW_ENV_VEGETATION_COVER_OFFSET: "slowEnvVegetationCover",
  SLOW_ENV_SURFACE_TEMP_C_OFFSET: "slowEnvSurfaceTempC",
  SLOW_ENV_ASH_STRESS_OFFSET: "slowEnvAshStress",
  SLOW_ENV_WETNESS_OFFSET: "slowEnvWetness",
  SLOW_ENV_TOP_SAT_OFFSET: "slowEnvTopSat",
  SLOW_ENV_GROUNDWATER_SAT_OFFSET: "slowEnvGroundwaterSat",
  CANOPY_WATER_OFFSET: "canopyWater",
  CANOPY_WATER_NEXT_OFFSET: "canopyWaterN",
  CANOPY_EVAP_M_OFFSET: "canopyEvapM",
  BAOBAB_LEAF_OFFSET: "baobabLeaf",
  BAOBAB_LEAF_NEXT_OFFSET: "baobabLeafN",
  BAOBAB_STEM_OFFSET: "baobabStem",
  BAOBAB_STEM_NEXT_OFFSET: "baobabStemN",
  BAOBAB_ROOT_OFFSET: "baobabRoot",
  BAOBAB_ROOT_NEXT_OFFSET: "baobabRootN",
  BAOBAB_STORE_OFFSET: "baobabStore",
  BAOBAB_STORE_NEXT_OFFSET: "baobabStoreN",
  ROSE_LEAF_OFFSET: "roseLeaf",
  ROSE_LEAF_NEXT_OFFSET: "roseLeafN",
  ROSE_FLOWER_OFFSET: "roseFlower",
  ROSE_FLOWER_NEXT_OFFSET: "roseFlowerN",
  ROSE_ROOT_OFFSET: "roseRoot",
  ROSE_ROOT_NEXT_OFFSET: "roseRootN",
  ROSE_STORE_OFFSET: "roseStore",
  ROSE_STORE_NEXT_OFFSET: "roseStoreN",
  MB_OFFSET: "MB",
  MR_OFFSET: "MR",
  SB_OFFSET: "SB",
  MB_NEXT_OFFSET: "MBn",
  MR_NEXT_OFFSET: "MRn",
  SB_NEXT_OFFSET: "SBn",
  HYDROLOGY_THROUGHFALL_OFFSET: "hydrologyThroughfall",
  HYDROLOGY_VEG_FEEDBACK_OFFSET: "hydrologyVegFeedback",
  HYDROLOGY_SINK0_OFFSET: "hydrologySink0",
  HYDROLOGY_SINK1_OFFSET: "hydrologySink1",
  HYDROLOGY_SINK2_OFFSET: "hydrologySink2",
  HYDROLOGY_GROUNDWATER_SINK_OFFSET: "hydrologyGroundwaterSink",
  HYDROLOGY_SURFACE_EVAP_DEMAND_M_OFFSET: "hydrologySurfaceEvapDemandM",
  HYDROLOGY_HORIZONTAL_M_OFFSET: "hydrologyHorizontalM",
  HYDROLOGY_INFILTRATION_M_OFFSET: "hydrologyInfiltrationM",
  HYDROLOGY_PERCOLATION01_M_OFFSET: "hydrologyPercolation01M",
  HYDROLOGY_PERCOLATION12_M_OFFSET: "hydrologyPercolation12M",
  HYDROLOGY_RECHARGE_M_OFFSET: "hydrologyRechargeM",
  HYDROLOGY_LEAKAGE_M_OFFSET: "hydrologyLeakageM",
  HYDROLOGY_SURFACE_EVAP_M_OFFSET: "hydrologySurfaceEvapM",
  SOIL_BIO_WETNESS_OFFSET: "soilBioWetness",
  SOIL_BIO_TEMP_C_OFFSET: "soilBioTempC",
  SOIL_BIO_ASH_LOAD_OFFSET: "soilBioAshLoad",
  SOIL_BIO_TOP_SAT_OFFSET: "soilBioTopSat",
  SOIL_BIO_GROUNDWATER_SAT_OFFSET: "soilBioGroundwaterSat",
  SOIL_BIO_LITTER_FAST_INPUT_OFFSET: "soilBioLitterFastInput",
  SOIL_BIO_LITTER_SLOW_INPUT_OFFSET: "soilBioLitterSlowInput",
  SOIL_BIO_PLANT_NUTRIENT_UPTAKE_OFFSET: "soilBioPlantNutrientUptake",
  ASH_STRESS_OFFSET: "ashStress",
  BAOBAB_RISK_OFFSET: "baobabRisk"
});

const VEGETATION_INIT_FIELDS = Object.freeze([
  "terrainCode",
  "moisture",
  "soil",
  "flower",
  "ashInput",
  "baobabInput",
  "roseGardenMask",
  "baobabRiskInput",
  "baobabBlockedInput",
  "elevationInput",
  "cellHeightInput",
  "cellPhi",
  "climateMeanInput",
  "climateDiurnalInput",
  "rainClimatologyInput",
  "landActive",
  "substrate",
  "depth",
  "roseFertility",
  "baobabRisk",
  "baobabBlocked",
  "sunlight",
  "cellHeight",
  "climateMeanTempC",
  "climateDiurnalRangeC",
  "elevation",
  "rainClimatology",
  "H",
  "R",
  "rainMemory",
  "ashStress",
  "soilCap",
  "soilResidual",
  "soilThickness",
  "soilCenterDepth",
  "soilWater",
  "W0",
  "W1",
  "groundwaterStorage",
  "groundwaterCap",
  "groundwaterThickness",
  "groundwaterTopDepth",
  "soilMineralN",
  "litterCarbon",
  "litterFastCarbon",
  "litterSlowCarbon",
  "soilCarbonActive",
  "soilCarbonStable",
  "nutrientStressBaobab",
  "nutrientStressRose",
  "baobabLeaf",
  "baobabStem",
  "baobabRoot",
  "baobabStore",
  "MB",
  "SB",
  "roseLeaf",
  "roseFlower",
  "roseRoot",
  "roseStore",
  "MR",
  "baobabSeed",
  "roseSeed",
  "baobabGerminationReadiness",
  "roseGerminationReadiness"
]);

const EARTH_PROFILE_FIELDS = Object.freeze([
  "cellHeight",
  "cellPhi",
  "landFraction",
  "elevationGrid",
  "climateGrid",
  "terrainCode",
  "koppenCode",
  "moisture",
  "soil",
  "baobabRisk",
  "flower",
  "elevation",
  "climateMeanTempC",
  "climateDiurnalRangeC",
  "rainClimatology"
]);

const ASTEROID_PROFILE_FIELDS = Object.freeze([
  "cellHeight",
  "cellPhi",
  "cellRing",
  "volcanoHeight",
  "volcanoPhi",
  "volcanoRing",
  "activeVolcanoHeight",
  "activeVolcanoPhi",
  "activeCenterHeight",
  "activeCenterPhi",
  "waterHeight",
  "waterPhi",
  "baobabWatchHeight",
  "baobabWatchPhi",
  "volcanoMask",
  "activeVolcanoMask",
  "terrainCode",
  "moisture",
  "soil",
  "baobabRisk",
  "baobabBlocked",
  "ash",
  "elevation",
  "volcanicAshFallRate",
  "activeVolcanoCraterMask",
  "care"
]);

const ECOSYSTEM_STEP_STATE_OFFSET_ENTRIES = Object.freeze(
  Object.entries(ECOSYSTEM_STEP_STATE_OFFSET_FIELDS).map(([field, key]) => [ECOSYSTEM_STEP_FIELD_INDEX[field], key])
);

let preloadPromise = null;
let loadedCore = null;
let loadError = null;
let sharedPreloadPromise = null;
let loadedSharedCore = null;
let sharedLoadError = null;

function canUseSharedSimulationMemory() {
  return (
    typeof WebAssembly !== "undefined" &&
    typeof SharedArrayBuffer !== "undefined" &&
    Boolean(globalThis.crossOriginIsolated)
  );
}

export async function preloadAsteroidSimulationCore() {
  if (loadedCore) {
    return loadedCore;
  }
  if (loadError) {
    throw loadError;
  }
  if (!preloadPromise) {
    preloadPromise = loadSimulationCore();
  }
  loadedCore = await preloadPromise;
  return loadedCore;
}

export async function preloadAsteroidSimulationSharedCore() {
  if (loadedSharedCore) {
    return loadedSharedCore;
  }
  if (sharedLoadError) {
    throw sharedLoadError;
  }
  if (!sharedPreloadPromise) {
    sharedPreloadPromise = loadSharedSimulationCore();
  }
  loadedSharedCore = await sharedPreloadPromise;
  return loadedSharedCore;
}

export function runWasmDarcyWaterColumns(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runDarcyWaterColumns(model, constants);
}

export function runWasmEcosystemStep(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runEcosystemStep(model, constants);
}

export function runWasmEcosystemStepsInPlace(model, constants, repeatCount) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runEcosystemStepsInPlace(model, constants, repeatCount);
}

export function runWasmEcosystemStepsThreaded(model, constants, repeatCount) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runEcosystemStepsThreaded(model, constants, repeatCount);
}

export function runWasmAdvanceAsh(ash, ashRate) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runAdvanceAsh(ash, ashRate);
}

export function runWasmCleanAsh(ash, targetIds, efficiencies, work, threshold) {
  if (!loadedCore) {
    return null;
  }
  return loadedCore.runCleanAsh(ash, targetIds, efficiencies, work, threshold);
}

export function runWasmSunlightField(normals, sunlight, options) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runSunlightField(normals, sunlight, options);
}

export function runWasmApplyWater(model, cellIds, weights, amountM, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runApplyWater(model, cellIds, weights, amountM, constants);
}

export function runWasmRemoveBaobab(model, cellId, amount) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runRemoveBaobab(model, cellId, amount);
}

export function runWasmRemoveRose(model, cellId, amount) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runRemoveRose(model, cellId, amount);
}

export function canRunWasmCanopyOptics() {
  return Boolean(loadedCore);
}

export function runWasmCanopyOptics(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runCanopyOptics(model, constants);
}

export function runWasmAsteroidDaysideRain(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runAsteroidDaysideRain(model, constants);
}

export function runWasmEarthRain(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runEarthRain(model, constants);
}

export function runWasmEarthCloudCover(options) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runEarthCloudCover(options);
}

export function runWasmRainMemory(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runRainMemory(model, constants);
}

export function runWasmBuildRoseSeedDispersalKernel(model, constants) {
  if (!loadedCore) {
    return null;
  }
  return loadedCore.buildRoseSeedDispersalKernel(model, constants);
}

export function runWasmRoseSeedDispersal(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runRoseSeedDispersal(model, constants);
}

export function runWasmRoseSeedProductionAndDispersal(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runRoseSeedProductionAndDispersal(model, constants);
}

export function runWasmCanopyEnvironment(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runCanopyEnvironment(model, constants);
}

export function runWasmCanopyEnvironmentPhotosynthesis(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runCanopyEnvironmentPhotosynthesis(model, constants);
}

export function canRunWasmPhotosynthesis() {
  return Boolean(loadedCore);
}

export function runWasmPhotosynthesis(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runPhotosynthesis(model, constants);
}

export function runWasmPrepareAndPhotosynthesis(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runPrepareAndPhotosynthesis(model, constants);
}

export function runWasmPlantWaterFluxes(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runPlantWaterFluxes(model, constants);
}

export function runWasmPlantCarbonSeeds(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runPlantCarbonSeeds(model, constants);
}

export function runWasmPreparePhotosynthesisInputs(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runPreparePhotosynthesisInputs(model, constants);
}

export function runWasmRichardsColumns(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runRichardsColumns(model, constants);
}

export function runWasmSurfaceNutrientTransport(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runSurfaceNutrientTransport(model, constants);
}

export function runWasmStableSurfaceWaterTransport(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runStableSurfaceWaterTransport(model, constants);
}

export function canRunWasmSoilBiogeochemistry() {
  return Boolean(loadedCore);
}

export function runWasmSoilBiogeochemistry(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runSoilBiogeochemistry(model, constants);
}

export function runWasmHydraulicState(model, constants) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runHydraulicState(model, constants);
}

export function runWasmInitializeVegetationState(model, initial) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runInitializeVegetationState(model, initial);
}

export function runWasmInitializeEarthProfile(options) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runInitializeEarthProfile(options);
}

export function runWasmInitializeAsteroidProfile(options) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.runInitializeAsteroidProfile(options);
}

export function bindAsteroidSimulationModel(model, options = {}) {
  if (!loadedCore) {
    return false;
  }
  return loadedCore.bindModelState(model, options);
}

function simulationCoreImports(imports = {}) {
  return {
    ...imports,
    env: {
      ...(imports.env ?? {}),
      sim_now_ms: typeof performance !== "undefined" ? () => performance.now() : () => Date.now()
    }
  };
}

export async function instantiateAsteroidSimulationCore(bytes, imports = {}) {
  const { instance } = await WebAssembly.instantiate(bytes, simulationCoreImports(imports));
  const exports = instance.exports;
  if (
    !(exports.memory instanceof WebAssembly.Memory) ||
    typeof exports.sim_reset_heap !== "function" ||
    typeof exports.sim_alloc !== "function" ||
    typeof exports.sim_initialize_asteroid_profile !== "function" ||
    typeof exports.sim_initialize_earth_profile !== "function" ||
    typeof exports.sim_initialize_vegetation_state !== "function" ||
    typeof exports.sim_update_canopy_optics !== "function" ||
    typeof exports.sim_update_canopy_environment !== "function" ||
    typeof exports.sim_update_canopy_environment_photosynthesis !== "function" ||
    typeof exports.sim_prepare_photosynthesis_inputs !== "function" ||
    typeof exports.sim_update_photosynthesis !== "function" ||
    typeof exports.sim_prepare_and_update_photosynthesis !== "function" ||
    typeof exports.sim_update_plant_water_fluxes !== "function" ||
    typeof exports.sim_update_plant_carbon_seeds !== "function" ||
    typeof exports.sim_update_hydraulic_state !== "function" ||
    typeof exports.sim_transport_darcy_water_columns !== "function" ||
    typeof exports.sim_transport_surface_nutrient !== "function" ||
    typeof exports.sim_compute_stable_surface_water_transport !== "function" ||
    typeof exports.sim_update_asteroid_dayside_rain !== "function" ||
    typeof exports.sim_update_earth_rain !== "function" ||
    typeof exports.sim_prepare_earth_cloud_geometry !== "function" ||
    typeof exports.sim_update_earth_cloud_cover !== "function" ||
    typeof exports.sim_update_rain_memory !== "function" ||
    typeof exports.sim_count_rose_seed_kernel !== "function" ||
    typeof exports.sim_fill_rose_seed_kernel !== "function" ||
    typeof exports.sim_distribute_rose_seeds !== "function" ||
    typeof exports.sim_produce_and_distribute_rose_seeds !== "function" ||
    typeof exports.sim_update_soil_biogeochemistry !== "function" ||
    typeof exports.sim_richards_columns_update !== "function" ||
    typeof exports.sim_advance_ash !== "function" ||
    typeof exports.sim_clean_ash_cells !== "function" ||
    typeof exports.sim_update_sunlight_field !== "function" ||
    typeof exports.sim_remove_baobab_pool !== "function" ||
    typeof exports.sim_remove_rose_pool !== "function" ||
    typeof exports.sim_apply_water_cells !== "function" ||
    typeof exports.sim_step_ecosystem !== "function" ||
    typeof exports.sim_step_ecosystem_in_place !== "function" ||
    typeof exports.sim_step_ecosystem_parallel_worker !== "function" ||
    typeof exports.sim_step_ecosystem_parallel_worker_profile !== "function"
  ) {
    throw new Error("simulation core exports are incomplete");
  }
  return createSimulationCore(exports);
}

export async function instantiateSharedAsteroidSimulationCore(bytes, memory) {
  if (!(memory instanceof WebAssembly.Memory) || !(memory.buffer instanceof SharedArrayBuffer)) {
    throw new Error("shared simulation core requires WebAssembly.Memory backed by SharedArrayBuffer");
  }
  return instantiateAsteroidSimulationCore(bytes, { env: { memory } });
}

export async function loadAsteroidSimulationCoreFromBytes(bytes) {
  loadedCore = await instantiateAsteroidSimulationCore(bytes);
  loadError = null;
  preloadPromise = Promise.resolve(loadedCore);
  return loadedCore;
}

export function resetLoadedAsteroidSimulationCore() {
  loadedCore = null;
  preloadPromise = null;
  loadError = null;
  loadedSharedCore = null;
  sharedPreloadPromise = null;
  sharedLoadError = null;
}

async function loadSimulationCore() {
  if (typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    throw new Error("C/WASM simulation requires fetch and WebAssembly support.");
  }

  if (canUseSharedSimulationMemory()) {
    try {
      const core = await loadSharedSimulationCore();
      loadedSharedCore = core;
      return core;
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.warn("Falling back to non-shared C/WASM simulation kernels.", error);
      }
    }
  }

  try {
    const response = await fetch(SIM_WASM_URL);
    if (!response.ok) {
      throw new Error(`simulation core returned ${response.status}`);
    }
    const bytes = await response.arrayBuffer();
    return instantiateAsteroidSimulationCore(bytes);
  } catch (error) {
    loadError = error;
    if (import.meta.env?.DEV) {
      console.warn("Failed to load C/WASM simulation kernels.", error);
    }
    throw error;
  }
}

async function loadSharedSimulationCore() {
  if (
    typeof fetch !== "function" ||
    typeof WebAssembly === "undefined" ||
    typeof SharedArrayBuffer === "undefined" ||
    !globalThis.crossOriginIsolated
  ) {
    throw new Error("WASM threads require SharedArrayBuffer and cross-origin isolation.");
  }

  try {
    const response = await fetch(SIM_WASM_SHARED_URL);
    if (!response.ok) {
      throw new Error(`shared simulation core returned ${response.status}`);
    }
    const bytes = await response.arrayBuffer();
    const memory = new WebAssembly.Memory({
      initial: SHARED_WASM_INITIAL_PAGES,
      maximum: SHARED_WASM_MAXIMUM_PAGES,
      shared: true
    });
    return instantiateSharedAsteroidSimulationCore(bytes, memory);
  } catch (error) {
    sharedLoadError = error;
    if (import.meta.env?.DEV) {
      console.warn("Failed to load shared C/WASM simulation kernels.", error);
    }
    throw error;
  }
}

function createSimulationCore(exports) {
  const bindings = new WeakMap();
  const ashAdvanceBindings = new WeakMap();
  const ashCleanBindings = new WeakMap();
  const sunlightBindings = new WeakMap();
  const sunlightNormalBindings = new WeakMap();
  const waterActionBindings = new WeakMap();
  const earthCloudBindings = new WeakMap();
  const supportedViewTypes = new Set([Float32Array, Float64Array, Int32Array, Uint32Array, Int16Array, Uint16Array, Uint8Array]);

  function addProfileTime(name, elapsedMs) {
    const sink = globalThis.__HEALPIX_ASTEROID_PROFILE__;
    if (!sink?.enabled) {
      return;
    }
    sink.sections ??= {};
    sink.sections[name] = (sink.sections[name] ?? 0) + elapsedMs;
  }

  function addProfileValue(name, value, reducer = "sum") {
    const sink = globalThis.__HEALPIX_ASTEROID_PROFILE__;
    if (!sink?.enabled) {
      return;
    }
    sink.sections ??= {};
    if (reducer === "max") {
      sink.sections[name] = Math.max(sink.sections[name] ?? 0, value);
      return;
    }
    sink.sections[name] = (sink.sections[name] ?? 0) + value;
  }

  function align16(byteLength) {
    return (byteLength + 15) & ~15;
  }

  function ensureMemory(requiredByteLength) {
    const pageSize = 65536;
    if (requiredByteLength > exports.memory.buffer.byteLength) {
      exports.memory.grow(Math.ceil((requiredByteLength - exports.memory.buffer.byteLength) / pageSize));
    }
  }

  function boundModelSpareBytes(model) {
    const sizeScaled = Math.ceil((model?.size ?? 0) * BOUND_MODEL_SPARE_BYTES_PER_CELL);
    return Math.max(MIN_BOUND_MODEL_SPARE_BYTES, sizeScaled);
  }

  function allocBytes(byteLength) {
    const offset = exports.sim_alloc(byteLength);
    const required = offset + byteLength;
    ensureMemory(required);
    return offset;
  }

  function allocateAndCopy(source, ViewType) {
    const offset = allocBytes(source.byteLength);
    copyTo(offset, source, ViewType);
    return offset;
  }

  function allocateLike(source) {
    return allocBytes(source.byteLength);
  }

  function copyTo(offset, source, ViewType) {
    new ViewType(exports.memory.buffer, offset, source.length).set(source);
  }

  function copyOut(target, offset, ViewType) {
    target.set(new ViewType(exports.memory.buffer, offset, target.length));
  }

  function viewOffset(source) {
    return source?.buffer === exports.memory.buffer ? source.byteOffset : null;
  }

  function allocateAndCopyIfNeeded(source, ViewType) {
    const offset = viewOffset(source);
    return offset ?? allocateAndCopy(source, ViewType);
  }

  function activeOffsetFor(modelBinding, activeCellIds) {
    if (!activeCellIds) {
      return WASM_ACTIVE_RANGE_START_ZERO;
    }
    if (modelBinding.activeSource === activeCellIds && modelBinding.activeOffset) {
      return modelBinding.activeOffset;
    }
    const offset = allocateAndCopyIfNeeded(activeCellIds, Int32Array);
    modelBinding.activeSource = activeCellIds;
    modelBinding.activeOffset = offset;
    return offset;
  }

  function allocateLikeIfNeeded(source) {
    const offset = viewOffset(source);
    return offset ?? allocateLike(source);
  }

  function inputOffset(source, fallbackOffset, ViewType) {
    const offset = viewOffset(source);
    if (offset !== null) {
      return offset;
    }
    copyTo(fallbackOffset, source, ViewType);
    return fallbackOffset;
  }

  function outputOffset(target, fallbackOffset) {
    return viewOffset(target) ?? fallbackOffset;
  }

  function copyOutIfNeeded(target, offset, ViewType) {
    if (viewOffset(target) === null) {
      copyOut(target, offset, ViewType);
    }
  }

  function cachedInputOffset(binding, sourceKey, offsetKey, source, ViewType) {
    const directOffset = viewOffset(source);
    if (directOffset !== null) {
      return directOffset;
    }
    if (binding[sourceKey] !== source || !binding[offsetKey]) {
      binding[offsetKey] = allocateAndCopy(source, ViewType);
      binding[sourceKey] = source;
    }
    return binding[offsetKey];
  }

  function cachedOutputOffset(binding, sourceKey, offsetKey, target) {
    const directOffset = viewOffset(target);
    if (directOffset !== null) {
      return directOffset;
    }
    if (binding[sourceKey] !== target || !binding[offsetKey]) {
      binding[offsetKey] = allocateLike(target);
      binding[sourceKey] = target;
    }
    return binding[offsetKey];
  }

  function runInitializeVegetationState(model, initial) {
    if (
      typeof exports.sim_initialize_vegetation_state !== "function" ||
      !model?.state ||
      !(initial?.terrainCode instanceof Uint8Array) ||
      !(initial?.cellPhi instanceof Float32Array)
    ) {
      return false;
    }

    const state = model.state;
    const inputSources = {
      terrainCode: initial.terrainCode,
      moisture: initial.moisture,
      soil: initial.soil,
      flower: initial.flower,
      ashInput: initial.ash,
      baobabInput: initial.baobab,
      roseGardenMask: initial.roseGardenMask,
      baobabRiskInput: initial.baobabRisk,
      baobabBlockedInput: initial.baobabBlocked,
      elevationInput: initial.elevation,
      cellHeightInput: initial.cellHeight,
      cellPhi: initial.cellPhi,
      climateMeanInput: initial.climateMeanTempC,
      climateDiurnalInput: initial.climateDiurnalRangeC,
      rainClimatologyInput: initial.rainClimatology
    };
    const offsets = new Uint32Array(VEGETATION_INIT_FIELDS.length);
    const copies = [];
    for (let index = 0; index < VEGETATION_INIT_FIELDS.length; index += 1) {
      const key = VEGETATION_INIT_FIELDS[index];
      const source = inputSources[key] ?? state[key];
      if (!ArrayBuffer.isView(source) || !supportedViewTypes.has(source.constructor)) {
        return false;
      }
      const existingOffset = index < 15 ? null : viewOffset(source);
      const offset = index < 15
        ? allocateAndCopy(source, source.constructor)
        : existingOffset ?? allocateLike(source);
      offsets[index] = offset >>> 0;
      if (index >= 15 && existingOffset === null) {
        copies.push({ target: source, offset, ViewType: source.constructor });
      }
    }
    const offsetsOffset = allocateAndCopy(offsets, Uint32Array);
    exports.sim_initialize_vegetation_state(
      model.size,
      model.topology?.nside ?? 0,
      model.planetPreset === "earth" ? 1 : 0,
      initial.roseCell ?? -1,
      offsetsOffset
    );
    for (const copy of copies) {
      copyOut(copy.target, copy.offset, copy.ViewType);
    }
    return true;
  }

  function runInitializeEarthProfile(options) {
    if (typeof exports.sim_initialize_earth_profile !== "function") {
      return false;
    }
    const size = options?.size ?? options?.cellHeight?.length ?? 0;
    const nside = options?.nside ?? 0;
    if (
      !Number.isInteger(size) ||
      size <= 0 ||
      !Number.isInteger(nside) ||
      nside <= 0 ||
      !(options?.cellHeight instanceof Float32Array) ||
      !(options?.cellPhi instanceof Float32Array) ||
      !(options?.landFraction instanceof Uint8Array) ||
      !(options?.elevationGrid instanceof Int16Array) ||
      !(options?.climateGrid instanceof Int16Array) ||
      !(options?.terrainCode instanceof Uint8Array) ||
      !(options?.koppenCode instanceof Uint8Array) ||
      !(options?.moisture instanceof Float32Array) ||
      !(options?.soil instanceof Float32Array) ||
      !(options?.baobabRisk instanceof Float32Array) ||
      !(options?.flower instanceof Float32Array) ||
      !(options?.elevation instanceof Float32Array) ||
      !(options?.climateMeanTempC instanceof Float32Array) ||
      !(options?.climateDiurnalRangeC instanceof Float32Array) ||
      !(options?.rainClimatology instanceof Float32Array)
    ) {
      return false;
    }

    const sources = {
      cellHeight: options.cellHeight,
      cellPhi: options.cellPhi,
      landFraction: options.landFraction,
      elevationGrid: options.elevationGrid,
      climateGrid: options.climateGrid,
      terrainCode: options.terrainCode,
      koppenCode: options.koppenCode,
      moisture: options.moisture,
      soil: options.soil,
      baobabRisk: options.baobabRisk,
      flower: options.flower,
      elevation: options.elevation,
      climateMeanTempC: options.climateMeanTempC,
      climateDiurnalRangeC: options.climateDiurnalRangeC,
      rainClimatology: options.rainClimatology
    };
    const inputCount = 5;
    const offsets = new Uint32Array(EARTH_PROFILE_FIELDS.length);
    const copies = [];
    for (let index = 0; index < EARTH_PROFILE_FIELDS.length; index += 1) {
      const key = EARTH_PROFILE_FIELDS[index];
      const source = sources[key];
      if (!ArrayBuffer.isView(source) || !supportedViewTypes.has(source.constructor)) {
        return false;
      }
      const existingOffset = viewOffset(source);
      const offset = index < inputCount
        ? existingOffset ?? allocateAndCopy(source, source.constructor)
        : existingOffset ?? allocateLike(source);
      offsets[index] = offset >>> 0;
      if (index >= inputCount && existingOffset === null) {
        copies.push({ target: source, offset, ViewType: source.constructor });
      }
    }
    const offsetsOffset = allocateAndCopy(offsets, Uint32Array);
    exports.sim_initialize_earth_profile(
      size,
      nside,
      options.roseCell ?? -1,
      offsetsOffset
    );
    for (const copy of copies) {
      copyOut(copy.target, copy.offset, copy.ViewType);
    }
    return true;
  }

  function runInitializeAsteroidProfile(options) {
    if (typeof exports.sim_initialize_asteroid_profile !== "function") {
      return false;
    }
    const size = options?.size ?? options?.cellHeight?.length ?? 0;
    const nside = options?.nside ?? 0;
    if (
      !Number.isInteger(size) ||
      size <= 0 ||
      !Number.isInteger(nside) ||
      nside <= 0 ||
      !(options?.cellHeight instanceof Float32Array) ||
      !(options?.cellPhi instanceof Float32Array) ||
      !(options?.cellRing instanceof Int32Array) ||
      !(options?.volcanoHeight instanceof Float32Array) ||
      !(options?.volcanoPhi instanceof Float32Array) ||
      !(options?.volcanoRing instanceof Int32Array) ||
      !(options?.activeVolcanoHeight instanceof Float32Array) ||
      !(options?.activeVolcanoPhi instanceof Float32Array) ||
      !(options?.activeCenterHeight instanceof Float32Array) ||
      !(options?.activeCenterPhi instanceof Float32Array) ||
      !(options?.waterHeight instanceof Float32Array) ||
      !(options?.waterPhi instanceof Float32Array) ||
      !(options?.baobabWatchHeight instanceof Float32Array) ||
      !(options?.baobabWatchPhi instanceof Float32Array) ||
      !(options?.volcanoMask instanceof Uint8Array) ||
      !(options?.activeVolcanoMask instanceof Uint8Array) ||
      !(options?.terrainCode instanceof Uint8Array) ||
      !(options?.moisture instanceof Float32Array) ||
      !(options?.soil instanceof Float32Array) ||
      !(options?.baobabRisk instanceof Float32Array) ||
      !(options?.baobabBlocked instanceof Uint8Array) ||
      !(options?.ash instanceof Float32Array) ||
      !(options?.elevation instanceof Float32Array) ||
      !(options?.volcanicAshFallRate instanceof Float32Array) ||
      !(options?.activeVolcanoCraterMask instanceof Uint8Array) ||
      !(options?.care instanceof Float32Array)
    ) {
      return false;
    }

    const sources = {
      cellHeight: options.cellHeight,
      cellPhi: options.cellPhi,
      cellRing: options.cellRing,
      volcanoHeight: options.volcanoHeight,
      volcanoPhi: options.volcanoPhi,
      volcanoRing: options.volcanoRing,
      activeVolcanoHeight: options.activeVolcanoHeight,
      activeVolcanoPhi: options.activeVolcanoPhi,
      activeCenterHeight: options.activeCenterHeight,
      activeCenterPhi: options.activeCenterPhi,
      waterHeight: options.waterHeight,
      waterPhi: options.waterPhi,
      baobabWatchHeight: options.baobabWatchHeight,
      baobabWatchPhi: options.baobabWatchPhi,
      volcanoMask: options.volcanoMask,
      activeVolcanoMask: options.activeVolcanoMask,
      terrainCode: options.terrainCode,
      moisture: options.moisture,
      soil: options.soil,
      baobabRisk: options.baobabRisk,
      baobabBlocked: options.baobabBlocked,
      ash: options.ash,
      elevation: options.elevation,
      volcanicAshFallRate: options.volcanicAshFallRate,
      activeVolcanoCraterMask: options.activeVolcanoCraterMask,
      care: options.care
    };
    const inputCount = 16;
    const offsets = new Uint32Array(ASTEROID_PROFILE_FIELDS.length);
    const copies = [];
    for (let index = 0; index < ASTEROID_PROFILE_FIELDS.length; index += 1) {
      const key = ASTEROID_PROFILE_FIELDS[index];
      const source = sources[key];
      if (!ArrayBuffer.isView(source) || !supportedViewTypes.has(source.constructor)) {
        return false;
      }
      const existingOffset = viewOffset(source);
      const offset = index < inputCount
        ? existingOffset ?? allocateAndCopy(source, source.constructor)
        : existingOffset ?? allocateLike(source);
      offsets[index] = offset >>> 0;
      if (index >= inputCount && existingOffset === null) {
        copies.push({ target: source, offset, ViewType: source.constructor });
      }
    }
    const offsetsOffset = allocateAndCopy(offsets, Uint32Array);
    exports.sim_initialize_asteroid_profile(
      size,
      nside,
      options.roseCell ?? -1,
      options.volcanoCount ?? 0,
      options.activeVolcanoCount ?? 0,
      options.activeCenterCount ?? 0,
      options.waterCount ?? 0,
      options.baobabWatchCount ?? 0,
      offsetsOffset
    );
    for (const copy of copies) {
      copyOut(copy.target, copy.offset, copy.ViewType);
    }
    return true;
  }

  function bindObjectViews(target, specs, cursor, options = {}) {
    for (const spec of specs) {
      const { key, source, ViewType } = spec;
      const offset = cursor.offset;
      const view = new ViewType(exports.memory.buffer, offset, source.length);
      if (options.copy === false) {
        view.fill(0);
      } else {
        view.set(source);
      }
      target[key] = view;
      cursor.offset += align16(source.byteLength);
    }
  }

  function copySpecsToOffsets(specs, cursor) {
    const offsets = {};
    for (const spec of specs) {
      const { key, source, ViewType } = spec;
      const offset = cursor.offset;
      new ViewType(exports.memory.buffer, offset, source.length).set(source);
      offsets[`${key}Offset`] = offset;
      cursor.offset += align16(source.byteLength);
    }
    return offsets;
  }

  function paddedRbfOperatorsFor(model) {
    const cached = model.__wasmPaddedRbfOperators;
    if (cached && cached.source === model.operators) {
      return cached;
    }
    const { stencil, lapW, gxW, gyW, m } = model.operators;
    const sourceStride = m ?? 9;
    if (
      sourceStride === WASM_RBF_STENCIL_STRIDE ||
      !ArrayBuffer.isView(stencil) ||
      !ArrayBuffer.isView(lapW) ||
      !ArrayBuffer.isView(gxW) ||
      !ArrayBuffer.isView(gyW)
    ) {
      const unpadded = { source: model.operators, stencil, lapW, gxW, gyW, m: sourceStride };
      model.__wasmPaddedRbfOperators = unpadded;
      return unpadded;
    }
    const size = model.size;
    const paddedLength = size * WASM_RBF_STENCIL_STRIDE;
    const paddedStencil = new Int32Array(paddedLength);
    const paddedLapW = new Float32Array(paddedLength);
    const paddedGxW = new Float32Array(paddedLength);
    const paddedGyW = new Float32Array(paddedLength);
    for (let i = 0; i < size; i += 1) {
      const sourceOffset = i * sourceStride;
      const targetOffset = i * WASM_RBF_STENCIL_STRIDE;
      const center = stencil[sourceOffset] ?? i;
      for (let k = 0; k < WASM_RBF_STENCIL_STRIDE; k += 1) {
        if (k < sourceStride) {
          paddedStencil[targetOffset + k] = stencil[sourceOffset + k];
          paddedLapW[targetOffset + k] = lapW[sourceOffset + k];
          paddedGxW[targetOffset + k] = gxW[sourceOffset + k];
          paddedGyW[targetOffset + k] = gyW[sourceOffset + k];
        } else {
          paddedStencil[targetOffset + k] = center;
        }
      }
    }
    const padded = {
      source: model.operators,
      stencil: paddedStencil,
      lapW: paddedLapW,
      gxW: paddedGxW,
      gyW: paddedGyW,
      m: WASM_RBF_STENCIL_STRIDE
    };
    model.__wasmPaddedRbfOperators = padded;
    return padded;
  }

  function rbfTransportBlockParentNside(nside) {
    if (!Number.isInteger(nside) || nside < 2) {
      return 0;
    }
    const edge = Math.min(nside, RBF_TRANSPORT_BLOCK_EDGE);
    return Math.max(1, nside / edge);
  }

  function buildRbfTransportBlocks(model, operators) {
    const topology = model.topology;
    const nside = topology?.nside ?? 0;
    if (!Number.isInteger(nside) || nside < 2 || model.activeCellIds) {
      return null;
    }
    const cached = model.__wasmRbfTransportBlocks;
    if (cached && cached.source === operators && cached.nside === nside && cached.size === model.size) {
      return cached;
    }

    const parentNside = rbfTransportBlockParentNside(nside);
    if (!parentNside || nside % parentNside !== 0) {
      return null;
    }
    const childEdge = nside / parentNside;
    const childCount = childEdge * childEdge;
    const blockCount = 12 * parentNside * parentNside;
    const m = operators.m ?? WASM_RBF_STENCIL_STRIDE;
    const stencil = operators.stencil;
    if (m !== WASM_RBF_STENCIL_STRIDE || !ArrayBuffer.isView(stencil)) {
      return null;
    }
    const blockCellOffsets = new Int32Array(blockCount + 1);
    const blockHaloOffsets = new Int32Array(blockCount + 1);
    const blockCellIds = new Uint32Array(model.size);
    const blockLocalStencil = new Uint16Array(model.size * WASM_RBF_STENCIL_STRIDE);
    const blockHaloLists = new Array(blockCount);
    let cellCursor = 0;
    let haloCursor = 0;
    let maxHaloCount = 0;

    for (let block = 0; block < blockCount; block += 1) {
      const blockStartCellCursor = cellCursor;
      const blockStartId = block * childCount;
      const blockEndId = Math.min(model.size, blockStartId + childCount);
      const localIndexByCell = new Map();
      const localHaloIds = [];
      blockCellOffsets[block] = cellCursor;
      blockHaloOffsets[block] = haloCursor;

      for (let cellId = blockStartId; cellId < blockEndId; cellId += 1) {
        blockCellIds[cellCursor] = cellId;
        const stencilOffset = cellId * WASM_RBF_STENCIL_STRIDE;
        const localStencilOffset = cellCursor * WASM_RBF_STENCIL_STRIDE;
        for (let k = 0; k < WASM_RBF_STENCIL_STRIDE; k += 1) {
          const target = stencil[stencilOffset + k];
          let localIndex = localIndexByCell.get(target);
          if (localIndex === undefined) {
            localIndex = localHaloIds.length;
            localIndexByCell.set(target, localIndex);
            localHaloIds.push(target);
          }
          blockLocalStencil[localStencilOffset + k] = localIndex;
        }
        cellCursor += 1;
      }

      maxHaloCount = Math.max(maxHaloCount, localHaloIds.length);
      blockHaloLists[block] = localHaloIds;
      haloCursor += localHaloIds.length;
      if (cellCursor === blockStartCellCursor) {
        blockHaloOffsets[block] = haloCursor;
      }
    }
    blockCellOffsets[blockCount] = cellCursor;
    blockHaloOffsets[blockCount] = haloCursor;

    const haloStride = (maxHaloCount + 15) & ~15;
    const blockHaloIds = new Uint32Array(blockCount * haloStride);
    for (let block = 0; block < blockCount; block += 1) {
      const localHaloIds = blockHaloLists[block] ?? [];
      const padCellId = localHaloIds[0] ?? 0;
      const base = block * haloStride;
      for (let index = 0; index < haloStride; index += 1) {
        blockHaloIds[base + index] = index < localHaloIds.length ? localHaloIds[index] : padCellId;
      }
    }

    const blocks = {
      source: operators,
      nside,
      size: model.size,
      parentNside,
      childEdge,
      blockCount,
      blockCellOffsets,
      blockCellIds,
      blockHaloOffsets,
      blockHaloIds,
      blockLocalStencil,
      maxHaloCount,
      haloStride
    };
    model.__wasmRbfTransportBlocks = blocks;
    return blocks;
  }

  function getRbfTransportBlockBinding(model) {
    if (globalThis.__HEALPIX_ASTEROID_DISABLE_RBF_BLOCK_HALO__ === true) {
      return null;
    }
    const operators = paddedRbfOperatorsFor(model);
    const blocks = buildRbfTransportBlocks(model, operators);
    if (!blocks || blocks.blockCount <= 0 || blocks.maxHaloCount <= 0) {
      return null;
    }
    const modelBinding = bindings.get(model) ?? {};
    const cached = modelBinding.rbfTransportBlocks;
    if (cached && cached.source === blocks) {
      return cached;
    }
    const scratchStride = blocks.haloStride;
    const binding = {
      source: blocks,
      blockCount: blocks.blockCount,
      maxHaloCount: blocks.maxHaloCount,
      scratchStride,
      blockCellOffsetsOffset: allocateAndCopyIfNeeded(blocks.blockCellOffsets, Int32Array),
      blockCellIdsOffset: allocateAndCopyIfNeeded(blocks.blockCellIds, Uint32Array),
      blockHaloOffsetsOffset: allocateAndCopyIfNeeded(blocks.blockHaloOffsets, Int32Array),
      blockHaloIdsOffset: allocateAndCopyIfNeeded(blocks.blockHaloIds, Uint32Array),
      blockLocalStencilOffset: allocateAndCopyIfNeeded(blocks.blockLocalStencil, Uint16Array),
      scratchOffset: allocBytes(scratchStride * RBF_TRANSPORT_SCRATCH_FIELDS * MAX_SIM_WORKERS * 4)
    };
    modelBinding.rbfTransportBlocks = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  function bindModelState(model, options = {}) {
    if (model.__asteroidSimulationCore === exports) {
      return true;
    }

    const stateSpecs = Object.entries(model.state)
      .filter(([, value]) => ArrayBuffer.isView(value) && supportedViewTypes.has(value.constructor))
      .map(([key, source]) => ({ key, source, ViewType: source.constructor }));
    const wasmOperators = paddedRbfOperatorsFor(model);
    const operatorSpecs = ["stencil", "lapW", "gxW", "gyW"]
      .filter((key) => ArrayBuffer.isView(wasmOperators[key]) && supportedViewTypes.has(wasmOperators[key].constructor))
      .map((key) => ({ key, source: wasmOperators[key], ViewType: wasmOperators[key].constructor }));
    const activeSpec = model.activeCellIds
      ? [{ key: "activeCellIds", source: model.activeCellIds, ViewType: model.activeCellIds.constructor }]
      : [];
    const byteLength = [...operatorSpecs, ...stateSpecs, ...activeSpec].reduce(
      (sum, spec) => sum + align16(spec.source.byteLength),
      0
    );
    if (byteLength <= 0) {
      return true;
    }

    const baseOffset = exports.sim_alloc(byteLength);
    ensureMemory(baseOffset + byteLength + boundModelSpareBytes(model));
    const cursor = { offset: baseOffset };
    const modelBinding = {};
    modelBinding.operatorOffsets = copySpecsToOffsets(operatorSpecs, cursor);
    bindObjectViews(model.state, stateSpecs, cursor, { copy: options.copyState !== false });
    if (activeSpec.length) {
      const spec = activeSpec[0];
      const offset = cursor.offset;
      const view = new spec.ViewType(exports.memory.buffer, offset, spec.source.length);
      view.set(spec.source);
      model.activeCellIds = view;
      modelBinding.activeOffset = offset;
      cursor.offset += align16(spec.source.byteLength);
    }

    model.__asteroidSimulationCore = exports;
    bindings.set(model, modelBinding);
    if (options.primeBindings !== false) {
      getDarcyBinding(model);
      getRichardsBinding(model);
    }
    return true;
  }

  function getDarcyBinding(model) {
    const cached = bindings.get(model)?.darcy;
    if (cached) {
      return cached;
    }

    const modelBinding = bindings.get(model) ?? {};
    const { state } = model;
    const { stencil, lapW, gxW, gyW } = paddedRbfOperatorsFor(model);
    const activeCellIds = model.activeCellIds;
    const operatorOffsets = modelBinding.operatorOffsets ?? {};
    const binding = {
      activeOffset: activeOffsetFor(modelBinding, activeCellIds),
      stencilOffset: operatorOffsets.stencilOffset ?? allocateAndCopyIfNeeded(stencil, Int32Array),
      lapOffset: operatorOffsets.lapWOffset ?? allocateAndCopyIfNeeded(lapW, Float32Array),
      gxOffset: operatorOffsets.gxWOffset ?? allocateAndCopyIfNeeded(gxW, Float32Array),
      gyOffset: operatorOffsets.gyWOffset ?? allocateAndCopyIfNeeded(gyW, Float32Array),
      hOffset: allocateLikeIfNeeded(state.H),
      elevationOffset: allocateLikeIfNeeded(state.elevation),
      soilWaterOffset: allocateLikeIfNeeded(state.soilWater),
      soilHeadOffset: allocateLikeIfNeeded(state.soilHead),
      soilTransmissivityOffset: allocateLikeIfNeeded(state.soilTransmissivity),
      soilResidualOffset: allocateLikeIfNeeded(state.soilResidual),
      soilCapOffset: allocateLikeIfNeeded(state.soilCap),
      groundwaterStorageOffset: allocateLikeIfNeeded(state.groundwaterStorage),
      groundwaterCapOffset: allocateLikeIfNeeded(state.groundwaterCap),
      groundwaterHeadOffset: allocateLikeIfNeeded(state.groundwaterHead),
      groundwaterTOffset: allocateLikeIfNeeded(state.groundwaterT),
      soilMineralNOffset: allocateLikeIfNeeded(state.soilMineralN),
      soilCarbonActiveOffset: allocateLikeIfNeeded(state.soilCarbonActive),
      soilCarbonStableOffset: allocateLikeIfNeeded(state.soilCarbonStable),
      mobileNutrientOffset: allocateLike(new Float32Array(model.size)),
      baobabSeedOffset: allocateLikeIfNeeded(state.baobabSeed),
      roseSeedOffset: allocateLikeIfNeeded(state.roseSeed),
      slopeXOffset: allocateLikeIfNeeded(state.slopeX),
      slopeYOffset: allocateLikeIfNeeded(state.slopeY),
      soilTransportOffset: allocateLikeIfNeeded(state.soilTransport),
      groundwaterTransportOffset: allocateLikeIfNeeded(state.groundwaterTransport),
      hTransportOffset: allocateLikeIfNeeded(state.Htransport),
      soilMineralTransportOffset: allocateLikeIfNeeded(state.soilMineralTransport),
      baobabSeedTransportOffset: allocateLikeIfNeeded(state.baobabSeedTransport),
      roseSeedTransportOffset: allocateLikeIfNeeded(state.roseSeedTransport),
      surfaceUxOffset: allocateLikeIfNeeded(state.surfaceUx),
      surfaceUyOffset: allocateLikeIfNeeded(state.surfaceUy),
      topSoilUxOffset: allocateLikeIfNeeded(state.topSoilUx),
      topSoilUyOffset: allocateLikeIfNeeded(state.topSoilUy),
      groundwaterUxOffset: allocateLikeIfNeeded(state.groundwaterUx),
      groundwaterUyOffset: allocateLikeIfNeeded(state.groundwaterUy),
      fluxXOffset: allocateLikeIfNeeded(state.fluxX),
      fluxYOffset: allocateLikeIfNeeded(state.fluxY)
    };
    modelBinding.darcy = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  function getStableSurfaceWaterBinding(model) {
    const cached = bindings.get(model)?.stableSurfaceWater;
    if (cached) {
      return cached;
    }

    const modelBinding = bindings.get(model) ?? {};
    const { state } = model;
    const { stencil, lapW, gxW, gyW } = paddedRbfOperatorsFor(model);
    const activeCellIds = model.activeCellIds;
    const operatorOffsets = modelBinding.operatorOffsets ?? {};
    const binding = {
      activeOffset: activeOffsetFor(modelBinding, activeCellIds),
      stencilOffset: operatorOffsets.stencilOffset ?? allocateAndCopyIfNeeded(stencil, Int32Array),
      lapOffset: operatorOffsets.lapWOffset ?? allocateAndCopyIfNeeded(lapW, Float32Array),
      gxOffset: operatorOffsets.gxWOffset ?? allocateAndCopyIfNeeded(gxW, Float32Array),
      gyOffset: operatorOffsets.gyWOffset ?? allocateAndCopyIfNeeded(gyW, Float32Array),
      hOffset: allocateLikeIfNeeded(state.H),
      elevationOffset: allocateLikeIfNeeded(state.elevation),
      slopeXOffset: allocateLikeIfNeeded(state.slopeX),
      slopeYOffset: allocateLikeIfNeeded(state.slopeY),
      hnOffset: allocateLikeIfNeeded(state.Hn),
      hTransportOffset: allocateLikeIfNeeded(state.Htransport),
      surfaceUxOffset: allocateLikeIfNeeded(state.surfaceUx),
      surfaceUyOffset: allocateLikeIfNeeded(state.surfaceUy)
    };
    modelBinding.stableSurfaceWater = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  function getRainBinding(model) {
    const cached = bindings.get(model)?.rain;
    if (cached) {
      return cached;
    }

    const modelBinding = bindings.get(model) ?? {};
    const { state, rainMap } = model;
    const tropicalScratch = Array.from({ length: 6 }, () => new Float32Array(12));
    const midScratch = Array.from({ length: 6 }, () => new Float32Array(11));
    const binding = {
      rainXOffset: allocateAndCopyIfNeeded(rainMap.x, Float32Array),
      rainYOffset: allocateAndCopyIfNeeded(rainMap.y, Float32Array),
      rainHeightOffset: allocateAndCopyIfNeeded(rainMap.height, Float32Array),
      rainTropicsOffset: allocateAndCopyIfNeeded(rainMap.tropics, Float32Array),
      rainMidLatitudeOffset: allocateAndCopyIfNeeded(rainMap.midLatitude, Float32Array),
      rainWeakBackgroundOffset: allocateAndCopyIfNeeded(rainMap.weakBackground, Float32Array),
      rainClimatologyOffset: allocateLikeIfNeeded(state.rainClimatology),
      sunlightOffset: allocateLikeIfNeeded(state.sunlight),
      rainOffset: allocateLikeIfNeeded(state.R),
      rainMemoryOffset: allocateLikeIfNeeded(state.rainMemory),
      tropicalScratch,
      tropicalOffsets: tropicalScratch.map((source) => allocateLike(source)),
      midScratch,
      midOffsets: midScratch.map((source) => allocateLike(source))
    };
    modelBinding.rain = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  function getRoseSeedDispersalBinding(model, constants) {
    const cached = bindings.get(model)?.roseSeedDispersal;
    const cohorts = Math.max(1, constants.cohorts | 0);
    if (cached && cached.cohorts === cohorts) {
      return cached;
    }

    const modelBinding = bindings.get(model) ?? {};
    const { state, roseSeedDispersalKernel } = model;
    const productionIds = new Int32Array(model.size);
    const rngState = new Uint32Array(1);
    const activeCellIds = model.activeCellIds;
    const binding = {
      cohorts,
      activeOffset: activeOffsetFor(modelBinding, activeCellIds),
      dispersalOffsetsOffset: allocateAndCopyIfNeeded(roseSeedDispersalKernel.offsets, Int32Array),
      dispersalTargetsOffset: allocateAndCopyIfNeeded(roseSeedDispersalKernel.targets, Int32Array),
      dispersalWeightsOffset: allocateAndCopyIfNeeded(
        roseSeedDispersalKernel.cumulativeWeights ?? roseSeedDispersalKernel.weights,
        Float32Array
      ),
      dispersalWeightSumsOffset: allocateAndCopyIfNeeded(roseSeedDispersalKernel.weightSums, Float32Array),
      productionIds,
      productionIdsOffset: allocateLike(productionIds),
      rngState,
      rngStateOffset: allocateLike(rngState),
      cellHeightOffset: allocateLikeIfNeeded(state.cellHeight),
      climateMeanTempCOffset: allocateLikeIfNeeded(state.climateMeanTempC),
      climateDiurnalRangeCOffset: allocateLikeIfNeeded(state.climateDiurnalRangeC),
      elevationOffset: allocateLikeIfNeeded(state.elevation),
      soilWaterOffset: allocateLikeIfNeeded(state.soilWater),
      soilCapOffset: allocateLikeIfNeeded(state.soilCap),
      groundwaterStorageOffset: allocateLikeIfNeeded(state.groundwaterStorage),
      groundwaterCapOffset: allocateLikeIfNeeded(state.groundwaterCap),
      hOffset: allocateLikeIfNeeded(state.H),
      rOffset: allocateLikeIfNeeded(state.R),
      sunlightOffset: allocateLikeIfNeeded(state.sunlight),
      baobabLeafOffset: allocateLikeIfNeeded(state.baobabLeaf),
      roseLeafOffset: allocateLikeIfNeeded(state.roseLeaf),
      roseFlowerOffset: allocateLikeIfNeeded(state.roseFlower),
      roseRootOffset: allocateLikeIfNeeded(state.roseRoot),
      roseStoreOffset: allocateLikeIfNeeded(state.roseStore),
      gppRoseOffset: allocateLikeIfNeeded(state.gppRose),
      roseFertilityOffset: allocateLikeIfNeeded(state.roseFertility),
      roseSeedProductionOffset: allocateLikeIfNeeded(state.roseSeedProduction),
      roseSeedArrivalOffset: allocateLikeIfNeeded(state.roseSeedArrival)
    };
    modelBinding.roseSeedDispersal = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  function getCanopyOpticsBinding(model) {
    const cached = bindings.get(model)?.canopyOptics;
    if (cached) {
      return cached;
    }

    const modelBinding = bindings.get(model) ?? {};
    const { state } = model;
    const activeCellIds = model.activeCellIds;
    const binding = {
      activeOffset: activeOffsetFor(modelBinding, activeCellIds),
      baobabBlockedOffset: allocateAndCopyIfNeeded(state.baobabBlocked, Uint8Array),
      sunlightOffset: allocateLikeIfNeeded(state.sunlight),
      baobabLeafOffset: allocateLikeIfNeeded(state.baobabLeaf),
      roseLeafOffset: allocateLikeIfNeeded(state.roseLeaf),
      roseFlowerOffset: allocateLikeIfNeeded(state.roseFlower),
      laiBaobabOffset: allocateLikeIfNeeded(state.laiBaobab),
      laiRoseOffset: allocateLikeIfNeeded(state.laiRose),
      coverBaobabOffset: allocateLikeIfNeeded(state.coverBaobab),
      coverRoseOffset: allocateLikeIfNeeded(state.coverRose),
      vegetationCoverOffset: allocateLikeIfNeeded(state.vegetationCover),
      canopyLightBaobabOffset: allocateLikeIfNeeded(state.canopyLightBaobab),
      canopyLightRoseOffset: allocateLikeIfNeeded(state.canopyLightRose),
      lightBaobabOffset: allocateLikeIfNeeded(state.lightBaobab),
      lightRoseOffset: allocateLikeIfNeeded(state.lightRose)
    };
    modelBinding.canopyOptics = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  function getCanopyEnvironmentBinding(model) {
    const cached = bindings.get(model)?.canopyEnvironment;
    if (cached) {
      return cached;
    }

    const modelBinding = bindings.get(model) ?? {};
    const { state } = model;
    const activeCellIds = model.activeCellIds;
    const binding = {
      activeOffset: activeOffsetFor(modelBinding, activeCellIds),
      cellHeightOffset: allocateLikeIfNeeded(state.cellHeight),
      climateMeanTempCOffset: allocateLikeIfNeeded(state.climateMeanTempC),
      climateDiurnalRangeCOffset: allocateLikeIfNeeded(state.climateDiurnalRangeC),
      elevationOffset: allocateLikeIfNeeded(state.elevation),
      hOffset: allocateLikeIfNeeded(state.H),
      rOffset: allocateLikeIfNeeded(state.R),
      w0Offset: allocateLikeIfNeeded(state.W0),
      w1Offset: allocateLikeIfNeeded(state.W1),
      soilCapOffset: allocateLikeIfNeeded(state.soilCap),
      groundwaterCapOffset: allocateLikeIfNeeded(state.groundwaterCap),
      sunlightOffset: allocateLikeIfNeeded(state.sunlight),
      laiBaobabOffset: allocateLikeIfNeeded(state.laiBaobab),
      laiRoseOffset: allocateLikeIfNeeded(state.laiRose),
      vegetationCoverOffset: allocateLikeIfNeeded(state.vegetationCover),
      surfaceTempCOffset: allocateLikeIfNeeded(state.surfaceTempC),
      vpdKpaOffset: allocateLikeIfNeeded(state.vpdKpa),
      vaporSlopeKpaCOffset: allocateLikeIfNeeded(state.vaporSlopeKpaC),
      parOffset: allocateLikeIfNeeded(state.par)
    };
    modelBinding.canopyEnvironment = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  function getPhotosynthesisBinding(model, constants) {
    const cached = bindings.get(model)?.photosynthesis;
    if (cached) {
      return cached;
    }

    const modelBinding = bindings.get(model) ?? {};
    const { state } = model;
    const activeCellIds = model.activeCellIds;
    const binding = {
      activeOffset: activeOffsetFor(modelBinding, activeCellIds),
      baobabVcmaxOffset: allocateAndCopy(constants.baobabVcmax, Float32Array),
      baobabJmaxOffset: allocateAndCopy(constants.baobabJmax, Float32Array),
      baobabRdOffset: allocateAndCopy(constants.baobabRd, Float32Array),
      baobabGammaStarOffset: allocateAndCopy(constants.baobabGammaStar, Float32Array),
      baobabKcOffset: allocateAndCopy(constants.baobabKc, Float32Array),
      baobabKoOffset: allocateAndCopy(constants.baobabKo, Float32Array),
      roseVcmaxOffset: allocateAndCopy(constants.roseVcmax, Float32Array),
      roseJmaxOffset: allocateAndCopy(constants.roseJmax, Float32Array),
      roseRdOffset: allocateAndCopy(constants.roseRd, Float32Array),
      roseGammaStarOffset: allocateAndCopy(constants.roseGammaStar, Float32Array),
      roseKcOffset: allocateAndCopy(constants.roseKc, Float32Array),
      roseKoOffset: allocateAndCopy(constants.roseKo, Float32Array),
      parOffset: allocateLikeIfNeeded(state.par),
      laiBaobabOffset: allocateLikeIfNeeded(state.laiBaobab),
      laiRoseOffset: allocateLikeIfNeeded(state.laiRose),
      surfaceTempCOffset: allocateLikeIfNeeded(state.surfaceTempC),
      photoWaterStressBaobabOffset: allocateLikeIfNeeded(state.photoWaterStressBaobab),
      photoWaterStressRoseOffset: allocateLikeIfNeeded(state.photoWaterStressRose),
      vpdKpaOffset: allocateLikeIfNeeded(state.vpdKpa),
      photoNutrientBaobabOffset: allocateLikeIfNeeded(state.photoNutrientBaobab),
      photoNutrientRoseOffset: allocateLikeIfNeeded(state.photoNutrientRose),
      aparBaobabOffset: allocateLikeIfNeeded(state.aparBaobab),
      aparRoseOffset: allocateLikeIfNeeded(state.aparRose),
      gppBaobabOffset: allocateLikeIfNeeded(state.gppBaobab),
      gppRoseOffset: allocateLikeIfNeeded(state.gppRose),
      stomatalConductanceBaobabMpsOffset: allocateLikeIfNeeded(state.stomatalConductanceBaobabMps),
      stomatalConductanceRoseMpsOffset: allocateLikeIfNeeded(state.stomatalConductanceRoseMps),
      ciBaobabOffset: allocateLikeIfNeeded(state.ciBaobab),
      ciRoseOffset: allocateLikeIfNeeded(state.ciRose)
    };
    modelBinding.photosynthesis = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  function getPhotosynthesisInputBinding(model, constants) {
    const cached = bindings.get(model)?.photosynthesisInputs;
    if (cached) {
      return cached;
    }

    const modelBinding = bindings.get(model) ?? {};
    const { state } = model;
    const activeCellIds = model.activeCellIds;
    const binding = {
      activeOffset: activeOffsetFor(modelBinding, activeCellIds),
      hydraulicPsiOffset: allocateAndCopy(constants.hydraulicPsi, Float32Array),
      substrateOffset: allocateAndCopyIfNeeded(state.substrate, Uint8Array),
      soilWaterOffset: allocateLikeIfNeeded(state.soilWater),
      soilCapOffset: allocateLikeIfNeeded(state.soilCap),
      groundwaterStorageOffset: allocateLikeIfNeeded(state.groundwaterStorage),
      groundwaterCapOffset: allocateLikeIfNeeded(state.groundwaterCap),
      baobabLeafOffset: allocateLikeIfNeeded(state.baobabLeaf),
      baobabStemOffset: allocateLikeIfNeeded(state.baobabStem),
      baobabRootOffset: allocateLikeIfNeeded(state.baobabRoot),
      baobabStoreOffset: allocateLikeIfNeeded(state.baobabStore),
      roseLeafOffset: allocateLikeIfNeeded(state.roseLeaf),
      roseFlowerOffset: allocateLikeIfNeeded(state.roseFlower),
      roseRootOffset: allocateLikeIfNeeded(state.roseRoot),
      hOffset: allocateLikeIfNeeded(state.H),
      roseFertilityOffset: allocateLikeIfNeeded(state.roseFertility),
      soilMineralNOffset: allocateLikeIfNeeded(state.soilMineralN),
      parOffset: allocateLikeIfNeeded(state.par),
      laiBaobabOffset: allocateLikeIfNeeded(state.laiBaobab),
      laiRoseOffset: allocateLikeIfNeeded(state.laiRose),
      vegetationCoverOffset: allocateLikeIfNeeded(state.vegetationCover),
      aparTotalOffset: allocateLikeIfNeeded(state.aparTotal),
      aparBaobabOffset: allocateLikeIfNeeded(state.aparBaobab),
      aparRoseOffset: allocateLikeIfNeeded(state.aparRose),
      photoWaterStressBaobabOffset: allocateLikeIfNeeded(state.photoWaterStressBaobab),
      photoWaterStressRoseOffset: allocateLikeIfNeeded(state.photoWaterStressRose),
      photoNutrientBaobabOffset: allocateLikeIfNeeded(state.photoNutrientBaobab),
      photoNutrientRoseOffset: allocateLikeIfNeeded(state.photoNutrientRose)
    };
    modelBinding.photosynthesisInputs = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  function getPlantWaterFluxBinding(model, constants) {
    const cached = bindings.get(model)?.plantWaterFluxes;
    if (cached) {
      return cached;
    }

    const modelBinding = bindings.get(model) ?? {};
    const { state } = model;
    const activeCellIds = model.activeCellIds;
    const binding = {
      activeOffset: activeOffsetFor(modelBinding, activeCellIds),
      hydraulicPsiOffset: allocateAndCopy(constants.hydraulicPsi, Float32Array),
      baobabVcmaxOffset: allocateAndCopy(constants.baobabVcmax, Float32Array),
      baobabJmaxOffset: allocateAndCopy(constants.baobabJmax, Float32Array),
      baobabRdOffset: allocateAndCopy(constants.baobabRd, Float32Array),
      baobabGammaStarOffset: allocateAndCopy(constants.baobabGammaStar, Float32Array),
      baobabKcOffset: allocateAndCopy(constants.baobabKc, Float32Array),
      baobabKoOffset: allocateAndCopy(constants.baobabKo, Float32Array),
      roseVcmaxOffset: allocateAndCopy(constants.roseVcmax, Float32Array),
      roseJmaxOffset: allocateAndCopy(constants.roseJmax, Float32Array),
      roseRdOffset: allocateAndCopy(constants.roseRd, Float32Array),
      roseGammaStarOffset: allocateAndCopy(constants.roseGammaStar, Float32Array),
      roseKcOffset: allocateAndCopy(constants.roseKc, Float32Array),
      roseKoOffset: allocateAndCopy(constants.roseKo, Float32Array),
      substrateOffset: allocateAndCopyIfNeeded(state.substrate, Uint8Array),
      soilWaterOffset: allocateLikeIfNeeded(state.soilWater),
      soilCapOffset: allocateLikeIfNeeded(state.soilCap),
      soilHydraulicKOffset: allocateLikeIfNeeded(state.soilHydraulicK),
      groundwaterStorageOffset: allocateLikeIfNeeded(state.groundwaterStorage),
      groundwaterCapOffset: allocateLikeIfNeeded(state.groundwaterCap),
      groundwaterTOffset: allocateLikeIfNeeded(state.groundwaterT),
      groundwaterThicknessOffset: allocateLikeIfNeeded(state.groundwaterThickness),
      hOffset: allocateLikeIfNeeded(state.H),
      rOffset: allocateLikeIfNeeded(state.R),
      canopyWaterOffset: allocateLikeIfNeeded(state.canopyWater),
      canopyWaterNextOffset: allocateLikeIfNeeded(state.canopyWaterN),
      canopyEvapMOffset: allocateLikeIfNeeded(state.canopyEvapM),
      baobabLeafOffset: allocateLikeIfNeeded(state.baobabLeaf),
      baobabStemOffset: allocateLikeIfNeeded(state.baobabStem),
      baobabRootOffset: allocateLikeIfNeeded(state.baobabRoot),
      roseLeafOffset: allocateLikeIfNeeded(state.roseLeaf),
      roseFlowerOffset: allocateLikeIfNeeded(state.roseFlower),
      roseRootOffset: allocateLikeIfNeeded(state.roseRoot),
      parOffset: allocateLikeIfNeeded(state.par),
      surfaceTempCOffset: allocateLikeIfNeeded(state.surfaceTempC),
      vpdKpaOffset: allocateLikeIfNeeded(state.vpdKpa),
      vaporSlopeKpaCOffset: allocateLikeIfNeeded(state.vaporSlopeKpaC),
      laiBaobabOffset: allocateLikeIfNeeded(state.laiBaobab),
      laiRoseOffset: allocateLikeIfNeeded(state.laiRose),
      vegetationCoverOffset: allocateLikeIfNeeded(state.vegetationCover),
      lightBaobabOffset: allocateLikeIfNeeded(state.lightBaobab),
      lightRoseOffset: allocateLikeIfNeeded(state.lightRose),
      aparBaobabOffset: allocateLikeIfNeeded(state.aparBaobab),
      aparRoseOffset: allocateLikeIfNeeded(state.aparRose),
      photoWaterStressBaobabOffset: allocateLikeIfNeeded(state.photoWaterStressBaobab),
      photoWaterStressRoseOffset: allocateLikeIfNeeded(state.photoWaterStressRose),
      photoNutrientBaobabOffset: allocateLikeIfNeeded(state.photoNutrientBaobab),
      photoNutrientRoseOffset: allocateLikeIfNeeded(state.photoNutrientRose),
      gppBaobabOffset: allocateLikeIfNeeded(state.gppBaobab),
      gppRoseOffset: allocateLikeIfNeeded(state.gppRose),
      stomatalConductanceBaobabMpsOffset: allocateLikeIfNeeded(state.stomatalConductanceBaobabMps),
      stomatalConductanceRoseMpsOffset: allocateLikeIfNeeded(state.stomatalConductanceRoseMps),
      ciBaobabOffset: allocateLikeIfNeeded(state.ciBaobab),
      ciRoseOffset: allocateLikeIfNeeded(state.ciRose),
      rootStressBaobabOffset: allocateLikeIfNeeded(state.rootStressBaobab),
      rootStressRoseOffset: allocateLikeIfNeeded(state.rootStressRose),
      hydrologyThroughfallOffset: allocateLikeIfNeeded(state.hydrologyThroughfall),
      hydrologyVegFeedbackOffset: allocateLikeIfNeeded(state.hydrologyVegFeedback),
      hydrologySink0Offset: allocateLikeIfNeeded(state.hydrologySink0),
      hydrologySink1Offset: allocateLikeIfNeeded(state.hydrologySink1),
      hydrologySink2Offset: allocateLikeIfNeeded(state.hydrologySink2),
      hydrologyGroundwaterSinkOffset: allocateLikeIfNeeded(state.hydrologyGroundwaterSink),
      hydrologySurfaceEvapDemandMOffset: allocateLikeIfNeeded(state.hydrologySurfaceEvapDemandM)
    };
    modelBinding.plantWaterFluxes = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  function getPlantCarbonSeedBinding(model, constants) {
    const cached = bindings.get(model)?.plantCarbonSeeds;
    if (cached) {
      return cached;
    }

    const modelBinding = bindings.get(model) ?? {};
    const { state } = model;
    const activeCellIds = model.activeCellIds;
    const binding = {
      activeOffset: activeOffsetFor(modelBinding, activeCellIds),
      baobabRespirationQ10Offset: allocateAndCopy(constants.baobabRespirationQ10, Float32Array),
      roseRespirationQ10Offset: allocateAndCopy(constants.roseRespirationQ10, Float32Array),
      substrateOffset: allocateAndCopyIfNeeded(state.substrate, Uint8Array),
      baobabBlockedOffset: allocateAndCopyIfNeeded(state.baobabBlocked, Uint8Array),
      soilWaterOffset: allocateLikeIfNeeded(state.soilWater),
      soilCapOffset: allocateLikeIfNeeded(state.soilCap),
      groundwaterStorageOffset: allocateLikeIfNeeded(state.groundwaterStorage),
      groundwaterCapOffset: allocateLikeIfNeeded(state.groundwaterCap),
      gppBaobabOffset: allocateLikeIfNeeded(state.gppBaobab),
      gppRoseOffset: allocateLikeIfNeeded(state.gppRose),
      rootStressBaobabOffset: allocateLikeIfNeeded(state.rootStressBaobab),
      rootStressRoseOffset: allocateLikeIfNeeded(state.rootStressRose),
      canopyLightBaobabOffset: allocateLikeIfNeeded(state.canopyLightBaobab),
      canopyLightRoseOffset: allocateLikeIfNeeded(state.canopyLightRose),
      lightBaobabOffset: allocateLikeIfNeeded(state.lightBaobab),
      lightRoseOffset: allocateLikeIfNeeded(state.lightRose),
      vegetationCoverOffset: allocateLikeIfNeeded(state.vegetationCover),
      surfaceTempCOffset: allocateLikeIfNeeded(state.surfaceTempC),
      ashStressOffset: allocateLikeIfNeeded(state.ashStress),
      baobabRiskOffset: allocateLikeIfNeeded(state.baobabRisk),
      roseFertilityOffset: allocateLikeIfNeeded(state.roseFertility),
      baobabLeafOffset: allocateLikeIfNeeded(state.baobabLeaf),
      baobabStemOffset: allocateLikeIfNeeded(state.baobabStem),
      baobabRootOffset: allocateLikeIfNeeded(state.baobabRoot),
      baobabStoreOffset: allocateLikeIfNeeded(state.baobabStore),
      baobabSeedOffset: allocateLikeIfNeeded(state.baobabSeed),
      roseLeafOffset: allocateLikeIfNeeded(state.roseLeaf),
      roseFlowerOffset: allocateLikeIfNeeded(state.roseFlower),
      roseRootOffset: allocateLikeIfNeeded(state.roseRoot),
      roseStoreOffset: allocateLikeIfNeeded(state.roseStore),
      roseSeedOffset: allocateLikeIfNeeded(state.roseSeed),
      baobabSeedTransportOffset: allocateLikeIfNeeded(state.baobabSeedTransport),
      roseSeedTransportOffset: allocateLikeIfNeeded(state.roseSeedTransport),
      roseSeedProductionOffset: allocateLikeIfNeeded(state.roseSeedProduction),
      roseSeedArrivalOffset: allocateLikeIfNeeded(state.roseSeedArrival),
      baobabReadinessOffset: allocateLikeIfNeeded(state.baobabGerminationReadiness),
      roseReadinessOffset: allocateLikeIfNeeded(state.roseGerminationReadiness),
      hydrologySink0Offset: allocateLikeIfNeeded(state.hydrologySink0),
      baobabLeafNextOffset: allocateLikeIfNeeded(state.baobabLeafN),
      baobabStemNextOffset: allocateLikeIfNeeded(state.baobabStemN),
      baobabRootNextOffset: allocateLikeIfNeeded(state.baobabRootN),
      baobabStoreNextOffset: allocateLikeIfNeeded(state.baobabStoreN),
      baobabSeedNextOffset: allocateLikeIfNeeded(state.baobabSeedN),
      baobabReadinessNextOffset: allocateLikeIfNeeded(state.baobabGerminationReadinessN),
      roseLeafNextOffset: allocateLikeIfNeeded(state.roseLeafN),
      roseFlowerNextOffset: allocateLikeIfNeeded(state.roseFlowerN),
      roseRootNextOffset: allocateLikeIfNeeded(state.roseRootN),
      roseStoreNextOffset: allocateLikeIfNeeded(state.roseStoreN),
      roseSeedNextOffset: allocateLikeIfNeeded(state.roseSeedN),
      roseReadinessNextOffset: allocateLikeIfNeeded(state.roseGerminationReadinessN),
      mbNextOffset: allocateLikeIfNeeded(state.MBn),
      mrNextOffset: allocateLikeIfNeeded(state.MRn),
      sbNextOffset: allocateLikeIfNeeded(state.SBn),
      soilBioWetnessOffset: allocateLikeIfNeeded(state.soilBioWetness),
      soilBioTempCOffset: allocateLikeIfNeeded(state.soilBioTempC),
      soilBioAshLoadOffset: allocateLikeIfNeeded(state.soilBioAshLoad),
      soilBioTopSatOffset: allocateLikeIfNeeded(state.soilBioTopSat),
      soilBioGroundwaterSatOffset: allocateLikeIfNeeded(state.soilBioGroundwaterSat),
      soilBioLitterFastInputOffset: allocateLikeIfNeeded(state.soilBioLitterFastInput),
      soilBioLitterSlowInputOffset: allocateLikeIfNeeded(state.soilBioLitterSlowInput),
      soilBioPlantNutrientUptakeOffset: allocateLikeIfNeeded(state.soilBioPlantNutrientUptake)
    };
    modelBinding.plantCarbonSeeds = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  function getHydraulicBinding(model, constants) {
    const cached = bindings.get(model)?.hydraulic;
    if (cached) {
      return cached;
    }

    const modelBinding = bindings.get(model) ?? {};
    const { state } = model;
    const activeCellIds = model.activeCellIds;
    const binding = {
      activeOffset: activeOffsetFor(modelBinding, activeCellIds),
      hydraulicPsiOffset: allocateAndCopy(constants.hydraulicPsi, Float32Array),
      hydraulicRelativeKOffset: allocateAndCopy(constants.hydraulicRelativeK, Float32Array),
      groundwaterPow17Offset: allocateAndCopy(constants.groundwaterPow17, Float32Array),
      substrateOffset: allocateAndCopyIfNeeded(state.substrate, Uint8Array),
      elevationOffset: allocateLikeIfNeeded(state.elevation),
      soilWaterOffset: allocateLikeIfNeeded(state.soilWater),
      soilCapOffset: allocateLikeIfNeeded(state.soilCap),
      soilCenterDepthOffset: allocateLikeIfNeeded(state.soilCenterDepth),
      soilThicknessOffset: allocateLikeIfNeeded(state.soilThickness),
      groundwaterStorageOffset: allocateLikeIfNeeded(state.groundwaterStorage),
      groundwaterCapOffset: allocateLikeIfNeeded(state.groundwaterCap),
      groundwaterThicknessOffset: allocateLikeIfNeeded(state.groundwaterThickness),
      groundwaterTopDepthOffset: allocateLikeIfNeeded(state.groundwaterTopDepth),
      w0Offset: allocateLikeIfNeeded(state.W0),
      w1Offset: allocateLikeIfNeeded(state.W1),
      soilHeadOffset: allocateLikeIfNeeded(state.soilHead),
      soilHydraulicKOffset: allocateLikeIfNeeded(state.soilHydraulicK),
      soilTransmissivityOffset: allocateLikeIfNeeded(state.soilTransmissivity),
      groundwaterHeadOffset: allocateLikeIfNeeded(state.groundwaterHead),
      groundwaterTOffset: allocateLikeIfNeeded(state.groundwaterT)
    };
    modelBinding.hydraulic = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  function getRichardsBinding(model) {
    const cached = bindings.get(model)?.richards;
    if (cached) {
      return cached;
    }

    const modelBinding = bindings.get(model) ?? {};
    const { state } = model;
    const activeCellIds = model.activeCellIds;
    const binding = {
      activeOffset: activeOffsetFor(modelBinding, activeCellIds),
      substrateOffset: allocateAndCopyIfNeeded(state.substrate, Uint8Array),
      elevationOffset: allocateLikeIfNeeded(state.elevation),
      hOffset: allocateLikeIfNeeded(state.H),
      hNextOffset: allocateLikeIfNeeded(state.Hn),
      soilWaterOffset: allocateLikeIfNeeded(state.soilWater),
      soilWaterNextOffset: allocateLikeIfNeeded(state.soilWaterN),
      soilHeadOffset: allocateLikeIfNeeded(state.soilHead),
      soilHydraulicKOffset: allocateLikeIfNeeded(state.soilHydraulicK),
      soilCapOffset: allocateLikeIfNeeded(state.soilCap),
      soilThicknessOffset: allocateLikeIfNeeded(state.soilThickness),
      soilResidualOffset: allocateLikeIfNeeded(state.soilResidual),
      groundwaterStorageOffset: allocateLikeIfNeeded(state.groundwaterStorage),
      groundwaterStorageNextOffset: allocateLikeIfNeeded(state.groundwaterStorageN),
      groundwaterCapOffset: allocateLikeIfNeeded(state.groundwaterCap),
      groundwaterHeadOffset: allocateLikeIfNeeded(state.groundwaterHead),
      groundwaterThicknessOffset: allocateLikeIfNeeded(state.groundwaterThickness),
      hTransportOffset: allocateLikeIfNeeded(state.Htransport),
      soilTransportOffset: allocateLikeIfNeeded(state.soilTransport),
      groundwaterTransportOffset: allocateLikeIfNeeded(state.groundwaterTransport),
      hydrologyThroughfallOffset: allocateLikeIfNeeded(state.hydrologyThroughfall),
      hydrologyVegFeedbackOffset: allocateLikeIfNeeded(state.hydrologyVegFeedback),
      hydrologySink0Offset: allocateLikeIfNeeded(state.hydrologySink0),
      hydrologySink1Offset: allocateLikeIfNeeded(state.hydrologySink1),
      hydrologySink2Offset: allocateLikeIfNeeded(state.hydrologySink2),
      hydrologyGroundwaterSinkOffset: allocateLikeIfNeeded(state.hydrologyGroundwaterSink),
      hydrologySurfaceEvapDemandMOffset: allocateLikeIfNeeded(state.hydrologySurfaceEvapDemandM),
      groundwaterRechargeOffset: allocateLikeIfNeeded(state.groundwaterRecharge),
      hydrologyHorizontalMOffset: allocateLikeIfNeeded(state.hydrologyHorizontalM),
      hydrologyInfiltrationMOffset: allocateLikeIfNeeded(state.hydrologyInfiltrationM),
      hydrologyPercolation01MOffset: allocateLikeIfNeeded(state.hydrologyPercolation01M),
      hydrologyPercolation12MOffset: allocateLikeIfNeeded(state.hydrologyPercolation12M),
      hydrologyRechargeMOffset: allocateLikeIfNeeded(state.hydrologyRechargeM),
      hydrologyLeakageMOffset: allocateLikeIfNeeded(state.hydrologyLeakageM),
      hydrologySurfaceEvapMOffset: allocateLikeIfNeeded(state.hydrologySurfaceEvapM)
    };
    modelBinding.richards = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  function getSurfaceNutrientBinding(model) {
    const cached = bindings.get(model)?.surfaceNutrient;
    if (cached) {
      return cached;
    }

    const modelBinding = bindings.get(model) ?? {};
    const { state } = model;
    const { stencil, gxW, gyW } = paddedRbfOperatorsFor(model);
    const activeCellIds = model.activeCellIds;
    const operatorOffsets = modelBinding.operatorOffsets ?? {};
    const binding = {
      activeOffset: activeOffsetFor(modelBinding, activeCellIds),
      stencilOffset: operatorOffsets.stencilOffset ?? allocateAndCopyIfNeeded(stencil, Int32Array),
      gxOffset: operatorOffsets.gxWOffset ?? allocateAndCopyIfNeeded(gxW, Float32Array),
      gyOffset: operatorOffsets.gyWOffset ?? allocateAndCopyIfNeeded(gyW, Float32Array),
      hOffset: allocateLikeIfNeeded(state.H),
      w0Offset: allocateLikeIfNeeded(state.W0),
      w1Offset: allocateLikeIfNeeded(state.W1),
      soilCapOffset: allocateLikeIfNeeded(state.soilCap),
      groundwaterCapOffset: allocateLikeIfNeeded(state.groundwaterCap),
      soilMineralNOffset: allocateLikeIfNeeded(state.soilMineralN),
      soilCarbonActiveOffset: allocateLikeIfNeeded(state.soilCarbonActive),
      soilCarbonStableOffset: allocateLikeIfNeeded(state.soilCarbonStable),
      topSoilUxOffset: allocateLikeIfNeeded(state.topSoilUx),
      topSoilUyOffset: allocateLikeIfNeeded(state.topSoilUy),
      groundwaterUxOffset: allocateLikeIfNeeded(state.groundwaterUx),
      groundwaterUyOffset: allocateLikeIfNeeded(state.groundwaterUy),
      surfaceUxOffset: allocateLikeIfNeeded(state.surfaceUx),
      surfaceUyOffset: allocateLikeIfNeeded(state.surfaceUy),
      fluxXOffset: allocateLikeIfNeeded(state.fluxX),
      fluxYOffset: allocateLikeIfNeeded(state.fluxY),
      hTransportOffset: allocateLikeIfNeeded(state.Htransport),
      soilMineralTransportOffset: allocateLikeIfNeeded(state.soilMineralTransport)
    };
    modelBinding.surfaceNutrient = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  function getSoilBiogeochemistryBinding(model) {
    const cached = bindings.get(model)?.soilBiogeochemistry;
    if (cached) {
      return cached;
    }

    const modelBinding = bindings.get(model) ?? {};
    const { state } = model;
    const activeCellIds = model.activeCellIds;
    const binding = {
      activeOffset: activeOffsetFor(modelBinding, activeCellIds),
      substrateOffset: allocateAndCopyIfNeeded(state.substrate, Uint8Array),
      depthOffset: allocateLikeIfNeeded(state.depth),
      soilMineralNOffset: allocateLikeIfNeeded(state.soilMineralN),
      soilMineralTransportOffset: allocateLikeIfNeeded(state.soilMineralTransport),
      litterCarbonOffset: allocateLikeIfNeeded(state.litterCarbon),
      litterFastCarbonOffset: allocateLikeIfNeeded(state.litterFastCarbon),
      litterSlowCarbonOffset: allocateLikeIfNeeded(state.litterSlowCarbon),
      soilCarbonActiveOffset: allocateLikeIfNeeded(state.soilCarbonActive),
      soilCarbonStableOffset: allocateLikeIfNeeded(state.soilCarbonStable),
      roseFertilityOffset: allocateLikeIfNeeded(state.roseFertility),
      soilBioWetnessOffset: allocateLikeIfNeeded(state.soilBioWetness),
      soilBioTempCOffset: allocateLikeIfNeeded(state.soilBioTempC),
      soilBioAshLoadOffset: allocateLikeIfNeeded(state.soilBioAshLoad),
      soilBioTopSatOffset: allocateLikeIfNeeded(state.soilBioTopSat),
      soilBioGroundwaterSatOffset: allocateLikeIfNeeded(state.soilBioGroundwaterSat),
      soilBioLitterFastInputOffset: allocateLikeIfNeeded(state.soilBioLitterFastInput),
      soilBioLitterSlowInputOffset: allocateLikeIfNeeded(state.soilBioLitterSlowInput),
      soilBioPlantNutrientUptakeOffset: allocateLikeIfNeeded(state.soilBioPlantNutrientUptake),
      litterCarbonNextOffset: allocateLikeIfNeeded(state.litterCarbonN),
      litterFastCarbonNextOffset: allocateLikeIfNeeded(state.litterFastCarbonN),
      litterSlowCarbonNextOffset: allocateLikeIfNeeded(state.litterSlowCarbonN),
      soilCarbonActiveNextOffset: allocateLikeIfNeeded(state.soilCarbonActiveN),
      soilCarbonStableNextOffset: allocateLikeIfNeeded(state.soilCarbonStableN),
      soilMineralNNextOffset: allocateLikeIfNeeded(state.soilMineralNN)
    };
    modelBinding.soilBiogeochemistry = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  function getEcosystemStepBinding(model) {
    const cached = bindings.get(model)?.ecosystemStep;
    if (cached) {
      return cached;
    }
    const modelBinding = bindings.get(model) ?? {};
    const binding = {
      paramsOffset: allocBytes(ECOSYSTEM_STEP_FIELDS.length * 4),
      lastRainOffset: allocBytes(4),
      slowStepPhaseOffset: allocBytes(4)
    };
    modelBinding.ecosystemStep = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  function simulationThreadCount(model, repeatCount) {
    if (
      !(exports.memory.buffer instanceof SharedArrayBuffer) ||
      typeof Worker === "undefined" ||
      typeof SharedArrayBuffer === "undefined" ||
      !globalThis.crossOriginIsolated
    ) {
      return 1;
    }
    const hardware = Math.max(1, Number(globalThis.navigator?.hardwareConcurrency) || 2);
    const activeCount = model.activeCellIds ? model.activeCellIds.length : model.size;
    if (activeCount < 12000) {
      return 1;
    }
    const override = Number(globalThis.__HEALPIX_ASTEROID_WORKERS__);
    if (Number.isFinite(override) && override >= 1) {
      return Math.max(1, Math.min(MAX_SIM_WORKERS, Math.round(override), activeCount));
    }
    return Math.max(1, Math.min(MAX_SIM_WORKERS, hardware, activeCount));
  }

  function getThreadChunkBinding(model, threadCount) {
    const modelBinding = bindings.get(model) ?? {};
    const cached = modelBinding.threadChunks;
    const activeSource = model.activeCellIds ?? null;
    const activeCount = activeSource ? activeSource.length : model.size;
    if (
      cached &&
      cached.threadCount === threadCount &&
      cached.activeCount === activeCount &&
      cached.activeSource === activeSource
    ) {
      return cached;
    }

    const offsets = new Uint32Array(threadCount);
    const counts = new Int32Array(threadCount);
    for (let threadId = 0; threadId < threadCount; threadId += 1) {
      const start = Math.floor((activeCount * threadId) / threadCount);
      const end = Math.floor((activeCount * (threadId + 1)) / threadCount);
      if (activeSource) {
        const chunk = new Int32Array(Math.max(0, end - start));
        chunk.set(activeSource.subarray(start, end));
        offsets[threadId] = chunk.length ? allocateAndCopy(chunk, Int32Array) : 0;
        counts[threadId] = chunk.length;
      } else {
        offsets[threadId] = ((start << 1) | 1) >>> 0;
        counts[threadId] = Math.max(0, end - start);
      }
    }
    const binding = {
      threadCount,
      activeCount,
      activeSource,
      offsets,
      counts,
      stackBaseOffset: allocBytes(threadCount * ECOSYSTEM_WORKER_STACK_BYTES),
      barrierBytes: 16 + 2 * MAX_SIM_WORKERS * Float32Array.BYTES_PER_ELEMENT,
      barrierOffset: allocBytes(16 + 2 * MAX_SIM_WORKERS * Float32Array.BYTES_PER_ELEMENT),
      roseSeedArrivalThreadOffset: allocBytes(model.size * threadCount * Float32Array.BYTES_PER_ELEMENT),
      profileStride: ECOSYSTEM_WORKER_PROFILE_PHASES.length,
      profileOffset: allocBytes(threadCount * ECOSYSTEM_WORKER_PROFILE_PHASES.length * Float32Array.BYTES_PER_ELEMENT)
    };
    modelBinding.threadChunks = binding;
    bindings.set(model, modelBinding);
    return binding;
  }

  let workerRequestId = 0;
  let ecosystemThreadPoolPromise = null;
  let ecosystemThreadPool = null;

  function postSimulationWorker(worker, message) {
    const id = ++workerRequestId;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      };
      const onMessage = (event) => {
        const response = event.data;
        if (response?.id !== id) {
          return;
        }
        cleanup();
        if (response.type === "error") {
          reject(new Error(response.error || "simulation worker failed"));
        } else {
          resolve(response);
        }
      };
      const onError = (error) => {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error?.message || error)));
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({ ...message, id });
    });
  }

  async function getEcosystemThreadPool(threadCount) {
    if (ecosystemThreadPool && ecosystemThreadPool.threadCount === threadCount) {
      return ecosystemThreadPool;
    }
    if (ecosystemThreadPoolPromise && ecosystemThreadPoolPromise.threadCount === threadCount) {
      return ecosystemThreadPoolPromise;
    }

    const wasmUrl = new URL(SIM_WASM_SHARED_URL, globalThis.location?.href ?? import.meta.url).href;
    ecosystemThreadPoolPromise = Promise.all(
      Array.from({ length: threadCount }, async () => {
        const worker = new Worker(SIM_WORKER_URL, { type: "module" });
        await postSimulationWorker(worker, {
          type: "init",
          wasmUrl,
          memory: exports.memory
        });
        return worker;
      })
    ).then((workers) => {
      ecosystemThreadPool = { threadCount, workers };
      ecosystemThreadPoolPromise = null;
      return ecosystemThreadPool;
    });
    ecosystemThreadPoolPromise.threadCount = threadCount;
    return ecosystemThreadPoolPromise;
  }

  async function executeParallelEcosystemStep(model, paramsOffset, repeatCount) {
    const threadCount = simulationThreadCount(model, repeatCount);
    if (threadCount <= 1) {
      exports.sim_step_ecosystem_in_place(paramsOffset, repeatCount);
      return;
    }

    const chunks = getThreadChunkBinding(model, threadCount);
    new Uint32Array(exports.memory.buffer, paramsOffset, ECOSYSTEM_STEP_FIELDS.length)[
      ECOSYSTEM_STEP_FIELD_INDEX.ROSE_SEED_ARRIVAL_THREAD_OFFSET
    ] = globalThis.__HEALPIX_ASTEROID_THREAD_LOCAL_SEED_ARRIVAL__ === true
      ? chunks.roseSeedArrivalThreadOffset >>> 0
      : 0;
    new Uint8Array(exports.memory.buffer, chunks.barrierOffset, chunks.barrierBytes).fill(0);
    const profileEnabled = Boolean(globalThis.__HEALPIX_ASTEROID_PROFILE__?.enabled);
    if (profileEnabled) {
      new Float32Array(exports.memory.buffer, chunks.profileOffset, threadCount * chunks.profileStride).fill(0);
    }
    const pool = await getEcosystemThreadPool(threadCount);
    const workerResponses = await Promise.all(pool.workers.map((worker, threadId) =>
      postSimulationWorker(worker, {
        type: "run",
        paramsOffset,
        threadId,
        threadCount,
        activeOffset: chunks.offsets[threadId],
        activeCount: chunks.counts[threadId],
        stackPointer: (chunks.stackBaseOffset + (threadId + 1) * ECOSYSTEM_WORKER_STACK_BYTES - 16) >>> 0,
        barrierOffset: chunks.barrierOffset,
        repeatCount,
        profileOffset: profileEnabled ? chunks.profileOffset : 0,
        profileStride: profileEnabled ? chunks.profileStride : 0
      })
    ));
    let workerElapsedSum = 0;
    let workerElapsedMax = 0;
    for (const response of workerResponses) {
      const elapsedMs = Number(response?.elapsedMs) || 0;
      workerElapsedSum += elapsedMs;
      workerElapsedMax = Math.max(workerElapsedMax, elapsedMs);
    }
    addProfileValue("ecosystemWorkerElapsedSum", workerElapsedSum);
    addProfileValue("ecosystemWorkerElapsedMaxSum", workerElapsedMax);
    addProfileValue("ecosystemWorkerElapsedMaxPeak", workerElapsedMax, "max");
    if (profileEnabled) {
      const profile = new Float32Array(exports.memory.buffer, chunks.profileOffset, threadCount * chunks.profileStride);
      for (let phase = 0; phase < ECOSYSTEM_WORKER_PROFILE_PHASES.length; phase += 1) {
        let phaseSum = 0;
        let phaseMax = 0;
        for (let threadId = 0; threadId < threadCount; threadId += 1) {
          const value = profile[threadId * chunks.profileStride + phase] || 0;
          phaseSum += value;
          phaseMax = Math.max(phaseMax, value);
        }
        const phaseName = ECOSYSTEM_WORKER_PROFILE_PHASES[phase];
        addProfileValue(`ecosystemPhaseSum:${phaseName}`, phaseSum);
        addProfileValue(`ecosystemPhaseMax:${phaseName}`, phaseMax);
      }
    }
  }

  function runEcosystemStep(model, constants, repeatCount = 1, executor = null) {
    const profileStart = globalThis.__HEALPIX_ASTEROID_PROFILE__?.enabled ? performance.now() : 0;
    model.lastEcosystemStepInPlace = false;
    model.lastEcosystemStepCount = 0;
    const missingEcosystemInputs = [
      ["hydraulicPsi", constants?.hydraulicPsi],
      ["hydraulicRelativeK", constants?.hydraulicRelativeK],
      ["groundwaterPow17", constants?.groundwaterPow17],
      ["baobabVcmax", constants?.baobabVcmax],
      ["baobabJmax", constants?.baobabJmax],
      ["baobabRd", constants?.baobabRd],
      ["baobabGammaStar", constants?.baobabGammaStar],
      ["baobabKc", constants?.baobabKc],
      ["baobabKo", constants?.baobabKo],
      ["roseVcmax", constants?.roseVcmax],
      ["roseJmax", constants?.roseJmax],
      ["roseRd", constants?.roseRd],
      ["roseGammaStar", constants?.roseGammaStar],
      ["roseKc", constants?.roseKc],
      ["roseKo", constants?.roseKo],
      ["baobabRespirationQ10", constants?.baobabRespirationQ10],
      ["roseRespirationQ10", constants?.roseRespirationQ10],
      ["roseSeedDispersalKernel", model.roseSeedDispersalKernel],
      ["rng", model.rng],
      ["rng.state", typeof model.rng?.state === "number"],
      ["rng.setState", typeof model.rng?.setState === "function"]
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missingEcosystemInputs.length > 0) {
      return false;
    }
    const boundModelState = bindModelState(model);
    if (!boundModelState) {
      return false;
    }

    const { state, size } = model;
    const { m } = paddedRbfOperatorsFor(model);
    const modelBinding = bindings.get(model) ?? {};
    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const activeOffset = activeOffsetFor(modelBinding, activeCellIds);
    if (activeCellIds && activeOffset === null) {
      return false;
    }

    const hydraulicBinding = getHydraulicBinding(model, constants);
    const darcyBinding = getDarcyBinding(model);
    const rainBinding = getRainBinding(model);
    const roseBinding = getRoseSeedDispersalBinding(model, constants);
    const plantWaterBinding = getPlantWaterFluxBinding(model, constants);
    const plantCarbonSeedBinding = getPlantCarbonSeedBinding(model, constants);
    const transportBlockBinding = getRbfTransportBlockBinding(model);
    const stepBinding = getEcosystemStepBinding(model);
    const u32 = new Uint32Array(exports.memory.buffer, stepBinding.paramsOffset, ECOSYSTEM_STEP_FIELDS.length);
    const f32 = new Float32Array(exports.memory.buffer, stepBinding.paramsOffset, ECOSYSTEM_STEP_FIELDS.length);
    const set = (name, value) => {
      const index = ECOSYSTEM_STEP_FIELD_INDEX[name];
      if (index === undefined) {
        throw new Error(`unknown ecosystem step field: ${name}`);
      }
      if (ECOSYSTEM_STEP_INTEGER_FIELDS.has(name) || name.endsWith("_OFFSET")) {
        u32[index] = Number(value) >>> 0;
      } else {
        f32[index] = Number(value) || 0;
      }
    };
    const stateOffset = (name) => {
      const source = state[name];
      const offset = viewOffset(source);
      if (offset === null) {
        throw new Error(`state array ${name} is not bound to WASM memory`);
      }
      return offset;
    };

    try {
      set("SIZE", size);
      set("ACTIVE_COUNT", activeCount);
      set("ACTIVE_OFFSET", activeOffset ?? 0);
      set("RBF_M", m);
      set("TRANSPORT_BLOCK_COUNT", transportBlockBinding?.blockCount ?? 0);
      set("TRANSPORT_BLOCK_CELL_OFFSETS_OFFSET", transportBlockBinding?.blockCellOffsetsOffset ?? 0);
      set("TRANSPORT_BLOCK_CELL_IDS_OFFSET", transportBlockBinding?.blockCellIdsOffset ?? 0);
      set("TRANSPORT_BLOCK_HALO_OFFSETS_OFFSET", transportBlockBinding?.blockHaloOffsetsOffset ?? 0);
      set("TRANSPORT_BLOCK_HALO_IDS_OFFSET", transportBlockBinding?.blockHaloIdsOffset ?? 0);
      set("TRANSPORT_BLOCK_LOCAL_STENCIL_OFFSET", transportBlockBinding?.blockLocalStencilOffset ?? 0);
      set("TRANSPORT_BLOCK_MAX_HALO_COUNT", transportBlockBinding?.maxHaloCount ?? 0);
      set("TRANSPORT_BLOCK_SCRATCH_OFFSET", transportBlockBinding?.scratchOffset ?? 0);
      set("TRANSPORT_BLOCK_SCRATCH_STRIDE", transportBlockBinding?.scratchStride ?? 0);
      set("IS_EARTH", model.planetPreset === "earth" ? 1 : 0);
      set("RNG_STATE", model.rng.state >>> 0);
      set("RNG_STATE_OUT_OFFSET", roseBinding.rngStateOffset);
      set("MODEL_DT_DAYS", constants.modelDtDays);
      set("SLOW_STEP_INTERVAL", constants.slowStepInterval ?? 1);
      set("SLOW_STEP_PHASE", constants.slowStepPhase ?? model.slowStepPhase ?? 0);
      set("SLOW_STEP_PHASE_OUT_OFFSET", stepBinding.slowStepPhaseOffset);
      set("RAIN_AVERAGE_WEIGHT", constants.rainAverageWeight);
      set("MEAN_RAIN", 0);
      set("ANNUAL_PRECIP_MM", constants.annualPrecipMm);
      set("DRY_DAYS", constants.dryDays);
      set("LAST_RAIN_OUT_OFFSET", stepBinding.lastRainOffset);
      set("DAY", constants.day);
      set("RAIN_RENDER_SIZE", constants.rainRenderSize);
      set("RAIN_SCALE", constants.rainScale);
      set("RAIN_PATCHINESS", constants.rainPatchiness);
      set("ASTEROID_CLOUD_COUNT", constants.asteroidCloudCount);
      set("EARTH_TROPICAL_SCALE", constants.earthTropicalScale);
      set("EARTH_MID_LATITUDE_SCALE", constants.earthMidLatitudeScale);
      set("EARTH_TROPICAL_COUNT", 0);
      set("EARTH_MID_LATITUDE_COUNT", 0);
      set("CELL_SIZE_M", constants.cellSizeM);
      set("SURFACE_WATER_DIFF_M2_DAY", constants.surfaceWaterDiffM2Day);
      set("SURFACE_SLOPE_VELOCITY_M_DAY", constants.surfaceSlopeVelocityMDay);
      set("SURFACE_SLOPE_MAX_VELOCITY_M_DAY", constants.surfaceSlopeMaxVelocityMDay);
      set("NUTRIENT_DIFF_M2_DAY", constants.nutrientDiffM2Day);
      set("BAOBAB_SEED_DIFFUSION_M2_DAY", constants.baobabSeedDiffusionM2Day);
      set("ROSE_SEED_DIFFUSION_M2_DAY", constants.roseSeedDiffusionM2Day);
      set("SURFACE_FILM_THRESHOLD_M", constants.surfaceFilmThresholdM);
      set("HYDRAULIC_LOOKUP_STEPS", constants.hydraulicLookupSteps);
      set("GROUNDWATER_FLOW_MULTIPLIER", constants.groundwaterFlowMultiplier);
      set("HYDRAULIC_STATE_CURRENT", model.hydraulicStateCurrent ? 1 : 0);
      set("PHOTO_LOOKUP_STEPS", constants.lookupSteps);
      set("PHOTO_TEMP_MIN_C", constants.tempMinC);
      set("PHOTO_TEMP_LOOKUP_SCALE", constants.tempLookupScale);
      set("ROOT_DEPTH", constants.rootDepth);
      set("STORAGE", constants.storage);
      set("EVAPORATION", constants.evaporation);
      set("ATMOSPHERIC_CO2", constants.atmosphericCo2Ppm);
      set("BAOBAB_QUANTUM_YIELD", constants.baobab.quantumYield);
      set("BAOBAB_CURVATURE", constants.baobab.curvature);
      set("BAOBAB_CI_MIN", constants.baobab.ciMin);
      set("BAOBAB_CI_MAX", constants.baobab.ciMax);
      set("BAOBAB_EXTINCTION", constants.baobab.extinction);
      set("BAOBAB_G0_MOL", constants.baobab.g0Mol);
      set("BAOBAB_G1", constants.baobab.g1);
      set("BAOBAB_MAX_CONDUCTANCE_MPS", constants.baobab.maxConductanceMps);
      set("BAOBAB_MULTIPLIER", constants.baobabMultiplier);
      set("ROSE_QUANTUM_YIELD", constants.rose.quantumYield);
      set("ROSE_CURVATURE", constants.rose.curvature);
      set("ROSE_CI_MIN", constants.rose.ciMin);
      set("ROSE_CI_MAX", constants.rose.ciMax);
      set("ROSE_EXTINCTION", constants.rose.extinction);
      set("ROSE_G0_MOL", constants.rose.g0Mol);
      set("ROSE_G1", constants.rose.g1);
      set("ROSE_MAX_CONDUCTANCE_MPS", constants.rose.maxConductanceMps);
      set("ROSE_MULTIPLIER", constants.roseMultiplier);
      set("ASTEROID_MEAN_TEMP_C", constants.asteroidMeanTempC);
      set("ASTEROID_DIURNAL_RANGE_C", constants.asteroidDiurnalRangeC);
      set("ASTEROID_LATITUDE_TEMP_RANGE_C", constants.asteroidLatitudeTempRangeC);
      set("SHADE", constants.shade);
      set("ROSE_COHORTS", constants.cohorts);
      set("ROSE_SEED_ARRIVAL_THREAD_OFFSET", 0);
      set(
        "SUNLIGHT_NORMAL_XYZ_OFFSET",
        constants.sunlightNormals instanceof Float32Array && constants.sunlightNormals.length === size * 3
          ? getSunlightNormalOffset(constants.sunlightNormals)
          : 0
      );
      set("SUNLIGHT_ROSE_CELL", constants.sunlightRoseCell ?? -1);
      set("SUNLIGHT_TURN", constants.sunlightTurn ?? 0);
      set("SUNLIGHT_TURNS_PER_DAY", constants.sunlightTurnsPerDay ?? 1);
      set("SUNLIGHT_MODEL_TIME_OFFSET_DAYS", constants.sunlightModelTimeOffsetDays ?? 0);
      set("SUNLIGHT_MODEL_DURATION_DAYS", constants.sunlightModelDurationDays ?? 0);
      set("SUNLIGHT_SAMPLE_COUNT", constants.sunlightSampleCount ?? 0);

      set("STENCIL_OFFSET", darcyBinding.stencilOffset);
      set("LAP_OFFSET", darcyBinding.lapOffset);
      set("GX_OFFSET", darcyBinding.gxOffset);
      set("GY_OFFSET", darcyBinding.gyOffset);
      set("RAIN_X_OFFSET", rainBinding.rainXOffset);
      set("RAIN_Y_OFFSET", rainBinding.rainYOffset);
      set("RAIN_TROPICS_OFFSET", rainBinding.rainTropicsOffset);
      set("RAIN_MID_LATITUDE_OFFSET", rainBinding.rainMidLatitudeOffset);
      set("RAIN_WEAK_BACKGROUND_OFFSET", rainBinding.rainWeakBackgroundOffset);
      set("RAIN_CLIMATOLOGY_OFFSET", stateOffset("rainClimatology"));
      set("TROPICAL_X_OFFSET", rainBinding.tropicalOffsets[0]);
      set("TROPICAL_Y_OFFSET", rainBinding.tropicalOffsets[1]);
      set("TROPICAL_RADIUS_OFFSET", rainBinding.tropicalOffsets[2]);
      set("TROPICAL_CORE_RADIUS_OFFSET", rainBinding.tropicalOffsets[3]);
      set("TROPICAL_CORE_AMP_OFFSET", rainBinding.tropicalOffsets[4]);
      set("TROPICAL_AMP_OFFSET", rainBinding.tropicalOffsets[5]);
      set("MID_X_OFFSET", rainBinding.midOffsets[0]);
      set("MID_Y_OFFSET", rainBinding.midOffsets[1]);
      set("MID_RADIUS_OFFSET", rainBinding.midOffsets[2]);
      set("MID_COS_PHASE_OFFSET", rainBinding.midOffsets[3]);
      set("MID_SIN_PHASE_OFFSET", rainBinding.midOffsets[4]);
      set("MID_AMP_OFFSET", rainBinding.midOffsets[5]);
      set("HYDRAULIC_PSI_OFFSET", hydraulicBinding.hydraulicPsiOffset);
      set("HYDRAULIC_RELATIVE_K_OFFSET", hydraulicBinding.hydraulicRelativeKOffset);
      set("GROUNDWATER_POW17_OFFSET", hydraulicBinding.groundwaterPow17Offset);
      set("BAOBAB_VCMAX_OFFSET", plantWaterBinding.baobabVcmaxOffset);
      set("BAOBAB_JMAX_OFFSET", plantWaterBinding.baobabJmaxOffset);
      set("BAOBAB_RD_OFFSET", plantWaterBinding.baobabRdOffset);
      set("BAOBAB_GAMMA_STAR_OFFSET", plantWaterBinding.baobabGammaStarOffset);
      set("BAOBAB_KC_OFFSET", plantWaterBinding.baobabKcOffset);
      set("BAOBAB_KO_OFFSET", plantWaterBinding.baobabKoOffset);
      set("ROSE_VCMAX_OFFSET", plantWaterBinding.roseVcmaxOffset);
      set("ROSE_JMAX_OFFSET", plantWaterBinding.roseJmaxOffset);
      set("ROSE_RD_OFFSET", plantWaterBinding.roseRdOffset);
      set("ROSE_GAMMA_STAR_OFFSET", plantWaterBinding.roseGammaStarOffset);
      set("ROSE_KC_OFFSET", plantWaterBinding.roseKcOffset);
      set("ROSE_KO_OFFSET", plantWaterBinding.roseKoOffset);
      set("BAOBAB_RESPIRATION_Q10_OFFSET", plantCarbonSeedBinding.baobabRespirationQ10Offset);
      set("ROSE_RESPIRATION_Q10_OFFSET", plantCarbonSeedBinding.roseRespirationQ10Offset);
      set("DISPERSAL_OFFSETS_OFFSET", roseBinding.dispersalOffsetsOffset);
      set("DISPERSAL_TARGETS_OFFSET", roseBinding.dispersalTargetsOffset);
      set("DISPERSAL_WEIGHTS_OFFSET", roseBinding.dispersalWeightsOffset);
      set("DISPERSAL_WEIGHT_SUMS_OFFSET", roseBinding.dispersalWeightSumsOffset);

      for (const [index, key] of ECOSYSTEM_STEP_STATE_OFFSET_ENTRIES) {
        const source = state[key];
        const offset = viewOffset(source);
        if (offset === null) {
          throw new Error(`state array ${key} is not bound to WASM memory`);
        }
        u32[index] = offset >>> 0;
      }
      set("MOBILE_NUTRIENT_OFFSET", darcyBinding.mobileNutrientOffset);
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.warn("C/WASM ecosystem step failed.", error);
      }
      return false;
    }

    const repeats = Math.max(1, Math.min(32, repeatCount | 0));
    if (profileStart) {
      addProfileTime("ecosystemWasmPrepare", performance.now() - profileStart);
    }
    const finalize = () => {
      const paramsU32 = new Uint32Array(exports.memory.buffer, stepBinding.paramsOffset, ECOSYSTEM_STEP_FIELDS.length);
      const rngOutState = new Uint32Array(exports.memory.buffer, roseBinding.rngStateOffset, 1)[0];
      const updatedState = paramsU32[ECOSYSTEM_STEP_FIELD_INDEX.RNG_STATE] || rngOutState;
      model.rng.setState(updatedState);
      model.lastRainM = new Float32Array(exports.memory.buffer, stepBinding.lastRainOffset, 1)[0];
      model.slowStepPhase = new Uint32Array(exports.memory.buffer, stepBinding.slowStepPhaseOffset, 1)[0];
      model.hydraulicStateCurrent = true;
      model.lastEcosystemStepInPlace = repeats > 1;
      model.lastEcosystemStepCount = repeats;
      return true;
    };
    const runStart = profileStart ? performance.now() : 0;
    const runResult = executor
      ? executor(model, stepBinding.paramsOffset, repeats)
      : repeats > 1
        ? exports.sim_step_ecosystem_in_place(stepBinding.paramsOffset, repeats)
        : exports.sim_step_ecosystem(stepBinding.paramsOffset);
    if (runResult && typeof runResult.then === "function") {
      return runResult.then(() => {
        if (runStart) {
          addProfileTime("ecosystemWasmRun", performance.now() - runStart);
        }
        return finalize();
      }, (error) => {
        if (runStart) {
          addProfileTime("ecosystemWasmRun", performance.now() - runStart);
        }
        if (import.meta.env?.DEV) {
          console.warn("C/WASM ecosystem threaded step failed.", error);
        }
        return false;
      });
    }
    if (runStart) {
      addProfileTime("ecosystemWasmRun", performance.now() - runStart);
    }
    return finalize();
  }

  function runEcosystemStepsInPlace(model, constants, repeatCount) {
    return runEcosystemStep(model, constants, repeatCount, (_model, paramsOffset, repeats) => {
      exports.sim_step_ecosystem_in_place(paramsOffset, repeats);
    });
  }

  function runEcosystemStepsThreaded(model, constants, repeatCount) {
    return runEcosystemStep(model, constants, repeatCount, executeParallelEcosystemStep);
  }

  function getAshAdvanceBinding(ash, ashRate) {
    const cached = ashAdvanceBindings.get(ash);
    if (cached && cached.length === ash.length && cached.rate === ashRate) {
      return cached;
    }
    const binding = {
      length: ash.length,
      rate: ashRate,
      ashOffset: allocateLike(ash),
      ashRateOffset: allocateLike(ashRate)
    };
    ashAdvanceBindings.set(ash, binding);
    return binding;
  }

  function runAdvanceAsh(ash, ashRate) {
    if (!(ash instanceof Float32Array) || !(ashRate instanceof Float32Array) || ash.length !== ashRate.length) {
      return false;
    }
    const binding = getAshAdvanceBinding(ash, ashRate);
    const ashOffset = inputOffset(ash, binding.ashOffset, Float32Array);
    const ashRateOffset = inputOffset(ashRate, binding.ashRateOffset, Float32Array);
    exports.sim_advance_ash(ash.length, ashOffset, ashRateOffset);
    copyOutIfNeeded(ash, ashOffset, Float32Array);
    return true;
  }

  function getAshCleanBinding(ash, count) {
    const cached = ashCleanBindings.get(ash);
    if (cached && cached.length === ash.length && cached.capacity >= count) {
      return cached;
    }
    const capacity = Math.max(8, count);
    const binding = {
      length: ash.length,
      capacity,
      ashOffset: allocateLike(ash),
      targetIdsOffset: allocBytes(capacity * Int32Array.BYTES_PER_ELEMENT),
      efficienciesOffset: allocBytes(capacity * Float32Array.BYTES_PER_ELEMENT),
      affectedIdsOffset: allocBytes(capacity * Int32Array.BYTES_PER_ELEMENT)
    };
    ashCleanBindings.set(ash, binding);
    return binding;
  }

  function runCleanAsh(ash, targetIds, efficiencies, work, threshold) {
    if (
      !(ash instanceof Float32Array) ||
      !(targetIds instanceof Int32Array) ||
      !(efficiencies instanceof Float32Array) ||
      targetIds.length !== efficiencies.length ||
      targetIds.length === 0
    ) {
      return null;
    }
    const binding = getAshCleanBinding(ash, targetIds.length);
    const ashOffset = inputOffset(ash, binding.ashOffset, Float32Array);
    copyTo(binding.targetIdsOffset, targetIds, Int32Array);
    copyTo(binding.efficienciesOffset, efficiencies, Float32Array);
    const affectedCount = exports.sim_clean_ash_cells(
      targetIds.length,
      ashOffset,
      binding.targetIdsOffset,
      binding.efficienciesOffset,
      Number(work) || 0,
      Number(threshold) || 0,
      binding.affectedIdsOffset
    );
    copyOutIfNeeded(ash, ashOffset, Float32Array);
    return Array.from(new Int32Array(exports.memory.buffer, binding.affectedIdsOffset, Math.max(0, affectedCount | 0)));
  }

  function getSunlightBinding(normals, sunlight) {
    const cached = sunlightBindings.get(normals);
    if (cached && cached.normalLength === normals.length && cached.sunlightLength === sunlight.length) {
      return cached;
    }
    const binding = {
      normalLength: normals.length,
      sunlightLength: sunlight.length,
      normalOffset: allocateAndCopy(normals, Float32Array),
      sunlightOffset: allocateLike(sunlight)
    };
    sunlightBindings.set(normals, binding);
    return binding;
  }

  function getSunlightNormalOffset(normals) {
    if (!(normals instanceof Float32Array)) {
      return 0;
    }
    const cached = sunlightNormalBindings.get(normals);
    if (cached && cached.length === normals.length) {
      return cached.offset;
    }
    const binding = {
      length: normals.length,
      offset: allocateAndCopy(normals, Float32Array)
    };
    sunlightNormalBindings.set(normals, binding);
    return binding.offset;
  }

  function runSunlightField(normals, sunlight, options = {}) {
    if (
      !(normals instanceof Float32Array) ||
      !(sunlight instanceof Float32Array) ||
      normals.length !== sunlight.length * 3
    ) {
      return false;
    }
    const binding = getSunlightBinding(normals, sunlight);
    const sunlightOffset = outputOffset(sunlight, binding.sunlightOffset);
    exports.sim_update_sunlight_field(
      sunlight.length,
      binding.normalOffset,
      sunlightOffset,
      options.roseCell | 0,
      Number(options.turn) || 0,
      Number(options.turnsPerDay) || 1,
      Number(options.modelTimeOffsetDays) || 0,
      Number(options.modelDurationDays) || 0,
      options.sampleCount | 0
    );
    copyOutIfNeeded(sunlight, sunlightOffset, Float32Array);
    return true;
  }

  function getWaterActionBinding(model, count) {
    const cached = waterActionBindings.get(model);
    if (cached && cached.capacity >= count) {
      return cached;
    }
    const capacity = Math.max(8, count);
    const binding = {
      capacity,
      targetIdsOffset: allocBytes(capacity * Int32Array.BYTES_PER_ELEMENT),
      targetWeightsOffset: allocBytes(capacity * Float32Array.BYTES_PER_ELEMENT)
    };
    waterActionBindings.set(model, binding);
    return binding;
  }

  function runApplyWater(model, cellIds, weights, amountM, constants) {
    if (
      !(cellIds instanceof Int32Array) ||
      !(weights instanceof Float32Array) ||
      cellIds.length !== weights.length ||
      cellIds.length === 0 ||
      !constants?.hydraulicPsi ||
      !constants.hydraulicRelativeK ||
      !constants.groundwaterPow17
    ) {
      return false;
    }
    if (!bindModelState(model)) {
      return false;
    }
    try {
      const { state, size } = model;
      const binding = getWaterActionBinding(model, cellIds.length);
      const hydraulicBinding = getHydraulicBinding(model, constants);
      copyTo(binding.targetIdsOffset, cellIds, Int32Array);
      copyTo(binding.targetWeightsOffset, weights, Float32Array);
      exports.sim_apply_water_cells(
        size,
        cellIds.length,
        binding.targetIdsOffset,
        binding.targetWeightsOffset,
        Number(amountM) || 0,
        constants.totalDtDays,
        constants.substeps | 0,
        constants.hydraulicLookupSteps,
        constants.groundwaterFlowMultiplier,
        hydraulicBinding.hydraulicPsiOffset,
        hydraulicBinding.hydraulicRelativeKOffset,
        hydraulicBinding.groundwaterPow17Offset,
        requiredStateOffset(state, "substrate"),
        requiredStateOffset(state, "elevation"),
        requiredStateOffset(state, "H"),
        requiredStateOffset(state, "Hn"),
        requiredStateOffset(state, "soilWater"),
        requiredStateOffset(state, "soilWaterN"),
        requiredStateOffset(state, "soilHead"),
        requiredStateOffset(state, "soilHydraulicK"),
        requiredStateOffset(state, "soilTransmissivity"),
        requiredStateOffset(state, "soilCap"),
        requiredStateOffset(state, "soilThickness"),
        requiredStateOffset(state, "soilCenterDepth"),
        requiredStateOffset(state, "soilResidual"),
        requiredStateOffset(state, "groundwaterStorage"),
        requiredStateOffset(state, "groundwaterStorageN"),
        requiredStateOffset(state, "groundwaterCap"),
        requiredStateOffset(state, "groundwaterHead"),
        requiredStateOffset(state, "groundwaterT"),
        requiredStateOffset(state, "groundwaterThickness"),
        requiredStateOffset(state, "groundwaterTopDepth"),
        requiredStateOffset(state, "Htransport"),
        requiredStateOffset(state, "soilTransport"),
        requiredStateOffset(state, "groundwaterTransport"),
        requiredStateOffset(state, "hydrologyThroughfall"),
        requiredStateOffset(state, "hydrologyVegFeedback"),
        requiredStateOffset(state, "hydrologySink0"),
        requiredStateOffset(state, "hydrologySink1"),
        requiredStateOffset(state, "hydrologySink2"),
        requiredStateOffset(state, "hydrologyGroundwaterSink"),
        requiredStateOffset(state, "hydrologySurfaceEvapDemandM"),
        requiredStateOffset(state, "groundwaterRecharge"),
        requiredStateOffset(state, "hydrologyHorizontalM"),
        requiredStateOffset(state, "hydrologyInfiltrationM"),
        requiredStateOffset(state, "hydrologyPercolation01M"),
        requiredStateOffset(state, "hydrologyPercolation12M"),
        requiredStateOffset(state, "hydrologyRechargeM"),
        requiredStateOffset(state, "hydrologyLeakageM"),
        requiredStateOffset(state, "hydrologySurfaceEvapM"),
        requiredStateOffset(state, "W0"),
        requiredStateOffset(state, "W1")
      );
      model.hydraulicStateCurrent = true;
      return true;
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.warn("C/WASM water action failed.", error);
      }
      return false;
    }
  }

  function requiredStateOffset(state, key) {
    const offset = viewOffset(state[key]);
    if (offset === null) {
      throw new Error(`state array ${key} is not bound to WASM memory`);
    }
    return offset;
  }

  function disturbanceStateOffsets(state) {
    return {
      disturbanceCarbonExportC: requiredStateOffset(state, "disturbanceCarbonExportC"),
      carbonDisturbanceC: requiredStateOffset(state, "carbonDisturbanceC"),
      carbonStorageChangeC: requiredStateOffset(state, "carbonStorageChangeC"),
      carbonInputC: requiredStateOffset(state, "carbonInputC"),
      carbonTransportC: requiredStateOffset(state, "carbonTransportC"),
      carbonRespirationC: requiredStateOffset(state, "carbonRespirationC"),
      carbonResidualC: requiredStateOffset(state, "carbonResidualC")
    };
  }

  function runRemoveBaobab(model, cellId, amount) {
    if (!bindModelState(model)) {
      return false;
    }
    try {
      const { state, size } = model;
      const disturbance = disturbanceStateOffsets(state);
      exports.sim_remove_baobab_pool(
        size,
        cellId | 0,
        Number(amount) || 0,
        requiredStateOffset(state, "baobabLeaf"),
        requiredStateOffset(state, "baobabStem"),
        requiredStateOffset(state, "baobabRoot"),
        requiredStateOffset(state, "baobabStore"),
        requiredStateOffset(state, "MB"),
        requiredStateOffset(state, "SB"),
        disturbance.disturbanceCarbonExportC,
        disturbance.carbonDisturbanceC,
        disturbance.carbonStorageChangeC,
        disturbance.carbonInputC,
        disturbance.carbonTransportC,
        disturbance.carbonRespirationC,
        disturbance.carbonResidualC
      );
      return true;
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.warn("C/WASM baobab removal failed.", error);
      }
      return false;
    }
  }

  function runRemoveRose(model, cellId, amount) {
    if (!bindModelState(model)) {
      return false;
    }
    try {
      const { state, size } = model;
      const disturbance = disturbanceStateOffsets(state);
      exports.sim_remove_rose_pool(
        size,
        cellId | 0,
        Number(amount) || 0,
        requiredStateOffset(state, "roseLeaf"),
        requiredStateOffset(state, "roseFlower"),
        requiredStateOffset(state, "roseRoot"),
        requiredStateOffset(state, "roseStore"),
        requiredStateOffset(state, "MR"),
        disturbance.disturbanceCarbonExportC,
        disturbance.carbonDisturbanceC,
        disturbance.carbonStorageChangeC,
        disturbance.carbonInputC,
        disturbance.carbonTransportC,
        disturbance.carbonRespirationC,
        disturbance.carbonResidualC
      );
      return true;
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.warn("C/WASM rose removal failed.", error);
      }
      return false;
    }
  }

  function runCanopyOptics(model, constants) {
    const { state, size } = model;
    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const binding = getCanopyOpticsBinding(model);
    const baobabBlockedOffset = inputOffset(state.baobabBlocked, binding.baobabBlockedOffset, Uint8Array);
    const sunlightOffset = inputOffset(state.sunlight, binding.sunlightOffset, Float32Array);
    const baobabLeafOffset = inputOffset(state.baobabLeaf, binding.baobabLeafOffset, Float32Array);
    const roseLeafOffset = inputOffset(state.roseLeaf, binding.roseLeafOffset, Float32Array);
    const roseFlowerOffset = inputOffset(state.roseFlower, binding.roseFlowerOffset, Float32Array);
    const laiBaobabOffset = outputOffset(state.laiBaobab, binding.laiBaobabOffset);
    const laiRoseOffset = outputOffset(state.laiRose, binding.laiRoseOffset);
    const coverBaobabOffset = outputOffset(state.coverBaobab, binding.coverBaobabOffset);
    const coverRoseOffset = outputOffset(state.coverRose, binding.coverRoseOffset);
    const vegetationCoverOffset = outputOffset(state.vegetationCover, binding.vegetationCoverOffset);
    const canopyLightBaobabOffset = outputOffset(state.canopyLightBaobab, binding.canopyLightBaobabOffset);
    const canopyLightRoseOffset = outputOffset(state.canopyLightRose, binding.canopyLightRoseOffset);
    const lightBaobabOffset = outputOffset(state.lightBaobab, binding.lightBaobabOffset);
    const lightRoseOffset = outputOffset(state.lightRose, binding.lightRoseOffset);

    exports.sim_update_canopy_optics(
      size,
      activeCount,
      binding.activeOffset,
      constants.shade,
      baobabBlockedOffset,
      sunlightOffset,
      baobabLeafOffset,
      roseLeafOffset,
      roseFlowerOffset,
      laiBaobabOffset,
      laiRoseOffset,
      coverBaobabOffset,
      coverRoseOffset,
      vegetationCoverOffset,
      canopyLightBaobabOffset,
      canopyLightRoseOffset,
      lightBaobabOffset,
      lightRoseOffset
    );

    copyOutIfNeeded(state.laiBaobab, laiBaobabOffset, Float32Array);
    copyOutIfNeeded(state.laiRose, laiRoseOffset, Float32Array);
    copyOutIfNeeded(state.coverBaobab, coverBaobabOffset, Float32Array);
    copyOutIfNeeded(state.coverRose, coverRoseOffset, Float32Array);
    copyOutIfNeeded(state.vegetationCover, vegetationCoverOffset, Float32Array);
    copyOutIfNeeded(state.canopyLightBaobab, canopyLightBaobabOffset, Float32Array);
    copyOutIfNeeded(state.canopyLightRose, canopyLightRoseOffset, Float32Array);
    copyOutIfNeeded(state.lightBaobab, lightBaobabOffset, Float32Array);
    copyOutIfNeeded(state.lightRose, lightRoseOffset, Float32Array);
    return true;
  }

  function runCanopyEnvironment(model, constants) {
    const { state, size } = model;
    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const binding = getCanopyEnvironmentBinding(model);
    const cellHeightOffset = inputOffset(state.cellHeight, binding.cellHeightOffset, Float32Array);
    const climateMeanTempCOffset = inputOffset(state.climateMeanTempC, binding.climateMeanTempCOffset, Float32Array);
    const climateDiurnalRangeCOffset = inputOffset(
      state.climateDiurnalRangeC,
      binding.climateDiurnalRangeCOffset,
      Float32Array
    );
    const elevationOffset = inputOffset(state.elevation, binding.elevationOffset, Float32Array);
    const hOffset = inputOffset(state.H, binding.hOffset, Float32Array);
    const rOffset = inputOffset(state.R, binding.rOffset, Float32Array);
    const w0Offset = inputOffset(state.W0, binding.w0Offset, Float32Array);
    const w1Offset = inputOffset(state.W1, binding.w1Offset, Float32Array);
    const soilCapOffset = inputOffset(state.soilCap, binding.soilCapOffset, Float32Array);
    const groundwaterCapOffset = inputOffset(state.groundwaterCap, binding.groundwaterCapOffset, Float32Array);
    const sunlightOffset = inputOffset(state.sunlight, binding.sunlightOffset, Float32Array);
    const laiBaobabOffset = inputOffset(state.laiBaobab, binding.laiBaobabOffset, Float32Array);
    const laiRoseOffset = inputOffset(state.laiRose, binding.laiRoseOffset, Float32Array);
    const vegetationCoverOffset = inputOffset(state.vegetationCover, binding.vegetationCoverOffset, Float32Array);
    const surfaceTempCOffset = outputOffset(state.surfaceTempC, binding.surfaceTempCOffset);
    const vpdKpaOffset = outputOffset(state.vpdKpa, binding.vpdKpaOffset);
    const vaporSlopeKpaCOffset = outputOffset(state.vaporSlopeKpaC, binding.vaporSlopeKpaCOffset);
    const parOffset = outputOffset(state.par, binding.parOffset);

    exports.sim_update_canopy_environment(
      size,
      activeCount,
      binding.activeOffset,
      model.planetPreset === "earth" ? 1 : 0,
      constants.asteroidMeanTempC,
      constants.asteroidDiurnalRangeC,
      constants.asteroidLatitudeTempRangeC,
      cellHeightOffset,
      climateMeanTempCOffset,
      climateDiurnalRangeCOffset,
      elevationOffset,
      hOffset,
      rOffset,
      w0Offset,
      w1Offset,
      soilCapOffset,
      groundwaterCapOffset,
      sunlightOffset,
      laiBaobabOffset,
      laiRoseOffset,
      vegetationCoverOffset,
      surfaceTempCOffset,
      vpdKpaOffset,
      vaporSlopeKpaCOffset,
      parOffset
    );

    copyOutIfNeeded(state.surfaceTempC, surfaceTempCOffset, Float32Array);
    copyOutIfNeeded(state.vpdKpa, vpdKpaOffset, Float32Array);
    copyOutIfNeeded(state.vaporSlopeKpaC, vaporSlopeKpaCOffset, Float32Array);
    copyOutIfNeeded(state.par, parOffset, Float32Array);
    return true;
  }

  function runPreparePhotosynthesisInputs(model, constants) {
    if (!constants.hydraulicPsi || !model.state.photoWaterStressBaobab || !model.state.photoWaterStressRose) {
      return false;
    }
    const { state, size } = model;
    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const binding = getPhotosynthesisInputBinding(model, constants);
    const hydraulicPsiOffset = binding.hydraulicPsiOffset;
    const substrateOffset = inputOffset(state.substrate, binding.substrateOffset, Uint8Array);
    const soilWaterOffset = inputOffset(state.soilWater, binding.soilWaterOffset, Float32Array);
    const soilCapOffset = inputOffset(state.soilCap, binding.soilCapOffset, Float32Array);
    const groundwaterStorageOffset = inputOffset(
      state.groundwaterStorage,
      binding.groundwaterStorageOffset,
      Float32Array
    );
    const groundwaterCapOffset = inputOffset(state.groundwaterCap, binding.groundwaterCapOffset, Float32Array);
    const baobabLeafOffset = inputOffset(state.baobabLeaf, binding.baobabLeafOffset, Float32Array);
    const baobabStemOffset = inputOffset(state.baobabStem, binding.baobabStemOffset, Float32Array);
    const baobabRootOffset = inputOffset(state.baobabRoot, binding.baobabRootOffset, Float32Array);
    const baobabStoreOffset = inputOffset(state.baobabStore, binding.baobabStoreOffset, Float32Array);
    const roseLeafOffset = inputOffset(state.roseLeaf, binding.roseLeafOffset, Float32Array);
    const roseFlowerOffset = inputOffset(state.roseFlower, binding.roseFlowerOffset, Float32Array);
    const roseRootOffset = inputOffset(state.roseRoot, binding.roseRootOffset, Float32Array);
    const hOffset = inputOffset(state.H, binding.hOffset, Float32Array);
    const roseFertilityOffset = inputOffset(state.roseFertility, binding.roseFertilityOffset, Float32Array);
    const soilMineralNOffset = inputOffset(state.soilMineralN, binding.soilMineralNOffset, Float32Array);
    const parOffset = inputOffset(state.par, binding.parOffset, Float32Array);
    const laiBaobabOffset = inputOffset(state.laiBaobab, binding.laiBaobabOffset, Float32Array);
    const laiRoseOffset = inputOffset(state.laiRose, binding.laiRoseOffset, Float32Array);
    const vegetationCoverOffset = inputOffset(state.vegetationCover, binding.vegetationCoverOffset, Float32Array);
    const aparTotalOffset = outputOffset(state.aparTotal, binding.aparTotalOffset);
    const aparBaobabOffset = outputOffset(state.aparBaobab, binding.aparBaobabOffset);
    const aparRoseOffset = outputOffset(state.aparRose, binding.aparRoseOffset);
    const photoWaterStressBaobabOffset = outputOffset(
      state.photoWaterStressBaobab,
      binding.photoWaterStressBaobabOffset
    );
    const photoWaterStressRoseOffset = outputOffset(state.photoWaterStressRose, binding.photoWaterStressRoseOffset);
    const photoNutrientBaobabOffset = outputOffset(state.photoNutrientBaobab, binding.photoNutrientBaobabOffset);
    const photoNutrientRoseOffset = outputOffset(state.photoNutrientRose, binding.photoNutrientRoseOffset);

    exports.sim_prepare_photosynthesis_inputs(
      size,
      activeCount,
      binding.activeOffset,
      constants.lookupSteps,
      constants.rootDepth,
      constants.storage,
      hydraulicPsiOffset,
      substrateOffset,
      soilWaterOffset,
      soilCapOffset,
      groundwaterStorageOffset,
      groundwaterCapOffset,
      baobabLeafOffset,
      baobabStemOffset,
      baobabRootOffset,
      baobabStoreOffset,
      roseLeafOffset,
      roseFlowerOffset,
      roseRootOffset,
      hOffset,
      roseFertilityOffset,
      soilMineralNOffset,
      parOffset,
      laiBaobabOffset,
      laiRoseOffset,
      vegetationCoverOffset,
      aparTotalOffset,
      aparBaobabOffset,
      aparRoseOffset,
      photoWaterStressBaobabOffset,
      photoWaterStressRoseOffset,
      photoNutrientBaobabOffset,
      photoNutrientRoseOffset
    );

    copyOutIfNeeded(state.aparTotal, aparTotalOffset, Float32Array);
    copyOutIfNeeded(state.aparBaobab, aparBaobabOffset, Float32Array);
    copyOutIfNeeded(state.aparRose, aparRoseOffset, Float32Array);
    copyOutIfNeeded(state.photoWaterStressBaobab, photoWaterStressBaobabOffset, Float32Array);
    copyOutIfNeeded(state.photoWaterStressRose, photoWaterStressRoseOffset, Float32Array);
    copyOutIfNeeded(state.photoNutrientBaobab, photoNutrientBaobabOffset, Float32Array);
    copyOutIfNeeded(state.photoNutrientRose, photoNutrientRoseOffset, Float32Array);
    return true;
  }

  function runCanopyEnvironmentPhotosynthesis(model, constants) {
    if (
      !constants.hydraulicPsi ||
      !constants.baobabVcmax ||
      !constants.baobabJmax ||
      !constants.baobabRd ||
      !constants.baobabGammaStar ||
      !constants.baobabKc ||
      !constants.baobabKo ||
      !constants.roseVcmax ||
      !constants.roseJmax ||
      !constants.roseRd ||
      !constants.roseGammaStar ||
      !constants.roseKc ||
      !constants.roseKo ||
      !model.state.photoWaterStressBaobab ||
      !model.state.photoWaterStressRose ||
      !model.state.photoNutrientBaobab ||
      !model.state.photoNutrientRose
    ) {
      return false;
    }
    const { state, size } = model;
    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const canopyBinding = getCanopyOpticsBinding(model);
    const environmentBinding = getCanopyEnvironmentBinding(model);
    const inputBinding = getPhotosynthesisInputBinding(model, constants);
    const photoBinding = getPhotosynthesisBinding(model, constants);
    const plantCarbonSeedBinding = getPlantCarbonSeedBinding(model, constants);

    const laiBaobabOffset = outputOffset(state.laiBaobab, canopyBinding.laiBaobabOffset);
    const laiRoseOffset = outputOffset(state.laiRose, canopyBinding.laiRoseOffset);
    const coverBaobabOffset = outputOffset(state.coverBaobab, canopyBinding.coverBaobabOffset);
    const coverRoseOffset = outputOffset(state.coverRose, canopyBinding.coverRoseOffset);
    const vegetationCoverOffset = outputOffset(state.vegetationCover, canopyBinding.vegetationCoverOffset);
    const canopyLightBaobabOffset = outputOffset(
      state.canopyLightBaobab,
      canopyBinding.canopyLightBaobabOffset
    );
    const canopyLightRoseOffset = outputOffset(state.canopyLightRose, canopyBinding.canopyLightRoseOffset);
    const lightBaobabOffset = outputOffset(state.lightBaobab, canopyBinding.lightBaobabOffset);
    const lightRoseOffset = outputOffset(state.lightRose, canopyBinding.lightRoseOffset);
    const surfaceTempCOffset = outputOffset(state.surfaceTempC, environmentBinding.surfaceTempCOffset);
    const vpdKpaOffset = outputOffset(state.vpdKpa, environmentBinding.vpdKpaOffset);
    const vaporSlopeKpaCOffset = outputOffset(state.vaporSlopeKpaC, environmentBinding.vaporSlopeKpaCOffset);
    const parOffset = outputOffset(state.par, environmentBinding.parOffset);
    const aparTotalOffset = outputOffset(state.aparTotal, inputBinding.aparTotalOffset);
    const aparBaobabOffset = outputOffset(state.aparBaobab, inputBinding.aparBaobabOffset);
    const aparRoseOffset = outputOffset(state.aparRose, inputBinding.aparRoseOffset);
    const photoWaterStressBaobabOffset = outputOffset(
      state.photoWaterStressBaobab,
      inputBinding.photoWaterStressBaobabOffset
    );
    const photoWaterStressRoseOffset = outputOffset(
      state.photoWaterStressRose,
      inputBinding.photoWaterStressRoseOffset
    );
    const photoNutrientBaobabOffset = outputOffset(
      state.photoNutrientBaobab,
      inputBinding.photoNutrientBaobabOffset
    );
    const photoNutrientRoseOffset = outputOffset(state.photoNutrientRose, inputBinding.photoNutrientRoseOffset);
    const gppBaobabOffset = outputOffset(state.gppBaobab, photoBinding.gppBaobabOffset);
    const gppRoseOffset = outputOffset(state.gppRose, photoBinding.gppRoseOffset);
    const stomatalConductanceBaobabMpsOffset = outputOffset(
      state.stomatalConductanceBaobabMps,
      photoBinding.stomatalConductanceBaobabMpsOffset
    );
    const stomatalConductanceRoseMpsOffset = outputOffset(
      state.stomatalConductanceRoseMps,
      photoBinding.stomatalConductanceRoseMpsOffset
    );
    const ciBaobabOffset = outputOffset(state.ciBaobab, photoBinding.ciBaobabOffset);
    const ciRoseOffset = outputOffset(state.ciRose, photoBinding.ciRoseOffset);

    exports.sim_update_canopy_environment_photosynthesis(
      size,
      activeCount,
      canopyBinding.activeOffset,
      model.planetPreset === "earth" ? 1 : 0,
      constants.asteroidMeanTempC,
      constants.asteroidDiurnalRangeC,
      constants.asteroidLatitudeTempRangeC,
      constants.shade,
      constants.hydraulicLookupSteps,
      constants.lookupSteps,
      constants.tempMinC,
      constants.tempLookupScale,
      constants.rootDepth,
      constants.storage,
      constants.atmosphericCo2Ppm,
      constants.baobab.quantumYield,
      constants.baobab.curvature,
      constants.baobab.ciMin,
      constants.baobab.ciMax,
      constants.baobab.extinction,
      constants.baobab.g0Mol,
      constants.baobab.g1,
      constants.baobab.maxConductanceMps,
      constants.baobabMultiplier,
      constants.rose.quantumYield,
      constants.rose.curvature,
      constants.rose.ciMin,
      constants.rose.ciMax,
      constants.rose.extinction,
      constants.rose.g0Mol,
      constants.rose.g1,
      constants.rose.maxConductanceMps,
      constants.roseMultiplier,
      inputBinding.hydraulicPsiOffset,
      photoBinding.baobabVcmaxOffset,
      photoBinding.baobabJmaxOffset,
      photoBinding.baobabRdOffset,
      photoBinding.baobabGammaStarOffset,
      photoBinding.baobabKcOffset,
      photoBinding.baobabKoOffset,
      photoBinding.roseVcmaxOffset,
      photoBinding.roseJmaxOffset,
      photoBinding.roseRdOffset,
      photoBinding.roseGammaStarOffset,
      photoBinding.roseKcOffset,
      photoBinding.roseKoOffset,
      inputOffset(state.cellHeight, environmentBinding.cellHeightOffset, Float32Array),
      inputOffset(state.climateMeanTempC, environmentBinding.climateMeanTempCOffset, Float32Array),
      inputOffset(state.climateDiurnalRangeC, environmentBinding.climateDiurnalRangeCOffset, Float32Array),
      inputOffset(state.elevation, environmentBinding.elevationOffset, Float32Array),
      inputOffset(state.baobabBlocked, canopyBinding.baobabBlockedOffset, Uint8Array),
      inputOffset(state.substrate, inputBinding.substrateOffset, Uint8Array),
      inputOffset(state.soilWater, inputBinding.soilWaterOffset, Float32Array),
      inputOffset(state.soilCap, inputBinding.soilCapOffset, Float32Array),
      inputOffset(state.groundwaterStorage, inputBinding.groundwaterStorageOffset, Float32Array),
      inputOffset(state.groundwaterCap, inputBinding.groundwaterCapOffset, Float32Array),
      inputOffset(state.H, inputBinding.hOffset, Float32Array),
      inputOffset(state.R, environmentBinding.rOffset, Float32Array),
      inputOffset(state.W0, environmentBinding.w0Offset, Float32Array),
      inputOffset(state.W1, environmentBinding.w1Offset, Float32Array),
      inputOffset(state.sunlight, canopyBinding.sunlightOffset, Float32Array),
      inputOffset(state.baobabLeaf, inputBinding.baobabLeafOffset, Float32Array),
      inputOffset(state.baobabStem, inputBinding.baobabStemOffset, Float32Array),
      inputOffset(state.baobabRoot, inputBinding.baobabRootOffset, Float32Array),
      inputOffset(state.baobabStore, inputBinding.baobabStoreOffset, Float32Array),
      inputOffset(state.roseLeaf, inputBinding.roseLeafOffset, Float32Array),
      inputOffset(state.roseFlower, inputBinding.roseFlowerOffset, Float32Array),
      inputOffset(state.roseRoot, inputBinding.roseRootOffset, Float32Array),
      inputOffset(state.roseStore, plantCarbonSeedBinding.roseStoreOffset, Float32Array),
      inputOffset(state.baobabSeed, plantCarbonSeedBinding.baobabSeedOffset, Float32Array),
      inputOffset(state.roseSeed, plantCarbonSeedBinding.roseSeedOffset, Float32Array),
      inputOffset(state.baobabSeedTransport, plantCarbonSeedBinding.baobabSeedTransportOffset, Float32Array),
      inputOffset(state.roseSeedTransport, plantCarbonSeedBinding.roseSeedTransportOffset, Float32Array),
      inputOffset(state.roseSeedArrival, plantCarbonSeedBinding.roseSeedArrivalOffset, Float32Array),
      inputOffset(state.roseFertility, inputBinding.roseFertilityOffset, Float32Array),
      inputOffset(state.soilMineralN, inputBinding.soilMineralNOffset, Float32Array),
      laiBaobabOffset,
      laiRoseOffset,
      coverBaobabOffset,
      coverRoseOffset,
      vegetationCoverOffset,
      canopyLightBaobabOffset,
      canopyLightRoseOffset,
      lightBaobabOffset,
      lightRoseOffset,
      surfaceTempCOffset,
      vpdKpaOffset,
      vaporSlopeKpaCOffset,
      parOffset,
      aparTotalOffset,
      aparBaobabOffset,
      aparRoseOffset,
      photoWaterStressBaobabOffset,
      photoWaterStressRoseOffset,
      photoNutrientBaobabOffset,
      photoNutrientRoseOffset,
      gppBaobabOffset,
      gppRoseOffset,
      stomatalConductanceBaobabMpsOffset,
      stomatalConductanceRoseMpsOffset,
      ciBaobabOffset,
      ciRoseOffset
    );

    copyOutIfNeeded(state.laiBaobab, laiBaobabOffset, Float32Array);
    copyOutIfNeeded(state.laiRose, laiRoseOffset, Float32Array);
    copyOutIfNeeded(state.coverBaobab, coverBaobabOffset, Float32Array);
    copyOutIfNeeded(state.coverRose, coverRoseOffset, Float32Array);
    copyOutIfNeeded(state.vegetationCover, vegetationCoverOffset, Float32Array);
    copyOutIfNeeded(state.canopyLightBaobab, canopyLightBaobabOffset, Float32Array);
    copyOutIfNeeded(state.canopyLightRose, canopyLightRoseOffset, Float32Array);
    copyOutIfNeeded(state.lightBaobab, lightBaobabOffset, Float32Array);
    copyOutIfNeeded(state.lightRose, lightRoseOffset, Float32Array);
    copyOutIfNeeded(state.surfaceTempC, surfaceTempCOffset, Float32Array);
    copyOutIfNeeded(state.vpdKpa, vpdKpaOffset, Float32Array);
    copyOutIfNeeded(state.vaporSlopeKpaC, vaporSlopeKpaCOffset, Float32Array);
    copyOutIfNeeded(state.par, parOffset, Float32Array);
    copyOutIfNeeded(state.aparTotal, aparTotalOffset, Float32Array);
    copyOutIfNeeded(state.aparBaobab, aparBaobabOffset, Float32Array);
    copyOutIfNeeded(state.aparRose, aparRoseOffset, Float32Array);
    copyOutIfNeeded(state.photoWaterStressBaobab, photoWaterStressBaobabOffset, Float32Array);
    copyOutIfNeeded(state.photoWaterStressRose, photoWaterStressRoseOffset, Float32Array);
    copyOutIfNeeded(state.photoNutrientBaobab, photoNutrientBaobabOffset, Float32Array);
    copyOutIfNeeded(state.photoNutrientRose, photoNutrientRoseOffset, Float32Array);
    copyOutIfNeeded(state.gppBaobab, gppBaobabOffset, Float32Array);
    copyOutIfNeeded(state.gppRose, gppRoseOffset, Float32Array);
    copyOutIfNeeded(state.stomatalConductanceBaobabMps, stomatalConductanceBaobabMpsOffset, Float32Array);
    copyOutIfNeeded(state.stomatalConductanceRoseMps, stomatalConductanceRoseMpsOffset, Float32Array);
    copyOutIfNeeded(state.ciBaobab, ciBaobabOffset, Float32Array);
    copyOutIfNeeded(state.ciRose, ciRoseOffset, Float32Array);
    return true;
  }

  function runPrepareAndPhotosynthesis(model, constants) {
    if (
      !constants.hydraulicPsi ||
      !constants.baobabVcmax ||
      !constants.baobabJmax ||
      !constants.baobabRd ||
      !constants.baobabGammaStar ||
      !constants.baobabKc ||
      !constants.baobabKo ||
      !constants.roseVcmax ||
      !constants.roseJmax ||
      !constants.roseRd ||
      !constants.roseGammaStar ||
      !constants.roseKc ||
      !constants.roseKo ||
      !model.state.photoWaterStressBaobab ||
      !model.state.photoWaterStressRose ||
      !model.state.photoNutrientBaobab ||
      !model.state.photoNutrientRose
    ) {
      return false;
    }
    const { state, size } = model;
    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const inputBinding = getPhotosynthesisInputBinding(model, constants);
    const photoBinding = getPhotosynthesisBinding(model, constants);

    const substrateOffset = inputOffset(state.substrate, inputBinding.substrateOffset, Uint8Array);
    const soilWaterOffset = inputOffset(state.soilWater, inputBinding.soilWaterOffset, Float32Array);
    const soilCapOffset = inputOffset(state.soilCap, inputBinding.soilCapOffset, Float32Array);
    const groundwaterStorageOffset = inputOffset(
      state.groundwaterStorage,
      inputBinding.groundwaterStorageOffset,
      Float32Array
    );
    const groundwaterCapOffset = inputOffset(state.groundwaterCap, inputBinding.groundwaterCapOffset, Float32Array);
    const baobabLeafOffset = inputOffset(state.baobabLeaf, inputBinding.baobabLeafOffset, Float32Array);
    const baobabStemOffset = inputOffset(state.baobabStem, inputBinding.baobabStemOffset, Float32Array);
    const baobabRootOffset = inputOffset(state.baobabRoot, inputBinding.baobabRootOffset, Float32Array);
    const baobabStoreOffset = inputOffset(state.baobabStore, inputBinding.baobabStoreOffset, Float32Array);
    const roseLeafOffset = inputOffset(state.roseLeaf, inputBinding.roseLeafOffset, Float32Array);
    const roseFlowerOffset = inputOffset(state.roseFlower, inputBinding.roseFlowerOffset, Float32Array);
    const roseRootOffset = inputOffset(state.roseRoot, inputBinding.roseRootOffset, Float32Array);
    const hOffset = inputOffset(state.H, inputBinding.hOffset, Float32Array);
    const roseFertilityOffset = inputOffset(state.roseFertility, inputBinding.roseFertilityOffset, Float32Array);
    const soilMineralNOffset = inputOffset(state.soilMineralN, inputBinding.soilMineralNOffset, Float32Array);
    const parOffset = inputOffset(state.par, inputBinding.parOffset, Float32Array);
    const laiBaobabOffset = inputOffset(state.laiBaobab, inputBinding.laiBaobabOffset, Float32Array);
    const laiRoseOffset = inputOffset(state.laiRose, inputBinding.laiRoseOffset, Float32Array);
    const vegetationCoverOffset = inputOffset(state.vegetationCover, inputBinding.vegetationCoverOffset, Float32Array);
    const surfaceTempCOffset = inputOffset(state.surfaceTempC, photoBinding.surfaceTempCOffset, Float32Array);
    const vpdKpaOffset = inputOffset(state.vpdKpa, photoBinding.vpdKpaOffset, Float32Array);
    const aparTotalOffset = outputOffset(state.aparTotal, inputBinding.aparTotalOffset);
    const aparBaobabOffset = outputOffset(state.aparBaobab, inputBinding.aparBaobabOffset);
    const aparRoseOffset = outputOffset(state.aparRose, inputBinding.aparRoseOffset);
    const photoWaterStressBaobabOffset = outputOffset(
      state.photoWaterStressBaobab,
      inputBinding.photoWaterStressBaobabOffset
    );
    const photoWaterStressRoseOffset = outputOffset(
      state.photoWaterStressRose,
      inputBinding.photoWaterStressRoseOffset
    );
    const photoNutrientBaobabOffset = outputOffset(
      state.photoNutrientBaobab,
      inputBinding.photoNutrientBaobabOffset
    );
    const photoNutrientRoseOffset = outputOffset(state.photoNutrientRose, inputBinding.photoNutrientRoseOffset);
    const gppBaobabOffset = outputOffset(state.gppBaobab, photoBinding.gppBaobabOffset);
    const gppRoseOffset = outputOffset(state.gppRose, photoBinding.gppRoseOffset);
    const stomatalConductanceBaobabMpsOffset = outputOffset(
      state.stomatalConductanceBaobabMps,
      photoBinding.stomatalConductanceBaobabMpsOffset
    );
    const stomatalConductanceRoseMpsOffset = outputOffset(
      state.stomatalConductanceRoseMps,
      photoBinding.stomatalConductanceRoseMpsOffset
    );
    const ciBaobabOffset = outputOffset(state.ciBaobab, photoBinding.ciBaobabOffset);
    const ciRoseOffset = outputOffset(state.ciRose, photoBinding.ciRoseOffset);

    exports.sim_prepare_and_update_photosynthesis(
      size,
      activeCount,
      inputBinding.activeOffset,
      constants.hydraulicLookupSteps,
      constants.lookupSteps,
      constants.tempMinC,
      constants.tempLookupScale,
      constants.rootDepth,
      constants.storage,
      constants.atmosphericCo2Ppm,
      constants.baobab.quantumYield,
      constants.baobab.curvature,
      constants.baobab.ciMin,
      constants.baobab.ciMax,
      constants.baobab.extinction,
      constants.baobab.g0Mol,
      constants.baobab.g1,
      constants.baobab.maxConductanceMps,
      constants.baobabMultiplier,
      constants.rose.quantumYield,
      constants.rose.curvature,
      constants.rose.ciMin,
      constants.rose.ciMax,
      constants.rose.extinction,
      constants.rose.g0Mol,
      constants.rose.g1,
      constants.rose.maxConductanceMps,
      constants.roseMultiplier,
      inputBinding.hydraulicPsiOffset,
      photoBinding.baobabVcmaxOffset,
      photoBinding.baobabJmaxOffset,
      photoBinding.baobabRdOffset,
      photoBinding.baobabGammaStarOffset,
      photoBinding.baobabKcOffset,
      photoBinding.baobabKoOffset,
      photoBinding.roseVcmaxOffset,
      photoBinding.roseJmaxOffset,
      photoBinding.roseRdOffset,
      photoBinding.roseGammaStarOffset,
      photoBinding.roseKcOffset,
      photoBinding.roseKoOffset,
      substrateOffset,
      soilWaterOffset,
      soilCapOffset,
      groundwaterStorageOffset,
      groundwaterCapOffset,
      baobabLeafOffset,
      baobabStemOffset,
      baobabRootOffset,
      baobabStoreOffset,
      roseLeafOffset,
      roseFlowerOffset,
      roseRootOffset,
      hOffset,
      roseFertilityOffset,
      soilMineralNOffset,
      parOffset,
      laiBaobabOffset,
      laiRoseOffset,
      vegetationCoverOffset,
      surfaceTempCOffset,
      vpdKpaOffset,
      aparTotalOffset,
      aparBaobabOffset,
      aparRoseOffset,
      photoWaterStressBaobabOffset,
      photoWaterStressRoseOffset,
      photoNutrientBaobabOffset,
      photoNutrientRoseOffset,
      gppBaobabOffset,
      gppRoseOffset,
      stomatalConductanceBaobabMpsOffset,
      stomatalConductanceRoseMpsOffset,
      ciBaobabOffset,
      ciRoseOffset
    );

    copyOutIfNeeded(state.aparTotal, aparTotalOffset, Float32Array);
    copyOutIfNeeded(state.aparBaobab, aparBaobabOffset, Float32Array);
    copyOutIfNeeded(state.aparRose, aparRoseOffset, Float32Array);
    copyOutIfNeeded(state.photoWaterStressBaobab, photoWaterStressBaobabOffset, Float32Array);
    copyOutIfNeeded(state.photoWaterStressRose, photoWaterStressRoseOffset, Float32Array);
    copyOutIfNeeded(state.photoNutrientBaobab, photoNutrientBaobabOffset, Float32Array);
    copyOutIfNeeded(state.photoNutrientRose, photoNutrientRoseOffset, Float32Array);
    copyOutIfNeeded(state.gppBaobab, gppBaobabOffset, Float32Array);
    copyOutIfNeeded(state.gppRose, gppRoseOffset, Float32Array);
    copyOutIfNeeded(state.stomatalConductanceBaobabMps, stomatalConductanceBaobabMpsOffset, Float32Array);
    copyOutIfNeeded(state.stomatalConductanceRoseMps, stomatalConductanceRoseMpsOffset, Float32Array);
    copyOutIfNeeded(state.ciBaobab, ciBaobabOffset, Float32Array);
    copyOutIfNeeded(state.ciRose, ciRoseOffset, Float32Array);
    return true;
  }

  function runPlantWaterFluxes(model, constants) {
    if (
      !constants.hydraulicPsi ||
      !constants.baobabVcmax ||
      !constants.baobabJmax ||
      !constants.baobabRd ||
      !constants.baobabGammaStar ||
      !constants.baobabKc ||
      !constants.baobabKo ||
      !constants.roseVcmax ||
      !constants.roseJmax ||
      !constants.roseRd ||
      !constants.roseGammaStar ||
      !constants.roseKc ||
      !constants.roseKo
    ) {
      return false;
    }
    const { state, size } = model;
    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const binding = getPlantWaterFluxBinding(model, constants);
    const substrateOffset = inputOffset(state.substrate, binding.substrateOffset, Uint8Array);
    const soilWaterOffset = inputOffset(state.soilWater, binding.soilWaterOffset, Float32Array);
    const soilCapOffset = inputOffset(state.soilCap, binding.soilCapOffset, Float32Array);
    const soilHydraulicKOffset = inputOffset(state.soilHydraulicK, binding.soilHydraulicKOffset, Float32Array);
    const groundwaterStorageOffset = inputOffset(
      state.groundwaterStorage,
      binding.groundwaterStorageOffset,
      Float32Array
    );
    const groundwaterCapOffset = inputOffset(state.groundwaterCap, binding.groundwaterCapOffset, Float32Array);
    const groundwaterTOffset = inputOffset(state.groundwaterT, binding.groundwaterTOffset, Float32Array);
    const groundwaterThicknessOffset = inputOffset(
      state.groundwaterThickness,
      binding.groundwaterThicknessOffset,
      Float32Array
    );
    const hOffset = inputOffset(state.H, binding.hOffset, Float32Array);
    const rOffset = inputOffset(state.R, binding.rOffset, Float32Array);
    const canopyWaterOffset = inputOffset(state.canopyWater, binding.canopyWaterOffset, Float32Array);
    const baobabLeafOffset = inputOffset(state.baobabLeaf, binding.baobabLeafOffset, Float32Array);
    const baobabStemOffset = inputOffset(state.baobabStem, binding.baobabStemOffset, Float32Array);
    const baobabRootOffset = inputOffset(state.baobabRoot, binding.baobabRootOffset, Float32Array);
    const roseLeafOffset = inputOffset(state.roseLeaf, binding.roseLeafOffset, Float32Array);
    const roseFlowerOffset = inputOffset(state.roseFlower, binding.roseFlowerOffset, Float32Array);
    const roseRootOffset = inputOffset(state.roseRoot, binding.roseRootOffset, Float32Array);
    const parOffset = inputOffset(state.par, binding.parOffset, Float32Array);
    const surfaceTempCOffset = inputOffset(state.surfaceTempC, binding.surfaceTempCOffset, Float32Array);
    const vpdKpaOffset = inputOffset(state.vpdKpa, binding.vpdKpaOffset, Float32Array);
    const vaporSlopeKpaCOffset = inputOffset(state.vaporSlopeKpaC, binding.vaporSlopeKpaCOffset, Float32Array);
    const laiBaobabOffset = inputOffset(state.laiBaobab, binding.laiBaobabOffset, Float32Array);
    const laiRoseOffset = inputOffset(state.laiRose, binding.laiRoseOffset, Float32Array);
    const vegetationCoverOffset = inputOffset(state.vegetationCover, binding.vegetationCoverOffset, Float32Array);
    const lightBaobabOffset = inputOffset(state.lightBaobab, binding.lightBaobabOffset, Float32Array);
    const lightRoseOffset = inputOffset(state.lightRose, binding.lightRoseOffset, Float32Array);
    const aparBaobabOffset = inputOffset(state.aparBaobab, binding.aparBaobabOffset, Float32Array);
    const aparRoseOffset = inputOffset(state.aparRose, binding.aparRoseOffset, Float32Array);
    const photoWaterStressBaobabOffset = inputOffset(
      state.photoWaterStressBaobab,
      binding.photoWaterStressBaobabOffset,
      Float32Array
    );
    const photoWaterStressRoseOffset = inputOffset(
      state.photoWaterStressRose,
      binding.photoWaterStressRoseOffset,
      Float32Array
    );
    const photoNutrientBaobabOffset = inputOffset(
      state.photoNutrientBaobab,
      binding.photoNutrientBaobabOffset,
      Float32Array
    );
    const photoNutrientRoseOffset = inputOffset(
      state.photoNutrientRose,
      binding.photoNutrientRoseOffset,
      Float32Array
    );
    const gppBaobabOffset = outputOffset(state.gppBaobab, binding.gppBaobabOffset);
    const gppRoseOffset = outputOffset(state.gppRose, binding.gppRoseOffset);
    const stomatalConductanceBaobabMpsOffset = outputOffset(
      state.stomatalConductanceBaobabMps,
      binding.stomatalConductanceBaobabMpsOffset
    );
    const stomatalConductanceRoseMpsOffset = outputOffset(
      state.stomatalConductanceRoseMps,
      binding.stomatalConductanceRoseMpsOffset
    );
    const ciBaobabOffset = outputOffset(state.ciBaobab, binding.ciBaobabOffset);
    const ciRoseOffset = outputOffset(state.ciRose, binding.ciRoseOffset);
    const rootStressBaobabOffset = outputOffset(state.rootStressBaobab, binding.rootStressBaobabOffset);
    const rootStressRoseOffset = outputOffset(state.rootStressRose, binding.rootStressRoseOffset);
    const canopyWaterNextOffset = outputOffset(state.canopyWaterN, binding.canopyWaterNextOffset);
    const canopyEvapMOffset = outputOffset(state.canopyEvapM, binding.canopyEvapMOffset);
    const hydrologyThroughfallOffset = outputOffset(state.hydrologyThroughfall, binding.hydrologyThroughfallOffset);
    const hydrologyVegFeedbackOffset = outputOffset(state.hydrologyVegFeedback, binding.hydrologyVegFeedbackOffset);
    const hydrologySink0Offset = outputOffset(state.hydrologySink0, binding.hydrologySink0Offset);
    const hydrologySink1Offset = outputOffset(state.hydrologySink1, binding.hydrologySink1Offset);
    const hydrologySink2Offset = outputOffset(state.hydrologySink2, binding.hydrologySink2Offset);
    const hydrologyGroundwaterSinkOffset = outputOffset(
      state.hydrologyGroundwaterSink,
      binding.hydrologyGroundwaterSinkOffset
    );
    const hydrologySurfaceEvapDemandMOffset = outputOffset(
      state.hydrologySurfaceEvapDemandM,
      binding.hydrologySurfaceEvapDemandMOffset
    );

    exports.sim_update_plant_water_fluxes(
      size,
      activeCount,
      binding.activeOffset,
      constants.hydraulicLookupSteps,
      constants.lookupSteps,
      constants.tempMinC,
      constants.tempLookupScale,
      constants.rootDepth,
      constants.evaporation,
      constants.atmosphericCo2Ppm,
      constants.baobabMultiplier,
      constants.roseMultiplier,
      constants.baobab.quantumYield,
      constants.baobab.curvature,
      constants.baobab.ciMin,
      constants.baobab.ciMax,
      constants.baobab.extinction,
      constants.baobab.g0Mol,
      constants.baobab.g1,
      constants.baobab.maxConductanceMps,
      constants.rose.quantumYield,
      constants.rose.curvature,
      constants.rose.ciMin,
      constants.rose.ciMax,
      constants.rose.extinction,
      constants.rose.g0Mol,
      constants.rose.g1,
      constants.rose.maxConductanceMps,
      binding.hydraulicPsiOffset,
      binding.baobabVcmaxOffset,
      binding.baobabJmaxOffset,
      binding.baobabRdOffset,
      binding.baobabGammaStarOffset,
      binding.baobabKcOffset,
      binding.baobabKoOffset,
      binding.roseVcmaxOffset,
      binding.roseJmaxOffset,
      binding.roseRdOffset,
      binding.roseGammaStarOffset,
      binding.roseKcOffset,
      binding.roseKoOffset,
      substrateOffset,
      soilWaterOffset,
      soilCapOffset,
      soilHydraulicKOffset,
      groundwaterStorageOffset,
      groundwaterCapOffset,
      groundwaterTOffset,
      groundwaterThicknessOffset,
      hOffset,
      rOffset,
      canopyWaterOffset,
      canopyWaterNextOffset,
      canopyEvapMOffset,
      baobabLeafOffset,
      baobabStemOffset,
      baobabRootOffset,
      roseLeafOffset,
      roseFlowerOffset,
      roseRootOffset,
      parOffset,
      surfaceTempCOffset,
      vpdKpaOffset,
      vaporSlopeKpaCOffset,
      laiBaobabOffset,
      laiRoseOffset,
      vegetationCoverOffset,
      lightBaobabOffset,
      lightRoseOffset,
      aparBaobabOffset,
      aparRoseOffset,
      photoWaterStressBaobabOffset,
      photoWaterStressRoseOffset,
      photoNutrientBaobabOffset,
      photoNutrientRoseOffset,
      gppBaobabOffset,
      gppRoseOffset,
      stomatalConductanceBaobabMpsOffset,
      stomatalConductanceRoseMpsOffset,
      ciBaobabOffset,
      ciRoseOffset,
      rootStressBaobabOffset,
      rootStressRoseOffset,
      hydrologyThroughfallOffset,
      hydrologyVegFeedbackOffset,
      hydrologySink0Offset,
      hydrologySink1Offset,
      hydrologySink2Offset,
      hydrologyGroundwaterSinkOffset,
      hydrologySurfaceEvapDemandMOffset
    );

    copyOutIfNeeded(state.canopyWaterN, canopyWaterNextOffset, Float32Array);
    copyOutIfNeeded(state.canopyEvapM, canopyEvapMOffset, Float32Array);
    copyOutIfNeeded(state.gppBaobab, gppBaobabOffset, Float32Array);
    copyOutIfNeeded(state.gppRose, gppRoseOffset, Float32Array);
    copyOutIfNeeded(state.stomatalConductanceBaobabMps, stomatalConductanceBaobabMpsOffset, Float32Array);
    copyOutIfNeeded(state.stomatalConductanceRoseMps, stomatalConductanceRoseMpsOffset, Float32Array);
    copyOutIfNeeded(state.ciBaobab, ciBaobabOffset, Float32Array);
    copyOutIfNeeded(state.ciRose, ciRoseOffset, Float32Array);
    copyOutIfNeeded(state.rootStressBaobab, rootStressBaobabOffset, Float32Array);
    copyOutIfNeeded(state.rootStressRose, rootStressRoseOffset, Float32Array);
    copyOutIfNeeded(state.hydrologyThroughfall, hydrologyThroughfallOffset, Float32Array);
    copyOutIfNeeded(state.hydrologyVegFeedback, hydrologyVegFeedbackOffset, Float32Array);
    copyOutIfNeeded(state.hydrologySink0, hydrologySink0Offset, Float32Array);
    copyOutIfNeeded(state.hydrologySink1, hydrologySink1Offset, Float32Array);
    copyOutIfNeeded(state.hydrologySink2, hydrologySink2Offset, Float32Array);
    copyOutIfNeeded(state.hydrologyGroundwaterSink, hydrologyGroundwaterSinkOffset, Float32Array);
    copyOutIfNeeded(state.hydrologySurfaceEvapDemandM, hydrologySurfaceEvapDemandMOffset, Float32Array);
    return true;
  }

  function runPlantCarbonSeeds(model, constants) {
    const { state, size } = model;
    if (
      !state.soilBioWetness ||
      !state.soilBioLitterFastInput ||
      !state.baobabLeafN ||
      !state.roseLeafN ||
      !constants?.baobabRespirationQ10 ||
      !constants.roseRespirationQ10
    ) {
      return false;
    }
    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const binding = getPlantCarbonSeedBinding(model, constants);
    const substrateOffset = inputOffset(state.substrate, binding.substrateOffset, Uint8Array);
    const baobabBlockedOffset = inputOffset(state.baobabBlocked, binding.baobabBlockedOffset, Uint8Array);
    const soilWaterOffset = inputOffset(state.soilWater, binding.soilWaterOffset, Float32Array);
    const soilCapOffset = inputOffset(state.soilCap, binding.soilCapOffset, Float32Array);
    const groundwaterStorageOffset = inputOffset(
      state.groundwaterStorage,
      binding.groundwaterStorageOffset,
      Float32Array
    );
    const groundwaterCapOffset = inputOffset(state.groundwaterCap, binding.groundwaterCapOffset, Float32Array);
    const gppBaobabOffset = inputOffset(state.gppBaobab, binding.gppBaobabOffset, Float32Array);
    const gppRoseOffset = inputOffset(state.gppRose, binding.gppRoseOffset, Float32Array);
    const rootStressBaobabOffset = inputOffset(state.rootStressBaobab, binding.rootStressBaobabOffset, Float32Array);
    const rootStressRoseOffset = inputOffset(state.rootStressRose, binding.rootStressRoseOffset, Float32Array);
    const canopyLightBaobabOffset = inputOffset(
      state.canopyLightBaobab,
      binding.canopyLightBaobabOffset,
      Float32Array
    );
    const canopyLightRoseOffset = inputOffset(state.canopyLightRose, binding.canopyLightRoseOffset, Float32Array);
    const lightBaobabOffset = inputOffset(state.lightBaobab, binding.lightBaobabOffset, Float32Array);
    const lightRoseOffset = inputOffset(state.lightRose, binding.lightRoseOffset, Float32Array);
    const vegetationCoverOffset = inputOffset(state.vegetationCover, binding.vegetationCoverOffset, Float32Array);
    const surfaceTempCOffset = inputOffset(state.surfaceTempC, binding.surfaceTempCOffset, Float32Array);
    const ashStressOffset = inputOffset(state.ashStress, binding.ashStressOffset, Float32Array);
    const baobabRiskOffset = inputOffset(state.baobabRisk, binding.baobabRiskOffset, Float32Array);
    const roseFertilityOffset = inputOffset(state.roseFertility, binding.roseFertilityOffset, Float32Array);
    const baobabLeafOffset = inputOffset(state.baobabLeaf, binding.baobabLeafOffset, Float32Array);
    const baobabStemOffset = inputOffset(state.baobabStem, binding.baobabStemOffset, Float32Array);
    const baobabRootOffset = inputOffset(state.baobabRoot, binding.baobabRootOffset, Float32Array);
    const baobabStoreOffset = inputOffset(state.baobabStore, binding.baobabStoreOffset, Float32Array);
    const baobabSeedOffset = inputOffset(state.baobabSeed, binding.baobabSeedOffset, Float32Array);
    const roseLeafOffset = inputOffset(state.roseLeaf, binding.roseLeafOffset, Float32Array);
    const roseFlowerOffset = inputOffset(state.roseFlower, binding.roseFlowerOffset, Float32Array);
    const roseRootOffset = inputOffset(state.roseRoot, binding.roseRootOffset, Float32Array);
    const roseStoreOffset = inputOffset(state.roseStore, binding.roseStoreOffset, Float32Array);
    const roseSeedOffset = inputOffset(state.roseSeed, binding.roseSeedOffset, Float32Array);
    const baobabSeedTransportOffset = inputOffset(
      state.baobabSeedTransport,
      binding.baobabSeedTransportOffset,
      Float32Array
    );
    const roseSeedTransportOffset = inputOffset(state.roseSeedTransport, binding.roseSeedTransportOffset, Float32Array);
    const roseSeedProductionOffset = inputOffset(
      state.roseSeedProduction,
      binding.roseSeedProductionOffset,
      Float32Array
    );
    const roseSeedArrivalOffset = inputOffset(state.roseSeedArrival, binding.roseSeedArrivalOffset, Float32Array);
    const baobabReadinessOffset = inputOffset(
      state.baobabGerminationReadiness,
      binding.baobabReadinessOffset,
      Float32Array
    );
    const roseReadinessOffset = inputOffset(state.roseGerminationReadiness, binding.roseReadinessOffset, Float32Array);
    const hydrologySink0Offset = outputOffset(state.hydrologySink0, binding.hydrologySink0Offset);
    const baobabLeafNextOffset = outputOffset(state.baobabLeafN, binding.baobabLeafNextOffset);
    const baobabStemNextOffset = outputOffset(state.baobabStemN, binding.baobabStemNextOffset);
    const baobabRootNextOffset = outputOffset(state.baobabRootN, binding.baobabRootNextOffset);
    const baobabStoreNextOffset = outputOffset(state.baobabStoreN, binding.baobabStoreNextOffset);
    const baobabSeedNextOffset = outputOffset(state.baobabSeedN, binding.baobabSeedNextOffset);
    const baobabReadinessNextOffset = outputOffset(
      state.baobabGerminationReadinessN,
      binding.baobabReadinessNextOffset
    );
    const roseLeafNextOffset = outputOffset(state.roseLeafN, binding.roseLeafNextOffset);
    const roseFlowerNextOffset = outputOffset(state.roseFlowerN, binding.roseFlowerNextOffset);
    const roseRootNextOffset = outputOffset(state.roseRootN, binding.roseRootNextOffset);
    const roseStoreNextOffset = outputOffset(state.roseStoreN, binding.roseStoreNextOffset);
    const roseSeedNextOffset = outputOffset(state.roseSeedN, binding.roseSeedNextOffset);
    const roseReadinessNextOffset = outputOffset(
      state.roseGerminationReadinessN,
      binding.roseReadinessNextOffset
    );
    const mbNextOffset = outputOffset(state.MBn, binding.mbNextOffset);
    const mrNextOffset = outputOffset(state.MRn, binding.mrNextOffset);
    const sbNextOffset = outputOffset(state.SBn, binding.sbNextOffset);
    const soilBioWetnessOffset = outputOffset(state.soilBioWetness, binding.soilBioWetnessOffset);
    const soilBioTempCOffset = outputOffset(state.soilBioTempC, binding.soilBioTempCOffset);
    const soilBioAshLoadOffset = outputOffset(state.soilBioAshLoad, binding.soilBioAshLoadOffset);
    const soilBioTopSatOffset = outputOffset(state.soilBioTopSat, binding.soilBioTopSatOffset);
    const soilBioGroundwaterSatOffset = outputOffset(
      state.soilBioGroundwaterSat,
      binding.soilBioGroundwaterSatOffset
    );
    const soilBioLitterFastInputOffset = outputOffset(
      state.soilBioLitterFastInput,
      binding.soilBioLitterFastInputOffset
    );
    const soilBioLitterSlowInputOffset = outputOffset(
      state.soilBioLitterSlowInput,
      binding.soilBioLitterSlowInputOffset
    );
    const soilBioPlantNutrientUptakeOffset = outputOffset(
      state.soilBioPlantNutrientUptake,
      binding.soilBioPlantNutrientUptakeOffset
    );

    exports.sim_update_plant_carbon_seeds(
      size,
      activeCount,
      binding.activeOffset,
      constants.modelDtDays,
      constants.storage,
      constants.lookupSteps,
      constants.tempMinC,
      constants.tempLookupScale,
      binding.baobabRespirationQ10Offset,
      binding.roseRespirationQ10Offset,
      substrateOffset,
      baobabBlockedOffset,
      soilWaterOffset,
      soilCapOffset,
      groundwaterStorageOffset,
      groundwaterCapOffset,
      gppBaobabOffset,
      gppRoseOffset,
      rootStressBaobabOffset,
      rootStressRoseOffset,
      canopyLightBaobabOffset,
      canopyLightRoseOffset,
      lightBaobabOffset,
      lightRoseOffset,
      vegetationCoverOffset,
      surfaceTempCOffset,
      ashStressOffset,
      baobabRiskOffset,
      roseFertilityOffset,
      baobabLeafOffset,
      baobabStemOffset,
      baobabRootOffset,
      baobabStoreOffset,
      baobabSeedOffset,
      roseLeafOffset,
      roseFlowerOffset,
      roseRootOffset,
      roseStoreOffset,
      roseSeedOffset,
      baobabSeedTransportOffset,
      roseSeedTransportOffset,
      roseSeedProductionOffset,
      roseSeedArrivalOffset,
      baobabReadinessOffset,
      roseReadinessOffset,
      hydrologySink0Offset,
      baobabLeafNextOffset,
      baobabStemNextOffset,
      baobabRootNextOffset,
      baobabStoreNextOffset,
      baobabSeedNextOffset,
      baobabReadinessNextOffset,
      roseLeafNextOffset,
      roseFlowerNextOffset,
      roseRootNextOffset,
      roseStoreNextOffset,
      roseSeedNextOffset,
      roseReadinessNextOffset,
      mbNextOffset,
      mrNextOffset,
      sbNextOffset,
      soilBioWetnessOffset,
      soilBioTempCOffset,
      soilBioAshLoadOffset,
      soilBioTopSatOffset,
      soilBioGroundwaterSatOffset,
      soilBioLitterFastInputOffset,
      soilBioLitterSlowInputOffset,
      soilBioPlantNutrientUptakeOffset
    );

    copyOutIfNeeded(state.hydrologySink0, hydrologySink0Offset, Float32Array);
    copyOutIfNeeded(state.baobabLeafN, baobabLeafNextOffset, Float32Array);
    copyOutIfNeeded(state.baobabStemN, baobabStemNextOffset, Float32Array);
    copyOutIfNeeded(state.baobabRootN, baobabRootNextOffset, Float32Array);
    copyOutIfNeeded(state.baobabStoreN, baobabStoreNextOffset, Float32Array);
    copyOutIfNeeded(state.baobabSeedN, baobabSeedNextOffset, Float32Array);
    copyOutIfNeeded(state.baobabGerminationReadinessN, baobabReadinessNextOffset, Float32Array);
    copyOutIfNeeded(state.roseLeafN, roseLeafNextOffset, Float32Array);
    copyOutIfNeeded(state.roseFlowerN, roseFlowerNextOffset, Float32Array);
    copyOutIfNeeded(state.roseRootN, roseRootNextOffset, Float32Array);
    copyOutIfNeeded(state.roseStoreN, roseStoreNextOffset, Float32Array);
    copyOutIfNeeded(state.roseSeedN, roseSeedNextOffset, Float32Array);
    copyOutIfNeeded(state.roseGerminationReadinessN, roseReadinessNextOffset, Float32Array);
    copyOutIfNeeded(state.MBn, mbNextOffset, Float32Array);
    copyOutIfNeeded(state.MRn, mrNextOffset, Float32Array);
    copyOutIfNeeded(state.SBn, sbNextOffset, Float32Array);
    copyOutIfNeeded(state.soilBioWetness, soilBioWetnessOffset, Float32Array);
    copyOutIfNeeded(state.soilBioTempC, soilBioTempCOffset, Float32Array);
    copyOutIfNeeded(state.soilBioAshLoad, soilBioAshLoadOffset, Float32Array);
    copyOutIfNeeded(state.soilBioTopSat, soilBioTopSatOffset, Float32Array);
    copyOutIfNeeded(state.soilBioGroundwaterSat, soilBioGroundwaterSatOffset, Float32Array);
    copyOutIfNeeded(state.soilBioLitterFastInput, soilBioLitterFastInputOffset, Float32Array);
    copyOutIfNeeded(state.soilBioLitterSlowInput, soilBioLitterSlowInputOffset, Float32Array);
    copyOutIfNeeded(state.soilBioPlantNutrientUptake, soilBioPlantNutrientUptakeOffset, Float32Array);
    return true;
  }

  function runPhotosynthesis(model, constants) {
    if (
      !constants.baobabVcmax ||
      !constants.baobabJmax ||
      !constants.baobabRd ||
      !constants.baobabGammaStar ||
      !constants.baobabKc ||
      !constants.baobabKo ||
      !constants.roseVcmax ||
      !constants.roseJmax ||
      !constants.roseRd ||
      !constants.roseGammaStar ||
      !constants.roseKc ||
      !constants.roseKo ||
      !model.state.photoWaterStressBaobab ||
      !model.state.photoWaterStressRose ||
      !model.state.photoNutrientBaobab ||
      !model.state.photoNutrientRose
    ) {
      return false;
    }
    const { state, size } = model;
    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const binding = getPhotosynthesisBinding(model, constants);
    const parOffset = inputOffset(state.par, binding.parOffset, Float32Array);
    const laiBaobabOffset = inputOffset(state.laiBaobab, binding.laiBaobabOffset, Float32Array);
    const laiRoseOffset = inputOffset(state.laiRose, binding.laiRoseOffset, Float32Array);
    const surfaceTempCOffset = inputOffset(state.surfaceTempC, binding.surfaceTempCOffset, Float32Array);
    const photoWaterStressBaobabOffset = inputOffset(
      state.photoWaterStressBaobab,
      binding.photoWaterStressBaobabOffset,
      Float32Array
    );
    const photoWaterStressRoseOffset = inputOffset(
      state.photoWaterStressRose,
      binding.photoWaterStressRoseOffset,
      Float32Array
    );
    const vpdKpaOffset = inputOffset(state.vpdKpa, binding.vpdKpaOffset, Float32Array);
    const photoNutrientBaobabOffset = inputOffset(
      state.photoNutrientBaobab,
      binding.photoNutrientBaobabOffset,
      Float32Array
    );
    const photoNutrientRoseOffset = inputOffset(
      state.photoNutrientRose,
      binding.photoNutrientRoseOffset,
      Float32Array
    );
    const aparBaobabOffset = inputOffset(state.aparBaobab, binding.aparBaobabOffset, Float32Array);
    const aparRoseOffset = inputOffset(state.aparRose, binding.aparRoseOffset, Float32Array);
    const gppBaobabOffset = outputOffset(state.gppBaobab, binding.gppBaobabOffset);
    const gppRoseOffset = outputOffset(state.gppRose, binding.gppRoseOffset);
    const stomatalConductanceBaobabMpsOffset = outputOffset(
      state.stomatalConductanceBaobabMps,
      binding.stomatalConductanceBaobabMpsOffset
    );
    const stomatalConductanceRoseMpsOffset = outputOffset(
      state.stomatalConductanceRoseMps,
      binding.stomatalConductanceRoseMpsOffset
    );
    const ciBaobabOffset = outputOffset(state.ciBaobab, binding.ciBaobabOffset);
    const ciRoseOffset = outputOffset(state.ciRose, binding.ciRoseOffset);

    exports.sim_update_photosynthesis(
      size,
      activeCount,
      binding.activeOffset,
      constants.lookupSteps,
      constants.tempMinC,
      constants.tempLookupScale,
      constants.atmosphericCo2Ppm,
      constants.baobab.quantumYield,
      constants.baobab.curvature,
      constants.baobab.ciMin,
      constants.baobab.ciMax,
      constants.baobab.extinction,
      constants.baobab.g0Mol,
      constants.baobab.g1,
      constants.baobab.maxConductanceMps,
      constants.baobabMultiplier,
      constants.rose.quantumYield,
      constants.rose.curvature,
      constants.rose.ciMin,
      constants.rose.ciMax,
      constants.rose.extinction,
      constants.rose.g0Mol,
      constants.rose.g1,
      constants.rose.maxConductanceMps,
      constants.roseMultiplier,
      binding.baobabVcmaxOffset,
      binding.baobabJmaxOffset,
      binding.baobabRdOffset,
      binding.baobabGammaStarOffset,
      binding.baobabKcOffset,
      binding.baobabKoOffset,
      binding.roseVcmaxOffset,
      binding.roseJmaxOffset,
      binding.roseRdOffset,
      binding.roseGammaStarOffset,
      binding.roseKcOffset,
      binding.roseKoOffset,
      parOffset,
      laiBaobabOffset,
      laiRoseOffset,
      surfaceTempCOffset,
      photoWaterStressBaobabOffset,
      photoWaterStressRoseOffset,
      vpdKpaOffset,
      photoNutrientBaobabOffset,
      photoNutrientRoseOffset,
      aparBaobabOffset,
      aparRoseOffset,
      gppBaobabOffset,
      gppRoseOffset,
      stomatalConductanceBaobabMpsOffset,
      stomatalConductanceRoseMpsOffset,
      ciBaobabOffset,
      ciRoseOffset
    );

    copyOutIfNeeded(state.gppBaobab, gppBaobabOffset, Float32Array);
    copyOutIfNeeded(state.gppRose, gppRoseOffset, Float32Array);
    copyOutIfNeeded(state.stomatalConductanceBaobabMps, stomatalConductanceBaobabMpsOffset, Float32Array);
    copyOutIfNeeded(state.stomatalConductanceRoseMps, stomatalConductanceRoseMpsOffset, Float32Array);
    copyOutIfNeeded(state.ciBaobab, ciBaobabOffset, Float32Array);
    copyOutIfNeeded(state.ciRose, ciRoseOffset, Float32Array);
    return true;
  }

  function runDarcyWaterColumns(model, constants) {
    const { state, size } = model;
    const { m } = paddedRbfOperatorsFor(model);
    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const binding = getDarcyBinding(model);

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

    const hOffset = inputOffset(state.H, binding.hOffset, Float32Array);
    const elevationOffset = inputOffset(state.elevation, binding.elevationOffset, Float32Array);
    const soilWaterOffset = inputOffset(state.soilWater, binding.soilWaterOffset, Float32Array);
    const soilHeadOffset = inputOffset(state.soilHead, binding.soilHeadOffset, Float32Array);
    const soilTransmissivityOffset = inputOffset(state.soilTransmissivity, binding.soilTransmissivityOffset, Float32Array);
    const soilResidualOffset = inputOffset(state.soilResidual, binding.soilResidualOffset, Float32Array);
    const soilCapOffset = inputOffset(state.soilCap, binding.soilCapOffset, Float32Array);
    const groundwaterStorageOffset = inputOffset(state.groundwaterStorage, binding.groundwaterStorageOffset, Float32Array);
    const groundwaterCapOffset = inputOffset(state.groundwaterCap, binding.groundwaterCapOffset, Float32Array);
    const groundwaterHeadOffset = inputOffset(state.groundwaterHead, binding.groundwaterHeadOffset, Float32Array);
    const groundwaterTOffset = inputOffset(state.groundwaterT, binding.groundwaterTOffset, Float32Array);
    const soilMineralNOffset = inputOffset(state.soilMineralN, binding.soilMineralNOffset, Float32Array);
    const soilCarbonActiveOffset = inputOffset(state.soilCarbonActive, binding.soilCarbonActiveOffset, Float32Array);
    const soilCarbonStableOffset = inputOffset(state.soilCarbonStable, binding.soilCarbonStableOffset, Float32Array);
    const baobabSeedOffset = inputOffset(state.baobabSeed, binding.baobabSeedOffset, Float32Array);
    const roseSeedOffset = inputOffset(state.roseSeed, binding.roseSeedOffset, Float32Array);
    const slopeXOffset = inputOffset(state.slopeX, binding.slopeXOffset, Float32Array);
    const slopeYOffset = inputOffset(state.slopeY, binding.slopeYOffset, Float32Array);
    const soilTransportOffset = outputOffset(state.soilTransport, binding.soilTransportOffset);
    const groundwaterTransportOffset = outputOffset(state.groundwaterTransport, binding.groundwaterTransportOffset);
    const hTransportOffset = outputOffset(state.Htransport, binding.hTransportOffset);
    const soilMineralTransportOffset = outputOffset(state.soilMineralTransport, binding.soilMineralTransportOffset);
    const baobabSeedTransportOffset = outputOffset(state.baobabSeedTransport, binding.baobabSeedTransportOffset);
    const roseSeedTransportOffset = outputOffset(state.roseSeedTransport, binding.roseSeedTransportOffset);
    const surfaceUxOffset = outputOffset(state.surfaceUx, binding.surfaceUxOffset);
    const surfaceUyOffset = outputOffset(state.surfaceUy, binding.surfaceUyOffset);
    const topSoilUxOffset = outputOffset(state.topSoilUx, binding.topSoilUxOffset);
    const topSoilUyOffset = outputOffset(state.topSoilUy, binding.topSoilUyOffset);
    const groundwaterUxOffset = outputOffset(state.groundwaterUx, binding.groundwaterUxOffset);
    const groundwaterUyOffset = outputOffset(state.groundwaterUy, binding.groundwaterUyOffset);
    const fluxXOffset = outputOffset(state.fluxX, binding.fluxXOffset);
    const fluxYOffset = outputOffset(state.fluxY, binding.fluxYOffset);
    if (activeCellIds && viewOffset(state.soilTransport) === null) {
      copyTo(soilTransportOffset, state.soilTransport, Float32Array);
      copyTo(groundwaterTransportOffset, state.groundwaterTransport, Float32Array);
      copyTo(hTransportOffset, state.Htransport, Float32Array);
      copyTo(soilMineralTransportOffset, state.soilMineralTransport, Float32Array);
      copyTo(baobabSeedTransportOffset, state.baobabSeedTransport, Float32Array);
      copyTo(roseSeedTransportOffset, state.roseSeedTransport, Float32Array);
      copyTo(surfaceUxOffset, state.surfaceUx, Float32Array);
      copyTo(surfaceUyOffset, state.surfaceUy, Float32Array);
      copyTo(topSoilUxOffset, state.topSoilUx, Float32Array);
      copyTo(topSoilUyOffset, state.topSoilUy, Float32Array);
      copyTo(groundwaterUxOffset, state.groundwaterUx, Float32Array);
      copyTo(groundwaterUyOffset, state.groundwaterUy, Float32Array);
      copyTo(fluxXOffset, state.fluxX, Float32Array);
      copyTo(fluxYOffset, state.fluxY, Float32Array);
    }

    exports.sim_transport_darcy_water_columns(
      size,
      m,
      activeCount,
      binding.activeOffset,
      constants.dtDays,
      constants.cellSizeM,
      constants.surfaceWaterDiffM2Day,
      constants.surfaceSlopeVelocityMDay,
      constants.surfaceSlopeMaxVelocityMDay,
      constants.nutrientDiffM2Day,
      constants.baobabSeedDiffusionM2Day,
      constants.roseSeedDiffusionM2Day,
      binding.stencilOffset,
      binding.lapOffset,
      binding.gxOffset,
      binding.gyOffset,
      hOffset,
      elevationOffset,
      soilWaterOffset,
      soilHeadOffset,
      soilTransmissivityOffset,
      soilResidualOffset,
      soilCapOffset,
      groundwaterStorageOffset,
      groundwaterCapOffset,
      groundwaterHeadOffset,
      groundwaterTOffset,
      soilMineralNOffset,
      soilCarbonActiveOffset,
      soilCarbonStableOffset,
      binding.mobileNutrientOffset,
      baobabSeedOffset,
      roseSeedOffset,
      slopeXOffset,
      slopeYOffset,
      soilTransportOffset,
      groundwaterTransportOffset,
      hTransportOffset,
      soilMineralTransportOffset,
      baobabSeedTransportOffset,
      roseSeedTransportOffset,
      surfaceUxOffset,
      surfaceUyOffset,
      topSoilUxOffset,
      topSoilUyOffset,
      groundwaterUxOffset,
      groundwaterUyOffset,
      constants.combineSurfaceNutrient ? 1 : 0,
      constants.surfaceFilmThresholdM ?? 0,
      fluxXOffset,
      fluxYOffset
    );

    copyOutIfNeeded(state.soilTransport, soilTransportOffset, Float32Array);
    copyOutIfNeeded(state.groundwaterTransport, groundwaterTransportOffset, Float32Array);
    copyOutIfNeeded(state.Htransport, hTransportOffset, Float32Array);
    copyOutIfNeeded(state.soilMineralTransport, soilMineralTransportOffset, Float32Array);
    copyOutIfNeeded(state.baobabSeedTransport, baobabSeedTransportOffset, Float32Array);
    copyOutIfNeeded(state.roseSeedTransport, roseSeedTransportOffset, Float32Array);
    copyOutIfNeeded(state.surfaceUx, surfaceUxOffset, Float32Array);
    copyOutIfNeeded(state.surfaceUy, surfaceUyOffset, Float32Array);
    copyOutIfNeeded(state.topSoilUx, topSoilUxOffset, Float32Array);
    copyOutIfNeeded(state.topSoilUy, topSoilUyOffset, Float32Array);
    copyOutIfNeeded(state.groundwaterUx, groundwaterUxOffset, Float32Array);
    copyOutIfNeeded(state.groundwaterUy, groundwaterUyOffset, Float32Array);
    copyOutIfNeeded(state.fluxX, fluxXOffset, Float32Array);
    copyOutIfNeeded(state.fluxY, fluxYOffset, Float32Array);
    return true;
  }

  function runHydraulicState(model, constants) {
    if (!constants.hydraulicPsi || !constants.hydraulicRelativeK || !constants.groundwaterPow17) {
      return false;
    }
    const { state, size } = model;
    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const binding = getHydraulicBinding(model, constants);
    const substrateOffset = inputOffset(state.substrate, binding.substrateOffset, Uint8Array);
    const elevationOffset = inputOffset(state.elevation, binding.elevationOffset, Float32Array);
    const soilWaterOffset = inputOffset(state.soilWater, binding.soilWaterOffset, Float32Array);
    const soilCapOffset = inputOffset(state.soilCap, binding.soilCapOffset, Float32Array);
    const soilCenterDepthOffset = inputOffset(state.soilCenterDepth, binding.soilCenterDepthOffset, Float32Array);
    const soilThicknessOffset = inputOffset(state.soilThickness, binding.soilThicknessOffset, Float32Array);
    const groundwaterStorageOffset = inputOffset(state.groundwaterStorage, binding.groundwaterStorageOffset, Float32Array);
    const groundwaterCapOffset = inputOffset(state.groundwaterCap, binding.groundwaterCapOffset, Float32Array);
    const groundwaterThicknessOffset = inputOffset(state.groundwaterThickness, binding.groundwaterThicknessOffset, Float32Array);
    const groundwaterTopDepthOffset = inputOffset(state.groundwaterTopDepth, binding.groundwaterTopDepthOffset, Float32Array);
    const w0Offset = outputOffset(state.W0, binding.w0Offset);
    const w1Offset = outputOffset(state.W1, binding.w1Offset);
    const soilHeadOffset = outputOffset(state.soilHead, binding.soilHeadOffset);
    const soilHydraulicKOffset = outputOffset(state.soilHydraulicK, binding.soilHydraulicKOffset);
    const soilTransmissivityOffset = outputOffset(state.soilTransmissivity, binding.soilTransmissivityOffset);
    const groundwaterHeadOffset = outputOffset(state.groundwaterHead, binding.groundwaterHeadOffset);
    const groundwaterTOffset = outputOffset(state.groundwaterT, binding.groundwaterTOffset);
    if (activeCellIds && viewOffset(state.W0) === null) {
      copyTo(w0Offset, state.W0, Float32Array);
      copyTo(w1Offset, state.W1, Float32Array);
      copyTo(soilHeadOffset, state.soilHead, Float32Array);
      copyTo(soilHydraulicKOffset, state.soilHydraulicK, Float32Array);
      copyTo(soilTransmissivityOffset, state.soilTransmissivity, Float32Array);
      copyTo(groundwaterHeadOffset, state.groundwaterHead, Float32Array);
      copyTo(groundwaterTOffset, state.groundwaterT, Float32Array);
    }

    exports.sim_update_hydraulic_state(
      size,
      activeCount,
      binding.activeOffset,
      constants.lookupSteps,
      constants.groundwaterFlowMultiplier,
      binding.hydraulicPsiOffset,
      binding.hydraulicRelativeKOffset,
      binding.groundwaterPow17Offset,
      substrateOffset,
      elevationOffset,
      soilWaterOffset,
      soilCapOffset,
      soilCenterDepthOffset,
      soilThicknessOffset,
      groundwaterStorageOffset,
      groundwaterCapOffset,
      groundwaterThicknessOffset,
      groundwaterTopDepthOffset,
      w0Offset,
      w1Offset,
      soilHeadOffset,
      soilHydraulicKOffset,
      soilTransmissivityOffset,
      groundwaterHeadOffset,
      groundwaterTOffset
    );

    copyOutIfNeeded(state.W0, w0Offset, Float32Array);
    copyOutIfNeeded(state.W1, w1Offset, Float32Array);
    copyOutIfNeeded(state.soilHead, soilHeadOffset, Float32Array);
    copyOutIfNeeded(state.soilHydraulicK, soilHydraulicKOffset, Float32Array);
    copyOutIfNeeded(state.soilTransmissivity, soilTransmissivityOffset, Float32Array);
    copyOutIfNeeded(state.groundwaterHead, groundwaterHeadOffset, Float32Array);
    copyOutIfNeeded(state.groundwaterT, groundwaterTOffset, Float32Array);
    return true;
  }

  function runSurfaceNutrientTransport(model, constants) {
    const { state, size } = model;
    const { m } = paddedRbfOperatorsFor(model);
    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const binding = getSurfaceNutrientBinding(model);
    if (activeCellIds) {
      state.fluxX.fill(0);
      state.fluxY.fill(0);
    }

    const hOffset = inputOffset(state.H, binding.hOffset, Float32Array);
    const w0Offset = inputOffset(state.W0, binding.w0Offset, Float32Array);
    const w1Offset = inputOffset(state.W1, binding.w1Offset, Float32Array);
    const soilCapOffset = inputOffset(state.soilCap, binding.soilCapOffset, Float32Array);
    const groundwaterCapOffset = inputOffset(state.groundwaterCap, binding.groundwaterCapOffset, Float32Array);
    const soilMineralNOffset = inputOffset(state.soilMineralN, binding.soilMineralNOffset, Float32Array);
    const soilCarbonActiveOffset = inputOffset(state.soilCarbonActive, binding.soilCarbonActiveOffset, Float32Array);
    const soilCarbonStableOffset = inputOffset(state.soilCarbonStable, binding.soilCarbonStableOffset, Float32Array);
    const topSoilUxOffset = inputOffset(state.topSoilUx, binding.topSoilUxOffset, Float32Array);
    const topSoilUyOffset = inputOffset(state.topSoilUy, binding.topSoilUyOffset, Float32Array);
    const groundwaterUxOffset = inputOffset(state.groundwaterUx, binding.groundwaterUxOffset, Float32Array);
    const groundwaterUyOffset = inputOffset(state.groundwaterUy, binding.groundwaterUyOffset, Float32Array);
    const surfaceUxOffset = inputOffset(state.surfaceUx, binding.surfaceUxOffset, Float32Array);
    const surfaceUyOffset = inputOffset(state.surfaceUy, binding.surfaceUyOffset, Float32Array);
    const fluxXOffset = inputOffset(state.fluxX, binding.fluxXOffset, Float32Array);
    const fluxYOffset = inputOffset(state.fluxY, binding.fluxYOffset, Float32Array);
    const hTransportOffset = inputOffset(state.Htransport, binding.hTransportOffset, Float32Array);
    const soilMineralTransportOffset = inputOffset(
      state.soilMineralTransport,
      binding.soilMineralTransportOffset,
      Float32Array
    );

    exports.sim_transport_surface_nutrient(
      size,
      m,
      activeCount,
      binding.activeOffset,
      constants.surfaceFilmThresholdM,
      constants.modelDtDays,
      binding.stencilOffset,
      binding.gxOffset,
      binding.gyOffset,
      hOffset,
      w0Offset,
      w1Offset,
      soilCapOffset,
      groundwaterCapOffset,
      soilMineralNOffset,
      soilCarbonActiveOffset,
      soilCarbonStableOffset,
      topSoilUxOffset,
      topSoilUyOffset,
      groundwaterUxOffset,
      groundwaterUyOffset,
      surfaceUxOffset,
      surfaceUyOffset,
      fluxXOffset,
      fluxYOffset,
      hTransportOffset,
      soilMineralTransportOffset
    );

    copyOutIfNeeded(state.fluxX, fluxXOffset, Float32Array);
    copyOutIfNeeded(state.fluxY, fluxYOffset, Float32Array);
    copyOutIfNeeded(state.Htransport, hTransportOffset, Float32Array);
    copyOutIfNeeded(state.soilMineralTransport, soilMineralTransportOffset, Float32Array);
    return true;
  }

  function runStableSurfaceWaterTransport(model, constants) {
    const { state, size } = model;
    const { m } = paddedRbfOperatorsFor(model);
    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const binding = getStableSurfaceWaterBinding(model);
    if (activeCellIds) {
      state.Htransport.fill(0);
      state.surfaceUx.fill(0);
      state.surfaceUy.fill(0);
    }

    const hOffset = inputOffset(state.H, binding.hOffset, Float32Array);
    const elevationOffset = inputOffset(state.elevation, binding.elevationOffset, Float32Array);
    const slopeXOffset = inputOffset(state.slopeX, binding.slopeXOffset, Float32Array);
    const slopeYOffset = inputOffset(state.slopeY, binding.slopeYOffset, Float32Array);
    const hnOffset = outputOffset(state.Hn, binding.hnOffset);
    const hTransportOffset = outputOffset(state.Htransport, binding.hTransportOffset);
    const surfaceUxOffset = outputOffset(state.surfaceUx, binding.surfaceUxOffset);
    const surfaceUyOffset = outputOffset(state.surfaceUy, binding.surfaceUyOffset);
    if (activeCellIds && viewOffset(state.Hn) === null) {
      copyTo(hnOffset, state.Hn, Float32Array);
      copyTo(hTransportOffset, state.Htransport, Float32Array);
      copyTo(surfaceUxOffset, state.surfaceUx, Float32Array);
      copyTo(surfaceUyOffset, state.surfaceUy, Float32Array);
    }

    const ok = exports.sim_compute_stable_surface_water_transport(
      size,
      m,
      activeCount,
      binding.activeOffset,
      constants.substeps,
      constants.dtDays,
      constants.surfaceWaterDiffM2Day,
      constants.surfaceSlopeVelocityMDay,
      constants.surfaceSlopeMaxVelocityMDay,
      constants.surfaceFilmThresholdM,
      constants.surfaceWaterNumericFloorM,
      binding.stencilOffset,
      binding.lapOffset,
      binding.gxOffset,
      binding.gyOffset,
      hOffset,
      elevationOffset,
      slopeXOffset,
      slopeYOffset,
      hnOffset,
      hTransportOffset,
      surfaceUxOffset,
      surfaceUyOffset
    );
    if (!ok) {
      throw new Error("Surface water transport diverged.");
    }

    copyOutIfNeeded(state.Hn, hnOffset, Float32Array);
    copyOutIfNeeded(state.Htransport, hTransportOffset, Float32Array);
    copyOutIfNeeded(state.surfaceUx, surfaceUxOffset, Float32Array);
    copyOutIfNeeded(state.surfaceUy, surfaceUyOffset, Float32Array);
    return true;
  }

  function runAsteroidDaysideRain(model, constants) {
    const { state, size, rainMap } = model;
    const binding = getRainBinding(model);
    const sunlightOffset = inputOffset(state.sunlight, binding.sunlightOffset, Float32Array);
    const rainOffset = outputOffset(state.R, binding.rainOffset);

    exports.sim_update_asteroid_dayside_rain(
      size,
      constants.meanRain,
      constants.day,
      rainMap.renderSize,
      constants.rainScale,
      constants.patchiness,
      constants.cloudCount,
      binding.rainXOffset,
      binding.rainYOffset,
      sunlightOffset,
      rainOffset
    );

    copyOutIfNeeded(state.R, rainOffset, Float32Array);
    return true;
  }

  function runEarthRain(model, constants) {
    const { state, size, rainMap } = model;
    const binding = getRainBinding(model);
    const stormSystems = constants.stormSystems;
    if (!stormSystems) {
      return false;
    }

    const tropicalCount = Math.min(12, stormSystems.tropical?.length ?? 0);
    const midLatitudeCount = Math.min(11, stormSystems.midLatitude?.length ?? 0);
    for (const scratch of binding.tropicalScratch) {
      scratch.fill(0);
    }
    for (let index = 0; index < tropicalCount; index += 1) {
      const storm = stormSystems.tropical[index];
      binding.tropicalScratch[0][index] = storm.x;
      binding.tropicalScratch[1][index] = storm.y;
      binding.tropicalScratch[2][index] = storm.radius;
      binding.tropicalScratch[3][index] = storm.coreRadius;
      binding.tropicalScratch[4][index] = storm.coreAmp;
      binding.tropicalScratch[5][index] = storm.amp;
    }
    for (let index = 0; index < binding.tropicalScratch.length; index += 1) {
      copyTo(binding.tropicalOffsets[index], binding.tropicalScratch[index], Float32Array);
    }

    for (const scratch of binding.midScratch) {
      scratch.fill(0);
    }
    for (let index = 0; index < midLatitudeCount; index += 1) {
      const storm = stormSystems.midLatitude[index];
      binding.midScratch[0][index] = storm.x;
      binding.midScratch[1][index] = storm.y;
      binding.midScratch[2][index] = storm.radius;
      binding.midScratch[3][index] = Math.cos(storm.phase);
      binding.midScratch[4][index] = Math.sin(storm.phase);
      binding.midScratch[5][index] = storm.amp;
    }
    for (let index = 0; index < binding.midScratch.length; index += 1) {
      copyTo(binding.midOffsets[index], binding.midScratch[index], Float32Array);
    }

    const rainClimatologyOffset = inputOffset(state.rainClimatology, binding.rainClimatologyOffset, Float32Array);
    const rainOffset = outputOffset(state.R, binding.rainOffset);
    exports.sim_update_earth_rain(
      size,
      constants.meanRain,
      rainMap.renderSize,
      constants.patchiness,
      constants.tropicalScale,
      constants.midLatitudeScale,
      tropicalCount,
      midLatitudeCount,
      binding.rainXOffset,
      binding.rainYOffset,
      binding.rainTropicsOffset,
      binding.rainMidLatitudeOffset,
      binding.rainWeakBackgroundOffset,
      rainClimatologyOffset,
      binding.tropicalOffsets[0],
      binding.tropicalOffsets[1],
      binding.tropicalOffsets[2],
      binding.tropicalOffsets[3],
      binding.tropicalOffsets[4],
      binding.tropicalOffsets[5],
      binding.midOffsets[0],
      binding.midOffsets[1],
      binding.midOffsets[2],
      binding.midOffsets[3],
      binding.midOffsets[4],
      binding.midOffsets[5],
      rainOffset
    );

    copyOutIfNeeded(state.R, rainOffset, Float32Array);
    return true;
  }

  function runEarthCloudCover(options) {
    if (
      typeof exports.sim_update_earth_cloud_cover !== "function" ||
      !options ||
      !(options.cellHeight instanceof Float32Array) ||
      !(options.cellPhi instanceof Float32Array) ||
      !(options.era5CloudCover instanceof Uint8Array) ||
      !(options.cloudCover instanceof Float32Array)
    ) {
      return false;
    }

    const size = Math.max(0, options.size | 0);
    const cloudWeather = options.cloudWeather instanceof Float32Array ? options.cloudWeather : options.cloudCover;
    if (
      size <= 0 ||
      options.cellHeight.length < size ||
      options.cellPhi.length < size ||
      options.cloudCover.length < size ||
      cloudWeather.length < size
    ) {
      return false;
    }

    let binding = earthCloudBindings.get(options.cloudCover);
    if (!binding) {
      binding = {};
      earthCloudBindings.set(options.cloudCover, binding);
    }

    const cellHeightOffset = cachedInputOffset(binding, "cellHeightSource", "cellHeightOffset", options.cellHeight, Float32Array);
    const cellPhiOffset = cachedInputOffset(binding, "cellPhiSource", "cellPhiOffset", options.cellPhi, Float32Array);
    const era5CloudOffset = cachedInputOffset(binding, "era5CloudSource", "era5CloudOffset", options.era5CloudCover, Uint8Array);
    const cloudCoverOffset = cachedOutputOffset(binding, "cloudCoverSource", "cloudCoverOffset", options.cloudCover);
    const cloudWeatherOffset =
      cloudWeather === options.cloudCover
        ? cloudCoverOffset
        : cachedOutputOffset(binding, "cloudWeatherSource", "cloudWeatherOffset", cloudWeather);

    if (
      binding.geometryCellHeightSource !== options.cellHeight ||
      binding.geometryCellPhiSource !== options.cellPhi ||
      binding.geometrySize !== size
    ) {
      const bytes = size * Float32Array.BYTES_PER_ELEMENT;
      binding.cellLonDegOffset = allocBytes(bytes);
      binding.cellLatDegOffset = allocBytes(bytes);
      binding.cloudMidLatitudeOffset = allocBytes(bytes);
      binding.cloudTropicalOffset = allocBytes(bytes);
      binding.cloudTropicalPulseOffset = allocBytes(bytes);
      binding.cloudPolarOffset = allocBytes(bytes);
      exports.sim_prepare_earth_cloud_geometry(
        size,
        cellHeightOffset,
        cellPhiOffset,
        binding.cellLonDegOffset,
        binding.cellLatDegOffset,
        binding.cloudMidLatitudeOffset,
        binding.cloudTropicalOffset,
        binding.cloudTropicalPulseOffset,
        binding.cloudPolarOffset
      );
      binding.geometryCellHeightSource = options.cellHeight;
      binding.geometryCellPhiSource = options.cellPhi;
      binding.geometrySize = size;
    }

    exports.sim_update_earth_cloud_cover(
      size,
      Number.isFinite(options.modelDay) ? options.modelDay : 1,
      cellHeightOffset,
      cellPhiOffset,
      era5CloudOffset,
      cloudCoverOffset,
      cloudWeatherOffset,
      binding.cellLonDegOffset,
      binding.cellLatDegOffset,
      binding.cloudMidLatitudeOffset,
      binding.cloudTropicalOffset,
      binding.cloudTropicalPulseOffset,
      binding.cloudPolarOffset
    );

    copyOutIfNeeded(options.cloudCover, cloudCoverOffset, Float32Array);
    if (cloudWeather !== options.cloudCover) {
      copyOutIfNeeded(cloudWeather, cloudWeatherOffset, Float32Array);
    }
    return true;
  }

  function runRainMemory(model, constants) {
    const { state, size } = model;
    const binding = getRainBinding(model);
    const rainOffset = inputOffset(state.R, binding.rainOffset, Float32Array);
    const rainMemoryOffset = outputOffset(state.rainMemory, binding.rainMemoryOffset);

    exports.sim_update_rain_memory(size, constants.rainAverageWeight, rainOffset, rainMemoryOffset);

    copyOutIfNeeded(state.rainMemory, rainMemoryOffset, Float32Array);
    return true;
  }

  function buildRoseSeedDispersalKernel(model, constants) {
    if (
      !model?.topology?.cells ||
      !model?.state?.landActive ||
      typeof exports.sim_count_rose_seed_kernel !== "function" ||
      typeof exports.sim_fill_rose_seed_kernel !== "function"
    ) {
      return null;
    }

    const { size, topology, state } = model;
    const maxGraphSteps = Math.max(1, constants.maxGraphSteps | 0);
    const offsets = new Int32Array(size + 1);
    const marks = new Uint32Array(size);
    const normalX = new Float32Array(size);
    const normalY = new Float32Array(size);
    const normalZ = new Float32Array(size);
    for (let index = 0; index < topology.cells.length; index += 1) {
      const cell = topology.cells[index];
      if (!cell) {
        continue;
      }
      normalX[cell.id] = cell.normal[0];
      normalY[cell.id] = cell.normal[1];
      normalZ[cell.id] = cell.normal[2];
    }

    const landActiveOffset = allocateAndCopy(state.landActive, Uint8Array);
    const markOffset = allocateAndCopy(marks, Uint32Array);
    const offsetsOffset = allocateLike(offsets);
    const totalTargets = exports.sim_count_rose_seed_kernel(
      topology.nside,
      size,
      landActiveOffset,
      maxGraphSteps,
      markOffset,
      offsetsOffset
    );
    if (!Number.isFinite(totalTargets) || totalTargets < 0) {
      return null;
    }

    copyOut(offsets, offsetsOffset, Int32Array);
    const weightSums = new Float32Array(size);
    const normalXOffset = allocateAndCopy(normalX, Float32Array);
    const normalYOffset = allocateAndCopy(normalY, Float32Array);
    const normalZOffset = allocateAndCopy(normalZ, Float32Array);
    const targetsOffset = allocBytes(totalTargets * Int32Array.BYTES_PER_ELEMENT);
    const cumulativeWeightsOffset = allocBytes(totalTargets * Float32Array.BYTES_PER_ELEMENT);
    const weightSumsOffset = allocateLike(weightSums);

    exports.sim_fill_rose_seed_kernel(
      topology.nside,
      size,
      landActiveOffset,
      normalXOffset,
      normalYOffset,
      normalZOffset,
      constants.radiusM,
      constants.dispersalLengthM,
      maxGraphSteps,
      markOffset,
      offsetsOffset,
      targetsOffset,
      cumulativeWeightsOffset,
      cumulativeWeightsOffset,
      weightSumsOffset
    );

    const targets = new Int32Array(exports.memory.buffer, targetsOffset, totalTargets).slice();
    const cumulativeWeights = new Float32Array(
      exports.memory.buffer,
      cumulativeWeightsOffset,
      totalTargets
    ).slice();
    copyOut(weightSums, weightSumsOffset, Float32Array);
    return { offsets, targets, cumulativeWeights, weightSums };
  }

  function runRoseSeedDispersal(model, constants) {
    const { state, size } = model;
    if (!model.roseSeedDispersalKernel || !state.roseSeedProduction || !state.roseSeedArrival) {
      return false;
    }
    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const binding = getRoseSeedDispersalBinding(model, constants);
    const cohorts = binding.cohorts;
    let productionCount = 0;
    for (let cellOffset = 0; cellOffset < activeCount; cellOffset += 1) {
      const i = activeCellIds ? activeCellIds[cellOffset] : cellOffset;
      if (state.roseSeedProduction[i] <= 1e-10) {
        continue;
      }
      binding.productionIds[productionCount] = i;
      productionCount += 1;
    }
    if (productionCount <= 0) {
      return true;
    }
    if (!model.rng || typeof model.rng.state !== "number" || typeof model.rng.setState !== "function") {
      return false;
    }

    new Int32Array(exports.memory.buffer, binding.productionIdsOffset, productionCount).set(
      binding.productionIds.subarray(0, productionCount)
    );
    const roseSeedProductionOffset = inputOffset(
      state.roseSeedProduction,
      binding.roseSeedProductionOffset,
      Float32Array
    );
    const roseSeedArrivalOffset = outputOffset(state.roseSeedArrival, binding.roseSeedArrivalOffset);
    if (viewOffset(state.roseSeedArrival) === null) {
      copyTo(roseSeedArrivalOffset, state.roseSeedArrival, Float32Array);
    }

    exports.sim_distribute_rose_seeds(
      size,
      productionCount,
      binding.productionIdsOffset,
      cohorts,
      binding.dispersalOffsetsOffset,
      binding.dispersalTargetsOffset,
      binding.dispersalWeightsOffset,
      binding.dispersalWeightSumsOffset,
      roseSeedProductionOffset,
      roseSeedArrivalOffset,
      model.rng.state >>> 0,
      binding.rngStateOffset
    );
    const updatedState = new Uint32Array(exports.memory.buffer, binding.rngStateOffset, 1)[0];
    model.rng.setState(updatedState);

    copyOutIfNeeded(state.roseSeedArrival, roseSeedArrivalOffset, Float32Array);
    return true;
  }

  function runRoseSeedProductionAndDispersal(model, constants) {
    const { state, size } = model;
    if (
      !model.roseSeedDispersalKernel ||
      !state.roseSeedProduction ||
      !state.roseSeedArrival ||
      !model.rng ||
      typeof model.rng.state !== "number" ||
      typeof model.rng.setState !== "function"
    ) {
      return false;
    }

    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const binding = getRoseSeedDispersalBinding(model, constants);
    const roseSeedProductionOffset = outputOffset(state.roseSeedProduction, binding.roseSeedProductionOffset);
    const roseSeedArrivalOffset = outputOffset(state.roseSeedArrival, binding.roseSeedArrivalOffset);
    if (viewOffset(state.roseSeedProduction) === null) {
      copyTo(roseSeedProductionOffset, state.roseSeedProduction, Float32Array);
    }
    if (viewOffset(state.roseSeedArrival) === null) {
      copyTo(roseSeedArrivalOffset, state.roseSeedArrival, Float32Array);
    }

    exports.sim_produce_and_distribute_rose_seeds(
      size,
      activeCount,
      binding.activeOffset,
      model.planetPreset === "earth" ? 1 : 0,
      constants.asteroidMeanTempC,
      constants.asteroidDiurnalRangeC,
      constants.asteroidLatitudeTempRangeC,
      constants.shade,
      constants.modelDtDays,
      binding.cohorts,
      binding.dispersalOffsetsOffset,
      binding.dispersalTargetsOffset,
      binding.dispersalWeightsOffset,
      binding.dispersalWeightSumsOffset,
      inputOffset(state.cellHeight, binding.cellHeightOffset, Float32Array),
      inputOffset(state.climateMeanTempC, binding.climateMeanTempCOffset, Float32Array),
      inputOffset(state.climateDiurnalRangeC, binding.climateDiurnalRangeCOffset, Float32Array),
      inputOffset(state.elevation, binding.elevationOffset, Float32Array),
      inputOffset(state.soilWater, binding.soilWaterOffset, Float32Array),
      inputOffset(state.soilCap, binding.soilCapOffset, Float32Array),
      inputOffset(state.groundwaterStorage, binding.groundwaterStorageOffset, Float32Array),
      inputOffset(state.groundwaterCap, binding.groundwaterCapOffset, Float32Array),
      inputOffset(state.H, binding.hOffset, Float32Array),
      inputOffset(state.R, binding.rOffset, Float32Array),
      inputOffset(state.sunlight, binding.sunlightOffset, Float32Array),
      inputOffset(state.baobabLeaf, binding.baobabLeafOffset, Float32Array),
      inputOffset(state.roseLeaf, binding.roseLeafOffset, Float32Array),
      inputOffset(state.roseFlower, binding.roseFlowerOffset, Float32Array),
      inputOffset(state.roseRoot, binding.roseRootOffset, Float32Array),
      inputOffset(state.roseStore, binding.roseStoreOffset, Float32Array),
      inputOffset(state.gppRose, binding.gppRoseOffset, Float32Array),
      inputOffset(state.roseFertility, binding.roseFertilityOffset, Float32Array),
      roseSeedProductionOffset,
      roseSeedArrivalOffset,
      model.rng.state >>> 0,
      binding.rngStateOffset
    );

    const updatedState = new Uint32Array(exports.memory.buffer, binding.rngStateOffset, 1)[0];
    model.rng.setState(updatedState);
    copyOutIfNeeded(state.roseSeedProduction, roseSeedProductionOffset, Float32Array);
    copyOutIfNeeded(state.roseSeedArrival, roseSeedArrivalOffset, Float32Array);
    return true;
  }

  function runSoilBiogeochemistry(model, constants) {
    const { state, size } = model;
    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const binding = getSoilBiogeochemistryBinding(model);

    const substrateOffset = inputOffset(state.substrate, binding.substrateOffset, Uint8Array);
    const depthOffset = inputOffset(state.depth, binding.depthOffset, Float32Array);
    const soilMineralNOffset = inputOffset(state.soilMineralN, binding.soilMineralNOffset, Float32Array);
    const soilMineralTransportOffset = inputOffset(
      state.soilMineralTransport,
      binding.soilMineralTransportOffset,
      Float32Array
    );
    const litterCarbonOffset = inputOffset(state.litterCarbon, binding.litterCarbonOffset, Float32Array);
    const litterFastCarbonOffset = inputOffset(state.litterFastCarbon, binding.litterFastCarbonOffset, Float32Array);
    const litterSlowCarbonOffset = inputOffset(state.litterSlowCarbon, binding.litterSlowCarbonOffset, Float32Array);
    const soilCarbonActiveOffset = inputOffset(state.soilCarbonActive, binding.soilCarbonActiveOffset, Float32Array);
    const soilCarbonStableOffset = inputOffset(state.soilCarbonStable, binding.soilCarbonStableOffset, Float32Array);
    const roseFertilityOffset = inputOffset(state.roseFertility, binding.roseFertilityOffset, Float32Array);
    const soilBioWetnessOffset = inputOffset(state.soilBioWetness, binding.soilBioWetnessOffset, Float32Array);
    const soilBioTempCOffset = inputOffset(state.soilBioTempC, binding.soilBioTempCOffset, Float32Array);
    const soilBioAshLoadOffset = inputOffset(state.soilBioAshLoad, binding.soilBioAshLoadOffset, Float32Array);
    const soilBioTopSatOffset = inputOffset(state.soilBioTopSat, binding.soilBioTopSatOffset, Float32Array);
    const soilBioGroundwaterSatOffset = inputOffset(
      state.soilBioGroundwaterSat,
      binding.soilBioGroundwaterSatOffset,
      Float32Array
    );
    const soilBioLitterFastInputOffset = inputOffset(
      state.soilBioLitterFastInput,
      binding.soilBioLitterFastInputOffset,
      Float32Array
    );
    const soilBioLitterSlowInputOffset = inputOffset(
      state.soilBioLitterSlowInput,
      binding.soilBioLitterSlowInputOffset,
      Float32Array
    );
    const soilBioPlantNutrientUptakeOffset = inputOffset(
      state.soilBioPlantNutrientUptake,
      binding.soilBioPlantNutrientUptakeOffset,
      Float32Array
    );
    const litterCarbonNextOffset = outputOffset(state.litterCarbonN, binding.litterCarbonNextOffset);
    const litterFastCarbonNextOffset = outputOffset(state.litterFastCarbonN, binding.litterFastCarbonNextOffset);
    const litterSlowCarbonNextOffset = outputOffset(state.litterSlowCarbonN, binding.litterSlowCarbonNextOffset);
    const soilCarbonActiveNextOffset = outputOffset(state.soilCarbonActiveN, binding.soilCarbonActiveNextOffset);
    const soilCarbonStableNextOffset = outputOffset(state.soilCarbonStableN, binding.soilCarbonStableNextOffset);
    const soilMineralNNextOffset = outputOffset(state.soilMineralNN, binding.soilMineralNNextOffset);

    exports.sim_update_soil_biogeochemistry(
      size,
      activeCount,
      binding.activeOffset,
      constants.modelDtDays,
      substrateOffset,
      depthOffset,
      soilMineralNOffset,
      soilMineralTransportOffset,
      litterCarbonOffset,
      litterFastCarbonOffset,
      litterSlowCarbonOffset,
      soilCarbonActiveOffset,
      soilCarbonStableOffset,
      roseFertilityOffset,
      soilBioWetnessOffset,
      soilBioTempCOffset,
      soilBioAshLoadOffset,
      soilBioTopSatOffset,
      soilBioGroundwaterSatOffset,
      soilBioLitterFastInputOffset,
      soilBioLitterSlowInputOffset,
      soilBioPlantNutrientUptakeOffset,
      litterCarbonNextOffset,
      litterFastCarbonNextOffset,
      litterSlowCarbonNextOffset,
      soilCarbonActiveNextOffset,
      soilCarbonStableNextOffset,
      soilMineralNNextOffset
    );

    copyOutIfNeeded(state.litterCarbonN, litterCarbonNextOffset, Float32Array);
    copyOutIfNeeded(state.litterFastCarbonN, litterFastCarbonNextOffset, Float32Array);
    copyOutIfNeeded(state.litterSlowCarbonN, litterSlowCarbonNextOffset, Float32Array);
    copyOutIfNeeded(state.soilCarbonActiveN, soilCarbonActiveNextOffset, Float32Array);
    copyOutIfNeeded(state.soilCarbonStableN, soilCarbonStableNextOffset, Float32Array);
    copyOutIfNeeded(state.soilMineralNN, soilMineralNNextOffset, Float32Array);
    return true;
  }

  function runRichardsColumns(model, constants) {
    const { state, size } = model;
    const activeCellIds = model.activeCellIds;
    const activeCount = activeCellIds ? activeCellIds.length : size;
    const binding = getRichardsBinding(model);
    const writeDiagnostics = constants.writeDiagnostics ? 1 : 0;

    const substrateOffset = inputOffset(state.substrate, binding.substrateOffset, Uint8Array);
    const elevationOffset = inputOffset(state.elevation, binding.elevationOffset, Float32Array);
    const hOffset = inputOffset(state.H, binding.hOffset, Float32Array);
    const hNextOffset = outputOffset(state.Hn, binding.hNextOffset);
    const soilWaterOffset = inputOffset(state.soilWater, binding.soilWaterOffset, Float32Array);
    const soilWaterNextOffset = outputOffset(state.soilWaterN, binding.soilWaterNextOffset);
    const soilHeadOffset = inputOffset(state.soilHead, binding.soilHeadOffset, Float32Array);
    const soilHydraulicKOffset = inputOffset(state.soilHydraulicK, binding.soilHydraulicKOffset, Float32Array);
    const soilCapOffset = inputOffset(state.soilCap, binding.soilCapOffset, Float32Array);
    const soilThicknessOffset = inputOffset(state.soilThickness, binding.soilThicknessOffset, Float32Array);
    const soilResidualOffset = inputOffset(state.soilResidual, binding.soilResidualOffset, Float32Array);
    const groundwaterStorageOffset = inputOffset(state.groundwaterStorage, binding.groundwaterStorageOffset, Float32Array);
    const groundwaterStorageNextOffset = outputOffset(state.groundwaterStorageN, binding.groundwaterStorageNextOffset);
    const groundwaterCapOffset = inputOffset(state.groundwaterCap, binding.groundwaterCapOffset, Float32Array);
    const groundwaterHeadOffset = inputOffset(state.groundwaterHead, binding.groundwaterHeadOffset, Float32Array);
    const groundwaterThicknessOffset = inputOffset(state.groundwaterThickness, binding.groundwaterThicknessOffset, Float32Array);
    const hTransportOffset = inputOffset(state.Htransport, binding.hTransportOffset, Float32Array);
    const soilTransportOffset = inputOffset(state.soilTransport, binding.soilTransportOffset, Float32Array);
    const groundwaterTransportOffset = inputOffset(state.groundwaterTransport, binding.groundwaterTransportOffset, Float32Array);
    const hydrologyThroughfallOffset = inputOffset(state.hydrologyThroughfall, binding.hydrologyThroughfallOffset, Float32Array);
    const hydrologyVegFeedbackOffset = inputOffset(state.hydrologyVegFeedback, binding.hydrologyVegFeedbackOffset, Float32Array);
    const hydrologySink0Offset = inputOffset(state.hydrologySink0, binding.hydrologySink0Offset, Float32Array);
    const hydrologySink1Offset = inputOffset(state.hydrologySink1, binding.hydrologySink1Offset, Float32Array);
    const hydrologySink2Offset = inputOffset(state.hydrologySink2, binding.hydrologySink2Offset, Float32Array);
    const hydrologyGroundwaterSinkOffset = inputOffset(
      state.hydrologyGroundwaterSink,
      binding.hydrologyGroundwaterSinkOffset,
      Float32Array
    );
    const hydrologySurfaceEvapDemandMOffset = inputOffset(
      state.hydrologySurfaceEvapDemandM,
      binding.hydrologySurfaceEvapDemandMOffset,
      Float32Array
    );
    const groundwaterRechargeOffset = outputOffset(state.groundwaterRecharge, binding.groundwaterRechargeOffset);
    const hydrologyHorizontalMOffset = outputOffset(state.hydrologyHorizontalM, binding.hydrologyHorizontalMOffset);
    const hydrologyInfiltrationMOffset = outputOffset(state.hydrologyInfiltrationM, binding.hydrologyInfiltrationMOffset);
    const hydrologyPercolation01MOffset = outputOffset(state.hydrologyPercolation01M, binding.hydrologyPercolation01MOffset);
    const hydrologyPercolation12MOffset = outputOffset(state.hydrologyPercolation12M, binding.hydrologyPercolation12MOffset);
    const hydrologyRechargeMOffset = outputOffset(state.hydrologyRechargeM, binding.hydrologyRechargeMOffset);
    const hydrologyLeakageMOffset = outputOffset(state.hydrologyLeakageM, binding.hydrologyLeakageMOffset);
    const hydrologySurfaceEvapMOffset = outputOffset(state.hydrologySurfaceEvapM, binding.hydrologySurfaceEvapMOffset);
    if (activeCellIds && viewOffset(state.Hn) === null) {
      copyTo(hNextOffset, state.Hn, Float32Array);
      copyTo(soilWaterNextOffset, state.soilWaterN, Float32Array);
      copyTo(groundwaterStorageNextOffset, state.groundwaterStorageN, Float32Array);
    }
    if (writeDiagnostics && viewOffset(state.groundwaterRecharge) === null) {
      copyTo(groundwaterRechargeOffset, state.groundwaterRecharge, Float32Array);
      copyTo(hydrologyHorizontalMOffset, state.hydrologyHorizontalM, Float32Array);
      copyTo(hydrologyInfiltrationMOffset, state.hydrologyInfiltrationM, Float32Array);
      copyTo(hydrologyPercolation01MOffset, state.hydrologyPercolation01M, Float32Array);
      copyTo(hydrologyPercolation12MOffset, state.hydrologyPercolation12M, Float32Array);
      copyTo(hydrologyRechargeMOffset, state.hydrologyRechargeM, Float32Array);
      copyTo(hydrologyLeakageMOffset, state.hydrologyLeakageM, Float32Array);
      copyTo(hydrologySurfaceEvapMOffset, state.hydrologySurfaceEvapM, Float32Array);
    }

    exports.sim_richards_columns_update(
      size,
      activeCount,
      binding.activeOffset,
      constants.dtDays,
      constants.modelDtDays,
      writeDiagnostics,
      substrateOffset,
      elevationOffset,
      hOffset,
      hNextOffset,
      soilWaterOffset,
      soilWaterNextOffset,
      soilHeadOffset,
      soilHydraulicKOffset,
      soilCapOffset,
      soilThicknessOffset,
      soilResidualOffset,
      groundwaterStorageOffset,
      groundwaterStorageNextOffset,
      groundwaterCapOffset,
      groundwaterHeadOffset,
      groundwaterThicknessOffset,
      hTransportOffset,
      soilTransportOffset,
      groundwaterTransportOffset,
      hydrologyThroughfallOffset,
      hydrologyVegFeedbackOffset,
      hydrologySink0Offset,
      hydrologySink1Offset,
      hydrologySink2Offset,
      hydrologyGroundwaterSinkOffset,
      hydrologySurfaceEvapDemandMOffset,
      groundwaterRechargeOffset,
      hydrologyHorizontalMOffset,
      hydrologyInfiltrationMOffset,
      hydrologyPercolation01MOffset,
      hydrologyPercolation12MOffset,
      hydrologyRechargeMOffset,
      hydrologyLeakageMOffset,
      hydrologySurfaceEvapMOffset
    );

    copyOutIfNeeded(state.Hn, hNextOffset, Float32Array);
    copyOutIfNeeded(state.soilWaterN, soilWaterNextOffset, Float32Array);
    copyOutIfNeeded(state.groundwaterStorageN, groundwaterStorageNextOffset, Float32Array);
    if (writeDiagnostics) {
      copyOutIfNeeded(state.groundwaterRecharge, groundwaterRechargeOffset, Float32Array);
      copyOutIfNeeded(state.hydrologyHorizontalM, hydrologyHorizontalMOffset, Float32Array);
      copyOutIfNeeded(state.hydrologyInfiltrationM, hydrologyInfiltrationMOffset, Float32Array);
      copyOutIfNeeded(state.hydrologyPercolation01M, hydrologyPercolation01MOffset, Float32Array);
      copyOutIfNeeded(state.hydrologyPercolation12M, hydrologyPercolation12MOffset, Float32Array);
      copyOutIfNeeded(state.hydrologyRechargeM, hydrologyRechargeMOffset, Float32Array);
      copyOutIfNeeded(state.hydrologyLeakageM, hydrologyLeakageMOffset, Float32Array);
      copyOutIfNeeded(state.hydrologySurfaceEvapM, hydrologySurfaceEvapMOffset, Float32Array);
    }
    return true;
  }

  return Object.freeze({
    memory: exports.memory,
    bindModelState,
    runAdvanceAsh,
    runApplyWater,
    runAsteroidDaysideRain,
    buildRoseSeedDispersalKernel,
    runCanopyEnvironment,
    runCanopyEnvironmentPhotosynthesis,
    runCanopyOptics,
    runCleanAsh,
    runDarcyWaterColumns,
    runEarthCloudCover,
    runEarthRain,
    runEcosystemStep,
    runEcosystemStepsInPlace,
    runEcosystemStepsThreaded,
    runHydraulicState,
    runInitializeAsteroidProfile,
    runInitializeEarthProfile,
    runInitializeVegetationState,
    runPlantCarbonSeeds,
    runPlantWaterFluxes,
    runPrepareAndPhotosynthesis,
    runPreparePhotosynthesisInputs,
    runPhotosynthesis,
    runRainMemory,
    runRemoveBaobab,
    runRemoveRose,
    runRichardsColumns,
    runRoseSeedDispersal,
    runRoseSeedProductionAndDispersal,
    runSoilBiogeochemistry,
    runStableSurfaceWaterTransport,
    runSunlightField,
    runSurfaceNutrientTransport
  });
}
