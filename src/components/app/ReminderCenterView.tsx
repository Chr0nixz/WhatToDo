import { Bell, Check, CircleSlash, Clock3, ExternalLink, RefreshCw, RotateCcw } from "lucide-react";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  getSnoozeUntil,
  groupReminderCenterItems,
  type ReminderCenterGroupId,
  type ReminderCenterItem,
  type SnoozeOption,
} from "@/data/reminderCenter";
import type { AppData } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

type ReminderCenterViewProps = {
  actions: TodoActions;
  data: AppData;
  onOpenTask: (taskId: string) => void;
};

const groupOrder: ReminderCenterGroupId[] = ["failed", "missed", "upcoming", "fired"];

const groupClasses = {
  failed: "bg-red-500/10 text-red-600",
  missed: "bg-red-500/10 text-red-600",
  upcoming: "bg-amber-500/12 text-amber-600",
  fired: "bg-emerald-500/10 text-emerald-600",
};

const snoozeOptions: { id: SnoozeOption; labelKey: string }[] = [
  { id: "tenMinutes", labelKey: "snooze10Minutes" },
  { id: "oneHour", labelKey: "snooze1Hour" },
  { id: "tomorrowMorning", labelKey: "snoozeTomorrow" },
];

export function ReminderCenterView({ actions, data, onOpenTask }: ReminderCenterViewProps) {
  const { i18n, t } = useTranslation();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groups = useMemo(() => groupReminderCenterItems(data), [data]);
  const total = groupOrder.reduce((sum, group) => sum + groups[group].length, 0);

  const formatDateTime = (value: string) =>
    new Intl.DateTimeFormat(i18n.language === "zh" ? "zh-CN" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  const runReminderAction = async (reminderId: string, operation: () => Promise<unknown>, successMessage: string) => {
    setPendingId(reminderId);
    setError(null);
    setFeedback(null);

    try {
      await operation();
      setFeedback(successMessage);
    } catch {
      setError(t("operationFailed"));
    } finally {
      setPendingId(null);
    }
  };

  const handleSnooze = (item: ReminderCenterItem, option: SnoozeOption) =>
    runReminderAction(
      item.reminder.id,
      () => actions.snoozeReminder(item.reminder.id, getSnoozeUntil(option)),
      t("reminderSnoozed"),
    );

  const handleDisable = (item: ReminderCenterItem) =>
    runReminderAction(item.reminder.id, () => actions.disableReminder(item.reminder.id), t("reminderDisabled"));

  const handleComplete = (item: ReminderCenterItem) =>
    runReminderAction(item.reminder.id, () => actions.toggleTask(item.task.id), t("saved"));

  const handleRetry = (item: ReminderCenterItem) =>
    runReminderAction(
      item.reminder.id,
      async () => {
        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          permissionGranted = (await requestPermission()) === "granted";
        }

        if (!permissionGranted) {
          await actions.markReminderFailed(item.reminder.id, t("notificationPermissionDenied"));
          throw new Error("notification permission denied");
        }

        try {
          await sendNotification({
            title: "WhatToDo",
            body: item.task.dueTime ? `${item.task.title} · ${item.task.dueTime}` : item.task.title,
          });
          await actions.markReminderFired(item.reminder.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await actions.markReminderFailed(item.reminder.id, message);
          throw err;
        }
      },
      t("reminderRetried"),
    );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border bg-background px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t("reminderCenter")}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal">{t("reminders")}</h2>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card/70 px-3 py-2 text-sm">
            <Bell className="size-4 text-amber-600" />
            <span className="text-muted-foreground">{t("activeReminders")}</span>
            <strong>{total}</strong>
          </div>
        </div>
        {(feedback || error) && (
          <p className={cn("motion-status mt-3 text-sm", error ? "text-destructive" : "text-emerald-600")}>{error ?? feedback}</p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {total === 0 ? (
          <div className="motion-status flex min-h-56 items-center justify-center rounded-lg border border-dashed border-border bg-card/35 px-6 text-center text-sm text-muted-foreground">
            {t("emptyReminders")}
          </div>
        ) : (
          <div className="grid gap-4">
            {groupOrder.map((group) => (
              <section key={group} className="grid gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{t(`${group}Reminders`)}</h3>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", groupClasses[group])}>
                    {groups[group].length}
                  </span>
                </div>
                {groups[group].length === 0 ? (
                  <div className="motion-status rounded-lg border border-dashed border-border bg-card/30 px-4 py-5 text-sm text-muted-foreground">
                    {t("emptyReminderGroup")}
                  </div>
                ) : (
                  <div className="motion-list grid gap-2">
                    {groups[group].map((item, index) => (
                      <article
                        key={item.reminder.id}
                        className="motion-surface grid gap-3 rounded-lg border border-border bg-card/80 px-3 py-3 shadow-sm hover:border-ring/70"
                        style={{ "--motion-index": index } as CSSProperties}
                      >
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className={cn("size-2 shrink-0 rounded-full", groupClasses[group])} />
                              <h4 className="truncate text-sm font-medium">{item.task.title}</h4>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Clock3 className="size-3" />
                                {formatDateTime(item.effectiveAt)}
                              </span>
                              {item.reminder.snoozedUntil && <span>{t("snoozed")}</span>}
                              {item.reminder.firedAt && <span>{t("fired")}</span>}
                              {item.reminder.failedAt && <span>{t("failed")}</span>}
                            </div>
                            {item.group === "failed" && item.reminder.lastError && (
                              <p className="mt-1 line-clamp-2 text-xs text-destructive">{item.reminder.lastError}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button size="sm" type="button" variant="outline" onClick={() => onOpenTask(item.task.id)}>
                              <ExternalLink />
                              {t("openTask")}
                            </Button>
                            {item.task.status !== "completed" && (
                              <Button
                                disabled={pendingId === item.reminder.id}
                                size="sm"
                                type="button"
                                variant="secondary"
                                onClick={() => void handleComplete(item)}
                              >
                                <Check />
                                {t("completeTask")}
                              </Button>
                            )}
                          </div>
                        </div>

                        {item.group !== "fired" && (
                          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                            {item.group === "failed" && (
                              <Button
                                disabled={pendingId === item.reminder.id}
                                size="xs"
                                type="button"
                                variant="secondary"
                                onClick={() => void handleRetry(item)}
                              >
                                <RefreshCw />
                                {t("retry")}
                              </Button>
                            )}
                            <span className="mr-1 text-xs text-muted-foreground">{t("snooze")}</span>
                            {snoozeOptions.map((option) => (
                              <Button
                                key={option.id}
                                disabled={pendingId === item.reminder.id}
                                size="xs"
                                type="button"
                                variant="outline"
                                onClick={() => void handleSnooze(item, option.id)}
                              >
                                <RotateCcw />
                                {t(option.labelKey)}
                              </Button>
                            ))}
                            <Button
                              disabled={pendingId === item.reminder.id}
                              size="xs"
                              type="button"
                              variant="ghost"
                              onClick={() => void handleDisable(item)}
                            >
                              <CircleSlash />
                              {t("disableReminder")}
                            </Button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
