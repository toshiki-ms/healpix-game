import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BLACK,
  EMPTY,
  WHITE,
  applyMove,
  chooseAiMove,
  countPieces,
  createInitialState,
  flipsForMove,
  passTurn,
  validMoves
} from "./game.js";
import {
  analyzeGoMove,
  applyGoMove,
  chooseGoNpcMove,
  classifyGoTerritory,
  createGoState,
  createPoleSet,
  passGoTurn,
  resumeGoGame,
  scoreGoGame,
  toggleDeadGroup,
  validGoMoves
} from "./go-game.js";
import { HEALPIX_BOUNDARY_SEGMENTS_NSIDE2 } from "./healpix-boundaries-nside2.js";
import {
  loadAsteroidSimulationCoreFromBytes,
  resetLoadedAsteroidSimulationCore,
  runWasmCleanAsh,
  runWasmSunlightField
} from "./asteroid-sim-core.js";
import { createHealpixTopology, createHealpixVertexTopology, pixelCount } from "./healpix.js";
import { __asteroidVegetationDiagnostics, createAsteroidVegetationModel, MODEL_DT_DAYS } from "./asteroid-vegetation.js";

const simulationWasmPath = resolve(import.meta.dirname, "../public/assets/sim/asteroid_sim.wasm");

async function loadSimulationCoreForAction() {
  await loadAsteroidSimulationCoreFromBytes(readFileSync(simulationWasmPath));
}

function bruteValidMoves(topology, board, player) {
  const moves = [];

  for (const cell of topology.cells) {
    const flips = flipsForMove(topology, board, cell.id, player);
    if (flips.length > 0) {
      moves.push({ cellId: cell.id, flips });
    }
  }

  return moves;
}

function moveIds(moves) {
  return moves.map((move) => move.cellId);
}

await loadSimulationCoreForAction();
{
  const ash = new Float32Array([0.62, 0.3, 0]);
  const affected = runWasmCleanAsh(ash, new Int32Array([0, 1]), new Float32Array([1, 0.72]), 0.78, 0.01);
  assert.deepEqual(affected, [0], "ash cleaning should report the cells updated by the C/WASM kernel");
  assert.ok(ash[0] < 0.62, "ash cleaning should reduce the selected cell in C/WASM");
  assert.ok(ash[1] <= 0.300001, "ash cleaning should not increase neighboring ash");

  const normals = new Float32Array([
    0, 0, 1,
    0, 0, -1,
    1, 0, 0
  ]);
  const sunlight = new Float32Array(3);
  assert.equal(
    runWasmSunlightField(normals, sunlight, {
      roseCell: 0,
      turn: 2,
      turnsPerDay: 8,
      modelTimeOffsetDays: 0,
      modelDurationDays: 0,
      sampleCount: 1
    }),
    true,
    "sunlight field should be updated by the C/WASM kernel"
  );
  assert.ok(sunlight[0] > 0.999, "rose-normal cell should receive overhead sunlight at local noon");
  assert.ok(sunlight[1] < 0.001, "opposite cell should remain dark at local noon");
}
resetLoadedAsteroidSimulationCore();
await loadSimulationCoreForAction();

function createVegetationTestModel(nside, elevation = null, paramOverrides = {}) {
  const testTopology = createHealpixTopology(nside);
  const count = testTopology.cells.length;
  const terrainCode = new Uint8Array(count);
  const cellHeight = new Float32Array(count);
  const cellPhi = new Float32Array(count);
  const climateMeanTempC = new Float32Array(count);
  const climateDiurnalRangeC = new Float32Array(count);
  const rainClimatology = new Float32Array(count).fill(1);
  for (const cell of testTopology.cells) {
    terrainCode[cell.id] = 0;
    cellHeight[cell.id] = cell.height;
    cellPhi[cell.id] = cell.phi;
  }
  const model = createAsteroidVegetationModel(testTopology, {
    terrain: new Array(count).fill("sand"),
    moisture: new Float32Array(count).fill(0.2),
    soil: new Float32Array(count).fill(0.48),
    flower: new Float32Array(count),
    ash: new Float32Array(count),
    baobab: new Float32Array(count),
    roseCell: 0,
    roseGardenMask: new Uint8Array(count),
    planetPreset: "asteroid",
    volcanoCells: [],
    activeVolcanoCells: [],
    baobabRisk: new Float32Array(count),
    baobabBlocked: new Uint8Array(count),
    elevation: elevation ?? new Float32Array(count),
    terrainCode,
    cellHeight,
    cellPhi,
    climateMeanTempC,
    climateDiurnalRangeC,
    rainClimatology,
    seededNoise: () => 0.5,
    params: {
      annualPrecipMm: 0,
      dryDays: 350,
      rainPatchiness: 0,
      rainScale: 18,
      evaporation: 1,
      gwFlow: 0.006,
      rootDepth: 4.6,
      shade: 1,
      roseGrowth: 1,
      storage: 1,
      ...paramOverrides
    }
  });
  model.setDiagnosticsEnabled(true);
  return model;
}

await loadSimulationCoreForAction();
{
  const model = createVegetationTestModel(2);
  const normals = new Float32Array(model.topology.cells.length * 3);
  for (const cell of model.topology.cells) {
    const offset = cell.id * 3;
    const x = cell.normal[0];
    const y = cell.normal[2];
    const z = cell.normal[1];
    const length = Math.hypot(x, y, z) || 1;
    normals[offset] = x / length;
    normals[offset + 1] = y / length;
    normals[offset + 2] = z / length;
  }
  model.setDiagnosticsEnabled(false);
  model.state.sunlight.fill(0);
  model.step({
    sunlightNormals: normals,
    sunlightRoseCell: 0,
    sunlightTurn: 2,
    sunlightTurnsPerDay: 8,
    sunlightModelTimeOffsetDays: 0,
    sunlightModelDurationDays: 0,
    sunlightSampleCount: 1
  });
  assert.ok(
    model.state.sunlight[0] > 0.99,
    "integrated C/WASM ecosystem step should update sunlight when a sunlight context is provided"
  );
}
resetLoadedAsteroidSimulationCore();
await loadSimulationCoreForAction();

function createSeedDispersalDiagnosticModel(nside) {
  const topology = createHealpixTopology(nside);
  const radiusM = 6_371_000;
  return {
    topology,
    radiusM,
    cellSizeM: radiusM * Math.sqrt((4 * Math.PI) / topology.cells.length),
    state: {
      landActive: new Uint8Array(topology.cells.length).fill(1)
    }
  };
}

function assertRbfFdConstantDerivativeIsZero(model) {
  const { operators } = model;
  let maxLap = 0;
  let maxGx = 0;
  let maxGy = 0;
  for (let i = 0; i < model.size; i += 1) {
    const offset = i * operators.m;
    let lap = 0;
    let gx = 0;
    let gy = 0;
    for (let k = 0; k < operators.m; k += 1) {
      lap += operators.lapW[offset + k];
      gx += operators.gxW[offset + k];
      gy += operators.gyW[offset + k];
    }
    maxLap = Math.max(maxLap, Math.abs(lap));
    maxGx = Math.max(maxGx, Math.abs(gx));
    maxGy = Math.max(maxGy, Math.abs(gy));
  }

  assert.ok(maxLap < 1e-9, `constant-field Laplacian should vanish, got ${maxLap}`);
  assert.ok(maxGx < 1e-9, `constant-field x-gradient should vanish, got ${maxGx}`);
  assert.ok(maxGy < 1e-9, `constant-field y-gradient should vanish, got ${maxGy}`);
}

function soilLayerOffset(model, layer) {
  return layer * model.size;
}

function fillSoilLayer(model, layer, value) {
  if (layer === 3) {
    model.state.groundwaterStorage.fill(value);
    model.state.W1.fill(value);
    return;
  }
  const offset = soilLayerOffset(model, layer);
  model.state.soilWater.fill(value, offset, offset + model.size);
  if (layer === 0) {
    model.state.W0.fill(value);
  }
}

function setSoilLayer(model, cellId, layer, value) {
  if (layer === 3) {
    model.state.groundwaterStorage[cellId] = value;
    model.state.W1[cellId] = value;
    return;
  }
  model.state.soilWater[soilLayerOffset(model, layer) + cellId] = value;
  if (layer === 0) {
    model.state.W0[cellId] = value;
  }
}

function setProductiveWetLoam(model, soilWater = 0.08, groundwater = 0.08) {
  model.state.substrate.fill(0);
  model.state.soilMineralN.fill(0.9);
  for (let layer = 0; layer < 3; layer += 1) {
    fillSoilLayer(model, layer, soilWater);
  }
  fillSoilLayer(model, 3, groundwater);
}

function fillSoilLayerFraction(model, layer, fraction) {
  for (let cellId = 0; cellId < model.size; cellId += 1) {
    if (layer === 3) {
      const cap = __asteroidVegetationDiagnostics.groundwaterCapacityForCell(model, cellId);
      setSoilLayer(model, cellId, layer, cap * fraction);
    } else {
      const cap = __asteroidVegetationDiagnostics.soilLayerCapacityForCell(model, cellId, layer);
      setSoilLayer(model, cellId, layer, cap * fraction);
    }
  }
}

function createVisibleVegetationState(model) {
  return {
    moisture: new Float32Array(model.size),
    soil: new Float32Array(model.size),
    baobab: new Float32Array(model.size),
    flower: new Float32Array(model.size),
    roseHeight: new Float32Array(model.size)
  };
}

function zeroVegetationPools(model) {
  for (const key of [
    "baobabLeaf",
    "baobabStem",
    "baobabRoot",
    "baobabStore",
    "baobabSeed",
    "roseLeaf",
    "roseFlower",
    "roseRoot",
    "roseStore",
    "roseSeed",
    "MB",
    "MR",
    "SB"
  ]) {
    model.state[key].fill(0);
  }
}

function cellEcosystemCarbon(model, cellId) {
  const state = model.state;
  return (
    state.baobabLeaf[cellId] +
    state.baobabStem[cellId] +
    state.baobabRoot[cellId] +
    state.baobabStore[cellId] +
    state.baobabSeed[cellId] +
    state.roseLeaf[cellId] +
    state.roseFlower[cellId] +
    state.roseRoot[cellId] +
    state.roseStore[cellId] +
    state.roseSeed[cellId] +
    state.litterFastCarbon[cellId] +
    state.litterSlowCarbon[cellId] +
    state.soilCarbonActive[cellId] +
    state.soilCarbonStable[cellId]
  );
}

const topology = createHealpixTopology(2);
assert.equal(topology.cells.length, pixelCount(2));
assert.equal(
  HEALPIX_BOUNDARY_SEGMENTS_NSIDE2.length,
  2 * pixelCount(2) * 4 * 6,
  "HEALPix NSIDE=2 boundary data should contain 384 XYZ line segments"
);
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12);
closeTo(topology.cells[1].normal[0], 0.2852353895437616);
closeTo(topology.cells[1].normal[1], 2 / 3);
closeTo(topology.cells[1].normal[2], 0.6886191459053213);
assert.deepEqual(
  topology.directions.map((direction) => topology.neighbor(0, direction)),
  [17, 19, 2, 3, 1, 23, 22, 35],
  "HEALPix NESTED direction order should be SW, W, NW, N, NE, E, SE, S"
);
assert.deepEqual(
  topology.directions.map((direction) => topology.neighbor(5, direction) ?? -1),
  [4, 6, 7, 11, 10, -1, 27, 26],
  "NESTED face-corner transitions should preserve missing neighbours"
);
assert.deepEqual(
  topology.directions.map((direction) => topology.neighbor(47, direction) ?? -1),
  [46, 28, 29, 12, 18, 16, 45, 44],
  "NESTED south-cap transitions should wrap across base faces"
);

const vegetationDiagnostic = createVegetationTestModel(4);
assertRbfFdConstantDerivativeIsZero(vegetationDiagnostic);
const diagnosticCell = vegetationDiagnostic.topology.cellAt(7, 8) ?? 0;
const diagnosticCenter = vegetationDiagnostic.topology.cells[diagnosticCell];
const diagnosticEast = [-Math.sin(diagnosticCenter.phi), 0, Math.cos(diagnosticCenter.phi)];
const eastLength = Math.hypot(...diagnosticEast);
diagnosticEast[0] /= eastLength;
diagnosticEast[2] /= eastLength;
const diagnosticNorth = [
  diagnosticEast[1] * diagnosticCenter.normal[2] - diagnosticEast[2] * diagnosticCenter.normal[1],
  diagnosticEast[2] * diagnosticCenter.normal[0] - diagnosticEast[0] * diagnosticCenter.normal[2],
  diagnosticEast[0] * diagnosticCenter.normal[1] - diagnosticEast[1] * diagnosticCenter.normal[0]
];
const northLength = Math.hypot(...diagnosticNorth);
diagnosticNorth[0] /= northLength;
diagnosticNorth[1] /= northLength;
diagnosticNorth[2] /= northLength;
const diagnosticLinear = new Float64Array(vegetationDiagnostic.size);
const diagnosticQuadratic = new Float64Array(vegetationDiagnostic.size);
for (const cell of vegetationDiagnostic.topology.cells) {
  const delta = [
    cell.normal[0] - diagnosticCenter.normal[0],
    cell.normal[1] - diagnosticCenter.normal[1],
    cell.normal[2] - diagnosticCenter.normal[2]
  ];
  const dx = delta[0] * diagnosticEast[0] + delta[1] * diagnosticEast[1] + delta[2] * diagnosticEast[2];
  const dy = delta[0] * diagnosticNorth[0] + delta[1] * diagnosticNorth[1] + delta[2] * diagnosticNorth[2];
  diagnosticLinear[cell.id] = 0.7 * dx - 0.4 * dy;
  diagnosticQuadratic[cell.id] = dx * dx + dy * dy;
}
assert.ok(
  Math.abs(__asteroidVegetationDiagnostics.lap(vegetationDiagnostic, diagnosticLinear, diagnosticCell)) < 1e-8,
  "RBF-FD Laplacian should vanish for a local linear field"
);
assert.ok(
  __asteroidVegetationDiagnostics.lap(vegetationDiagnostic, diagnosticQuadratic, diagnosticCell) > 0,
  "RBF-FD Laplacian should be positive for a local convex quadratic field"
);
const sphericalHarmonicDiagnostic = createVegetationTestModel(16);
for (let axis = 0; axis < 3; axis += 1) {
  const field = new Float64Array(sphericalHarmonicDiagnostic.size);
  for (const cell of sphericalHarmonicDiagnostic.topology.cells) {
    field[cell.id] = cell.normal[axis];
  }
  let error2 = 0;
  let expected2 = 0;
  const inverseRadius2 = 1 / (sphericalHarmonicDiagnostic.radiusM * sphericalHarmonicDiagnostic.radiusM);
  for (const cell of sphericalHarmonicDiagnostic.topology.cells) {
    const expected = -2 * cell.normal[axis] * inverseRadius2;
    const actual = __asteroidVegetationDiagnostics.lap(sphericalHarmonicDiagnostic, field, cell.id);
    const error = actual - expected;
    error2 += error * error;
    expected2 += expected * expected;
  }
  const relativeError = Math.sqrt(error2 / expected2);
  assert.ok(
    relativeError < 0.02,
    `RBF-poly-FD Laplace-Beltrami should reproduce l=1 spherical harmonic axis ${axis}; got ${relativeError}`
  );
}
const diagnosticHead = new Float64Array(vegetationDiagnostic.size);
const diagnosticTransmissivity = new Float64Array(vegetationDiagnostic.size).fill(0.02);
const diagnosticDarcy = new Float64Array(vegetationDiagnostic.size);
for (const cell of vegetationDiagnostic.topology.cells) {
  const delta = [
    cell.normal[0] - diagnosticCenter.normal[0],
    cell.normal[1] - diagnosticCenter.normal[1],
    cell.normal[2] - diagnosticCenter.normal[2]
  ];
  const dx = delta[0] * diagnosticEast[0] + delta[1] * diagnosticEast[1] + delta[2] * diagnosticEast[2];
  const dy = delta[0] * diagnosticNorth[0] + delta[1] * diagnosticNorth[1] + delta[2] * diagnosticNorth[2];
  diagnosticHead[cell.id] = -(dx * dx + dy * dy);
}
__asteroidVegetationDiagnostics.transportDarcyRbf(
  vegetationDiagnostic,
  diagnosticHead,
  diagnosticTransmissivity,
  diagnosticDarcy
);
assert.ok(
  diagnosticDarcy[diagnosticCell] < 0,
  "Darcy RBF-FD divergence should drain a local hydraulic-head maximum"
);

const roseSeedDispersalStatsByNside = new Map();
for (const nside of [2, 4, 16, 32, 64]) {
  const seedModel = createSeedDispersalDiagnosticModel(nside);
  const sourceCell = seedModel.topology.cellAt(nside * 2, nside * 2) ?? Math.floor(seedModel.topology.cells.length / 2);
  roseSeedDispersalStatsByNside.set(
    nside,
    __asteroidVegetationDiagnostics.roseSeedDispersalStats(seedModel, sourceCell)
  );
}
assert.ok(
  roseSeedDispersalStatsByNside.get(2).offCohortProbability > 0,
  "rose seed dispersal probability should not be hard-zero at nside=2"
);
assert.ok(
  roseSeedDispersalStatsByNside.get(2).anyOffProbability < 1e-40,
  "rose seed dispersal should be effectively local at nside=2"
);
assert.ok(
  roseSeedDispersalStatsByNside.get(16).anyOffProbability > 0 &&
    roseSeedDispersalStatsByNside.get(16).anyOffProbability < 1e-4,
  "rose seed dispersal should be possible but very rare at nside=16"
);
assert.ok(
  roseSeedDispersalStatsByNside.get(32).anyOffProbability > 0.001 &&
    roseSeedDispersalStatsByNside.get(32).anyOffProbability < 0.02,
  "rose seed dispersal should become occasional at nside=32"
);
assert.ok(
  roseSeedDispersalStatsByNside.get(64).anyOffProbability > 0.15 &&
    roseSeedDispersalStatsByNside.get(64).anyOffProbability < 0.45,
  "rose seed dispersal should become visibly stochastic but not automatic at nside=64"
);
const roseSeedSamplingModel = createSeedDispersalDiagnosticModel(64);
const roseSeedSamplingSource =
  roseSeedSamplingModel.topology.cellAt(128, 128) ?? Math.floor(roseSeedSamplingModel.topology.cells.length / 2);
const roseSeedSamplingExpected = __asteroidVegetationDiagnostics.roseSeedDispersalStats(
  roseSeedSamplingModel,
  roseSeedSamplingSource
);
const roseSeedSamplingObserved = __asteroidVegetationDiagnostics.sampleRoseSeedDispersal(
  roseSeedSamplingModel,
  roseSeedSamplingSource,
  8000,
  99173
);
assert.ok(
  Math.abs(roseSeedSamplingObserved.anyOffTrialRate - roseSeedSamplingExpected.anyOffProbability) < 0.025,
  "sampled rose seed dispersal frequency should match the kernel probability"
);

{
  const topology64 = createHealpixTopology(64);
  const count64 = topology64.cells.length;
  const roseCell64 = topology64.cellAt(128, 128) ?? 0;
  const roseGardenMask64 = new Uint8Array(count64);
  const flower64 = new Float32Array(count64);
  const moisture64 = new Float32Array(count64).fill(0.42);
  const soil64 = new Float32Array(count64).fill(0.58);
  const terrainCode64 = new Uint8Array(count64);
  const cellHeight64 = new Float32Array(count64);
  const cellPhi64 = new Float32Array(count64);
  const rainClimatology64 = new Float32Array(count64).fill(1);
  for (const cell of topology64.cells) {
    terrainCode64[cell.id] = 0;
    cellHeight64[cell.id] = cell.height;
    cellPhi64[cell.id] = cell.phi;
  }
  flower64[roseCell64] = 0.85;
  roseGardenMask64[roseCell64] = 1;
  for (const direction of topology64.directions) {
    const neighbor = topology64.neighbor(roseCell64, direction);
    if (neighbor !== null && neighbor !== undefined) {
      roseGardenMask64[neighbor] = 1;
      moisture64[neighbor] = 0.62;
      soil64[neighbor] = 0.74;
    }
  }
  const roseInitModel64 = createAsteroidVegetationModel(topology64, {
    terrain: new Array(count64).fill("sand"),
    moisture: moisture64,
    soil: soil64,
    flower: flower64,
    ash: new Float32Array(count64),
    baobab: new Float32Array(count64),
    roseCell: roseCell64,
    roseGardenMask: roseGardenMask64,
    planetPreset: "asteroid",
    volcanoCells: [],
    activeVolcanoCells: [],
    baobabRisk: new Float32Array(count64),
    baobabBlocked: new Uint8Array(count64),
    elevation: new Float32Array(count64),
    terrainCode: terrainCode64,
    cellHeight: cellHeight64,
    cellPhi: cellPhi64,
    climateMeanTempC: new Float32Array(count64),
    climateDiurnalRangeC: new Float32Array(count64),
    rainClimatology: rainClimatology64,
    seededNoise: () => 0.5,
    params: {}
  });
  let adultRoseCellCount = 0;
  let gardenSoilOnlyCellCount = 0;
  for (let cellId = 0; cellId < count64; cellId += 1) {
    const adultRose =
      roseInitModel64.state.roseLeaf[cellId] +
      roseInitModel64.state.roseFlower[cellId] +
      roseInitModel64.state.roseRoot[cellId];
    if (adultRose > 1e-8) {
      adultRoseCellCount += 1;
    }
    if (cellId !== roseCell64 && roseGardenMask64[cellId] === 1 && adultRose <= 1e-8) {
      gardenSoilOnlyCellCount += 1;
    }
  }
  assert.equal(adultRoseCellCount, 1, "asteroid should start with one adult rose cell even when neighboring garden soil exists");
  assert.ok(gardenSoilOnlyCellCount > 0, "asteroid rose garden neighbors should remain soil/fertility patches, not initial adult roses");
}

const downhillTopology = createHealpixTopology(4);
const downhillCount = downhillTopology.cells.length;
const downhillSource = downhillTopology.cellAt(8, 8) ?? 0;
const downhillTarget = downhillTopology.directions
  .map((direction) => downhillTopology.neighbor(downhillSource, direction))
  .find((cellId) => cellId !== null && cellId !== undefined);
const downhillElevation = new Float32Array(downhillCount).fill(400);
downhillElevation[downhillSource] = 1200;
downhillElevation[downhillTarget] = 0;
const downhillModel = createVegetationTestModel(4, downhillElevation);
downhillModel.state.H.fill(0);
fillSoilLayer(downhillModel, 0, 0.01);
downhillModel.state.H[downhillSource] = 0.04;
downhillModel.step();
const downhillNeighborMax = Math.max(
  ...downhillTopology.directions
    .map((direction) => downhillTopology.neighbor(downhillSource, direction))
    .filter((cellId) => cellId !== null && cellId !== undefined && cellId !== downhillTarget)
    .map((cellId) => downhillModel.state.H[cellId])
);
assert.ok(downhillModel.state.H[downhillTarget] > 0, "RBF-FD terrain advection should move surface water downhill");
assert.ok(
  downhillModel.state.H[downhillTarget] > downhillNeighborMax,
  "RBF-FD terrain advection should preferentially move water toward the lowest neighbouring cell"
);
assert.ok(downhillModel.state.H[downhillSource] < 0.04, "RBF-FD terrain advection should reduce surface water at the high cell");

const richardsModel = createVegetationTestModel(4);
const richardsCell = 50;
richardsModel.state.H.fill(0);
fillSoilLayer(richardsModel, 0, 0.005);
fillSoilLayer(richardsModel, 1, 0.018);
fillSoilLayer(richardsModel, 2, 0.018);
fillSoilLayer(richardsModel, 3, 0.018);
setSoilLayer(richardsModel, richardsCell, 0, 0.044);
setSoilLayer(richardsModel, richardsCell, 1, 0.018);
const richardsW0Before = richardsModel.state.soilWater[soilLayerOffset(richardsModel, 0) + richardsCell];
const richardsW1Before = richardsModel.state.soilWater[soilLayerOffset(richardsModel, 1) + richardsCell];
for (let stepIndex = 0; stepIndex < 10; stepIndex += 1) {
  richardsModel.step();
}
assert.ok(richardsModel.state.soilWater[soilLayerOffset(richardsModel, 0) + richardsCell] < richardsW0Before, "Richards top layer should lose water under downward hydraulic head");
assert.ok(richardsModel.state.soilWater[soilLayerOffset(richardsModel, 1) + richardsCell] > richardsW1Before, "Richards next layer should gain water from top-layer percolation");

const capillaryModel = createVegetationTestModel(4, null, { evaporation: 0 });
const capillaryCell = 64;
capillaryModel.state.H.fill(0);
capillaryModel.state.sunlight.fill(0);
fillSoilLayerFraction(capillaryModel, 0, 0.35);
fillSoilLayerFraction(capillaryModel, 1, 0.95);
fillSoilLayerFraction(capillaryModel, 2, 0.45);
fillSoilLayerFraction(capillaryModel, 3, 0.45);
const capillaryTopBefore = capillaryModel.state.soilWater[soilLayerOffset(capillaryModel, 0) + capillaryCell];
const capillaryMidBefore = capillaryModel.state.soilWater[soilLayerOffset(capillaryModel, 1) + capillaryCell];
for (let stepIndex = 0; stepIndex < 5; stepIndex += 1) {
  capillaryModel.step();
}
assert.ok(
  capillaryModel.state.soilWater[soilLayerOffset(capillaryModel, 0) + capillaryCell] > capillaryTopBefore,
  "Richards update should allow upward capillary flow when the lower-layer hydraulic head is higher"
);
assert.ok(
  capillaryModel.state.soilWater[soilLayerOffset(capillaryModel, 1) + capillaryCell] < capillaryMidBefore,
  "upward capillary flow should draw water from the wetter lower layer"
);

const groundwaterTopology = createHealpixTopology(16);
const groundwaterCount = groundwaterTopology.cells.length;
const groundwaterSource = groundwaterTopology.cellAt(32, 32) ?? 0;
const groundwaterTarget = groundwaterTopology.directions
  .map((direction) => groundwaterTopology.neighbor(groundwaterSource, direction))
  .find((cellId) => cellId !== null && cellId !== undefined);
const groundwaterElevation = new Float32Array(groundwaterCount).fill(500);
groundwaterElevation[groundwaterSource] = 1600;
groundwaterElevation[groundwaterTarget] = 0;
const groundwaterModel = createVegetationTestModel(16, groundwaterElevation, { evaporation: 0, gwFlow: 0.04 });
groundwaterModel.state.H.fill(0);
fillSoilLayer(groundwaterModel, 0, 0.003);
fillSoilLayer(groundwaterModel, 3, 0.003);
setSoilLayer(groundwaterModel, groundwaterSource, 3, 0.06);
setSoilLayer(groundwaterModel, groundwaterTarget, 3, 0.01);
const groundwaterSourceBefore = groundwaterModel.state.groundwaterStorage[groundwaterSource];
for (let stepIndex = 0; stepIndex < 3; stepIndex += 1) {
  groundwaterModel.step();
}
assert.ok(groundwaterModel.state.groundwaterStorage[groundwaterSource] < groundwaterSourceBefore, "groundwater head-gradient flow should reduce high-head storage");
assert.ok(
  groundwaterModel.state.groundwaterHead[groundwaterSource] > groundwaterModel.state.groundwaterHead[groundwaterTarget],
  "groundwater hydraulic head diagnostic should expose the high-head source cell"
);
assert.ok(
  groundwaterModel.state.groundwaterTransport[groundwaterSource] < 0,
  "groundwater RBF-FD transport should export water from the high-head source cell"
);
assert.ok(
  groundwaterModel.state.groundwaterTransport[groundwaterTarget] > 0,
  "groundwater RBF-FD transport should import water into the low-head target cell"
);

const boundedWaterModel = createVegetationTestModel(4, downhillElevation, { evaporation: 0.8 });
boundedWaterModel.state.H.fill(0.02);
for (let layer = 0; layer < 3; layer += 1) {
  for (let cellId = 0; cellId < boundedWaterModel.size; cellId += 1) {
    const cap = __asteroidVegetationDiagnostics.soilLayerCapacityForCell(boundedWaterModel, cellId, layer);
    setSoilLayer(boundedWaterModel, cellId, layer, cap * (layer === 0 ? 0.74 : 0.68));
  }
}
for (let cellId = 0; cellId < boundedWaterModel.size; cellId += 1) {
  const cap = __asteroidVegetationDiagnostics.groundwaterCapacityForCell(boundedWaterModel, cellId);
  setSoilLayer(boundedWaterModel, cellId, 3, cap * 0.68);
}
const boundedWaterTotalBefore = __asteroidVegetationDiagnostics.soilWaterTotal(boundedWaterModel);
for (let stepIndex = 0; stepIndex < 16; stepIndex += 1) {
  boundedWaterModel.step();
}
assert.ok(
  __asteroidVegetationDiagnostics.soilWaterTotal(boundedWaterModel) <= boundedWaterTotalBefore + 1,
  "bounded Richards update should not create an unbounded amount of soil water without rain"
);
for (let layer = 0; layer < 3; layer += 1) {
  for (let cellId = 0; cellId < boundedWaterModel.size; cellId += 1) {
    const value = boundedWaterModel.state.soilWater[soilLayerOffset(boundedWaterModel, layer) + cellId];
    const cap = __asteroidVegetationDiagnostics.soilLayerCapacityForCell(boundedWaterModel, cellId, layer);
    assert.ok(Number.isFinite(value), "soil water storage should stay finite");
    assert.ok(value >= -1e-8, "soil water storage should not become negative");
    assert.ok(value <= cap + 1e-8, "soil water storage should stay within layer capacity");
  }
}
for (let cellId = 0; cellId < boundedWaterModel.size; cellId += 1) {
  const value = boundedWaterModel.state.groundwaterStorage[cellId];
  const cap = __asteroidVegetationDiagnostics.groundwaterCapacityForCell(boundedWaterModel, cellId);
  assert.ok(Number.isFinite(value), "groundwater storage should stay finite");
  assert.ok(value >= -1e-8, "groundwater storage should not become negative");
  assert.ok(value <= cap + 1e-8, "groundwater storage should stay within aquifer capacity");
}

const noForcingWaterModel = createVegetationTestModel(4, null, {
  annualPrecipMm: 0,
  evaporation: 0
});
zeroVegetationPools(noForcingWaterModel);
noForcingWaterModel.state.sunlight.fill(0);
noForcingWaterModel.state.H.fill(0.01);
fillSoilLayerFraction(noForcingWaterModel, 0, 0.3);
fillSoilLayerFraction(noForcingWaterModel, 1, 0.45);
fillSoilLayerFraction(noForcingWaterModel, 2, 0.4);
fillSoilLayerFraction(noForcingWaterModel, 3, 0.42);
const noForcingWaterBefore = __asteroidVegetationDiagnostics.hydrologyWaterTotal(noForcingWaterModel);
for (let stepIndex = 0; stepIndex < 8; stepIndex += 1) {
  noForcingWaterModel.step();
}
const noForcingWaterAfter = __asteroidVegetationDiagnostics.hydrologyWaterTotal(noForcingWaterModel);
assert.ok(
  Math.abs(noForcingWaterAfter - noForcingWaterBefore) < 2e-5,
  "Richards/Picard hydrology should conserve water under zero external forcing"
);
assert.equal(
  Math.max(...noForcingWaterModel.state.soilEvapM),
  0,
  "evaporation=0 should disable soil evaporation"
);

const noForcingBudgetModel = createVegetationTestModel(4, null, {
  annualPrecipMm: 0,
  evaporation: 0
});
zeroVegetationPools(noForcingBudgetModel);
noForcingBudgetModel.state.sunlight.fill(0);
noForcingBudgetModel.state.H.fill(0.01);
fillSoilLayerFraction(noForcingBudgetModel, 0, 0.3);
fillSoilLayerFraction(noForcingBudgetModel, 1, 0.45);
fillSoilLayerFraction(noForcingBudgetModel, 2, 0.4);
fillSoilLayerFraction(noForcingBudgetModel, 3, 0.42);
const noForcingBudgetBefore = __asteroidVegetationDiagnostics.hydrologyWaterTotal(noForcingBudgetModel);
noForcingBudgetModel.step();
const noForcingBudgetAfter = __asteroidVegetationDiagnostics.hydrologyWaterTotal(noForcingBudgetModel);
const noForcingBudget = __asteroidVegetationDiagnostics.hydrologyBudgetTotals(noForcingBudgetModel);
assert.ok(
  Math.abs(noForcingBudget.storageChange - (noForcingBudgetAfter - noForcingBudgetBefore)) < 5e-7,
  "hydrology budget storage change should match total stored water change"
);
assert.ok(
  Math.abs(noForcingBudget.residual) < 2e-5,
  "hydrology budget residual should stay small under zero external forcing"
);
assert.ok(
  noForcingBudget.residualMaxAbs < 2e-7,
  "local hydrology budget residual should stay small under zero external forcing"
);
assert.ok(Math.abs(noForcingBudget.input) < 1e-10, "zero-precipitation budget should have no water input");
assert.ok(Math.abs(noForcingBudget.soilEvap) < 1e-10, "evaporation=0 budget should have no soil evaporation");
assert.ok(Math.abs(noForcingBudget.rootUptake) < 1e-10, "vegetation-free budget should have no root uptake");

const surfaceEvapModel = createVegetationTestModel(4, null, {
  annualPrecipMm: 0,
  evaporation: 1
});
zeroVegetationPools(surfaceEvapModel);
surfaceEvapModel.state.sunlight.fill(1);
surfaceEvapModel.state.H.fill(0.02);
fillSoilLayerFraction(surfaceEvapModel, 0, 0.98);
fillSoilLayerFraction(surfaceEvapModel, 1, 0.36);
fillSoilLayerFraction(surfaceEvapModel, 2, 0.38);
fillSoilLayerFraction(surfaceEvapModel, 3, 0.4);
surfaceEvapModel.step();
const surfaceEvapBudget = __asteroidVegetationDiagnostics.hydrologyBudgetTotals(surfaceEvapModel);
assert.ok(surfaceEvapBudget.surfaceEvap > 0, "ponded surface water should evaporate as surface evaporation");
assert.equal(surfaceEvapBudget.surfaceDrain, 0, "closed-sphere hydrology should not use artificial surface drainage");
assert.ok(
  surfaceEvapBudget.residualMaxAbs < 2e-7,
  "surface evaporation budget should stay locally closed"
);

const forcingBudgetModel = createVegetationTestModel(4, null, {
  annualPrecipMm: 1200,
  dryDays: 0,
  rainPatchiness: 0,
  evaporation: 0.8
});
const forcingPlantCell = 40;
forcingBudgetModel.state.sunlight.fill(0.8);
forcingBudgetModel.state.baobabLeaf[forcingPlantCell] = 0.22;
forcingBudgetModel.state.baobabStem[forcingPlantCell] = 0.25;
forcingBudgetModel.state.baobabRoot[forcingPlantCell] = 0.28;
forcingBudgetModel.state.roseLeaf[0] = 0.18;
forcingBudgetModel.state.roseFlower[0] = 0.12;
forcingBudgetModel.state.roseRoot[0] = 0.1;
fillSoilLayer(forcingBudgetModel, 0, 0.018);
fillSoilLayer(forcingBudgetModel, 1, 0.02);
fillSoilLayer(forcingBudgetModel, 2, 0.022);
fillSoilLayer(forcingBudgetModel, 3, 0.035);
const forcingBudgetBefore = __asteroidVegetationDiagnostics.hydrologyWaterTotal(forcingBudgetModel);
forcingBudgetModel.step();
const forcingBudgetAfter = __asteroidVegetationDiagnostics.hydrologyWaterTotal(forcingBudgetModel);
const forcingBudget = __asteroidVegetationDiagnostics.hydrologyBudgetTotals(forcingBudgetModel);
const forcingExpectedChange =
  forcingBudget.input +
  forcingBudget.litterWater +
  forcingBudget.horizontal -
  forcingBudget.surfaceEvap -
  forcingBudget.soilEvap -
  forcingBudget.rootUptake -
  forcingBudget.leakage -
  forcingBudget.surfaceDrain;
assert.ok(forcingBudget.input > 0, "forced hydrology budget should include rainfall throughfall");
assert.ok(forcingBudget.infiltration > 0, "forced hydrology budget should diagnose surface-to-soil infiltration");
assert.ok(Number.isFinite(forcingBudget.percolation01), "forced hydrology budget should diagnose shallow-to-middle percolation");
assert.ok(Number.isFinite(forcingBudget.percolation12), "forced hydrology budget should diagnose middle-to-deep percolation");
assert.ok(Number.isFinite(forcingBudget.recharge), "forced hydrology budget should diagnose deep-soil to groundwater recharge");
assert.ok(forcingBudget.soilEvap > 0, "forced hydrology budget should include soil evaporation");
assert.ok(forcingBudget.rootUptake > 0, "forced hydrology budget should include plant root uptake");
assert.ok(
  Math.abs(forcingBudget.storageChange - (forcingBudgetAfter - forcingBudgetBefore)) < 5e-7,
  "forced hydrology budget storage change should match total stored water change"
);
assert.ok(
  Math.abs(forcingBudget.storageChange - forcingExpectedChange - forcingBudget.residual) < 5e-7,
  "forced hydrology budget should close against diagnosed sources and sinks"
);
assert.ok(
  Math.abs(forcingBudget.residual) < 2e-5,
  "forced hydrology budget residual should stay small under rainfall, evaporation, and root uptake"
);
assert.ok(
  forcingBudget.residualMaxAbs < 2e-7,
  "local forced hydrology budget residual should stay small under rainfall, evaporation, and root uptake"
);

const poolModel = createVegetationTestModel(4);
const poolCell = 40;
poolModel.state.baobabLeaf[poolCell] = 0.12;
poolModel.state.baobabStem[poolCell] = 0.18;
poolModel.state.baobabRoot[poolCell] = 0.24;
poolModel.state.baobabStore[poolCell] = 0.08;
poolModel.state.roseLeaf[poolCell] = 0.16;
poolModel.state.roseFlower[poolCell] = 0.12;
poolModel.state.roseRoot[poolCell] = 0.1;
poolModel.state.sunlight.fill(1);
poolModel.step();
assert.ok(
  Math.abs(poolModel.state.MB[poolCell] - (poolModel.state.baobabLeaf[poolCell] + poolModel.state.baobabStem[poolCell] + poolModel.state.baobabRoot[poolCell])) < 1e-6,
  "baobab total biomass should be derived from leaf/stem/root carbon pools"
);
assert.ok(
  Math.abs(poolModel.state.MR[poolCell] - (poolModel.state.roseLeaf[poolCell] + poolModel.state.roseFlower[poolCell] + poolModel.state.roseRoot[poolCell])) < 1e-6,
  "rose total biomass should be derived from leaf/flower/root carbon pools"
);
assert.ok(poolModel.state.par[poolCell] > 0, "plant physiology should diagnose positive PAR under sunlight");
assert.ok(poolModel.state.laiBaobab[poolCell] > 0, "baobab leaf carbon should diagnose positive LAI");
assert.ok(poolModel.state.laiRose[poolCell] > 0, "rose leaf carbon should diagnose positive LAI");
assert.ok(poolModel.state.vegetationCover[poolCell] > 0 && poolModel.state.vegetationCover[poolCell] <= 1, "LAI should diagnose a bounded vegetation cover");
assert.ok(
  poolModel.state.coverBaobab[poolCell] > 0 && poolModel.state.coverBaobab[poolCell] <= poolModel.state.vegetationCover[poolCell] + 1e-6,
  "baobab LAI should diagnose a bounded PFT cover"
);
assert.ok(
  poolModel.state.coverRose[poolCell] > 0 && poolModel.state.coverRose[poolCell] <= poolModel.state.vegetationCover[poolCell] + 1e-6,
  "rose LAI should diagnose a bounded PFT cover"
);
assert.ok(poolModel.state.aparTotal[poolCell] > 0, "lit vegetation should absorb PAR");
assert.ok(poolModel.state.aparTotal[poolCell] <= poolModel.state.par[poolCell] + 1e-6, "absorbed PAR should not exceed incoming PAR");
assert.ok(
  Math.abs(poolModel.state.aparTotal[poolCell] - poolModel.state.aparBaobab[poolCell] - poolModel.state.aparRose[poolCell]) < 1e-5,
  "PFT APAR shares should sum to total APAR"
);
assert.ok(
  Math.abs(
    poolModel.state.aparBaobab[poolCell] / poolModel.state.aparTotal[poolCell] -
    poolModel.state.laiBaobab[poolCell] / (poolModel.state.laiBaobab[poolCell] + poolModel.state.laiRose[poolCell])
  ) < 1e-5,
  "PFT APAR shares should follow the LAI ratio"
);
assert.ok(poolModel.state.et0[poolCell] > 0, "plant physiology should diagnose positive reference ET under sunlight");
assert.ok(poolModel.state.lueGppBaobab[poolCell] > 0, "lit baobab canopy should produce positive LUE GPP");
assert.ok(poolModel.state.lueGppRose[poolCell] > 0, "lit rose canopy should produce positive LUE GPP");
assert.ok(poolModel.state.gppBaobab[poolCell] > 0, "lit baobab canopy should produce positive Farquhar GPP");
assert.ok(poolModel.state.gppRose[poolCell] > 0, "lit rose canopy should produce positive Farquhar GPP");
assert.ok(poolModel.state.gppBaobab[poolCell] >= poolModel.state.nppBaobab[poolCell], "baobab NPP should not exceed GPP");
const litGpp = poolModel.state.gppBaobab[poolCell];
const litLueGpp = poolModel.state.lueGppBaobab[poolCell];
const litEt0 = poolModel.state.et0[poolCell];
poolModel.state.sunlight.fill(0);
poolModel.step();
assert.ok(poolModel.state.gppBaobab[poolCell] < litGpp, "GPP should decline when PAR is removed");
assert.ok(poolModel.state.lueGppBaobab[poolCell] < litLueGpp, "LUE GPP should decline when PAR is removed");
assert.ok(poolModel.state.et0[poolCell] < litEt0, "reference ET should decline when radiation is removed");

const carbonGainModel = createVegetationTestModel(4, null, { baobabGrowth: 6 });
setProductiveWetLoam(carbonGainModel);
carbonGainModel.state.sunlight.fill(1);
carbonGainModel.state.baobabLeaf[poolCell] = 0.25;
carbonGainModel.state.baobabStem[poolCell] = 0.35;
carbonGainModel.state.baobabRoot[poolCell] = 0.35;
carbonGainModel.state.baobabStore[poolCell] = 0.03;
const carbonGainBiomassBefore =
  carbonGainModel.state.baobabLeaf[poolCell] +
  carbonGainModel.state.baobabStem[poolCell] +
  carbonGainModel.state.baobabRoot[poolCell];
const carbonGainStoreBefore = carbonGainModel.state.baobabStore[poolCell];
carbonGainModel.step();
assert.ok(carbonGainModel.state.nppBaobab[poolCell] > 0, "positive carbon balance should be diagnosed under wet lit conditions");
const carbonGainAllocationSum =
  carbonGainModel.state.baobabAllocLeaf[poolCell] +
  carbonGainModel.state.baobabAllocStem[poolCell] +
  carbonGainModel.state.baobabAllocRoot[poolCell] +
  carbonGainModel.state.baobabAllocStore[poolCell];
assert.ok(
  Math.abs(carbonGainAllocationSum - 1) < 1e-5,
  "positive baobab NPP should be partitioned among leaf, stem, root, and storage fractions that sum to one"
);
const carbonGainAllocationFluxSum =
  carbonGainModel.state.baobabAllocLeafC[poolCell] +
  carbonGainModel.state.baobabAllocStemC[poolCell] +
  carbonGainModel.state.baobabAllocRootC[poolCell] +
  carbonGainModel.state.baobabAllocStoreC[poolCell];
assert.ok(
  carbonGainAllocationFluxSum <= carbonGainModel.state.nppBaobab[poolCell] + 1e-7,
  "baobab vegetative allocation fluxes should not exceed baobab NPP after reproductive carbon is removed"
);
assert.ok(carbonGainModel.state.baobabAllocStore[poolCell] > 0, "positive baobab NPP should allocate some carbon to storage");
for (const key of [
  "baobabLeafResidualCarbon",
  "baobabStemResidualCarbon",
  "baobabRootResidualCarbon",
  "baobabStoreResidualCarbon"
]) {
  assert.ok(Math.abs(carbonGainModel.state[key][poolCell]) < 1e-7, `baobab plant pool budget should close for ${key}`);
}
assert.ok(carbonGainModel.state.baobabStore[poolCell] > carbonGainStoreBefore, "surplus carbon should fill baobab storage");
assert.ok(carbonGainModel.state.MB[poolCell] > carbonGainBiomassBefore, "surplus carbon should increase structural baobab biomass");

const lowBaobabStoreModel = createVegetationTestModel(4, null, { baobabGrowth: 3 });
const highBaobabStoreModel = createVegetationTestModel(4, null, { baobabGrowth: 3 });
for (const model of [lowBaobabStoreModel, highBaobabStoreModel]) {
  model.state.sunlight.fill(1);
  setProductiveWetLoam(model);
  model.state.baobabLeaf[poolCell] = 0.28;
  model.state.baobabStem[poolCell] = 0.32;
  model.state.baobabRoot[poolCell] = 0.36;
}
lowBaobabStoreModel.state.baobabStore[poolCell] = 0.01;
highBaobabStoreModel.state.baobabStore[poolCell] = 0.42;
lowBaobabStoreModel.step();
highBaobabStoreModel.step();
assert.ok(lowBaobabStoreModel.state.nppBaobab[poolCell] > 0, "depleted-store baobab test should have positive NPP");
assert.ok(highBaobabStoreModel.state.nppBaobab[poolCell] > 0, "filled-store baobab test should have positive NPP");
assert.ok(
  lowBaobabStoreModel.state.baobabAllocStore[poolCell] >
    highBaobabStoreModel.state.baobabAllocStore[poolCell] + 0.05,
  "baobab NPP allocation should refill depleted nonstructural carbon storage"
);

const roseGainModel = createVegetationTestModel(4, null, { roseGrowth: 3 });
setProductiveWetLoam(roseGainModel);
roseGainModel.state.sunlight.fill(1);
roseGainModel.state.roseFertility[poolCell] = 1.35;
roseGainModel.state.roseLeaf[poolCell] = 0.2;
roseGainModel.state.roseFlower[poolCell] = 0.16;
roseGainModel.state.roseRoot[poolCell] = 0.14;
roseGainModel.state.roseStore[poolCell] = 0.02;
roseGainModel.step();
assert.ok(roseGainModel.state.nppRose[poolCell] > 0, "positive rose carbon balance should be diagnosed under wet lit conditions");
const roseGainAllocationSum =
  roseGainModel.state.roseAllocLeaf[poolCell] +
  roseGainModel.state.roseAllocFlower[poolCell] +
  roseGainModel.state.roseAllocRoot[poolCell] +
  roseGainModel.state.roseAllocStore[poolCell];
assert.ok(
  Math.abs(roseGainAllocationSum - 1) < 1e-5,
  "positive rose NPP should be partitioned among leaf, flower, root, and storage fractions that sum to one"
);
const roseGainAllocationFluxSum =
  roseGainModel.state.roseAllocLeafC[poolCell] +
  roseGainModel.state.roseAllocFlowerC[poolCell] +
  roseGainModel.state.roseAllocRootC[poolCell] +
  roseGainModel.state.roseAllocStoreC[poolCell];
assert.ok(
  Math.abs(
    roseGainAllocationFluxSum +
      Math.min(roseGainModel.state.roseSeedProduction[poolCell], roseGainModel.state.nppRose[poolCell]) -
      roseGainModel.state.nppRose[poolCell]
  ) < 1e-7,
  "rose vegetative allocation plus seed output from current NPP should sum to rose NPP"
);
for (const key of [
  "roseLeafResidualCarbon",
  "roseFlowerResidualCarbon",
  "roseRootResidualCarbon",
  "roseStoreResidualCarbon"
]) {
  assert.ok(Math.abs(roseGainModel.state[key][poolCell]) < 1e-7, `rose plant pool budget should close for ${key}`);
}

await loadSimulationCoreForAction();
const roseSeedlingModel = createVegetationTestModel(4, null, {
  annualPrecipMm: 900,
  evaporation: 0.6,
  roseGrowth: 1.8,
  shade: 0.45,
  asteroidMeanTempC: 23,
  asteroidDiurnalRangeC: 7,
  asteroidLatitudeTempRangeC: 1
});
roseSeedlingModel.setDiagnosticsEnabled(false);
setProductiveWetLoam(roseSeedlingModel);
roseSeedlingModel.state.sunlight.fill(0.9);
roseSeedlingModel.state.roseFertility[poolCell] = 1.85;
roseSeedlingModel.state.roseLeaf[poolCell] = 0.24;
roseSeedlingModel.state.roseFlower[poolCell] = 0.18;
roseSeedlingModel.state.roseRoot[poolCell] = 0.2;
roseSeedlingModel.state.roseStore[poolCell] = 0.08;
const roseSeedlingTarget = roseSeedlingModel.topology.neighbor(poolCell, roseSeedlingModel.topology.directions[0]);
assert.ok(roseSeedlingTarget !== null && roseSeedlingTarget !== undefined, "rose seedling test should have a neighboring target");
roseSeedlingModel.state.roseFertility[roseSeedlingTarget] = 1.42;
roseSeedlingModel.state.roseSeed[roseSeedlingTarget] = 0.055;
roseSeedlingModel.state.roseGerminationReadiness[roseSeedlingTarget] = 0.52;
roseSeedlingModel.step();
assert.ok(
  roseSeedlingModel.state.roseSeedProduction[poolCell] > 0,
  "well watered, lit adult rose should produce seed carbon under favorable conditions"
);
assert.ok(
  roseSeedlingModel.state.roseLeaf[roseSeedlingTarget] +
    roseSeedlingModel.state.roseFlower[roseSeedlingTarget] +
    roseSeedlingModel.state.roseRoot[roseSeedlingTarget] >
    0,
  "rose seeds should germinate and establish biomass on favorable neighboring garden soil"
);

const roseSeedWasmModel = createVegetationTestModel(4, null, {
  annualPrecipMm: 900,
  evaporation: 0.6,
  roseGrowth: 1.8,
  shade: 0.45,
  asteroidMeanTempC: 23,
  asteroidDiurnalRangeC: 7,
  asteroidLatitudeTempRangeC: 1
});
setProductiveWetLoam(roseSeedWasmModel);
roseSeedWasmModel.setDiagnosticsEnabled(false);
roseSeedWasmModel.state.sunlight.fill(0.9);
roseSeedWasmModel.state.roseFertility[poolCell] = 1.85;
roseSeedWasmModel.state.roseLeaf[poolCell] = 0.24;
roseSeedWasmModel.state.roseFlower[poolCell] = 0.18;
roseSeedWasmModel.state.roseRoot[poolCell] = 0.2;
roseSeedWasmModel.state.roseStore[poolCell] = 0.08;
roseSeedWasmModel.step();
assert.ok(
  roseSeedWasmModel.state.roseSeedProduction[poolCell] > 0,
  "integrated C/WASM ecosystem step should compute rose seed production before dispersal"
);
resetLoadedAsteroidSimulationCore();
await loadSimulationCoreForAction();

const roseStableModel = createVegetationTestModel(4);
roseStableModel.state.substrate.fill(0);
roseStableModel.state.soilMineralN.fill(0.9);
for (let layer = 0; layer < 3; layer += 1) {
  fillSoilLayerFraction(roseStableModel, layer, 0.65);
}
fillSoilLayerFraction(roseStableModel, 3, 0.65);
roseStableModel.state.sunlight.fill(0.7);
roseStableModel.state.roseFertility[poolCell] = 1.35;
roseStableModel.state.roseLeaf[poolCell] = 0.42 * 0.38;
roseStableModel.state.roseFlower[poolCell] = 0.42 * 0.05;
roseStableModel.state.roseRoot[poolCell] = 0.42 * 0.57;
roseStableModel.state.roseStore[poolCell] = 0.42 * 0.12;
roseStableModel.state.MR[poolCell] =
  roseStableModel.state.roseLeaf[poolCell] +
  roseStableModel.state.roseFlower[poolCell] +
  roseStableModel.state.roseRoot[poolCell];
const roseStableVisibleBefore = createVisibleVegetationState(roseStableModel);
roseStableModel.syncToGame(roseStableVisibleBefore, { detail: false });
const roseStableVisibleFlowerBefore = roseStableVisibleBefore.flower[poolCell];
const roseStableVisibleHeightBefore = roseStableVisibleBefore.roseHeight[poolCell];
const roseStableFlowerCarbonBefore = roseStableModel.state.roseFlower[poolCell];
const roseStablePerennialCarbonBefore =
  roseStableModel.state.roseLeaf[poolCell] +
  roseStableModel.state.roseRoot[poolCell] +
  roseStableModel.state.roseStore[poolCell];
let roseStablePerennialCarbonMinimum = roseStablePerennialCarbonBefore;
await loadSimulationCoreForAction();
for (let stepIndex = 0; stepIndex < Math.ceil(30 / MODEL_DT_DAYS); stepIndex += 1) {
  if (stepIndex % 16 === 0) {
    roseStableModel.applyWater([poolCell], 0.018);
  }
  roseStableModel.state.sunlight.fill(0.7);
  roseStableModel.step();
  roseStablePerennialCarbonMinimum = Math.min(
    roseStablePerennialCarbonMinimum,
    roseStableModel.state.roseLeaf[poolCell] +
      roseStableModel.state.roseRoot[poolCell] +
      roseStableModel.state.roseStore[poolCell]
  );
}
const roseStablePerennialCarbonAfter =
  roseStableModel.state.roseLeaf[poolCell] +
  roseStableModel.state.roseRoot[poolCell] +
  roseStableModel.state.roseStore[poolCell];
const roseStableVisibleAfter = createVisibleVegetationState(roseStableModel);
roseStableModel.syncToGame(roseStableVisibleAfter, { detail: false });
assert.ok(
  roseStablePerennialCarbonAfter >= roseStablePerennialCarbonBefore * 0.97,
  "periodically watered lit rose leaf, root, and storage carbon should not collapse while visible flowers are maintained"
);
assert.ok(
  roseStablePerennialCarbonMinimum >= roseStablePerennialCarbonBefore * 0.97,
  "periodically watered lit rose perennial carbon should stay within a small maintenance band during the 30-day check"
);
assert.ok(
  roseStableVisibleAfter.flower[poolCell] >= roseStableVisibleFlowerBefore * 0.9,
  "periodically watered lit rose should maintain the user-visible rose value for 30 model days"
);
assert.ok(
  roseStableVisibleAfter.roseHeight[poolCell] >= roseStableVisibleHeightBefore * 0.9,
  "periodically watered lit rose should maintain the user-visible rose height for 30 model days"
);
assert.ok(
  roseStableModel.state.roseFlower[poolCell] >= roseStableFlowerCarbonBefore * 0.75,
  "periodically watered lit rose should not hide flower collapse behind leaf and root vigor"
);
assert.ok(
  roseStableModel.roseHealth(poolCell) >= 0.75,
  "periodically watered lit rose should remain visibly healthy for 30 model days"
);
resetLoadedAsteroidSimulationCore();
await loadSimulationCoreForAction();

const lowRoseStoreModel = createVegetationTestModel(4, null, { roseGrowth: 3 });
const highRoseStoreModel = createVegetationTestModel(4, null, { roseGrowth: 3 });
for (const model of [lowRoseStoreModel, highRoseStoreModel]) {
  model.state.sunlight.fill(1);
  setProductiveWetLoam(model);
  model.state.roseFertility[poolCell] = 1.35;
  model.state.roseLeaf[poolCell] = 0.2;
  model.state.roseFlower[poolCell] = 0.16;
  model.state.roseRoot[poolCell] = 0.14;
}
lowRoseStoreModel.state.roseStore[poolCell] = 0.001;
highRoseStoreModel.state.roseStore[poolCell] = 0.04;
lowRoseStoreModel.step();
highRoseStoreModel.step();
assert.ok(lowRoseStoreModel.state.nppRose[poolCell] > 0, "depleted-store rose test should have positive NPP");
assert.ok(highRoseStoreModel.state.nppRose[poolCell] > 0, "filled-store rose test should have positive NPP");
assert.ok(
  lowRoseStoreModel.state.roseAllocStore[poolCell] >
    highRoseStoreModel.state.roseAllocStore[poolCell] + 0.03,
  "rose NPP allocation should refill depleted nonstructural carbon storage"
);

const disturbanceModel = createVegetationTestModel(4);
disturbanceModel.state.baobabLeaf[poolCell] = 0.18;
disturbanceModel.state.baobabStem[poolCell] = 0.22;
disturbanceModel.state.baobabRoot[poolCell] = 0.26;
disturbanceModel.state.baobabStore[poolCell] = 0.08;
disturbanceModel.state.MB[poolCell] = 0.18 + 0.22 + 0.26;
disturbanceModel.state.carbonInputC[poolCell] = 0.014;
disturbanceModel.state.carbonRespirationC[poolCell] = 0.004;
disturbanceModel.state.carbonTransportC[poolCell] = 0.001;
disturbanceModel.state.carbonStorageChangeC[poolCell] = 0.011;
disturbanceModel.state.carbonResidualC[poolCell] = 0;
const disturbanceCarbonBefore =
  disturbanceModel.state.baobabLeaf[poolCell] +
  disturbanceModel.state.baobabStem[poolCell] +
  disturbanceModel.state.baobabRoot[poolCell] +
  disturbanceModel.state.baobabStore[poolCell];
await loadSimulationCoreForAction();
disturbanceModel.removeBaobab(poolCell, 0.24);
resetLoadedAsteroidSimulationCore();
await loadSimulationCoreForAction();
const disturbanceCarbonAfter =
  disturbanceModel.state.baobabLeaf[poolCell] +
  disturbanceModel.state.baobabStem[poolCell] +
  disturbanceModel.state.baobabRoot[poolCell] +
  disturbanceModel.state.baobabStore[poolCell];
assert.ok(
  Math.abs(disturbanceModel.state.disturbanceCarbonExportC[poolCell] - (disturbanceCarbonBefore - disturbanceCarbonAfter)) < 1e-6,
  "pulling baobab should diagnose externally exported disturbance carbon"
);
assert.ok(
  Math.abs(disturbanceModel.state.carbonDisturbanceC[poolCell] - (disturbanceCarbonBefore - disturbanceCarbonAfter)) < 1e-6,
  "disturbance export should enter the current carbon budget as D_i"
);
assert.ok(
  Math.abs(
    disturbanceModel.state.carbonResidualC[poolCell] -
      (disturbanceModel.state.carbonStorageChangeC[poolCell] -
        (disturbanceModel.state.carbonInputC[poolCell] +
          disturbanceModel.state.carbonTransportC[poolCell] -
          disturbanceModel.state.carbonRespirationC[poolCell] -
          disturbanceModel.state.carbonDisturbanceC[poolCell]))
  ) < 1e-6,
  "carbon budget residual should include external disturbance export"
);

const carbonDeficitModel = createVegetationTestModel(4);
carbonDeficitModel.state.sunlight.fill(0);
carbonDeficitModel.state.baobabLeaf[poolCell] = 0.25;
carbonDeficitModel.state.baobabStem[poolCell] = 0.35;
carbonDeficitModel.state.baobabRoot[poolCell] = 0.35;
carbonDeficitModel.state.baobabStore[poolCell] = 0.2;
carbonDeficitModel.state.litterCarbon[poolCell] = 0;
carbonDeficitModel.state.litterFastCarbon[poolCell] = 0;
carbonDeficitModel.state.litterSlowCarbon[poolCell] = 0;
const carbonDeficitBiomassBefore =
  carbonDeficitModel.state.baobabLeaf[poolCell] +
  carbonDeficitModel.state.baobabStem[poolCell] +
  carbonDeficitModel.state.baobabRoot[poolCell];
const carbonDeficitStoreBefore = carbonDeficitModel.state.baobabStore[poolCell];
carbonDeficitModel.step();
assert.equal(carbonDeficitModel.state.nppBaobab[poolCell], 0, "NPP should remain non-negative when maintenance respiration exceeds GPP");
assert.equal(
  carbonDeficitModel.state.baobabAllocLeaf[poolCell] +
    carbonDeficitModel.state.baobabAllocStem[poolCell] +
    carbonDeficitModel.state.baobabAllocRoot[poolCell] +
    carbonDeficitModel.state.baobabAllocStore[poolCell],
  0,
  "baobab allocation fractions should be zero when no positive NPP is available"
);
assert.equal(
  carbonDeficitModel.state.baobabAllocLeafC[poolCell] +
    carbonDeficitModel.state.baobabAllocStemC[poolCell] +
    carbonDeficitModel.state.baobabAllocRootC[poolCell] +
    carbonDeficitModel.state.baobabAllocStoreC[poolCell],
  0,
  "baobab allocation fluxes should be zero when no positive NPP is available"
);
assert.ok(carbonDeficitModel.state.carbonBalanceBaobab[poolCell] < 0, "dark respiration should produce a negative carbon balance diagnostic");
assert.ok(carbonDeficitModel.state.autotrophicRespirationBaobab[poolCell] > 0, "dark plant tissue should still respire");
assert.ok(carbonDeficitModel.state.baobabStore[poolCell] < carbonDeficitStoreBefore, "negative carbon balance should mobilize stored carbon");
assert.ok(carbonDeficitModel.state.MB[poolCell] < carbonDeficitBiomassBefore, "carbon deficit should reduce structural baobab biomass");
assert.ok(carbonDeficitModel.state.litterInputCarbon[poolCell] > 0, "turnover and stress losses should enter the litter carbon pool");
assert.ok(carbonDeficitModel.state.litterInputBaobabCarbon[poolCell] > 0, "baobab turnover and stress losses should be diagnosed as baobab litter input");
assert.ok(
  Math.abs(
    carbonDeficitModel.state.litterInputBaobabCarbon[poolCell] -
      (carbonDeficitModel.state.baobabLeafLossCarbon[poolCell] +
        carbonDeficitModel.state.baobabStemLossCarbon[poolCell] +
        carbonDeficitModel.state.baobabRootLossCarbon[poolCell])
  ) < 1e-8,
  "baobab tissue loss terms should sum to baobab litter input"
);
assert.ok(
  Math.abs(
    carbonDeficitModel.state.litterInputCarbon[poolCell] -
      (carbonDeficitModel.state.litterInputBaobabCarbon[poolCell] +
        carbonDeficitModel.state.litterInputRoseCarbon[poolCell] +
        carbonDeficitModel.state.litterInputSeedCarbon[poolCell])
  ) < 1e-8,
  "PFT and seed litter input sources should sum to total litter input"
);
assert.ok(carbonDeficitModel.state.litterCarbon[poolCell] > 0, "plant carbon losses should become litter carbon");

const nutrientMineralizationModel = createVegetationTestModel(4);
for (let layer = 0; layer < 3; layer += 1) {
  fillSoilLayer(nutrientMineralizationModel, layer, 0.03);
}
nutrientMineralizationModel.state.groundwaterStorage.fill(0.04);
nutrientMineralizationModel.state.sunlight.fill(1);
nutrientMineralizationModel.state.soilMineralN[poolCell] = 0.08;
nutrientMineralizationModel.state.litterCarbon[poolCell] = 0.5;
const mineralNBefore = nutrientMineralizationModel.state.soilMineralN[poolCell];
const litterBefore = nutrientMineralizationModel.state.litterCarbon[poolCell];
const activeCarbonBefore = nutrientMineralizationModel.state.soilCarbonActive[poolCell];
nutrientMineralizationModel.step();
assert.ok(nutrientMineralizationModel.state.soilMineralN[poolCell] > mineralNBefore, "warm wet litter decomposition should mineralize soil nutrients");
assert.ok(nutrientMineralizationModel.state.litterCarbon[poolCell] < litterBefore, "litter decomposition should reduce litter carbon");
assert.ok(
  nutrientMineralizationModel.state.soilCarbonActive[poolCell] > activeCarbonBefore,
  "part of decomposed litter carbon should enter the active soil organic carbon pool"
);
assert.ok(
  nutrientMineralizationModel.state.litterFastDecayCarbon[poolCell] +
    nutrientMineralizationModel.state.litterSlowDecayCarbon[poolCell] >
    0,
  "litter decomposition flux should be diagnosed"
);
assert.ok(nutrientMineralizationModel.state.litterHumificationCarbon[poolCell] > 0, "humification flux should be diagnosed");
assert.ok(nutrientMineralizationModel.state.soilActiveDecayCarbon[poolCell] >= 0, "active SOC decay flux should be diagnosed");
assert.ok(nutrientMineralizationModel.state.soilStabilizationCarbon[poolCell] >= 0, "SOC stabilization flux should be diagnosed");
assert.ok(nutrientMineralizationModel.state.soilStableDecayCarbon[poolCell] >= 0, "stable SOC decay flux should be diagnosed");
assert.ok(nutrientMineralizationModel.state.litterRespirationCarbon[poolCell] >= 0, "litter respiration flux should be diagnosed");
assert.ok(nutrientMineralizationModel.state.soilActiveRespirationCarbon[poolCell] >= 0, "active SOC respiration flux should be diagnosed");
assert.ok(nutrientMineralizationModel.state.soilStableRespirationCarbon[poolCell] >= 0, "stable SOC respiration flux should be diagnosed");
assert.ok(
  Math.abs(
    nutrientMineralizationModel.state.soilCarbonRespiration[poolCell] -
      (nutrientMineralizationModel.state.litterRespirationCarbon[poolCell] +
        nutrientMineralizationModel.state.soilActiveRespirationCarbon[poolCell] +
        nutrientMineralizationModel.state.soilStableRespirationCarbon[poolCell])
  ) < 1e-8,
  "heterotrophic respiration components should sum to total soil carbon respiration"
);
assert.ok(Math.abs(nutrientMineralizationModel.state.litterFastResidualCarbon[poolCell]) < 1e-7, "fast litter pool budget should close locally");
assert.ok(Math.abs(nutrientMineralizationModel.state.litterSlowResidualCarbon[poolCell]) < 1e-7, "slow litter pool budget should close locally");
assert.ok(Math.abs(nutrientMineralizationModel.state.soilActiveResidualCarbon[poolCell]) < 1e-7, "active SOC pool budget should close locally");
assert.ok(Math.abs(nutrientMineralizationModel.state.soilStableResidualCarbon[poolCell]) < 1e-7, "stable SOC pool budget should close locally");

const carbonBudgetModel = createVegetationTestModel(2, null, { annualPrecipMm: 0, evaporation: 0.5 });
carbonBudgetModel.state.sunlight.fill(1);
carbonBudgetModel.state.H.fill(0);
carbonBudgetModel.state.soilMineralN.fill(0.42);
carbonBudgetModel.state.litterCarbon.fill(0.04);
carbonBudgetModel.state.litterFastCarbon.fill(0.026);
carbonBudgetModel.state.litterSlowCarbon.fill(0.014);
carbonBudgetModel.state.soilCarbonActive.fill(0.12);
carbonBudgetModel.state.soilCarbonStable.fill(0.28);
zeroVegetationPools(carbonBudgetModel);
carbonBudgetModel.state.baobabLeaf[poolCell] = 0.18;
carbonBudgetModel.state.baobabStem[poolCell] = 0.22;
carbonBudgetModel.state.baobabRoot[poolCell] = 0.28;
carbonBudgetModel.state.baobabStore[poolCell] = 0.08;
for (let layer = 0; layer < 3; layer += 1) {
  fillSoilLayerFraction(carbonBudgetModel, layer, 0.72);
}
fillSoilLayerFraction(carbonBudgetModel, 3, 0.64);
const landCarbonBefore = __asteroidVegetationDiagnostics.landCarbonTotal(carbonBudgetModel);
carbonBudgetModel.step();
const landCarbonAfter = __asteroidVegetationDiagnostics.landCarbonTotal(carbonBudgetModel);
let gppTotal = 0;
let plantRespirationTotal = 0;
let soilRespirationTotal = 0;
for (let cellId = 0; cellId < carbonBudgetModel.size; cellId += 1) {
  gppTotal += carbonBudgetModel.state.gppBaobab[cellId] + carbonBudgetModel.state.gppRose[cellId];
  plantRespirationTotal += carbonBudgetModel.state.autotrophicRespirationBaobab[cellId] + carbonBudgetModel.state.autotrophicRespirationRose[cellId];
  soilRespirationTotal += carbonBudgetModel.state.soilCarbonRespiration[cellId];
  assert.ok(
    Math.abs(
      carbonBudgetModel.state.autotrophicRespirationBaobab[cellId] -
        (carbonBudgetModel.state.maintenanceRespirationBaobab[cellId] + carbonBudgetModel.state.growthRespirationBaobab[cellId])
    ) < 1e-8,
    "baobab autotrophic respiration should equal maintenance plus growth respiration"
  );
  assert.ok(
    Math.abs(
      carbonBudgetModel.state.nppBaobab[cellId] -
        Math.max(
          0,
          carbonBudgetModel.state.gppBaobab[cellId] -
            carbonBudgetModel.state.maintenanceRespirationBaobab[cellId] -
            carbonBudgetModel.state.growthRespirationBaobab[cellId]
        )
    ) < 1e-8,
    "baobab NPP should equal GPP minus maintenance and growth respiration when positive"
  );
  assert.ok(
    Math.abs(
      carbonBudgetModel.state.autotrophicRespirationRose[cellId] -
        (carbonBudgetModel.state.maintenanceRespirationRose[cellId] + carbonBudgetModel.state.growthRespirationRose[cellId])
    ) < 1e-8,
    "rose autotrophic respiration should equal maintenance plus growth respiration"
  );
  assert.ok(
    Math.abs(
      carbonBudgetModel.state.nppRose[cellId] -
        Math.max(
          0,
          carbonBudgetModel.state.gppRose[cellId] -
            carbonBudgetModel.state.maintenanceRespirationRose[cellId] -
            carbonBudgetModel.state.growthRespirationRose[cellId]
        )
    ) < 1e-8,
    "rose NPP should equal GPP minus maintenance and growth respiration when positive"
  );
}
const carbonBudgetExpected = carbonBudgetModel.day * (gppTotal - plantRespirationTotal - soilRespirationTotal);
assert.ok(
  Math.abs((landCarbonAfter - landCarbonBefore) - carbonBudgetExpected) < 2e-4,
  "land carbon pools should close against GPP input and plant/soil respiration losses"
);
let carbonBudgetResidualSum = 0;
let carbonBudgetResidualMax = 0;
let ecosystemCarbonDiagnosticSum = 0;
for (let cellId = 0; cellId < carbonBudgetModel.size; cellId += 1) {
  carbonBudgetResidualSum += carbonBudgetModel.state.carbonResidualC[cellId];
  carbonBudgetResidualMax = Math.max(carbonBudgetResidualMax, Math.abs(carbonBudgetModel.state.carbonResidualC[cellId]));
  ecosystemCarbonDiagnosticSum += carbonBudgetModel.state.ecosystemCarbonC[cellId];
  assert.ok(
    Math.abs(carbonBudgetModel.state.ecosystemCarbonC[cellId] - cellEcosystemCarbon(carbonBudgetModel, cellId)) < 1e-7,
    "ecosystem carbon diagnostic should equal plant + seed + litter + SOC pools"
  );
  assert.ok(
    Math.abs(
      carbonBudgetModel.state.ecosystemCarbonC[cellId] -
        (carbonBudgetModel.state.plantCarbonC[cellId] +
          carbonBudgetModel.state.seedCarbonC[cellId] +
          carbonBudgetModel.state.litterPoolCarbonC[cellId] +
          carbonBudgetModel.state.soilOrganicCarbonC[cellId])
    ) < 1e-7,
    "ecosystem carbon components should sum to total ecosystem carbon"
  );
  assert.ok(
    Math.abs(
      carbonBudgetModel.state.netEcosystemProductionC[cellId] -
        (carbonBudgetModel.state.gppBaobab[cellId] +
          carbonBudgetModel.state.gppRose[cellId] -
          carbonBudgetModel.state.autotrophicRespirationBaobab[cellId] -
          carbonBudgetModel.state.autotrophicRespirationRose[cellId] -
          carbonBudgetModel.state.soilCarbonRespiration[cellId])
    ) < 1e-9,
    "NEP should equal GPP minus autotrophic and heterotrophic respiration"
  );
}
assert.ok(Math.abs(ecosystemCarbonDiagnosticSum - landCarbonAfter) < 1e-6, "summed ecosystem carbon diagnostics should equal total land carbon");
assert.ok(Math.abs(carbonBudgetResidualSum) < 3e-4, "cell carbon budget residuals should close globally");
assert.ok(carbonBudgetResidualMax < 2e-4, "cell carbon budget residuals should stay locally small");

const nutrientUptakeModel = createVegetationTestModel(4, null, { baobabGrowth: 3 });
for (let layer = 0; layer < 3; layer += 1) {
  fillSoilLayer(nutrientUptakeModel, layer, 0.03);
}
fillSoilLayer(nutrientUptakeModel, 3, 0.06);
nutrientUptakeModel.state.sunlight.fill(1);
nutrientUptakeModel.state.soilMineralN.fill(0.22);
nutrientUptakeModel.state.baobabLeaf[poolCell] = 0.28;
nutrientUptakeModel.state.baobabStem[poolCell] = 0.36;
nutrientUptakeModel.state.baobabRoot[poolCell] = 0.35;
const uptakeMineralNBefore = nutrientUptakeModel.state.soilMineralN[poolCell];
nutrientUptakeModel.step();
assert.ok(nutrientUptakeModel.state.gppBaobab[poolCell] > 0, "lit baobab canopy should assimilate carbon before nutrient uptake");
assert.ok(nutrientUptakeModel.state.soilMineralN[poolCell] < uptakeMineralNBefore, "plant growth should consume mineral soil nutrients");

const nutrientFlowElevation = new Float32Array(downhillCount).fill(400);
nutrientFlowElevation[downhillSource] = 2400;
nutrientFlowElevation[downhillTarget] = -800;
const nutrientFlatElevation = new Float32Array(downhillCount).fill(400);
const nutrientTransportParams = {
  evaporation: 0.2,
  gwFlow: 0.012,
  asteroidMeanTempC: 16,
  asteroidDiurnalRangeC: 16,
  shade: 1.12,
  atmosphericCo2Ppm: 720
};
const nutrientFlowModel = createVegetationTestModel(4, nutrientFlowElevation, nutrientTransportParams);
const nutrientFlatModel = createVegetationTestModel(4, nutrientFlatElevation, nutrientTransportParams);
for (const model of [nutrientFlowModel, nutrientFlatModel]) {
  model.state.H.fill(0);
  for (let layer = 0; layer < 3; layer += 1) {
    fillSoilLayer(model, layer, 0.038);
  }
  fillSoilLayer(model, 3, 0.06);
  model.state.soilMineralN.fill(0.02);
  model.state.soilMineralN[downhillSource] = 0.9;
  model.state.litterCarbon.fill(0);
  model.state.sunlight.fill(0);
}
for (let stepIndex = 0; stepIndex < 4; stepIndex += 1) {
  nutrientFlowModel.step();
  nutrientFlatModel.step();
}
assert.ok(
  nutrientFlowModel.state.soilMineralN[downhillTarget] >
    nutrientFlatModel.state.soilMineralN[downhillTarget] + 0.000001,
  "soluble soil nutrients should move preferentially with downhill water flow"
);
assert.ok(
  nutrientFlowModel.state.soilMineralTransport[downhillTarget] >
    nutrientFlatModel.state.soilMineralTransport[downhillTarget],
  "soil nutrient transport diagnostic should increase at the downhill target"
);

const wetPhotoModel = createVegetationTestModel(4);
const dryPhotoModel = createVegetationTestModel(4);
const photoCell = 44;
for (const model of [wetPhotoModel, dryPhotoModel]) {
  model.state.sunlight.fill(1);
  model.state.baobabLeaf[photoCell] = 0.22;
  model.state.baobabStem[photoCell] = 0.28;
  model.state.baobabRoot[photoCell] = 0.32;
}
fillSoilLayer(wetPhotoModel, 0, 0.03);
fillSoilLayer(wetPhotoModel, 1, 0.028);
fillSoilLayer(wetPhotoModel, 2, 0.026);
fillSoilLayer(wetPhotoModel, 3, 0.038);
fillSoilLayer(dryPhotoModel, 0, 0.002);
fillSoilLayer(dryPhotoModel, 1, 0.002);
fillSoilLayer(dryPhotoModel, 2, 0.002);
fillSoilLayer(dryPhotoModel, 3, 0.003);
wetPhotoModel.step();
dryPhotoModel.step();
assert.ok(
  dryPhotoModel.state.gppBaobab[photoCell] < wetPhotoModel.state.gppBaobab[photoCell],
  "Farquhar-style canopy GPP should decline under soil-water stress"
);
assert.ok(
  dryPhotoModel.state.photosynthesisStressBaobab[photoCell] <
    wetPhotoModel.state.photosynthesisStressBaobab[photoCell],
  "photosynthesis limitation diagnostic should decline under soil-water stress"
);
assert.ok(
  dryPhotoModel.state.stomatalConductanceBaobabMps[photoCell] <
    wetPhotoModel.state.stomatalConductanceBaobabMps[photoCell],
  "Farquhar-Medlyn canopy conductance should close under soil-water stress"
);
assert.ok(
  dryPhotoModel.state.transpirationBaobabM[photoCell] <
    wetPhotoModel.state.transpirationBaobabM[photoCell],
  "Penman-Monteith transpiration should fall when stomatal conductance closes"
);

const lowCo2Model = createVegetationTestModel(4, null, { atmosphericCo2Ppm: 320 });
const highCo2Model = createVegetationTestModel(4, null, { atmosphericCo2Ppm: 760 });
for (const model of [lowCo2Model, highCo2Model]) {
  model.state.sunlight.fill(1);
  model.state.soilMineralN.fill(0.62);
  model.state.baobabLeaf[photoCell] = 0.24;
  model.state.baobabStem[photoCell] = 0.28;
  model.state.baobabRoot[photoCell] = 0.32;
  for (let layer = 0; layer < 3; layer += 1) {
    fillSoilLayer(model, layer, 0.032);
  }
  fillSoilLayer(model, 3, 0.048);
}
lowCo2Model.step();
highCo2Model.step();
assert.ok(
  highCo2Model.state.gppBaobab[photoCell] > lowCo2Model.state.gppBaobab[photoCell],
  "canopy GPP should respond positively to higher atmospheric CO2 forcing"
);
assert.ok(
  highCo2Model.state.ciBaobab[photoCell] > lowCo2Model.state.ciBaobab[photoCell],
  "internal canopy CO2 diagnostic should track atmospheric CO2 forcing"
);
assert.ok(
  highCo2Model.state.co2StressBaobab[photoCell] > lowCo2Model.state.co2StressBaobab[photoCell],
  "CO2 limitation diagnostic should respond positively to atmospheric CO2 forcing"
);

await loadSimulationCoreForAction();
const lowCo2RoseSeedModel = createVegetationTestModel(4, null, {
  atmosphericCo2Ppm: 320,
  annualPrecipMm: 900,
  evaporation: 0.6,
  roseGrowth: 1.8,
  shade: 0.2,
  asteroidMeanTempC: 23,
  asteroidDiurnalRangeC: 5,
  asteroidLatitudeTempRangeC: 0
});
lowCo2RoseSeedModel.setDiagnosticsEnabled(false);
setProductiveWetLoam(lowCo2RoseSeedModel);
lowCo2RoseSeedModel.state.sunlight.fill(0.9);
lowCo2RoseSeedModel.state.roseFertility[poolCell] = 1.85;
lowCo2RoseSeedModel.state.roseLeaf[poolCell] = 0.24;
lowCo2RoseSeedModel.state.roseFlower[poolCell] = 0.18;
lowCo2RoseSeedModel.state.roseRoot[poolCell] = 0.2;
lowCo2RoseSeedModel.state.roseStore[poolCell] = 0.08;
lowCo2RoseSeedModel.step();
const lowCo2RoseGpp = lowCo2RoseSeedModel.state.gppRose[poolCell];
const lowCo2RoseSeedProduction = lowCo2RoseSeedModel.state.roseSeedProduction[poolCell];
const highCo2RoseSeedModel = createVegetationTestModel(4, null, {
  atmosphericCo2Ppm: 760,
  annualPrecipMm: 900,
  evaporation: 0.6,
  roseGrowth: 1.8,
  shade: 0.2,
  asteroidMeanTempC: 23,
  asteroidDiurnalRangeC: 5,
  asteroidLatitudeTempRangeC: 0
});
highCo2RoseSeedModel.setDiagnosticsEnabled(false);
setProductiveWetLoam(highCo2RoseSeedModel);
highCo2RoseSeedModel.state.sunlight.fill(0.9);
highCo2RoseSeedModel.state.roseFertility[poolCell] = 1.85;
highCo2RoseSeedModel.state.roseLeaf[poolCell] = 0.24;
highCo2RoseSeedModel.state.roseFlower[poolCell] = 0.18;
highCo2RoseSeedModel.state.roseRoot[poolCell] = 0.2;
highCo2RoseSeedModel.state.roseStore[poolCell] = 0.08;
highCo2RoseSeedModel.step();
assert.ok(
  highCo2RoseSeedModel.state.gppRose[poolCell] > lowCo2RoseGpp,
  "rose canopy GPP should respond positively to higher atmospheric CO2 forcing"
);
assert.ok(
  highCo2RoseSeedModel.state.roseSeedProduction[poolCell] > lowCo2RoseSeedProduction,
  "rose seed production should increase when higher atmospheric CO2 raises carbon surplus"
);
resetLoadedAsteroidSimulationCore();
await loadSimulationCoreForAction();

const warmRespElevation = new Float32Array(createHealpixTopology(4).cells.length).fill(-1600);
const coldRespElevation = new Float32Array(createHealpixTopology(4).cells.length).fill(5200);
const warmRespModel = createVegetationTestModel(4, warmRespElevation);
const coldRespModel = createVegetationTestModel(4, coldRespElevation);
for (const model of [warmRespModel, coldRespModel]) {
  model.state.sunlight.fill(1);
  model.state.baobabLeaf[photoCell] = 0;
  model.state.baobabStem[photoCell] = 0.42;
  model.state.baobabRoot[photoCell] = 0.36;
  model.state.baobabStore[photoCell] = 0.18;
}
warmRespModel.step();
coldRespModel.step();
assert.ok(
  warmRespModel.state.surfaceTempC[photoCell] > coldRespModel.state.surfaceTempC[photoCell],
  "test setup should create a warmer plant canopy"
);
assert.ok(
  warmRespModel.state.autotrophicRespirationBaobab[photoCell] > coldRespModel.state.autotrophicRespirationBaobab[photoCell],
  "q10 maintenance respiration should increase in warmer plant tissue"
);

const canopyBareModel = createVegetationTestModel(4, null, {
  annualPrecipMm: 7300,
  dryDays: 0,
  rainPatchiness: 0,
  evaporation: 0.3
});
const canopyLeafModel = createVegetationTestModel(4, null, {
  annualPrecipMm: 7300,
  dryDays: 0,
  rainPatchiness: 0,
  evaporation: 0.3
});
const canopyCell = photoCell;
for (const model of [canopyBareModel, canopyLeafModel]) {
  model.state.H.fill(0);
  model.state.sunlight.fill(1);
  model.state.soilMineralN.fill(0.45);
  for (let layer = 0; layer < 3; layer += 1) {
    fillSoilLayerFraction(model, layer, 0.98);
  }
  fillSoilLayerFraction(model, 3, 0.72);
}
canopyLeafModel.state.baobabLeaf[canopyCell] = 0.8;
canopyLeafModel.state.baobabStem[canopyCell] = 0.48;
canopyLeafModel.state.baobabRoot[canopyCell] = 0.5;
canopyBareModel.step();
canopyLeafModel.step();
assert.ok(
  Math.abs(canopyBareModel.state.R[canopyCell] - canopyLeafModel.state.R[canopyCell]) < 1e-12,
  "canopy interception comparison should use the same incoming rainfall"
);
assert.ok(
  canopyLeafModel.state.canopyEvapM[canopyCell] > canopyBareModel.state.canopyEvapM[canopyCell],
  "vegetated cells should evaporate intercepted canopy water"
);
assert.ok(
  canopyLeafModel.state.H[canopyCell] < canopyBareModel.state.H[canopyCell],
  "canopy interception should reduce rainfall reaching surface water"
);

const deepRootModel = createVegetationTestModel(4, null, { rootDepth: 8 });
const deepDryModel = createVegetationTestModel(4, null, { rootDepth: 8 });
for (const model of [deepRootModel, deepDryModel]) {
  model.state.sunlight.fill(1);
  model.state.baobabLeaf[photoCell] = 0.22;
  model.state.baobabStem[photoCell] = 0.28;
  model.state.baobabRoot[photoCell] = 0.42;
}
fillSoilLayer(deepRootModel, 0, 0.002);
fillSoilLayer(deepRootModel, 1, 0.003);
fillSoilLayer(deepRootModel, 2, 0.024);
fillSoilLayer(deepRootModel, 3, 0.04);
fillSoilLayer(deepDryModel, 0, 0.002);
fillSoilLayer(deepDryModel, 1, 0.003);
fillSoilLayer(deepDryModel, 2, 0.003);
fillSoilLayer(deepDryModel, 3, 0.003);
deepRootModel.step();
deepDryModel.step();
assert.ok(
  deepRootModel.state.transpirationBaobabM[photoCell] > deepDryModel.state.transpirationBaobabM[photoCell],
  "baobab root uptake should use deeper water when the surface layer is dry"
);

const potentialGradientRootModel = createVegetationTestModel(4, null, { rootDepth: 8, evaporation: 0 });
potentialGradientRootModel.state.sunlight.fill(1);
potentialGradientRootModel.state.baobabLeaf[photoCell] = 0.22;
potentialGradientRootModel.state.baobabStem[photoCell] = 0.28;
potentialGradientRootModel.state.baobabRoot[photoCell] = 0.42;
fillSoilLayer(potentialGradientRootModel, 0, 0.002);
fillSoilLayer(potentialGradientRootModel, 1, 0.003);
fillSoilLayer(potentialGradientRootModel, 2, 0.024);
fillSoilLayer(potentialGradientRootModel, 3, 0.04);
potentialGradientRootModel.step();
const potentialGradientSoilUptake = Math.max(0, potentialGradientRootModel.state.hydrologySink0[photoCell]) +
  Math.max(0, potentialGradientRootModel.state.hydrologySink1[photoCell]) +
  Math.max(0, potentialGradientRootModel.state.hydrologySink2[photoCell]);
assert.ok(
  potentialGradientRootModel.state.hydrologyGroundwaterSink[photoCell] > potentialGradientSoilUptake,
  "root uptake should prefer the higher-potential groundwater reservoir over dry unsaturated soil layers"
);

const roseShallowWetModel = createVegetationTestModel(4);
const roseDeepWetModel = createVegetationTestModel(4);
for (const model of [roseShallowWetModel, roseDeepWetModel]) {
  model.state.sunlight.fill(1);
  model.state.roseLeaf[photoCell] = 0.18;
  model.state.roseFlower[photoCell] = 0.14;
  model.state.roseRoot[photoCell] = 0.1;
  model.state.roseFertility[photoCell] = 1.2;
}
fillSoilLayer(roseShallowWetModel, 0, 0.032);
fillSoilLayer(roseShallowWetModel, 1, 0.018);
fillSoilLayer(roseShallowWetModel, 2, 0.006);
fillSoilLayer(roseShallowWetModel, 3, 0.006);
fillSoilLayer(roseDeepWetModel, 0, 0.002);
fillSoilLayer(roseDeepWetModel, 1, 0.004);
fillSoilLayer(roseDeepWetModel, 2, 0.028);
fillSoilLayer(roseDeepWetModel, 3, 0.04);
roseShallowWetModel.step();
roseDeepWetModel.step();
assert.ok(
  roseShallowWetModel.state.transpirationRoseM[photoCell] > roseDeepWetModel.state.transpirationRoseM[photoCell],
  "rose root uptake should depend more on shallow water than deep groundwater"
);

const loamHydraulicModel = createVegetationTestModel(4);
const crustHydraulicModel = createVegetationTestModel(4);
for (const [model, substrateId] of [[loamHydraulicModel, 0], [crustHydraulicModel, 4]]) {
  model.state.substrate.fill(substrateId);
  model.state.sunlight.fill(1);
  model.state.soilMineralN.fill(0.55);
  model.state.litterCarbon.fill(0);
  for (let layer = 0; layer < 3; layer += 1) {
    fillSoilLayerFraction(model, layer, 0.66);
  }
  fillSoilLayerFraction(model, 3, 0.66);
  model.state.baobabLeaf[photoCell] = 0.28;
  model.state.baobabStem[photoCell] = 0.34;
  model.state.baobabRoot[photoCell] = 0.42;
}
loamHydraulicModel.step();
crustHydraulicModel.step();
assert.ok(
  loamHydraulicModel.state.transpirationBaobabM[photoCell] >
    crustHydraulicModel.state.transpirationBaobabM[photoCell],
  "root uptake should be hydraulically limited by low-conductivity substrate even at the same saturation"
);
assert.ok(
  loamHydraulicModel.state.rootStressBaobab[photoCell] >
    crustHydraulicModel.state.rootStressBaobab[photoCell],
  "root-water availability diagnostic should reflect hydraulic limitation in low-conductivity substrate"
);
assert.ok(
  loamHydraulicModel.state.stomatalConductanceBaobabMps[photoCell] >
    crustHydraulicModel.state.stomatalConductanceBaobabMps[photoCell],
  "hydraulic root limitation should reduce stomatal conductance in low-conductivity substrate"
);
assert.ok(
  loamHydraulicModel.state.gppBaobab[photoCell] >
    crustHydraulicModel.state.gppBaobab[photoCell],
  "hydraulic root limitation should feed back onto canopy GPP in low-conductivity substrate"
);

const seedModel = createVegetationTestModel(4);
const seedCell = 72;
seedModel.state.sunlight.fill(1);
fillSoilLayer(seedModel, 0, 0.02);
fillSoilLayer(seedModel, 1, 0.018);
fillSoilLayer(seedModel, 2, 0.018);
fillSoilLayer(seedModel, 3, 0.024);
seedModel.state.baobabRisk.fill(1);
seedModel.state.baobabSeed.fill(0);
seedModel.state.baobabLeaf[seedCell] = 0.24;
seedModel.state.baobabStem[seedCell] = 0.46;
seedModel.state.baobabRoot[seedCell] = 0.34;
seedModel.state.baobabStore[seedCell] = 0.22;
seedModel.step();
assert.ok(seedModel.state.baobabSeed[seedCell] > 0, "mature baobab carbon pools should produce a persistent seed bank");
assert.ok(seedModel.state.nppBaobab[seedCell] > 0, "baobab seed production should be supported by current positive carbon balance");

const germinationModel = createVegetationTestModel(4);
const germinationCell = 84;
germinationModel.state.sunlight.fill(1);
fillSoilLayer(germinationModel, 0, 0.02);
fillSoilLayer(germinationModel, 1, 0.018);
fillSoilLayer(germinationModel, 2, 0.018);
fillSoilLayer(germinationModel, 3, 0.024);
germinationModel.state.baobabRisk[germinationCell] = 1;
germinationModel.state.baobabSeed[germinationCell] = 0.2;
const germinationSeedBefore = germinationModel.state.baobabSeed[germinationCell];
const germinationMassBefore = germinationModel.state.MB[germinationCell];
const germinationLitterBefore = germinationModel.state.litterCarbon[germinationCell];
germinationModel.step();
assert.ok(germinationModel.state.baobabGermination[germinationCell] > 0, "baobab seed bank should germinate under suitable conditions");
assert.ok(germinationModel.state.MB[germinationCell] > germinationMassBefore, "baobab germination should add to plant carbon pools");
assert.ok(germinationModel.state.baobabSeed[germinationCell] < germinationSeedBefore, "baobab germination should consume seed bank carbon");
assert.ok(germinationModel.state.litterCarbon[germinationCell] > germinationLitterBefore, "failed seed establishment should return carbon to litter");

const wetReadinessModel = createVegetationTestModel(4);
const dryReadinessModel = createVegetationTestModel(4);
for (const model of [wetReadinessModel, dryReadinessModel]) {
  model.state.sunlight.fill(1);
  model.state.baobabRisk[germinationCell] = 1;
  model.state.baobabSeed[germinationCell] = 0.2;
  model.state.baobabGerminationReadiness[germinationCell] = 0;
}
fillSoilLayer(wetReadinessModel, 0, 0.02);
fillSoilLayer(wetReadinessModel, 1, 0.018);
fillSoilLayer(wetReadinessModel, 2, 0.018);
fillSoilLayer(wetReadinessModel, 3, 0.024);
fillSoilLayer(dryReadinessModel, 0, 0.001);
fillSoilLayer(dryReadinessModel, 1, 0.001);
fillSoilLayer(dryReadinessModel, 2, 0.001);
fillSoilLayer(dryReadinessModel, 3, 0.001);
for (let stepIndex = 0; stepIndex < Math.ceil(1.35 / MODEL_DT_DAYS); stepIndex += 1) {
  wetReadinessModel.step();
  dryReadinessModel.step();
}
assert.ok(
  wetReadinessModel.state.baobabGerminationReadiness[germinationCell] >
    dryReadinessModel.state.baobabGerminationReadiness[germinationCell] + 0.2,
  "seed germination readiness should accumulate under warm wet conditions"
);
assert.ok(
  wetReadinessModel.state.baobabGermination[germinationCell] >
    dryReadinessModel.state.baobabGermination[germinationCell],
  "hydrothermal readiness should make wet seeds germinate more than dry seeds"
);
const syncedSeedState = {
  moisture: new Float32Array(germinationModel.size),
  soil: new Float32Array(germinationModel.size),
  baobab: new Float32Array(germinationModel.size),
  flower: new Float32Array(germinationModel.size),
  topSoilWater: new Float32Array(germinationModel.size),
  midSoilWater: new Float32Array(germinationModel.size),
  deepSoilWater: new Float32Array(germinationModel.size),
  topSoilHeadM: new Float32Array(germinationModel.size),
  midSoilHeadM: new Float32Array(germinationModel.size),
  deepSoilHeadM: new Float32Array(germinationModel.size),
  topSoilHeadNorm: new Float32Array(germinationModel.size),
  midSoilHeadNorm: new Float32Array(germinationModel.size),
  deepSoilHeadNorm: new Float32Array(germinationModel.size),
  topSoilConductivityMDay: new Float32Array(germinationModel.size),
  midSoilConductivityMDay: new Float32Array(germinationModel.size),
  deepSoilConductivityMDay: new Float32Array(germinationModel.size),
  topSoilConductivityNorm: new Float32Array(germinationModel.size),
  midSoilConductivityNorm: new Float32Array(germinationModel.size),
  deepSoilConductivityNorm: new Float32Array(germinationModel.size),
  groundwaterHeadM: new Float32Array(germinationModel.size),
  groundwaterHeadNorm: new Float32Array(germinationModel.size),
  topMatricPotentialM: new Float32Array(germinationModel.size),
  soilWaterPotential: new Float32Array(germinationModel.size),
  rootStressBaobab: new Float32Array(germinationModel.size),
  rootStressRose: new Float32Array(germinationModel.size),
  nutrientStressBaobab: new Float32Array(germinationModel.size),
  nutrientStressRose: new Float32Array(germinationModel.size),
  par: new Float32Array(germinationModel.size),
  atmosphericCo2Ppm: new Float32Array(germinationModel.size),
  tempStressBaobab: new Float32Array(germinationModel.size),
  tempStressRose: new Float32Array(germinationModel.size),
  vpdStressBaobab: new Float32Array(germinationModel.size),
  vpdStressRose: new Float32Array(germinationModel.size),
  co2StressBaobab: new Float32Array(germinationModel.size),
  co2StressRose: new Float32Array(germinationModel.size),
  photosynthesisStressBaobab: new Float32Array(germinationModel.size),
  photosynthesisStressRose: new Float32Array(germinationModel.size),
  laiBaobab: new Float32Array(germinationModel.size),
  laiRose: new Float32Array(germinationModel.size),
  coverBaobab: new Float32Array(germinationModel.size),
  coverRose: new Float32Array(germinationModel.size),
  vegetationCover: new Float32Array(germinationModel.size),
  aparTotal: new Float32Array(germinationModel.size),
  aparBaobab: new Float32Array(germinationModel.size),
  aparRose: new Float32Array(germinationModel.size),
  lueGppBaobab: new Float32Array(germinationModel.size),
  lueGppRose: new Float32Array(germinationModel.size),
  gppBaobab: new Float32Array(germinationModel.size),
  gppRose: new Float32Array(germinationModel.size),
  nppBaobab: new Float32Array(germinationModel.size),
  nppRose: new Float32Array(germinationModel.size),
  soilNutrient: new Float32Array(germinationModel.size),
  litterCarbon: new Float32Array(germinationModel.size),
  soilOrganicCarbon: new Float32Array(germinationModel.size),
  soilActiveCarbon: new Float32Array(germinationModel.size),
  soilStableCarbon: new Float32Array(germinationModel.size),
  litterFastCarbonGC: new Float32Array(germinationModel.size),
  litterSlowCarbonGC: new Float32Array(germinationModel.size),
  soilActiveCarbonGC: new Float32Array(germinationModel.size),
  soilStableCarbonGC: new Float32Array(germinationModel.size),
  soilCarbonRespiration: new Float32Array(germinationModel.size),
  carbonBalanceBaobab: new Float32Array(germinationModel.size),
  carbonBalanceRose: new Float32Array(germinationModel.size),
  maintenanceRespirationBaobab: new Float32Array(germinationModel.size),
  maintenanceRespirationRose: new Float32Array(germinationModel.size),
  growthRespirationBaobab: new Float32Array(germinationModel.size),
  growthRespirationRose: new Float32Array(germinationModel.size),
  autotrophicRespirationBaobab: new Float32Array(germinationModel.size),
  autotrophicRespirationRose: new Float32Array(germinationModel.size),
  carbonInputGC: new Float32Array(germinationModel.size),
  carbonRespirationGC: new Float32Array(germinationModel.size),
  carbonTransportGC: new Float32Array(germinationModel.size),
  carbonDisturbanceGC: new Float32Array(germinationModel.size),
  carbonStorageChangeGC: new Float32Array(germinationModel.size),
  carbonResidualGC: new Float32Array(germinationModel.size),
  disturbanceCarbonExportGC: new Float32Array(germinationModel.size),
  ecosystemCarbonGC: new Float32Array(germinationModel.size),
  plantCarbonGC: new Float32Array(germinationModel.size),
  seedCarbonGC: new Float32Array(germinationModel.size),
  litterPoolCarbonGC: new Float32Array(germinationModel.size),
  soilOrganicCarbonGC: new Float32Array(germinationModel.size),
  netEcosystemProductionGC: new Float32Array(germinationModel.size),
  baobabPlantCarbonGC: new Float32Array(germinationModel.size),
  baobabLeafCarbonGC: new Float32Array(germinationModel.size),
  baobabStemCarbonGC: new Float32Array(germinationModel.size),
  baobabRootCarbonGC: new Float32Array(germinationModel.size),
  baobabStoreCarbonGC: new Float32Array(germinationModel.size),
  rosePlantCarbonGC: new Float32Array(germinationModel.size),
  roseLeafCarbonGC: new Float32Array(germinationModel.size),
  roseFlowerCarbonGC: new Float32Array(germinationModel.size),
  roseRootCarbonGC: new Float32Array(germinationModel.size),
  roseStoreCarbonGC: new Float32Array(germinationModel.size),
  baobabAllocLeaf: new Float32Array(germinationModel.size),
  baobabAllocStem: new Float32Array(germinationModel.size),
  baobabAllocRoot: new Float32Array(germinationModel.size),
  baobabAllocStore: new Float32Array(germinationModel.size),
  baobabAllocLeafGC: new Float32Array(germinationModel.size),
  baobabAllocStemGC: new Float32Array(germinationModel.size),
  baobabAllocRootGC: new Float32Array(germinationModel.size),
  baobabAllocStoreGC: new Float32Array(germinationModel.size),
  roseAllocLeaf: new Float32Array(germinationModel.size),
  roseAllocFlower: new Float32Array(germinationModel.size),
  roseAllocRoot: new Float32Array(germinationModel.size),
  roseAllocStore: new Float32Array(germinationModel.size),
  roseAllocLeafGC: new Float32Array(germinationModel.size),
  roseAllocFlowerGC: new Float32Array(germinationModel.size),
  roseAllocRootGC: new Float32Array(germinationModel.size),
  roseAllocStoreGC: new Float32Array(germinationModel.size),
  baobabLeafLossGC: new Float32Array(germinationModel.size),
  baobabStemLossGC: new Float32Array(germinationModel.size),
  baobabRootLossGC: new Float32Array(germinationModel.size),
  baobabLeafResidualGC: new Float32Array(germinationModel.size),
  baobabStemResidualGC: new Float32Array(germinationModel.size),
  baobabRootResidualGC: new Float32Array(germinationModel.size),
  baobabStoreResidualGC: new Float32Array(germinationModel.size),
  roseLeafLossGC: new Float32Array(germinationModel.size),
  roseFlowerLossGC: new Float32Array(germinationModel.size),
  roseRootLossGC: new Float32Array(germinationModel.size),
  roseLeafResidualGC: new Float32Array(germinationModel.size),
  roseFlowerResidualGC: new Float32Array(germinationModel.size),
  roseRootResidualGC: new Float32Array(germinationModel.size),
  roseStoreResidualGC: new Float32Array(germinationModel.size),
  litterInputCarbon: new Float32Array(germinationModel.size),
  litterInputBaobabGC: new Float32Array(germinationModel.size),
  litterInputRoseGC: new Float32Array(germinationModel.size),
  litterInputSeedGC: new Float32Array(germinationModel.size),
  litterFastInputGC: new Float32Array(germinationModel.size),
  litterSlowInputGC: new Float32Array(germinationModel.size),
  litterFastDecayGC: new Float32Array(germinationModel.size),
  litterSlowDecayGC: new Float32Array(germinationModel.size),
  litterHumificationGC: new Float32Array(germinationModel.size),
  litterFastResidualGC: new Float32Array(germinationModel.size),
  litterSlowResidualGC: new Float32Array(germinationModel.size),
  soilActiveDecayGC: new Float32Array(germinationModel.size),
  soilStabilizationGC: new Float32Array(germinationModel.size),
  soilStableDecayGC: new Float32Array(germinationModel.size),
  litterRespirationGC: new Float32Array(germinationModel.size),
  soilActiveRespirationGC: new Float32Array(germinationModel.size),
  soilStableRespirationGC: new Float32Array(germinationModel.size),
  soilActiveResidualGC: new Float32Array(germinationModel.size),
  soilStableResidualGC: new Float32Array(germinationModel.size),
  hydrologyInputMm: new Float32Array(germinationModel.size),
  hydrologyLossMm: new Float32Array(germinationModel.size),
  hydrologyHorizontalMm: new Float32Array(germinationModel.size),
  hydrologyInfiltrationMm: new Float32Array(germinationModel.size),
  hydrologyPercolation01Mm: new Float32Array(germinationModel.size),
  hydrologyPercolation12Mm: new Float32Array(germinationModel.size),
  hydrologyRechargeMm: new Float32Array(germinationModel.size),
  hydrologyLeakageMm: new Float32Array(germinationModel.size),
  hydrologyStorageChangeMm: new Float32Array(germinationModel.size),
  hydrologyResidualMm: new Float32Array(germinationModel.size),
  baobabSeedBank: new Float32Array(germinationModel.size),
  baobabGermination: new Float32Array(germinationModel.size)
};
germinationModel.syncToGame(syncedSeedState);
assert.ok(
  syncedSeedState.topSoilWater[germinationCell] >= 0 && syncedSeedState.topSoilWater[germinationCell] <= 1,
  "game state should expose normalized top-layer soil water"
);
assert.ok(
  syncedSeedState.midSoilWater[germinationCell] >= 0 && syncedSeedState.midSoilWater[germinationCell] <= 1,
  "game state should expose normalized middle-layer soil water"
);
assert.ok(
  syncedSeedState.deepSoilWater[germinationCell] >= 0 && syncedSeedState.deepSoilWater[germinationCell] <= 1,
  "game state should expose normalized deep-layer soil water"
);
assert.ok(Number.isFinite(syncedSeedState.topSoilHeadM[germinationCell]), "game state should expose shallow-layer soil hydraulic head");
assert.ok(Number.isFinite(syncedSeedState.midSoilHeadM[germinationCell]), "game state should expose middle-layer soil hydraulic head");
assert.ok(Number.isFinite(syncedSeedState.deepSoilHeadM[germinationCell]), "game state should expose deep-layer soil hydraulic head");
assert.ok(
  syncedSeedState.topSoilHeadNorm[germinationCell] >= 0 && syncedSeedState.topSoilHeadNorm[germinationCell] <= 1,
  "game state should expose normalized shallow-layer soil hydraulic head"
);
assert.ok(
  syncedSeedState.midSoilHeadNorm[germinationCell] >= 0 && syncedSeedState.midSoilHeadNorm[germinationCell] <= 1,
  "game state should expose normalized middle-layer soil hydraulic head"
);
assert.ok(
  syncedSeedState.deepSoilHeadNorm[germinationCell] >= 0 && syncedSeedState.deepSoilHeadNorm[germinationCell] <= 1,
  "game state should expose normalized deep-layer soil hydraulic head"
);
assert.ok(syncedSeedState.topSoilConductivityMDay[germinationCell] >= 0, "game state should expose shallow-layer soil hydraulic conductivity");
assert.ok(syncedSeedState.midSoilConductivityMDay[germinationCell] >= 0, "game state should expose middle-layer soil hydraulic conductivity");
assert.ok(syncedSeedState.deepSoilConductivityMDay[germinationCell] >= 0, "game state should expose deep-layer soil hydraulic conductivity");
assert.ok(
  syncedSeedState.topSoilConductivityNorm[germinationCell] >= 0 && syncedSeedState.topSoilConductivityNorm[germinationCell] <= 1,
  "game state should expose normalized shallow-layer soil hydraulic conductivity"
);
assert.ok(
  syncedSeedState.midSoilConductivityNorm[germinationCell] >= 0 && syncedSeedState.midSoilConductivityNorm[germinationCell] <= 1,
  "game state should expose normalized middle-layer soil hydraulic conductivity"
);
assert.ok(
  syncedSeedState.deepSoilConductivityNorm[germinationCell] >= 0 && syncedSeedState.deepSoilConductivityNorm[germinationCell] <= 1,
  "game state should expose normalized deep-layer soil hydraulic conductivity"
);
assert.ok(Number.isFinite(syncedSeedState.groundwaterHeadM[germinationCell]), "game state should expose groundwater hydraulic head");
assert.ok(
  syncedSeedState.groundwaterHeadNorm[germinationCell] >= 0 && syncedSeedState.groundwaterHeadNorm[germinationCell] <= 1,
  "game state should expose normalized groundwater hydraulic head"
);
assert.ok(syncedSeedState.topMatricPotentialM[germinationCell] <= 0, "game state should expose top-layer matric potential");
assert.ok(
  syncedSeedState.soilWaterPotential[germinationCell] >= 0 && syncedSeedState.soilWaterPotential[germinationCell] <= 1,
  "game state should expose normalized soil-water potential"
);
assert.ok(
  syncedSeedState.rootStressBaobab[germinationCell] >= 0 && syncedSeedState.rootStressBaobab[germinationCell] <= 1,
  "game state should expose baobab root-water stress"
);
assert.ok(
  syncedSeedState.rootStressRose[germinationCell] >= 0 && syncedSeedState.rootStressRose[germinationCell] <= 1,
  "game state should expose rose root-water stress"
);
for (const key of [
  "nutrientStressBaobab",
  "nutrientStressRose",
  "tempStressBaobab",
  "tempStressRose",
  "vpdStressBaobab",
  "vpdStressRose",
  "co2StressBaobab",
  "co2StressRose",
  "photosynthesisStressBaobab",
  "photosynthesisStressRose"
]) {
  assert.ok(
    syncedSeedState[key][germinationCell] >= 0 && syncedSeedState[key][germinationCell] <= 1,
    `game state should expose bounded ${key}`
  );
}
assert.ok(Number.isFinite(syncedSeedState.par[germinationCell]), "game state should expose incoming PAR");
assert.equal(syncedSeedState.atmosphericCo2Ppm[germinationCell], germinationModel.getParams().atmosphericCo2Ppm, "game state should expose atmospheric CO2 forcing");
assert.ok(Number.isFinite(syncedSeedState.laiBaobab[germinationCell]), "game state should expose baobab LAI");
assert.ok(Number.isFinite(syncedSeedState.laiRose[germinationCell]), "game state should expose rose LAI");
assert.ok(
  syncedSeedState.vegetationCover[germinationCell] >= 0 && syncedSeedState.vegetationCover[germinationCell] <= 1,
  "game state should expose bounded vegetation cover"
);
assert.ok(
  syncedSeedState.coverBaobab[germinationCell] >= 0 && syncedSeedState.coverBaobab[germinationCell] <= 1,
  "game state should expose bounded baobab PFT cover"
);
assert.ok(
  syncedSeedState.coverRose[germinationCell] >= 0 && syncedSeedState.coverRose[germinationCell] <= 1,
  "game state should expose bounded rose PFT cover"
);
assert.ok(Number.isFinite(syncedSeedState.aparTotal[germinationCell]), "game state should expose total absorbed PAR");
assert.ok(Number.isFinite(syncedSeedState.aparBaobab[germinationCell]), "game state should expose baobab absorbed PAR");
assert.ok(Number.isFinite(syncedSeedState.aparRose[germinationCell]), "game state should expose rose absorbed PAR");
assert.ok(Number.isFinite(syncedSeedState.lueGppBaobab[germinationCell]), "game state should expose baobab LUE GPP");
assert.ok(Number.isFinite(syncedSeedState.lueGppRose[germinationCell]), "game state should expose rose LUE GPP");
assert.ok(Number.isFinite(syncedSeedState.gppBaobab[germinationCell]), "game state should expose baobab GPP");
assert.ok(Number.isFinite(syncedSeedState.gppRose[germinationCell]), "game state should expose rose GPP");
assert.ok(Number.isFinite(syncedSeedState.nppBaobab[germinationCell]), "game state should expose baobab NPP");
assert.ok(Number.isFinite(syncedSeedState.nppRose[germinationCell]), "game state should expose rose NPP");
assert.ok(
  syncedSeedState.soilNutrient[germinationCell] >= 0 && syncedSeedState.soilNutrient[germinationCell] <= 1,
  "game state should expose mineral soil nutrients"
);
assert.ok(
  syncedSeedState.litterCarbon[germinationCell] >= 0 && syncedSeedState.litterCarbon[germinationCell] <= 1,
  "game state should expose litter carbon"
);
assert.ok(
  syncedSeedState.soilOrganicCarbon[germinationCell] >= 0 && syncedSeedState.soilOrganicCarbon[germinationCell] <= 1,
  "game state should expose normalized soil organic carbon"
);
assert.ok(
  syncedSeedState.soilActiveCarbon[germinationCell] >= 0 && syncedSeedState.soilActiveCarbon[germinationCell] <= 1,
  "game state should expose normalized active soil organic carbon"
);
assert.ok(
  syncedSeedState.soilStableCarbon[germinationCell] >= 0 && syncedSeedState.soilStableCarbon[germinationCell] <= 1,
  "game state should expose normalized stable soil organic carbon"
);
for (const [key, modelKey] of [
  ["litterFastCarbonGC", "litterFastCarbon"],
  ["litterSlowCarbonGC", "litterSlowCarbon"],
  ["soilActiveCarbonGC", "soilCarbonActive"],
  ["soilStableCarbonGC", "soilCarbonStable"]
]) {
  assert.ok(Number.isFinite(syncedSeedState[key][germinationCell]), `game state should expose ${key}`);
  assert.ok(
    Math.abs(syncedSeedState[key][germinationCell] - germinationModel.state[modelKey][germinationCell] * 1000) < 1e-5,
    `${key} should expose ${modelKey} in gC/m2`
  );
}
assert.ok(Number.isFinite(syncedSeedState.soilCarbonRespiration[germinationCell]), "game state should expose soil carbon respiration");
assert.ok(Number.isFinite(syncedSeedState.carbonBalanceBaobab[germinationCell]), "game state should expose baobab carbon balance");
assert.ok(Number.isFinite(syncedSeedState.carbonBalanceRose[germinationCell]), "game state should expose rose carbon balance");
assert.ok(Number.isFinite(syncedSeedState.maintenanceRespirationBaobab[germinationCell]), "game state should expose baobab maintenance respiration");
assert.ok(Number.isFinite(syncedSeedState.maintenanceRespirationRose[germinationCell]), "game state should expose rose maintenance respiration");
assert.ok(Number.isFinite(syncedSeedState.growthRespirationBaobab[germinationCell]), "game state should expose baobab growth respiration");
assert.ok(Number.isFinite(syncedSeedState.growthRespirationRose[germinationCell]), "game state should expose rose growth respiration");
assert.ok(Number.isFinite(syncedSeedState.autotrophicRespirationBaobab[germinationCell]), "game state should expose baobab plant respiration");
assert.ok(Number.isFinite(syncedSeedState.autotrophicRespirationRose[germinationCell]), "game state should expose rose plant respiration");
assert.ok(Number.isFinite(syncedSeedState.carbonInputGC[germinationCell]), "game state should expose carbon budget input");
assert.ok(Number.isFinite(syncedSeedState.carbonRespirationGC[germinationCell]), "game state should expose carbon budget respiration loss");
assert.ok(Number.isFinite(syncedSeedState.carbonTransportGC[germinationCell]), "game state should expose carbon budget seed transport");
assert.ok(Number.isFinite(syncedSeedState.carbonDisturbanceGC[germinationCell]), "game state should expose carbon budget disturbance export");
assert.ok(Number.isFinite(syncedSeedState.carbonStorageChangeGC[germinationCell]), "game state should expose carbon budget storage change");
assert.ok(Number.isFinite(syncedSeedState.carbonResidualGC[germinationCell]), "game state should expose carbon budget residual");
assert.ok(Number.isFinite(syncedSeedState.disturbanceCarbonExportGC[germinationCell]), "game state should expose disturbance carbon export");
for (const key of [
  "ecosystemCarbonGC",
  "plantCarbonGC",
  "seedCarbonGC",
  "litterPoolCarbonGC",
  "soilOrganicCarbonGC",
  "netEcosystemProductionGC"
]) {
  assert.ok(Number.isFinite(syncedSeedState[key][germinationCell]), `game state should expose ${key}`);
}
assert.ok(
  Math.abs(
    syncedSeedState.ecosystemCarbonGC[germinationCell] -
      (syncedSeedState.plantCarbonGC[germinationCell] +
        syncedSeedState.seedCarbonGC[germinationCell] +
        syncedSeedState.litterPoolCarbonGC[germinationCell] +
        syncedSeedState.soilOrganicCarbonGC[germinationCell])
  ) < 1e-4,
  "game state ecosystem carbon components should sum to total ecosystem carbon"
);
assert.ok(
  Math.abs(
    syncedSeedState.baobabPlantCarbonGC[germinationCell] -
      (germinationModel.state.baobabLeaf[germinationCell] +
        germinationModel.state.baobabStem[germinationCell] +
        germinationModel.state.baobabRoot[germinationCell] +
        germinationModel.state.baobabStore[germinationCell]) *
        1000
  ) < 1e-5,
  "game state should expose total baobab plant carbon B_i,k in gC/m2"
);
assert.ok(
  Math.abs(
    syncedSeedState.rosePlantCarbonGC[germinationCell] -
      (germinationModel.state.roseLeaf[germinationCell] +
        germinationModel.state.roseFlower[germinationCell] +
        germinationModel.state.roseRoot[germinationCell] +
        germinationModel.state.roseStore[germinationCell]) *
        1000
  ) < 1e-5,
  "game state should expose total rose plant carbon B_i,k in gC/m2"
);
for (const [key, modelKey] of [
  ["baobabLeafCarbonGC", "baobabLeaf"],
  ["baobabStemCarbonGC", "baobabStem"],
  ["baobabRootCarbonGC", "baobabRoot"],
  ["baobabStoreCarbonGC", "baobabStore"],
  ["roseLeafCarbonGC", "roseLeaf"],
  ["roseFlowerCarbonGC", "roseFlower"],
  ["roseRootCarbonGC", "roseRoot"],
  ["roseStoreCarbonGC", "roseStore"]
]) {
  assert.ok(Number.isFinite(syncedSeedState[key][germinationCell]), `game state should expose ${key}`);
  assert.ok(
    Math.abs(syncedSeedState[key][germinationCell] - germinationModel.state[modelKey][germinationCell] * 1000) < 1e-5,
    `${key} should expose ${modelKey} in gC/m2`
  );
}
assert.ok(Number.isFinite(syncedSeedState.baobabAllocLeaf[germinationCell]), "game state should expose baobab leaf carbon allocation");
assert.ok(Number.isFinite(syncedSeedState.baobabAllocStem[germinationCell]), "game state should expose baobab stem carbon allocation");
assert.ok(Number.isFinite(syncedSeedState.baobabAllocRoot[germinationCell]), "game state should expose baobab root carbon allocation");
assert.ok(Number.isFinite(syncedSeedState.baobabAllocStore[germinationCell]), "game state should expose baobab storage carbon allocation");
assert.ok(Number.isFinite(syncedSeedState.roseAllocLeaf[germinationCell]), "game state should expose rose leaf carbon allocation");
assert.ok(Number.isFinite(syncedSeedState.roseAllocFlower[germinationCell]), "game state should expose rose flower carbon allocation");
assert.ok(Number.isFinite(syncedSeedState.roseAllocRoot[germinationCell]), "game state should expose rose root carbon allocation");
assert.ok(Number.isFinite(syncedSeedState.roseAllocStore[germinationCell]), "game state should expose rose storage carbon allocation");
for (const key of [
  "baobabAllocLeaf",
  "baobabAllocStem",
  "baobabAllocRoot",
  "baobabAllocStore",
  "roseAllocLeaf",
  "roseAllocFlower",
  "roseAllocRoot",
  "roseAllocStore"
]) {
  assert.ok(
    syncedSeedState[key][germinationCell] >= 0 && syncedSeedState[key][germinationCell] <= 1,
    `game state should expose bounded ${key} allocation fraction`
  );
}
for (const key of [
  "baobabAllocLeafGC",
  "baobabAllocStemGC",
  "baobabAllocRootGC",
  "baobabAllocStoreGC",
  "roseAllocLeafGC",
  "roseAllocFlowerGC",
  "roseAllocRootGC",
  "roseAllocStoreGC"
]) {
  assert.ok(Number.isFinite(syncedSeedState[key][germinationCell]), `game state should expose ${key} allocation flux`);
}
for (const key of [
  "baobabLeafLossGC",
  "baobabStemLossGC",
  "baobabRootLossGC",
  "roseLeafLossGC",
  "roseFlowerLossGC",
  "roseRootLossGC"
]) {
  assert.ok(Number.isFinite(syncedSeedState[key][germinationCell]), `game state should expose ${key} tissue loss flux`);
}
for (const key of [
  "baobabLeafResidualGC",
  "baobabStemResidualGC",
  "baobabRootResidualGC",
  "baobabStoreResidualGC",
  "roseLeafResidualGC",
  "roseFlowerResidualGC",
  "roseRootResidualGC",
  "roseStoreResidualGC"
]) {
  assert.ok(Number.isFinite(syncedSeedState[key][germinationCell]), `game state should expose ${key} plant pool residual`);
}
assert.ok(Number.isFinite(syncedSeedState.litterInputCarbon[germinationCell]), "game state should expose plant-to-litter carbon input");
for (const key of ["litterInputBaobabGC", "litterInputRoseGC", "litterInputSeedGC"]) {
  assert.ok(Number.isFinite(syncedSeedState[key][germinationCell]), `game state should expose ${key} litter source flux`);
}
assert.ok(
  Math.abs(
    syncedSeedState.litterInputBaobabGC[germinationCell] +
      syncedSeedState.litterInputRoseGC[germinationCell] +
      syncedSeedState.litterInputSeedGC[germinationCell] -
      (syncedSeedState.litterFastInputGC[germinationCell] + syncedSeedState.litterSlowInputGC[germinationCell])
  ) < 1e-4,
  "game state litter source fluxes should sum to fast plus slow litter input"
);
for (const key of [
  "litterFastInputGC",
  "litterSlowInputGC",
  "litterFastDecayGC",
  "litterSlowDecayGC",
  "litterHumificationGC",
  "litterFastResidualGC",
  "litterSlowResidualGC",
  "soilActiveDecayGC",
  "soilStabilizationGC",
  "soilStableDecayGC",
  "litterRespirationGC",
  "soilActiveRespirationGC",
  "soilStableRespirationGC",
  "soilActiveResidualGC",
  "soilStableResidualGC"
]) {
  assert.ok(Number.isFinite(syncedSeedState[key][germinationCell]), `game state should expose ${key} soil carbon flux`);
}
assert.ok(
  Math.abs(
    syncedSeedState.soilCarbonRespiration[germinationCell] * 1000 -
      (syncedSeedState.litterRespirationGC[germinationCell] +
        syncedSeedState.soilActiveRespirationGC[germinationCell] +
        syncedSeedState.soilStableRespirationGC[germinationCell])
  ) < 1e-4,
  "game state soil respiration components should sum to total soil respiration"
);
assert.ok(Number.isFinite(syncedSeedState.hydrologyInputMm[germinationCell]), "game state should expose hydrology budget input");
assert.ok(Number.isFinite(syncedSeedState.hydrologyLossMm[germinationCell]), "game state should expose hydrology budget losses");
assert.ok(Number.isFinite(syncedSeedState.hydrologyHorizontalMm[germinationCell]), "game state should expose hydrology horizontal transport");
assert.ok(Number.isFinite(syncedSeedState.hydrologyInfiltrationMm[germinationCell]), "game state should expose hydrology infiltration");
assert.ok(Number.isFinite(syncedSeedState.hydrologyPercolation01Mm[germinationCell]), "game state should expose shallow-to-middle hydrology flux");
assert.ok(Number.isFinite(syncedSeedState.hydrologyPercolation12Mm[germinationCell]), "game state should expose middle-to-deep hydrology flux");
assert.ok(Number.isFinite(syncedSeedState.hydrologyRechargeMm[germinationCell]), "game state should expose groundwater recharge");
assert.ok(Number.isFinite(syncedSeedState.hydrologyLeakageMm[germinationCell]), "game state should expose groundwater leakage");
assert.ok(
  Number.isFinite(syncedSeedState.hydrologyStorageChangeMm[germinationCell]),
  "game state should expose hydrology budget storage change"
);
assert.ok(Number.isFinite(syncedSeedState.hydrologyResidualMm[germinationCell]), "game state should expose hydrology budget residual");
assert.ok(syncedSeedState.baobabSeedBank[germinationCell] > 0, "game state should expose the baobab seed bank diagnostic");
assert.equal(
  syncedSeedState.baobabGermination[germinationCell],
  germinationModel.state.baobabGermination[germinationCell],
  "game state should expose the baobab germination diagnostic"
);

const goTopology = createHealpixVertexTopology(2);
const goPoleIds = createPoleSet(goTopology);
const goInitial = createGoState(goTopology);
assert.equal(goTopology.vertices.length, 50, "NSIDE 2 HEALPix pixel vertices should include 50 unique points");
assert.equal(goPoleIds.size, 2, "HEALPix Go should treat the two polar vertices as board holes");
assert.equal(validGoMoves(goTopology, goInitial, goPoleIds).length, 48, "all non-polar vertices start legal");
const goTopologyNside4 = createHealpixVertexTopology(4);
const goPoleIdsNside4 = createPoleSet(goTopologyNside4);
assert.equal(goTopologyNside4.vertices.length, 194, "NSIDE 4 HEALPix pixel vertices should include 194 unique points");
assert.equal(goPoleIdsNside4.size, 2, "NSIDE 4 HEALPix Go should still have two polar board holes");
assert.equal(
  validGoMoves(goTopologyNside4, createGoState(goTopologyNside4), goPoleIdsNside4).length,
  192,
  "all non-polar NSIDE 4 vertices start legal"
);
for (const poleId of goPoleIds) {
  assert.equal(analyzeGoMove(goTopology, goInitial, poleId, goPoleIds).reason, "pole");
}
const goOpening = validGoMoves(goTopology, goInitial, goPoleIds)[0];
const afterGoOpening = applyGoMove(goTopology, goInitial, goOpening, goPoleIds);
assert.ok(afterGoOpening, "a legal HEALPix Go move should apply");
assert.equal(afterGoOpening.current, WHITE);
assert.equal(afterGoOpening.moveNumbers[goOpening], 1, "HEALPix Go should keep the displayed move order");
assert.equal(scoreGoGame(goTopology, afterGoOpening, goPoleIds).blackStones, 1);
assert.equal(passGoTurn(passGoTurn(afterGoOpening)).gameOver, true, "two passes should end HEALPix Go");
assert.ok(
  validGoMoves(goTopology, goInitial, goPoleIds).includes(chooseGoNpcMove(goTopology, goInitial, goPoleIds)),
  "HEALPix Go NPC should choose a legal opening move"
);
const weakGoOpening = chooseGoNpcMove(goTopology, goInitial, goPoleIds, { level: "weak" });
assert.ok(
  validGoMoves(goTopology, goInitial, goPoleIds).includes(weakGoOpening),
  "weak HEALPix Go NPC should still choose a legal opening move"
);
for (const difficulty of ["medium", "strong", "expert", "god"]) {
  const npcMove = chooseGoNpcMove(goTopology, goInitial, goPoleIds, { level: difficulty });
  assert.ok(
    npcMove === null || validGoMoves(goTopology, goInitial, goPoleIds).includes(npcMove),
    `${difficulty} HEALPix Go NPC should choose a legal opening move or pass`
  );
}
assert.equal(
  chooseGoNpcMove(goTopology, goInitial, goPoleIds, { level: "expert" }),
  chooseGoNpcMove(goTopology, goInitial, goPoleIds, { level: "expert" }),
  "expert HEALPix Go NPC should be deterministic for the same position"
);
assert.equal(
  chooseGoNpcMove(goTopology, goInitial, goPoleIds, { level: "god" }),
  chooseGoNpcMove(goTopology, goInitial, goPoleIds, { level: "god" }),
  "god HEALPix Go NPC should be deterministic for the same position"
);

const blackTerritoryToyTopology = {
  vertices: Array.from({ length: 6 }, (_, id) => ({ id })),
  neighbors(vertexId) {
    return [
      [1, 2, 3, 4],
      [0, 2, 4, 5],
      [0, 1, 3],
      [0, 2, 4],
      [0, 1, 3],
      [1]
    ][vertexId];
  }
};
const blackTerritoryState = createGoState(blackTerritoryToyTopology);
blackTerritoryState.board = [EMPTY, BLACK, BLACK, BLACK, BLACK, EMPTY];
assert.equal(
  chooseGoNpcMove(blackTerritoryToyTopology, blackTerritoryState, new Set()),
  null,
  "Go NPC should pass instead of filling its own territory"
);
for (const difficulty of ["medium", "strong", "expert", "god"]) {
  assert.equal(
    chooseGoNpcMove(blackTerritoryToyTopology, blackTerritoryState, new Set(), { level: difficulty }),
    null,
    `${difficulty} Go NPC should pass instead of filling its own territory`
  );
}
const lateNeutralToyTopology = {
  vertices: Array.from({ length: 6 }, (_, id) => ({ id })),
  neighbors(vertexId) {
    return [
      [1],
      [0],
      [3],
      [2],
      [5],
      [4]
    ][vertexId];
  }
};
const lateNeutralState = createGoState(lateNeutralToyTopology);
lateNeutralState.board = [BLACK, WHITE, BLACK, WHITE, EMPTY, EMPTY];
lateNeutralState.moveCount = 16;
for (const difficulty of ["medium", "strong", "expert", "god"]) {
  assert.equal(
    chooseGoNpcMove(lateNeutralToyTopology, lateNeutralState, new Set(), { level: difficulty }),
    null,
    `${difficulty} Go NPC should pass instead of filling disconnected late neutral points`
  );
}
const captureOrderToyTopology = {
  vertices: Array.from({ length: 4 }, (_, id) => ({ id })),
  neighbors(vertexId) {
    return [
      [1, 2, 3],
      [0],
      [0],
      [0]
    ][vertexId];
  }
};
const captureOrderState = createGoState(captureOrderToyTopology);
captureOrderState.board = [WHITE, BLACK, BLACK, EMPTY];
captureOrderState.moveNumbers = [3, 1, 2, null];
captureOrderState.moveCount = 3;
const afterCaptureOrder = applyGoMove(captureOrderToyTopology, captureOrderState, 3, new Set());
assert.equal(afterCaptureOrder.moveNumbers[0], null, "captured Go stones should lose their displayed move order");
assert.equal(afterCaptureOrder.moveNumbers[3], 4, "new Go stones should receive the next displayed move order");
const deadStoneState = createGoState(blackTerritoryToyTopology);
deadStoneState.gameOver = true;
deadStoneState.board = [EMPTY, BLACK, BLACK, BLACK, BLACK, WHITE];
const deadMarkedState = toggleDeadGroup(blackTerritoryToyTopology, deadStoneState, 5, new Set());
assert.equal(deadMarkedState.deadStones.has(5), true, "dead stone marking should toggle a whole group");
assert.equal(scoreGoGame(blackTerritoryToyTopology, deadMarkedState, new Set()).blackScore, 3);
assert.equal(classifyGoTerritory(blackTerritoryToyTopology, deadMarkedState, new Set()).ownerByPoint.get(5), BLACK);
assert.equal(resumeGoGame(deadMarkedState).gameOver, false, "scoring should be resumable when players disagree");

const superkoToyTopology = {
  vertices: Array.from({ length: 2 }, (_, id) => ({ id })),
  neighbors(vertexId) {
    return vertexId === 0 ? [1] : [0];
  }
};
const superkoState = createGoState(superkoToyTopology);
superkoState.positionHistory.add("21");
assert.equal(analyzeGoMove(superkoToyTopology, superkoState, 0, new Set()).reason, "ko");

const initial = createInitialState(topology);
assert.deepEqual(countPieces(initial.board), { black: 2, white: 2, empty: 44 });

const blackMoves = validMoves(topology, initial.board, BLACK);
const whiteMoves = validMoves(topology, initial.board, WHITE);
assert.equal(blackMoves.length, 4, "black should have four opening moves");
assert.equal(whiteMoves.length, 4, "white should have four opening moves");

const afterBlack = applyMove(topology, initial, blackMoves[0].cellId);
assert.ok(afterBlack, "a legal black move should apply");
assert.equal(afterBlack.board[blackMoves[0].cellId], BLACK);

const counts = countPieces(afterBlack.board);
assert.equal(counts.black + counts.white + counts.empty, topology.cells.length);
assert.equal(counts.black + counts.white, 5);

function playNpcGame(topology, initialState, difficulty) {
  let sampleState = initialState;
  for (let turn = 0; turn < topology.cells.length + 20 && !sampleState.gameOver; turn += 1) {
    const sampleMoves = validMoves(topology, sampleState.board, sampleState.current);
    if (sampleMoves.length === 0) {
      const passed = passTurn(topology, sampleState);
      if (!passed) {
        break;
      }
      sampleState = passed;
      continue;
    }

    const move = chooseAiMove(topology, sampleState.board, sampleState.current, difficulty);
    sampleState = applyMove(topology, sampleState, move.cellId);
  }

  return sampleState;
}

for (const nside of [2]) {
  const variableTopology = createHealpixTopology(nside);
  const variableInitial = createInitialState(variableTopology);
  const variableBlackMoves = validMoves(variableTopology, variableInitial.board, BLACK);
  const variableWhiteMoves = validMoves(variableTopology, variableInitial.board, WHITE);

  assert.equal(variableTopology.cells.length, pixelCount(nside));
  assert.deepEqual(countPieces(variableInitial.board), {
    black: 2,
    white: 2,
    empty: pixelCount(nside) - 4
  });
  assert.equal(variableBlackMoves.length, 4, `black should have four opening moves at NSIDE ${nside}`);
  assert.equal(variableWhiteMoves.length, 4, `white should have four opening moves at NSIDE ${nside}`);
  assert.deepEqual(moveIds(variableBlackMoves), moveIds(bruteValidMoves(variableTopology, variableInitial.board, BLACK)));

  for (const difficulty of ["easy", "normal", "hard", "expert", "god"]) {
    const npcMove = chooseAiMove(variableTopology, variableInitial.board, BLACK, difficulty);
    assert.ok(
      variableBlackMoves.some((move) => move.cellId === npcMove.cellId),
      `${difficulty} NPC should choose a legal NSIDE ${nside} opening`
    );
  }

  const expertMoveA = chooseAiMove(variableTopology, variableInitial.board, BLACK, "expert");
  const expertMoveB = chooseAiMove(variableTopology, variableInitial.board, BLACK, "expert");
  assert.equal(expertMoveA.cellId, expertMoveB.cellId, `expert NPC should be deterministic at NSIDE ${nside}`);

  const godMoveA = chooseAiMove(variableTopology, variableInitial.board, BLACK, "god");
  const godMoveB = chooseAiMove(variableTopology, variableInitial.board, BLACK, "god");
  assert.equal(godMoveA.cellId, godMoveB.cellId, `god NPC should be deterministic at NSIDE ${nside}`);

  let sampleState = variableInitial;
  for (let turn = 0; turn < 8 && !sampleState.gameOver; turn += 1) {
    const sampleMoves = validMoves(variableTopology, sampleState.board, sampleState.current);
    assert.deepEqual(
      moveIds(sampleMoves),
      moveIds(bruteValidMoves(variableTopology, sampleState.board, sampleState.current)),
      `candidate legal moves should match brute-force moves at NSIDE ${nside}`
    );
    if (sampleMoves.length === 0) {
      break;
    }
    sampleState = applyMove(variableTopology, sampleState, sampleMoves[Math.floor(sampleMoves.length / 2)].cellId);
  }
}

const godGame = playNpcGame(topology, initial, "god");
assert.deepEqual(countPieces(godGame.board), {
  black: 24,
  white: 24,
  empty: 0
});

console.log(`logic ok: ${topology.cells.length} HEALPix cells, ${blackMoves.length} black openings`);
