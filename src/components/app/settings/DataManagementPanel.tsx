import { Download, FolderOpen, Upload, Database } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DataManagementPanelProps {
  isMigratingAttachments: boolean;
  dataState: "idle" | "saved" | "error";
  dataError: string | null;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onExportCsv: () => void;
  onExportIcs: () => void;
  onMigrateAttachments: () => void;
}

export function DataManagementPanel({
  isMigratingAttachments,
  dataState,
  dataError,
  onExportBackup,
  onImportBackup,
  onExportCsv,
  onExportIcs,
  onMigrateAttachments,
}: DataManagementPanelProps) {
  const { t } = useTranslation();

  return (
    <section className="motion-surface rounded-lg border border-border bg-card/65 p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Database className="size-4" />
        </span>
        <div>
          <h3 className="text-lg font-semibold">{t("dataManagement")}</h3>
          <p className="text-sm text-muted-foreground">{t("dataManagementHint")}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" type="button" onClick={onExportBackup}>
          <Download className="size-4" />
          {t("exportBackup")}
        </Button>
        <Button size="lg" type="button" variant="secondary" onClick={onImportBackup}>
          <Upload className="size-4" />
          {t("importBackup")}
        </Button>
        <Button size="lg" type="button" variant="secondary" onClick={onExportCsv}>
          <Download className="size-4" />
          {t("exportCsv")}
        </Button>
        <Button size="lg" type="button" variant="secondary" onClick={onExportIcs}>
          <Download className="size-4" />
          {t("exportIcs")}
        </Button>
        <Button
          disabled={isMigratingAttachments}
          size="lg"
          title={t("migrateAttachmentsHint")}
          type="button"
          variant="secondary"
          onClick={onMigrateAttachments}
        >
          <FolderOpen className="size-4" />
          {isMigratingAttachments ? t("migrateAttachmentsRunning") : t("migrateAttachments")}
        </Button>
      </div>
      {dataState !== "idle" && (
        <p className={cn("motion-status mt-3 text-xs", dataState === "saved" ? "text-success" : "text-destructive")}>
          {dataState === "saved"
            ? dataError ?? t("dataOperationDone")
            : dataError ?? t("operationFailed")}
        </p>
      )}
    </section>
  );
}
