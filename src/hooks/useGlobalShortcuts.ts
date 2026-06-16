import { useEffect } from "react";

const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type GlobalShortcutHandlers = {
  onOpenPalette: () => void;
  onNewTask: () => void;
  onSearchTasks: () => void;
};

export const useGlobalShortcuts = ({ onOpenPalette, onNewTask, onSearchTasks }: GlobalShortcutHandlers) => {
  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;

    const setup = async () => {
      const { register, unregisterAll } = await import("@tauri-apps/plugin-global-shortcut");

      if (disposed) {
        return;
      }

      await register("CommandOrControl+K", () => {
        onOpenPalette();
      });
      await register("CommandOrControl+N", () => {
        onNewTask();
      });
      await register("CommandOrControl+Shift+F", () => {
        onSearchTasks();
      });

      return () => {
        void unregisterAll();
      };
    };

    let cleanup: (() => void) | undefined;
    void setup().then((nextCleanup) => {
      cleanup = nextCleanup;
    });

    return () => {
      disposed = true;
      cleanup?.();
      void import("@tauri-apps/plugin-global-shortcut").then(({ unregisterAll }) => unregisterAll());
    };
  }, [onNewTask, onOpenPalette, onSearchTasks]);
};
