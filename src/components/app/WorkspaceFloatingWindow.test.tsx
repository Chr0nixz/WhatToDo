import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "@/i18n";
import type { AppData, Task } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

import { WorkspaceFloatingWindow } from "./WorkspaceFloatingWindow";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    innerSize: vi.fn().mockResolvedValue({ width: 380, height: 420 }),
    isAlwaysOnTop: vi.fn().mockResolvedValue(true),
    scaleFactor: vi.fn().mockResolvedValue(1),
    setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
    setMinSize: vi.fn().mockResolvedValue(undefined),
    setSize: vi.fn().mockResolvedValue(undefined),
    startDragging: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalSize: class LogicalSize {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
}));

const makeTask = (index: number): Task => ({
  id: `task-${index}`,
  workspaceId: "local-workspace",
  projectId: null,
  workingFolder: null,
  title: `Task ${index}`,
  notes: "",
  dueDate: "2026-06-01",
  dueTime: null,
  timezone: "Asia/Shanghai",
  priority: "medium",
  status: "todo",
  completedAt: null,
  createdAt: new Date(Date.UTC(2026, 5, 1, 0, 0, index)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 5, 1, 0, 0, index)).toISOString(),
  deletedAt: null,
  recurrenceTemplateId: null,
  recurrenceInstanceDate: null,
  parentId: null,
  tags: [],
});

const makeData = (tasks: Task[]): AppData => ({
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
  tasks,
  deletedTasks: [],
  deletedWorkspaceFolders: [],
  availableTasks: [],
  reminders: [],
  savedViews: [],
  recurringTaskTemplates: [],
  attachments: [],
  settings: {
    theme: "system",
    accentColor: "blue",
    language: "zh",
    defaultReminderOffset: 30,
    defaultWorkingFolder: null,
    defaultSavedViewId: null,
    notificationsEnabled: false,
    closeToTray: true,
  },
  settingsByWorkspace: {},
});

describe("WorkspaceFloatingWindow performance list behavior", () => {
  it(
    "loads workspace tasks in pages",
    async () => {
      const tasks = Array.from({ length: 160 }, (_, index) => makeTask(index + 1));
      const loadTaskPage = vi.fn(async ({ limit, offset }: { limit: number; offset: number }) => ({
        tasks: tasks.slice(offset, offset + limit),
        total: tasks.length,
        reminders: [],
      }));

      render(
        <WorkspaceFloatingWindow
          actions={{ loadTaskPage } as unknown as TodoActions}
          data={makeData(tasks)}
        />,
      );

      expect(await screen.findByText("Task 150")).toBeInTheDocument();
      expect(screen.queryByText("Task 151")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /加载更多/ }));
      expect(await screen.findByText("Task 151")).toBeInTheDocument();
      expect(loadTaskPage).toHaveBeenCalledWith(expect.objectContaining({ limit: 150, offset: 150 }));
    },
    15_000,
  );
});
