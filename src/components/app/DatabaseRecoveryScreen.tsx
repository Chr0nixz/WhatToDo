import { openPath } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

export type DbInitStatus = {
  state: string;
  reason: string | null;
  dbPath: string | null;
  backupPath: string | null;
};

type Props = {
  status: DbInitStatus;
  onStatusChange: (status: DbInitStatus) => void;
};

export function DatabaseRecoveryScreen({ status, onStatusChange }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<"backup" | "retry" | "reset" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const hasBackup = Boolean(status.backupPath);

  const runAction = async (kind: "backup" | "retry" | "reset", command: string) => {
    setBusy(kind);
    setActionError(null);
    try {
      const next = await invoke<DbInitStatus>(command);
      onStatusChange(next);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      try {
        const latest = await invoke<DbInitStatus>("get_db_init_status");
        onStatusChange(latest);
      } catch {
        // Keep previous status if refresh fails.
      }
    } finally {
      setBusy(null);
    }
  };

  const openBackupFolder = async () => {
    if (!status.backupPath) return;
    const separator = status.backupPath.includes("\\") ? "\\" : "/";
    const parent = status.backupPath.lastIndexOf(separator);
    if (parent > 0) {
      await openPath(status.backupPath.slice(0, parent));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-lg rounded-lg border border-destructive/30 bg-card px-4 py-4 text-sm shadow-sm">
        <div className="mb-2 flex items-center gap-2 font-semibold text-destructive">
          <TriangleAlert className="size-4 shrink-0" />
          {t("dbRecoveryTitle")}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{t("dbRecoveryHint")}</p>

        {status.reason && (
          <div className="mb-3 rounded border border-border bg-muted/40 px-3 py-2 text-xs">
            <div className="mb-1 font-medium text-foreground">{t("dbRecoveryReason")}</div>
            <p className="break-words text-muted-foreground">{status.reason}</p>
          </div>
        )}

        {status.dbPath && (
          <p className="mb-2 break-all text-xs text-muted-foreground">
            {t("dbRecoveryDbPath")}: {status.dbPath}
          </p>
        )}

        {status.backupPath ? (
          <p className="mb-3 break-all text-xs text-muted-foreground">
            {t("dbRecoveryBackupPath")}: {status.backupPath}
          </p>
        ) : (
          <p className="mb-3 text-xs text-warning-foreground">{t("dbRecoveryBackupRequired")}</p>
        )}

        {actionError && (
          <p className="mb-3 break-words rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
            {actionError}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void runAction("backup", "backup_database_for_recovery")}
          >
            {busy === "backup" ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t("dbRecoveryCreateBackup")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void runAction("retry", "retry_database_migration")}
          >
            {busy === "retry" ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t("dbRecoveryRetry")}
          </Button>
          {hasBackup && (
            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void openBackupFolder()}>
              {t("dbBackupOpenFolder")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busy !== null || !hasBackup}
            title={!hasBackup ? t("dbRecoveryBackupRequired") : undefined}
            onClick={() => void runAction("reset", "confirm_reset_database")}
          >
            {busy === "reset" ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t("dbRecoveryConfirmReset")}
          </Button>
        </div>
      </div>
    </div>
  );
}
