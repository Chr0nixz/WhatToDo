import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTO_BACKUP_LAST_ERROR_KEY,
  AUTO_BACKUP_LAST_RUN_KEY,
  applyAutoBackupPreferencesFromBackup,
  loadAutoBackupConfig,
  runScheduledAutoBackup,
  saveAutoBackupConfig,
} from "./useAutoBackup";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

describe("runScheduledAutoBackup", () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    invoke.mockImplementation(async (cmd: string, args?: { folder?: string; filename?: string }) => {
      if (cmd === "join_backup_path") {
        return `${args?.folder}\\${args?.filename}`;
      }
      if (cmd === "write_text_file") {
        return undefined;
      }
      if (cmd === "export_attachment_sidecar") {
        return [];
      }
      if (cmd === "cleanup_auto_backups") {
        return 0;
      }
      return undefined;
    });
  });

  it("skips without updating last-run when folder is missing", async () => {
    saveAutoBackupConfig({
      enabled: true,
      intervalHours: 24,
      folder: null,
      retentionCount: 30,
      retentionDays: 90,
    });
    const exportBackup = vi.fn().mockResolvedValue({ whattodoBackupVersion: 3 });
    const result = await runScheduledAutoBackup({ exportBackup } as never);
    expect(result).toBe("skipped");
    expect(exportBackup).not.toHaveBeenCalled();
    expect(localStorage.getItem(AUTO_BACKUP_LAST_RUN_KEY)).toBeNull();
  });

  it("does not update last-run when write fails", async () => {
    saveAutoBackupConfig({
      enabled: true,
      intervalHours: 24,
      folder: "D:\\Backups",
      retentionCount: 30,
      retentionDays: 90,
    });
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "join_backup_path") return "D:\\Backups\\file.json";
      if (cmd === "write_text_file") throw new Error("disk full");
      return undefined;
    });
    const result = await runScheduledAutoBackup({
      exportBackup: vi.fn().mockResolvedValue({ whattodoBackupVersion: 3, attachments: [] }),
    } as never);
    expect(result).toBe("failed");
    expect(localStorage.getItem(AUTO_BACKUP_LAST_RUN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTO_BACKUP_LAST_ERROR_KEY)).toContain("disk full");
  });

  it("updates last-run only after a successful write and runs cleanup", async () => {
    saveAutoBackupConfig({
      enabled: true,
      intervalHours: 24,
      folder: "D:\\Backups",
      retentionCount: 5,
      retentionDays: 14,
    });
    const result = await runScheduledAutoBackup({
      exportBackup: vi.fn().mockResolvedValue({
        whattodoBackupVersion: 3,
        attachments: [],
        exportedAt: "2026-07-22T00:00:00.000Z",
        workspaceId: "ws",
        workspaces: [],
        workspaceFolders: [],
        projects: [],
        tasks: [],
        reminders: [],
        settingsByWorkspace: {},
        savedViews: [],
        recurringTaskTemplates: [],
      }),
    } as never);
    expect(result).toBe("written");
    expect(localStorage.getItem(AUTO_BACKUP_LAST_RUN_KEY)).toBeTruthy();
    expect(localStorage.getItem(AUTO_BACKUP_LAST_ERROR_KEY)).toBeNull();
    expect(invoke).toHaveBeenCalledWith(
      "join_backup_path",
      expect.objectContaining({ folder: "D:\\Backups" }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "cleanup_auto_backups",
      expect.objectContaining({ folder: "D:\\Backups", retentionCount: 5, retentionDays: 14 }),
    );
  });

  it("round-trips config through load/save including retention", () => {
    saveAutoBackupConfig({
      enabled: true,
      intervalHours: 12,
      folder: "\\\\server\\share",
      retentionCount: 8,
      retentionDays: 45,
    });
    expect(loadAutoBackupConfig()).toEqual({
      enabled: true,
      intervalHours: 12,
      folder: "\\\\server\\share",
      retentionCount: 8,
      retentionDays: 45,
    });
  });

  it("applies preferences from backup without overwriting folder", () => {
    saveAutoBackupConfig({
      enabled: false,
      intervalHours: 24,
      folder: "D:\\KeepMe",
      retentionCount: 30,
      retentionDays: 90,
    });
    applyAutoBackupPreferencesFromBackup({
      enabled: true,
      intervalHours: 6,
      retentionCount: 12,
      retentionDays: 20,
    });
    expect(loadAutoBackupConfig()).toEqual({
      enabled: true,
      intervalHours: 6,
      folder: "D:\\KeepMe",
      retentionCount: 12,
      retentionDays: 20,
    });
  });
});
