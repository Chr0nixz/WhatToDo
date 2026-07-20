import { describe, expect, it } from "vitest";

import type { Project } from "./types";
import { parseQuickAdd } from "./quickAdd";

const project: Project = {
  id: "project-work",
  workspaceId: "workspace",
  name: "工作",
  color: "#4fb8d8",
  status: "active",
  dueDate: null,
  workingFolder: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  archivedAt: null,
  deletedAt: null,
};

describe("parseQuickAdd", () => {
  it("parses Chinese relative date, time, project, priority, and reminder", () => {
    const result = parseQuickAdd({
      input: "明天下午3点交周报 #工作 !高 提前30分钟",
      referenceDate: new Date("2026-06-01T00:00:00.000Z"),
      projects: [project],
      defaultReminderOffset: 15,
    });

    expect(result.draft).toMatchObject({
      title: "交周报",
      dueDate: "2026-06-02",
      dueTime: "15:00",
      projectId: "project-work",
      priority: "high",
      reminderOffset: 30,
    });
    expect(result.matches).toEqual([
      { kind: "project", value: "工作", projectId: "project-work" },
      { kind: "priority", value: "high" },
      { kind: "reminder", value: 30 },
      { kind: "date", value: "2026-06-02" },
      { kind: "time", value: "15:00" },
    ]);
  });

  it("keeps unmatched project tokens in the title", () => {
    const result = parseQuickAdd({
      input: "tomorrow 3pm write report #unknown !low no reminder",
      referenceDate: new Date("2026-06-01T00:00:00.000Z"),
      projects: [project],
      defaultReminderOffset: 15,
    });

    expect(result.draft.title).toContain("#unknown");
    expect(result.draft.priority).toBe("low");
    expect(result.draft.reminderOffset).toBeNull();
  });

  it("parses extended chinese date expressions", () => {
    const referenceDate = new Date("2026-06-01T00:00:00.000Z"); // 周一
    const cases: Array<{ input: string; expectedDue: string }> = [
      { input: "下周三开会", expectedDue: "2026-06-10" },
      { input: "下周五交报告", expectedDue: "2026-06-12" },
      { input: "本周五复盘", expectedDue: "2026-06-05" },
      { input: "周日报假", expectedDue: "2026-06-07" },
      { input: "3天后交货", expectedDue: "2026-06-04" },
      { input: "一周后上线", expectedDue: "2026-06-08" },
      { input: "大后天出差", expectedDue: "2026-06-04" },
      { input: "月底结账", expectedDue: "2026-06-30" },
      { input: "下个月15号发薪", expectedDue: "2026-07-15" },
      { input: "下月1号复盘", expectedDue: "2026-07-01" },
    ];
    for (const { input, expectedDue } of cases) {
      const result = parseQuickAdd({ input, referenceDate, projects: [project], defaultReminderOffset: 15 });
      expect(result.draft.dueDate).toBe(expectedDue);
    }
  });

  it("parses recurrence phrases into recurring drafts", () => {
    const referenceDate = new Date("2026-06-01T00:00:00.000Z"); // Monday
    const weekly = parseQuickAdd({
      input: "每周一站会",
      referenceDate,
      projects: [project],
      defaultReminderOffset: 15,
    });
    expect(weekly.draft.title).toBe("站会");
    expect(weekly.draft.dueDate).toBe("2026-06-01");
    expect(weekly.matched.recurrence).toBe(true);
    expect(weekly.matches.find((match) => match.kind === "recurrence")).toMatchObject({
      frequency: "weekly",
      interval: 1,
      byWeekday: [1],
    });

    const biweekly = parseQuickAdd({
      input: "每两周同步",
      referenceDate,
      projects: [project],
      defaultReminderOffset: 15,
    });
    expect(biweekly.matches.find((match) => match.kind === "recurrence")).toMatchObject({
      frequency: "weekly",
      interval: 2,
    });

    const daily = parseQuickAdd({
      input: "每天运动",
      referenceDate,
      projects: [project],
      defaultReminderOffset: 15,
    });
    expect(daily.matches.find((match) => match.kind === "recurrence")).toMatchObject({
      frequency: "daily",
      interval: 1,
    });

    const english = parseQuickAdd({
      input: "standup every monday",
      referenceDate,
      projects: [project],
      defaultReminderOffset: 15,
    });
    expect(english.matches.find((match) => match.kind === "recurrence")).toMatchObject({
      frequency: "weekly",
      byWeekday: [1],
    });
  });
});
