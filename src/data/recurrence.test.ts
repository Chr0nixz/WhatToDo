import { describe, expect, it } from "vitest";

import { getNextRecurrenceDate } from "./recurrence";
import type { RecurringTaskTemplate } from "./types";

const makeRule = (patch: Partial<RecurringTaskTemplate>): RecurringTaskTemplate => ({
  id: "recur",
  workspaceId: "workspace",
  title: "Task",
  notes: "",
  projectId: null,
  workingFolder: null,
  dueTime: null,
  timezone: "Asia/Shanghai",
  priority: "medium",
  reminderOffset: null,
  frequency: patch.frequency ?? "daily",
  interval: patch.interval ?? 1,
  anchorDate: patch.anchorDate ?? "2026-06-01",
  endDate: patch.endDate ?? null,
  enabled: true,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  deletedAt: null,
});

describe("getNextRecurrenceDate", () => {
  it("calculates daily and weekly next dates", () => {
    expect(getNextRecurrenceDate(makeRule({ frequency: "daily" }), "2026-06-01")).toBe("2026-06-02");
    expect(getNextRecurrenceDate(makeRule({ frequency: "weekly" }), "2026-06-01")).toBe("2026-06-08");
  });

  it("keeps monthly anchor day and falls back to month end", () => {
    expect(getNextRecurrenceDate(makeRule({ frequency: "monthly", anchorDate: "2026-01-31" }), "2026-01-31")).toBe(
      "2026-02-28",
    );
    expect(getNextRecurrenceDate(makeRule({ frequency: "monthly", anchorDate: "2026-01-31" }), "2026-02-28")).toBe(
      "2026-03-31",
    );
  });

  it("handles leap-year month-end boundaries", () => {
    expect(getNextRecurrenceDate(makeRule({ frequency: "monthly", anchorDate: "2024-01-31" }), "2024-01-31")).toBe(
      "2024-02-29",
    );
    expect(getNextRecurrenceDate(makeRule({ frequency: "monthly", anchorDate: "2024-02-29" }), "2024-02-29")).toBe(
      "2024-03-29",
    );
  });

  it("stops after the end date", () => {
    expect(getNextRecurrenceDate(makeRule({ frequency: "daily", endDate: "2026-06-02" }), "2026-06-01")).toBe(
      "2026-06-02",
    );
    expect(getNextRecurrenceDate(makeRule({ frequency: "daily", endDate: "2026-06-02" }), "2026-06-02")).toBeNull();
  });
});
