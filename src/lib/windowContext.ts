import { getCurrentWindow } from "@tauri-apps/api/window";

const WORKSPACE_WINDOW_PREFIX = "workspace-";

declare global {
  interface Window {
    __WHATTODO_FLOATING_WORKSPACE_ID__?: string;
    __WHATTODO_FLOATING_WINDOW__?: boolean;
    __DDL_TODO_FLOATING_WORKSPACE_ID__?: string;
    __DDL_TODO_FLOATING_WINDOW__?: boolean;
  }
}

const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const getRuntimeWindowLabel = () => {
  if (!isTauriRuntime()) {
    return "main";
  }

  try {
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
};

export const getWorkspaceIdFromWindowLabel = (label: string) =>
  label.startsWith(WORKSPACE_WINDOW_PREFIX)
    ? label.slice(WORKSPACE_WINDOW_PREFIX.length).split("--")[0] || null
    : null;

export const getInitialWorkspaceId = () => {
  if (window.__WHATTODO_FLOATING_WORKSPACE_ID__) {
    return window.__WHATTODO_FLOATING_WORKSPACE_ID__;
  }

  if (window.__DDL_TODO_FLOATING_WORKSPACE_ID__) {
    return window.__DDL_TODO_FLOATING_WORKSPACE_ID__;
  }

  const queryWorkspaceId = new URLSearchParams(window.location.search).get("workspaceId");
  return queryWorkspaceId ?? getWorkspaceIdFromWindowLabel(getRuntimeWindowLabel()) ?? undefined;
};

export const isWorkspaceFloatingWindow = () => {
  if (window.__WHATTODO_FLOATING_WINDOW__) {
    return true;
  }

  if (window.__DDL_TODO_FLOATING_WINDOW__) {
    return true;
  }

  const queryMode = new URLSearchParams(window.location.search).get("floating") === "1";
  return queryMode || getWorkspaceIdFromWindowLabel(getRuntimeWindowLabel()) !== null;
};
