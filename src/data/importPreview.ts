import type { AppData, BackupPayload } from "./types";

export type ImportEntityCounts = {
  workspaces: number;
  workspaceFolders: number;
  projects: number;
  tasks: number;
  reminders: number;
  savedViews: number;
  recurringTaskTemplates: number;
  attachments: number;
  reminderEvents: number;
};

export type ImportConflictSummary = {
  counts: ImportEntityCounts;
  overwrite: {
    workspaces: number;
    workspaceFolders: number;
    projects: number;
    tasks: number;
    reminders: number;
    savedViews: number;
    recurringTaskTemplates: number;
    attachments: number;
  };
  created: {
    workspaces: number;
    workspaceFolders: number;
    projects: number;
    tasks: number;
    reminders: number;
    savedViews: number;
    recurringTaskTemplates: number;
    attachments: number;
  };
  sampleOverwriteTaskTitles: string[];
  overlappingWorkspaceNames: string[];
};

const countById = <T extends { id: string }>(current: T[], incoming: T[]) => {
  const currentIds = new Set(current.map((item) => item.id));
  let overwrite = 0;
  let created = 0;
  for (const item of incoming) {
    if (currentIds.has(item.id)) {
      overwrite += 1;
    } else {
      created += 1;
    }
  }
  return { overwrite, created };
};

export const summarizeImportPreview = (
  current: Pick<
    AppData,
    | "workspaces"
    | "workspaceFolders"
    | "projects"
    | "tasks"
    | "reminders"
    | "savedViews"
    | "recurringTaskTemplates"
    | "attachments"
  >,
  backup: BackupPayload,
): ImportConflictSummary => {
  const attachments =
    backup.whattodoBackupVersion === 2 || backup.whattodoBackupVersion === 3
      ? (backup.attachments ?? [])
      : [];
  const recurring = backup.recurringTaskTemplates ?? [];
  const reminderEvents = backup.reminderEvents ?? [];

  const workspaces = countById(current.workspaces, backup.workspaces);
  const workspaceFolders = countById(current.workspaceFolders, backup.workspaceFolders);
  const projects = countById(current.projects, backup.projects);
  const tasks = countById(current.tasks, backup.tasks);
  const reminders = countById(current.reminders, backup.reminders);
  const savedViews = countById(current.savedViews, backup.savedViews);
  const recurringTaskTemplates = countById(current.recurringTaskTemplates, recurring);
  const attachmentCounts = countById(current.attachments, attachments);

  const currentTaskIds = new Set(current.tasks.map((task) => task.id));
  const sampleOverwriteTaskTitles = backup.tasks
    .filter((task) => currentTaskIds.has(task.id))
    .slice(0, 5)
    .map((task) => task.title);

  const currentWorkspaceIds = new Set(current.workspaces.map((workspace) => workspace.id));
  const overlappingWorkspaceNames = backup.workspaces
    .filter((workspace) => currentWorkspaceIds.has(workspace.id))
    .map((workspace) => workspace.name);

  return {
    counts: {
      workspaces: backup.workspaces.length,
      workspaceFolders: backup.workspaceFolders.length,
      projects: backup.projects.length,
      tasks: backup.tasks.length,
      reminders: backup.reminders.length,
      savedViews: backup.savedViews.length,
      recurringTaskTemplates: recurring.length,
      attachments: attachments.length,
      reminderEvents: reminderEvents.length,
    },
    overwrite: {
      workspaces: workspaces.overwrite,
      workspaceFolders: workspaceFolders.overwrite,
      projects: projects.overwrite,
      tasks: tasks.overwrite,
      reminders: reminders.overwrite,
      savedViews: savedViews.overwrite,
      recurringTaskTemplates: recurringTaskTemplates.overwrite,
      attachments: attachmentCounts.overwrite,
    },
    created: {
      workspaces: workspaces.created,
      workspaceFolders: workspaceFolders.created,
      projects: projects.created,
      tasks: tasks.created,
      reminders: reminders.created,
      savedViews: savedViews.created,
      recurringTaskTemplates: recurringTaskTemplates.created,
      attachments: attachmentCounts.created,
    },
    sampleOverwriteTaskTitles,
    overlappingWorkspaceNames,
  };
};
