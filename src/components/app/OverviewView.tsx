import { ListChecks, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { overdueTasks } from "@/data/date";
import { projectById } from "@/data/project";
import type { AppData, Task, TaskPriority, TaskStatus } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

import { TaskCreateDialog } from "./TaskCreateDialog";
import { TaskList } from "./TaskList";

type OverviewViewProps = {
  data: AppData;
  actions: TodoActions;
  selectedTaskId: string | null;
  setSelectedTaskId: (taskId: string | null) => void;
};

type TaskScope = "open" | "completed" | "all";

const priorityRank: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const statusRank: Record<TaskStatus, number> = {
  todo: 0,
  completed: 1,
};

const sortOverviewTasks = (tasks: Task[]) =>
  [...tasks].sort((a, b) => {
    const status = statusRank[a.status] - statusRank[b.status];
    if (status !== 0) {
      return status;
    }

    const dueDate = a.dueDate.localeCompare(b.dueDate);
    if (dueDate !== 0) {
      return dueDate;
    }

    const dueTime = (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99");
    if (dueTime !== 0) {
      return dueTime;
    }

    const priority = priorityRank[a.priority] - priorityRank[b.priority];
    if (priority !== 0) {
      return priority;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });

export function OverviewView({ data, actions, selectedTaskId, setSelectedTaskId }: OverviewViewProps) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<TaskScope>("open");
  const [searchQuery, setSearchQuery] = useState("");

  const visibleTasks = useMemo(() => data.tasks.filter((task) => task.deletedAt === null), [data.tasks]);
  const counts = useMemo(
    () => ({
      all: visibleTasks.length,
      open: visibleTasks.filter((task) => task.status === "todo").length,
      completed: visibleTasks.filter((task) => task.status === "completed").length,
      overdue: overdueTasks(data.tasks).length,
    }),
    [data.tasks, visibleTasks],
  );

  const tasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return sortOverviewTasks(
      visibleTasks.filter((task) => {
        if (scope === "open" && task.status !== "todo") {
          return false;
        }

        if (scope === "completed" && task.status !== "completed") {
          return false;
        }

        if (!query) {
          return true;
        }

        const project = projectById(data.projects, task.projectId);
        return [task.title, task.notes, task.dueDate, task.dueTime ?? "", project?.name ?? ""].some((value) =>
          value.toLowerCase().includes(query),
        );
      }),
    );
  }, [data.projects, scope, searchQuery, visibleTasks]);

  const scopes: { id: TaskScope; label: string; count: number }[] = [
    { id: "open", label: t("openTasks"), count: counts.open },
    { id: "completed", label: t("completed"), count: counts.completed },
    { id: "all", label: t("all"), count: counts.all },
  ];

  return (
    <main className="flex h-full min-h-0 flex-col">
      <section className="border-b border-border bg-background/65 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-secondary text-secondary-foreground">
                <ListChecks className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t("overview")}</p>
                <h1 className="truncate text-2xl font-semibold">{t("allTasks")}</h1>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Metric label={t("openTasks")} value={counts.open} />
              <Metric label={t("completed")} value={counts.completed} />
              <Metric label={t("overdue")} value={counts.overdue} tone={counts.overdue > 0 ? "danger" : "default"} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <input
                className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none transition-colors focus:border-ring max-sm:w-44"
                placeholder={t("search")}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {searchQuery && (
                <button
                  className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                  title={t("clearSearch")}
                  type="button"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <TaskCreateDialog
              actions={actions}
              defaultDate={new Date().toISOString().slice(0, 10)}
              projects={data.projects.filter((project) => project.deletedAt === null && project.status !== "archived")}
              settings={data.settings}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {scopes.map((item) => (
            <button
              key={item.id}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                scope === item.id && "border-ring bg-accent text-accent-foreground",
              )}
              type="button"
              onClick={() => setScope(item.id)}
            >
              <span>{item.label}</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{item.count}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-auto p-4">
        {tasks.length === 0 ? (
          <div className="flex min-h-36 items-center justify-center rounded-lg border border-dashed border-border bg-card/35 px-6 text-center text-sm text-muted-foreground">
            {t("noTasks")}
          </div>
        ) : (
          <TaskList
            actions={actions}
            onSelectTask={setSelectedTaskId}
            projects={data.projects}
            reminders={data.reminders}
            selectedTaskId={selectedTaskId}
            tasks={tasks}
          />
        )}
      </section>
    </main>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "danger" }) {
  return (
    <div className="min-w-24 rounded-md border border-border bg-card/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold", tone === "danger" && "text-red-500")}>{value}</p>
    </div>
  );
}
