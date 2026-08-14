import { useEffect, useRef } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import type { AppData, DueReminder } from "@/data/types";

const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type ReminderTickData = Pick<AppData, "tasks" | "reminders" | "settings">;

export type ReminderNotifyPayload = {
  id: string;
  title: string;
};

export const dueRemindersForData = (data: ReminderTickData, now = Date.now()) => {
  const tasksById = new Map(data.tasks.map((task) => [task.id, task]));

  return data.reminders.filter((reminder) => {
    const task = tasksById.get(reminder.taskId);

    return (
      reminder.enabled &&
      reminder.firedAt === null &&
      reminder.failedAt === null &&
      task?.deletedAt === null &&
      // Active tasks (todo + in_progress) still need reminders; terminal states don't
      (task?.status === "todo" || task?.status === "in_progress") &&
      new Date(reminder.snoozedUntil ?? reminder.remindAt).getTime() <= now
    );
  });
};

export const useReminders = (
  notificationsEnabled: boolean,
  loadDueReminders: (nowIso: string) => Promise<DueReminder[]>,
  markReminderFired: (id: string) => Promise<AppData>,
  markReminderFailed: (id: string, reason: string) => Promise<AppData>,
  onReminderNotified?: (task: ReminderNotifyPayload) => void,
  onPermissionDenied?: () => Promise<void> | void,
) => {
  const latestStateRef = useRef({
    loadDueReminders,
    markReminderFired,
    markReminderFailed,
    onReminderNotified,
    onPermissionDenied,
  });
  const isTickingRef = useRef(false);
  const permissionDeniedRef = useRef(false);
  const activeReminderIdsRef = useRef(new Set<string>());

  useEffect(() => {
    latestStateRef.current = {
      loadDueReminders,
      markReminderFired,
      markReminderFailed,
      onReminderNotified,
      onPermissionDenied,
    };
  }, [loadDueReminders, markReminderFailed, markReminderFired, onPermissionDenied, onReminderNotified]);

  useEffect(() => {
    if (!notificationsEnabled || !isTauriRuntime()) {
      return;
    }

    let cancelled = false;
    permissionDeniedRef.current = false;

    const tick = async () => {
      if (isTickingRef.current || permissionDeniedRef.current) {
        return;
      }

      isTickingRef.current = true;

      try {
        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          const permission = await requestPermission();
          permissionGranted = permission === "granted";
        }

        if (!permissionGranted) {
          permissionDeniedRef.current = true;
          await latestStateRef.current.onPermissionDenied?.();
          return;
        }

        if (cancelled) {
          return;
        }

        const dueReminders = await latestStateRef.current.loadDueReminders(new Date().toISOString());
        if (cancelled || dueReminders.length === 0) {
          return;
        }

        for (const item of dueReminders) {
          if (cancelled || activeReminderIdsRef.current.has(item.reminder.id)) {
            continue;
          }

          activeReminderIdsRef.current.add(item.reminder.id);
          try {
            await sendNotification({
              title: "WhatToDo",
              body: item.task.dueTime ? `${item.task.title} · ${item.task.dueTime}` : item.task.title,
            });
            latestStateRef.current.onReminderNotified?.({ id: item.task.id, title: item.task.title });
            await latestStateRef.current.markReminderFired(item.reminder.id);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await latestStateRef.current.markReminderFailed(item.reminder.id, message);
          } finally {
            activeReminderIdsRef.current.delete(item.reminder.id);
          }
        }
      } catch {
        return;
      } finally {
        isTickingRef.current = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [notificationsEnabled]);
};
