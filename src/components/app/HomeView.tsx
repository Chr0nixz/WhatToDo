import { Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { todayKey } from "@/data/date";
import { formatHeaderDate, selectedDateTaskLabel } from "@/data/dateFormat";
import { planRescheduleDrop } from "@/data/taskDrag";
import type { AppData } from "@/data/types";
import { useTaskPage } from "@/hooks/useTaskPage";
import { useTasksRevision } from "@/hooks/useTodoStore";
import type { TodoActions } from "@/hooks/useTodos";

import { DatePane } from "./DatePane";
import { TaskList } from "./TaskList";
import { TaskCreateDialog } from "./TaskCreateDialog";

type HomeViewProps = {
  data: AppData;
  actions: TodoActions;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedTaskId: string | null;
  setSelectedTaskId: (taskId: string | null) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onRescheduleSuccess?: (message: string, undo: () => Promise<unknown>) => void;
  onRescheduleError?: (message: string) => void;
};

export function HomeView({
  data,
  actions,
  selectedDate,
  setSelectedDate,
  selectedTaskId,
  setSelectedTaskId,
  searchQuery,
  setSearchQuery,
  onRescheduleSuccess,
  onRescheduleError,
}: HomeViewProps) {
  const { i18n, t } = useTranslation();
  const tasksRevision = useTasksRevision();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [dueDateCounts, setDueDateCounts] = useState<Record<string, number>>({});
  const [overdueTotal, setOverdueTotal] = useState(0);
  const visibleRangeRef = useRef<{ from: string; to: string } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 180);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const taskPageInput = useMemo(
    () => ({
      workspaceId: data.workspaceId,
      scope: "all" as const,
      date: selectedDate,
      query: debouncedSearchQuery,
      sort: "dueAsc" as const,
    }),
    [data.workspaceId, debouncedSearchQuery, selectedDate],
  );
  const taskPage = useTaskPage({
    actions,
    input: taskPageInput,
    reloadKey: tasksRevision,
  });

  const refreshCounts = useCallback(
    (from: string, to: string) => {
      void actions.loadDueDateCounts({ workspaceId: data.workspaceId, from, to }).then(setDueDateCounts).catch(() => {
        setDueDateCounts({});
      });
    },
    [actions, data.workspaceId],
  );

  const onVisibleRangeChange = useCallback(
    (from: string, to: string) => {
      visibleRangeRef.current = { from, to };
      refreshCounts(from, to);
    },
    [refreshCounts],
  );

  const handleDropTask = useCallback(
    async (taskId: string, nextDueDate: string) => {
      const task =
        taskPage.tasks.find((item) => item.id === taskId) ??
        data.tasks.find((item) => item.id === taskId) ??
        null;
      const planned = planRescheduleDrop({
        taskId,
        nextDueDate,
        currentDueDate: task?.dueDate,
      });
      if (planned.kind === "noop") {
        return;
      }

      try {
        await actions.updateTask(planned.taskId, { dueDate: planned.nextDueDate });
        const range = visibleRangeRef.current;
        if (range) {
          refreshCounts(range.from, range.to);
        }
        onRescheduleSuccess?.(t("taskRescheduled"), () =>
          actions.updateTask(planned.taskId, { dueDate: planned.previousDueDate }),
        );
      } catch {
        onRescheduleError?.(t("taskRescheduleFailed"));
      }
    },
    [actions, data.tasks, onRescheduleError, onRescheduleSuccess, refreshCounts, t, taskPage.tasks],
  );

  useEffect(() => {
    let active = true;
    void actions
      .loadTaskPage({
        workspaceId: data.workspaceId,
        scope: "open",
        dateRange: "overdue",
        referenceDate: todayKey(),
        limit: 1,
        offset: 0,
        sort: "dueAsc",
      })
      .then((result) => {
        if (active) {
          setOverdueTotal(result.total);
        }
      })
      .catch(() => {
        if (active) {
          setOverdueTotal(0);
        }
      });
    return () => {
      active = false;
    };
  }, [actions, data.workspaceId, tasksRevision]);

  const isFirstRun = taskPage.total === 0 && data.tasks.length === 0 && localStorage.getItem("whattodo:firstRunSeen") === null;

  useEffect(() => {
    if (isFirstRun) {
      localStorage.setItem("whattodo:firstRunSeen", "1");
    }
  }, [isFirstRun]);

  return (
    <main className="flex h-full min-h-0 max-md:flex-col">
      <DatePane
        counts={dueDateCounts}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        onDropTask={(taskId, dateKey) => void handleDropTask(taskId, dateKey)}
        onVisibleRangeChange={onVisibleRangeChange}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border bg-background/65 p-4">
          <div className="mb-3 flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-stretch">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{formatHeaderDate(selectedDate, i18n.language)}</h1>
            </div>
            <div className="flex items-center justify-end gap-2 max-sm:w-full">
              {isSearchOpen && (
                <div className="motion-status relative max-sm:flex-1">
                  <label className="sr-only" htmlFor="home-search">
                    {t("search")}
                  </label>
                  <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <input
                    id="home-search"
                    className="h-9 w-56 rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none transition-colors focus:border-ring max-md:w-40 max-sm:w-full"
                    placeholder={t("search")}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                  <button
                    aria-label={t("close")}
                    className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                    title={t("close")}
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setIsSearchOpen(false);
                    }}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </div>
              )}
              {!isSearchOpen && (
                <Button aria-label={t("search")} size="icon-lg" type="button" variant="ghost" title={t("search")} onClick={() => setIsSearchOpen(true)}>
                  <Search aria-hidden="true" />
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => setSelectedDate(todayKey())}>
                {t("today")}
              </Button>
              <TaskCreateDialog
                actions={actions}
                defaultDate={selectedDate}
                projects={data.projects.filter((project) => project.deletedAt === null && project.status !== "archived")}
                settings={data.settings}
                triggerTestId="add-task"
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {selectedDateTaskLabel(selectedDate, i18n.language, {
                today: t("today"),
                tomorrow: t("tomorrow"),
                selectedDateTasks: t("selectedDateTasks"),
              })}
            </h2>
            {overdueTotal > 0 && (
              <span className="motion-status rounded-full bg-destructive/12 px-2 py-1 text-xs font-medium text-destructive">
                {t("overdue")} {overdueTotal}
              </span>
            )}
          </div>
          <TaskList
            actions={actions}
            emptyLabel={isFirstRun ? t("firstRunHint") : t("emptyDay")}
            emptyHint={isFirstRun ? undefined : t("emptyDayHint")}
            emptyAction={
              <TaskCreateDialog
                actions={actions}
                defaultDate={selectedDate}
                projects={data.projects.filter((project) => project.deletedAt === null && project.status !== "archived")}
                settings={data.settings}
                triggerTestId="add-task-empty"
              />
            }
            onSelectTask={setSelectedTaskId}
            projects={data.projects}
            reminders={taskPage.reminders.length > 0 ? taskPage.reminders : data.reminders}
            selectedTaskId={selectedTaskId}
            tasks={taskPage.tasks}
            totalCount={taskPage.total}
            isLoadingMore={taskPage.isLoadingMore}
            onLoadMore={() => void taskPage.loadMore()}
            selectionEnabled
            draggableTasks
          />
        </div>
      </section>
    </main>
  );
}
