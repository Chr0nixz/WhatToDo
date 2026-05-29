import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";

import type { Task } from "./types";

export const toDateKey = (date: Date) => format(date, "yyyy-MM-dd");

export const parseDateKey = (dateKey: string) => parseISO(`${dateKey}T00:00:00`);

export const todayKey = () => toDateKey(new Date());

export const getWeekDays = (selectedDateKey: string) => {
  const start = startOfWeek(parseDateKey(selectedDateKey), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
};

export const getMonthDays = (selectedDateKey: string) => {
  const selectedDate = parseDateKey(selectedDateKey);
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const days: Date[] = [];

  for (let cursor = gridStart; days.length < 42; cursor = addDays(cursor, 1)) {
    days.push(cursor);
    if (days.length >= 35 && !isSameMonth(cursor, monthEnd)) {
      break;
    }
  }

  return days;
};

export const shiftMonth = (selectedDateKey: string, amount: number) => {
  const selectedDate = parseDateKey(selectedDateKey);
  return toDateKey(amount > 0 ? addMonths(selectedDate, amount) : subMonths(selectedDate, Math.abs(amount)));
};

export const isToday = (date: Date) => isSameDay(date, new Date());

export const sortTasks = (tasks: Task[]) => {
  const priorityRank = { high: 0, medium: 1, low: 2 };

  return [...tasks].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "todo" ? -1 : 1;
    }

    const dueTime = (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99");
    if (dueTime !== 0) {
      return dueTime;
    }

    const priority = priorityRank[a.priority] - priorityRank[b.priority];
    if (priority !== 0) {
      return priority;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });
};

export const tasksForDate = (tasks: Task[], dateKey: string) =>
  sortTasks(tasks.filter((task) => task.deletedAt === null && task.dueDate === dateKey));

export const openTasks = (tasks: Task[]) =>
  tasks.filter((task) => task.deletedAt === null && task.status === "todo");

export const overdueTasks = (tasks: Task[], referenceDateKey = todayKey()) =>
  sortTasks(
    openTasks(tasks).filter((task) => differenceInCalendarDays(parseDateKey(task.dueDate), parseDateKey(referenceDateKey)) < 0),
  );

export const taskCountsByDate = (tasks: Task[]) =>
  tasks.reduce<Record<string, number>>((counts, task) => {
    if (task.deletedAt || task.status === "completed") {
      return counts;
    }

    counts[task.dueDate] = (counts[task.dueDate] ?? 0) + 1;
    return counts;
  }, {});

export const buildReminderDate = (task: Pick<Task, "dueDate" | "dueTime">, offsetMinutes: number) => {
  const due = new Date(`${task.dueDate}T${task.dueTime ?? "09:00"}:00`);
  due.setMinutes(due.getMinutes() - offsetMinutes);
  return due.toISOString();
};
