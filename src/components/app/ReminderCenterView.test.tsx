import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
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
    loadReminderEvents: vi.fn().mockResolvedValue([]),
    ...patch,
  }) as TodoActions;

const renderView = async (ui: ReactElement) => {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(ui);
  });
  return view;
};

const clickAsync = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.click(element);
  });
};

describe("ReminderCenterView", () => {
  beforeEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  afterEach(() => {
    useTodoStore.setState({ data: null, isLoading: true, error: null, tasksRevision: 0 });
  });

  const seedStore = (tasks: Task[], reminders: Reminder[]) => {
    useTodoStore.setState({
      data: makeData(tasks, reminders),
      isLoading: false,
      error: null,
    });
  };

  it("renders missed, upcoming, and fired reminder groups", async () => {
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

    await renderView(<ReminderCenterView actions={makeActions()} onOpenTask={vi.fn()} />);

    expect(screen.getByText("Missed")).toBeInTheDocument();
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getAllByText("Fired").length).toBeGreaterThan(0);
    expect(screen.getByText("Missed task")).toBeInTheDocument();
    expect(screen.getByText("Upcoming task")).toBeInTheDocument();
    expect(screen.getByText("Fired task")).toBeInTheDocument();
  });

  it("renders failed reminders with their last error", async () => {
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

    await renderView(<ReminderCenterView actions={makeActions()} onOpenTask={vi.fn()} />);

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

    await renderView(<ReminderCenterView actions={actions} onOpenTask={vi.fn()} />);

    await clickAsync(screen.getByRole("button", { name: /more actions/i }));
    await clickAsync(screen.getByRole("button", { name: /10 min/i }));

    expect(actions.snoozeReminder).toHaveBeenCalledWith("r-missed", expect.any(String));
    await waitFor(() => expect(screen.getByText("Reminder snoozed.")).toBeInTheDocument());

    await clickAsync(screen.getByRole("button", { name: /more actions/i }));
    await clickAsync(screen.getByRole("button", { name: /turn off reminder/i }));

    await waitFor(() => expect(actions.disableReminder).toHaveBeenCalledWith("r-missed"));
  });

  it("opens and completes tasks from a reminder row", async () => {
    const onOpenTask = vi.fn();
    const actions = makeActions();
    seedStore(
      [makeTask({ id: "missed", title: "Missed task" })],
      [makeReminder({ id: "r-missed", taskId: "missed", remindAt: "2000-06-01T00:00:00.000Z" })],
    );

    await renderView(<ReminderCenterView actions={actions} onOpenTask={onOpenTask} />);

    await clickAsync(screen.getByRole("button", { name: /open task/i }));
    await clickAsync(screen.getByRole("button", { name: /complete/i }));

    expect(onOpenTask).toHaveBeenCalledWith("missed");
    await waitFor(() => expect(actions.toggleTask).toHaveBeenCalledWith("missed"));
  });

  it("snoozes all missed reminders and reports success", async () => {
    const actions = makeActions({
      snoozeReminder: vi.fn().mockResolvedValue({} as AppData),
    });
    seedStore(
      [
        makeTask({ id: "missed-1", title: "Missed 1" }),
        makeTask({ id: "missed-2", title: "Missed 2" }),
      ],
      [
        makeReminder({ id: "r-1", taskId: "missed-1", remindAt: "2000-06-01T00:00:00.000Z" }),
        makeReminder({ id: "r-2", taskId: "missed-2", remindAt: "2000-06-01T00:00:00.000Z" }),
      ],
    );

    await renderView(<ReminderCenterView actions={actions} onOpenTask={vi.fn()} />);

    await clickAsync(screen.getByRole("button", { name: /snooze all until tomorrow/i }));

    await waitFor(() => expect(actions.snoozeReminder).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("Reminder snoozed.")).toBeInTheDocument());
  });

  it("reports partial success when only some missed reminders snooze", async () => {
    const actions = makeActions({
      snoozeReminder: vi
        .fn()
        .mockResolvedValueOnce({} as AppData)
        .mockResolvedValueOnce({} as AppData)
        .mockRejectedValueOnce(new Error("boom")),
    });
    seedStore(
      [
        makeTask({ id: "missed-1", title: "Missed 1" }),
        makeTask({ id: "missed-2", title: "Missed 2" }),
        makeTask({ id: "missed-3", title: "Missed 3" }),
      ],
      [
        makeReminder({ id: "r-1", taskId: "missed-1", remindAt: "2000-06-01T00:00:00.000Z" }),
        makeReminder({ id: "r-2", taskId: "missed-2", remindAt: "2000-06-01T00:00:00.000Z" }),
        makeReminder({ id: "r-3", taskId: "missed-3", remindAt: "2000-06-01T00:00:00.000Z" }),
      ],
    );

    await renderView(<ReminderCenterView actions={actions} onOpenTask={vi.fn()} />);

    await clickAsync(screen.getByRole("button", { name: /snooze all until tomorrow/i }));

    await waitFor(() => expect(screen.getByText("Snoozed 2 of 3 reminders. 1 failed.")).toBeInTheDocument());
  });

  it("shows the error toast when snoozing all missed reminders fails entirely", async () => {
    const actions = makeActions({
      snoozeReminder: vi.fn().mockRejectedValue(new Error("boom")),
    });
    seedStore(
      [makeTask({ id: "missed-1", title: "Missed 1" })],
      [makeReminder({ id: "r-1", taskId: "missed-1", remindAt: "2000-06-01T00:00:00.000Z" })],
    );

    await renderView(<ReminderCenterView actions={actions} onOpenTask={vi.fn()} />);

    await clickAsync(screen.getByRole("button", { name: /snooze all until tomorrow/i }));

    await waitFor(() => expect(screen.getByText("Could not update the reminder. Try again.")).toBeInTheDocument());
  });
});
