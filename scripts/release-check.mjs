import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const errors = [];

const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const packageJson = readJson("package.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const cargoManifest = readFileSync(resolve(root, "src-tauri/Cargo.toml"), "utf8");
const cargoVersion = cargoManifest.match(/^version = "(.+)"$/m)?.[1];

if (packageJson.version !== tauriConfig.version || packageJson.version !== cargoVersion) {
  errors.push(
    `Version mismatch: package.json=${packageJson.version}, tauri.conf.json=${tauriConfig.version}, Cargo.toml=${cargoVersion}`,
  );
}

if (!existsSync(resolve(root, "CHANGELOG.md"))) {
  errors.push("CHANGELOG.md is missing.");
} else {
  const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
  if (!changelog.includes(`## ${packageJson.version}`) && !changelog.includes(`## [${packageJson.version}]`)) {
    errors.push(`CHANGELOG.md does not contain an entry for ${packageJson.version}.`);
  }
}

if (!tauriConfig.bundle?.createUpdaterArtifacts) {
  errors.push("tauri.conf.json must set bundle.createUpdaterArtifacts to true.");
}

if (!tauriConfig.plugins?.updater?.pubkey || !tauriConfig.plugins?.updater?.endpoints?.length) {
  errors.push("tauri.conf.json must configure plugins.updater.pubkey and endpoints.");
}

const status = execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }).trim();
if (status) {
  errors.push("Git working tree is not clean. Commit or stash changes before creating a release.");
}

if (!process.env.TAURI_SIGNING_PRIVATE_KEY && !process.env.TAURI_SIGNING_PRIVATE_KEY_PATH) {
  errors.push("TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH is required for signed updater artifacts.");
}

if (process.env.TAURI_SIGNING_PRIVATE_KEY_PATH && !existsSync(process.env.TAURI_SIGNING_PRIVATE_KEY_PATH)) {
  errors.push(`TAURI_SIGNING_PRIVATE_KEY_PATH does not exist: ${process.env.TAURI_SIGNING_PRIVATE_KEY_PATH}`);
}

// Validate the updater pubkey is well-formed. Tauri updater pubkeys are
// base64-encoded (Djb or Ed25519) — at minimum, decode and check length.
const pubkey = tauriConfig.plugins?.updater?.pubkey;
if (pubkey) {
  const trimmed = pubkey.trim();
  const isValidBase64 = /^[A-Za-z0-9+/\r\n]+={0,2}$/.test(trimmed);
  if (!isValidBase64) {
    errors.push("tauri.conf.json plugins.updater.pubkey is not valid base64.");
  } else {
    try {
      const decoded = Buffer.from(trimmed, "base64");
      // Ed25519 public key is 32 bytes; Djb (x25519) is also 32 bytes.
      if (decoded.length < 32) {
        errors.push(`tauri.conf.json plugins.updater.pubkey decoded length ${decoded.length} is too short (expected >=32 bytes).`);
      }
    } catch {
      errors.push("tauri.conf.json plugins.updater.pubkey could not be base64-decoded.");
    }
  }
}

// Warn if password is required but missing. Tauri signing keys are often
// password-protected; surface a clear error instead of letting signing fail
// silently mid-build.
const signingKeyProvided =
  Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY) ||
  Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY_PATH);
const signingPasswordProvided =
  Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) ||
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD" in process.env;
if (signingKeyProvided && !signingPasswordProvided) {
  console.warn(
    "Warning: TAURI_SIGNING_PRIVATE_KEY_PASSWORD is not set. If the signing key is password-protected, the release build will fail.",
  );
}

if (errors.length) {
  console.error("Release check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Release check passed for ${packageJson.version}.`);
