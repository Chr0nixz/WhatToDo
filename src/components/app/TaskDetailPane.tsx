import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import type {
  Attachment,
  Project,
  RecurringTaskTemplate,
  Reminder,
  Settings,
  Task,
  TaskDetailPaneHandle,
  TaskSummary,
} from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";
import { TaskDetailForm } from "./taskDetail/TaskDetailForm";

export type TaskDetailPaneProps = {
  task: Task | null;
  projects: Project[];
  reminders: Reminder[];
  recurringTaskTemplates: RecurringTaskTemplate[];
  attachments: Attachment[];
  tasks: TaskSummary[];
  settings: Settings;
  actions: TodoActions;
  onClose: () => void;
  onRequestSwitchCommit?: (nextTaskId: string | null) => void;
};

const describeError = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 120 ? `${message.slice(0, 117)}...` : message;
};

export const TaskDetailPane = forwardRef<TaskDetailPaneHandle, TaskDetailPaneProps>(function TaskDetailPane(
  {
    task,
    projects,
    reminders,
    recurringTaskTemplates,
    attachments,
    tasks,
    settings,
    actions,
    onClose,
    onRequestSwitchCommit,
  },
  ref: Ref<TaskDetailPaneHandle>,
) {
  const { t } = useTranslation();
  const [isDirty, setIsDirty] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  const [isNarrowScreen, setIsNarrowScreen] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(max-width: 767px)").matches : false,
  );
  const pendingSwitchRef = useRef<{ nextTaskId: string | null } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(max-width: 767px)");
    const handler = (event: MediaQueryListEvent) => setIsNarrowScreen(event.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  const requestClose = useCallback(() => {
    if (isDirty) {
      setPendingClose(true);
      return;
    }
    onClose();
  }, [isDirty, onClose]);

  // UX-010: Listen for Escape key to trigger graceful pane close (with unsaved changes guard)
  useEffect(() => {
    if (!task) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingClose && !pendingSwitch && !pendingDelete) {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [task, pendingClose, pendingSwitch, pendingDelete, requestClose]);

  useImperativeHandle(
    ref,
    () => ({
      isDirty: () => isDirty,
      requestSwitch: (nextTaskId: string | null) => {
        if (!isDirty) {
          return true;
        }
        pendingSwitchRef.current = { nextTaskId };
        setPendingSwitch(true);
        return false;
      },
    }),
    [isDirty],
  );

  const requestDelete = () => {
    if (isDirty) {
      setPendingDelete(true);
      return;
    }
    setConfirmDeleteOpen(true);
  };

  const runDelete = async () => {
    if (!task) {
      return;
    }
    setDeleteErrorMessage(null);
    setConfirmDeleteOpen(false);
    setPendingDelete(false);
    try {
      await actions.deleteTask(task.id);
      onClose();
    } catch (err) {
      setDeleteErrorMessage(`${t("taskDeleteFailed")}: ${describeError(err)}`);
    }
  };

  const commitSwitch = () => {
    const next = pendingSwitchRef.current?.nextTaskId ?? null;
    pendingSwitchRef.current = null;
    setPendingSwitch(false);
    onRequestSwitchCommit?.(next);
  };

  return (
    <>
      {task ? (
        <button
          aria-hidden="true"
          aria-label={t("close")}
          className="fixed inset-0 z-30 hidden bg-background/65 max-md:block max-sm:bottom-14"
          tabIndex={-1}
          type="button"
          onClick={requestClose}
        />
      ) : null}

      <aside
        aria-label={t("taskDetail")}
        aria-modal={isNarrowScreen && task ? "true" : undefined}
        role={isNarrowScreen && task ? "dialog" : undefined}
        className={cn(
          "min-h-0 shrink-0 overflow-hidden border-l border-border bg-card/65 transition-[background-color,border-color] duration-150 ease-[var(--ease-out-quart)] max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:shadow-xl max-sm:bottom-14",
          task ? "w-[360px] max-xl:w-[332px] max-md:w-[min(360px,calc(100vw-56px))] max-sm:w-full" : "w-0",
        )}
      >
        {task && (
          <TaskDetailForm
            key={task.id}
            actions={actions}
            attachments={attachments}
            projects={projects}
            recurringTaskTemplates={recurringTaskTemplates}
            reminders={reminders}
            settings={settings}
            task={task}
            tasks={tasks}
            onDirtyChange={setIsDirty}
            onRequestClose={requestClose}
            onRequestDelete={requestDelete}
          />
        )}
      </aside>

      {/* Unsaved changes confirmation before closing */}
      <ConfirmDialog
        confirmLabel={t("discard")}
        description={t("confirmDiscardHint")}
        open={pendingClose}
        title={t("confirmDiscardTitle")}
        onConfirm={() => {
          setPendingClose(false);
          setIsDirty(false);
          onClose();
        }}
        onOpenChange={(open) => {
          if (!open) setPendingClose(false);
        }}
      />

      {/* Unsaved changes confirmation before switching task */}
      <ConfirmDialog
        confirmLabel={t("discard")}
        description={t("confirmDiscardHint")}
        open={pendingSwitch}
        title={t("confirmDiscardTitle")}
        onConfirm={() => {
          setPendingSwitch(false);
          setIsDirty(false);
          commitSwitch();
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingSwitch(false);
            pendingSwitchRef.current = null;
          }
        }}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        confirmLabel={t("delete")}
        description={pendingDelete ? t("confirmDeleteWithUnsaved") : t("confirmDeleteTaskHint")}
        open={confirmDeleteOpen || pendingDelete}
        title={t("confirmDeleteTask")}
        onConfirm={() => void runDelete()}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDeleteOpen(false);
            setPendingDelete(false);
          }
        }}
      />

      {deleteErrorMessage && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-md"
        >
          {deleteErrorMessage}
        </div>
      )}
    </>
  );
});
