import { useVirtualizer } from "@tanstack/react-virtual";
import { CalendarClock, Check, CheckSquare, Clock, EyeOff, Loader2, Repeat2, Square, Trash2, X, XCircle } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { formatTaskDate } from "@/data/dateFormat";
import { TASK_DRAG_MIME } from "@/data/taskDrag";
import { cn } from "@/lib/utils";
import type { Project, Reminder, Task, TaskStatus } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

type TaskListProps = {
  tasks: Task[];
  projects: Project[];
  reminders: Reminder[];
  actions: TodoActions;
  compact?: boolean;
  selectedTaskId?: string | null;
  onSelectTask?: (taskId: string) => void;
  onClearSelection?: () => void;
  onDeleteTask?: (taskId: string) => void;
  deleteMode?: "delete" | "hide";
  emptyLabel?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
  totalCount?: number;
  windowSize?: number;
  windowKey?: string;
  isLoadingMore?: boolean;
  loadError?: string | null;
  onLoadMore?: () => void;
  /** Enable multi-select mode with bulk action toolbar. Floating windows should omit this. */
  selectionEnabled?: boolean;
  /** Allow dragging tasks (e.g. Home calendar reschedule). */
  draggableTasks?: boolean;
};

const priorityClasses = {
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-success",
};

const priorityTextClasses = {
  high: "text-destructive",
  medium: "text-warning-foreground dark:text-warning",
  low: "text-success-foreground dark:text-success",
};

const priorityLabelKeys: Record<string, string> = {
  high: "priorityShortHigh",
  medium: "priorityShortMedium",
  low: "priorityShortLow",
};

const VIRTUAL_THRESHOLD = 200;

type TaskRowProps = {
  task: Task;
  project: Project | null;
  reminder: Reminder | undefined;
  isSelected: boolean;
  isCompact: boolean;
  index: number;
  actions: TodoActions;
  onSelectTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  deleteMode: "delete" | "hide";
  language: string;
  t: (key: string, options?: Record<string, unknown>) => string;
  style?: CSSProperties;
  selectionMode?: boolean;
  isChecked?: boolean;
  onToggleCheck?: (taskId: string) => void;
  draggableTasks?: boolean;
};

const TaskRow = React.memo(function TaskRow({
  task,
  project,
  reminder,
  isSelected,
  isCompact,
  index,
  actions,
  onSelectTask,
  onDeleteTask,
  deleteMode,
  language,
  t,
  style,
  selectionMode = false,
  isChecked = false,
  onToggleCheck,
  draggableTasks = false,
}: TaskRowProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const DeleteIcon = deleteMode === "hide" ? EyeOff : Trash2;

  return (
    <div style={style}>
      <article
        data-task-id={task.id}
        draggable={draggableTasks}
        className={cn(
          "motion-surface group grid items-center gap-3 rounded-lg border border-border bg-card/80 px-3 py-2 shadow-sm hover:border-ring/70",
          selectionMode ? "grid-cols-[24px_32px_minmax(0,1fr)_auto]" : "grid-cols-[32px_minmax(0,1fr)_auto]",
          isSelected && "border-ring bg-accent/80",
          (task.status === "completed" || task.status === "cancelled") && "opacity-60",
          isCompact && "py-1.5",
          draggableTasks && "cursor-grab active:cursor-grabbing",
        )}
        style={{ "--motion-index": index } as CSSProperties}
        onDragStart={
          draggableTasks
            ? (event) => {
                event.dataTransfer.setData(TASK_DRAG_MIME, task.id);
                event.dataTransfer.setData("text/plain", task.id);
                event.dataTransfer.effectAllowed = "move";
              }
            : undefined
        }
      >
        {selectionMode && (
          <button
            aria-label={isChecked ? t("deselectTask", { title: task.title }) : t("selectTask", { title: task.title })}
            aria-pressed={isChecked}
            className="flex size-5 items-center justify-center rounded border transition-colors"
            type="button"
            onClick={() => onToggleCheck?.(task.id)}
          >
            {isChecked ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4 text-muted-foreground" />}
          </button>
        )}
        <button
          aria-pressed={task.status === "completed"}
          className={cn(
            "flex size-6 items-center justify-center rounded-full border transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out-quart)] active:scale-90",
            task.status === "completed"
              ? "border-primary bg-primary text-primary-foreground"
              : task.status === "in_progress"
                ? "border-info bg-info/10 text-info"
                : task.status === "cancelled"
                  ? "border-muted-foreground bg-muted text-muted-foreground"
                  : "border-input bg-background hover:border-ring",
          )}
          type="button"
          aria-label={task.status === "completed" ? t("completed") : task.status === "in_progress" ? t("statusInProgress") : task.status === "cancelled" ? t("statusCancelled") : t("statusTodo")}
          onClick={() => void actions.toggleTask(task.id)}
        >
          {task.status === "completed" && <Check className="motion-status size-3.5" />}
          {task.status === "in_progress" && <Loader2 className="motion-status size-3.5 animate-spin" />}
          {task.status === "cancelled" && <XCircle className="motion-status size-3.5" />}
        </button>
        <button
          aria-current={isSelected ? "true" : undefined}
          aria-label={`${t("openTask")}: ${task.title}`}
          className="min-w-0 text-left"
          type="button"
          onClick={() => onSelectTask?.(task.id)}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex items-center gap-0.5 shrink-0">
              <span
                aria-label={`${t("priority")}: ${t(task.priority)}`}
                className={cn("size-1.5 rounded-full", priorityClasses[task.priority])}
                role="img"
              />
              <span className={cn("text-xs font-medium leading-none", priorityTextClasses[task.priority])}>
                {t(priorityLabelKeys[task.priority])}
              </span>
            </span>
            <h3
              className={cn(
                "truncate text-sm font-medium",
                (task.status === "completed" || task.status === "cancelled") && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3" />
              {formatTaskDate(task.dueDate, language)}
            </span>
            {task.dueTime && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {task.dueTime}
              </span>
            )}
            {project ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5"
                title={project.name}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                {project.name}
              </span>
            ) : (
              <span className="rounded-full border border-border px-2 py-0.5">{t("loose")}</span>
            )}
            {reminder && <span className="rounded-full bg-warning/12 px-2 py-0.5 text-warning-foreground dark:text-warning">{t("reminder")}</span>}
            {task.recurrenceTemplateId && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                <Repeat2 className="size-3" />
                {t("repeat")}
              </span>
            )}
          </div>
        </button>
        <Button
          aria-label={deleteMode === "hide" ? t("hideFromFloatingWindow") : t("delete")}
          className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          size="icon-sm"
          type="button"
          variant="ghost"
          title={deleteMode === "hide" ? t("hideFromFloatingWindow") : t("delete")}
          onClick={() => {
            setActionError(null);
            if (onDeleteTask) {
              onDeleteTask(task.id);
              return;
            }

            void actions.deleteTask(task.id).catch(() => setActionError(t("taskDeleteFailed")));
          }}
        >
          <DeleteIcon />
        </Button>
      </article>
      {actionError && <p className="motion-status mt-1 text-xs text-destructive">{actionError}</p>}
    </div>
  );
});

function TaskListImpl({
  tasks,
  projects,
  reminders,
  actions,
  compact = false,
  selectedTaskId = null,
  onSelectTask,
  onClearSelection,
  onDeleteTask,
  deleteMode = "delete",
  emptyLabel,
  emptyHint,
  emptyAction,
  totalCount,
  windowSize,
  windowKey = "",
  isLoadingMore = false,
  loadError = null,
  onLoadMore,
  selectionEnabled = false,
  draggableTasks = false,
}: TaskListProps) {
  const { i18n, t } = useTranslation();
  const [visibleCount, setVisibleCount] = useState(windowSize ?? tasks.length);
  const [selectionMode, setSelectionMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [rowDeleteError, setRowDeleteError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const remindersByTaskId = useMemo(() => {
    const reminderMap = new Map<string, Reminder>();

    for (const reminder of reminders) {
      if (reminder.enabled && !reminderMap.has(reminder.taskId)) {
        reminderMap.set(reminder.taskId, reminder);
      }
    }

    return reminderMap;
  }, [reminders]);
  const visibleTasks = onLoadMore ? tasks : windowSize ? tasks.slice(0, visibleCount) : tasks;
  const hasMore = onLoadMore ? tasks.length < (totalCount ?? tasks.length) : windowSize ? visibleCount < tasks.length : false;
  const shouldVirtualize = visibleTasks.length > VIRTUAL_THRESHOLD;

  const toggleCheck = (taskId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (checkedIds.size === visibleTasks.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(visibleTasks.map((task) => task.id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setCheckedIds(new Set());
    setBulkError(null);
  };

  const runBulkStatus = async (status: TaskStatus) => {
    if (checkedIds.size === 0) return;
    setIsBulkProcessing(true);
    setBulkError(null);
    try {
      await actions.bulkSetTaskStatus([...checkedIds], status);
      exitSelectionMode();
    } catch {
      setBulkError(t("operationFailed"));
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const runBulkDelete = async () => {
    if (checkedIds.size === 0) return;
    setIsBulkProcessing(true);
    setBulkError(null);
    try {
      await actions.bulkDeleteTasks([...checkedIds]);
      setPendingBulkDelete(false);
      exitSelectionMode();
    } catch {
      setBulkError(t("operationFailed"));
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const requestDeleteTask = (taskId: string) => {
    if (onDeleteTask) {
      onDeleteTask(taskId);
      return;
    }
    if (deleteMode === "hide") {
      return;
    }
    setRowDeleteError(null);
    setPendingDeleteId(taskId);
  };

  const confirmSingleDelete = async () => {
    if (!pendingDeleteId) return;
    const taskId = pendingDeleteId;
    try {
      await actions.deleteTask(taskId);
      setPendingDeleteId(null);
    } catch {
      setRowDeleteError(t("taskDeleteFailed"));
      setPendingDeleteId(null);
    }
  };

  const runBulkMoveToProject = async (projectId: string | null) => {
    if (checkedIds.size === 0) return;
    setIsBulkProcessing(true);
    setBulkError(null);
    try {
      await actions.bulkMoveTasksToProject([...checkedIds], projectId);
      exitSelectionMode();
    } catch {
      setBulkError(t("operationFailed"));
    } finally {
      setIsBulkProcessing(false);
    }
  };

  useEffect(() => {
    setVisibleCount(windowSize ?? tasks.length);
  }, [tasks, windowKey, windowSize]);

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? visibleTasks.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (compact ? 52 : 68) + 8,
    overscan: 6,
    enabled: shouldVirtualize,
  });

  // Keep the keyboard-selected task visible when it moves off-screen.
  useEffect(() => {
    if (!selectedTaskId) return;
    const el = document.querySelector(`[data-task-id="${selectedTaskId}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedTaskId]);

  if (tasks.length === 0) {
    return (
      <div className="motion-status flex min-h-36 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/35 px-6 text-center">
        <p className="text-sm text-muted-foreground">{emptyLabel ?? t("emptyDay")}</p>
        {emptyHint && <p className="max-w-sm text-xs text-muted-foreground">{emptyHint}</p>}
        {emptyAction}
      </div>
    );
  }

  // Power-user keyboard navigation: j/k (and arrows) move between tasks,
  // Enter opens the selected task, Escape clears the selection. Ignored while
  // typing in a field, while a dialog is open, or when j/k are used with a
  // modifier (so Cmd+J etc. keep working).
  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (document.querySelector('[role="dialog"]')) return;
    const active = document.activeElement as HTMLElement | null;
    const tag = active?.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || active?.isContentEditable) return;

    const key = event.key;
    const lower = key.toLowerCase();

    if (lower === "j" || key === "ArrowDown") {
      if (lower === "j" && (event.ctrlKey || event.metaKey || event.altKey)) return;
      event.preventDefault();
      const currentIndex = selectedTaskId ? visibleTasks.findIndex((task) => task.id === selectedTaskId) : -1;
      const next = visibleTasks[currentIndex + 1];
      if (next) onSelectTask?.(next.id);
    } else if (lower === "k" || key === "ArrowUp") {
      if (lower === "k" && (event.ctrlKey || event.metaKey || event.altKey)) return;
      event.preventDefault();
      const currentIndex = selectedTaskId ? visibleTasks.findIndex((task) => task.id === selectedTaskId) : -1;
      const prev = visibleTasks[currentIndex - 1];
      if (prev) onSelectTask?.(prev.id);
    } else if (key === "Enter") {
      // Only handle Enter when the list container itself is focused; a focused
      // child button already activates on Enter natively.
      if (event.target === event.currentTarget && selectedTaskId) {
        event.preventDefault();
        onSelectTask?.(selectedTaskId);
      }
    } else if (key === "Escape") {
      if (selectedTaskId && onClearSelection) {
        event.preventDefault();
        onClearSelection();
      } else if (!selectedTaskId) {
        event.currentTarget.blur();
      }
    }
  };

  const bulkToolbar = selectionEnabled && (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/65 p-2">
      {!selectionMode ? (
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => setSelectionMode(true)}
        >
          <CheckSquare className="size-3.5" />
          {t("selectMode")}
        </Button>
      ) : (
        <>
          <Button size="sm" type="button" variant="ghost" onClick={toggleSelectAll}>
            {checkedIds.size === visibleTasks.length ? t("deselectAll") : t("selectAll")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("selectedCount", { count: checkedIds.size })}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button disabled={isBulkProcessing || checkedIds.size === 0} size="sm" type="button" variant="ghost" onClick={() => void runBulkStatus("completed")}>
              <Check className="size-3.5" />
              {t("bulkComplete")}
            </Button>
            <Button disabled={isBulkProcessing || checkedIds.size === 0} size="sm" type="button" variant="ghost" onClick={() => void runBulkStatus("todo")}>
              {t("bulkSetTodo")}
            </Button>
            <Button disabled={isBulkProcessing || checkedIds.size === 0} size="sm" type="button" variant="ghost" onClick={() => void runBulkStatus("in_progress")}>
              {t("bulkSetInProgress")}
            </Button>
            <Button disabled={isBulkProcessing || checkedIds.size === 0} size="sm" type="button" variant="ghost" onClick={() => void runBulkStatus("cancelled")}>
              {t("bulkCancel")}
            </Button>
            <select
              aria-label={t("bulkMoveToProject")}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring"
              disabled={isBulkProcessing || checkedIds.size === 0 || projects.filter((p) => p.deletedAt === null && p.status !== "archived").length === 0}
              value=""
              onChange={(event) => {
                const value = event.target.value;
                if (value === "") return;
                if (value === "none") {
                  void runBulkMoveToProject(null);
                } else {
                  void runBulkMoveToProject(value);
                }
              }}
            >
              <option value="">{t("bulkMoveToProject")}</option>
              <option value="none">{t("none")}</option>
              {projects.filter((p) => p.deletedAt === null && p.status !== "archived").map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <Button disabled={isBulkProcessing || checkedIds.size === 0} size="sm" type="button" variant="destructive" onClick={() => setPendingBulkDelete(true)}>
              <Trash2 className="size-3.5" />
              {t("bulkDelete")}
            </Button>
            <Button disabled={isBulkProcessing} size="sm" type="button" variant="ghost" onClick={exitSelectionMode}>
              <X className="size-3.5" />
              {t("exitSelectMode")}
            </Button>
          </div>
        </>
      )}
      {bulkError && <p className="w-full text-xs text-destructive">{bulkError}</p>}
    </div>
  );

  if (shouldVirtualize) {
    const virtualItems = virtualizer.getVirtualItems();
    return (
      <div>
        {bulkToolbar}
        <div
          className="motion-list focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          ref={scrollRef}
          style={{ maxHeight: "70vh", overflowY: "auto" }}
          tabIndex={0}
          onKeyDown={handleListKeyDown}
        >
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualItems.map((virtualItem) => {
              const task = visibleTasks[virtualItem.index];
              if (!task) {
                return null;
              }
              return (
                <div
                  key={task.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <TaskRow
                    task={task}
                    project={task.projectId ? projectsById.get(task.projectId) ?? null : null}
                    reminder={remindersByTaskId.get(task.id)}
                    isSelected={selectedTaskId === task.id}
                    isCompact={compact}
                    index={virtualItem.index}
                    actions={actions}
                    onSelectTask={onSelectTask}
                    onDeleteTask={onDeleteTask ?? (deleteMode === "delete" ? requestDeleteTask : undefined)}
                    deleteMode={deleteMode}
                    language={i18n.language}
                    t={t}
                    selectionMode={selectionMode}
                    isChecked={checkedIds.has(task.id)}
                    onToggleCheck={toggleCheck}
                    draggableTasks={draggableTasks}
                  />
                </div>
              );
            })}
          </div>
          {hasMore && (
            <button
              className="motion-surface mt-2 flex h-9 w-full items-center justify-center rounded-md border border-border bg-secondary px-3 text-sm font-medium hover:bg-accent"
              disabled={isLoadingMore}
              type="button"
              onClick={() => {
                if (onLoadMore) {
                  onLoadMore();
                  return;
                }

                setVisibleCount((count) => Math.min(count + (windowSize ?? 0), tasks.length));
              }}
            >
              {isLoadingMore
                ? t("loadingTasks")
                : t("loadMoreTasks", { shown: visibleTasks.length, total: totalCount ?? tasks.length })}
            </button>
          )}
          {loadError && <p className="motion-status mt-2 text-xs text-destructive">{loadError}</p>}
        </div>
        {rowDeleteError && <p className="motion-status mt-2 text-xs text-destructive">{rowDeleteError}</p>}
        <ConfirmDialog
          open={pendingDeleteId !== null}
          title={t("confirmDeleteTask")}
          description={t("confirmDeleteTaskHint")}
          confirming={isBulkProcessing}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteId(null);
          }}
          onConfirm={() => void confirmSingleDelete()}
        />
        <ConfirmDialog
          open={pendingBulkDelete}
          title={t("confirmBulkDeleteTasks", { count: checkedIds.size })}
          description={t("confirmDeleteTaskHint")}
          confirming={isBulkProcessing}
          onOpenChange={setPendingBulkDelete}
          onConfirm={() => void runBulkDelete()}
        />
      </div>
    );
  }

  return (
    <div>
      {bulkToolbar}
      <div
        className="motion-list space-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        tabIndex={0}
        onKeyDown={handleListKeyDown}
      >
        {visibleTasks.map((task, index) => {
          const project = task.projectId ? projectsById.get(task.projectId) ?? null : null;
          const reminder = remindersByTaskId.get(task.id);

          return (
            <TaskRow
              key={task.id}
              task={task}
              project={project}
              reminder={reminder}
              isSelected={selectedTaskId === task.id}
              isCompact={compact}
              index={index}
              actions={actions}
              onSelectTask={onSelectTask}
              onDeleteTask={onDeleteTask ?? (deleteMode === "delete" ? requestDeleteTask : undefined)}
              deleteMode={deleteMode}
              language={i18n.language}
              t={t}
              selectionMode={selectionMode}
              isChecked={checkedIds.has(task.id)}
              onToggleCheck={toggleCheck}
              draggableTasks={draggableTasks}
            />
          );
        })}
      {hasMore && (
        <button
          className="motion-surface flex h-9 w-full items-center justify-center rounded-md border border-border bg-secondary px-3 text-sm font-medium hover:bg-accent"
          disabled={isLoadingMore}
          type="button"
          onClick={() => {
            if (onLoadMore) {
              onLoadMore();
              return;
            }

            setVisibleCount((count) => Math.min(count + (windowSize ?? 0), tasks.length));
          }}
        >
          {isLoadingMore
            ? t("loadingTasks")
            : t("loadMoreTasks", { shown: visibleTasks.length, total: totalCount ?? tasks.length })}
        </button>
      )}
      {loadError && <p className="motion-status text-xs text-destructive">{loadError}</p>}
      </div>
      {rowDeleteError && <p className="motion-status mt-2 text-xs text-destructive">{rowDeleteError}</p>}
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title={t("confirmDeleteTask")}
        description={t("confirmDeleteTaskHint")}
        confirming={isBulkProcessing}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        onConfirm={() => void confirmSingleDelete()}
      />
      <ConfirmDialog
        open={pendingBulkDelete}
        title={t("confirmBulkDeleteTasks", { count: checkedIds.size })}
        description={t("confirmDeleteTaskHint")}
        confirming={isBulkProcessing}
        onOpenChange={setPendingBulkDelete}
        onConfirm={() => void runBulkDelete()}
      />
    </div>
  );
}

// React.memo so the list skips re-renders when props are referentially stable.
// Combined with applyRepositoryPatch preserving slice references, this means a
// reminder mutation (which keeps tasks/projects/reminders refs stable) will no
// longer re-render the task list.
export const TaskList = React.memo(TaskListImpl);
