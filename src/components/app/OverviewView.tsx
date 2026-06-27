import { Filter, ListChecks, MoreHorizontal, Save, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { applySavedViewFilters } from "@/data/savedViews";
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
  externalFilters?: TaskViewFilters | null;
  externalSelectedViewId?: string | null;
  onExternalFiltersApplied?: () => void;
};

export function OverviewView({
  data,
  actions,
  selectedTaskId,
  setSelectedTaskId,
  externalFilters = null,
  externalSelectedViewId = null,
  onExternalFiltersApplied,
}: OverviewViewProps) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<TaskViewFilters>(() => defaultTaskViewFilters());
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [viewName, setViewName] = useState("");
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [menuViewId, setMenuViewId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const hasAppliedDefaultView = useRef(false);

  useEffect(() => {
    if (!externalFilters) {
      return;
    }

    setFilters(externalFilters);
    setSelectedViewId(externalSelectedViewId);
    onExternalFiltersApplied?.();
  }, [externalFilters, externalSelectedViewId, onExternalFiltersApplied]);

  useEffect(() => {
    if (hasAppliedDefaultView.current || externalFilters) {
      return;
    }

    const defaultViewId = data.settings.defaultSavedViewId;
    if (!defaultViewId) {
      return;
    }

    const defaultView = data.savedViews.find((view) => view.id === defaultViewId);
    if (defaultView) {
      applySavedViewFilters(defaultView, setFilters, setSelectedViewId);
      hasAppliedDefaultView.current = true;
    }
  }, [data.savedViews, data.settings.defaultSavedViewId, externalFilters]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 180);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const counts = useMemo(() => {
    // Single pass over data.tasks to compute visibility + per-status counts.
    // Previously this was four separate filter() calls plus overdueTasks()
    // iterating data.tasks again — five full passes over the task list.
    let open = 0;
    let completed = 0;
    let cancelled = 0;
    let overdue = 0;
    let visible = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const task of data.tasks) {
      if (task.deletedAt !== null) continue;
      visible++;
      switch (task.status) {
        case "todo":
        case "in_progress":
          open++;
          break;
        case "completed":
          completed++;
          break;
        case "cancelled":
          cancelled++;
          break;
      }
      if (task.status !== "completed" && task.status !== "cancelled" && task.dueDate < today) {
        overdue++;
      }
    }
    return { all: visible, open, completed, cancelled, overdue };
  }, [data.tasks]);
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
    { id: "cancelled", label: t("statusCancelled"), count: counts.cancelled },
    { id: "all", label: t("all"), count: counts.all },
  ];

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.priority !== "all") count++;
    if (filters.projectId !== "all") count++;
    if (filters.reminder !== "all") count++;
    if (filters.folder !== "all") count++;
    if (filters.dateRange !== "all") count++;
    return count;
  }, [filters]);

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
    applySavedViewFilters(view, setFilters, setSelectedViewId);
  };

  const renameSavedView = async (viewId: string) => {
    const view = data.savedViews.find((item) => item.id === viewId);
    const name = renameValue.trim();
    if (!view || !name) {
      return;
    }

    await actions.updateSavedView(viewId, { name, filters: view.filters });
    setRenamingViewId(null);
    setRenameValue("");
  };

  const updateSavedViewFilters = async (viewId: string) => {
    const view = data.savedViews.find((item) => item.id === viewId);
    if (!view) {
      return;
    }

    await actions.updateSavedView(viewId, { name: view.name, filters });
    setSelectedViewId(viewId);
    setMenuViewId(null);
  };

  const setDefaultSavedView = async (viewId: string) => {
    await actions.saveSettings({ ...data.settings, defaultSavedViewId: viewId });
    setMenuViewId(null);
  };

  const deleteSavedView = async (viewId: string) => {
    await actions.deleteSavedView(viewId);
    if (selectedViewId === viewId) {
      setSelectedViewId(null);
    }
    setMenuViewId(null);
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
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {data.savedViews.length > 0 && (
              <div className="relative">
                <label className="sr-only" htmlFor="overview-saved-views">
                  {t("savedViews")}
                </label>
                <select
                  id="overview-saved-views"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-ring max-sm:w-40"
                  value={selectedViewId ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value) {
                      applySavedView(value);
                    } else {
                      setSelectedViewId(null);
                    }
                  }}
                >
                  <option value="">{t("allTasks")}</option>
                  {data.savedViews.map((view) => (
                    <option key={view.id} value={view.id}>
                      {view.name}
                      {data.settings.defaultSavedViewId === view.id ? ` · ${t("defaultSavedView")}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm transition-colors hover:bg-accent",
              showFilters && "border-ring bg-accent text-accent-foreground",
            )}
            type="button"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="size-3.5" />
            {t("filters")}
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              type="button"
              onClick={() => {
                setFilters((current) => ({
                  ...current,
                  priority: "all",
                  projectId: "all",
                  reminder: "all",
                  folder: "all",
                  dateRange: "all",
                }));
                setSelectedViewId(null);
              }}
            >
              {t("clearFilters")}
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {data.savedViews.map((view) =>
              renamingViewId === view.id ? (
                <form
                  key={view.id}
                  className="flex h-8 items-center gap-1 rounded-md border border-border bg-background px-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void renameSavedView(view.id);
                  }}
                >
                  <input
                    aria-label={t("renameSavedView")}
                    className="h-7 w-28 rounded border border-input bg-background px-2 text-sm outline-none focus:border-ring"
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                  />
                  <button className="px-1.5 text-xs" type="submit">
                    {t("save")}
                  </button>
                </form>
              ) : (
                <span
                  key={view.id}
                  className={cn(
                    "relative inline-flex h-8 items-center overflow-hidden rounded-md border border-border bg-background text-sm",
                    selectedViewId === view.id && "border-ring bg-accent text-accent-foreground",
                  )}
                >
                  <button className="inline-flex h-full items-center gap-1.5 px-2.5" type="button" onClick={() => applySavedView(view.id)}>
                    {view.name}
                    {data.settings.defaultSavedViewId === view.id && (
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">{t("defaultSavedView")}</span>
                    )}
                  </button>
                  <button
                    aria-expanded={menuViewId === view.id}
                    aria-label={t("moreOptions")}
                    className="flex h-full w-8 items-center justify-center border-l border-border text-muted-foreground hover:text-foreground"
                    title={t("moreOptions")}
                    type="button"
                    onClick={() => setMenuViewId((current) => (current === view.id ? null : view.id))}
                  >
                    <MoreHorizontal aria-hidden="true" className="size-3.5" />
                  </button>
                  {menuViewId === view.id && (
                    <span className="absolute left-0 top-[calc(100%+4px)] z-10 grid min-w-36 gap-0.5 rounded-md border border-border bg-popover p-1 shadow-md">
                      <MenuButton
                        label={t("renameSavedView")}
                        onClick={() => {
                          setRenamingViewId(view.id);
                          setRenameValue(view.name);
                          setMenuViewId(null);
                        }}
                      />
                      <MenuButton label={t("updateSavedView")} onClick={() => void updateSavedViewFilters(view.id)} />
                      <MenuButton label={t("setDefaultSavedView")} onClick={() => void setDefaultSavedView(view.id)} />
                      <MenuButton label={t("deleteSavedView")} tone="danger" onClick={() => void deleteSavedView(view.id)} />
                    </span>
                  )}
                </span>
              ),
            )}
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
            <Button disabled={!viewName.trim()} size="sm" type="button" onClick={() => void saveView()}>
              <Save className="size-3.5" />
              {t("saveView")}
            </Button>
          </div>
        </div>
        {showFilters && (
          <div className="mt-2 grid grid-cols-[repeat(5,minmax(120px,1fr))] gap-2 max-xl:grid-cols-3 max-md:grid-cols-2">
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
        )}
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
            selectionEnabled
          />
        )}
      </section>
    </main>
  );
}

function MenuButton({
  label,
  onClick,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      className={cn(
        "rounded px-2 py-1.5 text-left text-xs hover:bg-accent",
        tone === "danger" && "text-destructive hover:text-destructive",
      )}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
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
