import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, isSameMonth } from "date-fns";
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
import type { Task } from "@/data/types";
import { cn } from "@/lib/utils";

type DatePaneProps = {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  tasks: Task[];
};

const weekLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function DatePane({ selectedDate, setSelectedDate, tasks }: DatePaneProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"calendar" | "week">("calendar");
  const [monthCursor, setMonthCursor] = useState(selectedDate);
  const counts = useMemo(() => taskCountsByDate(tasks), [tasks]);
  const monthDays = getMonthDays(monthCursor);
  const weekDays = getWeekDays(selectedDate);

  return (
    <aside className="flex min-h-0 w-[320px] shrink-0 flex-col border-r border-border bg-card/45 max-lg:w-[292px]">
      <div className="border-b border-border p-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{mode === "calendar" ? t("month") : t("week")}</h2>
          <div className="inline-grid grid-flow-col gap-1 rounded-lg border border-border bg-background/55 p-1">
            <button
              className={cn(
                "h-7 rounded-md px-2.5 text-xs transition-colors hover:bg-accent",
                mode === "calendar" && "bg-primary text-primary-foreground hover:bg-primary",
              )}
              type="button"
              onClick={() => setMode("calendar")}
            >
              {t("month")}
            </button>
            <button
              className={cn(
                "h-7 rounded-md px-2.5 text-xs transition-colors hover:bg-accent",
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
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => setMonthCursor((value) => shiftMonth(value, -1))}
          >
            <ChevronLeft />
          </Button>
          <span className="text-sm font-medium">{format(new Date(`${monthCursor}T00:00:00`), "MMM yyyy")}</span>
          <Button
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => setMonthCursor((value) => shiftMonth(value, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {mode === "calendar" ? (
          <>
            <div className="grid grid-cols-7 gap-1 text-center text-[0.68rem] text-muted-foreground">
              {weekLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {monthDays.map((day) => {
                const key = toDateKey(day);
                const count = counts[key] ?? 0;

                return (
                  <button
                    key={key}
                    className={cn(
                      "relative flex aspect-square items-center justify-center rounded-md text-sm transition-colors hover:bg-accent",
                      !isSameMonth(day, new Date(`${monthCursor}T00:00:00`)) && "text-muted-foreground/45",
                      key === selectedDate && "bg-primary text-primary-foreground hover:bg-primary",
                      isToday(day) && key !== selectedDate && "text-primary",
                    )}
                    type="button"
                    onClick={() => setSelectedDate(key)}
                  >
                    {format(day, "d")}
                    {count > 0 && <span className="absolute bottom-1 h-1 w-4 rounded-full bg-current opacity-70" />}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            {weekDays.map((day) => {
              const key = toDateKey(day);
              const count = counts[key] ?? 0;

              return (
                <button
                  key={key}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-3 text-left text-sm transition-colors hover:bg-accent",
                    selectedDate === key && "border-ring bg-accent text-accent-foreground",
                  )}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                >
                  <span>
                    <span className="block text-xs text-muted-foreground">{format(day, "EEE")}</span>
                    <span className="block text-lg font-semibold">{format(day, "MMM d")}</span>
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
