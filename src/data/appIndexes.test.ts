import { describe, expect, it } from "vitest";

import {
  EMPTY_APP_INDEXES,
  buildAppIndexes,
  buildAppIndexesFromData,
} from "./appIndexes";
import type { Project, Reminder, TaskSummary } from "./types";

describe("buildAppIndexes", () => {
  it("returns the exact frozen EMPTY_APP_INDEXES singleton when all inputs are empty (PERF-020)", () => {
    const empty1 = buildAppIndexes([], [], []);
    const empty2 = buildAppIndexes([], [], []);

    expect(empty1).toBe(EMPTY_APP_INDEXES);
    expect(empty2).toBe(EMPTY_APP_INDEXES);
    expect(empty1.tasksById.size).toBe(0);
    expect(empty1.projectsById.size).toBe(0);
    expect(empty1.tasksByDate.size).toBe(0);
    expect(empty1.remindersByTaskId.size).toBe(0);
    expect(empty1.reminderTaskIds.size).toBe(0);
  });

  it("builds indexes efficiently without intermediate tuple allocations", () => {
    const mockProjects: Project[] = [
      {
        id: "p1",
        workspaceId: "ws1",
        name: "Project 1",
        color: "#4fb8d8",
        status: "active",
        dueDate: null,
        workingFolder: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        deletedAt: null,
        archivedAt: null,
      },
    ];

    const mockTasks: TaskSummary[] = [
      {
        id: "t1",
        workspaceId: "ws1",
        projectId: "p1",
        workingFolder: null,
        title: "Task 1",
        dueDate: "2026-06-01",
        dueTime: "09:00",
        timezone: "Asia/Shanghai",
        priority: "high",
        status: "todo",
        completedAt: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        deletedAt: null,
        recurrenceTemplateId: null,
        recurrenceInstanceDate: null,
        parentId: null,
        tags: ["urgent"],
      },
      {
        id: "t2",
        workspaceId: "ws1",
        projectId: null,
        workingFolder: null,
        title: "Task 2",
        dueDate: "2026-06-01",
        dueTime: null,
        timezone: "Asia/Shanghai",
        priority: "medium",
        status: "todo",
        completedAt: null,
        createdAt: "2026-06-01T01:00:00.000Z",
        updatedAt: "2026-06-01T01:00:00.000Z",
        deletedAt: null,
        recurrenceTemplateId: null,
        recurrenceInstanceDate: null,
        parentId: null,
        tags: [],
      },
    ];

    const mockReminders: Reminder[] = [
      {
        id: "r1",
        taskId: "t1",
        remindAt: "2026-06-01T01:00:00.000Z",
        snoozedUntil: null,
        offsetMinutes: 0,
        enabled: true,
        firedAt: null,
        failedAt: null,
        lastError: null,
        lastAttemptedAt: null,
      },
      {
        id: "r2",
        taskId: "t2",
        remindAt: "2026-06-01T02:00:00.000Z",
        snoozedUntil: null,
        offsetMinutes: 0,
        enabled: false,
        firedAt: null,
        failedAt: null,
        lastError: null,
        lastAttemptedAt: null,
      },
    ];

    const indexes = buildAppIndexes(mockTasks, mockProjects, mockReminders);

    expect(indexes).not.toBe(EMPTY_APP_INDEXES);
    expect(indexes.projectsById.get("p1")).toBe(mockProjects[0]);
    expect(indexes.tasksById.get("t1")).toBe(mockTasks[0]);
    expect(indexes.tasksById.get("t2")).toBe(mockTasks[1]);

    const dateBucket = indexes.tasksByDate.get("2026-06-01");
    expect(dateBucket).toHaveLength(2);
    expect(dateBucket).toEqual([mockTasks[0], mockTasks[1]]);

    expect(indexes.remindersByTaskId.get("t1")).toHaveLength(1);
    expect(indexes.remindersByTaskId.get("t2")).toHaveLength(1);

    // Only enabled reminders are added to reminderTaskIds
    expect(indexes.reminderTaskIds.has("t1")).toBe(true);
    expect(indexes.reminderTaskIds.has("t2")).toBe(false);

    // buildAppIndexesFromData backward compatibility
    const compatIndexes = buildAppIndexesFromData({
      tasks: mockTasks,
      projects: mockProjects,
      reminders: mockReminders,
    });
    expect(compatIndexes.tasksById.size).toBe(2);
  });
});
