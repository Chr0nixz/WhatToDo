import { Archive, FolderKanban, FolderOpen, Plus } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { NO_PROJECT_ID, getProjectProgress, tasksForProject, visibleProjects } from "@/data/project";
import type { AppData } from "@/data/types";
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
};

const projectColors = ["#4fb8d8", "#8b7cf6", "#ec6f5d", "#6cc083", "#d7a742"];

export function ProjectsView({
  data,
  actions,
  selectedDate,
  selectedTaskId,
  setSelectedTaskId,
}: ProjectsViewProps) {
  const { t } = useTranslation();
  const projects = useMemo(() => visibleProjects(data.projects), [data.projects]);
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? NO_PROJECT_ID);
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [workingFolder, setWorkingFolder] = useState("");
  const [selectedWorkingFolder, setSelectedWorkingFolder] = useState("");
  const [color, setColor] = useState(projectColors[0]);

  const selectedProject =
    selectedProjectId === NO_PROJECT_ID ? null : projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedTasks = tasksForProject(data.tasks, selectedProject?.id ?? null);
  const progress = getProjectProgress(selectedTasks);

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
      return;
    }

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
    setColor(projectColors[0]);
  };

  const chooseFolder = async (onChoose: (path: string) => void) => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "Select project folder",
    });

    if (typeof selected === "string") {
      onChoose(selected);
    }
  };

  const saveSelectedWorkingFolder = async () => {
    if (!selectedProject) {
      return;
    }

    await actions.updateProject(selectedProject.id, {
      workingFolder: selectedWorkingFolder.trim() || null,
    });
  };

  const openSelectedWorkingFolder = async () => {
    const path = selectedProject?.workingFolder?.trim();

    if (path) {
      await openPath(path);
    }
  };

  return (
    <main className="flex h-full min-h-0">
      <aside className="flex min-h-0 w-[320px] shrink-0 flex-col border-r border-border bg-card/45 max-lg:w-[292px]">
        <section className="border-b border-border p-3">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-sm font-semibold">{t("projects")}</h1>
            <span className="text-xs text-muted-foreground">{projects.length}</span>
          </div>
          <div className="space-y-2">
            <ProjectButton
              active={selectedProjectId === NO_PROJECT_ID}
              color="transparent"
              count={tasksForProject(data.tasks, null).length}
              label={t("noProject")}
              onClick={() => setSelectedProjectId(NO_PROJECT_ID)}
            />
            {projects.map((project) => (
              <ProjectButton
                key={project.id}
                active={selectedProjectId === project.id}
                color={project.color}
                count={tasksForProject(data.tasks, project.id).filter((task) => task.status === "todo").length}
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
              size="icon-lg"
              type="button"
              variant="secondary"
              onClick={() => void chooseFolder(setWorkingFolder)}
            >
              <FolderOpen />
            </Button>
          </div>
          <div className="mt-3 flex gap-2">
            {projectColors.map((item) => (
              <button
                key={item}
                aria-label={item}
                className={cn("size-7 rounded-md border border-border ring-offset-background", color === item && "ring-2 ring-ring")}
                style={{ backgroundColor: item }}
                type="button"
                onClick={() => setColor(item)}
              />
            ))}
          </div>
          <Button className="mt-4 w-full" type="submit">
            <Plus />
            {t("createProject")}
          </Button>
        </form>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border bg-background/65 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="flex size-9 items-center justify-center rounded-lg border border-border bg-secondary"
                  style={{ color: selectedProject?.color ?? undefined }}
                >
                  <FolderKanban className="size-4" />
                </span>
                <div>
                  <h2 className="text-xl font-semibold">{selectedProject?.name ?? t("noProject")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedProject?.dueDate ? `${t("projectDue")} ${selectedProject.dueDate}` : t("loose")}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedProject && (
                <Button size="sm" type="button" variant="ghost" onClick={() => void actions.archiveProject(selectedProject.id)}>
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
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric label={t("progress")} value={`${progress.percent}%`} />
            <Metric label={t("completed")} value={`${progress.completed}/${progress.total}`} />
            <Metric label={t("openTasks")} value={`${Math.max(progress.total - progress.completed, 0)}`} />
          </div>
          {selectedProject && (
            <div className="mt-3 rounded-lg border border-border bg-card/50 p-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="selected-project-folder">
                {t("workingFolder")}
              </label>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-1.5">
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
                  onClick={() => void chooseFolder(setSelectedWorkingFolder)}
                >
                  <FolderOpen />
                  {t("chooseFolder")}
                </Button>
                <Button size="sm" type="button" variant="secondary" onClick={() => void saveSelectedWorkingFolder()}>
                  {t("save")}
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
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <TaskList
            actions={actions}
            onSelectTask={setSelectedTaskId}
            projects={data.projects}
            reminders={data.reminders}
            selectedTaskId={selectedTaskId}
            tasks={selectedTasks}
          />
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
      className={cn(
        "flex w-full items-center justify-between rounded-md border border-transparent px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent",
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
