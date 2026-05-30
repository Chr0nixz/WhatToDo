import { useEffect, useRef } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import type { AppData } from "@/data/types";

const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const dueRemindersForData = (data: AppData, now = Date.now()) => {
  const tasksById = new Map(data.tasks.map((task) => [task.id, task]));

  return data.reminders.filter((reminder) => {
    const task = tasksById.get(reminder.taskId);

    return (
      reminder.enabled &&
      reminder.firedAt === null &&
      reminder.failedAt === null &&
      task?.deletedAt === null &&
      task?.status === "todo" &&
      new Date(reminder.snoozedUntil ?? reminder.remindAt).getTime() <= now
    );
  });
};

export const useReminders = (
  data: AppData | null,
  markReminderFired: (id: string) => Promise<AppData>,
  markReminderFailed: (id: string, reason: string) => Promise<AppData>,
  onOpenTask: (taskId: string) => void,
  onPermissionDenied?: () => Promise<void> | void,
) => {
  const latestStateRef = useRef({ data, markReminderFired, markReminderFailed, onOpenTask, onPermissionDenied });
  const isTickingRef = useRef(false);
  const permissionDeniedRef = useRef(false);
  const activeReminderIdsRef = useRef(new Set<string>());

  useEffect(() => {
    latestStateRef.current = { data, markReminderFired, markReminderFailed, onOpenTask, onPermissionDenied };
  }, [data, markReminderFailed, markReminderFired, onOpenTask, onPermissionDenied]);

  useEffect(() => {
    if (!data?.settings.notificationsEnabled || !isTauriRuntime()) {
      return;
    }

    let cancelled = false;
    permissionDeniedRef.current = false;

    const tick = async () => {
      const current = latestStateRef.current;
      if (!current.data || isTickingRef.current || permissionDeniedRef.current) {
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

        const latest = latestStateRef.current;
        if (!latest.data || cancelled) {
          return;
        }

        const tasksById = new Map(latest.data.tasks.map((task) => [task.id, task]));
        const dueReminders = dueRemindersForData(latest.data);
        if (dueReminders.length === 0) {
          return;
        }

        for (const reminder of dueReminders) {
          if (cancelled || activeReminderIdsRef.current.has(reminder.id)) {
            continue;
          }

          const task = tasksById.get(reminder.taskId);
          if (!task) {
            continue;
          }

          activeReminderIdsRef.current.add(reminder.id);
          try {
            await sendNotification({
              title: "WhatToDo",
              body: task.dueTime ? `${task.title} · ${task.dueTime}` : task.title,
            });
            latestStateRef.current.onOpenTask(task.id);
            await latestStateRef.current.markReminderFired(reminder.id);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await latestStateRef.current.markReminderFailed(reminder.id, message);
          } finally {
            activeReminderIdsRef.current.delete(reminder.id);
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
  }, [data?.settings.notificationsEnabled]);
};
