import { Plus } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { revealLocalPath } from "@/lib/openLocalPath";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { defaultAccentSwatch } from "@/data/accentSwatches";
import { NO_PROJECT_ID, getProjectProgress, visibleProjects } from "@/data/project";
import type { AppData, TaskSummary } from "@/data/types";
import { useTaskPage } from "@/hooks/useTaskPage";
import { useTasksRevision } from "@/hooks/useTodoStore";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

import { TaskList } from "./TaskList";
import { ProjectCreateForm } from "./projects/ProjectCreateForm";
import { ProjectDetailHeader } from "./projects/ProjectDetailHeader";

type ProjectsViewProps = {
  data: AppData;
  actions: TodoActions;
  selectedDate: string;
  selectedTaskId: string | null;
  setSelectedTaskId: (taskId: string | null) => void;
  initialProjectId?: string | null;
  onRequestEditProject?: (projectId: string) => void;
};

export function ProjectsView({
  data,
  actions,
  selectedDate,
  selectedTaskId,
  setSelectedTaskId,
  initialProjectId = null,
  onRequestEditProject,
}: ProjectsViewProps) {
  const { t } = useTranslation();
  const tasksRevision = useTasksRevision();
  const { tasks: allTasks, projects: rawProjects } = data;
  const projects = useMemo(() => visibleProjects(rawProjects), [rawProjects]);
  const tasksByProjectId = useMemo(() => {
    const grouped = new Map<string, TaskSummary[]>();

    for (const task of allTasks) {
      if (task.deletedAt !== null) {
        continue;
      }

      const key = task.projectId ?? NO_PROJECT_ID;
      const tasks = grouped.get(key) ?? [];
      tasks.push(task);
      grouped.set(key, tasks);
    }

    return grouped;
  }, [allTasks]);
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
  const [showCreateForm, setShowCreateForm] = useState(false);
  const skipClearSelectionRef = useRef(true);
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
    reloadKey: tasksRevision,
  });

  useEffect(() => {
    if (skipClearSelectionRef.current) {
      skipClearSelectionRef.current = false;
      return;
    }
    setSelectedTaskId(null);
    setSelectedWorkingFolder(selectedProject?.workingFolder ?? "");
  }, [selectedProjectId, selectedProject?.workingFolder, setSelectedTaskId]);

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
      setShowCreateForm(false);
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
        await revealLocalPath(path);
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

        <div className="p-3">
          <Button
            aria-expanded={showCreateForm}
            className="w-full"
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => setShowCreateForm((open) => !open)}
          >
            <Plus />
            {t("createProject")}
          </Button>
          {showCreateForm && (
            <ProjectCreateForm
              color={color}
              dueDate={dueDate}
              formError={formError}
              isCreating={isCreating}
              name={name}
              onChooseFolder={() => void chooseFolder(setWorkingFolder)}
              onColorChange={setColor}
              onDueDateChange={setDueDate}
              onNameChange={setName}
              onSubmit={createProject}
              onWorkingFolderChange={setWorkingFolder}
              workingFolder={workingFolder}
            />
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <ProjectDetailHeader
          actions={actions}
          folderSaveState={folderSaveState}
          isSavingFolder={isSavingFolder}
          onArchiveProject={() => {
            if (!selectedProject) return;
            setProjectActionError(null);
            void actions
              .archiveProject(selectedProject.id)
              .catch(() => setProjectActionError(t("projectUpdateFailed")));
          }}
          onChooseFolder={() => void chooseFolder(setSelectedWorkingFolder)}
          onOpenFolder={() => void openSelectedWorkingFolder()}
          onRequestEditProject={onRequestEditProject}
          onSaveFolder={() => void saveSelectedWorkingFolder()}
          onSelectedWorkingFolderChange={setSelectedWorkingFolder}
          progress={progress}
          projectActionError={projectActionError}
          projects={projects}
          selectedDate={selectedDate}
          selectedProject={selectedProject}
          selectedWorkingFolder={selectedWorkingFolder}
          settings={data.settings}
        />

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

