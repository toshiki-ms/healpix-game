import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const source = resolve(repoRoot, "native/asteroid_sim.c");
const outputDir = resolve(repoRoot, "public/assets/sim");
const output = resolve(outputDir, "asteroid_sim.wasm");
const sharedOutput = resolve(outputDir, "asteroid_sim_shared.wasm");
const localZig = resolve(repoRoot, "node_modules/.bin/zig");
const exportNames = [
  "sim_reset_heap",
  "sim_alloc",
  "sim_initialize_asteroid_profile",
  "sim_initialize_earth_profile",
  "sim_initialize_vegetation_state",
  "sim_update_canopy_optics",
  "sim_update_canopy_environment",
  "sim_update_canopy_environment_photosynthesis",
  "sim_prepare_photosynthesis_inputs",
  "sim_update_photosynthesis",
  "sim_prepare_and_update_photosynthesis",
  "sim_update_plant_water_fluxes",
  "sim_update_plant_carbon_seeds",
  "sim_update_hydraulic_state",
  "sim_transport_darcy_water_columns",
  "sim_transport_surface_nutrient",
  "sim_compute_stable_surface_water_transport",
  "sim_update_asteroid_dayside_rain",
  "sim_update_earth_rain",
  "sim_prepare_earth_cloud_geometry",
  "sim_update_earth_cloud_cover",
  "sim_update_rain_memory",
  "sim_count_rose_seed_kernel",
  "sim_fill_rose_seed_kernel",
  "sim_distribute_rose_seeds",
  "sim_produce_and_distribute_rose_seeds",
  "sim_update_soil_biogeochemistry",
  "sim_richards_columns_update",
  "sim_advance_ash",
  "sim_clean_ash_cells",
  "sim_update_sunlight_field",
  "sim_remove_baobab_pool",
  "sim_remove_rose_pool",
  "sim_apply_water_cells",
  "sim_step_ecosystem",
  "sim_step_ecosystem_in_place",
  "sim_step_ecosystem_parallel_worker",
  "sim_step_ecosystem_parallel_worker_profile"
];

function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return result.status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

await mkdir(outputDir, { recursive: true });

const zigCommand = commandExists("zig", ["version"]) ? "zig" : commandExists(localZig, ["version"]) ? localZig : null;
const linkerExportNames = [...exportNames, "__stack_pointer"];
const exportFlags = linkerExportNames.flatMap((name) => [`-Wl,--export=${name}`]);
const emccExports = `[${exportNames.map((name) => `'_${name}'`).join(",")}]`;

if (zigCommand) {
  run(zigCommand, [
    "cc",
    "-target",
    "wasm32-freestanding",
    "-O3",
    "-flto",
    "-msimd128",
    "-nostdlib",
    "-Wl,--no-entry",
    "-Wl,--export-memory",
    "-Wl,--initial-memory=268435456",
    "-Wl,--max-memory=2147483648",
    ...exportFlags,
    source,
    "-o",
    output
  ]);
  console.log(`wrote ${output}`);
} else if (commandExists("clang")) {
  run("clang", [
    "--target=wasm32-unknown-unknown",
    "-O3",
    "-flto",
    "-msimd128",
    "-nostdlib",
    "-Wl,--no-entry",
    "-Wl,--export-memory",
    "-Wl,--initial-memory=268435456",
    "-Wl,--max-memory=2147483648",
    ...exportFlags,
    source,
    "-o",
    output
  ]);
  console.log(`wrote ${output}`);
} else if (commandExists("emcc")) {
  run("emcc", [
    source,
    "-O3",
    "-msimd128",
    "-s",
    "STANDALONE_WASM=1",
    "-s",
    `EXPORTED_FUNCTIONS=${emccExports}`,
    "-Wl,--no-entry",
    "-o",
    output
  ]);
  console.log(`wrote ${output}`);
} else {
  console.error("No C-to-WASM toolchain found. Install clang with wasm32 support, Zig, or Emscripten emcc.");
  process.exit(1);
}

if (zigCommand) {
  run(zigCommand, [
    "cc",
    "-target",
    "wasm32-freestanding",
    "-O3",
    "-flto",
    "-msimd128",
    "-matomics",
    "-mbulk-memory",
    "-pthread",
    "-nostdlib",
    "-Wl,--no-entry",
    "-Wl,--import-memory",
    "-Wl,--export-memory",
    "-Wl,--shared-memory",
    "-Wl,--initial-memory=268435456",
    "-Wl,--max-memory=2147483648",
    ...exportFlags,
    source,
    "-o",
    sharedOutput
  ]);
  console.log(`wrote ${sharedOutput}`);
}
