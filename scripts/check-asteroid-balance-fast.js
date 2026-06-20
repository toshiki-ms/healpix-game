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

const abandonedAsteroid = createBalanceModel(ACTION_SCALE_CHECK_NSIDE);
const abandonedRoseCell = abandonedAsteroid.roseCellForCheck;
const abandonedBefore = visibleRose(abandonedAsteroid, abandonedRoseCell);
advanceBalanceModel(abandonedAsteroid, CHECK_DAYS, { sunlight: 0.7 });
const abandonedAfter = visibleRose(abandonedAsteroid, abandonedRoseCell);
assert.ok(
  abandonedAfter < abandonedBefore * 0.98,
  `unwatered asteroid rose should visibly decline under default dry conditions (${abandonedBefore} -> ${abandonedAfter})`
);

const baobabThreat = createBaobabThreatModel(ACTION_SCALE_CHECK_NSIDE);
const baobabThreatBefore = totalBaobabMass(baobabThreat);
advanceBalanceModel(baobabThreat, CHECK_DAYS, { sunlight: 0.72 });
const baobabThreatAfter = totalBaobabMass(baobabThreat);
assert.ok(
  baobabThreatAfter > baobabThreatBefore * 1.05,
  `default asteroid baobab should persist and grow as a management threat (${baobabThreatBefore} -> ${baobabThreatAfter})`
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

const favorableSpread = createBalanceModel(SEED_CHECK_NSIDE, {
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
setProductiveWetLoam(favorableSpread);
setRoseFertileNeighborhood(favorableSpread);
const favorableRoseCellsBefore = visibleRoseCellCount(favorableSpread);
advanceBalanceModel(favorableSpread, CHECK_DAYS, {
  sunlight: 0.85,
  waterCell: favorableSpread.roseCellForCheck,
  waterRateMDay: WATERING_RATE_M_DAY
});
const favorableRoseCellsAfter = visibleRoseCellCount(favorableSpread);
assert.ok(
  favorableRoseCellsAfter > favorableRoseCellsBefore,
  `favorable asteroid rose should be able to establish nearby cells by seed (${favorableRoseCellsBefore} -> ${favorableRoseCellsAfter})`
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
    terrainCode[cell.id] = cell.id === roseCell ? 7 : 0;
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

function setRoseFertileNeighborhood(model, value = 1.75) {
  const roseCell = model.roseCellForCheck;
  model.state.roseFertility[roseCell] = value;
  for (const direction of model.topology.directions) {
    const neighbor = model.topology.neighbor(roseCell, direction);
    if (Number.isInteger(neighbor) && neighbor >= 0) {
      model.state.roseFertility[neighbor] = value;
    }
  }
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

function advanceBalanceModel(model, days, options = {}) {
  const steps = Math.ceil(days / MODEL_DT_DAYS);
  const sunlight = options.sunlight ?? 0.7;
  for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
    model.state.sunlight.fill(sunlight);
    if (Number.isInteger(options.waterCell) && options.waterRateMDay > 0) {
      model.applyWater(
        [options.waterCell],
        options.waterRateMDay * MODEL_DT_DAYS,
        options.waterRateMDay,
        MODEL_DT_DAYS
      );
    }
    model.step();
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

function visibleRoseCellCount(model) {
  const flower = new Float32Array(model.size);
  const baobab = new Float32Array(model.size);
  const moisture = new Float32Array(model.size);
  const soil = new Float32Array(model.size);
  const roseHeight = new Float32Array(model.size);
  model.syncToGame({ flower, baobab, moisture, soil, roseHeight }, { detail: false });
  let count = 0;
  for (let i = 0; i < model.size; i += 1) {
    if (Math.max(flower[i], roseHeight[i]) > 0.08) {
      count += 1;
    }
  }
  return count;
}

function createBaobabThreatModel(nside) {
  const model = createBalanceModel(nside, {
    annualPrecipMm: 70,
    dryDays: 340,
    evaporation: 1.25,
    baobabGrowth: 1
  });
  const cellId = findDryBaobabCell(model.topology, model.roseCellForCheck);
  model.state.baobabRisk[cellId] = 0.88;
  model.state.baobabLeaf[cellId] = 0.045;
  model.state.baobabStem[cellId] = 0.075;
  model.state.baobabRoot[cellId] = 0.09;
  model.state.baobabStore[cellId] = 0.018;
  model.state.baobabSeed[cellId] = 0.035;
  model.state.MB[cellId] =
    model.state.baobabLeaf[cellId] +
    model.state.baobabStem[cellId] +
    model.state.baobabRoot[cellId];
  return model;
}

function findDryBaobabCell(topology, roseCell) {
  let bestId = 0;
  let bestScore = -Infinity;
  const rose = topology.cells[roseCell];
  for (const cell of topology.cells) {
    if (cell.id === roseCell) {
      continue;
    }
    const separation =
      rose
        ? Math.acos(Math.max(-1, Math.min(1,
            cell.normal[0] * rose.normal[0] + cell.normal[1] * rose.normal[1] + cell.normal[2] * rose.normal[2]
          )))
        : 0;
    const score = separation + Math.abs(cell.height) * 0.25 + ((cell.id * 1103515245 + 12345) >>> 0) * 1e-12;
    if (score > bestScore) {
      bestScore = score;
      bestId = cell.id;
    }
  }
  return bestId;
}

function totalBaobabMass(model) {
  let total = 0;
  for (let i = 0; i < model.size; i += 1) {
    total += model.state.MB[i] ?? 0;
  }
  return total;
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
