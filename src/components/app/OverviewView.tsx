import { Filter, Save, Search, SlidersHorizontal, X } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { applySavedViewFilters, sortSavedViews } from "@/data/savedViews";
import { defaultTaskViewFilters } from "@/data/taskFilters";
import type { AppData, TaskViewFilters } from "@/data/types";
import { useTaskPage } from "@/hooks/useTaskPage";
import { useTasksRevision } from "@/hooks/useTodoStore";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

import { TaskCreateDialog } from "./TaskCreateDialog";
import { TaskList } from "./TaskList";
import { AdvancedFilterPanel } from "./overview/AdvancedFilterPanel";
import { FilterSelect } from "./overview/FilterSelect";
import { ManageViewsDialog } from "./overview/ManageViewsDialog";
import { TagFilterPanel } from "./overview/TagFilterPanel";

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
  const tasksRevision = useTasksRevision();
  const [filters, setFilters] = useState<TaskViewFilters>(() => defaultTaskViewFilters());
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
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

  const sortedSavedViews = useMemo(() => sortSavedViews(data.savedViews), [data.savedViews]);

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
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const task of data.tasks) {
      if (task.deletedAt !== null) continue;
      for (const tag of task.tags) {
        if (tag.trim()) tags.add(tag);
      }
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
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
      tags: filters.tags,
      tagMatch: filters.tagMatch,
      advancedFilter: filters.advancedFilter,
      sort: "overview" as const,
    }),
    [data.workspaceId, debouncedSearchQuery, filters],
  );
  const taskPage = useTaskPage({
    actions,
    input: taskPageInput,
    reloadKey: tasksRevision,
  });

  const scopes = useMemo(
    (): { id: TaskViewFilters["scope"]; label: string; count: number }[] => [
      { id: "open", label: t("openTasks"), count: counts.open },
      { id: "completed", label: t("completed"), count: counts.completed },
      { id: "cancelled", label: t("statusCancelled"), count: counts.cancelled },
      { id: "all", label: t("all"), count: counts.all },
    ],
    [counts.all, counts.cancelled, counts.completed, counts.open, t],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.priority !== "all") count++;
    if (filters.projectId !== "all") count++;
    if (filters.reminder !== "all") count++;
    if (filters.folder !== "all") count++;
    if (filters.dateRange !== "all") count++;
    if (filters.tags.length > 0) count++;
    if (filters.advancedFilter && filters.advancedFilter.conditions.length > 0) count++;
    return count;
  }, [filters]);

  const setFilter = <K extends keyof TaskViewFilters>(key: K, value: TaskViewFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setSelectedViewId(null);
  };

  const scopeIdsRef = useRef(scopes.map((item) => item.id));
  scopeIdsRef.current = scopes.map((item) => item.id);

  // Global ←/→ cycles Overview scope when focus is not in an editable field
  // (HelpDialog documents this shortcut). Tablist still handles its own keys.
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return true;
      }
      return target.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      if (event.target instanceof HTMLElement && event.target.closest('[role="tablist"]')) {
        return;
      }

      const ids = scopeIdsRef.current;
      const currentIndex = ids.indexOf(filters.scope);
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + delta + ids.length) % ids.length;
      const next = ids[nextIndex];
      if (!next) {
        return;
      }
      event.preventDefault();
      setFilters((current) => ({ ...current, scope: next }));
      setSelectedViewId(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filters.scope]);

  // Arrow-key navigation across the scope chips (role="tablist"). Arrows move
  // both selection and focus, Home/End jump to the first/last chip.
  const handleScopeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const currentIndex = scopes.findIndex((item) => item.id === filters.scope);
    let nextIndex = currentIndex;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % scopes.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        nextIndex =
          currentIndex === -1 ? scopes.length - 1 : (currentIndex - 1 + scopes.length) % scopes.length;
        break;
      case "Home":
        event.preventDefault();
        nextIndex = 0;
        break;
      case "End":
        event.preventDefault();
        nextIndex = scopes.length - 1;
        break;
      default:
        return;
    }
    const next = scopes[nextIndex];
    if (!next) return;
    setFilter("scope", next.id);
    const buttons = event.currentTarget.querySelectorAll('[role="tab"]');
    const target = buttons[nextIndex];
    if (target instanceof HTMLElement) target.focus();
  };

  const applySavedView = (viewId: string) => {
    const view = data.savedViews.find((item) => item.id === viewId);
    if (!view) {
      return;
    }
    applySavedViewFilters(view, setFilters, setSelectedViewId);
  };

  return (
    <main className="flex h-full min-h-0 flex-col">
      <section className="border-b border-border bg-background/65 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{t("allTasks")}</h1>
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
                <Button
                  aria-label={t("clearSearch")}
                  className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-foreground"
                  size="icon-xs"
                  title={t("clearSearch")}
                  type="button"
                  variant="ghost"
                  onClick={() => setSearchQuery("")}
                >
                  <X aria-hidden="true" className="size-4" />
                </Button>
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

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div
            aria-label={t("scopeAriaLabel")}
            className="flex flex-wrap items-center gap-2"
            onKeyDown={handleScopeKeyDown}
            role="tablist"
            tabIndex={0}
          >
            {scopes.map((item) => {
              const isActive = filters.scope === item.id;
              return (
                <button
                  aria-selected={isActive}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out-quart)] hover:bg-accent hover:text-accent-foreground",
                    isActive && "border-ring bg-accent text-accent-foreground",
                  )}
                  key={item.id}
                  role="tab"
                  tabIndex={isActive ? 0 : -1}
                  type="button"
                  onClick={() => setFilter("scope", item.id)}
                >
                  <span>{item.label}</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{item.count}</span>
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-2">
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
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
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
                    tags: [],
                    tagMatch: "any",
                    advancedFilter: null,
                  }));
                  setSelectedViewId(null);
                }}
              >
                {t("clearFilters")}
              </button>
            )}
          </div>
        </div>
        {showFilters && (
          <div className="mt-2 grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {sortedSavedViews.length > 0 && (
                <div className="relative">
                  <label className="sr-only" htmlFor="overview-saved-views">
                    {t("savedViews")}
                  </label>
                  <select
                    id="overview-saved-views"
                    className="h-9 max-w-[12rem] rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-ring"
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
                    <option value="">{t("viewsMenu")}</option>
                    {sortedSavedViews.map((view) => (
                      <option key={view.id} value={view.id}>
                        {view.pinned ? `${t("pinnedSavedView")} · ` : ""}
                        {view.name}
                        {data.settings.defaultSavedViewId === view.id ? ` · ${t("defaultSavedView")}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <Button
                className="h-9 gap-1.5 px-2.5 text-sm"
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setManageOpen(true)}
              >
                <SlidersHorizontal className="size-3.5" />
                {t("manageViews")}
              </Button>
              <Button
                className="h-9 gap-1.5 px-2.5 text-sm"
                size="sm"
                type="button"
                variant="outline"
                onClick={() => setManageOpen(true)}
              >
                <Save className="size-3.5" />
                {t("saveCurrentView")}
              </Button>
            </div>
            <div className="grid grid-cols-[repeat(5,minmax(120px,1fr))] gap-2 max-xl:grid-cols-3 max-md:grid-cols-2">
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
            <TagFilterPanel
              availableTags={availableTags}
              filters={filters}
              onChange={(next) => {
                setFilters((current) => ({ ...current, ...next }));
                setSelectedViewId(null);
              }}
            />
            <AdvancedFilterPanel
              filters={filters}
              onChange={(advancedFilter) => {
                setFilters((current) => ({ ...current, advancedFilter }));
                setSelectedViewId(null);
              }}
            />
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
          <div className="motion-status flex min-h-36 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/35 px-6 text-center">
            <p className="text-sm text-muted-foreground">{t("noTasks")}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{t("emptyOverviewHint")}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {activeFilterCount > 0 && (
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFilters(defaultTaskViewFilters());
                    setSelectedViewId(null);
                    setSearchQuery("");
                  }}
                >
                  {t("clearFilters")}
                </Button>
              )}
              <TaskCreateDialog
                actions={actions}
                defaultDate={new Date().toISOString().slice(0, 10)}
                projects={data.projects.filter((project) => project.deletedAt === null && project.status !== "archived")}
                settings={data.settings}
              />
            </div>
          </div>
        ) : (
          <TaskList
            actions={actions}
            onSelectTask={setSelectedTaskId}
            onClearSelection={() => setSelectedTaskId(null)}
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

      <ManageViewsDialog
        actions={actions}
        currentFilters={filters}
        onClearSelection={() => setSelectedViewId(null)}
        onOpenChange={setManageOpen}
        onSelectView={applySavedView}
        open={manageOpen}
        savedViews={sortedSavedViews}
        selectedViewId={selectedViewId}
        settings={data.settings}
      />
    </main>
  );
}

