import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TaskPageInput, TaskPageResult } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

type UseTaskPageOptions = {
  actions: Pick<TodoActions, "loadTaskPage">;
  enabled?: boolean;
  input: Omit<TaskPageInput, "limit" | "offset">;
  pageSize?: number;
  /** When this changes (e.g. tasksRevision), refetch while preserving loaded window depth. */
  reloadKey?: unknown;
};

const DEFAULT_PAGE_SIZE = 150;
const EMPTY_PAGE: TaskPageResult = { tasks: [], total: 0, reminders: [] };

export function useTaskPage({
  actions,
  enabled = true,
  input,
  pageSize = DEFAULT_PAGE_SIZE,
  reloadKey,
}: UseTaskPageOptions) {
  const [result, setResult] = useState<TaskPageResult>(EMPTY_PAGE);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputKey = useMemo(() => JSON.stringify(input), [input]);
  const loadedCountRef = useRef(0);
  const prevInputKeyRef = useRef<string | null>(null);
  const inputRef = useRef(input);
  const actionsRef = useRef(actions);
  inputRef.current = input;
  actionsRef.current = actions;

  const loadPage = useCallback((offset: number, limit: number) => {
    return actionsRef.current.loadTaskPage({ ...inputRef.current, limit, offset });
  }, []);

  useEffect(() => {
    if (!enabled) {
      setResult(EMPTY_PAGE);
      setIsLoading(false);
      setError(null);
      loadedCountRef.current = 0;
      prevInputKeyRef.current = null;
      return;
    }

    const inputChanged = prevInputKeyRef.current !== inputKey;
    prevInputKeyRef.current = inputKey;

    // Filters / workspace / query changed: reset to first page.
    // tasksRevision (reloadKey) or other effect re-runs: keep loaded depth.
    const limit = inputChanged ? pageSize : Math.max(pageSize, loadedCountRef.current || pageSize);

    let active = true;
    setIsLoading(true);
    setError(null);

    loadPage(0, limit)
      .then((next) => {
        if (active) {
          setResult(next);
          loadedCountRef.current = next.tasks.length;
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
          setResult(EMPTY_PAGE);
          loadedCountRef.current = 0;
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [enabled, inputKey, loadPage, pageSize, reloadKey]);

  const loadMore = useCallback(async () => {
    if (!enabled || isLoading || isLoadingMore || result.tasks.length >= result.total) {
      return;
    }

    setIsLoadingMore(true);
    setError(null);

    try {
      const next = await loadPage(result.tasks.length, pageSize);
      setResult((current) => {
        const seenTaskIds = new Set(current.tasks.map((task) => task.id));
        const seenReminderIds = new Set(current.reminders.map((reminder) => reminder.id));
        const tasks = [...current.tasks, ...next.tasks.filter((task) => !seenTaskIds.has(task.id))];
        const reminders = [
          ...current.reminders,
          ...next.reminders.filter((reminder) => !seenReminderIds.has(reminder.id)),
        ];

        loadedCountRef.current = tasks.length;
        return {
          tasks,
          reminders,
          total: next.total,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingMore(false);
    }
  }, [enabled, isLoading, isLoadingMore, loadPage, pageSize, result.tasks.length, result.total]);

  return {
    tasks: result.tasks,
    reminders: result.reminders,
    total: result.total,
    isLoading,
    isLoadingMore,
    error,
    loadMore,
  };
}
