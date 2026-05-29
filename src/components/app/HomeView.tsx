import { Search, X } from "lucide-react";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { overdueTasks, tasksForDate, todayKey } from "@/data/date";
import type { AppData } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

import { DatePane } from "./DatePane";
import { TaskList } from "./TaskList";
import { TaskCreateDialog } from "./TaskCreateDialog";

type HomeViewProps = {
  data: AppData;
  actions: TodoActions;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedTaskId: string | null;
  setSelectedTaskId: (taskId: string | null) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
};

export function HomeView({
  data,
  actions,
  selectedDate,
  setSelectedDate,
  selectedTaskId,
  setSelectedTaskId,
  searchQuery,
  setSearchQuery,
}: HomeViewProps) {
  const { t } = useTranslation();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const selectedTasks = useMemo(() => {
    const tasks = tasksForDate(data.tasks, selectedDate);
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return tasks;
    }

    return tasks.filter((task) => task.title.toLowerCase().includes(query));
  }, [data.tasks, searchQuery, selectedDate]);
  const overdue = useMemo(() => overdueTasks(data.tasks), [data.tasks]);

  return (
    <main className="flex h-full min-h-0">
      <DatePane selectedDate={selectedDate} setSelectedDate={setSelectedDate} tasks={data.tasks} />

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border bg-background/65 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t("allDeadlines")}</p>
              <h1 className="truncate text-2xl font-semibold">
                {format(new Date(`${selectedDate}T00:00:00`), "MMM d, yyyy")}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {isSearchOpen && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <input
                    className="h-9 w-56 rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none transition-colors focus:border-ring max-md:w-40"
                    placeholder={t("search")}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                  <button
                    className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setIsSearchOpen(false);
                    }}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              )}
              {!isSearchOpen && (
                <Button size="icon-lg" type="button" variant="ghost" title={t("search")} onClick={() => setIsSearchOpen(true)}>
                  <Search />
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => setSelectedDate(todayKey())}>
                {t("today")}
              </Button>
              <TaskCreateDialog
                actions={actions}
                defaultDate={selectedDate}
                projects={data.projects.filter((project) => project.deletedAt === null && project.status !== "archived")}
                settings={data.settings}
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("today")}</h2>
            {overdue.length > 0 && (
              <span className="rounded-full bg-red-500/12 px-2 py-1 text-xs font-medium text-red-500">
                {t("overdue")} {overdue.length}
              </span>
            )}
          </div>
          <TaskList
            actions={actions}
            onSelectTask={setSelectedTaskId}
            projects={data.projects}
            reminders={data.reminders}
            selectedTaskId={selectedTaskId}
            tasks={selectedTasks}
          />
        </div>
      </section>
    </main>
  );
}
