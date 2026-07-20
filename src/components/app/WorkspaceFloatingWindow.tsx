import { openPath } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { ChevronDown, ChevronUp, FolderOpen, GripHorizontal, Pin, PinOff, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { openTasks } from "@/data/date";
import type { AppData } from "@/data/types";
import { useTaskPage } from "@/hooks/useTaskPage";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

import { TaskList } from "./TaskList";

type WorkspaceFloatingWindowProps = {
  data: AppData;
  actions: TodoActions;
};

const COLLAPSED_WINDOW_HEIGHT = 96;
const DEFAULT_WINDOW_WIDTH = 380;
const EXPANDED_MIN_HEIGHT = 420;
const FLOATING_MIN_WIDTH = 320;

export function WorkspaceFloatingWindow({ data, actions }: WorkspaceFloatingWindowProps) {
  const { t } = useTranslation();
  const workspace = data.workspaces.find((item) => item.id === data.workspaceId) ?? data.workspaces[0] ?? null;
  const [hiddenTaskIds, setHiddenTaskIds] = useState<Set<string>>(() => new Set());
  const taskPageInput = useMemo(
    () => ({
      workspaceId: data.workspaceId,
      scope: "all" as const,
      sort: "overview" as const,
    }),
    [data.workspaceId],
  );
  const taskPage = useTaskPage({
    actions,
    input: taskPageInput,
    reloadKey: data.tasks,
  });
  const tasks = useMemo(() => taskPage.tasks.filter((task) => !hiddenTaskIds.has(task.id)), [hiddenTaskIds, taskPage.tasks]);
  const openTaskCount = useMemo(
    () => openTasks(data.tasks.filter((task) => !hiddenTaskIds.has(task.id))).length,
    [data.tasks, hiddenTaskIds],
  );
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expandedSizeRef = useRef<{ width: number; height: number } | null>(null);
  const currentWindow = useMemo(() => getCurrentWindow(), []);

  useEffect(() => {
    void currentWindow.isAlwaysOnTop().then(setIsAlwaysOnTop).catch(() => undefined);
    void currentWindow.setMinSize(new LogicalSize(FLOATING_MIN_WIDTH, EXPANDED_MIN_HEIGHT)).catch(() => undefined);
  }, [currentWindow]);

  useEffect(() => {
    document.documentElement.classList.add("floating-window-surface");
    document.body.classList.add("floating-window-surface");

    return () => {
      document.documentElement.classList.remove("floating-window-surface");
      document.body.classList.remove("floating-window-surface");
    };
  }, []);

  const startDragging = () => {
    void currentWindow.startDragging().catch(() => undefined);
  };

  const closeWindow = () => {
    void currentWindow.close().catch(() => currentWindow.destroy());
  };

  const getLogicalWindowSize = async () => {
    const [size, scaleFactor] = await Promise.all([currentWindow.innerSize(), currentWindow.scaleFactor()]);

    return {
      width: size.width / scaleFactor,
      height: size.height / scaleFactor,
    };
  };

  const resizeForCollapsedState = async (collapsed: boolean) => {
    try {
      const size = await getLogicalWindowSize();
      const width = Math.max(size.width, FLOATING_MIN_WIDTH);

      if (collapsed) {
        if (size.height > COLLAPSED_WINDOW_HEIGHT + 24) {
          expandedSizeRef.current = { width, height: size.height };
        }

        await currentWindow.setMinSize(new LogicalSize(FLOATING_MIN_WIDTH, COLLAPSED_WINDOW_HEIGHT));
        await currentWindow.setSize(new LogicalSize(width, COLLAPSED_WINDOW_HEIGHT));
        return;
      }

      const expandedSize = expandedSizeRef.current ?? {
        width: Math.max(size.width, DEFAULT_WINDOW_WIDTH),
        height: EXPANDED_MIN_HEIGHT,
      };

      await currentWindow.setMinSize(new LogicalSize(FLOATING_MIN_WIDTH, EXPANDED_MIN_HEIGHT));
      await currentWindow.setSize(
        new LogicalSize(Math.max(expandedSize.width, FLOATING_MIN_WIDTH), Math.max(expandedSize.height, EXPANDED_MIN_HEIGHT)),
      );
    } catch {
      // The visual collapse still works if the host refuses a resize.
    }
  };

  const toggleCollapsed = () => {
    if (isCollapsed) {
      void resizeForCollapsedState(false).finally(() => setIsCollapsed(false));
      return;
    }

    setIsCollapsed(true);
    window.setTimeout(() => void resizeForCollapsedState(true), 0);
  };

  const toggleAlwaysOnTop = async () => {
    const next = !isAlwaysOnTop;
    setIsAlwaysOnTop(next);

    try {
      await currentWindow.setAlwaysOnTop(next);
    } catch {
      setIsAlwaysOnTop(!next);
    }
  };

  const hideTask = (taskId: string) => {
    setHiddenTaskIds((current) => new Set(current).add(taskId));
  };

  const openFolder = async (path: string) => {
    setError(null);
    try {
      await openPath(path);
    } catch {
      setError(t("openFolderFailed"));
    }
  };

  return (
    <main
      className={cn(
        "flex h-screen flex-col overflow-hidden bg-background text-foreground shadow-xl transition-[background-color,box-shadow] duration-200 ease-[var(--ease-out-quart)]",
        isCollapsed ? "min-h-[96px]" : "min-h-[420px]",
      )}
    >
      <header className="shrink-0 border-b border-border bg-card/50 px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 select-none" onMouseDown={startDragging}>
            <h1 className="flex items-center gap-1.5 truncate text-lg font-semibold">
              <GripHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
              {workspace?.name ?? t("workspaces")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("workspaceSummary", {
                tasks: openTaskCount,
                folders: data.workspaceFolders.length,
              })}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? t("expandFloatingWindow") : t("collapseFloatingWindow")}
              size="icon-lg"
              type="button"
              variant={isCollapsed ? "secondary" : "ghost"}
              title={isCollapsed ? t("expandFloatingWindow") : t("collapseFloatingWindow")}
              onClick={toggleCollapsed}
            >
              {isCollapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
            </Button>
            <Button
              aria-label={isAlwaysOnTop ? t("disableAlwaysOnTop") : t("enableAlwaysOnTop")}
              aria-pressed={isAlwaysOnTop}
              size="icon-lg"
              type="button"
              variant={isAlwaysOnTop ? "secondary" : "ghost"}
              title={isAlwaysOnTop ? t("disableAlwaysOnTop") : t("enableAlwaysOnTop")}
              onClick={() => void toggleAlwaysOnTop()}
            >
              {isAlwaysOnTop ? <Pin aria-hidden="true" /> : <PinOff aria-hidden="true" />}
            </Button>
            <Button aria-label={t("close")} size="icon-lg" type="button" variant="ghost" title={t("close")} onClick={closeWindow}>
              <X aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>

      {!isCollapsed && (
        <div className="motion-pane-content flex min-h-0 flex-1 flex-col">
          <section className="shrink-0 border-b border-border bg-background/35 px-3 py-2">
            {error && <p className="motion-status mb-2 text-xs text-destructive">{error}</p>}
            {data.workspaceFolders.length === 0 ? (
              <p className="motion-status py-2 text-sm text-muted-foreground">{t("emptyFolders")}</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {data.workspaceFolders.map((folder) => (
                  <Button key={folder.id} className="max-w-48 justify-start" size="sm" type="button" variant="secondary" onClick={() => void openFolder(folder.path)}>
                    <FolderOpen />
                    <span className="truncate">{folder.name}</span>
                  </Button>
                ))}
              </div>
            )}
          </section>

          <section className="min-h-0 flex-1 overflow-auto bg-background/35 p-3">
            {taskPage.isLoading ? (
              <div className="motion-status flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border bg-card/35 px-4 text-center text-sm text-muted-foreground">
                {t("loadingTasks")}
              </div>
            ) : taskPage.error && taskPage.tasks.length === 0 ? (
              <div className="motion-status flex min-h-28 items-center justify-center rounded-lg border border-dashed border-destructive/40 bg-destructive/10 px-4 text-center text-sm text-destructive">
                {taskPage.error}
              </div>
            ) : (
              <TaskList
                actions={actions}
                compact
                deleteMode="hide"
                emptyLabel={t("emptyTaskList")}
                onDeleteTask={hideTask}
                projects={data.projects}
                reminders={taskPage.reminders}
                tasks={tasks}
                totalCount={Math.max(taskPage.total - hiddenTaskIds.size, tasks.length)}
                isLoadingMore={taskPage.isLoadingMore}
                loadError={taskPage.error}
                onLoadMore={() => void taskPage.loadMore()}
                windowKey={`${data.workspaceId}:${hiddenTaskIds.size}`}
              />
            )}
          </section>
        </div>
      )}
    </main>
  );
}
