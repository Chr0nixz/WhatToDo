import { Loader2, TriangleAlert } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";

import { useTodos } from "@/hooks/useTodos";
import { isWorkspaceFloatingWindow } from "@/lib/windowContext";

import { AppShell } from "./components/app/AppShell";

const WorkspaceFloatingWindow = lazy(() =>
  import("./components/app/WorkspaceFloatingWindow").then((module) => ({ default: module.WorkspaceFloatingWindow })),
);

function App() {
  const { data, isLoading, error, actions } = useTodos();
  const { t } = useTranslation();
  const isFloatingWindow = isWorkspaceFloatingWindow();
  const [dbReset, setDbReset] = useState(false);

  useEffect(() => {
    const unlisten = listen("db-reset", () => setDbReset(true));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

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

  return <AppShell actions={actions} data={data} error={error} dbReset={dbReset} />;
}

export default App;
