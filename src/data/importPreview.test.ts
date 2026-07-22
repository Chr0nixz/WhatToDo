import { describe, expect, it } from "vitest";

import { summarizeImportPreview } from "./importPreview";
import type { AppData, BackupPayload, Task, TaskSummary } from "./types";

const sampleTaskSummary = (): TaskSummary => ({
  id: "task-1",
  workspaceId: "ws-1",
  projectId: null,
  workingFolder: null,
  title: "Existing",
  dueDate: "2026-06-01",
  dueTime: null,
  timezone: "UTC",
  priority: "medium",
  status: "todo",
  completedAt: null,
  createdAt: "t",
  updatedAt: "t",
  deletedAt: null,
  recurrenceTemplateId: null,
  recurrenceInstanceDate: null,
  parentId: null,
  tags: [],
});

const sampleTask = (): Task => ({
  ...sampleTaskSummary(),
  notes: "keep",
});

const emptyApp = (): Pick<
  AppData,
  | "workspaces"
  | "workspaceFolders"
  | "projects"
  | "tasks"
  | "reminders"
  | "savedViews"
  | "recurringTaskTemplates"
  | "attachments"
> => ({
  workspaces: [{ id: "ws-1", name: "Main", color: "#4fb8d8", createdAt: "t", updatedAt: "t", deletedAt: null }],
  workspaceFolders: [],
  projects: [],
  tasks: [sampleTaskSummary()],
  reminders: [],
  savedViews: [],
  recurringTaskTemplates: [],
  attachments: [],
});

describe("summarizeImportPreview", () => {
  it("counts create vs overwrite and attachments", () => {
    const backup: BackupPayload = {
      whattodoBackupVersion: 2,
      exportedAt: "2026-06-01T00:00:00.000Z",
      workspaceId: "ws-1",
      workspaces: [
        { id: "ws-1", name: "Main", color: "#4fb8d8", createdAt: "t", updatedAt: "t", deletedAt: null },
        { id: "ws-2", name: "Side", color: "#6cc083", createdAt: "t", updatedAt: "t", deletedAt: null },
      ],
      workspaceFolders: [],
      projects: [],
      tasks: [
        { ...sampleTask(), title: "Overwrite me" },
        { ...sampleTask(), id: "task-2", title: "New task" },
      ],
      reminders: [],
      settingsByWorkspace: {},
      savedViews: [],
      recurringTaskTemplates: [],
      attachments: [
        {
          id: "att-1",
          task_id: "task-1",
          filename: "a.pdf",
          path: "D:\\a.pdf",
          mimeType: null,
          size: null,
          createdAt: "t",
        },
      ],
      reminderEvents: [{ id: "ev-1", reminderId: "r1", taskId: "task-1", eventType: "fired", detail: null, createdAt: "t" }],
    };

    const summary = summarizeImportPreview(emptyApp(), backup);
    expect(summary.counts.tasks).toBe(2);
    expect(summary.counts.attachments).toBe(1);
    expect(summary.counts.reminderEvents).toBe(1);
    expect(summary.overwrite.tasks).toBe(1);
    expect(summary.created.tasks).toBe(1);
    expect(summary.overwrite.workspaces).toBe(1);
    expect(summary.created.workspaces).toBe(1);
    expect(summary.sampleOverwriteTaskTitles).toEqual(["Overwrite me"]);
    expect(summary.overlappingWorkspaceNames).toEqual(["Main"]);
  });
});
