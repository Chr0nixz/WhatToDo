import { useEffect, useRef } from "react";

const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type GlobalShortcutHandlers = {
  onOpenPalette: () => void;
  onNewTask: () => void;
  onSearchTasks: () => void;
  onOpenHelp: () => void;
};

export const useGlobalShortcuts = ({ onOpenPalette, onNewTask, onSearchTasks, onOpenHelp }: GlobalShortcutHandlers) => {
  const handlersRef = useRef({ onOpenPalette, onNewTask, onSearchTasks, onOpenHelp });
  handlersRef.current = { onOpenPalette, onNewTask, onSearchTasks, onOpenHelp };

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    let teardown: (() => void) | undefined;

    const setup = async () => {
      const { register, unregisterAll } = await import("@tauri-apps/plugin-global-shortcut");
      if (disposed) {
        return;
      }

      const trigger = (kind: "palette" | "new" | "search") => () => {
        const h = handlersRef.current;
        if (kind === "palette") h.onOpenPalette();
        if (kind === "new") h.onNewTask();
        if (kind === "search") h.onSearchTasks();
      };

      await register("CommandOrControl+K", trigger("palette"));
      await register("CommandOrControl+N", trigger("new"));
      await register("CommandOrControl+Shift+F", trigger("search"));
      teardown = unregisterAll;
    };

    void setup();

    return () => {
      disposed = true;
      if (teardown) {
        teardown();
      } else {
        void import("@tauri-apps/plugin-global-shortcut").then(({ unregisterAll }) => unregisterAll());
      }
    };
  }, []);

  // `?` (Shift+/) opens the help modal. DOM-level so it works in dev and Tauri.
  // Ignored while typing in a field or when any dialog is already open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || active?.isContentEditable) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) {
        return;
      }
      event.preventDefault();
      handlersRef.current.onOpenHelp();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
};
