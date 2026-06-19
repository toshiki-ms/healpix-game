import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  earthLatitudeDeg,
  earthLongitudeDeg,
  earthPolarIceLandFractionForCell
} from "../src/earth-reference.js";
import { createHealpixTopology } from "../src/healpix.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const elevationPath = resolve(repoRoot, "src/assets/earth-elevation/etopo1-1deg-int16.bin");
const outputDir = resolve(repoRoot, "src/assets/earth-land");
const ETOPO1_WIDTH = 361;
const ETOPO1_HEIGHT = 181;

const requestedNsides = process.argv
  .slice(2)
  .map((value) => Number(value))
  .filter((value) => Number.isInteger(value) && value > 0);
const nsides = requestedNsides.length > 0 ? requestedNsides : [128, 256];

const elevationBuffer = await readFile(elevationPath);
const elevation = new Int16Array(
  elevationBuffer.buffer,
  elevationBuffer.byteOffset,
  elevationBuffer.byteLength / Int16Array.BYTES_PER_ELEMENT
);

if (elevation.length !== ETOPO1_WIDTH * ETOPO1_HEIGHT) {
  throw new Error("ETOPO1 elevation asset has an unexpected size.");
}

await mkdir(outputDir, { recursive: true });

for (const nside of nsides) {
  const started = performance.now();
  const topology = createHealpixTopology(nside);
  const land = new Uint8Array(topology.cells.length);
  let landCount = 0;

  for (const cell of topology.cells) {
    const elevationLand = sampleElevation(earthLongitudeDeg(cell), earthLatitudeDeg(cell)) >= 0 ? 1 : 0;
    const value = Math.max(elevationLand, earthPolarIceLandFractionForCell(cell)) >= 0.5 ? 255 : 0;
    land[cell.id] = value;
    landCount += value === 255 ? 1 : 0;
  }

  const filePath = resolve(outputDir, `land-nside${nside}-u8.bin`);
  await writeFile(filePath, Buffer.from(land.buffer));
  const elapsed = Math.round(performance.now() - started);
  const landRatio = landCount / topology.cells.length;
  console.log(
    `nside=${nside} cells=${topology.cells.length} ` +
      `land=${landCount} ratio=${landRatio.toFixed(4)} time=${elapsed}ms`
  );
}

function sampleElevation(lon, lat) {
  const x = modulo(lon + 180, 360);
  const y = clamp(lat + 90, 0, 180);
  const x0 = Math.floor(x);
  const x1 = x0 + 1 > 360 ? 0 : x0 + 1;
  const y0 = Math.floor(y);
  const y1 = Math.min(180, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const v00 = elevation[y0 * ETOPO1_WIDTH + x0];
  const v10 = elevation[y0 * ETOPO1_WIDTH + x1];
  const v01 = elevation[y1 * ETOPO1_WIDTH + x0];
  const v11 = elevation[y1 * ETOPO1_WIDTH + x1];
  const south = v00 * (1 - fx) + v10 * fx;
  const north = v01 * (1 - fx) + v11 * fx;
  return south * (1 - fy) + north * fy;
}

function modulo(value, period) {
  return ((value % period) + period) % period;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
