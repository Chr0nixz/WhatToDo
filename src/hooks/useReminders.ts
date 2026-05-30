import { useEffect } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import type { AppData } from "@/data/types";

const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const dueRemindersForData = (data: AppData, now = Date.now()) =>
  data.reminders.filter((reminder) => {
    const task = data.tasks.find((item) => item.id === reminder.taskId);

    return (
      reminder.enabled &&
      reminder.firedAt === null &&
      reminder.failedAt === null &&
      task?.deletedAt === null &&
      task?.status === "todo" &&
      new Date(reminder.snoozedUntil ?? reminder.remindAt).getTime() <= now
    );
  });

export const useReminders = (
  data: AppData | null,
  markReminderFired: (id: string) => Promise<AppData>,
  markReminderFailed: (id: string, reason: string) => Promise<AppData>,
  onOpenTask: (taskId: string) => void,
  onPermissionDenied?: () => Promise<void> | void,
) => {
  useEffect(() => {
    if (!data?.settings.notificationsEnabled || !isTauriRuntime()) {
      return;
    }

    let isTicking = false;
    let permissionDenied = false;

    const tick = async () => {
      if (isTicking || permissionDenied) {
        return;
      }

      isTicking = true;

      try {
        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          const permission = await requestPermission();
          permissionGranted = permission === "granted";
        }

        if (!permissionGranted) {
          permissionDenied = true;
          await onPermissionDenied?.();
          return;
        }

        const dueReminders = dueRemindersForData(data);
        if (dueReminders.length === 0) {
          return;
        }

        for (const reminder of dueReminders) {
          const task = data.tasks.find((item) => item.id === reminder.taskId);
          if (!task) {
            continue;
          }

          try {
            await sendNotification({
              title: "WhatToDo",
              body: task.dueTime ? `${task.title} · ${task.dueTime}` : task.title,
            });
            onOpenTask(task.id);
            await markReminderFired(reminder.id);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await markReminderFailed(reminder.id, message);
          }
        }
      } catch {
        return;
      } finally {
        isTicking = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [data, markReminderFailed, markReminderFired, onOpenTask, onPermissionDenied]);
};
