import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useTaskPage } from "./useTaskPage";

describe("useTaskPage", () => {
  it("preserves loaded window depth when reloadKey changes", async () => {
    const loadTaskPage = vi.fn(async ({ limit, offset }: { limit: number; offset: number }) => {
      const start = offset;
      const tasks = Array.from({ length: limit }, (_, index) => ({
        id: `task_${start + index}`,
        workspaceId: "ws",
        projectId: null,
        workingFolder: null,
        title: `Task ${start + index}`,
        notes: "",
        dueDate: "2026-06-01",
        dueTime: null,
        timezone: "UTC",
        priority: "medium" as const,
        status: "todo" as const,
        completedAt: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        deletedAt: null,
        recurrenceTemplateId: null,
        recurrenceInstanceDate: null,
        parentId: null,
        tags: [] as string[],
      }));
      return { tasks, total: 500, reminders: [] };
    });

    const { result, rerender } = renderHook(
      ({ reloadKey }) =>
        useTaskPage({
          actions: { loadTaskPage },
          input: { workspaceId: "ws", scope: "open", sort: "overview" },
          pageSize: 10,
          reloadKey,
        }),
      { initialProps: { reloadKey: 0 } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(loadTaskPage).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 10, offset: 0 }));
    expect(result.current.tasks).toHaveLength(10);

    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.tasks).toHaveLength(20);

    loadTaskPage.mockClear();
    rerender({ reloadKey: 1 });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(loadTaskPage).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, offset: 0 }));
    expect(result.current.tasks).toHaveLength(20);
  });

  it("resets to pageSize when input filters change", async () => {
    const loadTaskPage = vi.fn(async ({ limit, offset }: { limit: number; offset: number }) => {
      const start = offset;
      return {
        tasks: Array.from({ length: limit }, (_, index) => ({
          id: `task_${start + index}`,
          workspaceId: "ws",
          projectId: null,
          workingFolder: null,
          title: `Task ${start + index}`,
          notes: "",
          dueDate: "2026-06-01",
          dueTime: null,
          timezone: "UTC",
          priority: "medium" as const,
          status: "todo" as const,
          completedAt: null,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
          deletedAt: null,
          recurrenceTemplateId: null,
          recurrenceInstanceDate: null,
          parentId: null,
          tags: [] as string[],
        })),
        total: 100,
        reminders: [],
      };
    });

    const { result, rerender } = renderHook(
      ({ scope }: { scope: "open" | "completed" }) =>
        useTaskPage({
          actions: { loadTaskPage },
          input: { workspaceId: "ws", scope, sort: "overview" },
          pageSize: 10,
          reloadKey: 0,
        }),
      { initialProps: { scope: "open" as "open" | "completed" } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.tasks).toHaveLength(20);

    loadTaskPage.mockClear();
    rerender({ scope: "completed" });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(loadTaskPage).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 0 }));
  });
});
