import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadAsteroidSimulationCoreFromBytes, resetLoadedAsteroidSimulationCore } from "../src/asteroid-sim-core.js";
import {
  __asteroidVegetationDiagnostics,
  createAsteroidVegetationModel,
  MODEL_DT_DAYS
} from "../src/asteroid-vegetation.js";
import { createHealpixTopology } from "../src/healpix.js";

const repoRoot = resolve(import.meta.dirname, "..");
const wasmPath = resolve(repoRoot, "public/assets/sim/asteroid_sim.wasm");
const CHECK_NSIDE = 16;
const SEED_CHECK_NSIDE = 64;
const CHECK_DAYS = 30;
const ACTION_SCALE_CHECK_NSIDE = 64;
const ACTION_SCALE_CHECK = 80;
const WATERING_RATE_M_DAY = 0.008;

await loadAsteroidSimulationCoreFromBytes(readFileSync(wasmPath));

const watered = createBalanceModel(CHECK_NSIDE);
const roseCell = watered.roseCellForCheck;
const wateredBefore = visibleRose(watered, roseCell);
let wateredMinimum = wateredBefore;
for (let stepIndex = 0; stepIndex < Math.ceil(CHECK_DAYS / MODEL_DT_DAYS); stepIndex += 1) {
  if (stepIndex % 16 === 0) {
    watered.applyWater([roseCell], 0.018);
  }
  watered.state.sunlight.fill(0.7);
  watered.step();
  wateredMinimum = Math.min(wateredMinimum, visibleRose(watered, roseCell));
}
const wateredAfter = visibleRose(watered, roseCell);
assert.ok(
  wateredAfter >= wateredBefore * 0.9,
  `watered rose should keep user-visible biomass for ${CHECK_DAYS} model days (${wateredBefore} -> ${wateredAfter})`
);
assert.ok(
  wateredMinimum >= wateredBefore * 0.86,
  `watered rose should not temporarily collapse during the balance check (${wateredBefore} -> min ${wateredMinimum})`
);

const actionScaledWatered = createBalanceModel(ACTION_SCALE_CHECK_NSIDE);
const actionScaledRoseCell = actionScaledWatered.roseCellForCheck;
const actionScaledBefore = visibleRose(actionScaledWatered, actionScaledRoseCell);
for (let stepIndex = 0; stepIndex < ACTION_SCALE_CHECK; stepIndex += 1) {
  actionScaledWatered.applyWater(
    [actionScaledRoseCell],
    WATERING_RATE_M_DAY * MODEL_DT_DAYS,
    WATERING_RATE_M_DAY,
    MODEL_DT_DAYS
  );
  actionScaledWatered.state.sunlight.fill(0.7);
  actionScaledWatered.step();
}
const actionScaledAfter = visibleRose(actionScaledWatered, actionScaledRoseCell);
assert.ok(
  actionScaledAfter >= actionScaledBefore * 0.88,
  `nside=${ACTION_SCALE_CHECK_NSIDE} actionScale=${ACTION_SCALE_CHECK} water should not collapse visible rose (${actionScaledBefore} -> ${actionScaledAfter})`
);

const seeded = createBalanceModel(SEED_CHECK_NSIDE, {
  annualPrecipMm: 720,
  dryDays: 85,
  rainPatchiness: 0.32,
  rainScale: 32,
  asteroidMeanTempC: 21,
  asteroidDiurnalRangeC: 6,
  asteroidLatitudeTempRangeC: 1,
  evaporation: 0.68,
  rootDepth: 6,
  shade: 0.55,
  roseGrowth: 1.35,
  baobabGrowth: 1,
  storage: 1.35,
  atmosphericCo2Ppm: 420
});
setProductiveWetLoam(seeded);
seeded.state.sunlight.fill(0.85);
seeded.state.roseFertility[seeded.roseCellForCheck] = 1.75;
seeded.step();
const seedStats = __asteroidVegetationDiagnostics.roseSeedDispersalStats(seeded, seeded.roseCellForCheck);
assert.ok(
  seeded.state.roseSeedProduction[seeded.roseCellForCheck] > 0,
  "favorable rose should produce seed in the integrated WASM ecosystem step"
);
let totalSeedArrival = 0;
for (let i = 0; i < seeded.size; i += 1) {
  totalSeedArrival += seeded.state.roseSeedArrival[i] ?? 0;
}
assert.ok(
  Math.abs(totalSeedArrival - seeded.state.roseSeedProduction[seeded.roseCellForCheck]) <= 1e-8,
  `rose seed arrival should conserve produced seed (production ${seeded.state.roseSeedProduction[seeded.roseCellForCheck]}, total arrival ${totalSeedArrival})`
);
assert.ok(
  seedStats.anyOffProbability > 0,
  `rose seed dispersal kernel should allow off-source arrival at nside=${SEED_CHECK_NSIDE}`
);

resetLoadedAsteroidSimulationCore();
console.log("fast asteroid balance checks passed");

function createBalanceModel(nside, paramOverrides = {}) {
  const topology = createHealpixTopology(nside);
  const size = topology.cells.length;
  const roseCell = findEquatorialCell(topology);
  const terrain = new Array(size).fill("sand");
  terrain[roseCell] = "rose";

  const terrainCode = new Uint8Array(size);
  const cellHeight = new Float32Array(size);
  const cellPhi = new Float32Array(size);
  const climateMeanTempC = new Float32Array(size);
  const climateDiurnalRangeC = new Float32Array(size);
  const rainClimatology = new Float32Array(size).fill(1);
  for (const cell of topology.cells) {
    terrainCode[cell.id] = cell.id === roseCell ? 5 : 0;
    cellHeight[cell.id] = cell.height;
    cellPhi[cell.id] = cell.phi;
    climateMeanTempC[cell.id] = 18;
    climateDiurnalRangeC[cell.id] = 8;
  }

  const flower = new Float32Array(size);
  flower[roseCell] = 0.42;
  const roseGardenMask = new Uint8Array(size);
  roseGardenMask[roseCell] = 1;

  const model = createAsteroidVegetationModel(topology, {
    terrain,
    moisture: new Float32Array(size).fill(0.34),
    soil: new Float32Array(size).fill(0.58),
    flower,
    ash: new Float32Array(size),
    baobab: new Float32Array(size),
    roseCell,
    roseGardenMask,
    planetPreset: "asteroid",
    volcanoCells: [],
    activeVolcanoCells: [],
    baobabRisk: new Float32Array(size),
    baobabBlocked: new Uint8Array(size),
    elevation: new Float32Array(size),
    terrainCode,
    cellHeight,
    cellPhi,
    climateMeanTempC,
    climateDiurnalRangeC,
    rainClimatology,
    seededNoise: () => 0.5,
    params: {
      annualPrecipMm: 70,
      dryDays: 300,
      rainPatchiness: 0.45,
      rainScale: 18,
      evaporation: 1.25,
      gwFlow: 0.006,
      rootDepth: 4.6,
      shade: 0.45,
      roseGrowth: 1,
      storage: 1.12,
      atmosphericCo2Ppm: 430,
      ...paramOverrides
    }
  });
  model.roseCellForCheck = roseCell;
  model.setDiagnosticsEnabled(false);
  setProductiveWetLoam(model, 0.08, 0.08);
  model.state.roseFertility[roseCell] = 1.35;
  model.state.roseLeaf[roseCell] = 0.42 * 0.38;
  model.state.roseFlower[roseCell] = 0.42 * 0.05;
  model.state.roseRoot[roseCell] = 0.42 * 0.57;
  model.state.roseStore[roseCell] = 0.42 * 0.12;
  model.state.MR[roseCell] = model.state.roseLeaf[roseCell] + model.state.roseFlower[roseCell] + model.state.roseRoot[roseCell];
  return model;
}

function setProductiveWetLoam(model, soilWater = 0.08, groundwater = 0.08) {
  model.state.substrate.fill(0);
  model.state.soilMineralN.fill(0.9);
  for (let layer = 0; layer < 3; layer += 1) {
    fillSoilLayer(model, layer, soilWater);
  }
  fillSoilLayer(model, 3, groundwater);
}

function fillSoilLayer(model, layer, value) {
  if (layer === 3) {
    model.state.groundwaterStorage.fill(value);
    model.state.W1.fill(value);
    return;
  }
  const offset = layer * model.size;
  model.state.soilWater.fill(value, offset, offset + model.size);
  if (layer === 0) {
    model.state.W0.fill(value);
  }
}

function visibleRose(model, cellId) {
  const flower = new Float32Array(model.size);
  const baobab = new Float32Array(model.size);
  const moisture = new Float32Array(model.size);
  const soil = new Float32Array(model.size);
  const roseHeight = new Float32Array(model.size);
  model.syncToGame({ flower, baobab, moisture, soil, roseHeight }, { detail: false });
  return flower[cellId];
}

function findEquatorialCell(topology) {
  let bestId = 0;
  let bestScore = Infinity;
  for (const cell of topology.cells) {
    const score = Math.abs(cell.height) + Math.abs(cell.phi) * 0.05;
    if (score < bestScore) {
      bestScore = score;
      bestId = cell.id;
    }
  }
  return bestId;
}
