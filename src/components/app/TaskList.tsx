import { CalendarClock, Check, Clock, EyeOff, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { projectById } from "@/data/project";
import type { Project, Reminder, Task } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

type TaskListProps = {
  tasks: Task[];
  projects: Project[];
  reminders: Reminder[];
  actions: TodoActions;
  compact?: boolean;
  selectedTaskId?: string | null;
  onSelectTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  deleteMode?: "delete" | "hide";
};

const priorityClasses = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

export function TaskList({
  tasks,
  projects,
  reminders,
  actions,
  compact = false,
  selectedTaskId = null,
  onSelectTask,
  onDeleteTask,
  deleteMode = "delete",
}: TaskListProps) {
  const { t } = useTranslation();
  const DeleteIcon = deleteMode === "hide" ? EyeOff : Trash2;

  if (tasks.length === 0) {
    return (
      <div className="motion-status flex min-h-36 items-center justify-center rounded-lg border border-dashed border-border bg-card/35 px-6 text-center text-sm text-muted-foreground">
        {t("emptyDay")}
      </div>
    );
  }

  return (
    <div className="motion-list space-y-2">
      {tasks.map((task, index) => {
        const project = projectById(projects, task.projectId);
        const reminder = reminders.find((item) => item.taskId === task.id && item.enabled);

        return (
          <article
            key={task.id}
            className={cn(
              "motion-surface group grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-card/80 px-3 py-2 shadow-sm hover:border-ring/70",
              selectedTaskId === task.id && "border-ring bg-accent/80",
              task.status === "completed" && "opacity-60",
              compact && "py-1.5",
            )}
            style={{ "--motion-index": index } as CSSProperties}
          >
            <button
              aria-pressed={task.status === "completed"}
              className={cn(
                "flex size-6 items-center justify-center rounded-full border transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out-quart)] active:scale-90",
                task.status === "completed"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background hover:border-ring",
              )}
              type="button"
              aria-label={task.status === "completed" ? t("completed") : t("openTasks")}
              onClick={() => void actions.toggleTask(task.id)}
            >
              {task.status === "completed" && <Check className="motion-status size-3.5" />}
            </button>
            <button
              aria-current={selectedTaskId === task.id ? "true" : undefined}
              aria-label={`${t("openTask")}: ${task.title}`}
              className="min-w-0 text-left"
              type="button"
              onClick={() => onSelectTask?.(task.id)}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-label={`${t("priority")}: ${t(task.priority)}`}
                  className={cn("size-2 shrink-0 rounded-full", priorityClasses[task.priority])}
                  role="img"
                />
                <h3
                  className={cn(
                    "truncate text-sm font-medium",
                    task.status === "completed" && "text-muted-foreground line-through",
                  )}
                >
                  {task.title}
                </h3>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3" />
                  {task.dueDate}
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
                {reminder && <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-amber-600">{t("reminder")}</span>}
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
                if (onDeleteTask) {
                  onDeleteTask(task.id);
                  return;
                }

                if (!window.confirm(t("confirmDeleteTask"))) {
                  return;
                }

                void actions.deleteTask(task.id);
              }}
            >
              <DeleteIcon />
            </Button>
          </article>
        );
      })}
    </div>
  );
}
