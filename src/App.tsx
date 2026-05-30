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
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { openTasks, overdueTasks, todayKey } from "@/data/date";
import type { AppView } from "@/data/types";
import { useReminders } from "@/hooks/useReminders";
import { useTheme } from "@/hooks/useTheme";
import { useTodos } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";
import { isWorkspaceFloatingWindow } from "@/lib/windowContext";

import { HomeView } from "./components/app/HomeView";
import { OverviewView } from "./components/app/OverviewView";
import { ProjectsView } from "./components/app/ProjectsView";
import { ReminderCenterView } from "./components/app/ReminderCenterView";
import { SettingsView } from "./components/app/SettingsView";
import { TaskDetailPane } from "./components/app/TaskDetailPane";
import { WorkspacesView } from "./components/app/WorkspacesView";
import { WorkspaceFloatingWindow } from "./components/app/WorkspaceFloatingWindow";

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

  const selectedTask = useMemo(() => {
    if (!data || !selectedTaskId) {
      return null;
    }

    return data.tasks.find((task) => task.id === selectedTaskId && task.deletedAt === null) ?? null;
  }, [data, selectedTaskId]);

  useEffect(() => {
    if (selectedTaskId && !selectedTask) {
      setSelectedTaskId(null);
    }
  }, [selectedTask, selectedTaskId]);

  const onOpenTask = useCallback(
    (taskId: string) => {
      const task = data?.tasks.find((item) => item.id === taskId);
      if (task) {
        setSelectedDate(task.dueDate);
        setSelectedTaskId(task.id);
        setView("home");
      }
    },
    [data],
  );

  const disableNotifications = useCallback(async () => {
    if (!data?.settings.notificationsEnabled) {
      return;
    }

    await actions.saveSettings({ ...data.settings, notificationsEnabled: false });
  }, [actions, data]);

  useReminders(data, actions.markReminderFired, onOpenTask, disableNotifications);

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
    return <WorkspaceFloatingWindow actions={actions} data={data} />;
  }

  const currentWorkspace = data.workspaces.find((workspace) => workspace.id === data.workspaceId);

  return (
    <div className="flex h-screen min-h-[680px] overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-2 py-3 text-sidebar-foreground transition-[width] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]",
          isRailExpanded ? "w-56" : "w-14",
        )}
      >
        <div className={cn("mb-5 flex items-center gap-3", isRailExpanded ? "px-2" : "justify-center px-0")}>
          <div className="flex size-9 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <img alt="" className="size-9" src="/app-icon.svg" />
          </div>
          <div className={cn("min-w-0", !isRailExpanded && "hidden")}>
            <h1 className="truncate text-sm font-semibold">{t("appName")}</h1>
            <p className="text-xs text-muted-foreground">{t("commandCenter")}</p>
          </div>
        </div>

        <nav className="grid gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-lg text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isRailExpanded ? "px-2.5" : "justify-center px-0",
                  view === item.id && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
                title={t(item.labelKey)}
                type="button"
                onClick={() => {
                  setView(item.id);
                }}
              >
                <Icon className="size-4 shrink-0" />
                <span className={cn("truncate", !isRailExpanded && "hidden")}>{t(item.labelKey)}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto grid gap-2">
          <div
            className={cn(
              "grid gap-2 rounded-lg border border-sidebar-border bg-background/35 p-2",
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
            className={cn(
              "flex h-10 items-center gap-3 rounded-lg text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
            <Settings className="size-4 shrink-0" />
            <span className={cn("truncate", !isRailExpanded && "hidden")}>{t("settings")}</span>
          </button>

          <button
            className="flex h-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            title={isRailExpanded ? t("collapseSidebar") : t("expandSidebar")}
            type="button"
            onClick={() => setIsRailExpanded((value) => !value)}
          >
            {isRailExpanded ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t(view)}</p>
            <h2 className="truncate text-sm font-semibold">
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
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive">
                <TriangleAlert className="size-3" />
                {error}
              </span>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          {view === "home" && (
            <HomeView
              actions={actions}
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
              actions={actions}
              data={data}
              selectedTaskId={selectedTaskId}
              setSelectedTaskId={setSelectedTaskId}
            />
          )}
          {view === "projects" && (
            <ProjectsView
              actions={actions}
              data={data}
              selectedDate={selectedDate}
              selectedTaskId={selectedTaskId}
              setSelectedTaskId={setSelectedTaskId}
            />
          )}
          {view === "workspaces" && (
            <WorkspacesView
              actions={actions}
              data={data}
              selectedTaskId={selectedTaskId}
              setSelectedTaskId={setSelectedTaskId}
            />
          )}
          {view === "reminders" && <ReminderCenterView actions={actions} data={data} onOpenTask={onOpenTask} />}
          {view === "settings" && (
            <div className="h-full overflow-auto p-4">
              <SettingsView actions={actions} data={data} />
            </div>
          )}
        </div>
      </div>
      <TaskDetailPane
        actions={actions}
        onClose={() => setSelectedTaskId(null)}
        projects={data.projects}
        reminders={data.reminders}
        settings={data.settings}
        task={view === "settings" ? null : selectedTask}
      />
    </div>
  );
}

export default App;
