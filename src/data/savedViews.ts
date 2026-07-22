import { defaultTaskViewFilters } from "./taskFilters";
import type { SavedTaskView, Settings, TaskViewFilters } from "./types";

export const applySavedViewFilters = (
  view: SavedTaskView,
  setFilters: (filters: TaskViewFilters) => void,
  setSelectedViewId: (viewId: string) => void,
) => {
  setFilters(view.filters);
  setSelectedViewId(view.id);
};

export const sortSavedViews = (views: SavedTaskView[]): SavedTaskView[] =>
  [...views].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    const byUpdated = b.updatedAt.localeCompare(a.updatedAt);
    if (byUpdated !== 0) {
      return byUpdated;
    }
    return a.name.localeCompare(b.name);
  });

export const isDefaultTaskViewFilters = (filters: TaskViewFilters) => {
  const defaults = defaultTaskViewFilters();
  return (
    filters.scope === defaults.scope &&
    filters.priority === defaults.priority &&
    filters.projectId === defaults.projectId &&
    filters.reminder === defaults.reminder &&
    filters.folder === defaults.folder &&
    filters.dateRange === defaults.dateRange
  );
};

export const clearDefaultSavedViewIfNeeded = (settings: Settings, deletedViewId: string): Settings => {
  if (settings.defaultSavedViewId === deletedViewId) {
    return { ...settings, defaultSavedViewId: null };
  }
  return settings;
};
