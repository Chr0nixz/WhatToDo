import { describe, expect, it } from "vitest";

import { parseBackupPayload } from "./backupSchema";

const validV1Backup = {
  whattodoBackupVersion: 1,
  exportedAt: "2026-06-01T00:00:00.000Z",
  workspaceId: "local-workspace",
  workspaces: [
    {
      id: "local-workspace",
      name: "Default",
      color: "#4fb8d8",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      deletedAt: null,
    },
  ],
  workspaceFolders: [],
  projects: [],
  tasks: [
    {
      id: "task_1",
      workspaceId: "local-workspace",
      projectId: null,
      workingFolder: null,
      title: "Test task",
      notes: "",
      dueDate: "2026-06-15",
      dueTime: null,
      timezone: "Asia/Shanghai",
      priority: "medium",
      status: "todo",
      completedAt: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      deletedAt: null,
      recurrenceTemplateId: null,
      recurrenceInstanceDate: null,
    },
  ],
  reminders: [],
  settingsByWorkspace: {
    "local-workspace": {
      theme: "system",
      accentColor: "blue",
      language: "zh",
      defaultReminderOffset: 30,
      defaultWorkingFolder: null,
      defaultSavedViewId: null,
      notificationsEnabled: false,
      closeToTray: true,
    },
  },
  savedViews: [],
};

const validV2Backup = {
  ...validV1Backup,
  whattodoBackupVersion: 2,
  recurringTaskTemplates: [],
};

describe("parseBackupPayload", () => {
  it("accepts a valid v1 backup without recurring templates", () => {
    const result = parseBackupPayload(validV1Backup);
    expect(result.success).toBe(true);
    expect(result.data?.whattodoBackupVersion).toBe(1);
  });

  it("accepts a valid v2 backup with recurring templates", () => {
    const result = parseBackupPayload(validV2Backup);
    expect(result.success).toBe(true);
    expect(result.data?.whattodoBackupVersion).toBe(2);
    expect(result.data?.recurringTaskTemplates).toEqual([]);
  });

  it("accepts a valid v3 backup with attachment bundle and client preferences", () => {
    const result = parseBackupPayload({
      ...validV2Backup,
      whattodoBackupVersion: 3,
      attachments: [],
      attachmentBundle: "sidecar",
      clientPreferences: {
        autoBackup: {
          enabled: true,
          intervalHours: 24,
          retentionCount: 30,
          retentionDays: 90,
        },
      },
    });
    expect(result.success).toBe(true);
    expect(result.data?.whattodoBackupVersion).toBe(3);
    if (result.data?.whattodoBackupVersion === 3) {
      expect(result.data.attachmentBundle).toBe("sidecar");
      expect(result.data.clientPreferences?.autoBackup?.retentionCount).toBe(30);
    }
  });

  it("accepts settings missing defaultSavedViewId and defaults to null", () => {
    const { defaultSavedViewId: _removed, ...settingsWithoutView } =
      validV1Backup.settingsByWorkspace["local-workspace"];
    const backup = {
      ...validV1Backup,
      settingsByWorkspace: {
        "local-workspace": settingsWithoutView,
      },
    };
    const result = parseBackupPayload(backup);
    expect(result.success).toBe(true);
    expect(result.data?.settingsByWorkspace["local-workspace"].defaultSavedViewId).toBeNull();
  });

  it("rejects a backup with unknown version", () => {
    const result = parseBackupPayload({ ...validV1Backup, whattodoBackupVersion: 99 });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects a backup missing required fields", () => {
    const { workspaces, ...missingWorkspaces } = validV1Backup;
    const result = parseBackupPayload(missingWorkspaces);
    expect(result.success).toBe(false);
    expect(result.error).toContain("workspaces");
  });

  it("rejects a backup with wrong task priority enum", () => {
    const badBackup = {
      ...validV1Backup,
      tasks: [{ ...validV1Backup.tasks[0], priority: "urgent" }],
    };
    const result = parseBackupPayload(badBackup);
    expect(result.success).toBe(false);
  });

  it("rejects a backup with wrong settings enum", () => {
    const badBackup = {
      ...validV1Backup,
      settingsByWorkspace: {
        "local-workspace": {
          ...validV1Backup.settingsByWorkspace["local-workspace"],
          theme: "purple",
        },
      },
    };
    const result = parseBackupPayload(badBackup);
    expect(result.success).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(parseBackupPayload(null).success).toBe(false);
    expect(parseBackupPayload("string").success).toBe(false);
    expect(parseBackupPayload(42).success).toBe(false);
    expect(parseBackupPayload(undefined).success).toBe(false);
  });

  it("rejects v2 backup missing recurringTaskTemplates", () => {
    const { recurringTaskTemplates, ...v2WithoutTemplates } = validV2Backup;
    const result = parseBackupPayload(v2WithoutTemplates);
    expect(result.success).toBe(false);
  });

  it("accepts v1 backup with optional recurringTaskTemplates", () => {
    const v1WithTemplates = {
      ...validV1Backup,
      recurringTaskTemplates: [],
    };
    const result = parseBackupPayload(v1WithTemplates);
    expect(result.success).toBe(true);
  });

  it("returns readable error message with field path", () => {
    const badBackup = {
      ...validV1Backup,
      tasks: [{ ...validV1Backup.tasks[0], dueDate: 123 }],
    };
    const result = parseBackupPayload(badBackup);
    expect(result.success).toBe(false);
    expect(result.error).toContain("tasks");
    expect(result.error).toContain("dueDate");
  });

  it("accepts a performance-fixture-shaped v2 backup (settings + empty templates)", () => {
    const fixtureShaped = {
      whattodoBackupVersion: 2,
      exportedAt: "2026-05-31T00:00:00.000Z",
      workspaceId: "local-workspace",
      workspaces: validV2Backup.workspaces,
      workspaceFolders: [],
      projects: [],
      tasks: [validV2Backup.tasks[0]],
      reminders: [],
      settingsByWorkspace: {
        "local-workspace": {
          theme: "system",
          accentColor: "blue",
          language: "zh",
          defaultReminderOffset: 30,
          defaultWorkingFolder: null,
          defaultSavedViewId: null,
          notificationsEnabled: false,
          closeToTray: true,
        },
      },
      savedViews: [],
      recurringTaskTemplates: [],
    };
    const result = parseBackupPayload(fixtureShaped);
    expect(result.success).toBe(true);
  });
});
