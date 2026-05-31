import { useCallback, useEffect, useMemo, useState } from "react";

import type { TaskPageInput, TaskPageResult } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

type UseTaskPageOptions = {
  actions: Pick<TodoActions, "loadTaskPage">;
  enabled?: boolean;
  input: Omit<TaskPageInput, "limit" | "offset">;
  pageSize?: number;
  reloadKey?: unknown;
};

const DEFAULT_PAGE_SIZE = 150;

export function useTaskPage({
  actions,
  enabled = true,
  input,
  pageSize = DEFAULT_PAGE_SIZE,
  reloadKey,
}: UseTaskPageOptions) {
  const [result, setResult] = useState<TaskPageResult>({ tasks: [], total: 0, reminders: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputKey = useMemo(() => JSON.stringify(input), [input]);

  const loadPage = useCallback(
    (offset: number) => actions.loadTaskPage({ ...input, limit: pageSize, offset }),
    [actions, input, pageSize],
  );

  useEffect(() => {
    if (!enabled) {
      setResult({ tasks: [], total: 0, reminders: [] });
      setIsLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(null);

    loadPage(0)
      .then((next) => {
        if (active) {
          setResult(next);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
          setResult({ tasks: [], total: 0, reminders: [] });
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
  }, [enabled, inputKey, loadPage, reloadKey]);

  const loadMore = useCallback(async () => {
    if (!enabled || isLoading || isLoadingMore || result.tasks.length >= result.total) {
      return;
    }

    setIsLoadingMore(true);
    setError(null);

    try {
      const next = await loadPage(result.tasks.length);
      setResult((current) => {
        const seenTaskIds = new Set(current.tasks.map((task) => task.id));
        const seenReminderIds = new Set(current.reminders.map((reminder) => reminder.id));
        const tasks = [...current.tasks, ...next.tasks.filter((task) => !seenTaskIds.has(task.id))];
        const reminders = [
          ...current.reminders,
          ...next.reminders.filter((reminder) => !seenReminderIds.has(reminder.id)),
        ];

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
  }, [enabled, isLoading, isLoadingMore, loadPage, result.tasks.length, result.total]);

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
