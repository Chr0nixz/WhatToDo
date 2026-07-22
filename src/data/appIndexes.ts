import type { AppData, AppIndexes, Project, Reminder, TaskSummary } from "./types";

export const buildAppIndexes = (
  tasks: TaskSummary[],
  projects: Project[],
  reminders: Reminder[],
): AppIndexes => {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const tasksByDate = new Map<string, TaskSummary[]>();
  const remindersByTaskId = new Map<string, Reminder[]>();
  const reminderTaskIds = new Set<string>();

  for (const task of tasks) {
    const bucket = tasksByDate.get(task.dueDate) ?? [];
    bucket.push(task);
    tasksByDate.set(task.dueDate, bucket);
  }

  for (const reminder of reminders) {
    const bucket = remindersByTaskId.get(reminder.taskId) ?? [];
    bucket.push(reminder);
    remindersByTaskId.set(reminder.taskId, bucket);

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
