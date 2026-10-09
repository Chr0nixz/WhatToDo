import { ArchiveRestore } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatTaskDate } from "@/data/dateFormat";
import type { RecoveryItems } from "@/data/types";
import { RecoveryGroup } from "./RecoveryGroup";

export interface RecoveryCenterPanelProps {
  recoveryState: "loading" | "ready" | "error";
  recoveryItems: RecoveryItems;
  onRestoreTask: (id: string) => void;
  onRestoreFolder: (id: string) => void;
  onRestoreWorkspace: (id: string) => void;
  onUnarchiveProject: (id: string) => void;
}

export function RecoveryCenterPanel({
  recoveryState,
  recoveryItems,
  onRestoreTask,
  onRestoreFolder,
  onRestoreWorkspace,
  onUnarchiveProject,
}: RecoveryCenterPanelProps) {
  const { i18n, t } = useTranslation();

  return (
    <section className="motion-surface rounded-lg border border-border bg-card/65 p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <ArchiveRestore className="size-4" />
        </span>
        <div>
          <h3 className="text-lg font-semibold">{t("recoveryCenter")}</h3>
          <p className="text-sm text-muted-foreground">{t("recoveryCenterHint")}</p>
        </div>
      </div>
      {recoveryState === "loading" ? (
        <p className="motion-status rounded-md border border-dashed border-border bg-background/50 p-3 text-sm text-muted-foreground">
          {t("loadingRecovery")}
        </p>
      ) : recoveryState === "error" ? (
        <p className="motion-status rounded-md border border-dashed border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {t("loadRecoveryFailed")}
        </p>
      ) : (
        <div className="grid gap-3">
          <RecoveryGroup
            emptyLabel={t("emptyDeletedTasks")}
            items={recoveryItems.deletedTasks.map((task) => ({
              id: task.id,
              title: task.title,
              meta: formatTaskDate(task.dueDate, i18n.language),
            }))}
            title={t("deletedTasks")}
            onRestore={async (id) => onRestoreTask(id)}
          />
          <RecoveryGroup
            emptyLabel={t("emptyDeletedFolders")}
            items={recoveryItems.deletedWorkspaceFolders.map((folder) => ({
              id: folder.id,
              title: folder.name,
              meta: folder.path,
            }))}
            title={t("deletedFolders")}
            onRestore={async (id) => onRestoreFolder(id)}
          />
          <RecoveryGroup
            emptyLabel={t("emptyDeletedWorkspaces")}
            items={recoveryItems.deletedWorkspaces.map((workspace) => ({
              id: workspace.id,
              title: workspace.name,
              meta: workspace.color,
            }))}
            title={t("deletedWorkspaces")}
            onRestore={async (id) => onRestoreWorkspace(id)}
          />
          <RecoveryGroup
            emptyLabel={t("emptyArchivedProjects")}
            items={recoveryItems.archivedProjects.map((project) => ({
              id: project.id,
              title: project.name,
              meta: project.color,
            }))}
            title={t("archivedProjects")}
            onRestore={async (id) => onUnarchiveProject(id)}
          />
        </div>
      )}
    </section>
  );
}
