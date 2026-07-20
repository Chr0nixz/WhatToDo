import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  COMMAND_GROUP_LABEL_KEYS,
  groupCommandItems,
  type CommandGroup,
  type CommandItem,
} from "@/data/commandPalette";
import type { CommandPaletteMode } from "@/hooks/useCommandPalette";
import { cn } from "@/lib/utils";

type CommandPaletteProps = {
  open: boolean;
  mode: CommandPaletteMode;
  query: string;
  activeIndex: number;
  visibleItems: CommandItem[];
  isSearchingTasks: boolean;
  taskSearchError: string | null;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onModeChange: (mode: CommandPaletteMode) => void;
  onActiveIndexChange: (index: number) => void;
  onRunItem: (item: CommandItem) => void;
};

const GROUP_ORDER: CommandGroup[] = ["recent", "navigation", "tasks", "workspaces", "folders", "savedViews", "manage"];

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded border border-border bg-secondary/80 px-1 font-sans text-xs font-medium leading-none text-muted-foreground">
      {children}
    </kbd>
  );
}

function PaletteModeToggle({
  mode,
  onModeChange,
}: {
  mode: CommandPaletteMode;
  onModeChange: (mode: CommandPaletteMode) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="inline-grid shrink-0 grid-flow-col gap-0.5 rounded-md border border-border bg-background/50 p-0.5"
      role="tablist"
      aria-label={t("commandPalette")}
    >
      {(["commands", "tasks"] as const).map((value) => (
        <button
          aria-selected={mode === value}
          className={cn(
            "h-7 rounded px-2.5 text-xs font-medium transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-quart)] hover:bg-accent active:scale-[0.98]",
            mode === value ? "bg-primary text-primary-foreground hover:bg-primary" : "text-muted-foreground",
          )}
          key={value}
          role="tab"
          type="button"
          onClick={() => onModeChange(value)}
        >
          {value === "commands" ? t("commandModeCommands") : t("commandModeTasks")}
        </button>
      ))}
    </div>
  );
}

function StatusPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="motion-status mx-1 flex min-h-[9rem] items-center justify-center rounded-lg border border-dashed border-border bg-background/50 px-4 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function CommandPalette({
  open,
  mode,
  query,
  activeIndex,
  visibleItems,
  isSearchingTasks,
  taskSearchError,
  onOpenChange,
  onQueryChange,
  onModeChange,
  onActiveIndexChange,
  onRunItem,
}: CommandPaletteProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const groupedItems = useMemo(() => groupCommandItems(visibleItems), [visibleItems]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, mode]);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const flatIndexById = useMemo(() => {
    const map = new Map<string, number>();
    visibleItems.forEach((item, index) => map.set(item.id, index));
    return map;
  }, [visibleItems]);

  const renderSections =
    mode === "tasks"
      ? query.trim()
        ? [{ group: "tasks" as const, items: visibleItems }]
        : GROUP_ORDER.map((group) => ({ group, items: groupedItems.get(group) ?? [] })).filter(
            (section) => section.items.length > 0,
          )
      : GROUP_ORDER.map((group) => ({ group, items: groupedItems.get(group) ?? [] })).filter((section) => section.items.length > 0);

  const showEmptyHint = mode === "tasks" && !query.trim() && visibleItems.length === 0;
  const showLoading = mode === "tasks" && isSearchingTasks;
  const showError = Boolean(taskSearchError);
  const showNoResults = !isSearchingTasks && visibleItems.length === 0 && query.trim();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="motion-dialog-overlay fixed inset-0 z-[60] bg-background/65 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="motion-dialog-content fixed left-1/2 top-1/2 z-[60] flex max-h-[min(520px,calc(100vh-32px))] w-[min(560px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl outline-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <Dialog.Title className="sr-only">{t("commandPalette")}</Dialog.Title>

          <div className="border-b border-border px-3 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-background/65 px-2.5 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/35">
                <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <label className="sr-only" htmlFor="command-palette-input">
                  {mode === "tasks" ? t("commandSearchTasksPlaceholder") : t("commandPalettePlaceholder")}
                </label>
                <input
                  ref={inputRef}
                  id="command-palette-input"
                  className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder={mode === "tasks" ? t("commandSearchTasksPlaceholder") : t("commandPalettePlaceholder")}
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                />
              </div>
              <PaletteModeToggle mode={mode} onModeChange={onModeChange} />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
            {showEmptyHint && <StatusPanel>{t("commandSearchTasksHint")}</StatusPanel>}
            {showLoading && (
              <StatusPanel>
                <span className="inline-flex items-center gap-2">
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  {t("loadingTasks")}
                </span>
              </StatusPanel>
            )}
            {showError && (
              <p className="motion-status mx-1 flex min-h-[9rem] items-center justify-center rounded-lg border border-dashed border-destructive/40 bg-destructive/10 px-4 text-center text-sm text-destructive">
                {t(taskSearchError!)}
              </p>
            )}
            {showNoResults && <StatusPanel>{t("commandNoResults")}</StatusPanel>}

            {!showEmptyHint && !showLoading && !showError && !showNoResults && (
              <div className="motion-list space-y-2">
                {renderSections.map(({ group, items }) => (
                  <section key={group}>
                    {(mode === "commands" || group === "recent") && (
                      <p className="px-2 pb-1 pt-0.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        {t(COMMAND_GROUP_LABEL_KEYS[group])}
                      </p>
                    )}
                    <ul className="grid gap-0.5" role="listbox">
                      {items.map((item) => {
                        const itemIndex = flatIndexById.get(item.id) ?? 0;
                        const active = itemIndex === activeIndex;

                        return (
                          <li key={item.id}>
                            <button
                              ref={active ? activeItemRef : undefined}
                              aria-selected={active}
                              className={cn(
                                "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-[background-color,box-shadow,color] duration-150 ease-[var(--ease-out-quart)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                active
                                  ? "bg-accent text-accent-foreground ring-1 ring-ring/35"
                                  : "hover:bg-accent/55",
                              )}
                              role="option"
                              type="button"
                              onMouseEnter={() => onActiveIndexChange(itemIndex)}
                              onClick={() => onRunItem(item)}
                            >
                              <span className="min-w-0 truncate">{item.label}</span>
                              {item.shortcut && (
                                <span className="shrink-0 rounded-md border border-border bg-secondary/70 px-1.5 py-0.5 text-xs font-medium leading-none text-muted-foreground">
                                  {item.shortcut}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 border-t border-border bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
            </span>
            <Kbd>↵</Kbd>
            <Kbd>Esc</Kbd>
            <span className="hidden sm:inline">{t("commandPaletteFooter")}</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
