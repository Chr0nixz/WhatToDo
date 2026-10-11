import { HardDrive, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/data/managedAttachments";
import type { OrphanedAttachmentsCleanupResult, OrphanedAttachmentsSummary } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

type StorageSettingsPanelProps = {
  actions: TodoActions;
};

export function StorageSettingsPanel({ actions }: StorageSettingsPanelProps) {
  const { t } = useTranslation();
  const [isScanning, setIsScanning] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [summary, setSummary] = useState<OrphanedAttachmentsSummary | null>(null);
  const [lastResult, setLastResult] = useState<OrphanedAttachmentsCleanupResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleScan = async () => {
    setIsScanning(true);
    setErrorMessage(null);
    setLastResult(null);
    try {
      const res = await actions.analyzeOrphanedAttachments();
      setSummary(res);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsScanning(false);
    }
  };

  const handleClean = async () => {
    setIsCleaning(true);
    setErrorMessage(null);
    try {
      const result = await actions.cleanupOrphanedAttachments();
      setLastResult(result);
      setSummary(null);
      setConfirmOpen(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card/65 p-4">
      <div className="mb-4 flex items-center gap-2">
        <HardDrive className="size-4 text-primary" />
        <div>
          <h2 className="text-base font-semibold">{t("storageManagement")}</h2>
          <p className="text-xs text-muted-foreground">{t("storageManagementHint")}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-background/50 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium">{t("orphanedAttachmentsTitle")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("orphanedAttachmentsDesc")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={isScanning || isCleaning}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void handleScan()}
            >
              {isScanning ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{t("scanningOrphaned")}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="size-3.5" />
                  <span>{t("scanOrphaned")}</span>
                </>
              )}
            </Button>

            {summary && summary.orphanedCount > 0 && (
              <Button
                disabled={isScanning || isCleaning}
                size="sm"
                type="button"
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
              >
                {isCleaning ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>{t("cleaningOrphaned")}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="size-3.5" />
                    <span>{t("cleanOrphaned")}</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {summary && (
          <div className="mt-3 rounded-md border border-border bg-card p-2.5 text-xs">
            {summary.orphanedCount === 0 ? (
              <p className="text-muted-foreground">{t("noOrphanedFound")}</p>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-foreground">
                  {t("orphanedFound", {
                    count: summary.orphanedCount,
                    size: formatBytes(summary.orphanedBytes),
                  })}
                </span>
                <span className="font-medium text-warning-foreground">
                  {formatBytes(summary.orphanedBytes)}
                </span>
              </div>
            )}
          </div>
        )}

        {lastResult && (
          <div className="mt-3 rounded-md border border-success/30 bg-success/10 p-2.5 text-xs text-foreground">
            {t("orphanedCleaned", {
              count: lastResult.deletedCount,
              size: formatBytes(lastResult.freedBytes),
            })}
          </div>
        )}

        {errorMessage && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
            {errorMessage}
          </div>
        )}
      </div>

      <ConfirmDialog
        confirmLabel={t("cleanOrphaned")}
        description={t("cleanOrphanedConfirmDesc")}
        open={confirmOpen}
        title={t("cleanOrphanedConfirmTitle")}
        onConfirm={() => void handleClean()}
        onOpenChange={setConfirmOpen}
      />
    </section>
  );
}
