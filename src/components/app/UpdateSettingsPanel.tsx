import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, RefreshCw, RotateCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

type UpdateState = "idle" | "checking" | "available" | "current" | "downloading" | "ready" | "error";

export function UpdateSettingsPanel() {
  const { t } = useTranslation();
  const [state, setState] = useState<UpdateState>("idle");
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [error, setError] = useState("");
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [contentLength, setContentLength] = useState<number | null>(null);

  const progress =
    contentLength && contentLength > 0 ? Math.min(100, Math.round((downloadedBytes / contentLength) * 100)) : null;

  const checkForUpdates = async () => {
    setState("checking");
    setError("");
    setAvailableUpdate(null);
    setDownloadedBytes(0);
    setContentLength(null);

    try {
      const update = await check();
      setAvailableUpdate(update);
      setState(update ? "available" : "current");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  };

  const installUpdate = async () => {
    if (!availableUpdate) {
      return;
    }

    setState("downloading");
    setError("");
    setDownloadedBytes(0);
    setContentLength(null);

    try {
      await availableUpdate.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          setContentLength(event.data.contentLength ?? null);
          setDownloadedBytes(0);
        }

        if (event.event === "Progress") {
          setDownloadedBytes((current) => current + event.data.chunkLength);
        }

        if (event.event === "Finished") {
          setState("ready");
        }
      });

      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  };

  const restart = async () => {
    await relaunch();
  };

  return (
    <section className="motion-surface rounded-lg border border-border bg-card/70 p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <RefreshCw className="size-4" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">{t("updates")}</h2>
          <p className="text-sm text-muted-foreground">{t("updatesHint")}</p>
        </div>
      </div>

      <div className="grid gap-3 rounded-md border border-border bg-background/45 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
            disabled={state === "checking" || state === "downloading"}
            type="button"
            onClick={() => void checkForUpdates()}
          >
            <RefreshCw className={cn("size-4", state === "checking" && "animate-spin")} />
            {state === "checking" ? t("checkingUpdates") : t("checkForUpdates")}
          </button>

          {state === "available" && (
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              type="button"
              onClick={() => void installUpdate()}
            >
              <Download className="size-4" />
              {t("downloadAndInstall")}
            </button>
          )}

          {state === "ready" && (
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              type="button"
              onClick={() => void restart()}
            >
              <RotateCw className="size-4" />
              {t("restartToUpdate")}
            </button>
          )}
        </div>

        <p className={cn("text-sm", state === "error" ? "text-destructive" : "text-muted-foreground")}>
          {state === "idle" && t("updatesIdle")}
          {state === "current" && t("appIsCurrent")}
          {state === "available" &&
            t("updateAvailable", {
              current: availableUpdate?.currentVersion,
              latest: availableUpdate?.version,
            })}
          {state === "downloading" && (progress === null ? t("downloadingUpdate") : t("downloadingUpdateProgress", { progress }))}
          {state === "ready" && t("updateReady")}
          {state === "error" && `${t("updateFailed")} ${error}`}
        </p>

        {availableUpdate?.body && state !== "current" && (
          <div className="max-h-28 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            {availableUpdate.body}
          </div>
        )}
      </div>
    </section>
  );
}
