import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n";
import i18n from "@/i18n";
import type { RecurringTaskTemplate } from "@/data/types";
import { TaskRecurrenceSection } from "./TaskRecurrenceSection";

describe("TaskRecurrenceSection", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  const mockTemplate: RecurringTaskTemplate = {
    id: "rec-1",
    workspaceId: "ws-1",
    title: "Weekly sync",
    notes: "",
    frequency: "weekly",
    interval: 1,
    byWeekday: [1, 3, 5],
    anchorDate: "2026-06-01",
    dueTime: null,
    endDate: "2026-12-31",
    reminderOffset: 15,
    priority: "medium",
    projectId: null,
    workingFolder: null,
    parentId: null,
    tags: [],
    enabled: true,
    timezone: "Asia/Shanghai",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    deletedAt: null,
  };

  it("renders frequency, interval, and weekday toggles properly", () => {
    render(
      <TaskRecurrenceSection
        dueDate="2026-06-01"
        futureSaveState="idle"
        isSavingFuture={false}
        onDisableFutureRepeats={vi.fn()}
        onOpenFutureUpdate={vi.fn()}
        recurrenceByWeekday={[1, 3, 5]}
        recurrenceEndDate="2026-12-31"
        recurrenceFrequency="weekly"
        recurrenceInterval={1}
        recurringTemplate={mockTemplate}
        saveErrorMessage={null}
        setRecurrenceByWeekday={vi.fn()}
        setRecurrenceEndDate={vi.fn()}
        setRecurrenceFrequency={vi.fn()}
        setRecurrenceInterval={vi.fn()}
      />,
    );

    expect(screen.getByText("Recurring task")).toBeInTheDocument();
    expect(screen.getByText("On weekdays")).toBeInTheDocument();

    const monButton = screen.getByLabelText("Mo");
    expect(monButton).toHaveAttribute("aria-pressed", "true");

    const tueButton = screen.getByLabelText("Tu");
    expect(tueButton).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles weekdays through stable callback dispatch (PERF-024)", () => {
    const setRecurrenceByWeekday = vi.fn();

    render(
      <TaskRecurrenceSection
        dueDate="2026-06-01"
        futureSaveState="idle"
        isSavingFuture={false}
        onDisableFutureRepeats={vi.fn()}
        onOpenFutureUpdate={vi.fn()}
        recurrenceByWeekday={[1, 3]}
        recurrenceEndDate="2026-12-31"
        recurrenceFrequency="weekly"
        recurrenceInterval={1}
        recurringTemplate={mockTemplate}
        saveErrorMessage={null}
        setRecurrenceByWeekday={setRecurrenceByWeekday}
        setRecurrenceEndDate={vi.fn()}
        setRecurrenceFrequency={vi.fn()}
        setRecurrenceInterval={vi.fn()}
      />,
    );

    const tueButton = screen.getByLabelText("Tu");
    fireEvent.click(tueButton);

    expect(setRecurrenceByWeekday).toHaveBeenCalledTimes(1);

    // Test the state dispatch function returned
    const dispatchFn = setRecurrenceByWeekday.mock.calls[0][0];
    const nextWeekdays = dispatchFn([1, 3]);
    expect(nextWeekdays).toEqual([1, 2, 3]);

    // Clicking an active day removes it
    const removedWeekdays = dispatchFn([1, 2, 3]);
    expect(removedWeekdays).toEqual([1, 3]);
  });
});
