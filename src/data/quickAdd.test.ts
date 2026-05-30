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
});
