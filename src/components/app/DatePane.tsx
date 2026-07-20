import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, isSameMonth } from "date-fns";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  getMonthDays,
  getWeekDays,
  isToday,
  shiftMonth,
  taskCountsByDate,
  toDateKey,
} from "@/data/date";
import { formatMonthTitle, formatWeekDate, formatWeekday } from "@/data/dateFormat";
import type { Task } from "@/data/types";
import { cn } from "@/lib/utils";

type DatePaneProps = {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  tasks: Task[];
};

export function DatePane({ selectedDate, setSelectedDate, tasks }: DatePaneProps) {
  const { i18n, t } = useTranslation();
  const [mode, setMode] = useState<"calendar" | "week">("calendar");
  const [monthCursor, setMonthCursor] = useState(selectedDate);
  const counts = useMemo(() => taskCountsByDate(tasks), [tasks]);
  const monthDays = getMonthDays(monthCursor);
  const weekDays = getWeekDays(selectedDate);

  return (
    <aside
      aria-label={mode === "calendar" ? t("month") : t("week")}
      className="flex min-h-0 w-[320px] shrink-0 flex-col border-r border-border bg-card/50 max-lg:w-[292px] max-md:max-h-[320px] max-md:w-full max-md:border-b max-md:border-r-0 max-sm:max-h-[340px]"
    >
      <div className="border-b border-border p-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{mode === "calendar" ? t("month") : t("week")}</h2>
          <div className="inline-grid grid-flow-col gap-1 rounded-lg border border-border bg-background/50 p-1">
            <button
              aria-pressed={mode === "calendar"}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-quart)] hover:bg-accent active:scale-95",
                mode === "calendar" && "bg-primary text-primary-foreground hover:bg-primary",
              )}
              type="button"
              onClick={() => setMode("calendar")}
            >
              {t("month")}
            </button>
            <button
              aria-pressed={mode === "week"}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-quart)] hover:bg-accent active:scale-95",
                mode === "week" && "bg-primary text-primary-foreground hover:bg-primary",
              )}
              type="button"
              onClick={() => setMode("week")}
            >
              {t("week")}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button
            aria-label={t("previousMonth")}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => setMonthCursor((value) => shiftMonth(value, -1))}
          >
            <ChevronLeft />
          </Button>
          <span className="text-sm font-medium">{formatMonthTitle(monthCursor, i18n.language)}</span>
          <Button
            aria-label={t("nextMonth")}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => setMonthCursor((value) => shiftMonth(value, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 max-sm:p-2">
        {mode === "calendar" ? (
          <div key="calendar" className="motion-view">
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {weekDays.map((day) => (
                <span key={day.toISOString()}>{formatWeekday(day, i18n.language)}</span>
              ))}
            </div>
            <div className="motion-list mt-2 grid grid-cols-7 gap-1 max-md:auto-rows-[36px] max-sm:auto-rows-[34px]">
              {monthDays.map((day, index) => {
                const key = toDateKey(day);
                const count = counts[key] ?? 0;

                return (
                  <button
                    aria-current={isToday(day) ? "date" : undefined}
                    aria-pressed={key === selectedDate}
                    key={key}
                    className={cn(
                      "calendar-day relative flex aspect-square items-center justify-center rounded-md text-sm transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-quart)] hover:bg-accent active:scale-95 max-md:aspect-auto max-sm:text-xs",
                      !isSameMonth(day, new Date(`${monthCursor}T00:00:00`)) && "text-muted-foreground",
                      key === selectedDate && "bg-primary text-primary-foreground hover:bg-primary",
                      isToday(day) && key !== selectedDate && "text-primary",
                    )}
                    style={{ "--motion-index": index } as CSSProperties}
                    type="button"
                    onClick={() => setSelectedDate(key)}
                  >
                    {format(day, "d")}
                    {count > 0 && <span className="motion-status absolute bottom-1 h-1 w-4 rounded-full bg-current opacity-70" />}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div key="week" className="motion-list space-y-2">
            {weekDays.map((day, index) => {
              const key = toDateKey(day);
              const count = counts[key] ?? 0;

              return (
                <button
                  aria-current={isToday(day) ? "date" : undefined}
                  aria-pressed={selectedDate === key}
                  key={key}
                  className={cn(
                    "motion-surface flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-3 text-left text-sm hover:bg-accent",
                    selectedDate === key && "border-ring bg-accent text-accent-foreground",
                  )}
                  style={{ "--motion-index": index } as CSSProperties}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                >
                  <span>
                    <span className="block text-xs text-muted-foreground">{formatWeekday(day, i18n.language)}</span>
                    <span className="block text-lg font-semibold">{formatWeekDate(day, i18n.language)}</span>
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
