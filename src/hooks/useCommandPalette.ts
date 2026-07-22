import { useCallback, useEffect, useMemo, useState } from "react";

import {
  filterCommandItems,
  isEditableTarget,
  loadCommandRecent,
  matchesShortcut,
  orderCommandsWithRecent,
  recentTasksAsCommandItems,
  recordRecentCommand,
  recordRecentTask,
  type CommandItem,
} from "@/data/commandPalette";

export type CommandPaletteMode = "commands" | "tasks";
export type CommandTaskSearchScope = "current" | "all";

type UseCommandPaletteOptions = {
  buildItems: () => CommandItem[];
  searchTasks: (query: string, scope: CommandTaskSearchScope) => Promise<CommandItem[]>;
  onOpenTask: (taskId: string) => void;
  onClose?: () => void;
};

export const useCommandPalette = ({ buildItems, searchTasks, onOpenTask, onClose }: UseCommandPaletteOptions) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CommandPaletteMode>("commands");
  const [taskSearchScope, setTaskSearchScope] = useState<CommandTaskSearchScope>("current");
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [taskItems, setTaskItems] = useState<CommandItem[]>([]);
  const [isSearchingTasks, setIsSearchingTasks] = useState(false);
  const [taskSearchError, setTaskSearchError] = useState<string | null>(null);
  const [recentTick, setRecentTick] = useState(0);

  const recentStore = useMemo(() => {
    void recentTick;
    return loadCommandRecent();
  }, [recentTick, open]);

  const builtItems = useMemo(() => buildItems(), [buildItems, open]);

  const commandItems = useMemo(() => {
    const filtered = filterCommandItems(builtItems, query);
    if (query.trim()) {
      return filtered;
    }
    return orderCommandsWithRecent(builtItems, recentStore.commands);
  }, [builtItems, query, recentStore.commands]);

  const recentTaskItems = useMemo(
    () => recentTasksAsCommandItems(recentStore.tasks, onOpenTask),
    [onOpenTask, recentStore.tasks],
  );

  const visibleItems = mode === "tasks" ? taskItems : commandItems;

  const openPalette = useCallback((nextMode: CommandPaletteMode = "commands") => {
    setMode(nextMode);
    setQuery("");
    setActiveIndex(0);
    setTaskSearchError(null);
    setRecentTick((value) => value + 1);
    if (nextMode === "tasks") {
      setTaskItems(recentTasksAsCommandItems(loadCommandRecent().tasks, onOpenTask));
    } else {
      setTaskItems([]);
    }
    setOpen(true);
  }, [onOpenTask]);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setTaskItems([]);
    setTaskSearchError(null);
    onClose?.();
  }, [onClose]);

  const togglePalette = useCallback(() => {
    if (open) {
      closePalette();
      return;
    }
    openPalette("commands");
  }, [closePalette, open, openPalette]);

  const openTaskSearch = useCallback(() => {
    openPalette("tasks");
  }, [openPalette]);

  const runItem = useCallback(
    async (item: CommandItem) => {
      if (item.id.startsWith("recent-task:")) {
        recordRecentTask({ id: item.id.slice("recent-task:".length), title: item.label });
      } else if (item.id.startsWith("task-result:")) {
        recordRecentTask({ id: item.id.slice("task-result:".length), title: item.label });
      } else if (mode === "commands") {
        recordRecentCommand(item.id);
      }
      setRecentTick((value) => value + 1);
      closePalette();
      await item.run();
    },
    [closePalette, mode],
  );

  const runActiveItem = useCallback(async () => {
    const item = visibleItems[activeIndex];
    if (!item) {
      return;
    }
    await runItem(item);
  }, [activeIndex, runItem, visibleItems]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, mode, taskSearchScope, visibleItems.length]);

  useEffect(() => {
    if (!open || mode !== "tasks") {
      return;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setTaskItems(recentTaskItems);
      setTaskSearchError(null);
      setIsSearchingTasks(false);
      return;
    }

    setIsSearchingTasks(true);
    setTaskSearchError(null);
    const timer = window.setTimeout(() => {
      void searchTasks(trimmed, taskSearchScope)
        .then((items) => {
          setTaskItems(items);
        })
        .catch(() => {
          setTaskItems([]);
          setTaskSearchError("operationFailed");
        })
        .finally(() => {
          setIsSearchingTasks(false);
        });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [mode, open, query, recentTaskItems, searchTasks, taskSearchScope]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => Math.min(current + 1, Math.max(visibleItems.length - 1, 0)));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        void runActiveItem();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closePalette();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePalette, open, runActiveItem, visibleItems.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (matchesShortcut(event, "k")) {
        event.preventDefault();
        togglePalette();
        return;
      }

      if (matchesShortcut(event, "n")) {
        event.preventDefault();
        closePalette();
        void buildItems()
          .find((item) => item.id === "task:new")
          ?.run();
        return;
      }

      if (matchesShortcut(event, "f") && event.shiftKey) {
        event.preventDefault();
        openTaskSearch();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [buildItems, closePalette, openTaskSearch, togglePalette]);

  return {
    open,
    mode,
    setMode,
    taskSearchScope,
    setTaskSearchScope,
    query,
    setQuery,
    activeIndex,
    setActiveIndex,
    visibleItems,
    commandItems,
    taskItems,
    isSearchingTasks,
    taskSearchError,
    openPalette,
    closePalette,
    togglePalette,
    openTaskSearch,
    runActiveItem,
    runItem,
  };
};
