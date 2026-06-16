import { useCallback, useEffect, useMemo, useState } from "react";

import { filterCommandItems, isEditableTarget, matchesShortcut, type CommandItem } from "@/data/commandPalette";

export type CommandPaletteMode = "commands" | "tasks";

type UseCommandPaletteOptions = {
  buildItems: () => CommandItem[];
  searchTasks: (query: string) => Promise<CommandItem[]>;
  onClose?: () => void;
};

export const useCommandPalette = ({ buildItems, searchTasks, onClose }: UseCommandPaletteOptions) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CommandPaletteMode>("commands");
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [taskItems, setTaskItems] = useState<CommandItem[]>([]);
  const [isSearchingTasks, setIsSearchingTasks] = useState(false);
  const [taskSearchError, setTaskSearchError] = useState<string | null>(null);

  const commandItems = useMemo(() => filterCommandItems(buildItems(), query), [buildItems, query]);

  const visibleItems = mode === "tasks" ? taskItems : commandItems;

  const openPalette = useCallback((nextMode: CommandPaletteMode = "commands") => {
    setMode(nextMode);
    setQuery("");
    setActiveIndex(0);
    setTaskItems([]);
    setTaskSearchError(null);
    setOpen(true);
  }, []);

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

  const runActiveItem = useCallback(async () => {
    const item = visibleItems[activeIndex];
    if (!item) {
      return;
    }

    closePalette();
    await item.run();
  }, [activeIndex, closePalette, visibleItems]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, mode, visibleItems.length]);

  useEffect(() => {
    if (!open || mode !== "tasks") {
      return;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setTaskItems([]);
      setTaskSearchError(null);
      setIsSearchingTasks(false);
      return;
    }

    setIsSearchingTasks(true);
    setTaskSearchError(null);
    const timer = window.setTimeout(() => {
      void searchTasks(trimmed)
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
  }, [mode, open, query, searchTasks]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
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
  };
};
