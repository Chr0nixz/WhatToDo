import * as Dialog from "@radix-ui/react-dialog";
import { CalendarClock, Check, Clock, Loader2, Plus, X, XCircle } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { sortTasks } from "@/data/date";
import { formatTaskDate } from "@/data/dateFormat";
import type { Task, Workspace } from "@/data/types";

type WorkspaceTaskPickerDialogProps = {
  tasks: Task[];
  workspaces: Workspace[];
  isLoading: boolean;
  error: string | null;
  onOpen: () => Promise<void>;
  onAddTask: (taskId: string) => Promise<void>;
};

const WINDOW_SIZE = 150;

export function WorkspaceTaskPickerDialog({
  tasks,
  workspaces,
  isLoading,
  error,
  onOpen,
  onAddTask,
}: WorkspaceTaskPickerDialogProps) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(WINDOW_SIZE);
  const sortedTasks = useMemo(() => (open ? sortTasks(tasks) : []), [open, tasks]);
  const visibleTasks = sortedTasks.slice(0, visibleCount);
  const workspacesById = useMemo(() => new Map(workspaces.map((workspace) => [workspace.id, workspace])), [workspaces]);
  const hasMore = visibleCount < sortedTasks.length;

  useEffect(() => {
    if (open) {
      setVisibleCount(WINDOW_SIZE);
    }
  }, [open, tasks]);

  const addTask = async (taskId: string) => {
    await onAddTask(taskId);
    setOpen(false);
  };

  const setDialogOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      void onOpen();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setDialogOpen}>
      <Dialog.Trigger asChild>
        <Button size="sm" type="button">
          <Plus />
          {t("addExistingTask")}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="motion-dialog-overlay fixed inset-0 z-50 bg-background/65 backdrop-blur-[2px]" />
        <Dialog.Content className="motion-dialog-content fixed left-1/2 top-1/2 z-50 flex max-h-[min(680px,calc(100vh-32px))] w-[min(640px,calc(100vw-32px))] flex-col rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-xl outline-none">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold">{t("addExistingTask")}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                {t("addExistingTaskHint")}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button aria-label={t("close")} size="icon-sm" type="button" variant="ghost" title={t("close")}>
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>

          {isLoading ? (
            <p className="motion-status flex min-h-36 items-center justify-center rounded-lg border border-dashed border-border bg-background/50 px-4 text-center text-sm text-muted-foreground">
              {t("loadingTasks")}
            </p>
          ) : error ? (
            <p className="motion-status flex min-h-36 items-center justify-center rounded-lg border border-dashed border-destructive/40 bg-destructive/10 px-4 text-center text-sm text-destructive">
              {error}
            </p>
          ) : sortedTasks.length === 0 ? (
            <p className="motion-status flex min-h-36 items-center justify-center rounded-lg border border-dashed border-border bg-background/50 px-4 text-center text-sm text-muted-foreground">
              {t("noAvailableTasks")}
            </p>
          ) : (
            <div className="motion-list min-h-0 flex-1 space-y-2 overflow-auto pr-1">
              {visibleTasks.map((task, index) => {
                const sourceWorkspace = workspacesById.get(task.workspaceId);

                return (
                  <article
                    key={task.id}
                    className="motion-surface grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-background/65 px-3 py-2"
                    style={{ "--motion-index": index } as CSSProperties}
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        {task.status === "completed" && <Check className="size-3.5 shrink-0 text-muted-foreground" />}
                        {task.status === "in_progress" && <Loader2 className="size-3.5 shrink-0 text-info" />}
                        {task.status === "cancelled" && <XCircle className="size-3.5 shrink-0 text-muted-foreground" />}
                        <h3 className="truncate text-sm font-medium">{task.title}</h3>
                        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          {task.status === "completed" ? t("completed") : task.status === "in_progress" ? t("statusInProgress") : task.status === "cancelled" ? t("statusCancelled") : t("statusTodo")}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{sourceWorkspace?.name ?? t("workspaces")}</span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="size-3" />
                          {formatTaskDate(task.dueDate, i18n.language)}
                        </span>
                        {task.dueTime && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3" />
                            {task.dueTime}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button size="sm" type="button" variant="secondary" onClick={() => void addTask(task.id)}>
                      <Plus />
                      {t("addToWorkspace")}
                    </Button>
                  </article>
                );
              })}
              {hasMore && (
                <Button
                  className="w-full"
                  type="button"
                  variant="secondary"
                  onClick={() => setVisibleCount((count) => Math.min(count + WINDOW_SIZE, sortedTasks.length))}
                >
                  {t("loadMoreTasks", { shown: visibleTasks.length, total: sortedTasks.length })}
                </Button>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
