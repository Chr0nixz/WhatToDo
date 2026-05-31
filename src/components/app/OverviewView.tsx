import { ListChecks, Save, Search, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { overdueTasks } from "@/data/date";
import { defaultTaskViewFilters } from "@/data/taskFilters";
import type { AppData, TaskViewFilters } from "@/data/types";
import { useTaskPage } from "@/hooks/useTaskPage";
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

export function OverviewView({ data, actions, selectedTaskId, setSelectedTaskId }: OverviewViewProps) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<TaskViewFilters>(() => defaultTaskViewFilters());
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [viewName, setViewName] = useState("");
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 180);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

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
  const taskPageInput = useMemo(
    () => ({
      workspaceId: data.workspaceId,
      scope: filters.scope,
      priority: filters.priority,
      projectId: filters.projectId === "all" ? null : filters.projectId,
      reminder: filters.reminder,
      folder: filters.folder,
      dateRange: filters.dateRange,
      query: debouncedSearchQuery,
      sort: "overview" as const,
    }),
    [data.workspaceId, debouncedSearchQuery, filters],
  );
  const taskPage = useTaskPage({
    actions,
    input: taskPageInput,
    reloadKey: data.tasks,
  });

  const scopes: { id: TaskViewFilters["scope"]; label: string; count: number }[] = [
    { id: "open", label: t("openTasks"), count: counts.open },
    { id: "completed", label: t("completed"), count: counts.completed },
    { id: "all", label: t("all"), count: counts.all },
  ];

  const setFilter = <K extends keyof TaskViewFilters>(key: K, value: TaskViewFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setSelectedViewId(null);
  };

  const saveView = async () => {
    const name = viewName.trim();
    if (!name) {
      return;
    }

    await actions.createSavedView({ name, filters });
    setViewName("");
  };

  const applySavedView = (viewId: string) => {
    const view = data.savedViews.find((item) => item.id === viewId);
    if (!view) {
      return;
    }
    setFilters(view.filters);
    setSelectedViewId(view.id);
  };

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
              <label className="sr-only" htmlFor="overview-search">
                {t("search")}
              </label>
              <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <input
                id="overview-search"
                className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none transition-colors focus:border-ring max-sm:w-44"
                placeholder={t("search")}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {searchQuery && (
                <button
                  aria-label={t("clearSearch")}
                  className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                  title={t("clearSearch")}
                  type="button"
                  onClick={() => setSearchQuery("")}
                >
                  <X aria-hidden="true" className="size-4" />
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
                "inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out-quart)] hover:bg-accent hover:text-accent-foreground",
                filters.scope === item.id && "border-ring bg-accent text-accent-foreground",
              )}
              type="button"
              onClick={() => setFilter("scope", item.id)}
            >
              <span>{item.label}</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{item.count}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-[repeat(5,minmax(120px,1fr))] gap-2 max-xl:grid-cols-3 max-md:grid-cols-2">
          <FilterSelect label={t("priority")} value={filters.priority} onChange={(value) => setFilter("priority", value as TaskViewFilters["priority"])}>
            <option value="all">{t("allPriorities")}</option>
            <option value="high">{t("high")}</option>
            <option value="medium">{t("medium")}</option>
            <option value="low">{t("low")}</option>
          </FilterSelect>
          <FilterSelect label={t("projects")} value={filters.projectId} onChange={(value) => setFilter("projectId", value as TaskViewFilters["projectId"])}>
            <option value="all">{t("allProjects")}</option>
            <option value="none">{t("noProject")}</option>
            {data.projects
              .filter((project) => project.deletedAt === null && project.status !== "archived")
              .map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
          </FilterSelect>
          <FilterSelect label={t("reminder")} value={filters.reminder} onChange={(value) => setFilter("reminder", value as TaskViewFilters["reminder"])}>
            <option value="all">{t("all")}</option>
            <option value="with">{t("withReminder")}</option>
            <option value="without">{t("withoutReminder")}</option>
          </FilterSelect>
          <FilterSelect label={t("taskFolder")} value={filters.folder} onChange={(value) => setFilter("folder", value as TaskViewFilters["folder"])}>
            <option value="all">{t("all")}</option>
            <option value="with">{t("withFolder")}</option>
            <option value="without">{t("withoutFolder")}</option>
          </FilterSelect>
          <FilterSelect label={t("dateRange")} value={filters.dateRange} onChange={(value) => setFilter("dateRange", value as TaskViewFilters["dateRange"])}>
            <option value="all">{t("allDates")}</option>
            <option value="today">{t("today")}</option>
            <option value="week">{t("thisWeek")}</option>
            <option value="overdue">{t("overdue")}</option>
          </FilterSelect>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {data.savedViews.map((view) => (
            <span
              key={view.id}
              className={cn(
                "inline-flex h-8 items-center overflow-hidden rounded-md border border-border bg-background text-sm",
                selectedViewId === view.id && "border-ring bg-accent text-accent-foreground",
              )}
            >
              <button className="h-full px-2.5" type="button" onClick={() => applySavedView(view.id)}>
                {view.name}
              </button>
              <button
                aria-label={t("deleteSavedView")}
                className="flex h-full w-8 items-center justify-center border-l border-border text-muted-foreground hover:text-destructive"
                title={t("deleteSavedView")}
                type="button"
                onClick={() => void actions.deleteSavedView(view.id)}
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          ))}
          <label className="sr-only" htmlFor="saved-view-name">
            {t("savedViewName")}
          </label>
          <input
            id="saved-view-name"
            className="h-8 w-40 rounded-md border border-input bg-background px-2.5 text-sm outline-none transition-colors focus:border-ring"
            placeholder={t("savedViewName")}
            value={viewName}
            onChange={(event) => setViewName(event.target.value)}
          />
          <ButtonLike disabled={!viewName.trim()} onClick={() => void saveView()}>
            <Save className="size-3.5" />
            {t("saveView")}
          </ButtonLike>
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-auto p-4">
        {taskPage.isLoading ? (
          <div className="motion-status flex min-h-36 items-center justify-center rounded-lg border border-dashed border-border bg-card/35 px-6 text-center text-sm text-muted-foreground">
            {t("loadingTasks")}
          </div>
        ) : taskPage.error && taskPage.tasks.length === 0 ? (
          <div className="motion-status flex min-h-36 items-center justify-center rounded-lg border border-dashed border-destructive/40 bg-destructive/10 px-6 text-center text-sm text-destructive">
            {taskPage.error}
          </div>
        ) : taskPage.tasks.length === 0 ? (
          <div className="motion-status flex min-h-36 items-center justify-center rounded-lg border border-dashed border-border bg-card/35 px-6 text-center text-sm text-muted-foreground">
            {t("noTasks")}
          </div>
        ) : (
          <TaskList
            actions={actions}
            onSelectTask={setSelectedTaskId}
            projects={data.projects}
            selectedTaskId={selectedTaskId}
            tasks={taskPage.tasks}
            totalCount={taskPage.total}
            reminders={taskPage.reminders}
            isLoadingMore={taskPage.isLoadingMore}
            loadError={taskPage.error}
            onLoadMore={() => void taskPage.loadMore()}
            windowKey={JSON.stringify({ filters, query: debouncedSearchQuery })}
          />
        )}
      </section>
    </main>
  );
}

function FilterSelect({
  children,
  label,
  value,
  onChange,
}: {
  children: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <select
        className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function ButtonLike({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "danger" }) {
  return (
    <div className="motion-surface min-w-24 rounded-md border border-border bg-card/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold", tone === "danger" && "text-red-500")}>{value}</p>
    </div>
  );
}
