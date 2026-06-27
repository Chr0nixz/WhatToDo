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
      // Active tasks (todo + in_progress) still need reminders; terminal states don't
      (task?.status === "todo" || task?.status === "in_progress") &&
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
  // Tracks the most recently notified task id. The Tauri desktop notification
  // plugin does not expose a click handler on desktop, so we approximate
  // "user clicked the notification" by navigating to this task when the app
  // window regains focus shortly after a notification fires.
  const pendingFocusTaskIdRef = useRef<string | null>(null);

  useEffect(() => {
    latestStateRef.current = { data, markReminderFired, markReminderFailed, onOpenTask, onPermissionDenied };
  }, [data, markReminderFailed, markReminderFired, onOpenTask, onPermissionDenied]);

  // Focus-based notification click handling: when the window gains focus
  // within 60s of a notification firing, navigate to the notified task.
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const onFocus = () => {
      const taskId = pendingFocusTaskIdRef.current;
      if (taskId) {
        pendingFocusTaskIdRef.current = null;
        latestStateRef.current.onOpenTask(taskId);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

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
            // Record the task for focus-based click navigation instead of
            // switching the view immediately (which disrupted users who
            // were away from the app when the notification fired).
            pendingFocusTaskIdRef.current = task.id;
            window.setTimeout(() => {
              if (pendingFocusTaskIdRef.current === task.id) {
                pendingFocusTaskIdRef.current = null;
              }
            }, 60_000);
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
