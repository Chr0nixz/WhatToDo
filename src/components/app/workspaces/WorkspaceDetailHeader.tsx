import { FolderPlus, MonitorUp, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { TaskSummary, Workspace } from "@/data/types";
import { WorkspaceTaskPickerDialog } from "../WorkspaceTaskPickerDialog";

export interface WorkspaceDetailHeaderProps {
  currentWorkspace: Workspace | null;
  openTasksCount: number;
  workspaceFoldersCount: number;
  availableTasks: TaskSummary[];
  isLoadingAvailableTasks: boolean;
  availableTasksError: string | null;
  workspaceActionError: string | null;
  workspaces: Workspace[];
  onEditWorkspace?: () => void;
  onLoadAvailableTasks: () => Promise<void>;
  onAddExistingTask: (taskId: string) => Promise<void>;
  onOpenFloatingWindow: () => void;
}

export function WorkspaceDetailHeader({
  currentWorkspace,
  openTasksCount,
  workspaceFoldersCount,
  availableTasks,
  isLoadingAvailableTasks,
  availableTasksError,
  workspaceActionError,
  workspaces,
  onEditWorkspace,
  onLoadAvailableTasks,
  onAddExistingTask,
  onOpenFloatingWindow,
}: WorkspaceDetailHeaderProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary"
              style={{ color: currentWorkspace?.color }}
            >
              <FolderPlus className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold">{currentWorkspace?.name ?? t("workspaces")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("workspaceSummary", {
                  tasks: openTasksCount,
                  folders: workspaceFoldersCount,
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
            onAddTask={onAddExistingTask}
            onOpen={onLoadAvailableTasks}
            tasks={availableTasks}
            workspaces={workspaces}
          />
          <Button size="sm" type="button" variant="secondary" onClick={onOpenFloatingWindow}>
            <MonitorUp />
            {t("openFloatingWindow")}
          </Button>
        </div>
      </div>
      {workspaceActionError && (
        <p className="motion-status mt-2 text-xs text-destructive">{workspaceActionError}</p>
      )}
    </>
  );
}
