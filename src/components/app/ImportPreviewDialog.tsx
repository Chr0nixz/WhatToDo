import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { parseBackupPayload, type BackupSchemaResult } from "@/data/backupSchema";
import { summarizeImportPreview } from "@/data/importPreview";
import type { AppData, BackupPayload, ImportBackupMode } from "@/data/types";
import { cn } from "@/lib/utils";

type ImportPreviewDialogProps = {
  open: boolean;
  rawPayload: unknown;
  currentData: AppData;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: BackupPayload, mode: ImportBackupMode) => void;
};

export function ImportPreviewDialog({
  open,
  rawPayload,
  currentData,
  onOpenChange,
  onConfirm,
}: ImportPreviewDialogProps) {
  const { t } = useTranslation();
  const [validation, setValidation] = useState<BackupSchemaResult>({ success: false, error: "—" });
  const [isImporting, setIsImporting] = useState(false);
  const [mode, setMode] = useState<ImportBackupMode>("replace");

  useEffect(() => {
    if (!open) {
      setIsImporting(false);
      setMode("replace");
      return;
    }
    setValidation(parseBackupPayload(rawPayload));
  }, [open, rawPayload]);

  const data = validation.success ? validation.data : null;
  const conflict = useMemo(
    () => (data ? summarizeImportPreview(currentData, data as BackupPayload) : null),
    [currentData, data],
  );

  const confirm = () => {
    if (!data) {
      return;
    }
    setIsImporting(true);
    onConfirm(data as BackupPayload, mode);
  };

  const summaryRows: Array<{ label: string; value: number }> = conflict
    ? [
        { label: t("importPreviewWorkspaces"), value: conflict.counts.workspaces },
        { label: t("importPreviewFolders"), value: conflict.counts.workspaceFolders },
        { label: t("importPreviewProjects"), value: conflict.counts.projects },
        { label: t("importPreviewTasks"), value: conflict.counts.tasks },
        { label: t("importPreviewReminders"), value: conflict.counts.reminders },
        { label: t("importPreviewSavedViews"), value: conflict.counts.savedViews },
        { label: t("importPreviewRecurring"), value: conflict.counts.recurringTaskTemplates },
        { label: t("importPreviewAttachments"), value: conflict.counts.attachments },
        { label: t("importPreviewReminderEvents"), value: conflict.counts.reminderEvents },
      ]
    : [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="motion-dialog-overlay fixed inset-0 z-50 bg-background/65 backdrop-blur-[2px]" />
        <Dialog.Content className="motion-dialog-content fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(480px,calc(100vw-32px))] overflow-auto rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-xl outline-none">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold">{t("importPreviewTitle")}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-muted-foreground">
                {t("importPreviewDescription")}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button aria-label={t("close")} size="icon-sm" type="button" variant="ghost" title={t("close")}>
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>

          {data && conflict ? (
            <div className="grid gap-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("importPreviewVersion")}</dt>
                  <dd className="font-medium">v{data.whattodoBackupVersion}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("importPreviewExportedAt")}</dt>
                  <dd className="font-medium tabular-nums">{data.exportedAt.slice(0, 19).replace("T", " ")}</dd>
                </div>
              </dl>

              <div className="grid gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t("importPreviewSummary")}</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {summaryRows.map((row) => (
                    <div key={row.label} className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="tabular-nums">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {mode === "merge" && (
                <div className="grid gap-1.5 rounded-md border border-border bg-muted/40 p-3 text-sm">
                  <p className="text-xs font-medium text-muted-foreground">{t("importConflictSummary")}</p>
                  <p>
                    {t("importConflictOverwriteTasks", { count: conflict.overwrite.tasks })} ·{" "}
                    {t("importConflictNewTasks", { count: conflict.created.tasks })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("importConflictOverwriteOther", {
                      workspaces: conflict.overwrite.workspaces,
                      projects: conflict.overwrite.projects,
                      reminders: conflict.overwrite.reminders,
                      attachments: conflict.overwrite.attachments,
                    })}
                  </p>
                  {conflict.overlappingWorkspaceNames.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("importConflictWorkspaces", { names: conflict.overlappingWorkspaceNames.join(", ") })}
                    </p>
                  )}
                  {conflict.sampleOverwriteTaskTitles.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("importConflictSampleTasks", { titles: conflict.sampleOverwriteTaskTitles.join(", ") })}
                    </p>
                  )}
                </div>
              )}

              {mode === "replace" && (
                <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  {t("importReplaceScopeHint")}
                </p>
              )}

              <fieldset className="grid gap-2">
                <legend className="text-xs font-medium text-muted-foreground">{t("importModeLabel")}</legend>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm",
                    mode === "replace" && "border-ring bg-accent/40",
                  )}
                >
                  <input
                    checked={mode === "replace"}
                    className="mt-0.5"
                    name="import-mode"
                    type="radio"
                    value="replace"
                    onChange={() => setMode("replace")}
                  />
                  <span>
                    <span className="font-medium">{t("importModeReplace")}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{t("importModeReplaceHint")}</span>
                  </span>
                </label>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm",
                    mode === "merge" && "border-ring bg-accent/40",
                  )}
                >
                  <input
                    checked={mode === "merge"}
                    className="mt-0.5"
                    name="import-mode"
                    type="radio"
                    value="merge"
                    onChange={() => setMode("merge")}
                  />
                  <span>
                    <span className="font-medium">{t("importModeMerge")}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{t("importModeMergeHint")}</span>
                  </span>
                </label>
              </fieldset>

              <div className="flex justify-end gap-2 pt-1">
                <Button size="lg" type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isImporting}>
                  {t("importPreviewCancel")}
                </Button>
                <Button size="lg" type="button" variant="default" onClick={confirm} disabled={isImporting}>
                  {mode === "replace" ? t("importPreviewConfirmReplace") : t("importPreviewConfirmMerge")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <div className="grid gap-1">
                  <p className="font-medium">{t("importPreviewInvalid")}</p>
                  <p className="text-xs opacity-80">{validation.error}</p>
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <Button size="lg" type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  {t("importPreviewCancel")}
                </Button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
