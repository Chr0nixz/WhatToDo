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

const cargoLockPath = resolve(root, "src-tauri/Cargo.lock");
if (!existsSync(cargoLockPath)) {
  errors.push("src-tauri/Cargo.lock is missing.");
} else {
  const cargoLock = readFileSync(cargoLockPath, "utf8");
  const lockMatch = cargoLock.match(/\[\[package\]\]\r?\nname = "whattodo"\r?\nversion = "([^"]+)"/);
  const lockVersion = lockMatch?.[1];
  if (!lockVersion) {
    errors.push('Could not find package "whattodo" in src-tauri/Cargo.lock.');
  } else if (lockVersion !== packageJson.version) {
    errors.push(
      `Cargo.lock whattodo version mismatch: package.json=${packageJson.version}, Cargo.lock=${lockVersion}`,
    );
  }
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

const localKeyPath = resolve(root, ".tauri-updater-private-key.local");
if (existsSync(localKeyPath)) {
  errors.push(
    ".tauri-updater-private-key.local is still in the repository root. Move it outside the repo and set TAURI_SIGNING_PRIVATE_KEY_PATH.",
  );
}

const status = execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }).trim();
if (status) {
  errors.push("Git working tree is not clean. Commit or stash changes before creating a release.");
}

const runCargo = (label, args) => {
  try {
    execFileSync("cargo", args, { cwd: resolve(root, "src-tauri"), encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr).trim() : "";
    const stdout = error?.stdout ? String(error.stdout).trim() : "";
    const detail = [stderr, stdout].filter(Boolean).join("\n").slice(0, 2000);
    errors.push(`${label} failed.${detail ? `\n${detail}` : ""}`);
  }
};

runCargo("cargo fmt --check", ["fmt", "--check"]);
runCargo("cargo clippy", ["clippy", "--all-targets", "--", "-D", "warnings"]);
runCargo("cargo test --locked", ["test", "--locked"]);

const runPnpm = (label, args) => {
  try {
    execFileSync("pnpm", args, {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
      shell: process.platform === "win32",
    });
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr).trim() : "";
    const stdout = error?.stdout ? String(error.stdout).trim() : "";
    const detail = [stderr, stdout].filter(Boolean).join("\n").slice(0, 2000);
    errors.push(`${label} failed.${detail ? `\n${detail}` : ""}`);
  }
};

runPnpm("pnpm test", ["test"]);
runPnpm("pnpm build", ["build"]);

if (!process.env.TAURI_SIGNING_PRIVATE_KEY && !process.env.TAURI_SIGNING_PRIVATE_KEY_PATH) {
  errors.push("TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH is required for signed updater artifacts.");
}

if (process.env.TAURI_SIGNING_PRIVATE_KEY_PATH && !existsSync(process.env.TAURI_SIGNING_PRIVATE_KEY_PATH)) {
  errors.push(`TAURI_SIGNING_PRIVATE_KEY_PATH does not exist: ${process.env.TAURI_SIGNING_PRIVATE_KEY_PATH}`);
}

const pubkey = tauriConfig.plugins?.updater?.pubkey;
if (pubkey) {
  const trimmed = pubkey.trim();
  const isValidBase64 = /^[A-Za-z0-9+/\r\n]+={0,2}$/.test(trimmed);
  if (!isValidBase64) {
    errors.push("tauri.conf.json plugins.updater.pubkey is not valid base64.");
  } else {
    try {
      const decoded = Buffer.from(trimmed, "base64");
      if (decoded.length < 32) {
        errors.push(`tauri.conf.json plugins.updater.pubkey decoded length ${decoded.length} is too short (expected >=32 bytes).`);
      }
    } catch {
      errors.push("tauri.conf.json plugins.updater.pubkey could not be base64-decoded.");
    }
  }
}

const signingKeyProvided =
  Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY) || Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY_PATH);
const signingPassword = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;
if (signingKeyProvided && signingPassword === undefined) {
  console.warn(
    "Warning: TAURI_SIGNING_PRIVATE_KEY_PASSWORD is not set. If the signing key is password-protected, the release build will fail.",
  );
} else if (signingKeyProvided && signingPassword === "") {
  errors.push(
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD is an empty string. Unset it for an unprotected key, or provide the real password.",
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
