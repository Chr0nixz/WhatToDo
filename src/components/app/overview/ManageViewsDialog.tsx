import * as Dialog from "@radix-ui/react-dialog";
import { Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { SavedTaskView, Settings, TaskViewFilters } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

export interface ManageViewsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedViews: SavedTaskView[];
  selectedViewId: string | null;
  currentFilters: TaskViewFilters;
  settings: Settings;
  actions: TodoActions;
  onSelectView: (viewId: string) => void;
  onClearSelection: () => void;
}

export function ManageViewsDialog({
  open,
  onOpenChange,
  savedViews,
  selectedViewId,
  currentFilters,
  settings,
  actions,
  onSelectView,
  onClearSelection,
}: ManageViewsDialogProps) {
  const { t } = useTranslation();
  const [newViewName, setNewViewName] = useState("");
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    if (!open) {
      setEditingViewId(null);
      setEditValue("");
      setNewViewName("");
    }
  }, [open]);

  const startEdit = (view: SavedTaskView) => {
    setEditingViewId(view.id);
    setEditValue(view.name);
  };

  const commitEdit = async (viewId: string) => {
    const view = savedViews.find((item) => item.id === viewId);
    const name = editValue.trim();
    if (!view || !name) {
      setEditingViewId(null);
      return;
    }
    await actions.updateSavedView(viewId, { name, filters: view.filters, pinned: view.pinned });
    setEditingViewId(null);
  };

  const updateWithCurrent = async (view: SavedTaskView) => {
    await actions.updateSavedView(view.id, { name: view.name, filters: currentFilters, pinned: view.pinned });
    onSelectView(view.id);
  };

  const togglePinned = async (view: SavedTaskView) => {
    await actions.updateSavedView(view.id, {
      name: view.name,
      filters: view.filters,
      pinned: !view.pinned,
    });
  };

  const setDefault = async (viewId: string) => {
    await actions.saveSettings({ ...settings, defaultSavedViewId: viewId });
  };

  const removeView = async (viewId: string) => {
    await actions.deleteSavedView(viewId);
    if (selectedViewId === viewId) {
      onClearSelection();
    }
  };

  const createView = async () => {
    const name = newViewName.trim();
    if (!name) {
      return;
    }
    await actions.createSavedView({ name, filters: currentFilters });
    setNewViewName("");
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="motion-dialog-overlay fixed inset-0 z-50 bg-background/65 backdrop-blur-[2px]" />
        <Dialog.Content className="motion-dialog-content fixed left-1/2 top-1/2 flex max-h-[85vh] w-[min(560px,calc(100vw-32px))] flex-col rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-xl outline-none">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold">{t("manageViews")}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-muted-foreground">
                {t("manageViewsDesc")}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button aria-label={t("close")} size="icon-sm" type="button" variant="ghost" title={t("close")}>
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 space-y-1.5 overflow-auto pr-1">
            {savedViews.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-card/35 px-4 py-6 text-center text-sm text-muted-foreground">
                {t("noSavedViews")}
              </p>
            ) : (
              savedViews.map((view) => {
                const isDefault = settings.defaultSavedViewId === view.id;
                const isSelected = selectedViewId === view.id;
                return (
                  <div
                    key={view.id}
                    className={cn(
                      "flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2",
                      isSelected && "border-ring bg-accent/40",
                    )}
                  >
                    {editingViewId === view.id ? (
                      <form
                        className="flex h-8 min-w-0 flex-1 items-center gap-1"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void commitEdit(view.id);
                        }}
                      >
                        <input
                          aria-label={t("viewName")}
                          ref={(el) => el?.focus()}
                          className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-2 text-sm outline-none focus:border-ring"
                          value={editValue}
                          onChange={(event) => setEditValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setEditingViewId(null);
                            }
                          }}
                        />
                        <Button size="xs" type="submit">
                          {t("save")}
                        </Button>
                      </form>
                    ) : (
                      <>
                        <button
                          aria-label={t("renameSavedView")}
                          className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
                          type="button"
                          onClick={() => startEdit(view)}
                          title={t("renameSavedView")}
                        >
                          {view.name}
                        </button>
                        {view.pinned && (
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                            {t("pinnedSavedView")}
                          </span>
                        )}
                        {isDefault && (
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                            {t("defaultSavedView")}
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          <Button
                            size="xs"
                            type="button"
                            variant="outline"
                            onClick={() => void togglePinned(view)}
                          >
                            {view.pinned ? t("unpinSavedView") : t("pinSavedView")}
                          </Button>
                          {!isDefault && (
                            <Button size="xs" type="button" variant="outline" onClick={() => void setDefault(view.id)}>
                              {t("setAsDefault")}
                            </Button>
                          )}
                          <Button size="xs" type="button" variant="outline" onClick={() => void updateWithCurrent(view)}>
                            {t("updateWithCurrentFilters")}
                          </Button>
                          <Button
                            aria-label={t("deleteSavedView")}
                            size="xs"
                            type="button"
                            variant="destructive"
                            onClick={() => void removeView(view.id)}
                          >
                            {t("delete")}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <form
            className="mt-4 flex items-center gap-2 border-t border-border pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void createView();
            }}
          >
            <label className="sr-only" htmlFor="manage-view-name">
              {t("viewName")}
            </label>
            <input
              id="manage-view-name"
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-sm outline-none transition-colors focus:border-ring"
              placeholder={t("viewName")}
              value={newViewName}
              onChange={(event) => setNewViewName(event.target.value)}
            />
            <Button disabled={!newViewName.trim()} size="sm" type="submit">
              <Save className="size-3.5" />
              {t("createNewView")}
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
