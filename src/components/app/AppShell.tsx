import {
  CalendarDays,
  Bell,
  BriefcaseBusiness,
  Command,
  FolderKanban,
  ListChecks,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Settings,
  TriangleAlert,
  X,
} from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { CommandPalette } from "@/components/app/CommandPalette";
import { ProjectEditDialog } from "@/components/app/ProjectEditDialog";
import { TaskCreateDialog } from "@/components/app/TaskCreateDialog";
import { WorkspaceEditDialog } from "@/components/app/WorkspaceEditDialog";
import { buildCommandItems, type CommandItem } from "@/data/commandPalette";
import { openTasks, overdueTasks, todayKey } from "@/data/date";
import { buildAppIndexes } from "@/data/appIndexes";
import type { AppData, AppView, SavedTaskView, TaskViewFilters } from "@/data/types";
import { useCommandPalette } from "@/hooks/useCommandPalette";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useReminders } from "@/hooks/useReminders";
import { useTheme } from "@/hooks/useTheme";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

import { HomeView } from "./HomeView";

const loadOverviewView = () => import("./OverviewView").then((module) => ({ default: module.OverviewView }));
const loadProjectsView = () => import("./ProjectsView").then((module) => ({ default: module.ProjectsView }));
const loadReminderCenterView = () =>
  import("./ReminderCenterView").then((module) => ({ default: module.ReminderCenterView }));
const loadSettingsView = () => import("./SettingsView").then((module) => ({ default: module.SettingsView }));
const loadTaskDetailPane = () => import("./TaskDetailPane").then((module) => ({ default: module.TaskDetailPane }));
const loadWorkspacesView = () => import("./WorkspacesView").then((module) => ({ default: module.WorkspacesView }));

const OverviewView = lazy(loadOverviewView);
const ProjectsView = lazy(loadProjectsView);
const ReminderCenterView = lazy(loadReminderCenterView);
const SettingsView = lazy(loadSettingsView);
const TaskDetailPane = lazy(loadTaskDetailPane);
const WorkspacesView = lazy(loadWorkspacesView);

const navItems = [
  { id: "home", icon: CalendarDays, labelKey: "home" },
  { id: "overview", icon: ListChecks, labelKey: "overview" },
  { id: "projects", icon: FolderKanban, labelKey: "projects" },
  { id: "workspaces", icon: BriefcaseBusiness, labelKey: "workspaces" },
  { id: "reminders", icon: Bell, labelKey: "reminders" },
] satisfies { id: Exclude<AppView, "settings">; icon: typeof CalendarDays; labelKey: string }[];

type AppShellProps = {
  data: AppData;
  error: string | null;
  dbReset: boolean;
  actions: TodoActions;
};

export function AppShell({ data, error, dbReset, actions }: AppShellProps) {
  const { i18n, t } = useTranslation();
  const [view, setView] = useState<AppView>("home");
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showResetBanner, setShowResetBanner] = useState(dbReset);

  useEffect(() => {
    if (dbReset) setShowResetBanner(true);
  }, [dbReset]);
  const [undoToast, setUndoToast] = useState<{ message: string; undo: () => Promise<unknown> } | null>(null);
  const [isRailExpanded, setIsRailExpanded] = useState(
    () => (localStorage.getItem("whattodo:rail") ?? localStorage.getItem("ddl-todo:rail")) === "expanded",
  );
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [workspaceEditOpen, setWorkspaceEditOpen] = useState(false);
  const [projectEditOpen, setProjectEditOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [pendingSavedView, setPendingSavedView] = useState<SavedTaskView | null>(null);
  const [overviewFilters, setOverviewFilters] = useState<TaskViewFilters | null>(null);
  const [overviewSelectedViewId, setOverviewSelectedViewId] = useState<string | null>(null);
  const undoTimer = useRef<number | null>(null);

  const clearExternalOverviewFilters = useCallback(() => {
    setOverviewFilters(null);
    setOverviewSelectedViewId(null);
  }, []);

  useTheme(data.settings.theme, data.settings.accentColor);

  useEffect(() => {
    if (i18n.language !== data.settings.language) {
      void i18n.changeLanguage(data.settings.language);
    }
  }, [data.settings.language, i18n]);

  useEffect(() => {
    localStorage.setItem("whattodo:rail", isRailExpanded ? "expanded" : "collapsed");
  }, [isRailExpanded]);

  useEffect(
    () => () => {
      if (undoTimer.current !== null) {
        window.clearTimeout(undoTimer.current);
      }
    },
    [],
  );

  const showUndo = useCallback((message: string, undo: () => Promise<unknown>) => {
    if (undoTimer.current !== null) {
      window.clearTimeout(undoTimer.current);
    }
    setUndoToast({ message, undo });
    undoTimer.current = window.setTimeout(() => setUndoToast(null), 8000);
  }, []);

  const appActions: TodoActions = useMemo(
    () => ({
      ...actions,
      deleteTask: async (id: string) => {
        const next = await actions.deleteTask(id);
        showUndo(t("taskDeleted"), () => actions.restoreTask(id));
        return next;
      },
      deleteWorkspaceFolder: async (id: string) => {
        const next = await actions.deleteWorkspaceFolder(id);
        showUndo(t("folderDeleted"), () => actions.restoreWorkspaceFolder(id));
        return next;
      },
      archiveProject: async (id: string) => {
        const next = await actions.archiveProject(id);
        showUndo(t("projectArchived"), () => actions.unarchiveProject(id));
        return next;
      },
      deleteWorkspace: async (id: string) => {
        const next = await actions.deleteWorkspace(id);
        showUndo(t("workspaceDeleted"), () => actions.restoreWorkspace(id));
        return next;
      },
    }),
    [actions, showUndo, t],
  );

  const appIndexes = useMemo(() => buildAppIndexes(data), [data]);

  const onOpenTask = useCallback(
    (taskId: string) => {
      const task = appIndexes.tasksById.get(taskId);
      if (task) {
        setSelectedDate(task.dueDate);
        setSelectedTaskId(task.id);
        setView("home");
      }
    },
    [appIndexes],
  );

  const openFolder = useCallback(async (path: string) => {
    try {
      await openPath(path);
    } catch {
      // Folder open failures are surfaced in view-level actions when needed.
    }
  }, []);

  const applySavedView = useCallback((viewItem: SavedTaskView) => {
    setPendingSavedView(viewItem);
    setView("overview");
  }, []);

  const openTaskSearchRef = useRef<() => void>(() => undefined);

  const buildItems = useCallback(
    () =>
      buildCommandItems({
        data,
        t,
        setView,
        onOpenTask,
        onNewTask: () => setTaskCreateOpen(true),
        onSearchTasks: () => openTaskSearchRef.current(),
        selectWorkspace: (workspaceId) => void appActions.selectWorkspace(workspaceId),
        openFolder,
        applySavedView,
        onEditWorkspace: () => {
          setView("workspaces");
          setWorkspaceEditOpen(true);
        },
        onEditProject: (projectId) => {
          setEditingProjectId(projectId);
          setView("projects");
          setProjectEditOpen(true);
        },
      }),
    [appActions, applySavedView, data, onOpenTask, openFolder, t],
  );

  const searchTasks = useCallback(
    async (query: string): Promise<CommandItem[]> => {
      const result = await appActions.loadTaskPage({
        workspaceId: data.workspaceId,
        scope: "all",
        query,
        limit: 20,
        offset: 0,
        sort: "overview",
      });

      return result.tasks.map((task) => ({
        id: `task-result:${task.id}`,
        group: "tasks" as const,
        label: task.title,
        keywords: [task.title, task.dueDate],
        run: () => onOpenTask(task.id),
      }));
    },
    [appActions, data.workspaceId, onOpenTask],
  );

  const palette = useCommandPalette({ buildItems, searchTasks });
  openTaskSearchRef.current = palette.openTaskSearch;

  useGlobalShortcuts({
    onOpenPalette: palette.togglePalette,
    onNewTask: () => setTaskCreateOpen(true),
    onSearchTasks: palette.openTaskSearch,
  });

  const disableNotifications = useCallback(async () => {
    if (!data.settings.notificationsEnabled) {
      return;
    }

    await appActions.saveSettings({ ...data.settings, notificationsEnabled: false });
  }, [appActions, data.settings]);

  useReminders(data, appActions.markReminderFired, appActions.markReminderFailed, onOpenTask, disableNotifications);

  useEffect(() => {
    if (!pendingSavedView) {
      return;
    }

    setOverviewFilters(pendingSavedView.filters);
    setOverviewSelectedViewId(pendingSavedView.id);
    setPendingSavedView(null);
  }, [pendingSavedView]);

  const stats = useMemo(
    () => ({
      open: openTasks(data.tasks).length,
      overdue: overdueTasks(data.tasks).length,
    }),
    [data.tasks],
  );

  const currentWorkspace = data.workspaces.find((workspace) => workspace.id === data.workspaceId) ?? null;
  const editingProject = editingProjectId ? data.projects.find((project) => project.id === editingProjectId) ?? null : null;
  const shortcutHint =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "\u2318K" : "Ctrl+K";

  const runUndo = async () => {
    const current = undoToast;
    if (!current) {
      return;
    }
    setUndoToast(null);
    if (undoTimer.current !== null) {
      window.clearTimeout(undoTimer.current);
    }
    await current.undo();
  };

  return (
    <div className="relative flex h-dvh min-h-0 overflow-hidden bg-background text-foreground max-sm:flex-col">
      <aside
        aria-label={t("appName")}
        className={cn(
          "flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-2 py-3 text-sidebar-foreground transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out-quart)] max-sm:order-last max-sm:z-50 max-sm:h-14 max-sm:w-full max-sm:flex-row max-sm:items-center max-sm:border-r-0 max-sm:border-t max-sm:px-2 max-sm:py-1",
          isRailExpanded ? "w-56" : "w-14",
        )}
      >
        <div className={cn("mb-5 flex items-center gap-3 max-sm:hidden", isRailExpanded ? "px-2" : "justify-center px-0")}>
          <div className="flex size-9 items-center justify-center rounded-lg border border-sidebar-border bg-background/45 text-sidebar-foreground">
            <CalendarDays className="size-4" aria-hidden="true" />
          </div>
          <div className={cn("min-w-0", !isRailExpanded && "hidden")}>
            <h1 className="truncate text-sm font-semibold">{t("appName")}</h1>
            <p className="text-xs text-muted-foreground">{t("commandCenter")}</p>
          </div>
        </div>

        <nav aria-label={t("appName")} className="grid gap-1 max-sm:grid-flow-col max-sm:grid-cols-5 max-sm:flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                aria-current={view === item.id ? "page" : undefined}
                aria-label={t(item.labelKey)}
                key={item.id}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-lg text-sm transition-[background-color,color] duration-150 ease-[var(--ease-out-quart)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  "max-sm:h-11 max-sm:justify-center max-sm:px-0",
                  isRailExpanded ? "px-2.5" : "justify-center px-0",
                  view === item.id && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
                title={t(item.labelKey)}
                type="button"
                onClick={() => setView(item.id)}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className={cn("truncate max-sm:hidden", !isRailExpanded && "hidden")}>{t(item.labelKey)}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto grid gap-2 max-sm:mt-0">
          <div
            className={cn(
              "motion-pane-content grid gap-2 rounded-lg border border-sidebar-border bg-background/35 p-2",
              "max-sm:hidden",
              !isRailExpanded && "hidden",
            )}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("openTasks")}</span>
              <strong>{stats.open}</strong>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("overdue")}</span>
              <strong className={stats.overdue > 0 ? "text-red-500" : ""}>{stats.overdue}</strong>
            </div>
          </div>

          <button
            aria-current={view === "settings" ? "page" : undefined}
            aria-label={t("settings")}
            className={cn(
              "flex h-10 items-center gap-3 rounded-lg text-sm transition-[background-color,color] duration-150 ease-[var(--ease-out-quart)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              "max-sm:h-11 max-sm:justify-center max-sm:px-0",
              isRailExpanded ? "px-2.5" : "justify-center px-0",
              view === "settings" && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
            title={t("settings")}
            type="button"
            onClick={() => {
              setView("settings");
              setSelectedTaskId(null);
            }}
          >
            <Settings aria-hidden="true" className="size-4 shrink-0" />
            <span className={cn("truncate max-sm:hidden", !isRailExpanded && "hidden")}>{t("settings")}</span>
          </button>

          <button
            aria-expanded={isRailExpanded}
            aria-label={isRailExpanded ? t("collapseSidebar") : t("expandSidebar")}
            className="flex h-9 items-center justify-center rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-quart)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-95 max-sm:hidden"
            title={isRailExpanded ? t("collapseSidebar") : t("expandSidebar")}
            type="button"
            onClick={() => setIsRailExpanded((value) => !value)}
          >
            {isRailExpanded ? (
              <PanelLeftClose aria-hidden="true" className="size-4" />
            ) : (
              <PanelLeftOpen aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t(view)}</p>
            <h2 key={view} className="motion-status truncate text-sm font-semibold">
              {view === "home"
                ? t("allDeadlines")
                : view === "overview"
                  ? t("allTasks")
                  : view === "projects"
                    ? t("projects")
                    : view === "workspaces"
                      ? currentWorkspace?.name ?? t("workspaces")
                      : view === "reminders"
                        ? t("reminderCenter")
                        : t("settings")}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
              type="button"
              onClick={() => palette.openPalette("commands")}
            >
              <Command aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">{t("commandPalette")}</span>
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{shortcutHint}</span>
            </button>
            {error && (
              <span className="motion-status inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive">
                <TriangleAlert className="size-3" />
                {error}
              </span>
            )}
          </div>
        </header>

        {showResetBanner && (
          <div className="motion-status flex items-center gap-2 border-b border-amber-300/40 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <TriangleAlert className="size-3.5 shrink-0" />
            <span className="flex-1">{t("dbResetNotice")}</span>
            <button
              className="shrink-0 rounded p-0.5 hover:bg-amber-200/50 dark:hover:bg-amber-800/30"
              type="button"
              onClick={() => setShowResetBanner(false)}
              aria-label={t("dismiss")}
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden">
          <div key={view} className="motion-view h-full">
            <Suspense fallback={<ViewLoading label={t("loadingView")} />}>
              {view === "home" && (
                <HomeView
                  actions={appActions}
                  data={data}
                  searchQuery={searchQuery}
                  selectedDate={selectedDate}
                  selectedTaskId={selectedTaskId}
                  setSearchQuery={setSearchQuery}
                  setSelectedDate={setSelectedDate}
                  setSelectedTaskId={setSelectedTaskId}
                />
              )}
              {view === "overview" && (
                <OverviewView
                  actions={appActions}
                  data={data}
                  externalFilters={overviewFilters}
                  externalSelectedViewId={overviewSelectedViewId}
                  onExternalFiltersApplied={clearExternalOverviewFilters}
                  selectedTaskId={selectedTaskId}
                  setSelectedTaskId={setSelectedTaskId}
                />
              )}
              {view === "projects" && (
                <ProjectsView
                  actions={appActions}
                  data={data}
                  initialProjectId={editingProjectId}
                  selectedDate={selectedDate}
                  selectedTaskId={selectedTaskId}
                  setSelectedTaskId={setSelectedTaskId}
                  onRequestEditProject={(projectId) => {
                    setEditingProjectId(projectId);
                    setProjectEditOpen(true);
                  }}
                />
              )}
              {view === "workspaces" && (
                <WorkspacesView
                  actions={appActions}
                  data={data}
                  onEditWorkspace={() => setWorkspaceEditOpen(true)}
                  selectedTaskId={selectedTaskId}
                  setSelectedTaskId={setSelectedTaskId}
                />
              )}
              {view === "reminders" && <ReminderCenterView actions={appActions} data={data} onOpenTask={onOpenTask} />}
              {view === "settings" && (
                <div className="h-full overflow-auto p-4">
                  <SettingsView actions={appActions} data={data} />
                </div>
              )}
            </Suspense>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <TaskDetailPane
          actions={appActions}
          onClose={() => setSelectedTaskId(null)}
          projects={data.projects}
          reminders={data.reminders}
          recurringTaskTemplates={data.recurringTaskTemplates}
          settings={data.settings}
          task={
            view === "settings"
              ? null
              : selectedTaskId
                ? (() => {
                    const task = appIndexes.tasksById.get(selectedTaskId) ?? null;
                    return task?.deletedAt === null ? task : null;
                  })()
                : null
          }
        />
      </Suspense>

      <TaskCreateDialog
        actions={appActions}
        defaultDate={selectedDate}
        hideTrigger
        open={taskCreateOpen}
        projects={data.projects.filter((project) => project.deletedAt === null && project.status !== "archived")}
        settings={data.settings}
        onOpenChange={setTaskCreateOpen}
      />

      <WorkspaceEditDialog
        actions={appActions}
        open={workspaceEditOpen}
        workspace={currentWorkspace}
        onDelete={(workspaceId) => void appActions.deleteWorkspace(workspaceId)}
        onOpenChange={setWorkspaceEditOpen}
      />

      <ProjectEditDialog
        actions={appActions}
        open={projectEditOpen}
        project={editingProject}
        onOpenChange={setProjectEditOpen}
      />

      <CommandPalette
        activeIndex={palette.activeIndex}
        isSearchingTasks={palette.isSearchingTasks}
        mode={palette.mode}
        open={palette.open}
        query={palette.query}
        taskSearchError={palette.taskSearchError}
        visibleItems={palette.visibleItems}
        onActiveIndexChange={palette.setActiveIndex}
        onModeChange={palette.setMode}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            palette.openPalette(palette.mode);
          } else {
            palette.closePalette();
          }
        }}
        onQueryChange={palette.setQuery}
        onRunItem={(item) => {
          palette.closePalette();
          void item.run();
        }}
      />

      {undoToast && (
        <div className="motion-status absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-xl">
          <span>{undoToast.message}</span>
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-secondary px-2.5 font-medium text-secondary-foreground hover:bg-accent"
            type="button"
            onClick={() => void runUndo()}
          >
            <RotateCcw className="size-3.5" />
            {t("undo")}
          </button>
        </div>
      )}
    </div>
  );
}

function ViewLoading({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        {label}
      </div>
    </div>
  );
}
