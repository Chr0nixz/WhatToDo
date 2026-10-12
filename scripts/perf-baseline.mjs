import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const DIST_ASSETS = join(process.cwd(), "dist", "assets");
const MAIN_JS_LIMIT = 350 * 1024;
const MAIN_JS_TARGET = 300 * 1024;
const TOTAL_JS_LIMIT = 1200 * 1024;
const VENDOR_CHUNK_LIMIT = 300 * 1024;

const run = spawnSync("pnpm", ["build"], {
  cwd: process.cwd(),
  shell: true,
  stdio: "inherit",
});

if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

const assets = readdirSync(DIST_ASSETS)
  .map((name) => ({
    name,
    size: statSync(join(DIST_ASSETS, name)).size,
  }))
  .sort((a, b) => b.size - a.size);

const jsAssets = assets.filter((asset) => asset.name.endsWith(".js"));
const cssAssets = assets.filter((asset) => asset.name.endsWith(".css"));
const mainJs = jsAssets.find((asset) => asset.name.startsWith("index-")) ?? jsAssets[0];

const formatKb = (size) => `${(size / 1024).toFixed(1)} kB`;

console.log("\nPerformance build baseline");
console.log("--------------------------");
console.log(`Main JS: ${mainJs ? `${mainJs.name} ${formatKb(mainJs.size)}` : "not found"}`);
console.log(`Total JS: ${formatKb(jsAssets.reduce((sum, asset) => sum + asset.size, 0))}`);
console.log(`Total CSS: ${formatKb(cssAssets.reduce((sum, asset) => sum + asset.size, 0))}`);
console.log("\nLargest assets:");

for (const asset of assets.slice(0, 8)) {
  console.log(`- ${asset.name}: ${formatKb(asset.size)}`);
}

const totalJsSize = jsAssets.reduce((sum, asset) => sum + asset.size, 0);
const budgetErrors = [];

if (mainJs && mainJs.size > MAIN_JS_LIMIT) {
  budgetErrors.push(
    `Main JS exceeds ${formatKb(MAIN_JS_LIMIT)} (actual: ${formatKb(mainJs.size)}). Target is ${formatKb(MAIN_JS_TARGET)}.`,
  );
}

if (totalJsSize > TOTAL_JS_LIMIT) {
  budgetErrors.push(
    `Total JS assets exceed ${formatKb(TOTAL_JS_LIMIT)} (actual: ${formatKb(totalJsSize)}).`,
  );
}

for (const asset of jsAssets) {
  if (asset.name.includes("vendor") && asset.size > VENDOR_CHUNK_LIMIT) {
    budgetErrors.push(
      `Vendor chunk ${asset.name} exceeds ${formatKb(VENDOR_CHUNK_LIMIT)} (actual: ${formatKb(asset.size)}).`,
    );
  }
}

if (budgetErrors.length > 0) {
  console.error("\nPerformance build budget violated:");
  for (const err of budgetErrors) {
    console.error(`- ${err}`);
  }
  process.exit(1);
} else {
  console.log("\nAll build performance budgets satisfied.");
}
