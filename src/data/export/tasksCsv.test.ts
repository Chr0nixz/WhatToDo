import { describe, expect, it } from "vitest";

import { buildTasksCsv, csvCell } from "@/data/export/tasksCsv";
import type { Project, Task } from "@/data/types";

describe("tasksCsv export module", () => {
  it("escapes CSV cells with quotes, commas and newlines properly", () => {
    expect(csvCell("simple")).toBe("simple");
    expect(csvCell(123)).toBe("123");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell('Hello, "world"')).toBe('"Hello, ""world"""');
    expect(csvCell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
  });

  it("builds a full CSV string with headers and matching project names", () => {
    const mockProjects: Project[] = [
      {
        id: "p-1",
        workspaceId: "w-1",
        name: "Project Apollo",
        color: "#4fb8d8",
        status: "active",
        dueDate: "2026-06-30",
        workingFolder: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        archivedAt: null,
        deletedAt: null,
      },
    ];

    const mockTasks: Task[] = [
      {
        id: "t-1",
        workspaceId: "w-1",
        projectId: "p-1",
        title: "Launch rocket, now",
        notes: "Remember: check fuel",
        dueDate: "2026-06-20",
        dueTime: "10:00",
        timezone: "UTC",
        priority: "high",
        status: "todo",
        completedAt: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        deletedAt: null,
        recurrenceTemplateId: null,
        recurrenceInstanceDate: null,
        parentId: null,
        tags: ["space"],
        workingFolder: "/folder",
      },
    ];

    const csv = buildTasksCsv({ projects: mockProjects, tasks: mockTasks });
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe("Title,Status,Priority,Due date,Due time,Project,Working folder,Notes,Completed at,Created at");
    expect(lines[1]).toContain('"Launch rocket, now"');
    expect(lines[1]).toContain("Project Apollo");
    expect(lines[1]).toContain("/folder");
  });
});
