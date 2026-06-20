import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { instantiateAsteroidSimulationCore, loadAsteroidSimulationCoreFromBytes } from "../src/asteroid-sim-core.js";
import {
  __asteroidVegetationDiagnostics,
  createAsteroidVegetationModel,
  MODEL_DT_DAYS
} from "../src/asteroid-vegetation.js";
import { createHealpixTopology } from "../src/healpix.js";

const repoRoot = resolve(import.meta.dirname, "..");
const tmpDir = resolve(repoRoot, ".tmp/native-sim");
const binaryPath = resolve(tmpDir, "asteroid_sim_cli");
const inputPath = resolve(tmpDir, "fixture.bin");
const outputPath = resolve(tmpDir, "output.bin");
const wasmPath = resolve(repoRoot, "public/assets/sim/asteroid_sim.wasm");
const NATIVE_RBF_STENCIL_STRIDE = 12;

mkdirSync(tmpDir, { recursive: true });

execFileSync("gcc", [
  "-std=c11",
  "-O2",
  "-Wall",
  "-Wextra",
  "-Werror",
  resolve(repoRoot, "native/asteroid_sim_cli.c"),
  "-lm",
  "-o",
  binaryPath
]);

await loadAsteroidSimulationCoreFromBytes(readFileSync(wasmPath));
const model = createDiagnosticModel(8);
const baobabSeedDiffusionM2Day = 0;
const roseSeedDiffusionM2Day = 12.5;
const constants = __asteroidVegetationDiagnostics.darcyWaterColumnsConstants(
  model,
  MODEL_DT_DAYS,
  baobabSeedDiffusionM2Day,
  roseSeedDiffusionM2Day
);

writeFileSync(inputPath, buildFixture(model, constants));
execFileSync(binaryPath, [inputPath, outputPath]);
const nativeOutput = parseNativeOutput(readFileSync(outputPath), model.size);

__asteroidVegetationDiagnostics.transportDarcyWaterColumnsRbf(
  model,
  constants.dtDays,
  constants.baobabSeedDiffusionM2Day,
  constants.roseSeedDiffusionM2Day
);

compareArray("soilTransport", model.state.soilTransport, nativeOutput.soilTransport, 5e-5, 2e-5);
compareArray("groundwaterTransport", model.state.groundwaterTransport, nativeOutput.groundwaterTransport, 5e-5, 2e-5);
compareArray("Htransport", model.state.Htransport, nativeOutput.Htransport, 5e-5, 2e-5);
compareArray("soilMineralTransport", model.state.soilMineralTransport, nativeOutput.soilMineralTransport, 5e-5, 2e-5);
compareArray("baobabSeedTransport", model.state.baobabSeedTransport, nativeOutput.baobabSeedTransport, 5e-5, 2e-5);
compareArray("roseSeedTransport", model.state.roseSeedTransport, nativeOutput.roseSeedTransport, 5e-5, 2e-5);
compareArray("surfaceUx", model.state.surfaceUx, nativeOutput.surfaceUx, 5e-5, 2e-5);
compareArray("surfaceUy", model.state.surfaceUy, nativeOutput.surfaceUy, 5e-5, 2e-5);
compareArray("topSoilUx", model.state.topSoilUx, nativeOutput.topSoilUx, 5e-5, 2e-5);
compareArray("topSoilUy", model.state.topSoilUy, nativeOutput.topSoilUy, 5e-5, 2e-5);
compareArray("groundwaterUx", model.state.groundwaterUx, nativeOutput.groundwaterUx, 5e-5, 2e-5);
compareArray("groundwaterUy", model.state.groundwaterUy, nativeOutput.groundwaterUy, 5e-5, 2e-5);

if (existsSync(wasmPath)) {
  const wasmModel = createDiagnosticModel(8);
  const wasmCore = await instantiateAsteroidSimulationCore(readFileSync(wasmPath));
  const hydraulicTables = __asteroidVegetationDiagnostics.hydraulicLookupTablesForWasm();

  const jsHydraulicModel = createDiagnosticModel(8);
  const wasmHydraulicModel = createDiagnosticModel(8);
  const jsCanopyModel = createDiagnosticModel(8);
  const wasmCanopyModel = createDiagnosticModel(8);
  prepareCanopyOpticsDiagnosticState(jsCanopyModel);
  prepareCanopyOpticsDiagnosticState(wasmCanopyModel);
  __asteroidVegetationDiagnostics.updateCanopyOpticsFromInputs(jsCanopyModel);
  assert.equal(wasmCore.runCanopyOptics(wasmCanopyModel, { shade: wasmCanopyModel.params.shade }), true);
  compareArray("wasm canopy laiBaobab", jsCanopyModel.state.laiBaobab, wasmCanopyModel.state.laiBaobab, 5e-5, 2e-5);
  compareArray("wasm canopy laiRose", jsCanopyModel.state.laiRose, wasmCanopyModel.state.laiRose, 5e-5, 2e-5);
  compareArray("wasm canopy coverBaobab", jsCanopyModel.state.coverBaobab, wasmCanopyModel.state.coverBaobab, 5e-5, 2e-5);
  compareArray("wasm canopy coverRose", jsCanopyModel.state.coverRose, wasmCanopyModel.state.coverRose, 5e-5, 2e-5);
  compareArray(
    "wasm canopy vegetationCover",
    jsCanopyModel.state.vegetationCover,
    wasmCanopyModel.state.vegetationCover,
    5e-5,
    2e-5
  );
  compareArray(
    "wasm canopy lightBaobab",
    jsCanopyModel.state.lightBaobab,
    wasmCanopyModel.state.lightBaobab,
    5e-5,
    2e-5
  );
  compareArray("wasm canopy lightRose", jsCanopyModel.state.lightRose, wasmCanopyModel.state.lightRose, 5e-5, 2e-5);

  const boundCanopyModel = createDiagnosticModel(8);
  prepareCanopyOpticsDiagnosticState(boundCanopyModel);
  assert.equal(wasmCore.bindModelState(boundCanopyModel), true);
  assert.equal(wasmCore.runCanopyOptics(boundCanopyModel, { shade: boundCanopyModel.params.shade }), true);
  compareArray("bound wasm canopy laiBaobab", jsCanopyModel.state.laiBaobab, boundCanopyModel.state.laiBaobab, 5e-5, 2e-5);
  compareArray(
    "bound wasm canopy vegetationCover",
    jsCanopyModel.state.vegetationCover,
    boundCanopyModel.state.vegetationCover,
    5e-5,
    2e-5
  );

  const jsEnvironmentModel = createDiagnosticModel(8);
  const wasmEnvironmentModel = createDiagnosticModel(8);
  prepareCanopyEnvironmentDiagnosticState(jsEnvironmentModel);
  prepareCanopyEnvironmentDiagnosticState(wasmEnvironmentModel);
  __asteroidVegetationDiagnostics.updateCanopyOpticsFromInputs(jsEnvironmentModel);
  __asteroidVegetationDiagnostics.updateCanopyOpticsFromInputs(wasmEnvironmentModel);
  __asteroidVegetationDiagnostics.updateCanopyEnvironmentFieldsFromInputs(jsEnvironmentModel);
  assert.equal(
    wasmCore.runCanopyEnvironment(wasmEnvironmentModel, {
      asteroidMeanTempC: wasmEnvironmentModel.params.asteroidMeanTempC,
      asteroidDiurnalRangeC: wasmEnvironmentModel.params.asteroidDiurnalRangeC,
      asteroidLatitudeTempRangeC: wasmEnvironmentModel.params.asteroidLatitudeTempRangeC
    }),
    true
  );
  compareArray("wasm environment surfaceTempC", jsEnvironmentModel.state.surfaceTempC, wasmEnvironmentModel.state.surfaceTempC, 5e-5, 2e-5);
  compareArray("wasm environment vpdKpa", jsEnvironmentModel.state.vpdKpa, wasmEnvironmentModel.state.vpdKpa, 5e-5, 2e-5);
  compareArray("wasm environment par", jsEnvironmentModel.state.par, wasmEnvironmentModel.state.par, 5e-5, 2e-5);

  const boundEnvironmentModel = createDiagnosticModel(8);
  prepareCanopyEnvironmentDiagnosticState(boundEnvironmentModel);
  __asteroidVegetationDiagnostics.updateCanopyOpticsFromInputs(boundEnvironmentModel);
  assert.equal(wasmCore.bindModelState(boundEnvironmentModel), true);
  assert.equal(
    wasmCore.runCanopyEnvironment(boundEnvironmentModel, {
      asteroidMeanTempC: boundEnvironmentModel.params.asteroidMeanTempC,
      asteroidDiurnalRangeC: boundEnvironmentModel.params.asteroidDiurnalRangeC,
      asteroidLatitudeTempRangeC: boundEnvironmentModel.params.asteroidLatitudeTempRangeC
    }),
    true
  );
  compareArray(
    "bound wasm environment surfaceTempC",
    jsEnvironmentModel.state.surfaceTempC,
    boundEnvironmentModel.state.surfaceTempC,
    5e-5,
    2e-5
  );
  compareArray("bound wasm environment par", jsEnvironmentModel.state.par, boundEnvironmentModel.state.par, 5e-5, 2e-5);

  const jsPhotoInputModel = createDiagnosticModel(8);
  const wasmPhotoInputModel = createDiagnosticModel(8);
  preparePhotosynthesisInputDiagnosticState(jsPhotoInputModel);
  preparePhotosynthesisInputDiagnosticState(wasmPhotoInputModel);
  __asteroidVegetationDiagnostics.prepareInitialPhotosynthesisInputs(jsPhotoInputModel);
  assert.equal(
    wasmCore.runPreparePhotosynthesisInputs(
      wasmPhotoInputModel,
      __asteroidVegetationDiagnostics.photosynthesisInputConstantsForWasm(wasmPhotoInputModel)
    ),
    true
  );
  compareArray("wasm photo inputs aparTotal", jsPhotoInputModel.state.aparTotal, wasmPhotoInputModel.state.aparTotal, 5e-5, 2e-5);
  compareArray("wasm photo inputs aparBaobab", jsPhotoInputModel.state.aparBaobab, wasmPhotoInputModel.state.aparBaobab, 5e-5, 2e-5);
  compareArray("wasm photo inputs aparRose", jsPhotoInputModel.state.aparRose, wasmPhotoInputModel.state.aparRose, 5e-5, 2e-5);
  compareArray(
    "wasm photo inputs waterStressBaobab",
    jsPhotoInputModel.state.photoWaterStressBaobab,
    wasmPhotoInputModel.state.photoWaterStressBaobab,
    5e-5,
    2e-5
  );
  compareArray(
    "wasm photo inputs waterStressRose",
    jsPhotoInputModel.state.photoWaterStressRose,
    wasmPhotoInputModel.state.photoWaterStressRose,
    5e-5,
    2e-5
  );
  compareArray(
    "wasm photo inputs nutrientBaobab",
    jsPhotoInputModel.state.photoNutrientBaobab,
    wasmPhotoInputModel.state.photoNutrientBaobab,
    5e-5,
    2e-5
  );
  compareArray(
    "wasm photo inputs nutrientRose",
    jsPhotoInputModel.state.photoNutrientRose,
    wasmPhotoInputModel.state.photoNutrientRose,
    5e-5,
    2e-5
  );

  const boundPhotoInputModel = createDiagnosticModel(8);
  preparePhotosynthesisInputDiagnosticState(boundPhotoInputModel);
  assert.equal(wasmCore.bindModelState(boundPhotoInputModel), true);
  assert.equal(
    wasmCore.runPreparePhotosynthesisInputs(
      boundPhotoInputModel,
      __asteroidVegetationDiagnostics.photosynthesisInputConstantsForWasm(boundPhotoInputModel)
    ),
    true
  );
  compareArray(
    "bound wasm photo inputs aparRose",
    jsPhotoInputModel.state.aparRose,
    boundPhotoInputModel.state.aparRose,
    5e-5,
    2e-5
  );
  compareArray(
    "bound wasm photo inputs waterStressRose",
    jsPhotoInputModel.state.photoWaterStressRose,
    boundPhotoInputModel.state.photoWaterStressRose,
    5e-5,
    2e-5
  );

  const jsPhotoModel = createDiagnosticModel(8);
  const wasmPhotoModel = createDiagnosticModel(8);
  preparePhotosynthesisDiagnosticState(jsPhotoModel);
  preparePhotosynthesisDiagnosticState(wasmPhotoModel);
  __asteroidVegetationDiagnostics.updatePhotosynthesisFromInputs(jsPhotoModel);
  assert.equal(
    wasmCore.runPhotosynthesis(wasmPhotoModel, __asteroidVegetationDiagnostics.photosynthesisConstantsForWasm(wasmPhotoModel)),
    true
  );
  compareArray("wasm photosynthesis gppBaobab", jsPhotoModel.state.gppBaobab, wasmPhotoModel.state.gppBaobab, 5e-5, 2e-5);
  compareArray("wasm photosynthesis gppRose", jsPhotoModel.state.gppRose, wasmPhotoModel.state.gppRose, 5e-5, 2e-5);
  compareArray(
    "wasm photosynthesis conductanceBaobab",
    jsPhotoModel.state.stomatalConductanceBaobabMps,
    wasmPhotoModel.state.stomatalConductanceBaobabMps,
    5e-5,
    2e-5
  );
  compareArray(
    "wasm photosynthesis conductanceRose",
    jsPhotoModel.state.stomatalConductanceRoseMps,
    wasmPhotoModel.state.stomatalConductanceRoseMps,
    5e-5,
    2e-5
  );
  compareArray("wasm photosynthesis ciBaobab", jsPhotoModel.state.ciBaobab, wasmPhotoModel.state.ciBaobab, 5e-5, 2e-5);
  compareArray("wasm photosynthesis ciRose", jsPhotoModel.state.ciRose, wasmPhotoModel.state.ciRose, 5e-5, 2e-5);

  const boundPhotoModel = createDiagnosticModel(8);
  preparePhotosynthesisDiagnosticState(boundPhotoModel);
  assert.equal(wasmCore.bindModelState(boundPhotoModel), true);
  assert.equal(
    wasmCore.runPhotosynthesis(boundPhotoModel, __asteroidVegetationDiagnostics.photosynthesisConstantsForWasm(boundPhotoModel)),
    true
  );
  compareArray("bound wasm photosynthesis gppBaobab", jsPhotoModel.state.gppBaobab, boundPhotoModel.state.gppBaobab, 5e-5, 2e-5);
  compareArray("bound wasm photosynthesis ciRose", jsPhotoModel.state.ciRose, boundPhotoModel.state.ciRose, 5e-5, 2e-5);

  runJsHydraulicState(jsHydraulicModel);
  assert.equal(
    wasmCore.runHydraulicState(wasmHydraulicModel, {
      lookupSteps: 16384,
      groundwaterFlowMultiplier: 1,
      ...hydraulicTables
    }),
    true
  );
  compareArray("wasm hydraulic W0", jsHydraulicModel.state.W0, wasmHydraulicModel.state.W0, 1e-5, 5e-6);
  compareArray("wasm hydraulic W1", jsHydraulicModel.state.W1, wasmHydraulicModel.state.W1, 1e-5, 5e-6);
  compareArray("wasm hydraulic soilHead", jsHydraulicModel.state.soilHead, wasmHydraulicModel.state.soilHead, 1e-5, 5e-6);
  compareArray(
    "wasm hydraulic soilHydraulicK",
    jsHydraulicModel.state.soilHydraulicK,
    wasmHydraulicModel.state.soilHydraulicK,
    1e-5,
    5e-6
  );
  compareArray(
    "wasm hydraulic soilTransmissivity",
    jsHydraulicModel.state.soilTransmissivity,
    wasmHydraulicModel.state.soilTransmissivity,
    1e-5,
    5e-6
  );
  compareArray(
    "wasm hydraulic groundwaterHead",
    jsHydraulicModel.state.groundwaterHead,
    wasmHydraulicModel.state.groundwaterHead,
    1e-5,
    5e-6
  );
  compareArray("wasm hydraulic groundwaterT", jsHydraulicModel.state.groundwaterT, wasmHydraulicModel.state.groundwaterT, 1e-5, 5e-6);

  const boundHydraulicModel = createDiagnosticModel(8);
  assert.equal(wasmCore.bindModelState(boundHydraulicModel), true);
  assert.equal(
    wasmCore.runHydraulicState(boundHydraulicModel, {
      lookupSteps: 16384,
      groundwaterFlowMultiplier: 1,
      ...hydraulicTables
    }),
    true
  );
  compareArray("bound wasm hydraulic W0", jsHydraulicModel.state.W0, boundHydraulicModel.state.W0, 1e-5, 5e-6);
  compareArray("bound wasm hydraulic soilHead", jsHydraulicModel.state.soilHead, boundHydraulicModel.state.soilHead, 1e-5, 5e-6);
  compareArray("bound wasm hydraulic groundwaterT", jsHydraulicModel.state.groundwaterT, boundHydraulicModel.state.groundwaterT, 1e-5, 5e-6);

  assert.equal(wasmCore.runDarcyWaterColumns(wasmModel, constants), true);
  compareArray("wasm soilTransport", model.state.soilTransport, wasmModel.state.soilTransport, 5e-5, 2e-5);
  compareArray(
    "wasm groundwaterTransport",
    model.state.groundwaterTransport,
    wasmModel.state.groundwaterTransport,
    5e-5,
    2e-5
  );
  compareArray("wasm Htransport", model.state.Htransport, wasmModel.state.Htransport, 5e-5, 2e-5);
  compareArray(
    "wasm soilMineralTransport",
    model.state.soilMineralTransport,
    wasmModel.state.soilMineralTransport,
    5e-5,
    2e-5
  );
  compareArray(
    "wasm baobabSeedTransport",
    model.state.baobabSeedTransport,
    wasmModel.state.baobabSeedTransport,
    5e-5,
    2e-5
  );
  compareArray("wasm roseSeedTransport", model.state.roseSeedTransport, wasmModel.state.roseSeedTransport, 5e-5, 2e-5);
  compareArray("wasm surfaceUx", model.state.surfaceUx, wasmModel.state.surfaceUx, 5e-5, 2e-5);
  compareArray("wasm surfaceUy", model.state.surfaceUy, wasmModel.state.surfaceUy, 5e-5, 2e-5);
  compareArray("wasm topSoilUx", model.state.topSoilUx, wasmModel.state.topSoilUx, 5e-5, 2e-5);
  compareArray("wasm topSoilUy", model.state.topSoilUy, wasmModel.state.topSoilUy, 5e-5, 2e-5);
  compareArray("wasm groundwaterUx", model.state.groundwaterUx, wasmModel.state.groundwaterUx, 5e-5, 2e-5);
  compareArray("wasm groundwaterUy", model.state.groundwaterUy, wasmModel.state.groundwaterUy, 5e-5, 2e-5);

  const boundDarcyModel = createDiagnosticModel(8);
  assert.equal(wasmCore.bindModelState(boundDarcyModel), true);
  assert.equal(wasmCore.runDarcyWaterColumns(boundDarcyModel, constants), true);
  compareArray("bound wasm soilTransport", model.state.soilTransport, boundDarcyModel.state.soilTransport, 5e-5, 2e-5);
  compareArray(
    "bound wasm groundwaterTransport",
    model.state.groundwaterTransport,
    boundDarcyModel.state.groundwaterTransport,
    5e-5,
    2e-5
  );
  compareArray("bound wasm Htransport", model.state.Htransport, boundDarcyModel.state.Htransport, 5e-5, 2e-5);
  compareArray(
    "bound wasm soilMineralTransport",
    model.state.soilMineralTransport,
    boundDarcyModel.state.soilMineralTransport,
    5e-5,
    2e-5
  );
  compareArray(
    "bound wasm baobabSeedTransport",
    model.state.baobabSeedTransport,
    boundDarcyModel.state.baobabSeedTransport,
    5e-5,
    2e-5
  );
  compareArray("bound wasm roseSeedTransport", model.state.roseSeedTransport, boundDarcyModel.state.roseSeedTransport, 5e-5, 2e-5);
  compareArray("bound wasm surfaceUx", model.state.surfaceUx, boundDarcyModel.state.surfaceUx, 5e-5, 2e-5);
  compareArray("bound wasm surfaceUy", model.state.surfaceUy, boundDarcyModel.state.surfaceUy, 5e-5, 2e-5);
  compareArray("bound wasm topSoilUx", model.state.topSoilUx, boundDarcyModel.state.topSoilUx, 5e-5, 2e-5);
  compareArray("bound wasm topSoilUy", model.state.topSoilUy, boundDarcyModel.state.topSoilUy, 5e-5, 2e-5);
  compareArray("bound wasm groundwaterUx", model.state.groundwaterUx, boundDarcyModel.state.groundwaterUx, 5e-5, 2e-5);
  compareArray("bound wasm groundwaterUy", model.state.groundwaterUy, boundDarcyModel.state.groundwaterUy, 5e-5, 2e-5);

  const surfaceNutrientConstants = __asteroidVegetationDiagnostics.surfaceNutrientTransportConstants();
  const jsSurfaceModel = createDiagnosticModel(8);
  const wasmSurfaceModel = createDiagnosticModel(8);
  __asteroidVegetationDiagnostics.transportDarcyWaterColumnsRbf(
    jsSurfaceModel,
    constants.dtDays,
    constants.baobabSeedDiffusionM2Day,
    constants.roseSeedDiffusionM2Day
  );
  __asteroidVegetationDiagnostics.transportSurfaceNutrientSeedsRbf(jsSurfaceModel);
  assert.equal(wasmCore.runDarcyWaterColumns(wasmSurfaceModel, constants), true);
  assert.equal(wasmCore.runSurfaceNutrientTransport(wasmSurfaceModel, surfaceNutrientConstants), true);
  compareArray("wasm surface nutrient fluxX", jsSurfaceModel.state.fluxX, wasmSurfaceModel.state.fluxX, 5e-5, 2e-5);
  compareArray("wasm surface nutrient fluxY", jsSurfaceModel.state.fluxY, wasmSurfaceModel.state.fluxY, 5e-5, 2e-5);
  compareArray(
    "wasm surface nutrient Htransport",
    jsSurfaceModel.state.Htransport,
    wasmSurfaceModel.state.Htransport,
    5e-5,
    2e-5
  );
  compareArray(
    "wasm surface nutrient soilMineralTransport",
    jsSurfaceModel.state.soilMineralTransport,
    wasmSurfaceModel.state.soilMineralTransport,
    5e-5,
    2e-5
  );

  const boundSurfaceModel = createDiagnosticModel(8);
  assert.equal(wasmCore.bindModelState(boundSurfaceModel), true);
  assert.equal(wasmCore.runDarcyWaterColumns(boundSurfaceModel, constants), true);
  assert.equal(wasmCore.runSurfaceNutrientTransport(boundSurfaceModel, surfaceNutrientConstants), true);
  compareArray("bound wasm surface nutrient fluxX", jsSurfaceModel.state.fluxX, boundSurfaceModel.state.fluxX, 5e-5, 2e-5);
  compareArray("bound wasm surface nutrient fluxY", jsSurfaceModel.state.fluxY, boundSurfaceModel.state.fluxY, 5e-5, 2e-5);
  compareArray(
    "bound wasm surface nutrient Htransport",
    jsSurfaceModel.state.Htransport,
    boundSurfaceModel.state.Htransport,
    5e-5,
    2e-5
  );
  compareArray(
    "bound wasm surface nutrient soilMineralTransport",
    jsSurfaceModel.state.soilMineralTransport,
    boundSurfaceModel.state.soilMineralTransport,
    5e-5,
    2e-5
  );

  const boundCombinedSurfaceModel = createDiagnosticModel(8);
  assert.equal(wasmCore.bindModelState(boundCombinedSurfaceModel), true);
  assert.equal(
    wasmCore.runDarcyWaterColumns(boundCombinedSurfaceModel, {
      ...constants,
      combineSurfaceNutrient: true,
      surfaceFilmThresholdM: surfaceNutrientConstants.surfaceFilmThresholdM
    }),
    true
  );
  compareArray(
    "bound wasm combined surface nutrient fluxX",
    jsSurfaceModel.state.fluxX,
    boundCombinedSurfaceModel.state.fluxX,
    5e-5,
    2e-5
  );
  compareArray(
    "bound wasm combined surface nutrient fluxY",
    jsSurfaceModel.state.fluxY,
    boundCombinedSurfaceModel.state.fluxY,
    5e-5,
    2e-5
  );
  compareArray(
    "bound wasm combined surface nutrient Htransport",
    jsSurfaceModel.state.Htransport,
    boundCombinedSurfaceModel.state.Htransport,
    5e-5,
    2e-5
  );
  compareArray(
    "bound wasm combined surface nutrient soilMineralTransport",
    jsSurfaceModel.state.soilMineralTransport,
    boundCombinedSurfaceModel.state.soilMineralTransport,
    5e-5,
    2e-5
  );

  const jsSoilBioModel = createDiagnosticModel(8);
  const wasmSoilBioModel = createDiagnosticModel(8);
  prepareSoilBiogeochemistryDiagnosticState(jsSoilBioModel);
  prepareSoilBiogeochemistryDiagnosticState(wasmSoilBioModel);
  __asteroidVegetationDiagnostics.updateSoilBiogeochemistryFromInputs(jsSoilBioModel);
  assert.equal(wasmCore.runSoilBiogeochemistry(wasmSoilBioModel, { modelDtDays: MODEL_DT_DAYS }), true);
  compareArray("wasm soil bio litterCarbonN", jsSoilBioModel.state.litterCarbonN, wasmSoilBioModel.state.litterCarbonN, 5e-5, 2e-5);
  compareArray(
    "wasm soil bio litterFastCarbonN",
    jsSoilBioModel.state.litterFastCarbonN,
    wasmSoilBioModel.state.litterFastCarbonN,
    5e-5,
    2e-5
  );
  compareArray(
    "wasm soil bio litterSlowCarbonN",
    jsSoilBioModel.state.litterSlowCarbonN,
    wasmSoilBioModel.state.litterSlowCarbonN,
    5e-5,
    2e-5
  );
  compareArray(
    "wasm soil bio soilCarbonActiveN",
    jsSoilBioModel.state.soilCarbonActiveN,
    wasmSoilBioModel.state.soilCarbonActiveN,
    5e-5,
    2e-5
  );
  compareArray(
    "wasm soil bio soilCarbonStableN",
    jsSoilBioModel.state.soilCarbonStableN,
    wasmSoilBioModel.state.soilCarbonStableN,
    5e-5,
    2e-5
  );
  compareArray("wasm soil bio soilMineralNN", jsSoilBioModel.state.soilMineralNN, wasmSoilBioModel.state.soilMineralNN, 5e-5, 2e-5);

  const boundSoilBioModel = createDiagnosticModel(8);
  prepareSoilBiogeochemistryDiagnosticState(boundSoilBioModel);
  assert.equal(wasmCore.bindModelState(boundSoilBioModel), true);
  assert.equal(wasmCore.runSoilBiogeochemistry(boundSoilBioModel, { modelDtDays: MODEL_DT_DAYS }), true);
  compareArray(
    "bound wasm soil bio litterCarbonN",
    jsSoilBioModel.state.litterCarbonN,
    boundSoilBioModel.state.litterCarbonN,
    5e-5,
    2e-5
  );
  compareArray(
    "bound wasm soil bio soilCarbonActiveN",
    jsSoilBioModel.state.soilCarbonActiveN,
    boundSoilBioModel.state.soilCarbonActiveN,
    5e-5,
    2e-5
  );
  compareArray(
    "bound wasm soil bio soilMineralNN",
    jsSoilBioModel.state.soilMineralNN,
    boundSoilBioModel.state.soilMineralNN,
    5e-5,
    2e-5
  );

  const jsRichardsModel = createDiagnosticModel(8);
  const wasmRichardsModel = createDiagnosticModel(8);
  prepareRichardsDiagnosticState(jsRichardsModel);
  prepareRichardsDiagnosticState(wasmRichardsModel);
  runJsRichardsColumns(jsRichardsModel, true);
  assert.equal(
    wasmCore.runRichardsColumns(wasmRichardsModel, {
      dtDays: MODEL_DT_DAYS,
      modelDtDays: MODEL_DT_DAYS,
      writeDiagnostics: true
    }),
    true
  );
  compareArray("wasm richards Hn", jsRichardsModel.state.Hn, wasmRichardsModel.state.Hn, 1e-5, 5e-6);
  compareArray(
    "wasm richards soilWaterN",
    jsRichardsModel.state.soilWaterN,
    wasmRichardsModel.state.soilWaterN,
    1e-5,
    5e-6
  );
  compareArray(
    "wasm richards groundwaterStorageN",
    jsRichardsModel.state.groundwaterStorageN,
    wasmRichardsModel.state.groundwaterStorageN,
    1e-5,
    5e-6
  );
  compareArray(
    "wasm richards groundwaterRecharge",
    jsRichardsModel.state.groundwaterRecharge,
    wasmRichardsModel.state.groundwaterRecharge,
    1e-5,
    5e-6
  );
  compareArray(
    "wasm richards hydrologyHorizontalM",
    jsRichardsModel.state.hydrologyHorizontalM,
    wasmRichardsModel.state.hydrologyHorizontalM,
    1e-5,
    5e-6
  );
  compareArray(
    "wasm richards hydrologyInfiltrationM",
    jsRichardsModel.state.hydrologyInfiltrationM,
    wasmRichardsModel.state.hydrologyInfiltrationM,
    1e-5,
    5e-6
  );
  compareArray(
    "wasm richards hydrologyPercolation01M",
    jsRichardsModel.state.hydrologyPercolation01M,
    wasmRichardsModel.state.hydrologyPercolation01M,
    1e-5,
    5e-6
  );
  compareArray(
    "wasm richards hydrologyPercolation12M",
    jsRichardsModel.state.hydrologyPercolation12M,
    wasmRichardsModel.state.hydrologyPercolation12M,
    1e-5,
    5e-6
  );
  compareArray(
    "wasm richards hydrologyRechargeM",
    jsRichardsModel.state.hydrologyRechargeM,
    wasmRichardsModel.state.hydrologyRechargeM,
    1e-5,
    5e-6
  );
  compareArray(
    "wasm richards hydrologyLeakageM",
    jsRichardsModel.state.hydrologyLeakageM,
    wasmRichardsModel.state.hydrologyLeakageM,
    1e-5,
    5e-6
  );
  compareArray(
    "wasm richards hydrologySurfaceEvapM",
    jsRichardsModel.state.hydrologySurfaceEvapM,
    wasmRichardsModel.state.hydrologySurfaceEvapM,
    1e-5,
    5e-6
  );

  const boundRichardsModel = createDiagnosticModel(8);
  prepareRichardsDiagnosticState(boundRichardsModel);
  assert.equal(wasmCore.bindModelState(boundRichardsModel), true);
  assert.equal(
    wasmCore.runRichardsColumns(boundRichardsModel, {
      dtDays: MODEL_DT_DAYS,
      modelDtDays: MODEL_DT_DAYS,
      writeDiagnostics: true
    }),
    true
  );
  compareArray("bound wasm richards Hn", jsRichardsModel.state.Hn, boundRichardsModel.state.Hn, 1e-5, 5e-6);
  compareArray(
    "bound wasm richards soilWaterN",
    jsRichardsModel.state.soilWaterN,
    boundRichardsModel.state.soilWaterN,
    1e-5,
    5e-6
  );
  compareArray(
    "bound wasm richards groundwaterStorageN",
    jsRichardsModel.state.groundwaterStorageN,
    boundRichardsModel.state.groundwaterStorageN,
    1e-5,
    5e-6
  );
  compareArray(
    "bound wasm richards hydrologyRechargeM",
    jsRichardsModel.state.hydrologyRechargeM,
    boundRichardsModel.state.hydrologyRechargeM,
    1e-5,
    5e-6
  );
}

rmSync(tmpDir, { recursive: true, force: true });
console.log(existsSync(wasmPath) ? "native/wasm simulation kernels ok" : "native simulation kernel ok");

function createDiagnosticModel(nside) {
  const topology = createHealpixTopology(nside);
  const count = topology.cells.length;
  const elevation = new Float32Array(count);
  const terrainCode = new Uint8Array(count);
  const cellHeight = new Float32Array(count);
  const cellPhi = new Float32Array(count);
  const climateMeanTempC = new Float32Array(count);
  const climateDiurnalRangeC = new Float32Array(count);
  const rainClimatology = new Float32Array(count).fill(1);
  for (const cell of topology.cells) {
    elevation[cell.id] =
      260 * Math.sin(2.7 * cell.phi) +
      180 * Math.cos(4.1 * cell.theta) +
      90 * Math.sin(5.3 * cell.normal[0] + 2.1 * cell.normal[1]);
    terrainCode[cell.id] = 0;
    cellHeight[cell.id] = cell.height;
    cellPhi[cell.id] = cell.phi;
  }
  const model = createAsteroidVegetationModel(topology, {
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
    baobabRisk: new Float32Array(count).fill(0.7),
    baobabBlocked: new Uint8Array(count),
    elevation,
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
      storage: 1
    }
  });
  model.setDiagnosticsEnabled(true);
  for (const cell of topology.cells) {
    const i = cell.id;
    const wave = 0.5 + 0.5 * Math.sin(i * 1.37 + cell.phi * 2.2);
    model.state.H[i] = 0.002 + 0.006 * wave;
    model.state.soilMineralN[i] = 0.25 + 0.45 * ((i % 17) / 16);
    model.state.soilCarbonActive[i] = 0.02 + 0.08 * ((i % 11) / 10);
    model.state.soilCarbonStable[i] = 0.12 + 0.12 * ((i % 13) / 12);
    model.state.baobabSeed[i] = 0.001 * ((i % 7) + 1);
    model.state.roseSeed[i] = 0.0007 * ((i % 5) + 1);
  }
  return model;
}

function prepareRichardsDiagnosticState(model) {
  const { state, size, topology } = model;
  for (const cell of topology.cells) {
    const i = cell.id;
    const layer1 = size + i;
    const layer2 = size * 2 + i;
    const wave = 0.5 + 0.5 * Math.sin(i * 0.91 + cell.theta * 1.7);
    state.H[i] = 0.0005 + 0.0035 * wave;
    state.Htransport[i] = 0.00045 * Math.sin(i * 0.37) - 0.00012 * Math.cos(cell.phi * 1.6);
    state.soilTransport[i] = 0.00022 * Math.sin(i * 0.21 + 0.2);
    state.soilTransport[layer1] = 0.00016 * Math.cos(i * 0.27 + 0.4);
    state.soilTransport[layer2] = 0.00011 * Math.sin(i * 0.33 + 0.6);
    state.groundwaterTransport[i] = 0.00008 * Math.cos(i * 0.19 + 0.3);
    state.hydrologyThroughfall[i] = 0.0007 + 0.0018 * ((i % 9) / 8);
    state.hydrologyVegFeedback[i] = 0.15 + 0.65 * ((i % 13) / 12);
    state.hydrologySink0[i] = 0.0001 + 0.0009 * ((i % 7) / 6);
    state.hydrologySink1[i] = 0.00008 + 0.00055 * ((i % 11) / 10);
    state.hydrologySink2[i] = 0.00005 + 0.00035 * ((i % 5) / 4);
    state.hydrologyGroundwaterSink[i] = 0.00004 + 0.00028 * ((i % 17) / 16);
    state.hydrologySurfaceEvapDemandM[i] = 0.0001 + 0.00045 * ((i % 15) / 14);
  }
}

function prepareCanopyOpticsDiagnosticState(model) {
  const { state, topology } = model;
  model.params = { ...model.params, shade: 1.37 };
  for (const cell of topology.cells) {
    const i = cell.id;
    state.sunlight[i] = Math.max(0, Math.min(1, 0.04 + 0.92 * ((i % 31) / 30)));
    state.baobabLeaf[i] = 0.015 + 1.6 * ((i % 37) / 36);
    state.roseLeaf[i] = 0.008 + 0.9 * ((i % 29) / 28);
    state.roseFlower[i] = 0.004 + 0.55 * ((i % 23) / 22);
    state.baobabBlocked[i] = i % 17 === 0 ? 1 : 0;
  }
}

function prepareCanopyEnvironmentDiagnosticState(model) {
  const { state, topology } = model;
  model.params = {
    ...model.params,
    shade: 1.24,
    asteroidMeanTempC: 13.5,
    asteroidDiurnalRangeC: 19.5,
    asteroidLatitudeTempRangeC: 4.8
  };
  for (const cell of topology.cells) {
    const i = cell.id;
    state.cellHeight[i] = cell.height;
    state.climateMeanTempC[i] = -8 + 38 * ((i % 37) / 36);
    state.climateDiurnalRangeC[i] = 3 + 21 * ((i % 29) / 28);
    state.elevation[i] = -120 + 3200 * ((i % 31) / 30);
    state.H[i] = 0.0002 + 0.018 * ((i % 23) / 22);
    state.R[i] = 0.00001 + 0.0014 * ((i % 19) / 18);
    state.W0[i] = state.soilCap[i] * (0.05 + 0.9 * ((i % 17) / 16));
    state.W1[i] = state.groundwaterCap[i] * (0.04 + 0.92 * ((i % 13) / 12));
  }
  prepareCanopyOpticsDiagnosticState(model);
}

function preparePhotosynthesisInputDiagnosticState(model) {
  const { state, size, topology } = model;
  model.params = {
    ...model.params,
    rootDepth: 5.35,
    storage: 1.26
  };
  for (const cell of topology.cells) {
    const i = cell.id;
    const layer1 = size + i;
    const layer2 = size * 2 + i;
    const wave = 0.5 + 0.5 * Math.sin(i * 0.73 + cell.phi * 1.4);
    state.substrate[i] = i % 5;
    state.soilWater[i] = state.soilCap[i] * Math.max(0, Math.min(1, 0.04 + 0.92 * ((i % 23) / 22)));
    state.soilWater[layer1] = state.soilCap[layer1] * Math.max(0, Math.min(1, 0.08 + 0.84 * wave));
    state.soilWater[layer2] = state.soilCap[layer2] * Math.max(0, Math.min(1, 0.12 + 0.78 * ((i % 19) / 18)));
    state.groundwaterStorage[i] = state.groundwaterCap[i] * Math.max(0, Math.min(1, 0.06 + 0.88 * ((i % 17) / 16)));
    state.baobabLeaf[i] = 0.04 + 1.2 * ((i % 31) / 30);
    state.baobabStem[i] = 0.06 + 1.55 * ((i % 37) / 36);
    state.baobabRoot[i] = 0.05 + 0.92 * ((i % 29) / 28);
    state.baobabStore[i] = 0.02 + 0.76 * ((i % 41) / 40);
    state.roseLeaf[i] = 0.018 + 0.68 * ((i % 27) / 26);
    state.roseFlower[i] = 0.006 + 0.37 * ((i % 21) / 20);
    state.roseRoot[i] = 0.012 + 0.48 * ((i % 25) / 24);
    state.H[i] = 0.0001 + 0.028 * ((i % 13) / 12);
    state.roseFertility[i] = 0.18 + 1.72 * ((i % 43) / 42);
    state.soilMineralN[i] = 0.025 + 0.92 * ((i % 47) / 46);
    state.par[i] = i % 11 === 0 ? 0 : 1.5 + 51 * wave;
    state.laiBaobab[i] = i % 19 === 0 ? 0 : 0.02 + 7.2 * ((i % 39) / 38);
    state.laiRose[i] = i % 23 === 0 ? 0 : 0.015 + 5.6 * ((i % 35) / 34);
    state.vegetationCover[i] = Math.max(0, Math.min(1, 0.04 + 0.92 * ((i % 33) / 32)));
  }
}

function preparePhotosynthesisDiagnosticState(model) {
  const { state, topology } = model;
  model.params = {
    ...model.params,
    baobabGrowth: 1.28,
    roseGrowth: 0.82,
    atmosphericCo2Ppm: 515
  };
  for (const cell of topology.cells) {
    const i = cell.id;
    const lightWave = 0.5 + 0.5 * Math.sin(i * 0.29 + cell.phi * 0.7);
    state.par[i] = i % 19 === 0 ? 0 : 3 + 46 * lightWave;
    state.surfaceTempC[i] = -8 + 48 * ((i % 53) / 52);
    state.vpdKpa[i] = 0.05 + 5.6 * ((i % 47) / 46);
    state.laiBaobab[i] = i % 23 === 0 ? 0 : 0.05 + 6.8 * ((i % 41) / 40);
    state.laiRose[i] = i % 29 === 0 ? 0 : 0.03 + 4.9 * ((i % 37) / 36);
    state.photoWaterStressBaobab[i] = i % 31 === 0 ? 0 : 0.08 + 0.89 * ((i % 17) / 16);
    state.photoWaterStressRose[i] = i % 11 === 0 ? 0 : 0.06 + 0.91 * ((i % 19) / 18);
    state.photoNutrientBaobab[i] = i % 13 === 0 ? 0 : 0.12 + 0.82 * ((i % 23) / 22);
    state.photoNutrientRose[i] = i % 7 === 0 ? 0 : 0.1 + 0.86 * ((i % 29) / 28);
    const totalLai = state.laiBaobab[i] + state.laiRose[i];
    const cover = totalLai > 0 ? Math.max(0, Math.min(1, 1 - Math.exp(-0.62 * totalLai))) : 0;
    const aparTotal = state.par[i] * cover;
    state.aparBaobab[i] = totalLai > 0 ? aparTotal * state.laiBaobab[i] / totalLai : 0;
    state.aparRose[i] = totalLai > 0 ? aparTotal * state.laiRose[i] / totalLai : 0;
  }
}

function prepareSoilBiogeochemistryDiagnosticState(model) {
  const { state, topology } = model;
  for (const cell of topology.cells) {
    const i = cell.id;
    const wave = 0.5 + 0.5 * Math.sin(i * 0.41 + cell.phi * 1.3);
    state.soilBioWetness[i] = 0.08 + 0.84 * wave;
    state.soilBioTempC[i] = -6 + 49 * ((i % 29) / 28);
    state.soilBioAshLoad[i] = Math.max(0, Math.min(1, 0.15 + 0.72 * ((i % 19) / 18)));
    state.soilBioTopSat[i] = Math.max(0, Math.min(1, 0.06 + 0.88 * ((i % 23) / 22)));
    state.soilBioGroundwaterSat[i] = Math.max(0, Math.min(1, 0.04 + 0.9 * ((i % 17) / 16)));
    state.soilBioLitterFastInput[i] = 0.001 + 0.021 * ((i % 13) / 12);
    state.soilBioLitterSlowInput[i] = 0.0007 + 0.012 * ((i % 11) / 10);
    state.soilBioPlantNutrientUptake[i] = 0.0004 + 0.016 * ((i % 31) / 30);
    state.litterCarbon[i] = 0.05 + 0.68 * ((i % 37) / 36);
    state.litterFastCarbon[i] = 0.03 + 0.32 * ((i % 7) / 6);
    state.litterSlowCarbon[i] = 0.02 + 0.28 * ((i % 9) / 8);
    state.soilCarbonActive[i] = 0.04 + 0.72 * ((i % 41) / 40);
    state.soilCarbonStable[i] = 0.18 + 1.25 * ((i % 43) / 42);
    state.soilMineralN[i] = 0.02 + 0.95 * ((i % 47) / 46);
    state.soilMineralTransport[i] = -0.008 + 0.021 * ((i % 53) / 52);
    state.roseFertility[i] = 0.15 + 1.6 * ((i % 59) / 58);
  }
}

function runJsRichardsColumns(model, writeDiagnostics) {
  const { state, size } = model;
  const invModelDt = 1 / MODEL_DT_DAYS;
  for (let i = 0; i < size; i += 1) {
    const layer1 = size + i;
    const layer2 = size * 2 + i;
    __asteroidVegetationDiagnostics.richardsColumnSemiImplicitUpdateInPlace(
      model,
      i,
      MODEL_DT_DAYS,
      state.hydrologyThroughfall[i],
      state.hydrologyVegFeedback[i],
      state.hydrologySink0[i],
      state.hydrologySink1[i],
      state.hydrologySink2[i],
      state.hydrologyGroundwaterSink[i],
      state.Htransport[i],
      state.hydrologySurfaceEvapDemandM[i] * invModelDt,
      state.soilTransport[i],
      state.soilTransport[layer1],
      state.soilTransport[layer2],
      state.groundwaterTransport[i],
      writeDiagnostics
    );
  }
}

function runJsHydraulicState(model) {
  for (let i = 0; i < model.size; i += 1) {
    __asteroidVegetationDiagnostics.updateHydraulicStateForCell(model, i);
  }
}

function buildFixture(model, constants) {
  const { state, operators, size } = model;
  const paddedOperators = paddedRbfOperators(operators, size);
  const chunks = [];
  chunks.push(magic("HPSIMC1"));
  pushI32(chunks, size);
  pushI32(chunks, paddedOperators.m);
  pushI32(chunks, size);
  pushF32(chunks, constants.dtDays);
  pushF32(chunks, constants.cellSizeM);
  pushF32(chunks, constants.surfaceWaterDiffM2Day);
  pushF32(chunks, constants.surfaceSlopeVelocityMDay);
  pushF32(chunks, constants.surfaceSlopeMaxVelocityMDay);
  pushF32(chunks, constants.nutrientDiffM2Day);
  pushF32(chunks, constants.baobabSeedDiffusionM2Day);
  pushF32(chunks, constants.roseSeedDiffusionM2Day);
  pushArray(chunks, paddedOperators.stencil);
  pushArray(chunks, paddedOperators.lapW);
  pushArray(chunks, paddedOperators.gxW);
  pushArray(chunks, paddedOperators.gyW);
  pushArray(chunks, state.H);
  pushArray(chunks, state.soilWater);
  pushArray(chunks, state.soilHead);
  pushArray(chunks, state.soilTransmissivity);
  pushArray(chunks, state.soilResidual);
  pushArray(chunks, state.soilCap);
  pushArray(chunks, state.groundwaterStorage);
  pushArray(chunks, state.groundwaterCap);
  pushArray(chunks, state.groundwaterHead);
  pushArray(chunks, state.groundwaterT);
  pushArray(chunks, state.soilMineralN);
  pushArray(chunks, state.soilCarbonActive);
  pushArray(chunks, state.soilCarbonStable);
  pushArray(chunks, state.baobabSeed);
  pushArray(chunks, state.roseSeed);
  pushArray(chunks, state.slopeX);
  pushArray(chunks, state.slopeY);
  return Buffer.concat(chunks);
}

function paddedRbfOperators(operators, size) {
  const sourceStride = operators.m;
  if (sourceStride === NATIVE_RBF_STENCIL_STRIDE) {
    return operators;
  }
  const paddedLength = size * NATIVE_RBF_STENCIL_STRIDE;
  const stencil = new Int32Array(paddedLength);
  const lapW = new Float32Array(paddedLength);
  const gxW = new Float32Array(paddedLength);
  const gyW = new Float32Array(paddedLength);
  for (let i = 0; i < size; i += 1) {
    const sourceOffset = i * sourceStride;
    const targetOffset = i * NATIVE_RBF_STENCIL_STRIDE;
    const center = operators.stencil[sourceOffset] ?? i;
    for (let k = 0; k < NATIVE_RBF_STENCIL_STRIDE; k += 1) {
      if (k < sourceStride) {
        stencil[targetOffset + k] = operators.stencil[sourceOffset + k];
        lapW[targetOffset + k] = operators.lapW[sourceOffset + k];
        gxW[targetOffset + k] = operators.gxW[sourceOffset + k];
        gyW[targetOffset + k] = operators.gyW[sourceOffset + k];
      } else {
        stencil[targetOffset + k] = center;
      }
    }
  }
  return { m: NATIVE_RBF_STENCIL_STRIDE, stencil, lapW, gxW, gyW };
}

function parseNativeOutput(buffer, size) {
  let offset = 0;
  assert.equal(buffer.subarray(offset, offset + 7).toString("ascii"), "HPSIMO1");
  offset += 8;
  assert.equal(readI32(buffer, offset), size);
  offset += 4;
  const result = {};
  [result.soilTransport, offset] = readFloat32Array(buffer, offset, size * 3);
  [result.groundwaterTransport, offset] = readFloat32Array(buffer, offset, size);
  [result.Htransport, offset] = readFloat32Array(buffer, offset, size);
  [result.soilMineralTransport, offset] = readFloat32Array(buffer, offset, size);
  [result.baobabSeedTransport, offset] = readFloat32Array(buffer, offset, size);
  [result.roseSeedTransport, offset] = readFloat32Array(buffer, offset, size);
  [result.surfaceUx, offset] = readFloat32Array(buffer, offset, size);
  [result.surfaceUy, offset] = readFloat32Array(buffer, offset, size);
  [result.topSoilUx, offset] = readFloat32Array(buffer, offset, size);
  [result.topSoilUy, offset] = readFloat32Array(buffer, offset, size);
  [result.groundwaterUx, offset] = readFloat32Array(buffer, offset, size);
  [result.groundwaterUy, offset] = readFloat32Array(buffer, offset, size);
  assert.equal(offset, buffer.byteLength);
  return result;
}

function compareArray(name, jsArray, nativeArray, relTol, absTol) {
  let maxAbs = 0;
  let maxRel = 0;
  let maxIndex = 0;
  for (let i = 0; i < jsArray.length; i += 1) {
    const expected = jsArray[i];
    const actual = nativeArray[i];
    const abs = Math.abs(actual - expected);
    const rel = abs / Math.max(1, Math.abs(expected));
    if (abs > maxAbs) {
      maxAbs = abs;
      maxRel = rel;
      maxIndex = i;
    }
  }
  assert.ok(
    maxAbs <= absTol || maxRel <= relTol,
    `${name} mismatch at ${maxIndex}: abs=${maxAbs} rel=${maxRel} js=${jsArray[maxIndex]} native=${nativeArray[maxIndex]}`
  );
}

function magic(value) {
  const buffer = Buffer.alloc(8);
  buffer.write(value, 0, "ascii");
  return buffer;
}

function pushI32(chunks, value) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32LE(value);
  chunks.push(buffer);
}

function pushF32(chunks, value) {
  const buffer = Buffer.alloc(4);
  buffer.writeFloatLE(value);
  chunks.push(buffer);
}

function pushArray(chunks, array) {
  chunks.push(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
}

function readI32(buffer, offset) {
  return buffer.readInt32LE(offset);
}

function readFloat32Array(buffer, offset, length) {
  const byteLength = length * Float32Array.BYTES_PER_ELEMENT;
  const copy = buffer.buffer.slice(buffer.byteOffset + offset, buffer.byteOffset + offset + byteLength);
  return [new Float32Array(copy), offset + byteLength];
}
