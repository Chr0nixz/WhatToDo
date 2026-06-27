import { useStore } from "zustand";
import { create } from "zustand";

import type { AppData, AppDataKey, Settings } from "@/data/types";
import type { Project, Reminder, SavedTaskView, Task, Workspace, WorkspaceFolder, Attachment, RecurringTaskTemplate } from "@/data/types";

type TodoStoreState = {
  data: AppData | null;
  isLoading: boolean;
  error: string | null;
};

export const useTodoStore = create<TodoStoreState>(() => ({
  data: null,
  isLoading: true,
  error: null,
}));

export const setTodoData = (next: AppData | null) => useTodoStore.setState({ data: next });
export const setTodoLoading = (isLoading: boolean) => useTodoStore.setState({ isLoading });
export const setTodoError = (error: string | null) => useTodoStore.setState({ error });

/**
 * Subscribe to a specific slice of AppData by key. Thanks to the
 * `applyRepositoryPatch` logic in useTodos, unaffected slices keep their
 * referential identity across mutations, so a component using this selector
 * only re-renders when its slice actually changes.
 *
 * Example: `const reminders = useTodoSlice("reminders")` will NOT re-render
 * when an unrelated task field changes.
 */
export const useTodoSlice = <K extends AppDataKey>(key: K): AppData[K] | undefined =>
  useStore(useTodoStore, (state) => state.data?.[key]);

export const useTodoData = (): AppData | null => useStore(useTodoStore, (state) => state.data);
export const useTodoIsLoading = (): boolean => useStore(useTodoStore, (state) => state.isLoading);
export const useTodoError = (): string | null => useStore(useTodoStore, (state) => state.error);

// Convenience selectors for the most common slices. Each returns an empty
// array (stable per call site via module constants) when data is not loaded
// yet, so consumers can call array methods without null checks.
const EMPTY: readonly never[] = [];

export const useReminders = (): Reminder[] =>
  (useStore(useTodoStore, (state) => state.data?.reminders) ?? EMPTY) as Reminder[];
export const useTasks = (): Task[] => (useStore(useTodoStore, (state) => state.data?.tasks) ?? EMPTY) as Task[];
export const useDeletedTasks = (): Task[] =>
  (useStore(useTodoStore, (state) => state.data?.deletedTasks) ?? EMPTY) as Task[];
export const useProjects = (): Project[] =>
  (useStore(useTodoStore, (state) => state.data?.projects) ?? EMPTY) as Project[];
export const useWorkspaces = (): Workspace[] =>
  (useStore(useTodoStore, (state) => state.data?.workspaces) ?? EMPTY) as Workspace[];
export const useWorkspaceFolders = (): WorkspaceFolder[] =>
  (useStore(useTodoStore, (state) => state.data?.workspaceFolders) ?? EMPTY) as WorkspaceFolder[];
export const useSavedViews = (): SavedTaskView[] =>
  (useStore(useTodoStore, (state) => state.data?.savedViews) ?? EMPTY) as SavedTaskView[];
export const useRecurringTaskTemplates = (): RecurringTaskTemplate[] =>
  (useStore(useTodoStore, (state) => state.data?.recurringTaskTemplates) ?? EMPTY) as RecurringTaskTemplate[];
export const useAttachments = (): Attachment[] =>
  (useStore(useTodoStore, (state) => state.data?.attachments) ?? EMPTY) as Attachment[];
export const useSettings = (): Settings | null => useStore(useTodoStore, (state) => state.data?.settings ?? null);
export const useWorkspaceId = (): string | null => useStore(useTodoStore, (state) => state.data?.workspaceId ?? null);
