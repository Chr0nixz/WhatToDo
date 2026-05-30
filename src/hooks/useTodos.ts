import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { createRepository } from "@/data/repository";
import type {
  AppData,
  BackupPayload,
  CreateRecurringTaskInput,
  CreateSavedTaskViewInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateWorkspaceFolderInput,
  CreateWorkspaceInput,
  Project,
  Settings,
  Task,
  UpdateRecurringTaskTemplateInput,
  UpdateWorkspaceInput,
} from "@/data/types";
import { getInitialWorkspaceId } from "@/lib/windowContext";

const LOAD_TIMEOUT_MS = 8000;

export type TodoActions = {
  selectWorkspace: (workspaceId: string) => Promise<AppData>;
  createWorkspace: (input: CreateWorkspaceInput) => Promise<AppData>;
  updateWorkspace: (id: string, patch: UpdateWorkspaceInput) => Promise<AppData>;
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
  disableRecurringTaskTemplate: (id: string) => Promise<AppData>;
  updateTask: (
    id: string,
    patch: Partial<Pick<Task, "title" | "notes" | "dueDate" | "dueTime" | "priority" | "projectId" | "workingFolder">>,
  ) => Promise<AppData>;
  updateTaskReminder: (taskId: string, offsetMinutes: number | null) => Promise<AppData>;
  toggleTask: (id: string) => Promise<AppData>;
  deleteTask: (id: string) => Promise<AppData>;
  restoreTask: (id: string) => Promise<AppData>;
  markReminderFired: (id: string) => Promise<AppData>;
  markReminderFailed: (id: string, reason: string) => Promise<AppData>;
  snoozeReminder: (id: string, untilIso: string) => Promise<AppData>;
  disableReminder: (id: string) => Promise<AppData>;
  createSavedView: (input: CreateSavedTaskViewInput) => Promise<AppData>;
  updateSavedView: (id: string, input: CreateSavedTaskViewInput) => Promise<AppData>;
  deleteSavedView: (id: string) => Promise<AppData>;
  exportBackup: () => Promise<BackupPayload>;
  importBackup: (payload: BackupPayload) => Promise<AppData>;
  exportCurrentWorkspaceCsv: () => Promise<string>;
  exportCurrentWorkspaceIcs: () => Promise<string>;
  saveSettings: (settings: Settings) => Promise<AppData>;
};

export const useTodos = () => {
  const repository = useMemo(() => createRepository(), []);
  const [data, setData] = useState<AppData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (operation: () => Promise<AppData>) => {
    try {
      const next = await operation();
      setData(next);
      setError(null);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    }
  }, []);

  useEffect(() => {
    let active = true;
    let timeoutId: number | null = null;

    const loadWithTimeout = Promise.race([
      repository.load(getInitialWorkspaceId()),
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error("Timed out while loading workspace data."));
        }, LOAD_TIMEOUT_MS);
      }),
    ]);

    loadWithTimeout
      .then((next) => {
        if (active) {
          setData(next);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }

        if (active) {
          setIsLoading(false);
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
      selectWorkspace: (workspaceId: string) => run(() => repository.selectWorkspace(workspaceId)),
      createWorkspace: (input: CreateWorkspaceInput) => run(() => repository.createWorkspace(input)),
      updateWorkspace: (id: string, patch: UpdateWorkspaceInput) => run(() => repository.updateWorkspace(id, patch)),
      createWorkspaceFolder: (input: CreateWorkspaceFolderInput) => run(() => repository.createWorkspaceFolder(input)),
      deleteWorkspaceFolder: (id: string) => run(() => repository.deleteWorkspaceFolder(id)),
      restoreWorkspaceFolder: (id: string) => run(() => repository.restoreWorkspaceFolder(id)),
      createProject: (input: CreateProjectInput) => run(() => repository.createProject(input)),
      moveTaskToWorkspace: (taskId: string, workspaceId: string) =>
        run(() => repository.moveTaskToWorkspace(taskId, workspaceId)),
      updateProject: (
        id: string,
        patch: Partial<Pick<Project, "name" | "color" | "dueDate" | "status" | "workingFolder">>,
      ) => run(() => repository.updateProject(id, patch)),
      archiveProject: (id: string) => run(() => repository.archiveProject(id)),
      unarchiveProject: (id: string) => run(() => repository.unarchiveProject(id)),
      createTask: (input: CreateTaskInput) => run(() => repository.createTask(input)),
      createRecurringTask: (input: CreateRecurringTaskInput) => run(() => repository.createRecurringTask(input)),
      updateRecurringTaskTemplate: (id: string, patch: UpdateRecurringTaskTemplateInput) =>
        run(() => repository.updateRecurringTaskTemplate(id, patch)),
      disableRecurringTaskTemplate: (id: string) => run(() => repository.disableRecurringTaskTemplate(id)),
      updateTask: (
        id: string,
        patch: Partial<Pick<Task, "title" | "notes" | "dueDate" | "dueTime" | "priority" | "projectId" | "workingFolder">>,
      ) => run(() => repository.updateTask(id, patch)),
      updateTaskReminder: (taskId: string, offsetMinutes: number | null) =>
        run(() => repository.updateTaskReminder(taskId, offsetMinutes)),
      toggleTask: (id: string) => run(() => repository.toggleTask(id)),
      deleteTask: (id: string) => run(() => repository.deleteTask(id)),
      restoreTask: (id: string) => run(() => repository.restoreTask(id)),
      markReminderFired: (id: string) => run(() => repository.markReminderFired(id)),
      markReminderFailed: (id: string, reason: string) => run(() => repository.markReminderFailed(id, reason)),
      snoozeReminder: (id: string, untilIso: string) => run(() => repository.snoozeReminder(id, untilIso)),
      disableReminder: (id: string) => run(() => repository.disableReminder(id)),
      createSavedView: (input: CreateSavedTaskViewInput) => run(() => repository.createSavedView(input)),
      updateSavedView: (id: string, input: CreateSavedTaskViewInput) => run(() => repository.updateSavedView(id, input)),
      deleteSavedView: (id: string) => run(() => repository.deleteSavedView(id)),
      exportBackup: () => repository.exportBackup(),
      importBackup: (payload: BackupPayload) => run(() => repository.importBackup(payload)),
      exportCurrentWorkspaceCsv: () => repository.exportCurrentWorkspaceCsv(),
      exportCurrentWorkspaceIcs: () => repository.exportCurrentWorkspaceIcs(),
      saveSettings: (settings: Settings) => run(() => repository.saveSettings(settings)),
    }),
    [repository, run],
  );

  return { data, isLoading, error, actions };
};
