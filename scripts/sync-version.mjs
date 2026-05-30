import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const nextVersion = process.argv[2];
const semverPattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

if (!nextVersion || !semverPattern.test(nextVersion)) {
  console.error("Usage: pnpm release:sync-version <semver>");
  process.exit(1);
}

const packagePath = resolve(root, "package.json");
const tauriConfigPath = resolve(root, "src-tauri", "tauri.conf.json");
const cargoManifestPath = resolve(root, "src-tauri", "Cargo.toml");

const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
packageJson.version = nextVersion;
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
tauriConfig.version = nextVersion;
writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

const cargoManifest = readFileSync(cargoManifestPath, "utf8").replace(
  /^version = ".*"$/m,
  `version = "${nextVersion}"`,
);
writeFileSync(cargoManifestPath, cargoManifest);

console.log(`Synced release version ${nextVersion}.`);
