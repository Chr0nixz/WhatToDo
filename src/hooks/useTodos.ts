import { useCallback, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "zustand";

import { createRepository } from "@/data/repository";
import type {
  AppData,
  AppDataKey,
  BackupPayload,
  CreateAttachmentInput,
  CreateRecurringTaskInput,
  CreateSavedTaskViewInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateWorkspaceFolderInput,
  CreateWorkspaceInput,
  ImportBackupMode,
  Project,
  RecoveryItems,
  ReminderEvent,
  RepositoryPatch,
  RepositoryResult,
  Settings,
  Task,
  TaskPageInput,
  TaskPageResult,
  TaskStatus,
  UpdateRecurringTaskTemplateInput,
  UpdateWorkspaceInput,
} from "@/data/types";
import { getInitialWorkspaceId } from "@/lib/windowContext";
import { measureDevAsync } from "@/lib/performance";
import { setTodoData, setTodoError, setTodoLoading, useTodoStore } from "@/hooks/useTodoStore";

const LOAD_TIMEOUT_MS = 8000;

const applyRepositoryPatch = (prev: AppData, next: AppData, patch: RepositoryPatch): AppData => {
  if (patch.affectedKeys.length === 0) {
    return prev;
  }
  const affected = new Set<AppDataKey>(patch.affectedKeys);
  const merged: Record<AppDataKey, unknown> = { ...prev };
  (Object.keys(next) as AppDataKey[]).forEach((key) => {
    if (affected.has(key)) {
      merged[key] = next[key];
    }
  });
  return merged as AppData;
};

export type TodoActions = {
  selectWorkspace: (workspaceId: string) => Promise<AppData>;
  loadAvailableTasks: (workspaceId?: string) => Promise<Task[]>;
  loadRecoveryItems: () => Promise<RecoveryItems>;
  loadTaskPage: (input: TaskPageInput) => Promise<TaskPageResult>;
  loadDueDateCounts: (input: { workspaceId?: string; from: string; to: string }) => Promise<Record<string, number>>;
  createWorkspace: (input: CreateWorkspaceInput) => Promise<AppData>;
  updateWorkspace: (id: string, patch: UpdateWorkspaceInput) => Promise<AppData>;
  deleteWorkspace: (id: string) => Promise<AppData>;
  restoreWorkspace: (id: string) => Promise<AppData>;
  createWorkspaceFolder: (input: CreateWorkspaceFolderInput) => Promise<AppData>;
  deleteWorkspaceFolder: (id: string) => Promise<AppData>;
  restoreWorkspaceFolder: (id: string) => Promise<AppData>;
  createProject: (input: CreateProjectInput) => Promise<AppData>;
  moveTaskToWorkspace: (taskId: string, workspaceId: string) => Promise<AppData>;
  updateProject: (
    id: string,
    patch: Partial<Pick<Project, "name" | "color" | "dueDate" | "status" | "workingFolder">>,
  ) => Promise<AppData>;
  archiveProject: (id: string) => Promise<AppData>;
  unarchiveProject: (id: string) => Promise<AppData>;
  createTask: (input: CreateTaskInput) => Promise<AppData>;
  createRecurringTask: (input: CreateRecurringTaskInput) => Promise<AppData>;
  updateRecurringTaskTemplate: (id: string, patch: UpdateRecurringTaskTemplateInput) => Promise<AppData>;
  updateRecurringSeries: (
    id: string,
    patch: UpdateRecurringTaskTemplateInput,
    mode: "template" | "openFuture",
  ) => Promise<AppData>;
  disableRecurringTaskTemplate: (id: string) => Promise<AppData>;
  updateTask: (
    id: string,
    patch: Partial<Pick<Task, "title" | "notes" | "dueDate" | "dueTime" | "priority" | "projectId" | "workingFolder" | "tags">>,
  ) => Promise<AppData>;
  setTaskParent: (taskId: string, parentId: string | null) => Promise<AppData>;
  updateTaskReminder: (taskId: string, offsetMinutes: number | null) => Promise<AppData>;
  toggleTask: (id: string) => Promise<AppData>;
  setTaskStatus: (id: string, status: TaskStatus) => Promise<AppData>;
  bulkSetTaskStatus: (ids: string[], status: TaskStatus) => Promise<AppData>;
  bulkDeleteTasks: (ids: string[]) => Promise<AppData>;
  bulkMoveTasksToProject: (ids: string[], projectId: string | null) => Promise<AppData>;
  deleteTask: (id: string) => Promise<AppData>;
  restoreTask: (id: string) => Promise<AppData>;
  addAttachment: (input: CreateAttachmentInput) => Promise<AppData>;
  deleteAttachment: (id: string) => Promise<AppData>;
  markReminderFired: (id: string) => Promise<AppData>;
  markReminderFailed: (id: string, reason: string) => Promise<AppData>;
  snoozeReminder: (id: string, untilIso: string) => Promise<AppData>;
  disableReminder: (id: string) => Promise<AppData>;
  createTaskReminder: (taskId: string, offsetMinutes: number) => Promise<AppData>;
  deleteReminder: (id: string) => Promise<AppData>;
  createSavedView: (input: CreateSavedTaskViewInput) => Promise<AppData>;
  updateSavedView: (id: string, input: CreateSavedTaskViewInput) => Promise<AppData>;
  deleteSavedView: (id: string) => Promise<AppData>;
  exportBackup: () => Promise<BackupPayload>;
  importBackup: (payload: BackupPayload, mode?: ImportBackupMode) => Promise<AppData>;
  loadReminderEvents: (reminderId: string) => Promise<ReminderEvent[]>;
  exportCurrentWorkspaceCsv: () => Promise<string>;
  exportCurrentWorkspaceIcs: () => Promise<string>;
  saveSettings: (settings: Settings) => Promise<AppData>;
};

export const useTodos = () => {
  const repository = useMemo(() => createRepository(), []);
  const data = useStore(useTodoStore, (state) => state.data);
  const isLoading = useStore(useTodoStore, (state) => state.isLoading);
  const error = useStore(useTodoStore, (state) => state.error);
  const mutationSeqRef = useRef(0);
  const lastAppliedSeqRef = useRef(0);

  const runMutation = useCallback(async (operation: () => Promise<RepositoryResult>) => {
    const seq = ++mutationSeqRef.current;
    try {
      const { data: next, patch } = await operation();
      // Only apply if this is the latest mutation; stale results are discarded
      // to prevent race conditions from concurrent mutations.
      if (seq < lastAppliedSeqRef.current) {
        return next;
      }
      lastAppliedSeqRef.current = seq;
      const touchesTaskData = patch.affectedKeys.some((key) => key === "tasks" || key === "reminders");
      useTodoStore.setState((state) => ({
        data: state.data ? applyRepositoryPatch(state.data, next, patch) : next,
        error: null,
        ...(touchesTaskData ? { tasksRevision: state.tasksRevision + 1 } : {}),
      }));
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setTodoError(message);
      throw err;
    }
  }, []);

  useEffect(() => {
    let active = true;
    let timeoutId: number | null = null;

    const loadWithTimeout = Promise.race([
      measureDevAsync("repository.load", () => repository.load(getInitialWorkspaceId())),
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error("Timed out while loading workspace data."));
        }, LOAD_TIMEOUT_MS);
      }),
    ]);

    loadWithTimeout
      .then((next) => {
        if (active) {
          setTodoData(next);
          setTodoError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setTodoError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }

        if (active) {
          setTodoLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [repository]);

  useEffect(() => {
    if (!data) {
      return;
    }

    void invoke("set_close_to_tray", { value: data.settings.closeToTray }).catch(() => undefined);
  }, [data]);

  const actions: TodoActions = useMemo(
    () => ({
      selectWorkspace: (workspaceId: string) => runMutation(() => repository.selectWorkspace(workspaceId)),
      loadAvailableTasks: (workspaceId?: string) =>
        measureDevAsync("repository.loadAvailableTasks", () => repository.loadAvailableTasks(workspaceId)),
      loadRecoveryItems: () => measureDevAsync("repository.loadRecoveryItems", () => repository.loadRecoveryItems()),
      loadTaskPage: (input: TaskPageInput) => measureDevAsync("repository.loadTaskPage", () => repository.loadTaskPage(input)),
      loadDueDateCounts: (input: { workspaceId?: string; from: string; to: string }) =>
        repository.loadDueDateCounts(input),
      createWorkspace: (input: CreateWorkspaceInput) => runMutation(() => repository.createWorkspace(input)),
      updateWorkspace: (id: string, patch: UpdateWorkspaceInput) => runMutation(() => repository.updateWorkspace(id, patch)),
      deleteWorkspace: (id: string) => runMutation(() => repository.deleteWorkspace(id)),
      restoreWorkspace: (id: string) => runMutation(() => repository.restoreWorkspace(id)),
      createWorkspaceFolder: (input: CreateWorkspaceFolderInput) => runMutation(() => repository.createWorkspaceFolder(input)),
      deleteWorkspaceFolder: (id: string) => runMutation(() => repository.deleteWorkspaceFolder(id)),
      restoreWorkspaceFolder: (id: string) => runMutation(() => repository.restoreWorkspaceFolder(id)),
      createProject: (input: CreateProjectInput) => runMutation(() => repository.createProject(input)),
      moveTaskToWorkspace: (taskId: string, workspaceId: string) =>
        runMutation(() => repository.moveTaskToWorkspace(taskId, workspaceId)),
      updateProject: (
        id: string,
        patch: Partial<Pick<Project, "name" | "color" | "dueDate" | "status" | "workingFolder">>,
      ) => runMutation(() => repository.updateProject(id, patch)),
      archiveProject: (id: string) => runMutation(() => repository.archiveProject(id)),
      unarchiveProject: (id: string) => runMutation(() => repository.unarchiveProject(id)),
      createTask: (input: CreateTaskInput) => runMutation(() => repository.createTask(input)),
      createRecurringTask: (input: CreateRecurringTaskInput) => runMutation(() => repository.createRecurringTask(input)),
      updateRecurringTaskTemplate: (id: string, patch: UpdateRecurringTaskTemplateInput) =>
        runMutation(() => repository.updateRecurringTaskTemplate(id, patch)),
      updateRecurringSeries: (
        id: string,
        patch: UpdateRecurringTaskTemplateInput,
        mode: "template" | "openFuture",
      ) => runMutation(() => repository.updateRecurringSeries(id, patch, mode)),
      disableRecurringTaskTemplate: (id: string) => runMutation(() => repository.disableRecurringTaskTemplate(id)),
      updateTask: (
        id: string,
        patch: Partial<Pick<Task, "title" | "notes" | "dueDate" | "dueTime" | "priority" | "projectId" | "workingFolder" | "tags">>,
      ) => runMutation(() => repository.updateTask(id, patch)),
      setTaskParent: (taskId: string, parentId: string | null) =>
        runMutation(() => repository.setTaskParent(taskId, parentId)),
      updateTaskReminder: (taskId: string, offsetMinutes: number | null) =>
        runMutation(() => repository.updateTaskReminder(taskId, offsetMinutes)),
      toggleTask: (id: string) => runMutation(() => repository.toggleTask(id)),
      setTaskStatus: (id: string, status: TaskStatus) => runMutation(() => repository.setTaskStatus(id, status)),
      bulkSetTaskStatus: (ids: string[], status: TaskStatus) =>
        runMutation(() => repository.bulkSetTaskStatus(ids, status)),
      bulkDeleteTasks: (ids: string[]) => runMutation(() => repository.bulkDeleteTasks(ids)),
      bulkMoveTasksToProject: (ids: string[], projectId: string | null) =>
        runMutation(() => repository.bulkMoveTasksToProject(ids, projectId)),
      deleteTask: (id: string) => runMutation(() => repository.deleteTask(id)),
      restoreTask: (id: string) => runMutation(() => repository.restoreTask(id)),
      addAttachment: (input: CreateAttachmentInput) => runMutation(() => repository.addAttachment(input)),
      deleteAttachment: (id: string) => runMutation(() => repository.deleteAttachment(id)),
      markReminderFired: (id: string) => runMutation(() => repository.markReminderFired(id)),
      markReminderFailed: (id: string, reason: string) => runMutation(() => repository.markReminderFailed(id, reason)),
      snoozeReminder: (id: string, untilIso: string) => runMutation(() => repository.snoozeReminder(id, untilIso)),
      disableReminder: (id: string) => runMutation(() => repository.disableReminder(id)),
      createTaskReminder: (taskId: string, offsetMinutes: number) =>
        runMutation(() => repository.createTaskReminder(taskId, offsetMinutes)),
      deleteReminder: (id: string) => runMutation(() => repository.deleteReminder(id)),
      createSavedView: (input: CreateSavedTaskViewInput) => runMutation(() => repository.createSavedView(input)),
      updateSavedView: (id: string, input: CreateSavedTaskViewInput) => runMutation(() => repository.updateSavedView(id, input)),
      deleteSavedView: (id: string) => runMutation(() => repository.deleteSavedView(id)),
      exportBackup: () => repository.exportBackup(),
      importBackup: (payload: BackupPayload, mode?: ImportBackupMode) =>
        runMutation(() => repository.importBackup(payload, mode)),
      loadReminderEvents: (reminderId: string) => repository.loadReminderEvents(reminderId),
      exportCurrentWorkspaceCsv: () => repository.exportCurrentWorkspaceCsv(),
      exportCurrentWorkspaceIcs: () => repository.exportCurrentWorkspaceIcs(),
      saveSettings: (settings: Settings) => runMutation(() => repository.saveSettings(settings)),
    }),
    [repository, runMutation],
  );

  return { data, isLoading, error, actions };
};
