import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { parseBackupPayload } from "./backupSchema";
import { LocalRepository } from "./repository";
import type { BackupPayload } from "./types";

/**
 * 20k-task data-layer baseline (LocalRepository + generated fixture).
 *
 * This is intentionally separate from `pnpm perf:runtime` (2k CI budgets).
 * It is NOT a substitute for Tauri + SQLite desktop UI validation — see
 * docs/PERFORMANCE_VALIDATION.md. Run via `pnpm perf:sqlite` after
 * `pnpm perf:fixture`.
 *
 * Uses an unbounded in-memory localStorage stub so jsdom's 5MB quota does not
 * block 20k fixture import.
 */

const FIXTURE_PATH = join(process.cwd(), "tmp", "performance-backup-20000.json");

const IMPORT_BUDGET_MS = 8_000;
const LOAD_BUDGET_MS = 2_500;
const LOAD_TASK_PAGE_BUDGET_MS = 250;
const TOGGLE_BUDGET_MS = 500;
const SAVE_SETTINGS_BUDGET_MS = 500;

const percentile = (samples: number[], p: number) => {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
};

const installUnboundedLocalStorage = () => {
  const store = new Map<string, string>();
  const localStorageStub: Storage = {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  vi.stubGlobal("localStorage", localStorageStub);
};

describe("20k LocalRepository data-layer baseline", () => {
  let payload: BackupPayload | null = null;

  beforeAll(() => {
    if (!existsSync(FIXTURE_PATH)) {
      return;
    }
    const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
    const parsed = parseBackupPayload(raw);
    if (!parsed.success || !parsed.data) {
      throw new Error(`Invalid performance fixture: ${parsed.error}`);
    }
    payload = parsed.data;
  });

  beforeEach(() => {
    installUnboundedLocalStorage();
  });

  it("skips when the 20k fixture is missing (run pnpm perf:fixture first)", ({ skip }) => {
    if (!payload) {
      skip();
    }
    expect(payload?.tasks.length).toBeGreaterThanOrEqual(20_000);
  });

  it("imports the 20k fixture within budget", async ({ skip }) => {
    if (!payload) {
      skip();
      return;
    }
    const repository = new LocalRepository();
    await repository.load();

    const start = performance.now();
    const result = await repository.importBackup(payload, "replace");
    const elapsed = performance.now() - start;

    // Snapshot is workspace-scoped (~5k of 20k on the default workspace).
    expect(payload.tasks.length).toBeGreaterThanOrEqual(20_000);
    expect(result.data.tasks.length).toBeGreaterThanOrEqual(4_000);
    expect(elapsed).toBeLessThan(IMPORT_BUDGET_MS);
  });

  it("records P50/P95 for load, loadTaskPage, toggle, and saveSettings", async ({ skip }) => {
    if (!payload) {
      skip();
      return;
    }
    const repository = new LocalRepository();
    await repository.load();
    await repository.importBackup(payload, "replace");

    const loadSamples: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const start = performance.now();
      await repository.load();
      loadSamples.push(performance.now() - start);
    }

    const pageSamples: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const start = performance.now();
      await repository.loadTaskPage({
        workspaceId: "local-workspace",
        scope: "open",
        limit: 50,
        offset: i * 50,
        sort: "overview",
      });
      pageSamples.push(performance.now() - start);
    }

    const data = await repository.load();
    const toggleSamples: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const task = data.tasks[i];
      if (!task) break;
      const start = performance.now();
      await repository.toggleTask(task.id);
      toggleSamples.push(performance.now() - start);
    }

    const settingsSamples: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const start = performance.now();
      await repository.saveSettings({
        ...data.settings,
        theme: i % 2 === 0 ? "dark" : "light",
      });
      settingsSamples.push(performance.now() - start);
    }

    const summary = {
      load: { p50: percentile(loadSamples, 50), p95: percentile(loadSamples, 95) },
      loadTaskPage: { p50: percentile(pageSamples, 50), p95: percentile(pageSamples, 95) },
      toggleTask: { p50: percentile(toggleSamples, 50), p95: percentile(toggleSamples, 95) },
      saveSettings: { p50: percentile(settingsSamples, 50), p95: percentile(settingsSamples, 95) },
    };

    process.stdout.write(`perf:sqlite P50/P95 (ms) ${JSON.stringify(summary)}\n`);

    expect(summary.load.p95).toBeLessThan(LOAD_BUDGET_MS);
    expect(summary.loadTaskPage.p95).toBeLessThan(LOAD_TASK_PAGE_BUDGET_MS);
    expect(summary.toggleTask.p95).toBeLessThan(TOGGLE_BUDGET_MS);
    expect(summary.saveSettings.p95).toBeLessThan(SAVE_SETTINGS_BUDGET_MS);
  });
});
