import { FormEvent, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Bell, ChevronDown, FolderOpen, Plus, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { formatTaskDate } from "@/data/dateFormat";
import { parseQuickAdd } from "@/data/quickAdd";
import type { QuickAddMatch } from "@/data/quickAdd";
import type { Project, RecurrenceFrequency, Settings, TaskPriority } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

type TaskComposerProps = {
  projects: Project[];
  actions: TodoActions;
  defaultDate: string;
  defaultProjectId?: string | null;
  settings: Settings;
  onCreated?: () => void;
  variant?: "inline" | "dialog";
};

const priorityOptions: TaskPriority[] = ["low", "medium", "high"];
const recurrenceOptions: RecurrenceFrequency[] = ["daily", "weekly", "monthly", "yearly"];
const reminderOffsetOptions = [10, 30, 60, 1440];
const recurrenceLabelKeys: Record<RecurrenceFrequency, string> = {
  daily: "repeatDaily",
  weekly: "repeatWeekly",
  monthly: "repeatMonthly",
  yearly: "repeatYearly",
};
const weekdayShortKeys = ["weekdaySun", "weekdayMon", "weekdayTue", "weekdayWed", "weekdayThu", "weekdayFri", "weekdaySat"];

export function TaskComposer({
  projects,
  actions,
  defaultDate,
  defaultProjectId = null,
  settings,
  onCreated,
  variant = "inline",
}: TaskComposerProps) {
  const { i18n, t } = useTranslation();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(defaultDate);
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "none");
  const [workingFolder, setWorkingFolder] = useState("");
  const [useReminder, setUseReminder] = useState(true);
  const [reminderOffset, setReminderOffset] = useState(settings.defaultReminderOffset);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency | "none">("none");
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceByWeekday, setRecurrenceByWeekday] = useState<number[]>([]);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [parseFeedback, setParseFeedback] = useState<string | null>(null);
  const [quickAddMatches, setQuickAddMatches] = useState<QuickAddMatch[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    setDueDate(defaultDate);
    setProjectId(defaultProjectId ?? "none");
    setReminderOffset(settings.defaultReminderOffset);
  }, [defaultDate, defaultProjectId, settings.defaultReminderOffset]);

  const handleTitleFocus = () => {
    if (localStorage.getItem("whattodo:quickAddHintSeen") === null) {
      setShowHint(true);
      localStorage.setItem("whattodo:quickAddHintSeen", "1");
    }
  };

  const chooseFolder = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: t("selectTaskFolder"),
    });

    if (typeof selected === "string") {
      setWorkingFolder(selected);
    }
  };

  const applyQuickAdd = () => {
    const result = parseQuickAdd({
      input: title,
      projects,
      defaultReminderOffset: settings.defaultReminderOffset,
    });

    setTitle(result.draft.title);
    setDueDate(result.draft.dueDate);
    setDueTime(result.draft.dueTime ?? "");
    setPriority(result.draft.priority ?? "medium");
    setProjectId(result.draft.projectId ?? "none");
    setUseReminder(result.draft.reminderOffset !== null);
    setReminderOffset(result.draft.reminderOffset ?? settings.defaultReminderOffset);
    setQuickAddMatches(result.matches);
    setParseFeedback(t("quickAddApplied"));
  };

  const quickAddMatchLabel = (match: QuickAddMatch) => {
    if (match.kind === "date") {
      return `${t("quickAddMatchDate")}: ${formatTaskDate(match.value, i18n.language)}`;
    }
    if (match.kind === "time") {
      return `${t("quickAddMatchTime")}: ${match.value}`;
    }
    if (match.kind === "project") {
      return `${t("quickAddMatchProject")}: ${match.value}`;
    }
    if (match.kind === "priority") {
      return `${t("quickAddMatchPriority")}: ${t(match.value)}`;
    }

    return `${t("quickAddMatchReminder")}: ${match.value === null ? t("none") : t("reminderOffsetMinutes", { minutes: match.value })}`;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextTitle = title.trim();

    if (!nextTitle) {
      setSubmitError(t("titleRequired"));
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const input = {
        title: nextTitle,
        dueDate,
        dueTime: dueTime || null,
        priority,
        projectId: projectId === "none" ? null : projectId,
        workingFolder: workingFolder.trim() || null,
        reminderOffset: useReminder ? reminderOffset : null,
      };

      if (recurrenceFrequency === "none") {
        await actions.createTask(input);
      } else {
        await actions.createRecurringTask({
          ...input,
          frequency: recurrenceFrequency,
          interval: recurrenceInterval,
          byWeekday: recurrenceFrequency === "weekly" && recurrenceByWeekday.length > 0 ? recurrenceByWeekday : null,
          endDate: recurrenceEndDate || null,
        });
      }

      setTitle("");
      setDueDate(defaultDate);
      setDueTime("");
      setPriority("medium");
      setProjectId(defaultProjectId ?? "none");
      setWorkingFolder("");
      setReminderOffset(settings.defaultReminderOffset);
      setRecurrenceFrequency("none");
      setRecurrenceInterval(1);
      setRecurrenceByWeekday([]);
      setRecurrenceEndDate("");
      setQuickAddMatches([]);
      setDetailsOpen(false);
      onCreated?.();
    } catch {
      setSubmitError(t("taskCreateFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (variant === "dialog") {
    return (
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="task-title">
          {t("taskTitle")}
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input
            id="task-title"
            className="h-11 min-w-0 rounded-md border border-input bg-background px-3 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            placeholder={t("taskTitle")}
            value={title}
            onBlur={() => setShowHint(false)}
            onChange={(event) => {
              setTitle(event.target.value);
              setParseFeedback(null);
              setShowHint(false);
            }}
            onFocus={handleTitleFocus}
          />
          <Button
            aria-label={t("parseQuickAdd")}
            disabled={!title.trim() || isSubmitting}
            size="lg"
            title={t("parseQuickAdd")}
            type="button"
            variant="secondary"
            onClick={applyQuickAdd}
          >
            <Wand2 />
            <span className="max-sm:hidden">{t("parseQuickAdd")}</span>
          </Button>
        </div>
        {showHint && (
          <p className="motion-status mt-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
            {t("quickAddHint")}
          </p>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)_128px] gap-2 max-sm:grid-cols-1">
          <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="task-date">
            <span>{t("dueDate")}</span>
            <input
              id="task-date"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="task-time">
            <span>{t("dueTime")}</span>
            <input
              id="task-time"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
              type="time"
              value={dueTime}
              onChange={(event) => setDueTime(event.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="grid gap-1 text-xs text-muted-foreground">
            <span>{t("priority")}</span>
            <div aria-label={t("priority")} className="inline-grid grid-cols-3 gap-1 rounded-lg border border-border bg-background/50 p-1" role="group">
              {priorityOptions.map((option) => (
                <button
                  key={option}
                  aria-pressed={priority === option}
                  className={cn(
                    "h-7 rounded-md px-3 text-sm font-medium text-foreground transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out-quart)] hover:bg-accent disabled:pointer-events-none disabled:opacity-50",
                    priority === option && "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                  disabled={isSubmitting}
                  type="button"
                  onClick={() => setPriority(option)}
                >
                  {t(option)}
                </button>
              ))}
            </div>
          </div>
          <Button
            aria-label={t("reminder")}
            aria-pressed={useReminder}
            className={cn("h-9 gap-2 px-3", useReminder && "border-warning/30 bg-warning/12 text-warning-foreground hover:bg-warning/18 dark:text-warning")}
            disabled={isSubmitting}
            size="sm"
            title={t("reminder")}
            type="button"
            variant={useReminder ? "outline" : "ghost"}
            onClick={() => setUseReminder((value) => !value)}
          >
            <Bell className={cn("transition-[color,transform] duration-150 ease-[var(--ease-out-quart)]", useReminder && "scale-105")} />
            <span>{t("reminder")}</span>
          </Button>
        </div>

        {detailsOpen && (
          <div className="motion-status grid grid-cols-2 gap-3 border-t border-border pt-3 max-sm:grid-cols-1">
            <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="task-reminder-offset">
              <span>{t("reminderOffset")}</span>
              <select
                id="task-reminder-offset"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none transition-colors focus:border-ring disabled:opacity-55"
                disabled={!useReminder || isSubmitting}
                value={reminderOffset}
                onChange={(event) => setReminderOffset(Number(event.target.value))}
              >
                {reminderOffsetOptions.map((option) => (
                  <option key={option} value={option}>
                    {t(`reminderOffset${option}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="task-project">
              <span>{t("projects")}</span>
              <select
                id="task-project"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="none">{t("noProject")}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-1 text-xs text-muted-foreground">
              <label htmlFor="task-folder">{t("taskFolder")}</label>
              <div className="grid grid-cols-[minmax(0,1fr)_40px] gap-2">
                <input
                  id="task-folder"
                  className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
                  placeholder={t("inheritedFolder")}
                  value={workingFolder}
                  onChange={(event) => setWorkingFolder(event.target.value)}
                />
                <Button aria-label={t("chooseFolder")} size="icon-lg" title={t("chooseFolder")} type="button" variant="secondary" onClick={() => void chooseFolder()}>
                  <FolderOpen aria-hidden="true" />
                </Button>
              </div>
            </div>
            <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="task-repeat">
              <span>{t("repeat")}</span>
              <select
                id="task-repeat"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
                value={recurrenceFrequency}
                onChange={(event) => setRecurrenceFrequency(event.target.value as RecurrenceFrequency | "none")}
              >
                <option value="none">{t("repeatNone")}</option>
                {recurrenceOptions.map((option) => (
                  <option key={option} value={option}>
                    {t(recurrenceLabelKeys[option])}
                  </option>
                ))}
              </select>
            </label>
            {recurrenceFrequency !== "none" && (
              <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="task-repeat-interval">
                <span>{t("repeatInterval")}</span>
                <input
                  id="task-repeat-interval"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
                  max={365}
                  min={1}
                  type="number"
                  value={recurrenceInterval}
                  onChange={(event) => setRecurrenceInterval(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
                />
              </label>
            )}
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
            <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="task-repeat-end">
              <span>{t("repeatUntil")}</span>
              <input
                id="task-repeat-end"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring disabled:opacity-55"
                disabled={recurrenceFrequency === "none"}
                min={dueDate}
                type="date"
                value={recurrenceEndDate}
                onChange={(event) => setRecurrenceEndDate(event.target.value)}
              />
            </label>
          </div>
        )}

        {(submitError || parseFeedback) && (
          <p className={cn("motion-status text-xs", submitError ? "text-destructive" : "text-muted-foreground")}>
            {submitError ?? parseFeedback}
          </p>
        )}
        {quickAddMatches.length > 0 && (
          <div className="motion-status flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{t("quickAddPreview")}</span>
            {quickAddMatches.map((match, index) => (
              <span key={`${match.kind}-${index}`} className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {quickAddMatchLabel(match)}
              </span>
            ))}
            <button className="h-6 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" type="button" onClick={() => setQuickAddMatches([])}>
              {t("clearParsedPreview")}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <Button
            aria-expanded={detailsOpen}
            className="h-8 gap-1.5 px-2 text-muted-foreground"
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => setDetailsOpen((value) => !value)}
          >
            <span>{detailsOpen ? t("lessOptions") : t("moreOptions")}</span>
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform duration-150 ease-[var(--ease-out-quart)]",
                detailsOpen && "rotate-180",
              )}
            />
          </Button>
          <Button className="min-w-24 shadow-sm shadow-primary/20" disabled={isSubmitting} size="lg" type="submit">
            <Plus />
            {isSubmitting ? t("adding") : t("add")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form
      className="grid grid-cols-[minmax(150px,1fr)_36px_128px_96px_82px_112px_112px_36px] gap-1.5 rounded-lg border border-border bg-card/80 p-2 shadow-sm max-xl:grid-cols-[minmax(150px,1fr)_36px_128px_92px_82px_112px_36px] max-lg:grid-cols-2 max-sm:grid-cols-1"
      onSubmit={handleSubmit}
    >
      <label className="sr-only" htmlFor="task-title">
        {t("taskTitle")}
      </label>
      <input
        id="task-title"
        className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
        placeholder={t("taskTitle")}
        value={title}
        onBlur={() => setShowHint(false)}
        onChange={(event) => {
          setTitle(event.target.value);
          setParseFeedback(null);
          setShowHint(false);
        }}
        onFocus={handleTitleFocus}
      />
      <Button
        aria-label={t("parseQuickAdd")}
        disabled={!title.trim() || isSubmitting}
        size="icon-lg"
        title={t("parseQuickAdd")}
        type="button"
        variant="outline"
        onClick={applyQuickAdd}
      >
        <Wand2 />
      </Button>
      <label className="sr-only" htmlFor="task-date">
        {t("dueDate")}
      </label>
      <input
        id="task-date"
        className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
        type="date"
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
      />
      <label className="sr-only" htmlFor="task-time">
        {t("dueTime")}
      </label>
      <input
        id="task-time"
        className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
        type="time"
        value={dueTime}
        onChange={(event) => setDueTime(event.target.value)}
      />
      <label className="sr-only" htmlFor="task-priority">
        {t("priority")}
      </label>
      <select
        id="task-priority"
        className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-ring"
        value={priority}
        onChange={(event) => setPriority(event.target.value as TaskPriority)}
      >
        {priorityOptions.map((option) => (
          <option key={option} value={option}>
            {t(option)}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="task-project">
        {t("projects")}
      </label>
      <select
        id="task-project"
        className="project-field h-9 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-ring"
        value={projectId}
        onChange={(event) => setProjectId(event.target.value)}
      >
        <option value="none">{t("noProject")}</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="task-reminder">
        {t("reminder")}
      </label>
      <select
        id="task-reminder"
        className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-ring"
        disabled={isSubmitting}
        value={useReminder ? String(reminderOffset) : "none"}
        onChange={(event) => {
          if (event.target.value === "none") {
            setUseReminder(false);
            return;
          }

          setUseReminder(true);
          setReminderOffset(Number(event.target.value));
        }}
      >
        <option value="none">{t("none")}</option>
        {reminderOffsetOptions.map((option) => (
          <option key={option} value={option}>
            {t(`reminderOffset${option}`)}
          </option>
        ))}
      </select>
      <Button
        aria-label={t("add")}
        className="relative"
        size="icon-lg"
        type="submit"
        disabled={isSubmitting}
        title={t("add")}
      >
        <Plus />
      </Button>
      {showHint && (
        <p className="motion-status col-span-full mt-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
          {t("quickAddHint")}
        </p>
      )}
      {submitError && (
        <p className="motion-status col-span-full text-xs text-destructive">{submitError}</p>
      )}
      {parseFeedback && !submitError && (
        <p className="motion-status col-span-full text-xs text-muted-foreground">
          {parseFeedback}
        </p>
      )}
      {quickAddMatches.length > 0 && (
        <div className="motion-status col-span-full flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t("quickAddPreview")}</span>
          {quickAddMatches.map((match, index) => (
            <span key={`${match.kind}-${index}`} className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
              {quickAddMatchLabel(match)}
            </span>
          ))}
          <button className="h-6 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" type="button" onClick={() => setQuickAddMatches([])}>
            {t("clearParsedPreview")}
          </button>
        </div>
      )}
    </form>
  );
}
