import { openPath } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FolderOpen, GripHorizontal, MonitorUp, Pin, PinOff, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { openTasks, sortTasks } from "@/data/date";
import type { AppData } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

import { TaskList } from "./TaskList";

type WorkspaceFloatingWindowProps = {
  data: AppData;
  actions: TodoActions;
};

export function WorkspaceFloatingWindow({ data, actions }: WorkspaceFloatingWindowProps) {
  const { t } = useTranslation();
  const workspace = data.workspaces.find((item) => item.id === data.workspaceId) ?? data.workspaces[0] ?? null;
  const [hiddenTaskIds, setHiddenTaskIds] = useState<Set<string>>(() => new Set());
  const tasks = useMemo(
    () => sortTasks(data.tasks.filter((task) => task.deletedAt === null && !hiddenTaskIds.has(task.id))),
    [data.tasks, hiddenTaskIds],
  );
  const openTaskCount = useMemo(() => openTasks(tasks).length, [tasks]);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);
  const currentWindow = useMemo(() => getCurrentWindow(), []);

  useEffect(() => {
    void currentWindow.isAlwaysOnTop().then(setIsAlwaysOnTop).catch(() => undefined);
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

  return (
    <main className="flex h-screen min-h-[420px] flex-col overflow-hidden bg-background/78 text-foreground shadow-2xl backdrop-blur-md">
      <header className="shrink-0 border-b border-border/70 bg-card/50 px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 select-none" onMouseDown={startDragging}>
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              <MonitorUp className="size-3" />
              {t("floatingWindow")}
              <GripHorizontal className="size-3" />
            </p>
            <h1 className="mt-1 truncate text-lg font-semibold">{workspace?.name ?? t("workspaces")}</h1>
            <p className="text-xs text-muted-foreground">
              {t("workspaceSummary", {
                tasks: openTaskCount,
                folders: data.workspaceFolders.length,
              })}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              aria-pressed={isAlwaysOnTop}
              size="icon-lg"
              type="button"
              variant={isAlwaysOnTop ? "secondary" : "ghost"}
              title={isAlwaysOnTop ? t("disableAlwaysOnTop") : t("enableAlwaysOnTop")}
              onClick={() => void toggleAlwaysOnTop()}
            >
              {isAlwaysOnTop ? <Pin /> : <PinOff />}
            </Button>
            <Button size="icon-lg" type="button" variant="ghost" title="Close" onClick={closeWindow}>
              <X />
            </Button>
          </div>
        </div>
      </header>

      <section className="shrink-0 border-b border-border/75 bg-background/35 px-3 py-2">
        {data.workspaceFolders.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t("emptyFolders")}</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {data.workspaceFolders.map((folder) => (
              <Button key={folder.id} className="max-w-48 justify-start" size="sm" type="button" variant="secondary" onClick={() => void openPath(folder.path)}>
                <FolderOpen />
                <span className="truncate">{folder.name}</span>
              </Button>
            ))}
          </div>
        )}
      </section>

      <section className="min-h-0 flex-1 overflow-auto bg-background/25 p-3">
        <TaskList
          actions={actions}
          compact
          deleteMode="hide"
          onDeleteTask={hideTask}
          projects={data.projects}
          reminders={data.reminders}
          tasks={tasks}
        />
      </section>
    </main>
  );
}
