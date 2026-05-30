import type { RecurringTaskTemplate, Task } from "./types";

type RecurrenceRule = Pick<RecurringTaskTemplate, "frequency" | "interval" | "anchorDate" | "endDate">;

const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateKey = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (dateKey: string, days: number) => {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateKey(date);
};

const nextMonthlyDate = (fromDateKey: string, anchorDate: string, interval: number) => {
  const fromDate = parseDateKey(fromDateKey);
  const anchorDay = parseDateKey(anchorDate).getUTCDate();
  const targetYear = fromDate.getUTCFullYear();
  const targetMonth = fromDate.getUTCMonth() + interval;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(targetYear, targetMonth, Math.min(anchorDay, lastDay)));
  return formatDateKey(target);
};

export const getNextRecurrenceDate = (rule: RecurrenceRule, fromDateKey: string) => {
  const interval = Math.max(1, rule.interval);
  const nextDate =
    rule.frequency === "daily"
      ? addDays(fromDateKey, interval)
      : rule.frequency === "weekly"
        ? addDays(fromDateKey, interval * 7)
        : nextMonthlyDate(fromDateKey, rule.anchorDate, interval);

  if (rule.endDate && nextDate > rule.endDate) {
    return null;
  }

  return nextDate;
};

export const buildTaskFromRecurringTemplate = (
  template: RecurringTaskTemplate,
  dueDate: string,
  timestamp: string,
  createTaskId: () => string,
): Task => ({
  id: createTaskId(),
  workspaceId: template.workspaceId,
  projectId: template.projectId,
  workingFolder: template.workingFolder,
  title: template.title,
  notes: template.notes,
  dueDate,
  dueTime: template.dueTime,
  timezone: template.timezone,
  priority: template.priority,
  status: "todo",
  completedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: null,
  recurrenceTemplateId: template.id,
  recurrenceInstanceDate: dueDate,
});
