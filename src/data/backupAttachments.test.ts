import { describe, expect, it } from "vitest";

import {
  backupSidecarFolderName,
  getBackupAttachments,
  parseSidecarRelativePath,
  prepareBackupExport,
  SIDECAR_PATH_PREFIX,
  toSidecarRelativePath,
} from "./backupAttachments";
import type { BackupPayload } from "./types";

const basePayload = {
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
  reminderEvents: [],
} satisfies Omit<Extract<BackupPayload, { whattodoBackupVersion: 2 }>, "whattodoBackupVersion" | "attachments">;

describe("backupAttachments helpers", () => {
  it("builds and parses sidecar relative paths", () => {
    const path = toSidecarRelativePath("att_1", "notes.pdf");
    expect(path).toBe(`${SIDECAR_PATH_PREFIX}/att_1/notes.pdf`);
    expect(parseSidecarRelativePath(path)).toEqual({ id: "att_1", filename: "notes.pdf" });
    expect(parseSidecarRelativePath("C:/attachments/att_1/notes.pdf")).toBeNull();
  });

  it("derives sidecar folder name from json path", () => {
    expect(backupSidecarFolderName("D:\\Backups\\whattodo-auto-1.json")).toBe("whattodo-auto-1_attachments");
    expect(backupSidecarFolderName("/tmp/whattodo-backup.json")).toBe("whattodo-backup_attachments");
  });

  it("rewrites managed attachment paths and marks sidecar bundle", () => {
    const payload: BackupPayload = {
      ...basePayload,
      whattodoBackupVersion: 2,
      attachments: [
        {
          id: "att_1",
          task_id: "task_1",
          filename: "a.txt",
          path: "C:/Users/me/AppData/attachments/att_1/a.txt",
          mimeType: "text/plain",
          size: 3,
          createdAt: "2026-07-22T00:00:00.000Z",
        },
        {
          id: "att_2",
          task_id: "task_1",
          filename: "external.txt",
          path: "D:/Docs/external.txt",
          mimeType: "text/plain",
          size: 1,
          createdAt: "2026-07-22T00:00:00.000Z",
        },
      ],
    };

    const prepared = prepareBackupExport(payload, {
      clientPreferences: {
        autoBackup: {
          enabled: true,
          intervalHours: 12,
          retentionCount: 10,
          retentionDays: 30,
        },
      },
    });

    expect(prepared.payload.whattodoBackupVersion).toBe(3);
    expect(prepared.payload.attachmentBundle).toBe("sidecar");
    expect(prepared.packItems).toHaveLength(1);
    expect(prepared.packItems[0]?.id).toBe("att_1");
    expect(getBackupAttachments(prepared.payload)[0]?.path).toBe(`${SIDECAR_PATH_PREFIX}/att_1/a.txt`);
    expect(getBackupAttachments(prepared.payload)[1]?.path).toBe("D:/Docs/external.txt");
    expect(prepared.payload.clientPreferences?.autoBackup?.retentionCount).toBe(10);
  });
});
