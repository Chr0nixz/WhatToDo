import { Repeat2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { RecurrenceFrequency, RecurringTaskTemplate } from "@/data/types";
import { cn } from "@/lib/utils";

export interface TaskRecurrenceSectionProps {
  recurringTemplate: RecurringTaskTemplate;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceInterval: number;
  recurrenceByWeekday: number[];
  recurrenceEndDate: string;
  dueDate: string;
  isSavingFuture: boolean;
  futureSaveState: "idle" | "saved" | "error" | "disabled";
  saveErrorMessage: string | null;
  setRecurrenceFrequency: (freq: RecurrenceFrequency) => void;
  setRecurrenceInterval: (interval: number) => void;
  setRecurrenceByWeekday: (dispatch: (prev: number[]) => number[]) => void;
  setRecurrenceEndDate: (date: string) => void;
  onOpenFutureUpdate: () => void;
  onDisableFutureRepeats: () => void | Promise<void>;
}

const recurrenceOptions: RecurrenceFrequency[] = ["daily", "weekly", "monthly", "yearly"];
const recurrenceLabelKeys: Record<RecurrenceFrequency, string> = {
  daily: "repeatDaily",
  weekly: "repeatWeekly",
  monthly: "repeatMonthly",
  yearly: "repeatYearly",
};
const weekdayShortKeys = [
  "weekdaySun",
  "weekdayMon",
  "weekdayTue",
  "weekdayWed",
  "weekdayThu",
  "weekdayFri",
  "weekdaySat",
];

export function TaskRecurrenceSection({
  recurringTemplate,
  recurrenceFrequency,
  recurrenceInterval,
  recurrenceByWeekday,
  recurrenceEndDate,
  dueDate,
  isSavingFuture,
  futureSaveState,
  saveErrorMessage,
  setRecurrenceFrequency,
  setRecurrenceInterval,
  setRecurrenceByWeekday,
  setRecurrenceEndDate,
  onOpenFutureUpdate,
  onDisableFutureRepeats,
}: TaskRecurrenceSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3 rounded-md border border-border bg-muted/35 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Repeat2 className="size-4 text-primary" />
          <span>{t("recurringTask")}</span>
        </div>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {recurringTemplate.enabled ? t("enabled") : t("disabled")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted-foreground" htmlFor="detail-repeat">
          {t("repeat")}
          <select
            id="detail-repeat"
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
            value={recurrenceFrequency}
            onChange={(event) => setRecurrenceFrequency(event.target.value as RecurrenceFrequency)}
          >
            {recurrenceOptions.map((option) => (
              <option key={option} value={option}>
                {t(recurrenceLabelKeys[option])}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground" htmlFor="detail-repeat-interval">
          {t("repeatInterval")}
          <input
            id="detail-repeat-interval"
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
            max={365}
            min={1}
            type="number"
            value={recurrenceInterval}
            onChange={(event) => setRecurrenceInterval(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
          />
        </label>
      </div>
      {recurrenceFrequency === "weekly" && (
        <div className="grid gap-1 text-xs text-muted-foreground">
          <span>{t("repeatWeekdays")}</span>
          <div className="flex gap-1">
            {weekdayShortKeys.map((key, day) => {
              const active = recurrenceByWeekday.includes(day);
              return (
                <button
                  key={day}
                  aria-label={t(key)}
                  aria-pressed={active}
                  className={cn(
                    "h-7 w-7 rounded-md border border-input text-xs font-medium transition-colors",
                    active ? "border-ring bg-accent text-accent-foreground ring-1 ring-ring" : "bg-background hover:bg-accent",
                  )}
                  type="button"
                  onClick={() =>
                    setRecurrenceByWeekday((prev) =>
                      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
                    )
                  }
                >
                  {t(key)}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="detail-repeat-end">
        <span>{t("repeatUntil")}</span>
        <input
          id="detail-repeat-end"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
          min={dueDate}
          type="date"
          value={recurrenceEndDate}
          onChange={(event) => setRecurrenceEndDate(event.target.value)}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        {recurringTemplate.reminderOffset === null
          ? t("repeatReminderNotInherited")
          : t("repeatReminderInherited")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={isSavingFuture}
          size="sm"
          type="button"
          variant="secondary"
          onClick={onOpenFutureUpdate}
        >
          {isSavingFuture ? t("saving") : t("updateFutureRepeats")}
        </Button>
        <Button disabled={isSavingFuture || !recurringTemplate.enabled} size="sm" type="button" variant="ghost" onClick={() => void onDisableFutureRepeats()}>
          {t("disableRepeat")}
        </Button>
      </div>
      {futureSaveState !== "idle" && (
        <p className={cn("motion-status text-xs", futureSaveState === "error" ? "text-destructive" : "text-success")}>
          {futureSaveState === "saved"
            ? t("futureRepeatsUpdated")
            : futureSaveState === "disabled"
              ? t("repeatDisabled")
              : saveErrorMessage ?? t("operationFailed")}
        </p>
      )}
    </div>
  );
}
