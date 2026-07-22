import type { AppData, Reminder, TaskSummary } from "./types";

export type ReminderCenterGroupId = "failed" | "missed" | "upcoming" | "fired";

export type SnoozeOption = "tenMinutes" | "oneHour" | "tomorrowMorning";

export type ReminderCenterItem = {
  reminder: Reminder;
  task: TaskSummary;
  effectiveAt: string;
  group: ReminderCenterGroupId;
};

export type ReminderCenterGroups = Record<ReminderCenterGroupId, ReminderCenterItem[]>;

export const emptyReminderCenterGroups = (): ReminderCenterGroups => ({
  failed: [],
  missed: [],
  upcoming: [],
  fired: [],
});

export const effectiveReminderTime = (reminder: Reminder) => reminder.snoozedUntil ?? reminder.remindAt;

export const groupReminderCenterItems = (
  data: Pick<AppData, "tasks" | "reminders">,
  now = Date.now(),
): ReminderCenterGroups => {
  const groups = emptyReminderCenterGroups();
  const tasksById = new Map(data.tasks.map((task) => [task.id, task]));

  for (const reminder of data.reminders) {
    if (!reminder.enabled) {
      continue;
    }

    const task = tasksById.get(reminder.taskId);
    if (!task || task.deletedAt !== null) {
      continue;
    }

    const effectiveAt = effectiveReminderTime(reminder);
    const effectiveMs = new Date(effectiveAt).getTime();
    if (Number.isNaN(effectiveMs)) {
      continue;
    }

    if (reminder.failedAt != null && reminder.firedAt === null) {
      groups.failed.push({ reminder, task, effectiveAt, group: "failed" });
      continue;
    }

    if (reminder.firedAt !== null) {
      groups.fired.push({ reminder, task, effectiveAt, group: "fired" });
      continue;
    }

    // Skip terminal states: completed and cancelled tasks don't need reminders
    if (task.status === "completed" || task.status === "cancelled") {
      continue;
    }

    groups[effectiveMs <= now ? "missed" : "upcoming"].push({
      reminder,
      task,
      effectiveAt,
      group: effectiveMs <= now ? "missed" : "upcoming",
    });
  }

  groups.missed.sort((a, b) => new Date(a.effectiveAt).getTime() - new Date(b.effectiveAt).getTime());
  groups.failed.sort(
    (a, b) =>
      new Date(b.reminder.failedAt ?? b.effectiveAt).getTime() - new Date(a.reminder.failedAt ?? a.effectiveAt).getTime(),
  );
  groups.upcoming.sort((a, b) => new Date(a.effectiveAt).getTime() - new Date(b.effectiveAt).getTime());
  groups.fired.sort(
    (a, b) =>
      new Date(b.reminder.firedAt ?? b.effectiveAt).getTime() - new Date(a.reminder.firedAt ?? a.effectiveAt).getTime(),
  );

  return groups;
};

export const getSnoozeUntil = (option: SnoozeOption, now = new Date()) => {
  if (option === "tenMinutes") {
    return new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  }

  if (option === "oneHour") {
    return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return tomorrow.toISOString();
};
