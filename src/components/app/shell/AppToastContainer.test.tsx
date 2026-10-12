import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppToastContainer } from "./AppToastContainer";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { title?: string }) =>
      key === "openReminderTask" ? `Open ${options?.title}` : key,
  }),
}));

describe("AppToastContainer", () => {
  it("renders null when no toasts are active", () => {
    const { container } = render(
      <AppToastContainer
        noticeToast={null}
        reminderToast={null}
        undoToast={null}
        onDismissNotice={vi.fn()}
        onDismissReminder={vi.fn()}
        onDismissUndo={vi.fn()}
        onOpenReminderTask={vi.fn()}
        onRunUndo={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders notice toast and handles dismiss", () => {
    const onDismissNotice = vi.fn();
    render(
      <AppToastContainer
        noticeToast="Database connection warning"
        reminderToast={null}
        undoToast={null}
        onDismissNotice={onDismissNotice}
        onDismissReminder={vi.fn()}
        onDismissUndo={vi.fn()}
        onOpenReminderTask={vi.fn()}
        onRunUndo={vi.fn()}
      />,
    );

    expect(screen.getByText("Database connection warning")).toBeInTheDocument();
    const closeBtn = screen.getByRole("button", { name: "close" });
    fireEvent.click(closeBtn);
    expect(onDismissNotice).toHaveBeenCalledTimes(1);
  });

  it("renders reminder toast and handles open reminder action", () => {
    const onOpenReminderTask = vi.fn();
    const onDismissReminder = vi.fn();

    render(
      <AppToastContainer
        noticeToast={null}
        reminderToast={{ id: "task-100", title: "Quarterly Review" }}
        undoToast={null}
        onDismissNotice={vi.fn()}
        onDismissReminder={onDismissReminder}
        onDismissUndo={vi.fn()}
        onOpenReminderTask={onOpenReminderTask}
        onRunUndo={vi.fn()}
      />,
    );

    const openBtn = screen.getByText("Open Quarterly Review");
    expect(openBtn).toBeInTheDocument();
    fireEvent.click(openBtn);
    expect(onOpenReminderTask).toHaveBeenCalledWith("task-100");
  });

  it("renders undo toast and triggers undo callback and keyboard dismissal", () => {
    const onRunUndo = vi.fn();
    const onDismissUndo = vi.fn();

    render(
      <AppToastContainer
        noticeToast={null}
        reminderToast={null}
        undoToast={{ message: "Task rescheduled", undo: vi.fn() }}
        onDismissNotice={vi.fn()}
        onDismissReminder={vi.fn()}
        onDismissUndo={onDismissUndo}
        onOpenReminderTask={vi.fn()}
        onRunUndo={onRunUndo}
      />,
    );

    expect(screen.getByText("Task rescheduled")).toBeInTheDocument();
    const undoBtn = screen.getByRole("button", { name: "undo" });
    fireEvent.click(undoBtn);
    expect(onRunUndo).toHaveBeenCalledTimes(1);

    // Press Escape to dismiss
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onDismissUndo).toHaveBeenCalledTimes(1);
  });
});
