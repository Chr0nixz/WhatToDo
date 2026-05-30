import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n";
import i18n from "@/i18n";
import type { AppData } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

import { TaskComposer } from "./TaskComposer";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));

const makeActions = (createTask: TodoActions["createTask"], createRecurringTask = vi.fn()): TodoActions =>
  ({
    createTask,
    createRecurringTask,
  }) as unknown as TodoActions;

describe("TaskComposer", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("blocks empty titles with an inline error", async () => {
    const user = userEvent.setup();
    const createTask = vi.fn();
    render(
      <TaskComposer
        actions={makeActions(createTask)}
        defaultDate="2026-06-01"
        projects={[]}
        settings={{
          theme: "system",
          accentColor: "blue",
          language: "en",
          defaultReminderOffset: 30,
          defaultWorkingFolder: null,
          notificationsEnabled: false,
          closeToTray: true,
        }}
        variant="dialog"
      />,
    );

    await user.click(screen.getByRole("button", { name: /add/i }));

    expect(createTask).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a task title.")).toBeInTheDocument();
  });

  it("disables submit while creating to prevent duplicate tasks", async () => {
    const user = userEvent.setup();
    const resolver: { current: (() => void) | null } = { current: null };
    const createTask = vi.fn(
      () =>
        new Promise<AppData>((resolve) => {
          resolver.current = () => resolve({} as AppData);
        }),
    );

    render(
      <TaskComposer
        actions={makeActions(createTask)}
        defaultDate="2026-06-01"
        projects={[]}
        settings={{
          theme: "system",
          accentColor: "blue",
          language: "en",
          defaultReminderOffset: 30,
          defaultWorkingFolder: null,
          notificationsEnabled: false,
          closeToTray: true,
        }}
        variant="dialog"
      />,
    );

    await user.type(screen.getByLabelText("Task title"), "Write tests");
    await user.click(screen.getByRole("button", { name: /add/i }));
    await user.click(screen.getByRole("button", { name: /adding/i }));

    expect(createTask).toHaveBeenCalledTimes(1);
    resolver.current?.();
    await waitFor(() => expect(screen.getByRole("button", { name: /add/i })).not.toBeDisabled());
  });

  it("creates a recurring task from the expanded dialog controls", async () => {
    const user = userEvent.setup();
    const createTask = vi.fn().mockResolvedValue({} as AppData);
    const createRecurringTask = vi.fn().mockResolvedValue({} as AppData);

    render(
      <TaskComposer
        actions={makeActions(createTask, createRecurringTask)}
        defaultDate="2026-06-01"
        projects={[]}
        settings={{
          theme: "system",
          accentColor: "blue",
          language: "en",
          defaultReminderOffset: 30,
          defaultWorkingFolder: null,
          notificationsEnabled: false,
          closeToTray: true,
        }}
        variant="dialog"
      />,
    );

    await user.type(screen.getByLabelText("Task title"), "Plan review");
    await user.click(screen.getByRole("button", { name: /more options/i }));
    await user.selectOptions(screen.getByLabelText("Repeat"), "weekly");
    await user.type(screen.getByLabelText("Until"), "2026-06-30");
    await user.click(screen.getByRole("button", { name: /add/i }));

    expect(createTask).not.toHaveBeenCalled();
    expect(createRecurringTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Plan review",
        dueDate: "2026-06-01",
        frequency: "weekly",
        endDate: "2026-06-30",
      }),
    );
  });

  it("shows and clears quick add parsed chips without reverting fields", async () => {
    const user = userEvent.setup();
    const createTask = vi.fn().mockResolvedValue({} as AppData);

    render(
      <TaskComposer
        actions={makeActions(createTask)}
        defaultDate="2026-06-01"
        projects={[
          {
            id: "project-work",
            workspaceId: "workspace",
            name: "Work",
            color: "#4fb8d8",
            status: "active",
            dueDate: null,
            workingFolder: null,
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z",
            archivedAt: null,
            deletedAt: null,
          },
        ]}
        settings={{
          theme: "system",
          accentColor: "blue",
          language: "en",
          defaultReminderOffset: 30,
          defaultWorkingFolder: null,
          notificationsEnabled: false,
          closeToTray: true,
        }}
        variant="dialog"
      />,
    );

    await user.type(screen.getByLabelText("Task title"), "tomorrow 3pm write report #Work !high no reminder");
    await user.click(screen.getByRole("button", { name: /parse input/i }));

    expect(screen.getByText("Parsed")).toBeInTheDocument();
    expect(screen.getByText("Project: Work")).toBeInTheDocument();
    expect(screen.getByText("Priority: High")).toBeInTheDocument();
    expect(screen.getByText("Reminder: None")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /clear preview/i }));

    expect(screen.queryByText("Parsed")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Task title")).toHaveValue("write report");
  });
});
