import { Archive, FolderKanban, FolderOpen, Pencil, Plus } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { accentSwatches, defaultAccentSwatch } from "@/data/accentSwatches";
import { formatTaskDate } from "@/data/dateFormat";
import { NO_PROJECT_ID, getProjectProgress, visibleProjects } from "@/data/project";
import type { AppData } from "@/data/types";
import { useTaskPage } from "@/hooks/useTaskPage";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

import { TaskCreateDialog } from "./TaskCreateDialog";
import { TaskList } from "./TaskList";

type ProjectsViewProps = {
  data: AppData;
  actions: TodoActions;
  selectedDate: string;
  selectedTaskId: string | null;
  setSelectedTaskId: (taskId: string | null) => void;
  initialProjectId?: string | null;
  onRequestEditProject?: (projectId: string) => void;
};

const projectColors = accentSwatches;

export function ProjectsView({
  data,
  actions,
  selectedDate,
  selectedTaskId,
  setSelectedTaskId,
  initialProjectId = null,
  onRequestEditProject,
}: ProjectsViewProps) {
  const { i18n, t } = useTranslation();
  const projects = useMemo(() => visibleProjects(data.projects), [data.projects]);
  const tasksByProjectId = useMemo(() => {
    const grouped = new Map<string, typeof data.tasks>();

    for (const task of data.tasks) {
      if (task.deletedAt !== null) {
        continue;
      }

      const key = task.projectId ?? NO_PROJECT_ID;
      const tasks = grouped.get(key) ?? [];
      tasks.push(task);
      grouped.set(key, tasks);
    }

    return grouped;
  }, [data.tasks]);
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? NO_PROJECT_ID);

  useEffect(() => {
    if (initialProjectId) {
      setSelectedProjectId(initialProjectId);
    }
  }, [initialProjectId]);
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [workingFolder, setWorkingFolder] = useState("");
  const [selectedWorkingFolder, setSelectedWorkingFolder] = useState("");
  const [color, setColor] = useState(defaultAccentSwatch);
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingFolder, setIsSavingFolder] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [folderSaveState, setFolderSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [projectActionError, setProjectActionError] = useState<string | null>(null);

  const selectedProject =
    selectedProjectId === NO_PROJECT_ID ? null : projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedTasks = tasksByProjectId.get(selectedProject?.id ?? NO_PROJECT_ID) ?? [];
  const progress = getProjectProgress(selectedTasks);
  const taskPageInput = useMemo(
    () => ({
      workspaceId: data.workspaceId,
      scope: "all" as const,
      projectId: selectedProject?.id ?? "none",
      sort: "overview" as const,
    }),
    [data.workspaceId, selectedProject?.id],
  );
  const taskPage = useTaskPage({
    actions,
    input: taskPageInput,
    reloadKey: data.tasks,
  });

  useEffect(() => {
    setSelectedTaskId(null);
    setSelectedWorkingFolder(selectedProject?.workingFolder ?? "");
  }, [selectedProjectId, setSelectedTaskId]);

  useEffect(() => {
    setSelectedWorkingFolder(selectedProject?.workingFolder ?? "");
  }, [selectedProject?.workingFolder]);

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    const nextName = name.trim();

    if (!nextName) {
      setFormError(t("nameRequired"));
      return;
    }

    setIsCreating(true);
    setFormError(null);

    try {
      const nextData = await actions.createProject({
        name: nextName,
        color,
        dueDate: dueDate || null,
        workingFolder: workingFolder.trim() || null,
      });
      const created = nextData.projects.find((project) => project.name === nextName && project.color === color);
      if (created) {
        setSelectedProjectId(created.id);
      }

      setName("");
      setDueDate("");
      setWorkingFolder("");
      setColor(defaultAccentSwatch);
    } catch {
      setFormError(t("projectCreateFailed"));
    } finally {
      setIsCreating(false);
    }
  };

  const chooseFolder = async (onChoose: (path: string) => void) => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: t("selectProjectFolder"),
    });

    if (typeof selected === "string") {
      onChoose(selected);
    }
  };

  const saveSelectedWorkingFolder = async () => {
    if (!selectedProject) {
      return;
    }

    setIsSavingFolder(true);
    setFolderSaveState("idle");

    try {
      await actions.updateProject(selectedProject.id, {
        workingFolder: selectedWorkingFolder.trim() || null,
      });
      setFolderSaveState("saved");
    } catch {
      setFolderSaveState("error");
    } finally {
      setIsSavingFolder(false);
    }
  };

  const openSelectedWorkingFolder = async () => {
    const path = selectedProject?.workingFolder?.trim();

    if (path) {
      try {
        await openPath(path);
        setProjectActionError(null);
      } catch {
        setProjectActionError(t("openFolderFailed"));
      }
    }
  };

  return (
    <main className="flex h-full min-h-0 max-md:flex-col max-md:overflow-auto">
      <aside
        aria-label={t("projects")}
        className="flex min-h-0 w-[320px] shrink-0 flex-col border-r border-border bg-card/50 max-lg:w-[292px] max-md:max-h-[360px] max-md:w-full max-md:border-b max-md:border-r-0"
      >
        <section className="border-b border-border p-3">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-sm font-semibold">{t("projects")}</h1>
            <span className="text-xs text-muted-foreground">{projects.length}</span>
          </div>
          <div className="space-y-2">
            <ProjectButton
              active={selectedProjectId === NO_PROJECT_ID}
              color="transparent"
              count={tasksByProjectId.get(NO_PROJECT_ID)?.length ?? 0}
              label={t("noProject")}
              onClick={() => setSelectedProjectId(NO_PROJECT_ID)}
            />
            {projects.map((project) => (
              <ProjectButton
                key={project.id}
                active={selectedProjectId === project.id}
                color={project.color}
                count={(tasksByProjectId.get(project.id) ?? []).filter((task) => task.status === "todo" || task.status === "in_progress").length}
                label={project.name}
                onClick={() => setSelectedProjectId(project.id)}
              />
            ))}
          </div>
        </section>

        <form className="p-3" onSubmit={createProject}>
          <h2 className="mb-3 text-sm font-semibold">{t("createProject")}</h2>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="project-name">
            {t("projectName")}
          </label>
          <input
            id="project-name"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <label className="mb-1 mt-3 block text-xs text-muted-foreground" htmlFor="project-due">
            {t("projectDue")}
          </label>
          <input
            id="project-due"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
          <label className="mb-1 mt-3 block text-xs text-muted-foreground" htmlFor="project-folder">
            {t("workingFolder")}
          </label>
          <div className="flex gap-1.5">
            <input
              id="project-folder"
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
              value={workingFolder}
              onChange={(event) => setWorkingFolder(event.target.value)}
            />
            <Button
              aria-label={t("chooseFolder")}
              size="icon-lg"
              title={t("chooseFolder")}
              type="button"
              variant="secondary"
              onClick={() => void chooseFolder(setWorkingFolder)}
            >
              <FolderOpen aria-hidden="true" />
            </Button>
          </div>
          <div className="mt-3 flex gap-2">
            {projectColors.map((item) => (
              <button
                key={item.value}
                aria-label={t(item.labelKey)}
                aria-pressed={color === item.value}
                className={cn(
                  "size-7 rounded-md border border-border ring-offset-background transition-[box-shadow,border-color] duration-150 ease-[var(--ease-out-quart)]",
                  color === item.value && "ring-2 ring-ring",
                )}
                style={{ backgroundColor: item.value }}
                type="button"
                onClick={() => setColor(item.value)}
              />
            ))}
          </div>
          <Button className="mt-4 w-full" disabled={isCreating} type="submit">
            <Plus />
            {isCreating ? t("creating") : t("createProject")}
          </Button>
          {formError && <p className="mt-2 text-xs text-destructive">{formError}</p>}
        </form>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border bg-background/65 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="flex size-9 items-center justify-center rounded-lg border border-border bg-secondary"
                  style={{ color: selectedProject?.color ?? undefined }}
                >
                  <FolderKanban className="size-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold">{selectedProject?.name ?? t("noProject")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedProject?.dueDate ? `${t("projectDue")} ${formatTaskDate(selectedProject.dueDate, i18n.language)}` : t("loose")}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {selectedProject && onRequestEditProject && (
                <Button size="sm" type="button" variant="secondary" onClick={() => onRequestEditProject(selectedProject.id)}>
                  <Pencil />
                  {t("editProject")}
                </Button>
              )}
              {selectedProject && (
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setProjectActionError(null);
                    void actions.archiveProject(selectedProject.id).catch(() => setProjectActionError(t("projectUpdateFailed")));
                  }}
                >
                  <Archive />
                  {t("archive")}
                </Button>
              )}
              <TaskCreateDialog
                actions={actions}
                defaultDate={selectedProject?.dueDate ?? selectedDate}
                defaultProjectId={selectedProject?.id ?? null}
                projects={projects}
                settings={data.settings}
              />
            </div>
          </div>
          {projectActionError && <p className="motion-status mt-2 text-xs text-destructive">{projectActionError}</p>}
          <p className="mt-3 text-sm text-muted-foreground">
            {t("progress")} {progress.percent}% · {t("completed")} {progress.completed}/{progress.total} · {t("openTasks")}{" "}
            {Math.max(progress.total - progress.completed, 0)}
          </p>
          {selectedProject && (
            <div className="mt-3 rounded-lg border border-border bg-card/50 p-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="selected-project-folder">
                {t("workingFolder")}
              </label>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-1.5 max-lg:grid-cols-2 max-sm:grid-cols-1">
                <input
                  id="selected-project-folder"
                  className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
                  placeholder="D:\\Projects\\..."
                  value={selectedWorkingFolder}
                  onChange={(event) => setSelectedWorkingFolder(event.target.value)}
                />
                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  disabled={isSavingFolder}
                  onClick={() => void chooseFolder(setSelectedWorkingFolder)}
                >
                  <FolderOpen />
                  {t("chooseFolder")}
                </Button>
                <Button disabled={isSavingFolder} size="sm" type="button" variant="secondary" onClick={() => void saveSelectedWorkingFolder()}>
                  {isSavingFolder ? t("saving") : t("save")}
                </Button>
                <Button
                  disabled={!selectedProject.workingFolder}
                  size="sm"
                  type="button"
                  onClick={() => void openSelectedWorkingFolder()}
                >
                  {t("openFolder")}
                </Button>
              </div>
              {folderSaveState !== "idle" && (
                <p className={cn("motion-status mt-2 text-xs", folderSaveState === "saved" ? "text-success" : "text-destructive")}>
                  {folderSaveState === "saved" ? t("saved") : t("projectUpdateFailed")}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
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
              emptyHint={t("emptyProjectsHint")}
              onSelectTask={setSelectedTaskId}
              projects={data.projects}
              reminders={taskPage.reminders}
              selectedTaskId={selectedTaskId}
              tasks={taskPage.tasks}
              totalCount={taskPage.total}
              isLoadingMore={taskPage.isLoadingMore}
              loadError={taskPage.error}
              onLoadMore={() => void taskPage.loadMore()}
              windowKey={selectedProjectId}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function ProjectButton({
  active,
  color,
  count,
  label,
  onClick,
}: {
  active: boolean;
  color: string;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "motion-surface flex w-full items-center justify-between rounded-md border border-transparent px-2.5 py-2 text-left text-sm hover:bg-accent",
        active && "border-ring bg-accent text-accent-foreground",
      )}
      type="button"
      onClick={onClick}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full border border-border" style={{ backgroundColor: color }} />
        <span className="truncate">{label}</span>
      </span>
      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{count}</span>
    </button>
  );
}

