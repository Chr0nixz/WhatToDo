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
    const { workspaces: _workspaces, ...missingWorkspaces } = validV1Backup;
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
    const { recurringTaskTemplates: _recurringTaskTemplates, ...v2WithoutTemplates } = validV2Backup;
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

  it("sanitizes and heals orphan references to preserve referential integrity (ARC-018)", () => {
    const rawWithOrphans = {
      whattodoBackupVersion: 3,
      exportedAt: "2026-06-01T00:00:00.000Z",
      workspaceId: "ws_1",
      workspaces: [
        {
          id: "ws_1",
          name: "Main",
          color: "#4fb8d8",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
          deletedAt: null,
        },
      ],
      workspaceFolders: [],
      projects: [
        {
          id: "proj_valid",
          workspaceId: "ws_1",
          name: "Valid Project",
          color: "#10b981",
          status: "active" as const,
          dueDate: null,
          workingFolder: null,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
          archivedAt: null,
          deletedAt: null,
        },
      ],
      tasks: [
        {
          id: "task_1",
          workspaceId: "ws_1",
          projectId: "proj_valid", // Valid project
          workingFolder: null,
          title: "Valid task",
          notes: "",
          dueDate: "2026-06-01",
          dueTime: null,
          timezone: "UTC",
          priority: "medium" as const,
          status: "todo" as const,
          completedAt: null,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
          deletedAt: null,
          recurrenceTemplateId: null,
          recurrenceInstanceDate: null,
          parentId: null,
          tags: [],
        },
        {
          id: "task_2",
          workspaceId: "ws_1",
          projectId: "proj_nonexistent", // Orphan project reference!
          workingFolder: null,
          title: "Task with orphan project and self-parent",
          notes: "",
          dueDate: "2026-06-01",
          dueTime: null,
          timezone: "UTC",
          priority: "medium" as const,
          status: "todo" as const,
          completedAt: null,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
          deletedAt: null,
          recurrenceTemplateId: null,
          recurrenceInstanceDate: null,
          parentId: "task_2", // Self-referential parent cycle!
          tags: [],
        },
        {
          id: "task_3",
          workspaceId: "ws_1",
          projectId: null,
          workingFolder: null,
          title: "Task with missing parent",
          notes: "",
          dueDate: "2026-06-01",
          dueTime: null,
          timezone: "UTC",
          priority: "medium" as const,
          status: "todo" as const,
          completedAt: null,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
          deletedAt: null,
          recurrenceTemplateId: null,
          recurrenceInstanceDate: null,
          parentId: "task_missing", // Orphan parent reference!
          tags: [],
        },
      ],
      reminders: [
        {
          id: "rem_valid",
          taskId: "task_1", // Valid task
          remindAt: "2026-06-01T09:00:00.000Z",
          offsetMinutes: 0,
          snoozedUntil: null,
          firedAt: null,
          failedAt: null,
          lastError: null,
          lastAttemptedAt: null,
          enabled: true,
        },
        {
          id: "rem_orphan",
          taskId: "task_ghost", // Orphan reminder!
          remindAt: "2026-06-01T09:00:00.000Z",
          offsetMinutes: 0,
          snoozedUntil: null,
          firedAt: null,
          failedAt: null,
          lastError: null,
          lastAttemptedAt: null,
          enabled: true,
        },
      ],
      attachments: [
        {
          id: "att_valid",
          task_id: "task_1", // Valid task
          filename: "doc.pdf",
          path: "/attachments/att_valid/doc.pdf",
          mimeType: "application/pdf",
          size: 1024,
          createdAt: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "att_orphan",
          task_id: "task_ghost", // Orphan attachment!
          filename: "bad.pdf",
          path: "/attachments/att_orphan/bad.pdf",
          mimeType: "application/pdf",
          size: 1024,
          createdAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      reminderEvents: [
        {
          id: "ev_valid",
          reminderId: "rem_valid",
          taskId: "task_1",
          eventType: "fired" as const,
          detail: null,
          createdAt: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "ev_orphan",
          reminderId: "rem_ghost",
          taskId: "task_1",
          eventType: "failed" as const,
          detail: "missing reminder",
          createdAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      settingsByWorkspace: {
        ws_1: {
          theme: "system" as const,
          accentColor: "blue" as const,
          language: "zh" as const,
          defaultReminderOffset: 0,
          defaultWorkingFolder: null,
          defaultSavedViewId: null,
          notificationsEnabled: true,
          closeToTray: false,
        },
      },
      savedViews: [],
      recurringTaskTemplates: [],
      attachmentBundle: "none" as const,
    };

    const parsed = parseBackupPayload(rawWithOrphans);
    expect(parsed.success).toBe(true);
    const data = parsed.data!;

    // 1. Task projectId healed
    const task2 = data.tasks.find((t) => t.id === "task_2")!;
    expect(task2.projectId).toBeNull();
    expect(task2.parentId).toBeNull(); // Self parent cycle broken

    const task3 = data.tasks.find((t) => t.id === "task_3")!;
    expect(task3.parentId).toBeNull(); // Missing parent healed to null

    // Valid task remains untouched
    const task1 = data.tasks.find((t) => t.id === "task_1")!;
    expect(task1.projectId).toBe("proj_valid");

    // 2. Orphan reminder filtered
    expect(data.reminders.map((r) => r.id)).toEqual(["rem_valid"]);

    // 3. Orphan attachment filtered
    if ("attachments" in data && Array.isArray(data.attachments)) {
      expect(data.attachments.map((a) => a.id)).toEqual(["att_valid"]);
    }

    // 4. Orphan reminder event filtered
    if (data.reminderEvents) {
      expect(data.reminderEvents.map((e) => e.id)).toEqual(["ev_valid"]);
    }
  });
});
