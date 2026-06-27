import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { parseBackupPayload, type BackupSchemaResult } from "@/data/backupSchema";
import type { BackupPayload } from "@/data/types";

type ImportPreviewDialogProps = {
  open: boolean;
  rawPayload: unknown;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: BackupPayload) => void;
};

type PreviewCounts = {
  workspaces: number;
  workspaceFolders: number;
  projects: number;
  tasks: number;
  reminders: number;
  savedViews: number;
  recurringTaskTemplates: number;
};

const emptyCounts: PreviewCounts = {
  workspaces: 0,
  workspaceFolders: 0,
  projects: 0,
  tasks: 0,
  reminders: 0,
  savedViews: 0,
  recurringTaskTemplates: 0,
};

export function ImportPreviewDialog({ open, rawPayload, onOpenChange, onConfirm }: ImportPreviewDialogProps) {
  const { t } = useTranslation();
  const [validation, setValidation] = useState<BackupSchemaResult>({ success: false, error: "—" });
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!open) {
      setIsImporting(false);
      return;
    }
    setValidation(parseBackupPayload(rawPayload));
  }, [open, rawPayload]);

  const data = validation.success ? validation.data : null;
  const counts: PreviewCounts = data
    ? {
        workspaces: data.workspaces.length,
        workspaceFolders: data.workspaceFolders.length,
        projects: data.projects.length,
        tasks: data.tasks.length,
        reminders: data.reminders.length,
        savedViews: data.savedViews.length,
        recurringTaskTemplates: data.recurringTaskTemplates?.length ?? 0,
      }
    : emptyCounts;

  const confirm = () => {
    if (!data) {
      return;
    }
    setIsImporting(true);
    onConfirm(data as BackupPayload);
  };

  const summaryRows: Array<{ label: string; value: number }> = [
    { label: t("importPreviewWorkspaces"), value: counts.workspaces },
    { label: t("importPreviewFolders"), value: counts.workspaceFolders },
    { label: t("importPreviewProjects"), value: counts.projects },
    { label: t("importPreviewTasks"), value: counts.tasks },
    { label: t("importPreviewReminders"), value: counts.reminders },
    { label: t("importPreviewSavedViews"), value: counts.savedViews },
    { label: t("importPreviewRecurring"), value: counts.recurringTaskTemplates },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="motion-dialog-overlay fixed inset-0 z-50 bg-background/65 backdrop-blur-[2px]" />
        <Dialog.Content className="motion-dialog-content fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-32px))] rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-xl outline-none">
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

          {data ? (
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

              <div className="flex justify-end gap-2 pt-1">
                <Button size="lg" type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isImporting}>
                  {t("importPreviewCancel")}
                </Button>
                <Button size="lg" type="button" variant="default" onClick={confirm} disabled={isImporting}>
                  {t("importPreviewConfirm")}
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
