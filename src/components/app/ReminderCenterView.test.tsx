import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import "@/i18n";
import i18n from "@/i18n";
import type { AppData, Reminder, Task } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";
import { useTodoStore } from "@/hooks/useTodoStore";

import { ReminderCenterView } from "./ReminderCenterView";

const makeTask = (patch: Partial<Task>): Task => ({
  id: patch.id ?? "task",
  workspaceId: "workspace",
  projectId: null,
  workingFolder: null,
  title: patch.title ?? "Task",
  notes: "",
  dueDate: "2026-06-01",
  dueTime: null,
  timezone: "Asia/Shanghai",
  priority: "medium",
  status: patch.status ?? "todo",
  completedAt: patch.completedAt ?? null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  deletedAt: patch.deletedAt ?? null,
  recurrenceTemplateId: patch.recurrenceTemplateId ?? null,
  recurrenceInstanceDate: patch.recurrenceInstanceDate ?? null,
  parentId: null,
  tags: [],
});

const makeReminder = (patch: Partial<Reminder>): Reminder => ({
  id: patch.id ?? "reminder",
  taskId: patch.taskId ?? "task",
  remindAt: patch.remindAt ?? "2026-06-01T00:00:00.000Z",
  offsetMinutes: 30,
  snoozedUntil: patch.snoozedUntil ?? null,
  firedAt: patch.firedAt ?? null,
  failedAt: patch.failedAt ?? null,
  lastError: patch.lastError ?? null,
  lastAttemptedAt: patch.lastAttemptedAt ?? null,
  enabled: patch.enabled ?? true,
});

const makeData = (tasks: Task[], reminders: Reminder[]): AppData => ({
  workspaceId: "workspace",
  workspaces: [],
  workspaceFolders: [],
  projects: [],
  tasks,
  deletedTasks: [],
  deletedWorkspaceFolders: [],
  availableTasks: [],
  reminders,
  savedViews: [],
  recurringTaskTemplates: [],
  attachments: [],
  settings: {
    theme: "system",
    accentColor: "blue",
    language: "en",
    defaultReminderOffset: 30,
    defaultWorkingFolder: null,
    defaultSavedViewId: null,
    notificationsEnabled: true,
    closeToTray: true,
  },
  settingsByWorkspace: {},
});

const makeActions = (patch: Partial<TodoActions> = {}): TodoActions =>
  ({
    snoozeReminder: vi.fn().mockResolvedValue({} as AppData),
    disableReminder: vi.fn().mockResolvedValue({} as AppData),
    toggleTask: vi.fn().mockResolvedValue({} as AppData),
    ...patch,
  }) as TodoActions;

describe("ReminderCenterView", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    useTodoStore.setState({ data: null, isLoading: true, error: null });
  });

  const seedStore = (tasks: Task[], reminders: Reminder[]) => {
    useTodoStore.setState({ data: makeData(tasks, reminders) });
  };

  it("renders missed, upcoming, and fired reminder groups", () => {
    seedStore(
      [
        makeTask({ id: "missed", title: "Missed task" }),
        makeTask({ id: "upcoming", title: "Upcoming task" }),
        makeTask({ id: "fired", title: "Fired task" }),
      ],
      [
        makeReminder({ id: "r-missed", taskId: "missed", remindAt: "2000-06-01T00:00:00.000Z" }),
        makeReminder({ id: "r-upcoming", taskId: "upcoming", remindAt: "2999-06-01T00:10:00.000Z" }),
        makeReminder({
          id: "r-fired",
          taskId: "fired",
          remindAt: "2000-06-01T00:00:00.000Z",
          firedAt: "2000-06-01T00:01:00.000Z",
        }),
      ],
    );

    render(<ReminderCenterView actions={makeActions()} onOpenTask={vi.fn()} />);

    expect(screen.getByText("Missed")).toBeInTheDocument();
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getAllByText("Fired").length).toBeGreaterThan(0);
    expect(screen.getByText("Missed task")).toBeInTheDocument();
    expect(screen.getByText("Upcoming task")).toBeInTheDocument();
    expect(screen.getByText("Fired task")).toBeInTheDocument();
  });

  it("renders failed reminders with their last error", () => {
    seedStore(
      [makeTask({ id: "failed", title: "Failed task" })],
      [
        makeReminder({
          id: "r-failed",
          taskId: "failed",
          failedAt: "2026-06-01T00:01:00.000Z",
          lastError: "send failed",
        }),
      ],
    );

    render(<ReminderCenterView actions={makeActions()} onOpenTask={vi.fn()} />);

    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    expect(screen.getByText("send failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("snoozes and disables reminders", async () => {
    const actions = makeActions();
    seedStore(
      [makeTask({ id: "missed", title: "Missed task" })],
      [makeReminder({ id: "r-missed", taskId: "missed", remindAt: "2000-06-01T00:00:00.000Z" })],
    );

    render(<ReminderCenterView actions={actions} onOpenTask={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByRole("button", { name: /10 min/i }));

    expect(actions.snoozeReminder).toHaveBeenCalledWith("r-missed", expect.any(String));
    await waitFor(() => expect(screen.getByText("Reminder snoozed.")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByRole("button", { name: /turn off reminder/i }));

    await waitFor(() => expect(actions.disableReminder).toHaveBeenCalledWith("r-missed"));
  });

  it("opens and completes tasks from a reminder row", async () => {
    const onOpenTask = vi.fn();
    const actions = makeActions();
    seedStore(
      [makeTask({ id: "missed", title: "Missed task" })],
      [makeReminder({ id: "r-missed", taskId: "missed", remindAt: "2000-06-01T00:00:00.000Z" })],
    );

    render(<ReminderCenterView actions={actions} onOpenTask={onOpenTask} />);

    fireEvent.click(screen.getByRole("button", { name: /open task/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete/i }));

    expect(onOpenTask).toHaveBeenCalledWith("missed");
    await waitFor(() => expect(actions.toggleTask).toHaveBeenCalledWith("missed"));
  });
});
