import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCompressedRbfFdOperatorData, encodeRbfFdOperatorData } from "../src/asteroid-vegetation.js";
import { createHealpixTopology } from "../src/healpix.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outputDir = resolve(repoRoot, "src/assets/rbf-fd");
const requestedNsides = process.argv
  .slice(2)
  .map((value) => Number(value))
  .filter((value) => Number.isInteger(value) && value > 0);
const nsides = requestedNsides.length > 0 ? requestedNsides : [2, 4, 8, 16, 32, 64];

await mkdir(outputDir, { recursive: true });

for (const nside of nsides) {
  const topology = createHealpixTopology(nside);
  const started = performance.now();
  const data = buildCompressedRbfFdOperatorData(topology);
  const encoded = encodeRbfFdOperatorData(data);
  const filePath = resolve(outputDir, `operators-nside${nside}.bin`);
  await writeFile(filePath, Buffer.from(encoded));
  const elapsed = Math.round(performance.now() - started);
  const sizeMb = encoded.byteLength / (1024 * 1024);
  console.log(
    `nside=${nside} cells=${data.size} classes=${data.classCount} ` +
      `ratio=${(data.classCount / (nside * nside)).toFixed(3)} ` +
      `size=${sizeMb.toFixed(2)}MiB time=${elapsed}ms`
  );
}
