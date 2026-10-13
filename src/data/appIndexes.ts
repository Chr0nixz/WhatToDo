import type { AppData, AppIndexes, Project, Reminder, TaskSummary } from "./types";

export const EMPTY_APP_INDEXES: AppIndexes = Object.freeze({
  projectsById: new Map<string, Project>(),
  tasksById: new Map<string, TaskSummary>(),
  tasksByDate: new Map<string, TaskSummary[]>(),
  remindersByTaskId: new Map<string, Reminder[]>(),
  reminderTaskIds: new Set<string>(),
});

export const buildAppIndexes = (
  tasks: TaskSummary[],
  projects: Project[],
  reminders: Reminder[],
): AppIndexes => {
  if (tasks.length === 0 && projects.length === 0 && reminders.length === 0) {
    return EMPTY_APP_INDEXES;
  }

  const projectsById = new Map<string, Project>();
  for (const project of projects) {
    projectsById.set(project.id, project);
  }

  const tasksById = new Map<string, TaskSummary>();
  const tasksByDate = new Map<string, TaskSummary[]>();
  for (const task of tasks) {
    tasksById.set(task.id, task);
    const bucket = tasksByDate.get(task.dueDate);
    if (bucket) {
      bucket.push(task);
    } else {
      tasksByDate.set(task.dueDate, [task]);
    }
  }

  const remindersByTaskId = new Map<string, Reminder[]>();
  const reminderTaskIds = new Set<string>();
  for (const reminder of reminders) {
    const bucket = remindersByTaskId.get(reminder.taskId);
    if (bucket) {
      bucket.push(reminder);
    } else {
      remindersByTaskId.set(reminder.taskId, [reminder]);
    }

    if (reminder.enabled) {
      reminderTaskIds.add(reminder.taskId);
    }
  }

  return {
    projectsById,
    tasksById,
    tasksByDate,
    remindersByTaskId,
    reminderTaskIds,
  };
};

/** @deprecated Prefer buildAppIndexes(tasks, projects, reminders). */
export const buildAppIndexesFromData = (data: Pick<AppData, "tasks" | "projects" | "reminders">): AppIndexes =>
  buildAppIndexes(data.tasks, data.projects, data.reminders);
