import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { Check, FolderOpen, PanelRightClose, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { projectById } from "@/data/project";
import type { Project, Reminder, Settings, Task, TaskPriority } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

type TaskDetailPaneProps = {
  task: Task | null;
  projects: Project[];
  reminders: Reminder[];
  settings: Settings;
  actions: TodoActions;
  onClose: () => void;
};

const priorities: TaskPriority[] = ["low", "medium", "high"];

export function TaskDetailPane({ task, projects, reminders, settings, actions, onClose }: TaskDetailPaneProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [projectId, setProjectId] = useState("none");
  const [workingFolder, setWorkingFolder] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
    setDueDate(task?.dueDate ?? "");
    setDueTime(task?.dueTime ?? "");
    setPriority(task?.priority ?? "medium");
    setProjectId(task?.projectId ?? "none");
    setWorkingFolder(task?.workingFolder ?? "");
    setSaveState("idle");
  }, [task]);

  const visibleProjects = projects.filter((project) => project.deletedAt === null && project.status !== "archived");
  const project = task ? projectById(projects, task.projectId) : null;
  const selectedProject = projectId === "none" ? null : projectById(projects, projectId);
  const reminder = task ? reminders.find((item) => item.taskId === task.id && item.enabled) : null;
  const inheritedFolder = selectedProject?.workingFolder ?? settings.defaultWorkingFolder ?? "";
  const effectiveFolder = workingFolder.trim() || inheritedFolder;

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

  const openFolder = async () => {
    if (effectiveFolder) {
      await openPath(effectiveFolder);
    }
  };

  const save = async () => {
    if (!task || !title.trim()) {
      setSaveState("error");
      return;
    }

    setIsSaving(true);
    setSaveState("idle");

    try {
      await actions.updateTask(task.id, {
        title: title.trim(),
        notes,
        dueDate,
        dueTime: dueTime || null,
        priority,
        projectId: projectId === "none" ? null : projectId,
        workingFolder: workingFolder.trim() || null,
      });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <aside
      className={cn(
        "min-h-0 shrink-0 overflow-hidden border-l border-border bg-card/60 transition-[background-color,border-color] duration-150 ease-[var(--ease-out-quart)] max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:shadow-xl",
        task ? "w-[360px] max-xl:w-[332px] max-md:w-[min(360px,calc(100vw-56px))]" : "w-0",
      )}
    >
      {task && (
        <div key={task.id} className="motion-pane-content flex h-full min-w-[320px] flex-col max-sm:min-w-0">
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t("projectTask")}</p>
              <h2 className="truncate text-sm font-semibold">{project?.name ?? t("loose")}</h2>
            </div>
            <Button size="icon-sm" type="button" variant="ghost" title={t("close")} onClick={onClose}>
              <PanelRightClose />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="detail-title">
              {t("taskTitle")}
            </label>
            <input
              id="detail-title"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-medium outline-none transition-colors focus:border-ring"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-xs text-muted-foreground" htmlFor="detail-date">
                {t("dueDate")}
                <input
                  id="detail-date"
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </label>
              <label className="text-xs text-muted-foreground" htmlFor="detail-time">
                {t("dueTime")}
                <input
                  id="detail-time"
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
                  type="time"
                  value={dueTime}
                  onChange={(event) => setDueTime(event.target.value)}
                />
              </label>
            </div>

            <label className="mb-1 mt-4 block text-xs text-muted-foreground" htmlFor="detail-project">
              {t("projects")}
            </label>
            <select
              id="detail-project"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-ring"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="none">{t("noProject")}</option>
              {visibleProjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>

            <label className="mb-1 mt-4 block text-xs text-muted-foreground" htmlFor="detail-folder">
              {t("taskFolder")}
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_36px] gap-1.5">
              <input
                id="detail-folder"
                className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
                placeholder={inheritedFolder || t("defaultFolder")}
                value={workingFolder}
                onChange={(event) => setWorkingFolder(event.target.value)}
              />
              <Button size="icon-lg" type="button" variant="secondary" onClick={() => void chooseFolder()}>
                <FolderOpen />
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-border bg-background/45 px-3 py-2 text-xs text-muted-foreground">
              <span className="min-w-0 truncate">
                {workingFolder.trim()
                  ? t("customFolder")
                  : inheritedFolder
                    ? `${t("inheritedFolder")}: ${inheritedFolder}`
                    : t("noFolder")}
              </span>
              <Button disabled={!effectiveFolder} size="sm" type="button" variant="ghost" onClick={() => void openFolder()}>
                {t("openFolder")}
              </Button>
            </div>

            <label className="mb-1 mt-4 block text-xs text-muted-foreground" htmlFor="detail-priority">
              {t("priority")}
            </label>
            <select
              id="detail-priority"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-ring"
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
            >
              {priorities.map((item) => (
                <option key={item} value={item}>
                  {t(item)}
                </option>
              ))}
            </select>

            <label className="mb-1 mt-4 block text-xs text-muted-foreground" htmlFor="detail-notes">
              {t("notes")}
            </label>
            <textarea
              id="detail-notes"
              className="min-h-32 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />

            <div className="mt-4 rounded-md border border-border bg-background/45 px-3 py-2 text-xs text-muted-foreground">
              {reminder ? `${t("reminder")} · ${new Date(reminder.remindAt).toLocaleString()}` : t("none")}
            </div>
            {saveState !== "idle" && (
              <p className={cn("motion-status mt-3 text-xs", saveState === "saved" ? "text-emerald-600" : "text-destructive")}>
                {saveState === "saved" ? t("saved") : t("operationFailed")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-border p-3">
            <Button disabled={isSaving} type="button" variant="secondary" onClick={() => void actions.toggleTask(task.id)}>
              <Check />
              {task.status === "completed" ? t("openTasks") : t("completed")}
            </Button>
            <Button disabled={isSaving} type="button" onClick={() => void save()}>
              {isSaving ? t("saving") : t("save")}
            </Button>
            <Button
              disabled={isSaving}
              type="button"
              variant="destructive"
              onClick={() => {
                if (!window.confirm(t("confirmDeleteTask"))) {
                  return;
                }

                void actions.deleteTask(task.id);
                onClose();
              }}
            >
              <Trash2 />
              {t("delete")}
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
