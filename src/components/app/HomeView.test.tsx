import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n";
import i18n from "@/i18n";
import type { AppData, Task, TaskPageResult } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

import { HomeView } from "./HomeView";

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

function makeActions(dayTasks: Task[]): TodoActions {
  const pageSize = 150;
  return {
    loadTaskPage: vi.fn(async (input) => {
      if (input.dateRange === "overdue") {
        return { tasks: [], total: 0, reminders: [] } satisfies TaskPageResult;
      }
      const query = (input.query ?? "").trim().toLowerCase();
      const filtered = dayTasks.filter((task) => (query ? task.title.toLowerCase().includes(query) : true));
      const offset = input.offset ?? 0;
      const limit = input.limit ?? pageSize;
      return {
        tasks: filtered.slice(offset, offset + limit),
        total: filtered.length,
        reminders: [],
      } satisfies TaskPageResult;
    }),
    loadDueDateCounts: vi.fn(async () => ({ "2026-06-01": dayTasks.length })),
  } as unknown as TodoActions;
}

describe("HomeView performance list behavior", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(
    "renders selected-day tasks in a 150 item window",
    async () => {
      const dayTasks = Array.from({ length: 160 }, (_, index) => makeTask(index + 1));
      const data = makeData(dayTasks);
      const actions = makeActions(dayTasks);

      render(
        <HomeView
          actions={actions}
          data={data}
          searchQuery=""
          selectedDate="2026-06-01"
          selectedTaskId={null}
          setSearchQuery={vi.fn()}
          setSelectedDate={vi.fn()}
          setSelectedTaskId={vi.fn()}
        />,
      );

      expect(await screen.findByText("Task 1", undefined, { timeout: 10_000 })).toBeInTheDocument();
      expect(screen.queryByText("Task 151")).not.toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /加载更多|Load more/i }));
      });

      expect(await screen.findByText("Task 151", undefined, { timeout: 10_000 })).toBeInTheDocument();
    },
    20_000,
  );

  it("debounces search filtering", async () => {
    const dayTasks = Array.from({ length: 160 }, (_, index) => makeTask(index + 1));
    const data = makeData(dayTasks);
    const actions = makeActions(dayTasks);
    const props = {
      actions,
      data,
      selectedDate: "2026-06-01",
      selectedTaskId: null,
      setSearchQuery: vi.fn(),
      setSelectedDate: vi.fn(),
      setSelectedTaskId: vi.fn(),
    };
    const { rerender } = render(<HomeView {...props} searchQuery="" />);

    expect(await screen.findByText("Task 1", undefined, { timeout: 10_000 })).toBeInTheDocument();

    vi.useFakeTimers();
    rerender(<HomeView {...props} searchQuery="Task 151" />);
    expect(screen.getByText("Task 1")).toBeInTheDocument();
    expect(screen.queryByText("Task 151")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.queryByText("Task 1")).not.toBeInTheDocument();
      expect(screen.getByText("Task 151")).toBeInTheDocument();
    });
  }, 20_000);
});
