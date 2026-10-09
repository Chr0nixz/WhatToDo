import { Archive, FolderKanban, FolderOpen, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { formatTaskDate } from "@/data/dateFormat";
import type { Project } from "@/data/types";
import { TaskCreateDialog } from "../TaskCreateDialog";
import type { TodoActions } from "@/hooks/useTodos";
import type { AppData } from "@/data/types";

export interface ProjectDetailHeaderProps {
  selectedProject: Project | null;
  projects: Project[];
  actions: TodoActions;
  settings: AppData["settings"];
  selectedDate: string;
  progress: { total: number; completed: number; percent: number };
  projectActionError: string | null;
  selectedWorkingFolder: string;
  isSavingFolder: boolean;
  folderSaveState: "idle" | "saved" | "error";
  onRequestEditProject?: (projectId: string) => void;
  onArchiveProject: () => void;
  onSelectedWorkingFolderChange: (val: string) => void;
  onChooseFolder: () => void;
  onSaveFolder: () => void;
  onOpenFolder: () => void;
}

export function ProjectDetailHeader({
  selectedProject,
  projects,
  actions,
  settings,
  selectedDate,
  progress,
  projectActionError,
  selectedWorkingFolder,
  isSavingFolder,
  folderSaveState,
  onRequestEditProject,
  onArchiveProject,
  onSelectedWorkingFolderChange,
  onChooseFolder,
  onSaveFolder,
  onOpenFolder,
}: ProjectDetailHeaderProps) {
  const { i18n, t } = useTranslation();

  return (
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
                {selectedProject?.dueDate
                  ? `${t("projectDue")} ${formatTaskDate(selectedProject.dueDate, i18n.language)}`
                  : t("loose")}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {selectedProject && onRequestEditProject && (
            <Button
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => onRequestEditProject(selectedProject.id)}
            >
              <Pencil />
              {t("editProject")}
            </Button>
          )}
          {selectedProject && (
            <Button size="sm" type="button" variant="ghost" onClick={onArchiveProject}>
              <Archive />
              {t("archive")}
            </Button>
          )}
          <TaskCreateDialog
            actions={actions}
            defaultDate={selectedProject?.dueDate ?? selectedDate}
            defaultProjectId={selectedProject?.id ?? null}
            projects={projects}
            settings={settings}
          />
        </div>
      </div>
      {projectActionError && (
        <p className="motion-status mt-2 text-xs text-destructive">{projectActionError}</p>
      )}
      <p className="mt-3 text-sm text-muted-foreground">
        {t("progress")} {progress.percent}% · {t("completed")} {progress.completed}/{progress.total} ·{" "}
        {t("openTasks")} {Math.max(progress.total - progress.completed, 0)}
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
              onChange={(event) => onSelectedWorkingFolderChange(event.target.value)}
            />
            <Button
              size="sm"
              type="button"
              variant="secondary"
              disabled={isSavingFolder}
              onClick={onChooseFolder}
            >
              <FolderOpen />
              {t("chooseFolder")}
            </Button>
            <Button
              size="sm"
              type="button"
              variant="secondary"
              disabled={isSavingFolder}
              onClick={onSaveFolder}
            >
              {isSavingFolder ? t("saving") : t("save")}
            </Button>
            <Button
              size="sm"
              type="button"
              disabled={!selectedProject.workingFolder || isSavingFolder}
              onClick={onOpenFolder}
            >
              {t("openFolder")}
            </Button>
          </div>
          {folderSaveState !== "idle" && (
            <p
              className={
                folderSaveState === "saved"
                  ? "motion-status mt-2 text-xs text-success"
                  : "motion-status mt-2 text-xs text-destructive"
              }
            >
              {folderSaveState === "saved" ? t("saved") : t("operationFailed")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
