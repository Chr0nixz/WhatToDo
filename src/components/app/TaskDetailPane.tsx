import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { Check, FolderOpen, PanelRightClose, Plus, Repeat2, Trash2, X } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { formatReminderDateTime } from "@/data/dateFormat";
import { projectById } from "@/data/project";
import type { Attachment, Project, RecurrenceFrequency, RecurringTaskTemplate, Reminder, Settings, Task, TaskDetailPaneHandle, TaskPriority, TaskStatus } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

type TaskDetailPaneProps = {
  task: Task | null;
  projects: Project[];
  reminders: Reminder[];
  recurringTaskTemplates: RecurringTaskTemplate[];
  attachments: Attachment[];
  tasks: Task[];
  settings: Settings;
  actions: TodoActions;
  onClose: () => void;
  onRequestSwitchCommit?: (nextTaskId: string | null) => void;
};

const priorities: TaskPriority[] = ["low", "medium", "high"];
const recurrenceOptions: RecurrenceFrequency[] = ["daily", "weekly", "monthly", "yearly"];
const reminderOffsetOptions = [10, 30, 60, 1440];
const recurrenceLabelKeys: Record<RecurrenceFrequency, string> = {
  daily: "repeatDaily",
  weekly: "repeatWeekly",
  monthly: "repeatMonthly",
  yearly: "repeatYearly",
};
const weekdayShortKeys = ["weekdaySun", "weekdayMon", "weekdayTue", "weekdayWed", "weekdayThu", "weekdayFri", "weekdaySat"];

export const TaskDetailPane = forwardRef<TaskDetailPaneHandle, TaskDetailPaneProps>(function TaskDetailPane(
  { task, projects, reminders, recurringTaskTemplates, attachments, tasks, settings, actions, onClose, onRequestSwitchCommit },
  ref: Ref<TaskDetailPaneHandle>,
) {
  const { i18n, t } = useTranslation();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [projectId, setProjectId] = useState("none");
  const [workingFolder, setWorkingFolder] = useState("");
  const [useReminder, setUseReminder] = useState(false);
  const [reminderOffset, setReminderOffset] = useState(settings.defaultReminderOffset);
  const [newReminderOffset, setNewReminderOffset] = useState(30);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [parentId, setParentId] = useState<string>("none");
  const [newAttachmentPath, setNewAttachmentPath] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingFuture, setIsSavingFuture] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [deleteState, setDeleteState] = useState<"idle" | "error">("idle");
  const [futureSaveState, setFutureSaveState] = useState<"idle" | "saved" | "error" | "disabled">("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>("daily");
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceByWeekday, setRecurrenceByWeekday] = useState<number[]>([]);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [pendingClose, setPendingClose] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState(false);
  const pendingSwitchRef = useRef<{ nextTaskId: string | null } | null>(null);
  const recurringTemplate = task?.recurrenceTemplateId
    ? recurringTaskTemplates.find((template) => template.id === task.recurrenceTemplateId) ?? null
    : null;

  const visibleProjects = projects.filter((project) => project.deletedAt === null && project.status !== "archived");
  const project = task ? projectById(projects, task.projectId) : null;
  const selectedProject = projectId === "none" ? null : projectById(projects, projectId);
  const reminder = task ? reminders.find((item) => item.taskId === task.id && item.enabled) : null;
  const taskReminders = task ? reminders.filter((item) => item.taskId === task.id && item.enabled) : [];
  const taskAttachments = task ? attachments.filter((item) => item.task_id === task.id) : [];
  const parentTaskOptions = useMemo(
    () => (task ? tasks.filter((item) => item.id !== task.id && item.deletedAt === null) : []),
    [tasks, task],
  );
  const inheritedFolder = selectedProject?.workingFolder ?? settings.defaultWorkingFolder ?? "";
  const effectiveFolder = workingFolder.trim() || inheritedFolder;

  const isDirty = useMemo(() => {
    if (!task) return false;
    const nextReminder = reminders.find((item) => item.taskId === task.id && item.enabled);
    const currentTags = task.tags ?? [];
    return (
      title !== (task.title ?? "") ||
      notes !== (task.notes ?? "") ||
      dueDate !== (task.dueDate ?? "") ||
      dueTime !== (task.dueTime ?? "") ||
      priority !== (task.priority ?? "medium") ||
      projectId !== (task.projectId ?? "none") ||
      workingFolder !== (task.workingFolder ?? "") ||
      useReminder !== Boolean(nextReminder) ||
      (useReminder && reminderOffset !== (nextReminder?.offsetMinutes ?? settings.defaultReminderOffset)) ||
      tags.join("\n") !== currentTags.join("\n") ||
      parentId !== (task.parentId ?? "none")
    );
  }, [title, notes, dueDate, dueTime, priority, projectId, workingFolder, useReminder, reminderOffset, task, reminders, settings.defaultReminderOffset, tags, parentId]);

  useImperativeHandle(
    ref,
    () => ({
      isDirty: () => isDirty,
      requestSwitch: (nextTaskId) => {
        if (isDirty) {
          pendingSwitchRef.current = { nextTaskId };
          setPendingSwitch(true);
          return false;
        }
        return true;
      },
    }),
    [isDirty],
  );

  useEffect(() => {
    if (isDirty) return; // user is editing, do not overwrite
    const nextReminder = task ? reminders.find((item) => item.taskId === task.id && item.enabled) : null;

    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
    setDueDate(task?.dueDate ?? "");
    setDueTime(task?.dueTime ?? "");
    setPriority(task?.priority ?? "medium");
    setProjectId(task?.projectId ?? "none");
    setWorkingFolder(task?.workingFolder ?? "");
    setUseReminder(Boolean(nextReminder));
    setReminderOffset(nextReminder?.offsetMinutes ?? settings.defaultReminderOffset);
    setTags(task?.tags ?? []);
    setParentId(task?.parentId ?? "none");
    setSaveState("idle");
    setDeleteState("idle");
    setFutureSaveState("idle");
    setSaveErrorMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, task?.updatedAt]);

  useEffect(() => {
    setRecurrenceFrequency(recurringTemplate?.frequency ?? "daily");
    setRecurrenceInterval(recurringTemplate?.interval ?? 1);
    setRecurrenceByWeekday(recurringTemplate?.byWeekday ?? []);
    setRecurrenceEndDate(recurringTemplate?.endDate ?? "");
  }, [recurringTemplate]);

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
      try {
        setSaveErrorMessage(null);
        await openPath(effectiveFolder);
        setSaveState("idle");
      } catch {
        setSaveErrorMessage(t("openFolderFailed"));
        setSaveState("error");
      }
    }
  };

  const save = async () => {
    if (!task || !title.trim()) {
      setSaveState("error");
      return;
    }

    setIsSaving(true);
    setSaveState("idle");
    setSaveErrorMessage(null);

    try {
      const nextParentId = parentId === "none" ? null : parentId;
      const parentChanged = nextParentId !== (task.parentId ?? null);
      await actions.updateTask(task.id, {
        title: title.trim(),
        notes,
        dueDate,
        dueTime: dueTime || null,
        priority,
        projectId: projectId === "none" ? null : projectId,
        workingFolder: workingFolder.trim() || null,
        tags,
      });
      if (parentChanged) {
        await actions.setTaskParent(task.id, nextParentId);
      }
      await actions.updateTaskReminder(task.id, useReminder ? reminderOffset : null);
      setSaveState("saved");
    } catch {
      setSaveErrorMessage(t("taskUpdateFailed"));
      setSaveState("error");
    } finally {
      setIsSaving(false);
    }
  };

  const addTag = () => {
    const value = tagInput.trim();
    if (!value || tags.includes(value)) {
      setTagInput("");
      return;
    }
    setTags((prev) => [...prev, value]);
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((item) => item !== tag));
  };

  const chooseAttachmentFile = async () => {
    const selected = await openDialog({
      multiple: false,
      title: t("addAttachment"),
    });
    if (typeof selected === "string") {
      setNewAttachmentPath(selected);
    }
  };

  const addAttachmentFromPath = async () => {
    if (!task) return;
    const path = newAttachmentPath.trim();
    if (!path) return;
    const filename = path.split(/[\\/]/).pop() ?? path;
    await actions.addAttachment({ taskId: task.id, filename, path });
    setNewAttachmentPath("");
  };

  const updateFutureRepeats = async () => {
    if (!task || !recurringTemplate || !title.trim()) {
      setFutureSaveState("error");
      return;
    }

    setIsSavingFuture(true);
    setFutureSaveState("idle");
    setSaveErrorMessage(null);

    try {
      await actions.updateRecurringTaskTemplate(recurringTemplate.id, {
        title: title.trim(),
        notes,
        projectId: projectId === "none" ? null : projectId,
        workingFolder: workingFolder.trim() || null,
        dueTime: dueTime || null,
        priority,
        reminderOffset: useReminder ? reminderOffset : null,
        frequency: recurrenceFrequency,
        interval: recurrenceInterval,
        byWeekday: recurrenceFrequency === "weekly" && recurrenceByWeekday.length > 0 ? recurrenceByWeekday : null,
        endDate: recurrenceEndDate || null,
      });
      setFutureSaveState("saved");
    } catch {
      setSaveErrorMessage(t("taskUpdateFailed"));
      setFutureSaveState("error");
    } finally {
      setIsSavingFuture(false);
    }
  };

  const disableFutureRepeats = async () => {
    if (!recurringTemplate) {
      return;
    }

    setIsSavingFuture(true);
    setFutureSaveState("idle");
    setSaveErrorMessage(null);

    try {
      await actions.disableRecurringTaskTemplate(recurringTemplate.id);
      setFutureSaveState("disabled");
    } catch {
      setSaveErrorMessage(t("taskUpdateFailed"));
      setFutureSaveState("error");
    } finally {
      setIsSavingFuture(false);
    }
  };

  const requestClose = () => {
    if (isDirty) {
      setPendingClose(true);
      return;
    }
    onClose();
  };

  const requestDelete = () => {
    if (isDirty) {
      setPendingDelete(true);
      return;
    }
    void runDelete();
  };

  const runDelete = async () => {
    if (!task) {
      return;
    }
    setDeleteState("idle");
    setSaveErrorMessage(null);
    try {
      await actions.deleteTask(task.id);
      onClose();
    } catch {
      setSaveErrorMessage(t("taskDeleteFailed"));
      setDeleteState("error");
    }
  };

  const saveAndClose = async () => {
    await save();
    setPendingClose(false);
    onClose();
  };

  const saveAndDelete = async () => {
    await save();
    setPendingDelete(false);
    void runDelete();
  };

  const commitSwitch = () => {
    const next = pendingSwitchRef.current?.nextTaskId ?? null;
    pendingSwitchRef.current = null;
    setPendingSwitch(false);
    onRequestSwitchCommit?.(next);
  };

  const saveAndSwitch = async () => {
    await save();
    commitSwitch();
  };

  return (
    <aside
      aria-label={t("projectTask")}
      className={cn(
        "min-h-0 shrink-0 overflow-hidden border-l border-border bg-card/60 transition-[background-color,border-color] duration-150 ease-[var(--ease-out-quart)] max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:shadow-xl max-sm:bottom-14",
        task ? "w-[360px] max-xl:w-[332px] max-md:w-[min(360px,calc(100vw-56px))] max-sm:w-full" : "w-0",
      )}
    >
      {task && (
        <div key={task.id} className="motion-pane-content flex h-full min-w-[320px] flex-col max-sm:min-w-0">
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t("projectTask")}</p>
              <h2 className="truncate text-sm font-semibold">
                {project?.name ?? t("loose")}
                {isDirty && (
                  <span className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-500" title={t("unsavedChanges")} />
                )}
              </h2>
            </div>
            <Button aria-label={t("close")} size="icon-sm" type="button" variant="ghost" title={t("close")} onClick={requestClose}>
              <PanelRightClose aria-hidden="true" />
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
              <Button aria-label={t("chooseFolder")} size="icon-lg" title={t("chooseFolder")} type="button" variant="secondary" onClick={() => void chooseFolder()}>
                <FolderOpen aria-hidden="true" />
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

            <label className="mb-1 mt-4 block text-xs text-muted-foreground" htmlFor="detail-parent">
              {t("parentTask")}
            </label>
            <select
              id="detail-parent"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-ring"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="none">{t("noParentTask")}</option>
              {parentTaskOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
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

            <label className="mb-1 mt-4 block text-xs text-muted-foreground" htmlFor="detail-tags">
              {t("tags")}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-accent px-2 py-0.5 text-xs text-accent-foreground"
                >
                  {tag}
                  <button
                    aria-label={t("removeTag")}
                    className="text-muted-foreground hover:text-foreground"
                    type="button"
                    onClick={() => removeTag(tag)}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                id="detail-tags"
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
                placeholder={t("tagPlaceholder")}
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && event.keyCode !== 229 && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button aria-label={t("addTag")} disabled={!tagInput.trim()} size="icon-lg" type="button" variant="secondary" onClick={addTag}>
                <Plus className="size-4" />
              </Button>
            </div>

            <div className="mt-4 grid gap-2 rounded-md border border-border bg-background/45 p-3 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-2">
                <span>{t("reminder")}</span>
                <Button
                  aria-pressed={useReminder}
                  disabled={isSaving}
                  size="sm"
                  type="button"
                  variant={useReminder ? "secondary" : "ghost"}
                  onClick={() => setUseReminder((value) => !value)}
                >
                  {useReminder ? t("enabled") : t("disabled")}
                </Button>
              </div>
              <label className="grid gap-1" htmlFor="detail-reminder-offset">
                <span>{t("reminderOffset")}</span>
                <select
                  id="detail-reminder-offset"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none transition-colors focus:border-ring disabled:opacity-55"
                  disabled={!useReminder || isSaving}
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
              <span>{reminder ? `${t("reminderTime")}: ${formatReminderDateTime(reminder.remindAt, i18n.language)}` : t("none")}</span>
              {taskReminders.length > 1 && (
                <div className="grid gap-1">
                  <span className="font-medium">{t("additionalReminders")}</span>
                  {taskReminders.slice(1).map((item) => {
                    const key = `reminderOffset${item.offsetMinutes ?? 30}`;
                    const label = [10, 30, 60, 1440].includes(item.offsetMinutes ?? 30)
                      ? t(key)
                      : t("reminderOffsetMinutes", { minutes: String(item.offsetMinutes ?? 30) });
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-2">
                        <span>
                          {label}: {formatReminderDateTime(item.remindAt, i18n.language)}
                        </span>
                        <Button
                          disabled={isSaving}
                          size="sm"
                          type="button"
                          variant="ghost"
                          onClick={() => void actions.deleteReminder(item.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              {useReminder && (
                <div className="flex items-center gap-2">
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring"
                    value={newReminderOffset}
                    onChange={(event) => setNewReminderOffset(Number(event.target.value))}
                  >
                    {reminderOffsetOptions.map((option) => (
                      <option key={option} value={option}>
                        {t(`reminderOffset${option}`)}
                      </option>
                    ))}
                  </select>
                  <Button
                    disabled={isSaving}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      await actions.createTaskReminder(task!.id, newReminderOffset);
                    }}
                  >
                    {t("addReminder")}
                  </Button>
                </div>
              )}
            </div>
            <div className="mt-4 grid gap-2 rounded-md border border-border bg-background/45 p-3 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-2">
                <span>{t("attachments")}</span>
                <span className="text-muted-foreground">{taskAttachments.length}</span>
              </div>
              {taskAttachments.length > 0 && (
                <div className="grid gap-1">
                  {taskAttachments.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2">
                      <button
                        className="min-w-0 truncate text-left text-foreground hover:underline"
                        type="button"
                        title={item.path}
                        onClick={() => void openPath(item.path).catch(() => undefined)}
                      >
                        {item.filename}
                      </button>
                      <Button
                        aria-label={t("removeAttachment")}
                        disabled={isSaving}
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={() => void actions.deleteAttachment(item.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-[minmax(0,1fr)_36px_auto] gap-1.5">
                <input
                  className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring"
                  placeholder={t("attachmentPathPlaceholder")}
                  value={newAttachmentPath}
                  onChange={(event) => setNewAttachmentPath(event.target.value)}
                />
                <Button
                  aria-label={t("chooseFile")}
                  disabled={isSaving}
                  size="icon-lg"
                  title={t("chooseFile")}
                  type="button"
                  variant="secondary"
                  onClick={() => void chooseAttachmentFile()}
                >
                  <FolderOpen aria-hidden="true" />
                </Button>
                <Button
                  disabled={isSaving || !newAttachmentPath.trim()}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => void addAttachmentFromPath()}
                >
                  {t("addAttachment")}
                </Button>
              </div>
            </div>
            {recurringTemplate && (
              <div className="mt-4 grid gap-3 rounded-md border border-border bg-background/45 p-3">
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
                  <Button disabled={isSavingFuture} size="sm" type="button" variant="secondary" onClick={() => void updateFutureRepeats()}>
                    {isSavingFuture ? t("saving") : t("updateFutureRepeats")}
                  </Button>
                  <Button disabled={isSavingFuture || !recurringTemplate.enabled} size="sm" type="button" variant="ghost" onClick={() => void disableFutureRepeats()}>
                    {t("disableRepeat")}
                  </Button>
                </div>
                {futureSaveState !== "idle" && (
                  <p className={cn("motion-status text-xs", futureSaveState === "error" ? "text-destructive" : "text-emerald-600")}>
                    {futureSaveState === "saved"
                      ? t("futureRepeatsUpdated")
                      : futureSaveState === "disabled"
                        ? t("repeatDisabled")
                        : saveErrorMessage ?? t("operationFailed")}
                  </p>
                )}
              </div>
            )}
            {saveState !== "idle" && (
              <p className={cn("motion-status mt-3 text-xs", saveState === "saved" ? "text-emerald-600" : "text-destructive")}>
                {saveState === "saved" ? t("saved") : saveErrorMessage ?? t("operationFailed")}
              </p>
            )}
          </div>

          <div className="border-t border-border p-3">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="task-status-select">
              {t("status")}
            </label>
            <select
              id="task-status-select"
              className="mb-2 h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-ring"
              value={task.status}
              disabled={isSaving}
              onChange={(event) => void actions.setTaskStatus(task.id, event.target.value as TaskStatus)}
            >
              <option value="todo">{t("statusTodo")}</option>
              <option value="in_progress">{t("statusInProgress")}</option>
              <option value="completed">{t("completed")}</option>
              <option value="cancelled">{t("statusCancelled")}</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={isSaving} type="button" variant="secondary" onClick={() => void actions.toggleTask(task.id)}>
                <Check />
                {task.status === "completed" ? t("statusTodo") : t("completed")}
              </Button>
              <Button disabled={isSaving} type="button" onClick={() => void save()}>
                {isSaving ? t("saving") : t("save")}
              </Button>
            </div>
            <Button
              className="mt-2 w-full"
              disabled={isSaving}
              type="button"
              variant="destructive"
              onClick={requestDelete}
            >
              <Trash2 />
              {t("delete")}
            </Button>
          </div>
          {deleteState === "error" && <p className="motion-status border-t border-border px-3 pb-3 text-xs text-destructive">{saveErrorMessage ?? t("operationFailed")}</p>}
        </div>
      )}

      {(pendingClose || pendingDelete || pendingSwitch) && (
        <div className="motion-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="dirty-guard-title">
          <div className="motion-dialog-content fixed left-1/2 top-1/2 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-popover p-4 shadow-xl">
            <h3 id="dirty-guard-title" className="text-sm font-semibold">{t("unsavedChangesTitle")}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{t("discardChanges")}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" type="button" variant="ghost" onClick={() => { setPendingClose(false); setPendingDelete(false); setPendingSwitch(false); pendingSwitchRef.current = null; }}>
                {t("keepEditing")}
              </Button>
              <Button size="sm" type="button" variant="destructive" onClick={() => {
                if (pendingClose) onClose();
                if (pendingDelete) void runDelete();
                if (pendingSwitch) commitSwitch();
                setPendingClose(false);
                setPendingDelete(false);
              }}>
                {t("discard")}
              </Button>
              <Button size="sm" type="button" disabled={isSaving} onClick={() => {
                if (pendingClose) void saveAndClose();
                else if (pendingDelete) void saveAndDelete();
                else if (pendingSwitch) void saveAndSwitch();
              }}>
                {isSaving ? t("saving") : t("saveAnyway")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
});
