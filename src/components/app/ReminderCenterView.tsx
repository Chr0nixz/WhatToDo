import { Bell, Check, ChevronDown, CircleSlash, Clock3, ExternalLink, RefreshCw, RotateCcw } from "lucide-react";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover } from "radix-ui";

import { Button } from "@/components/ui/button";
import { formatReminderDateTime } from "@/data/dateFormat";
import {
  getSnoozeUntil,
  groupReminderCenterItems,
  type ReminderCenterGroupId,
  type ReminderCenterItem,
  type SnoozeOption,
} from "@/data/reminderCenter";
import type { ReminderEvent, ReminderEventType } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";
import { useReminders, useTasks } from "@/hooks/useTodoStore";
import { cn } from "@/lib/utils";

type ReminderCenterViewProps = {
  actions: TodoActions;
  onOpenTask: (taskId: string) => void;
};

const groupOrder: ReminderCenterGroupId[] = ["failed", "missed", "upcoming", "fired"];

const groupClasses = {
  failed: "bg-destructive/10 text-destructive",
  missed: "bg-destructive/10 text-destructive",
  upcoming: "bg-warning/12 text-warning-foreground dark:text-warning",
  fired: "bg-success/10 text-success",
};

const snoozeOptions: { id: SnoozeOption; labelKey: string }[] = [
  { id: "tenMinutes", labelKey: "snooze10Minutes" },
  { id: "oneHour", labelKey: "snooze1Hour" },
  { id: "tomorrowMorning", labelKey: "snoozeTomorrow" },
];

const eventLabelKey: Record<ReminderEventType, string> = {
  fired: "reminderEventFired",
  failed: "reminderEventFailed",
  snoozed: "reminderEventSnoozed",
  disabled: "reminderEventDisabled",
  retry: "reminderEventRetry",
};

export function ReminderCenterView({ actions, onOpenTask }: ReminderCenterViewProps) {
  const { i18n, t } = useTranslation();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuReminderId, setMenuReminderId] = useState<string | null>(null);
  const [batchPending, setBatchPending] = useState(false);
  const [expandedReminderId, setExpandedReminderId] = useState<string | null>(null);
  const [eventsByReminder, setEventsByReminder] = useState<Record<string, ReminderEvent[]>>({});
  const [eventsLoadingId, setEventsLoadingId] = useState<string | null>(null);
  // Subscribe only to the slices this view needs. Thanks to applyRepositoryPatch
  // preserving slice references, this view will NOT re-render when unrelated
  // data (e.g. settings, projects) changes.
  const reminders = useReminders();
  const tasks = useTasks();
  const groups = useMemo(() => groupReminderCenterItems({ tasks, reminders }), [tasks, reminders]);
  const total = groupOrder.reduce((sum, group) => sum + groups[group].length, 0);

  useEffect(() => {
    if (!expandedReminderId) {
      return;
    }
    let active = true;
    setEventsLoadingId(expandedReminderId);
    void actions
      .loadReminderEvents(expandedReminderId)
      .then((events) => {
        if (active) {
          setEventsByReminder((prev) => ({ ...prev, [expandedReminderId]: events }));
        }
      })
      .catch(() => {
        if (active) {
          setEventsByReminder((prev) => ({ ...prev, [expandedReminderId]: [] }));
        }
      })
      .finally(() => {
        if (active) {
          setEventsLoadingId(null);
        }
      });
    return () => {
      active = false;
    };
  }, [actions, expandedReminderId]);

  const runReminderAction = async (reminderId: string, operation: () => Promise<unknown>, successMessage: string) => {
    setPendingId(reminderId);
    setError(null);
    setFeedback(null);

    try {
      await operation();
      setFeedback(successMessage);
      if (expandedReminderId === reminderId) {
        const events = await actions.loadReminderEvents(reminderId);
        setEventsByReminder((prev) => ({ ...prev, [reminderId]: events }));
      }
    } catch {
      setError(t("reminderActionFailed"));
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

  const handleSnoozeAllMissed = async () => {
    const items = groups.missed;
    if (items.length === 0 || batchPending) return;
    setBatchPending(true);
    setError(null);
    setFeedback(null);
    const untilIso = getSnoozeUntil("tomorrowMorning");
    const results = await Promise.allSettled(items.map((item) => actions.snoozeReminder(item.reminder.id, untilIso)));
    const fulfilled = results.filter((result) => result.status === "fulfilled").length;
    const rejected = results.length - fulfilled;
    if (rejected === 0) {
      setFeedback(t("reminderSnoozed"));
    } else if (fulfilled === 0) {
      setError(t("reminderActionFailed"));
    } else {
      setFeedback(t("snoozeAllPartialSuccess", { fulfilled, total: results.length, rejected }));
    }
    setBatchPending(false);
  };

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
    <main className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border bg-background px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">{t("reminders")}</h1>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card/65 px-3 py-2 text-sm">
            <Bell className="size-4 text-warning" />
            <span className="text-muted-foreground">{t("activeReminders")}</span>
            <strong>{total}</strong>
          </div>
        </div>
        {(feedback || error) && (
          <p className={cn("motion-status mt-3 text-sm", error ? "text-destructive" : "text-success")}>{error ?? feedback}</p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {total === 0 ? (
          <div className="motion-status flex min-h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/35 px-6 text-center">
            <p className="text-sm text-muted-foreground">{t("emptyReminders")}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{t("emptyRemindersHint")}</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {groupOrder.map((group) => (
              <section key={group} className="grid gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{t(`${group}Reminders`)}</h3>
                  <div className="flex items-center gap-2">
                    {group === "missed" && groups.missed.length > 0 && (
                      <Button
                        disabled={batchPending}
                        size="xs"
                        type="button"
                        variant="secondary"
                        onClick={() => void handleSnoozeAllMissed()}
                      >
                        <Clock3 />
                        {t("snoozeAllMissed")}
                      </Button>
                    )}
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", groupClasses[group])}>
                      {groups[group].length}
                    </span>
                  </div>
                </div>
                {groups[group].length === 0 ? (
                  <div className="motion-status rounded-lg border border-dashed border-border bg-card/35 px-4 py-5 text-sm text-muted-foreground">
                    {t("emptyReminderGroup")}
                  </div>
                ) : (
                  <div className="motion-list grid gap-2">
                    {groups[group].map((item, index) => {
                      const expanded = expandedReminderId === item.reminder.id;
                      const events = eventsByReminder[item.reminder.id] ?? [];
                      return (
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
                                  {formatReminderDateTime(item.effectiveAt, i18n.language)}
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
                              {item.task.status !== "completed" && item.task.status !== "cancelled" && (
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
                              <Popover.Root
                                open={menuReminderId === item.reminder.id}
                                onOpenChange={(open) => setMenuReminderId(open ? item.reminder.id : null)}
                              >
                                <Popover.Trigger asChild>
                                  <Button
                                    aria-label={t("moreActions")}
                                    className="ml-auto"
                                    disabled={pendingId === item.reminder.id || batchPending}
                                    size="xs"
                                    type="button"
                                    variant="outline"
                                    title={t("moreActions")}
                                  >
                                    <RotateCcw />
                                    {t("snooze")}
                                    <ChevronDown />
                                  </Button>
                                </Popover.Trigger>
                                <Popover.Portal>
                                  <Popover.Content
                                    align="end"
                                    sideOffset={4}
                                    className="z-10 grid min-w-40 gap-0.5 rounded-md border border-border bg-popover p-1 shadow-md"
                                  >
                                    {snoozeOptions.map((option) => (
                                      <button
                                        key={option.id}
                                        className="flex items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                                        type="button"
                                        onClick={() => {
                                          setMenuReminderId(null);
                                          void handleSnooze(item, option.id);
                                        }}
                                      >
                                        <RotateCcw className="size-3" />
                                        {t(option.labelKey)}
                                      </button>
                                    ))}
                                    <span className="my-0.5 h-px bg-border" />
                                    <button
                                      className="flex items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
                                      type="button"
                                      onClick={() => {
                                        setMenuReminderId(null);
                                        void handleDisable(item);
                                      }}
                                    >
                                      <CircleSlash className="size-3" />
                                      {t("disableReminder")}
                                    </button>
                                  </Popover.Content>
                                </Popover.Portal>
                              </Popover.Root>
                            </div>
                          )}

                          <div className={cn("border-t border-border pt-2", item.group === "fired" && "border-t")}>
                            <Button
                              size="xs"
                              type="button"
                              variant="ghost"
                              onClick={() =>
                                setExpandedReminderId((current) => (current === item.reminder.id ? null : item.reminder.id))
                              }
                            >
                              {expanded ? t("hideReminderEvents") : t("showReminderEvents")}
                            </Button>
                            {expanded && (
                              <div className="mt-2 grid gap-1.5">
                                <p className="text-xs font-medium text-muted-foreground">{t("reminderEventTimeline")}</p>
                                {eventsLoadingId === item.reminder.id ? (
                                  <p className="text-xs text-muted-foreground">{t("loadingView")}</p>
                                ) : events.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">{t("reminderEventEmpty")}</p>
                                ) : (
                                  <ul className="grid gap-1">
                                    {events.map((event) => (
                                      <li
                                        key={event.id}
                                        className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-border/70 bg-background/50 px-2 py-1.5 text-xs"
                                      >
                                        <span className="font-medium">{t(eventLabelKey[event.eventType])}</span>
                                        <span className="text-muted-foreground">
                                          {formatReminderDateTime(event.createdAt, i18n.language)}
                                        </span>
                                        {event.detail && (
                                          <span className="w-full text-muted-foreground">{event.detail}</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
