import { useEffect, useRef } from "react";

const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type GlobalShortcutHandlers = {
  onOpenPalette: () => void;
  onNewTask: () => void;
  onSearchTasks: () => void;
};

export const useGlobalShortcuts = ({ onOpenPalette, onNewTask, onSearchTasks }: GlobalShortcutHandlers) => {
  const handlersRef = useRef({ onOpenPalette, onNewTask, onSearchTasks });
  handlersRef.current = { onOpenPalette, onNewTask, onSearchTasks };

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
};
