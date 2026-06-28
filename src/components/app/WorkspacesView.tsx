import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { FolderOpen, FolderPlus, MonitorUp, Pencil, Plus, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import { FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { AppData, Task } from "@/data/types";
import { useTaskPage } from "@/hooks/useTaskPage";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

import { TaskList } from "./TaskList";
import { WorkspaceTaskPickerDialog } from "./WorkspaceTaskPickerDialog";

type WorkspacesViewProps = {
  data: AppData;
  actions: TodoActions;
  selectedTaskId: string | null;
  setSelectedTaskId: (taskId: string | null) => void;
  onEditWorkspace?: () => void;
};

const workspaceColors = [
  { labelKey: "accentBlue", value: "#4fb8d8" },
  { labelKey: "accentEmerald", value: "#6cc083" },
  { labelKey: "accentAmber", value: "#d7a742" },
  { labelKey: "accentRose", value: "#ec6f5d" },
  { labelKey: "accentViolet", value: "#8b7cf6" },
];

const folderNameFromPath = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
};

export function WorkspacesView({ data, actions, selectedTaskId, setSelectedTaskId, onEditWorkspace }: WorkspacesViewProps) {
  const { t } = useTranslation();
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceColor, setWorkspaceColor] = useState(workspaceColors[0].value);
  const [folderName, setFolderName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [workspaceActionError, setWorkspaceActionError] = useState<string | null>(null);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [isLoadingAvailableTasks, setIsLoadingAvailableTasks] = useState(false);
  const [availableTasksError, setAvailableTasksError] = useState<string | null>(null);

  const currentWorkspace = useMemo(
    () => data.workspaces.find((workspace) => workspace.id === data.workspaceId) ?? data.workspaces[0] ?? null,
    [data.workspaceId, data.workspaces],
  );
  const openTasks = useMemo(
    () => data.tasks.filter((task) => task.deletedAt === null && (task.status === "todo" || task.status === "in_progress")),
    [data.tasks],
  );
  const taskPageInput = useMemo(
    () => ({
      workspaceId: data.workspaceId,
      scope: "open" as const,
      sort: "overview" as const,
    }),
    [data.workspaceId],
  );
  const taskPage = useTaskPage({
    actions,
    input: taskPageInput,
    reloadKey: data.tasks,
  });
  const loadAvailableTasks = async () => {
    if (!currentWorkspace) {
      return;
    }

    setIsLoadingAvailableTasks(true);
    setAvailableTasksError(null);

    try {
      setAvailableTasks((await actions.loadAvailableTasks(currentWorkspace.id)).filter((task) => task.deletedAt === null));
    } catch {
      setAvailableTasksError(t("loadAvailableTasksFailed"));
    } finally {
      setIsLoadingAvailableTasks(false);
    }
  };

  const chooseFolder = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: t("chooseFolder"),
    });

    if (typeof selected === "string") {
      setFolderPath(selected);
      setFolderName((value) => value || folderNameFromPath(selected));
    }
  };

  const createWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    const name = workspaceName.trim();

    if (!name) {
      setWorkspaceError(t("nameRequired"));
      return;
    }

    setIsCreatingWorkspace(true);
    setWorkspaceError(null);

    try {
      await actions.createWorkspace({ name, color: workspaceColor });
      setWorkspaceName("");
      setWorkspaceColor(workspaceColors[0].value);
      setSelectedTaskId(null);
    } catch {
      setWorkspaceError(t("workspaceCreateFailed"));
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const createFolder = async (event: FormEvent) => {
    event.preventDefault();
    const path = folderPath.trim();

    if (!path) {
      setFolderError(t("pathRequired"));
      return;
    }

    setIsCreatingFolder(true);
    setFolderError(null);

    try {
      await actions.createWorkspaceFolder({
        name: folderName.trim() || folderNameFromPath(path),
        path,
      });
      setFolderName("");
      setFolderPath("");
    } catch {
      setFolderError(t("workspaceFolderCreateFailed"));
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const openFloatingWindow = async () => {
    if (!currentWorkspace) {
      return;
    }

    setWorkspaceActionError(null);
    try {
      await invoke("open_workspace_window", {
        workspaceId: currentWorkspace.id,
        title: currentWorkspace.name,
      });
    } catch {
      setWorkspaceActionError(t("openFloatingWindowFailed"));
    }
  };

  const addExistingTaskToWorkspace = async (taskId: string) => {
    if (!currentWorkspace) {
      return;
    }

    await actions.moveTaskToWorkspace(taskId, currentWorkspace.id);
    setSelectedTaskId(null);
  };

  const openWorkspaceFolder = async (path: string) => {
    setWorkspaceActionError(null);
    try {
      await openPath(path);
    } catch {
      setWorkspaceActionError(t("openFolderFailed"));
    }
  };

  return (
    <main className="flex h-full min-h-0 max-md:flex-col max-md:overflow-auto">
      <aside
        aria-label={t("workspaces")}
        className="flex min-h-0 w-[320px] shrink-0 flex-col border-r border-border bg-card/45 max-lg:w-[292px] max-md:max-h-[360px] max-md:w-full max-md:border-b max-md:border-r-0"
      >
        <section className="border-b border-border p-3">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-sm font-semibold">{t("workspaces")}</h1>
            <span className="text-xs text-muted-foreground">{data.workspaces.length}</span>
          </div>
          <div className="space-y-2">
            {data.workspaces.map((workspace) => (
              <button
                aria-current={workspace.id === data.workspaceId ? "true" : undefined}
                key={workspace.id}
                className={cn(
                  "motion-surface flex w-full items-center justify-between rounded-md border border-transparent px-2.5 py-2 text-left text-sm hover:bg-accent",
                  workspace.id === data.workspaceId && "border-ring bg-accent text-accent-foreground",
                )}
                type="button"
                onClick={() => {
                  setSelectedTaskId(null);
                  void actions.selectWorkspace(workspace.id);
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full border border-border" style={{ backgroundColor: workspace.color }} />
                  <span className="truncate">{workspace.name}</span>
                </span>
                {workspace.id === data.workspaceId && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{t("active")}</span>
                )}
              </button>
            ))}
          </div>
        </section>

        <form className="p-3" onSubmit={createWorkspace}>
          <h2 className="mb-3 text-sm font-semibold">{t("createWorkspace")}</h2>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="workspace-name">
            {t("workspaceName")}
          </label>
          <input
            id="workspace-name"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
          />
          <div className="mt-3 flex gap-2">
            {workspaceColors.map((item) => (
              <button
                key={item.value}
                aria-label={t(item.labelKey)}
                aria-pressed={workspaceColor === item.value}
                className={cn(
                  "size-7 rounded-md border border-border ring-offset-background transition-[box-shadow,border-color] duration-150 ease-[var(--ease-out-quart)]",
                  workspaceColor === item.value && "ring-2 ring-ring",
                )}
                style={{ backgroundColor: item.value }}
                type="button"
                onClick={() => setWorkspaceColor(item.value)}
              />
            ))}
          </div>
          <Button className="mt-4 w-full" disabled={isCreatingWorkspace} type="submit">
            <Plus />
            {isCreatingWorkspace ? t("creating") : t("createWorkspace")}
          </Button>
          {workspaceError && <p className="mt-2 text-xs text-destructive">{workspaceError}</p>}
        </form>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border bg-background/65 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              {currentWorkspace && (
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t("currentWorkspace")}</p>
              )}
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary"
                  style={{ color: currentWorkspace?.color }}
                >
                  <FolderPlus className="size-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-semibold">{currentWorkspace?.name ?? t("workspaces")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t("workspaceSummary", {
                      tasks: openTasks.length,
                      folders: data.workspaceFolders.length,
                    })}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {onEditWorkspace && (
                <Button size="sm" type="button" variant="secondary" onClick={onEditWorkspace}>
                  <Pencil />
                  {t("editWorkspace")}
                </Button>
              )}
              <WorkspaceTaskPickerDialog
                error={availableTasksError}
                isLoading={isLoadingAvailableTasks}
                onAddTask={addExistingTaskToWorkspace}
                onOpen={loadAvailableTasks}
                tasks={availableTasks}
                workspaces={data.workspaces}
              />
              <Button size="sm" type="button" variant="secondary" onClick={() => void openFloatingWindow()}>
                <MonitorUp />
                {t("openFloatingWindow")}
              </Button>
            </div>
          </div>
          {workspaceActionError && <p className="motion-status mt-2 text-xs text-destructive">{workspaceActionError}</p>}

          <form className="mt-4 grid grid-cols-[minmax(120px,180px)_minmax(0,1fr)_40px_auto] gap-2 max-xl:grid-cols-2 max-sm:grid-cols-1" onSubmit={createFolder}>
            <label className="sr-only" htmlFor="workspace-folder-name">
              {t("folderName")}
            </label>
            <input
              id="workspace-folder-name"
              className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
              placeholder={t("folderName")}
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
            />
            <label className="sr-only" htmlFor="workspace-folder-path">
              {t("workingFolder")}
            </label>
            <input
              id="workspace-folder-path"
              className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
              placeholder="D:\\Projects\\..."
              value={folderPath}
              onChange={(event) => setFolderPath(event.target.value)}
            />
            <Button
              aria-label={t("chooseFolder")}
              disabled={isCreatingFolder}
              size="icon-lg"
              title={t("chooseFolder")}
              type="button"
              variant="secondary"
              onClick={() => void chooseFolder()}
            >
              <FolderOpen aria-hidden="true" />
            </Button>
            <Button disabled={isCreatingFolder} type="submit">
              <Plus />
              {isCreatingFolder ? t("adding") : t("addFolder")}
            </Button>
            {folderError && <p className="col-span-full text-xs text-destructive">{folderError}</p>}
          </form>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,320px)_minmax(0,1fr)] overflow-hidden max-xl:grid-cols-1 max-md:overflow-auto">
          <section className="min-h-0 overflow-auto border-r border-border p-4 max-xl:border-b max-xl:border-r-0">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("commonFolders")}</h3>
              <span className="text-xs text-muted-foreground">{data.workspaceFolders.length}</span>
            </div>
            {data.workspaceFolders.length === 0 ? (
              <div className="motion-status flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border bg-card/35 px-4 text-center text-sm text-muted-foreground">
                {t("emptyFolders")}
              </div>
            ) : (
              <div className="motion-list space-y-2">
                {data.workspaceFolders.map((folder, index) => (
                  <div
                    key={folder.id}
                    className="motion-surface grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-border bg-card/70 px-3 py-2"
                    style={{ "--motion-index": index } as CSSProperties}
                  >
                    <button className="min-w-0 text-left" type="button" onClick={() => void openWorkspaceFolder(folder.path)}>
                      <p className="truncate text-sm font-medium">{folder.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{folder.path}</p>
                    </button>
                    <Button
                      aria-label={t("openFolder")}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      title={t("openFolder")}
                      onClick={() => void openWorkspaceFolder(folder.path)}
                    >
                      <FolderOpen aria-hidden="true" />
                    </Button>
                    <Button
                      aria-label={t("delete")}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      title={t("delete")}
                      onClick={() => {
                        setWorkspaceActionError(null);
                        void actions.deleteWorkspaceFolder(folder.id).catch(() => setWorkspaceActionError(t("workspaceFolderCreateFailed")));
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="min-h-0 overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("workspaceTasks")}</h3>
              <span className="text-xs text-muted-foreground">{openTasks.length}</span>
            </div>
            {taskPage.isLoading ? (
              <div className="motion-status flex min-h-36 items-center justify-center rounded-lg border border-dashed border-border bg-card/35 px-6 text-center text-sm text-muted-foreground">
                {t("loadingTasks")}
              </div>
            ) : taskPage.error && taskPage.tasks.length === 0 ? (
              <div className="motion-status flex min-h-36 items-center justify-center rounded-lg border border-dashed border-destructive/40 bg-destructive/10 px-6 text-center text-sm text-destructive">
                {taskPage.error}
              </div>
            ) : (
              <TaskList
                actions={actions}
                emptyLabel={t("emptyTaskList")}
                onSelectTask={setSelectedTaskId}
                projects={data.projects}
                reminders={taskPage.reminders}
                selectedTaskId={selectedTaskId}
                tasks={taskPage.tasks}
                totalCount={taskPage.total}
                isLoadingMore={taskPage.isLoadingMore}
                loadError={taskPage.error}
                onLoadMore={() => void taskPage.loadMore()}
                windowKey={data.workspaceId}
              />
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
