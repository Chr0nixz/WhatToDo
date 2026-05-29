import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { createRepository } from "@/data/repository";
import type {
  AppData,
  CreateProjectInput,
  CreateTaskInput,
  CreateWorkspaceFolderInput,
  CreateWorkspaceInput,
  Project,
  Settings,
  Task,
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
  createProject: (input: CreateProjectInput) => Promise<AppData>;
  moveTaskToWorkspace: (taskId: string, workspaceId: string) => Promise<AppData>;
  updateProject: (
    id: string,
    patch: Partial<Pick<Project, "name" | "color" | "dueDate" | "status" | "workingFolder">>,
  ) => Promise<AppData>;
  archiveProject: (id: string) => Promise<AppData>;
  createTask: (input: CreateTaskInput) => Promise<AppData>;
  updateTask: (
    id: string,
    patch: Partial<Pick<Task, "title" | "notes" | "dueDate" | "dueTime" | "priority" | "projectId" | "workingFolder">>,
  ) => Promise<AppData>;
  toggleTask: (id: string) => Promise<AppData>;
  deleteTask: (id: string) => Promise<AppData>;
  markReminderFired: (id: string) => Promise<AppData>;
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
      createProject: (input: CreateProjectInput) => run(() => repository.createProject(input)),
      moveTaskToWorkspace: (taskId: string, workspaceId: string) =>
        run(() => repository.moveTaskToWorkspace(taskId, workspaceId)),
      updateProject: (
        id: string,
        patch: Partial<Pick<Project, "name" | "color" | "dueDate" | "status" | "workingFolder">>,
      ) => run(() => repository.updateProject(id, patch)),
      archiveProject: (id: string) => run(() => repository.archiveProject(id)),
      createTask: (input: CreateTaskInput) => run(() => repository.createTask(input)),
      updateTask: (
        id: string,
        patch: Partial<Pick<Task, "title" | "notes" | "dueDate" | "dueTime" | "priority" | "projectId" | "workingFolder">>,
      ) => run(() => repository.updateTask(id, patch)),
      toggleTask: (id: string) => run(() => repository.toggleTask(id)),
      deleteTask: (id: string) => run(() => repository.deleteTask(id)),
      markReminderFired: (id: string) => run(() => repository.markReminderFired(id)),
      saveSettings: (settings: Settings) => run(() => repository.saveSettings(settings)),
    }),
    [repository, run],
  );

  return { data, isLoading, error, actions };
};
