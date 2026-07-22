import { describe, expect, it } from "vitest";

import { buildCommandItems, filterCommandItems, orderCommandsWithRecent, pushRecentId } from "./commandPalette";
import type { AppData } from "./types";

const baseData: AppData = {
  workspaceId: "ws-1",
  workspaces: [
    { id: "ws-1", name: "Main", color: "#4fb8d8", createdAt: "2026-01-01", updatedAt: "2026-01-01", deletedAt: null },
    { id: "ws-2", name: "Side", color: "#6cc083", createdAt: "2026-01-01", updatedAt: "2026-01-01", deletedAt: null },
  ],
  workspaceFolders: [{ id: "f-1", workspaceId: "ws-1", name: "Docs", path: "D:\\Docs", createdAt: "2026-01-01", updatedAt: "2026-01-01", deletedAt: null }],
  projects: [
    {
      id: "p-1",
      workspaceId: "ws-1",
      name: "Launch",
      color: "#4fb8d8",
      status: "active",
      dueDate: null,
      workingFolder: "D:\\Launch",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      archivedAt: null,
      deletedAt: null,
    },
  ],
  tasks: [],
  deletedTasks: [],
  deletedWorkspaceFolders: [],
  availableTasks: [],
  reminders: [],
  savedViews: [
    {
      id: "v-1",
      workspaceId: "ws-1",
      name: "High priority",
      filters: { scope: "open", priority: "high", projectId: "all", reminder: "all", folder: "all", dateRange: "all", tags: [], tagMatch: "any", advancedFilter: null },
      pinned: false,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  ],
  recurringTaskTemplates: [],
  attachments: [],
  settings: {
    theme: "system",
    accentColor: "blue",
    language: "en",
    defaultReminderOffset: 30,
    defaultWorkingFolder: "D:\\Default",
    defaultSavedViewId: null,
    notificationsEnabled: false,
    closeToTray: true,
  },
  settingsByWorkspace: {},
};

describe("commandPalette", () => {
  it("filters commands by query", () => {
    const items = buildCommandItems({
      data: baseData,
      t: (key) => key,
      setView: () => undefined,
      onOpenTask: () => undefined,
      onNewTask: () => undefined,
      onSearchTasks: () => undefined,
      selectWorkspace: () => undefined,
      openFolder: () => undefined,
      applySavedView: () => undefined,
      onEditWorkspace: () => undefined,
      onEditProject: () => undefined,
      onCycleTheme: () => undefined,
      onToggleLanguage: () => undefined,
    });

    const filtered = filterCommandItems(items, "launch");
    expect(filtered.some((item) => item.id === "folder:project:p-1")).toBe(true);
  });

  it("hides the active workspace switch command", () => {
    const items = buildCommandItems({
      data: baseData,
      t: (key) => key,
      setView: () => undefined,
      onOpenTask: () => undefined,
      onNewTask: () => undefined,
      onSearchTasks: () => undefined,
      selectWorkspace: () => undefined,
      openFolder: () => undefined,
      applySavedView: () => undefined,
      onEditWorkspace: () => undefined,
      onEditProject: () => undefined,
      onCycleTheme: () => undefined,
      onToggleLanguage: () => undefined,
    });

    expect(items.some((item) => item.id === "workspace:ws-1")).toBe(false);
    expect(items.some((item) => item.id === "workspace:ws-2")).toBe(true);
  });

  it("orders empty-query commands with recent first", () => {
    const items = [
      { id: "b", group: "tasks" as const, label: "Beta", keywords: [], run: () => undefined },
      { id: "a", group: "tasks" as const, label: "Alpha", keywords: [], run: () => undefined },
      { id: "c", group: "tasks" as const, label: "Charlie", keywords: [], run: () => undefined },
    ];
    const ordered = orderCommandsWithRecent(items, ["c", "missing", "a"]);
    expect(ordered.map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(ordered[0].group).toBe("recent");
    expect(ordered[1].group).toBe("recent");
    expect(ordered[2].group).toBe("tasks");
  });

  it("pushes recent ids with LRU semantics", () => {
    expect(pushRecentId(["a", "b", "c"], "b", 3)).toEqual(["b", "a", "c"]);
    expect(pushRecentId(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });
});
