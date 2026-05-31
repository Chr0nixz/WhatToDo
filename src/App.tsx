import {
  CalendarDays,
  Bell,
  BriefcaseBusiness,
  FolderKanban,
  ListChecks,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { openTasks, overdueTasks, todayKey } from "@/data/date";
import { buildAppIndexes } from "@/data/appIndexes";
import type { AppView } from "@/data/types";
import { useReminders } from "@/hooks/useReminders";
import { useTheme } from "@/hooks/useTheme";
import { useTodos } from "@/hooks/useTodos";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";
import { isWorkspaceFloatingWindow } from "@/lib/windowContext";

import { HomeView } from "./components/app/HomeView";

const OverviewView = lazy(() => import("./components/app/OverviewView").then((module) => ({ default: module.OverviewView })));
const ProjectsView = lazy(() => import("./components/app/ProjectsView").then((module) => ({ default: module.ProjectsView })));
const ReminderCenterView = lazy(() =>
  import("./components/app/ReminderCenterView").then((module) => ({ default: module.ReminderCenterView })),
);
const SettingsView = lazy(() => import("./components/app/SettingsView").then((module) => ({ default: module.SettingsView })));
const TaskDetailPane = lazy(() => import("./components/app/TaskDetailPane").then((module) => ({ default: module.TaskDetailPane })));
const WorkspacesView = lazy(() => import("./components/app/WorkspacesView").then((module) => ({ default: module.WorkspacesView })));
const WorkspaceFloatingWindow = lazy(() =>
  import("./components/app/WorkspaceFloatingWindow").then((module) => ({ default: module.WorkspaceFloatingWindow })),
);

const navItems = [
  { id: "home", icon: CalendarDays, labelKey: "home" },
  { id: "overview", icon: ListChecks, labelKey: "overview" },
  { id: "projects", icon: FolderKanban, labelKey: "projects" },
  { id: "workspaces", icon: BriefcaseBusiness, labelKey: "workspaces" },
  { id: "reminders", icon: Bell, labelKey: "reminders" },
] satisfies { id: Exclude<AppView, "settings">; icon: typeof CalendarDays; labelKey: string }[];

const RAIL_STORAGE_KEY = "whattodo:rail";
const LEGACY_RAIL_STORAGE_KEY = "ddl-todo:rail";

function App() {
  const { data, isLoading, error, actions } = useTodos();
  const { i18n, t } = useTranslation();
  const [view, setView] = useState<AppView>("home");
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [undoToast, setUndoToast] = useState<{ message: string; undo: () => Promise<unknown> } | null>(null);
  const undoTimer = useRef<number | null>(null);
  const [isRailExpanded, setIsRailExpanded] = useState(
    () => (localStorage.getItem(RAIL_STORAGE_KEY) ?? localStorage.getItem(LEGACY_RAIL_STORAGE_KEY)) === "expanded",
  );
  const isFloatingWindow = isWorkspaceFloatingWindow();

  useTheme(data?.settings.theme ?? "system", data?.settings.accentColor ?? "blue");

  useEffect(() => {
    if (!data) {
      return;
    }

    if (i18n.language !== data.settings.language) {
      void i18n.changeLanguage(data.settings.language);
    }
  }, [data, i18n]);

  useEffect(() => {
    localStorage.setItem(RAIL_STORAGE_KEY, isRailExpanded ? "expanded" : "collapsed");
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
    }),
    [actions, showUndo, t],
  );
  const appIndexes = useMemo(() => (data ? buildAppIndexes(data) : null), [data]);

  const selectedTask = useMemo(() => {
    if (!data || !selectedTaskId) {
      return null;
    }

    const task = appIndexes?.tasksById.get(selectedTaskId) ?? null;
    return task?.deletedAt === null ? task : null;
  }, [appIndexes, data, selectedTaskId]);

  useEffect(() => {
    if (selectedTaskId && !selectedTask) {
      setSelectedTaskId(null);
    }
  }, [selectedTask, selectedTaskId]);

  const onOpenTask = useCallback(
    (taskId: string) => {
      const task = appIndexes?.tasksById.get(taskId);
      if (task) {
        setSelectedDate(task.dueDate);
        setSelectedTaskId(task.id);
        setView("home");
      }
    },
    [appIndexes],
  );

  const disableNotifications = useCallback(async () => {
    if (!data?.settings.notificationsEnabled) {
      return;
    }

    await appActions.saveSettings({ ...data.settings, notificationsEnabled: false });
  }, [appActions, data]);

  useReminders(data, appActions.markReminderFired, appActions.markReminderFailed, onOpenTask, disableNotifications);

  const stats = useMemo(() => {
    if (!data) {
      return { open: 0, overdue: 0 };
    }

    return {
      open: openTasks(data.tasks).length,
      overdue: overdueTasks(data.tasks).length,
    };
  }, [data]);

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <div className="max-w-md rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-sm">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <TriangleAlert className="size-4" />
            {t("loadErrorTitle")}
          </div>
          <p className="break-words text-xs">{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-sm">
          <Loader2 className="size-4 animate-spin text-primary" />
          {t("loadingApp")}
        </div>
      </div>
    );
  }

  if (isFloatingWindow) {
    return (
      <Suspense fallback={<ViewLoading label={t("loadingView")} />}>
        <WorkspaceFloatingWindow actions={appActions} data={data} />
      </Suspense>
    );
  }

  const currentWorkspace = data.workspaces.find((workspace) => workspace.id === data.workspaceId);

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
                onClick={() => {
                  setView(item.id);
                }}
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
            {error && (
              <span className="motion-status inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive">
                <TriangleAlert className="size-3" />
                {error}
              </span>
            )}
          </div>
        </header>

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
                  selectedTaskId={selectedTaskId}
                  setSelectedTaskId={setSelectedTaskId}
                />
              )}
              {view === "projects" && (
                <ProjectsView
                  actions={appActions}
                  data={data}
                  selectedDate={selectedDate}
                  selectedTaskId={selectedTaskId}
                  setSelectedTaskId={setSelectedTaskId}
                />
              )}
              {view === "workspaces" && (
                <WorkspacesView
                  actions={appActions}
                  data={data}
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
          task={view === "settings" ? null : selectedTask}
        />
      </Suspense>
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

export default App;
