import type { AppData, AppIndexes, Reminder, Task } from "./types";

export const buildAppIndexes = (data: AppData): AppIndexes => {
  const projectsById = new Map(data.projects.map((project) => [project.id, project]));
  const tasksById = new Map(data.tasks.map((task) => [task.id, task]));
  const tasksByDate = new Map<string, Task[]>();
  const remindersByTaskId = new Map<string, Reminder[]>();
  const reminderTaskIds = new Set<string>();

  for (const task of data.tasks) {
    const tasks = tasksByDate.get(task.dueDate) ?? [];
    tasks.push(task);
    tasksByDate.set(task.dueDate, tasks);
  }

  for (const reminder of data.reminders) {
    const reminders = remindersByTaskId.get(reminder.taskId) ?? [];
    reminders.push(reminder);
    remindersByTaskId.set(reminder.taskId, reminders);

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
