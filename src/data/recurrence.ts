import type { RecurringTaskTemplate, Task } from "./types";

type RecurrenceRule = Pick<
  RecurringTaskTemplate,
  "frequency" | "interval" | "byWeekday" | "anchorDate" | "endDate"
>;

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

const nextYearlyDate = (fromDateKey: string, anchorDate: string, interval: number) => {
  const fromDate = parseDateKey(fromDateKey);
  const anchor = parseDateKey(anchorDate);
  const anchorMonth = anchor.getUTCMonth();
  const anchorDay = anchor.getUTCDate();
  const targetYear = fromDate.getUTCFullYear() + interval;
  // Feb 29 anchor falls back to Feb 28 in non-leap years.
  const lastDay = new Date(Date.UTC(targetYear, anchorMonth + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(targetYear, anchorMonth, Math.min(anchorDay, lastDay)));
  return formatDateKey(target);
};

const nextWeekdayDate = (
  fromDateKey: string,
  anchorDate: string,
  interval: number,
  byWeekday: number[],
) => {
  const anchor = parseDateKey(anchorDate);
  // Scan forward from the day after fromDateKey. Bound the search to two full
  // cycles (interval weeks * 2) so a valid match is always found for non-empty
  // byWeekday while avoiding an unbounded loop.
  const maxScan = interval * 7 * 2 + 7;
  for (let step = 1; step <= maxScan; step += 1) {
    const candidate = parseDateKey(addDays(fromDateKey, step));
    const daysSinceAnchor = Math.floor((candidate.getTime() - anchor.getTime()) / 86_400_000);
    const weekIndex = Math.floor(daysSinceAnchor / 7);
    const isActiveWeek = ((weekIndex % interval) + interval) % interval === 0;
    if (isActiveWeek && byWeekday.includes(candidate.getUTCDay())) {
      return formatDateKey(candidate);
    }
  }
  // Fallback: should not happen for valid byWeekday, but keep behaviour safe.
  return addDays(fromDateKey, interval * 7);
};

export const getNextRecurrenceDate = (rule: RecurrenceRule, fromDateKey: string) => {
  const interval = Math.max(1, rule.interval);
  const byWeekday = rule.byWeekday && rule.byWeekday.length > 0 ? rule.byWeekday : null;

  let nextDate: string;
  if (rule.frequency === "daily") {
    nextDate = addDays(fromDateKey, interval);
  } else if (rule.frequency === "weekly") {
    if (byWeekday) {
      nextDate = nextWeekdayDate(fromDateKey, rule.anchorDate, interval, byWeekday);
    } else {
      nextDate = addDays(fromDateKey, interval * 7);
    }
  } else if (rule.frequency === "monthly") {
    nextDate = nextMonthlyDate(fromDateKey, rule.anchorDate, interval);
  } else {
    nextDate = nextYearlyDate(fromDateKey, rule.anchorDate, interval);
  }

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
  parentId: null,
  tags: [],
});
