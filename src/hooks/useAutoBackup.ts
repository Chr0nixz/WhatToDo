import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";

import type { AppData } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

const STORAGE_KEY = "whattodo:auto-backup";
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // check every 10 minutes

export type AutoBackupConfig = {
  enabled: boolean;
  intervalHours: number;
  folder: string | null;
};

export const defaultAutoBackupConfig: AutoBackupConfig = {
  enabled: false,
  intervalHours: 24,
  folder: null,
};

export const loadAutoBackupConfig = (): AutoBackupConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultAutoBackupConfig;
    const parsed = JSON.parse(raw) as Partial<AutoBackupConfig>;
    return {
      enabled: parsed.enabled ?? false,
      intervalHours: parsed.intervalHours ?? 24,
      folder: parsed.folder ?? null,
    };
  } catch {
    return defaultAutoBackupConfig;
  }
};

export const saveAutoBackupConfig = (config: AutoBackupConfig) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
};

const timestampForFile = () => new Date().toISOString().replace(/[:.]/g, "-");

const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Runs an automatic backup on app startup and then periodically checks
 * whether another backup is due. The backup cadence and destination folder
 * are controlled by the user via Settings (stored in localStorage).
 */
export const useAutoBackup = (data: AppData | null, actions: TodoActions) => {
  const lastRunRef = useRef<number>(0);

  useEffect(() => {
    if (!data || !isTauriRuntime()) {
      return;
    }

    const runBackup = async () => {
      const config = loadAutoBackupConfig();
      if (!config.enabled) {
        return;
      }

      const now = Date.now();
      const intervalMs = config.intervalHours * 60 * 60 * 1000;
      const lastBackupRaw = localStorage.getItem("whattodo:auto-backup:last-run");
      const lastBackup = lastBackupRaw ? Number(lastBackupRaw) : 0;
      if (now - lastBackup < intervalMs) {
        return;
      }

      try {
        const payload = await actions.exportBackup();
        const filename = `whattodo-auto-${timestampForFile()}.json`;
        const path = config.folder ? `${config.folder}/${filename}`.replace(/[/\\]+/g, (m) => m[0]) : null;
        const contents = JSON.stringify(payload, null, 2);

        if (path) {
          await invoke("write_text_file", { path, contents });
        }
        // If no folder configured, skip silently — the user will set one in Settings.
        lastRunRef.current = now;
        localStorage.setItem("whattodo:auto-backup:last-run", String(now));
      } catch {
        // Best-effort: silent failure. The user can still export manually.
      }
    };

    // Run shortly after startup to avoid blocking initial load.
    const startupTimer = window.setTimeout(() => void runBackup(), 5000);
    const intervalTimer = window.setInterval(() => void runBackup(), CHECK_INTERVAL_MS);

    return () => {
      window.clearTimeout(startupTimer);
      window.clearInterval(intervalTimer);
    };
  }, [data, actions]);
};
