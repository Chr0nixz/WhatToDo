import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";

import {
  cleanupAutoBackupFiles,
  writeBackupBundle,
} from "@/data/backupAttachments";
import type { BackupAutoBackupPreferences } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

const STORAGE_KEY = "whattodo:auto-backup";
export const AUTO_BACKUP_LAST_RUN_KEY = "whattodo:auto-backup:last-run";
export const AUTO_BACKUP_LAST_ERROR_KEY = "whattodo:auto-backup:last-error";
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // check every 10 minutes

export type AutoBackupPreferences = BackupAutoBackupPreferences;

export type AutoBackupConfig = AutoBackupPreferences & {
  folder: string | null;
};

export const defaultAutoBackupConfig: AutoBackupConfig = {
  enabled: false,
  intervalHours: 24,
  folder: null,
  retentionCount: 30,
  retentionDays: 90,
};

const clampPositiveInt = (value: unknown, fallback: number, max = 3650): number => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return Math.min(Math.floor(n), max);
};

export const loadAutoBackupConfig = (): AutoBackupConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultAutoBackupConfig;
    const parsed = JSON.parse(raw) as Partial<AutoBackupConfig>;
    return {
      enabled: parsed.enabled ?? false,
      intervalHours: clampPositiveInt(parsed.intervalHours, 24, 168 * 4),
      folder: parsed.folder ?? null,
      retentionCount: clampPositiveInt(parsed.retentionCount, 30, 500),
      retentionDays: clampPositiveInt(parsed.retentionDays, 90, 3650),
    };
  } catch {
    return defaultAutoBackupConfig;
  }
};

export const saveAutoBackupConfig = (config: AutoBackupConfig) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
};

export const toAutoBackupPreferences = (config: AutoBackupConfig): AutoBackupPreferences => ({
  enabled: config.enabled,
  intervalHours: config.intervalHours,
  retentionCount: config.retentionCount,
  retentionDays: config.retentionDays,
});

/** Apply preferences from a backup without overwriting the device-local folder. */
export const applyAutoBackupPreferencesFromBackup = (prefs: AutoBackupPreferences) => {
  const current = loadAutoBackupConfig();
  saveAutoBackupConfig({
    ...current,
    enabled: prefs.enabled,
    intervalHours: clampPositiveInt(prefs.intervalHours, current.intervalHours, 168 * 4),
    retentionCount: clampPositiveInt(prefs.retentionCount, current.retentionCount, 500),
    retentionDays: clampPositiveInt(prefs.retentionDays, current.retentionDays, 3650),
  });
};

export const loadAutoBackupLastError = (): string | null => {
  try {
    return localStorage.getItem(AUTO_BACKUP_LAST_ERROR_KEY);
  } catch {
    return null;
  }
};

const timestampForFile = () => new Date().toISOString().replace(/[:.]/g, "-");

const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Exported for unit tests: perform one auto-backup attempt. */
export const runScheduledAutoBackup = async (actions: TodoActions): Promise<"skipped" | "written" | "failed"> => {
  const config = loadAutoBackupConfig();
  if (!config.enabled) {
    return "skipped";
  }

  const now = Date.now();
  const intervalMs = config.intervalHours * 60 * 60 * 1000;
  const lastBackupRaw = localStorage.getItem(AUTO_BACKUP_LAST_RUN_KEY);
  const lastBackup = lastBackupRaw ? Number(lastBackupRaw) : 0;
  if (now - lastBackup < intervalMs) {
    return "skipped";
  }

  if (!config.folder) {
    // Do not update last-run — keep retrying until a folder is configured.
    return "skipped";
  }

  try {
    const payload = await actions.exportBackup();
    const filename = `whattodo-auto-${timestampForFile()}.json`;
    const path = await invoke<string>("join_backup_path", {
      folder: config.folder,
      filename,
    });
    await writeBackupBundle(path, payload, {
      clientPreferences: { autoBackup: toAutoBackupPreferences(config) },
    });
    try {
      await cleanupAutoBackupFiles(config.folder, config.retentionCount, config.retentionDays);
    } catch {
      // Retention cleanup is best-effort; the new backup already succeeded.
    }
    localStorage.setItem(AUTO_BACKUP_LAST_RUN_KEY, String(now));
    localStorage.removeItem(AUTO_BACKUP_LAST_ERROR_KEY);
    return "written";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    localStorage.setItem(AUTO_BACKUP_LAST_ERROR_KEY, message);
    return "failed";
  }
};

/**
 * Runs an automatic backup on app startup and then periodically checks
 * whether another backup is due. The backup cadence and destination folder
 * are controlled by the user via Settings (stored in localStorage).
 */
export const useAutoBackup = (ready: boolean, actions: TodoActions) => {
  const lastRunRef = useRef<number>(0);

  useEffect(() => {
    if (!ready || !isTauriRuntime()) {
      return;
    }

    const runBackup = async () => {
      const result = await runScheduledAutoBackup(actions);
      if (result === "written") {
        lastRunRef.current = Date.now();
      }
    };

    const startupTimer = window.setTimeout(() => void runBackup(), 5000);
    const intervalTimer = window.setInterval(() => void runBackup(), CHECK_INTERVAL_MS);

    return () => {
      window.clearTimeout(startupTimer);
      window.clearInterval(intervalTimer);
    };
  }, [ready, actions]);
};
