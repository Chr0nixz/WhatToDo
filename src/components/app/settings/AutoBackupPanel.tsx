import { FolderOpen, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { AutoBackupConfig } from "@/hooks/useAutoBackup";
import { loadAutoBackupLastError } from "@/hooks/useAutoBackup";
import { cn } from "@/lib/utils";
import { ToggleRow } from "./ToggleRow";

export interface AutoBackupPanelProps {
  autoBackup: AutoBackupConfig;
  autoBackupState: "idle" | "settings_saved" | "backup_done" | "error";
  autoBackupFeedback: string | null;
  onUpdateAutoBackup: (partial: Partial<AutoBackupConfig>) => void;
  onChooseFolder: () => void;
  onRunNow: () => void;
}

export function AutoBackupPanel({
  autoBackup,
  autoBackupState,
  autoBackupFeedback,
  onUpdateAutoBackup,
  onChooseFolder,
  onRunNow,
}: AutoBackupPanelProps) {
  const { t } = useTranslation();

  return (
    <section className="motion-surface rounded-lg border border-border bg-card/65 p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <RotateCw className="size-4" />
        </span>
        <div>
          <h3 className="text-lg font-semibold">{t("autoBackup")}</h3>
          <p className="text-sm text-muted-foreground">{t("autoBackupHint")}</p>
        </div>
      </div>
      <div className="grid gap-3">
        <ToggleRow
          checked={autoBackup.enabled}
          label={t("autoBackupEnabled")}
          onClick={() => onUpdateAutoBackup({ enabled: !autoBackup.enabled })}
        />
        <label
          className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-md bg-background/50 px-3 py-2 text-sm max-sm:grid-cols-1"
          htmlFor="settings-auto-backup-interval"
        >
          <span>
            <span className="block font-medium">{t("autoBackupInterval")}</span>
            <span className="text-xs text-muted-foreground">{t("hours")}</span>
          </span>
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring disabled:opacity-50"
            disabled={!autoBackup.enabled}
            id="settings-auto-backup-interval"
            min={1}
            step={1}
            type="number"
            value={autoBackup.intervalHours}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isFinite(parsed) && parsed >= 1) {
                onUpdateAutoBackup({ intervalHours: Math.floor(parsed) });
              }
            }}
          />
        </label>
        <label
          className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-md bg-background/50 px-3 py-2 text-sm max-sm:grid-cols-1"
          htmlFor="settings-auto-backup-retention-count"
        >
          <span>
            <span className="block font-medium">{t("autoBackupRetentionCount")}</span>
            <span className="text-xs text-muted-foreground">{t("autoBackupRetentionCountHint")}</span>
          </span>
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring disabled:opacity-50"
            disabled={!autoBackup.enabled}
            id="settings-auto-backup-retention-count"
            min={1}
            step={1}
            type="number"
            value={autoBackup.retentionCount}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isFinite(parsed) && parsed >= 1) {
                onUpdateAutoBackup({ retentionCount: Math.floor(parsed) });
              }
            }}
          />
        </label>
        <label
          className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-md bg-background/50 px-3 py-2 text-sm max-sm:grid-cols-1"
          htmlFor="settings-auto-backup-retention-days"
        >
          <span>
            <span className="block font-medium">{t("autoBackupRetentionDays")}</span>
            <span className="text-xs text-muted-foreground">{t("autoBackupRetentionDaysHint")}</span>
          </span>
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring disabled:opacity-50"
            disabled={!autoBackup.enabled}
            id="settings-auto-backup-retention-days"
            min={1}
            step={1}
            type="number"
            value={autoBackup.retentionDays}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isFinite(parsed) && parsed >= 1) {
                onUpdateAutoBackup({ retentionDays: Math.floor(parsed) });
              }
            }}
          />
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 max-sm:grid-cols-1">
          <div className="min-w-0">
            <label className="sr-only" htmlFor="settings-auto-backup-folder">
              {t("autoBackupFolder")}
            </label>
            <input
              id="settings-auto-backup-folder"
              className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring disabled:opacity-50"
              disabled={!autoBackup.enabled}
              placeholder="D:\\Backups\\..."
              value={autoBackup.folder ?? ""}
              readOnly
            />
          </div>
          <Button
            disabled={!autoBackup.enabled}
            size="lg"
            type="button"
            variant="secondary"
            onClick={onChooseFolder}
          >
            <FolderOpen className="size-4" />
            {t("chooseFolder")}
          </Button>
          <Button
            disabled={!autoBackup.enabled || !autoBackup.folder}
            size="lg"
            type="button"
            onClick={onRunNow}
          >
            {t("autoBackupRunNow")}
          </Button>
        </div>
        {autoBackupState !== "idle" && (
          <p
            className={cn(
              "motion-status text-xs",
              autoBackupState === "error" ? "text-destructive" : "text-success",
            )}
          >
            {autoBackupState === "settings_saved"
              ? t("autoBackupSettingsSaved")
              : autoBackupState === "backup_done"
                ? t("autoBackupDone")
                : (autoBackupFeedback ?? t("autoBackupFailed"))}
          </p>
        )}
        {autoBackupState === "idle" && loadAutoBackupLastError() && (
          <p className="motion-status text-xs text-destructive">
            {t("autoBackupLastError")}: {loadAutoBackupLastError()}
          </p>
        )}
      </div>
    </section>
  );
}
