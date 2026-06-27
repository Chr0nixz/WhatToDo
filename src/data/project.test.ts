import { describe, expect, it } from "vitest";

import { getProjectProgress, tasksForProject, visibleProjects } from "./project";
import type { Project, Task } from "./types";

const makeProject = (patch: Partial<Project>): Project => ({
  id: patch.id ?? "project",
  workspaceId: "workspace",
  name: patch.name ?? "Project",
  color: patch.color ?? "#4fb8d8",
  status: patch.status ?? "active",
  dueDate: patch.dueDate ?? null,
  workingFolder: patch.workingFolder ?? null,
  createdAt: "2026-05-28T00:00:00.000Z",
  updatedAt: "2026-05-28T00:00:00.000Z",
  archivedAt: patch.archivedAt ?? null,
  deletedAt: patch.deletedAt ?? null,
});

const makeTask = (patch: Partial<Task>): Task => ({
  id: patch.id ?? "task",
  workspaceId: "workspace",
  projectId: patch.projectId ?? null,
  workingFolder: patch.workingFolder ?? null,
  title: "Task",
  notes: "",
  dueDate: "2026-05-28",
  dueTime: null,
  timezone: "Asia/Shanghai",
  priority: "medium",
  status: patch.status ?? "todo",
  completedAt: patch.completedAt ?? null,
  createdAt: "2026-05-28T00:00:00.000Z",
  updatedAt: "2026-05-28T00:00:00.000Z",
  deletedAt: patch.deletedAt ?? null,
  recurrenceTemplateId: patch.recurrenceTemplateId ?? null,
  recurrenceInstanceDate: patch.recurrenceInstanceDate ?? null,
  parentId: null,
  tags: [],
});

describe("project helpers", () => {
  it("keeps archived and deleted projects out of the active list", () => {
    const projects = [
      makeProject({ id: "active" }),
      makeProject({ id: "archived", status: "archived" }),
      makeProject({ id: "deleted", deletedAt: "2026-05-28T01:00:00.000Z" }),
    ];

    expect(visibleProjects(projects).map((project) => project.id)).toEqual(["active"]);
  });

  it("filters no-project tasks separately from project tasks", () => {
    const tasks = [
      makeTask({ id: "loose", projectId: null }),
      makeTask({ id: "bound", projectId: "project_1" }),
    ];

    expect(tasksForProject(tasks, null).map((task) => task.id)).toEqual(["loose"]);
    expect(tasksForProject(tasks, "project_1").map((task) => task.id)).toEqual(["bound"]);
  });

  it("calculates project progress from non-deleted tasks", () => {
    const progress = getProjectProgress([
      makeTask({ id: "done", status: "completed" }),
      makeTask({ id: "open", status: "todo" }),
      makeTask({ id: "deleted", deletedAt: "2026-05-28T01:00:00.000Z" }),
    ]);

    expect(progress).toEqual({ completed: 1, total: 2, percent: 50 });
  });
});
