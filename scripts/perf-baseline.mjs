import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const DIST_ASSETS = join(process.cwd(), "dist", "assets");
const MAIN_JS_LIMIT = 500 * 1024;
const MAIN_JS_TARGET = 450 * 1024;

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

if (mainJs && mainJs.size > MAIN_JS_LIMIT) {
  console.error(`\nMain JS exceeds ${formatKb(MAIN_JS_LIMIT)}. Target is ${formatKb(MAIN_JS_TARGET)}.`);
  process.exit(1);
}
