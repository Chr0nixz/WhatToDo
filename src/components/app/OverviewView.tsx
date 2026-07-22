import * as Dialog from "@radix-ui/react-dialog";
import { Filter, Save, Search, SlidersHorizontal, X } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { applySavedViewFilters, sortSavedViews } from "@/data/savedViews";
import { defaultTaskViewFilters } from "@/data/taskFilters";
import type { AppData, FilterCondition, FilterConditionField, FilterConditionOperator, FilterGroup, SavedTaskView, Settings, TaskViewFilters } from "@/data/types";
import { useTaskPage } from "@/hooks/useTaskPage";
import { useTasksRevision } from "@/hooks/useTodoStore";
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

function ManageViewsDialog({
  open,
  onOpenChange,
  savedViews,
  selectedViewId,
  currentFilters,
  settings,
  actions,
  onSelectView,
  onClearSelection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedViews: SavedTaskView[];
  selectedViewId: string | null;
  currentFilters: TaskViewFilters;
  settings: Settings;
  actions: TodoActions;
  onSelectView: (viewId: string) => void;
  onClearSelection: () => void;
}) {
  const { t } = useTranslation();
  const [newViewName, setNewViewName] = useState("");
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    if (!open) {
      setEditingViewId(null);
      setEditValue("");
      setNewViewName("");
    }
  }, [open]);

  const startEdit = (view: SavedTaskView) => {
    setEditingViewId(view.id);
    setEditValue(view.name);
  };

  const commitEdit = async (viewId: string) => {
    const view = savedViews.find((item) => item.id === viewId);
    const name = editValue.trim();
    if (!view || !name) {
      setEditingViewId(null);
      return;
    }
    await actions.updateSavedView(viewId, { name, filters: view.filters, pinned: view.pinned });
    setEditingViewId(null);
  };

  const updateWithCurrent = async (view: SavedTaskView) => {
    await actions.updateSavedView(view.id, { name: view.name, filters: currentFilters, pinned: view.pinned });
    onSelectView(view.id);
  };

  const togglePinned = async (view: SavedTaskView) => {
    await actions.updateSavedView(view.id, {
      name: view.name,
      filters: view.filters,
      pinned: !view.pinned,
    });
  };

  const setDefault = async (viewId: string) => {
    await actions.saveSettings({ ...settings, defaultSavedViewId: viewId });
  };

  const removeView = async (viewId: string) => {
    await actions.deleteSavedView(viewId);
    if (selectedViewId === viewId) {
      onClearSelection();
    }
  };

  const createView = async () => {
    const name = newViewName.trim();
    if (!name) {
      return;
    }
    await actions.createSavedView({ name, filters: currentFilters });
    setNewViewName("");
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="motion-dialog-overlay fixed inset-0 z-50 bg-background/65 backdrop-blur-[2px]" />
        <Dialog.Content className="motion-dialog-content fixed left-1/2 top-1/2 flex max-h-[85vh] w-[min(560px,calc(100vw-32px))] flex-col rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-xl outline-none">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold">{t("manageViews")}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-muted-foreground">
                {t("manageViewsDesc")}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button aria-label={t("close")} size="icon-sm" type="button" variant="ghost" title={t("close")}>
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 space-y-1.5 overflow-auto pr-1">
            {savedViews.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-card/35 px-4 py-6 text-center text-sm text-muted-foreground">
                {t("noSavedViews")}
              </p>
            ) : (
              savedViews.map((view) => {
                const isDefault = settings.defaultSavedViewId === view.id;
                const isSelected = selectedViewId === view.id;
                return (
                  <div
                    key={view.id}
                    className={cn(
                      "flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2",
                      isSelected && "border-ring bg-accent/40",
                    )}
                  >
                    {editingViewId === view.id ? (
                      <form
                        className="flex h-8 min-w-0 flex-1 items-center gap-1"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void commitEdit(view.id);
                        }}
                      >
                        <input
                          aria-label={t("viewName")}
                          autoFocus
                          className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-2 text-sm outline-none focus:border-ring"
                          value={editValue}
                          onChange={(event) => setEditValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setEditingViewId(null);
                            }
                          }}
                        />
                        <Button size="xs" type="submit">
                          {t("save")}
                        </Button>
                      </form>
                    ) : (
                      <>
                        <button
                          aria-label={t("renameSavedView")}
                          className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
                          type="button"
                          onClick={() => startEdit(view)}
                          title={t("renameSavedView")}
                        >
                          {view.name}
                        </button>
                        {view.pinned && (
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                            {t("pinnedSavedView")}
                          </span>
                        )}
                        {isDefault && (
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                            {t("defaultSavedView")}
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          <Button
                            size="xs"
                            type="button"
                            variant="outline"
                            onClick={() => void togglePinned(view)}
                          >
                            {view.pinned ? t("unpinSavedView") : t("pinSavedView")}
                          </Button>
                          {!isDefault && (
                            <Button size="xs" type="button" variant="outline" onClick={() => void setDefault(view.id)}>
                              {t("setAsDefault")}
                            </Button>
                          )}
                          <Button size="xs" type="button" variant="outline" onClick={() => void updateWithCurrent(view)}>
                            {t("updateWithCurrentFilters")}
                          </Button>
                          <Button
                            aria-label={t("deleteSavedView")}
                            size="xs"
                            type="button"
                            variant="destructive"
                            onClick={() => void removeView(view.id)}
                          >
                            {t("delete")}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <form
            className="mt-4 flex items-center gap-2 border-t border-border pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void createView();
            }}
          >
            <label className="sr-only" htmlFor="manage-view-name">
              {t("viewName")}
            </label>
            <input
              id="manage-view-name"
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-sm outline-none transition-colors focus:border-ring"
              placeholder={t("viewName")}
              value={newViewName}
              onChange={(event) => setNewViewName(event.target.value)}
            />
            <Button disabled={!newViewName.trim()} size="sm" type="submit">
              <Save className="size-3.5" />
              {t("createNewView")}
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TagFilterPanel({
  availableTags,
  filters,
  onChange,
}: {
  availableTags: string[];
  filters: TaskViewFilters;
  onChange: (next: Pick<TaskViewFilters, "tags" | "tagMatch">) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag || filters.tags.includes(tag)) {
      setDraft("");
      return;
    }
    onChange({ tags: [...filters.tags, tag], tagMatch: filters.tagMatch });
    setDraft("");
  };

  return (
    <div className="grid gap-2 rounded-md border border-border bg-card/60 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label={t("tagMatch")}
          value={filters.tagMatch}
          onChange={(value) => onChange({ tags: filters.tags, tagMatch: value as TaskViewFilters["tagMatch"] })}
        >
          <option value="any">{t("tagMatchAny")}</option>
          <option value="all">{t("tagMatchAll")}</option>
          <option value="none">{t("tagMatchNone")}</option>
        </FilterSelect>
        <label className="grid min-w-[12rem] flex-1 gap-1 text-xs text-muted-foreground">
          <span>{t("tags")}</span>
          <input
            className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
            list="overview-tag-suggestions"
            placeholder={t("tagFilterPlaceholder")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTag(draft);
              }
            }}
          />
          <datalist id="overview-tag-suggestions">
            {availableTags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        </label>
        <Button className="mt-4" size="sm" type="button" variant="secondary" onClick={() => addTag(draft)}>
          {t("addTagFilter")}
        </Button>
      </div>
      {filters.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.tags.map((tag) => (
            <button
              key={tag}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
              type="button"
              onClick={() =>
                onChange({
                  tags: filters.tags.filter((item) => item !== tag),
                  tagMatch: filters.tagMatch,
                })
              }
            >
              {tag}
              <X aria-hidden="true" className="size-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ADVANCED_FIELDS: FilterConditionField[] = [
  "priority",
  "status",
  "projectId",
  "tags",
  "hasReminder",
  "hasFolder",
  "dueDate",
  "parentId",
];

const operatorsForField = (field: FilterConditionField): FilterConditionOperator[] => {
  switch (field) {
    case "priority":
    case "status":
      return ["eq", "neq"];
    case "projectId":
    case "parentId":
      return ["eq", "isEmpty", "isNotEmpty"];
    case "tags":
      return ["contains", "notContains", "isEmpty", "isNotEmpty"];
    case "hasReminder":
    case "hasFolder":
      return ["eq"];
    case "dueDate":
      return ["eq", "neq", "before", "after"];
    default:
      return ["eq"];
  }
};

function AdvancedFilterPanel({
  filters,
  onChange,
}: {
  filters: TaskViewFilters;
  onChange: (advancedFilter: FilterGroup | null) => void;
}) {
  const { t } = useTranslation();
  const group = filters.advancedFilter;
  const conditions = group?.conditions ?? [];

  const updateConditions = (next: FilterCondition[]) => {
    if (next.length === 0) {
      onChange(null);
      return;
    }
    onChange({
      operator: "AND",
      negate: false,
      conditions: next,
      groups: group?.groups ?? [],
    });
  };

  const fieldLabel = (field: FilterConditionField) => {
    switch (field) {
      case "priority":
        return t("filterFieldPriority");
      case "status":
        return t("filterFieldStatus");
      case "projectId":
        return t("filterFieldProject");
      case "tags":
        return t("filterFieldTags");
      case "hasReminder":
        return t("filterFieldHasReminder");
      case "hasFolder":
        return t("filterFieldHasFolder");
      case "dueDate":
        return t("filterFieldDueDate");
      case "parentId":
        return t("filterFieldParent");
      default:
        return field;
    }
  };

  const opLabel = (op: FilterConditionOperator) => {
    switch (op) {
      case "eq":
        return t("filterOpEq");
      case "neq":
        return t("filterOpNeq");
      case "contains":
        return t("filterOpContains");
      case "notContains":
        return t("filterOpNotContains");
      case "before":
        return t("filterOpBefore");
      case "after":
        return t("filterOpAfter");
      case "isEmpty":
        return t("filterOpIsEmpty");
      case "isNotEmpty":
        return t("filterOpIsNotEmpty");
      default:
        return op;
    }
  };

  return (
    <div className="grid gap-2 rounded-md border border-border bg-card/60 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t("advancedFilters")}</span>
        <Button
          size="xs"
          type="button"
          variant="ghost"
          onClick={() =>
            updateConditions([
              ...conditions,
              { field: "priority", op: "eq", value: "high" },
            ])
          }
        >
          {t("addAdvancedCondition")}
        </Button>
      </div>
      {conditions.map((condition, index) => {
        const ops = operatorsForField(condition.field);
        const needsValue = condition.op !== "isEmpty" && condition.op !== "isNotEmpty";
        return (
          <div key={`${condition.field}-${index}`} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 max-md:grid-cols-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              <span>{t("filterField")}</span>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none"
                value={condition.field}
                onChange={(event) => {
                  const field = event.target.value as FilterConditionField;
                  const nextOps = operatorsForField(field);
                  const next = [...conditions];
                  next[index] = {
                    field,
                    op: nextOps[0] ?? "eq",
                    value: field === "hasReminder" || field === "hasFolder" ? "true" : "",
                  };
                  updateConditions(next);
                }}
              >
                {ADVANCED_FIELDS.map((field) => (
                  <option key={field} value={field}>
                    {fieldLabel(field)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              <span>{t("filterOperator")}</span>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none"
                value={condition.op}
                onChange={(event) => {
                  const next = [...conditions];
                  next[index] = { ...condition, op: event.target.value as FilterConditionOperator };
                  updateConditions(next);
                }}
              >
                {ops.map((op) => (
                  <option key={op} value={op}>
                    {opLabel(op)}
                  </option>
                ))}
              </select>
            </label>
            {needsValue ? (
              condition.field === "hasReminder" || condition.field === "hasFolder" ? (
                <label className="grid gap-1 text-xs text-muted-foreground">
                  <span>{t("filterValue")}</span>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none"
                    value={String(condition.value ?? "true")}
                    onChange={(event) => {
                      const next = [...conditions];
                      next[index] = { ...condition, value: event.target.value };
                      updateConditions(next);
                    }}
                  >
                    <option value="true">{t("yes")}</option>
                    <option value="false">{t("no")}</option>
                  </select>
                </label>
              ) : (
                <label className="grid gap-1 text-xs text-muted-foreground">
                  <span>{t("filterValue")}</span>
                  <input
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none"
                    value={String(condition.value ?? "")}
                    onChange={(event) => {
                      const next = [...conditions];
                      next[index] = { ...condition, value: event.target.value };
                      updateConditions(next);
                    }}
                  />
                </label>
              )
            ) : (
              <div />
            )}
            <Button
              aria-label={t("removeCondition")}
              size="icon-sm"
              type="button"
              variant="ghost"
              title={t("removeCondition")}
              onClick={() => updateConditions(conditions.filter((_, i) => i !== index))}
            >
              <X aria-hidden="true" className="size-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
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
