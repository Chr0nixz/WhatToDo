import { describe, expect, it } from "vitest";

import { buildTaskFromRecurringTemplate, getNextRecurrenceDate } from "./recurrence";
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
  byWeekday: patch.byWeekday ?? null,
  anchorDate: patch.anchorDate ?? "2026-06-01",
  endDate: patch.endDate ?? null,
  enabled: true,
  parentId: patch.parentId ?? null,
  tags: patch.tags ?? [],
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

  it("respects interval for daily, weekly and monthly frequencies", () => {
    expect(getNextRecurrenceDate(makeRule({ frequency: "daily", interval: 3 }), "2026-06-01")).toBe("2026-06-04");
    expect(getNextRecurrenceDate(makeRule({ frequency: "weekly", interval: 2 }), "2026-06-01")).toBe("2026-06-15");
    expect(getNextRecurrenceDate(makeRule({ frequency: "monthly", interval: 2, anchorDate: "2026-01-31" }), "2026-01-31")).toBe(
      "2026-03-31",
    );
  });

  it("calculates yearly next dates preserving anchor month/day", () => {
    expect(getNextRecurrenceDate(makeRule({ frequency: "yearly", anchorDate: "2026-06-15" }), "2026-06-15")).toBe(
      "2027-06-15",
    );
    expect(
      getNextRecurrenceDate(makeRule({ frequency: "yearly", interval: 2, anchorDate: "2026-06-15" }), "2026-06-15"),
    ).toBe("2028-06-15");
  });

  it("falls back to Feb 28 for leap-day yearly anchors in non-leap years", () => {
    expect(getNextRecurrenceDate(makeRule({ frequency: "yearly", anchorDate: "2024-02-29" }), "2024-02-29")).toBe(
      "2025-02-28",
    );
    expect(getNextRecurrenceDate(makeRule({ frequency: "yearly", interval: 4, anchorDate: "2024-02-29" }), "2024-02-29")).toBe(
      "2028-02-29",
    );
  });

  it("selects the next matching weekday for weekly byWeekday rules", () => {
    // 2026-06-01 is a Monday (getDay=1). Anchor Monday, every week on Mon/Thu.
    const rule = makeRule({ frequency: "weekly", byWeekday: [1, 4], anchorDate: "2026-06-01" });
    expect(getNextRecurrenceDate(rule, "2026-06-01")).toBe("2026-06-04"); // Mon -> Thu
    expect(getNextRecurrenceDate(rule, "2026-06-04")).toBe("2026-06-08"); // Thu -> next Mon
    expect(getNextRecurrenceDate(rule, "2026-06-08")).toBe("2026-06-11"); // Mon -> Thu
  });

  it("honours interval when matching weekday across biweekly cycles", () => {
    // 2026-06-01 is a Monday. Biweekly (interval=2) on Mon/Thu.
    const rule = makeRule({ frequency: "weekly", interval: 2, byWeekday: [1, 4], anchorDate: "2026-06-01" });
    expect(getNextRecurrenceDate(rule, "2026-06-01")).toBe("2026-06-04"); // active week: Mon -> Thu
    expect(getNextRecurrenceDate(rule, "2026-06-04")).toBe("2026-06-15"); // skip inactive week, next active Mon
    expect(getNextRecurrenceDate(rule, "2026-06-15")).toBe("2026-06-18"); // active week: Mon -> Thu
  });
});

describe("buildTaskFromRecurringTemplate", () => {
  it("inherits tags and parentId from the template", () => {
    const template = makeRule({
      parentId: "parent_task",
      tags: ["work", "recurring"],
    });
    const task = buildTaskFromRecurringTemplate(template, "2026-06-08", "2026-06-01T00:00:00.000Z", () => "task_next");
    expect(task.parentId).toBe("parent_task");
    expect(task.tags).toEqual(["work", "recurring"]);
    expect(task.recurrenceTemplateId).toBe(template.id);
    expect(task.dueDate).toBe("2026-06-08");
  });
});
