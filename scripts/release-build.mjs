import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const env = { ...process.env };

if (!env.TAURI_SIGNING_PRIVATE_KEY && env.TAURI_SIGNING_PRIVATE_KEY_PATH) {
  env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(env.TAURI_SIGNING_PRIVATE_KEY_PATH, "utf8").trim();
}

env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= "";

const check = spawnSync("node", ["scripts/release-check.mjs"], {
  cwd: root,
  env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (check.status !== 0) {
  process.exit(check.status ?? 1);
}

const build = spawnSync("pnpm", ["tauri", "build"], {
  cwd: root,
  env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

process.exit(build.status ?? 1);
