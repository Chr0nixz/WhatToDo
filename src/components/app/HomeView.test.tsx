import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "@/i18n";
import type { AppData, Task } from "@/data/types";
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
});

const actions = {} as TodoActions;

describe("HomeView performance list behavior", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders selected-day tasks in a 150 item window", () => {
    render(
      <HomeView
        actions={actions}
        data={makeData(Array.from({ length: 160 }, (_, index) => makeTask(index + 1)))}
        searchQuery=""
        selectedDate="2026-06-01"
        selectedTaskId={null}
        setSearchQuery={vi.fn()}
        setSelectedDate={vi.fn()}
        setSelectedTaskId={vi.fn()}
      />,
    );

    expect(screen.queryByText("Task 151")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /加载更多/ }));
    expect(screen.getByText("Task 151")).toBeInTheDocument();
  });

  it("debounces search filtering", () => {
    vi.useFakeTimers();
    const props = {
      actions,
      data: makeData(Array.from({ length: 160 }, (_, index) => makeTask(index + 1))),
      selectedDate: "2026-06-01",
      selectedTaskId: null,
      setSearchQuery: vi.fn(),
      setSelectedDate: vi.fn(),
      setSelectedTaskId: vi.fn(),
    };
    const { rerender } = render(<HomeView {...props} searchQuery="" />);

    rerender(<HomeView {...props} searchQuery="Task 151" />);
    expect(screen.getByText("Task 1")).toBeInTheDocument();
    expect(screen.queryByText("Task 151")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByText("Task 1")).not.toBeInTheDocument();
    expect(screen.getByText("Task 151")).toBeInTheDocument();
  });
});
