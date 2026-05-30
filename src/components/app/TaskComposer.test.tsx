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

const makeActions = (createTask: TodoActions["createTask"]): TodoActions =>
  ({
    createTask,
  }) as TodoActions;

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
});
