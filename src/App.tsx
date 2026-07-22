import { invoke } from "@tauri-apps/api/core";
import { Loader2, TriangleAlert } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  DatabaseRecoveryScreen,
  type DbInitStatus,
} from "@/components/app/DatabaseRecoveryScreen";
import { useTodos } from "@/hooks/useTodos";
import { isWorkspaceFloatingWindow } from "@/lib/windowContext";

import { AppShell } from "./components/app/AppShell";

const WorkspaceFloatingWindow = lazy(() =>
  import("./components/app/WorkspaceFloatingWindow").then((module) => ({ default: module.WorkspaceFloatingWindow })),
);

const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function AppMain({ dbReset }: { dbReset: string | null }) {
  const { data, isLoading, error, actions } = useTodos();
  const { t } = useTranslation();
  const isFloatingWindow = isWorkspaceFloatingWindow();

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <div className="max-w-md rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-sm">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <TriangleAlert className="size-4" />
            {t("loadErrorTitle")}
          </div>
          <p className="break-words text-xs">{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-sm">
          <Loader2 className="size-4 animate-spin text-primary" />
          {t("loadingApp")}
        </div>
      </div>
    );
  }

  if (isFloatingWindow) {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-sm">
              <Loader2 className="size-4 animate-spin text-primary" />
              {t("loadingView")}
            </div>
          </div>
        }
      >
        <WorkspaceFloatingWindow actions={actions} data={data} />
      </Suspense>
    );
  }

  return <AppShell actions={actions} error={error} dbReset={dbReset} />;
}

function TauriAppGate() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<DbInitStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void invoke<DbInitStatus>("get_db_init_status")
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setStatusError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (statusError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <div className="max-w-md rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-sm">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <TriangleAlert className="size-4" />
            {t("loadErrorTitle")}
          </div>
          <p className="break-words text-xs">{statusError}</p>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-sm">
          <Loader2 className="size-4 animate-spin text-primary" />
          {t("loadingApp")}
        </div>
      </div>
    );
  }

  if (status.state === "failed") {
    return <DatabaseRecoveryScreen status={status} onStatusChange={setStatus} />;
  }

  const dbReset =
    status.state === "reset_completed" ? (status.backupPath ?? "") : null;

  return <AppMain dbReset={dbReset} />;
}

function App() {
  if (isTauriRuntime()) {
    return <TauriAppGate />;
  }
  return <AppMain dbReset={null} />;
}

export default App;
