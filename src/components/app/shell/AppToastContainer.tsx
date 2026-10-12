import { RotateCcw, TriangleAlert, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export type UndoToastState = {
  message: string;
  undo: () => Promise<unknown>;
};

export type ReminderToastState = {
  id: string;
  title: string;
};

type AppToastContainerProps = {
  undoToast: UndoToastState | null;
  noticeToast: string | null;
  reminderToast: ReminderToastState | null;
  onRunUndo: () => void;
  onDismissUndo: () => void;
  onDismissNotice: () => void;
  onOpenReminderTask: (id: string) => void;
  onDismissReminder: () => void;
};

export function AppToastContainer({
  undoToast,
  noticeToast,
  reminderToast,
  onRunUndo,
  onDismissUndo,
  onDismissNotice,
  onOpenReminderTask,
  onDismissReminder,
}: AppToastContainerProps) {
  const { t } = useTranslation();

  // Undo toast keyboard shortcuts: Ctrl/Cmd+Z triggers undo, Esc dismisses.
  useEffect(() => {
    if (!undoToast) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      if (modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        onRunUndo();
      } else if (event.key === "Escape") {
        onDismissUndo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undoToast, onDismissUndo, onRunUndo]);

  if (!undoToast && !noticeToast && !reminderToast) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {undoToast && (
        <div
          aria-label={undoToast.message}
          aria-live="polite"
          className="motion-status pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-xl"
          role="status"
        >
          <span>{undoToast.message}</span>
          <button
            aria-label={t("undo")}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-secondary px-2.5 font-medium text-secondary-foreground hover:bg-accent"
            type="button"
            onClick={onRunUndo}
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            {t("undo")}
          </button>
          <button
            aria-label={t("close")}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            type="button"
            onClick={onDismissUndo}
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      )}

      {reminderToast && (
        <div
          aria-live="polite"
          className="motion-status pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-xl"
          role="status"
        >
          <button
            className="inline-flex h-8 items-center rounded-md bg-secondary px-2.5 font-medium text-secondary-foreground hover:bg-accent"
            type="button"
            onClick={() => onOpenReminderTask(reminderToast.id)}
          >
            {t("openReminderTask", { title: reminderToast.title })}
          </button>
          <button
            aria-label={t("close")}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            type="button"
            onClick={onDismissReminder}
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      )}

      {noticeToast && (
        <div
          aria-live="assertive"
          className="motion-status pointer-events-auto flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive shadow-xl"
          role="alert"
        >
          <TriangleAlert aria-hidden="true" className="size-3.5" />
          <span>{noticeToast}</span>
          <button
            aria-label={t("close")}
            className="inline-flex size-7 items-center justify-center rounded-md hover:bg-destructive/20"
            type="button"
            onClick={onDismissNotice}
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
