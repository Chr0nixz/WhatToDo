import { endOfWeek, isWithinInterval } from "date-fns";

import { overdueTasks, parseDateKey, todayKey } from "./date";
import type { AppData, Task, TaskViewFilters } from "./types";

export const defaultTaskViewFilters = (): TaskViewFilters => ({
  scope: "open",
  priority: "all",
  projectId: "all",
  reminder: "all",
  folder: "all",
  dateRange: "all",
});

export const taskMatchesFilters = (task: Task, data: AppData, filters: TaskViewFilters, referenceDateKey = todayKey()) => {
  if (filters.scope === "open" && task.status !== "todo") {
    return false;
  }

  if (filters.scope === "completed" && task.status !== "completed") {
    return false;
  }

  if (filters.priority !== "all" && task.priority !== filters.priority) {
    return false;
  }

  if (filters.projectId === "none" && task.projectId !== null) {
    return false;
  }

  if (filters.projectId !== "all" && filters.projectId !== "none" && task.projectId !== filters.projectId) {
    return false;
  }

  const hasReminder = data.reminders.some((reminder) => reminder.taskId === task.id && reminder.enabled);
  if (filters.reminder === "with" && !hasReminder) {
    return false;
  }
  if (filters.reminder === "without" && hasReminder) {
    return false;
  }

  const hasFolder = Boolean(task.workingFolder);
  if (filters.folder === "with" && !hasFolder) {
    return false;
  }
  if (filters.folder === "without" && hasFolder) {
    return false;
  }

  if (filters.dateRange === "today" && task.dueDate !== referenceDateKey) {
    return false;
  }

  if (filters.dateRange === "overdue") {
    return overdueTasks([task], referenceDateKey).length > 0;
  }

  if (filters.dateRange === "week") {
    const referenceDate = parseDateKey(referenceDateKey);
    return isWithinInterval(parseDateKey(task.dueDate), { start: referenceDate, end: endOfWeek(referenceDate) });
  }

  return true;
};
