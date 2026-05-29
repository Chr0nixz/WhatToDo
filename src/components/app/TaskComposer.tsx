import { FormEvent, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Bell, FolderOpen, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { Project, Settings, TaskPriority } from "@/data/types";
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

export function TaskComposer({
  projects,
  actions,
  defaultDate,
  defaultProjectId = null,
  settings,
  onCreated,
  variant = "inline",
}: TaskComposerProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(defaultDate);
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "none");
  const [workingFolder, setWorkingFolder] = useState("");
  const [useReminder, setUseReminder] = useState(true);

  useEffect(() => {
    setDueDate(defaultDate);
    setProjectId(defaultProjectId ?? "none");
  }, [defaultDate, defaultProjectId]);

  const chooseFolder = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "Select task folder",
    });

    if (typeof selected === "string") {
      setWorkingFolder(selected);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextTitle = title.trim();

    if (!nextTitle) {
      return;
    }

    await actions.createTask({
      title: nextTitle,
      dueDate,
      dueTime: dueTime || null,
      priority,
      projectId: projectId === "none" ? null : projectId,
      workingFolder: workingFolder.trim() || null,
      reminderOffset: useReminder ? settings.defaultReminderOffset : null,
    });

    setTitle("");
    setDueDate(defaultDate);
    setDueTime("");
    setPriority("medium");
    setProjectId(defaultProjectId ?? "none");
    setWorkingFolder("");
    onCreated?.();
  };

  return (
    <form
      className={cn(
        variant === "inline" &&
          "grid grid-cols-[minmax(150px,1fr)_128px_96px_82px_112px_36px_36px] gap-1.5 rounded-lg border border-border bg-card/75 p-2 shadow-sm max-xl:grid-cols-[minmax(150px,1fr)_128px_92px_36px_36px] max-xl:[&_.project-field]:hidden",
        variant === "dialog" && "grid grid-cols-2 gap-3",
      )}
      onSubmit={handleSubmit}
    >
      <label className="sr-only" htmlFor="task-title">
        {t("taskTitle")}
      </label>
      <input
        id="task-title"
        className={cn(
          "h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring",
          variant === "dialog" && "col-span-2",
        )}
        placeholder={t("taskTitle")}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
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
        className={cn(
          "project-field h-9 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-ring",
          variant === "dialog" && "col-span-2",
        )}
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
      {variant === "dialog" && (
        <div className="col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="task-folder">
            {t("taskFolder")}
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_40px] gap-2">
            <input
              id="task-folder"
              className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
              placeholder={t("inheritedFolder")}
              value={workingFolder}
              onChange={(event) => setWorkingFolder(event.target.value)}
            />
            <Button size="icon-lg" type="button" variant="secondary" onClick={() => void chooseFolder()}>
              <FolderOpen />
            </Button>
          </div>
        </div>
      )}
      <Button
        aria-pressed={useReminder}
        className={variant === "dialog" ? "justify-start" : undefined}
        size={variant === "dialog" ? "lg" : "icon-lg"}
        type="button"
        variant={useReminder ? "secondary" : "ghost"}
        title={t("reminder")}
        onClick={() => setUseReminder((value) => !value)}
      >
        <Bell className={useReminder ? "text-amber-500" : "text-muted-foreground"} />
      </Button>
      <Button
        className={cn("relative", variant === "dialog" && "shadow-sm shadow-primary/20")}
        size={variant === "dialog" ? "lg" : "icon-lg"}
        type="submit"
        title={t("add")}
      >
        <Plus />
        {variant === "dialog" && t("add")}
      </Button>
    </form>
  );
}
