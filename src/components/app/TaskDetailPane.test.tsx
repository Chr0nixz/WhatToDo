import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n";
import i18n from "@/i18n";
import type { Settings, Task } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

import { TaskDetailPane } from "./TaskDetailPane";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/openLocalPath", () => ({
  revealLocalPath: vi.fn(),
  openManagedAttachment: vi.fn(),
}));

const settings: Settings = {
  theme: "system",
  accentColor: "blue",
  language: "en",
  defaultReminderOffset: 30,
  defaultWorkingFolder: null,
  defaultSavedViewId: null,
  notificationsEnabled: false,
  closeToTray: true,
};

const makeTask = (patch: Partial<Task>): Task => ({
  id: patch.id ?? "task-1",
  workspaceId: "workspace",
  projectId: patch.projectId ?? null,
  workingFolder: patch.workingFolder ?? null,
  title: patch.title ?? "Review PR",
  notes: patch.notes ?? "",
  dueDate: patch.dueDate ?? "2026-08-18",
  dueTime: patch.dueTime ?? "18:00",
  timezone: "Asia/Shanghai",
  priority: patch.priority ?? "high",
  status: patch.status ?? "todo",
  completedAt: null,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-08-15T00:00:00.000Z",
  deletedAt: null,
  recurrenceTemplateId: null,
  recurrenceInstanceDate: null,
  parentId: null,
  tags: [],
});

const actions = {
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
} as unknown as TodoActions;

const renderPane = (task: Task) =>
  render(
    <TaskDetailPane
      actions={actions}
      attachments={[]}
      onClose={vi.fn()}
      projects={[]}
      recurringTaskTemplates={[]}
      reminders={[]}
      settings={settings}
      task={task}
      tasks={[task]}
    />,
  );

describe("TaskDetailPane", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("hydrates title, date, and time when a task is opened", async () => {
    renderPane(makeTask({}));

    await waitFor(() => {
      expect(screen.getByLabelText("Task title")).toHaveValue("Review PR");
    });
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-08-18");
    expect(screen.getByLabelText("Time")).toHaveValue("18:00");
    expect(screen.getByRole("heading", { name: /Review PR/ })).toBeInTheDocument();
  });

  it("hydrates fields when switching to another task", async () => {
    const first = makeTask({ id: "task-1", title: "First task" });
    const second = makeTask({
      id: "task-2",
      title: "Second task",
      dueDate: "2026-08-20",
      dueTime: "09:30",
      updatedAt: "2026-08-16T00:00:00.000Z",
    });
    const { rerender } = renderPane(first);

    await waitFor(() => {
      expect(screen.getByLabelText("Task title")).toHaveValue("First task");
    });

    rerender(
      <TaskDetailPane
        actions={actions}
        attachments={[]}
        onClose={vi.fn()}
        projects={[]}
        recurringTaskTemplates={[]}
        reminders={[]}
        settings={settings}
        task={second}
        tasks={[first, second]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Task title")).toHaveValue("Second task");
    });
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-08-20");
    expect(screen.getByLabelText("Time")).toHaveValue("09:30");
  });

  it("does not overwrite in-progress edits when the same task is refreshed", async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: "Original" });
    const { rerender } = renderPane(task);

    await waitFor(() => {
      expect(screen.getByLabelText("Task title")).toHaveValue("Original");
    });

    const titleInput = screen.getByLabelText("Task title");
    await user.clear(titleInput);
    await user.type(titleInput, "Local edit");

    rerender(
      <TaskDetailPane
        actions={actions}
        attachments={[]}
        onClose={vi.fn()}
        projects={[]}
        recurringTaskTemplates={[]}
        reminders={[]}
        settings={settings}
        task={makeTask({ title: "From server", updatedAt: "2026-08-16T00:00:00.000Z" })}
        tasks={[task]}
      />,
    );

    expect(screen.getByLabelText("Task title")).toHaveValue("Local edit");
    expect(screen.getByText("Unsaved")).toBeInTheDocument();
  });
});
