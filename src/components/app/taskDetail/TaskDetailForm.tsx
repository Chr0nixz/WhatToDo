import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { revealLocalPath } from "@/lib/openLocalPath";
import { Check, FolderOpen, PanelRightClose, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { formatReminderDateTime } from "@/data/dateFormat";
import { prepareManagedAttachmentPath } from "@/data/managedAttachments";
import { projectById } from "@/data/project";
import { createId, isTauriRuntime } from "@/data/repositoryContract";
import { getDirectChildrenWithProgress, wouldCreateParentCycle } from "@/data/taskTree";
import type {
  Attachment,
  Project,
  RecurrenceFrequency,
  RecurringTaskTemplate,
  Reminder,
  Settings,
  Task,
  TaskPriority,
  TaskSummary,
} from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";
import { TaskAttachmentsSection } from "./TaskAttachmentsSection";
import { TaskRecurrenceSection } from "./TaskRecurrenceSection";

export type TaskDetailFormProps = {
  task: Task;
  projects: Project[];
  reminders: Reminder[];
  recurringTaskTemplates: RecurringTaskTemplate[];
  attachments: Attachment[];
  tasks: TaskSummary[];
  settings: Settings;
  actions: TodoActions;
  onRequestClose: () => void;
  onRequestDelete: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onSave?: (task: Task) => Promise<boolean>;
};

const priorities: TaskPriority[] = ["low", "medium", "high"];
const reminderOffsetOptions = [10, 30, 60, 1440];

const describeError = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 120 ? `${message.slice(0, 117)}...` : message;
};

export function TaskDetailForm({
  task,
  projects,
  reminders,
  recurringTaskTemplates,
  attachments,
  tasks,
  settings,
  actions,
  onRequestClose,
  onRequestDelete,
  onDirtyChange,
}: TaskDetailFormProps) {
  const { i18n, t } = useTranslation();

  const nextReminder = reminders.find((item) => item.taskId === task.id && item.enabled);

  // Form states naturally initialized on mount via React key={task.id}
  const [title, setTitle] = useState(task.title ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [dueTime, setDueTime] = useState(task.dueTime ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority ?? "medium");
  const [projectId, setProjectId] = useState<string>(task.projectId ?? "none");
  const [workingFolder, setWorkingFolder] = useState(task.workingFolder ?? "");
  const [useReminder, setUseReminder] = useState(Boolean(nextReminder));
  const [reminderOffset, setReminderOffset] = useState(nextReminder?.offsetMinutes ?? settings.defaultReminderOffset);
  const [newReminderOffset, setNewReminderOffset] = useState(30);
  const [tags, setTags] = useState<string[]>(task.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [parentId, setParentId] = useState<string>(task.parentId ?? "none");
  const [newAttachmentPath, setNewAttachmentPath] = useState("");
  const [attachmentErrorId, setAttachmentErrorId] = useState<string | null>(null);
  const [attachmentCopyError, setAttachmentCopyError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingFuture, setIsSavingFuture] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [futureSaveState, setFutureSaveState] = useState<"idle" | "saved" | "error" | "disabled">("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [futureUpdateOpen, setFutureUpdateOpen] = useState(false);
  const [futureUpdateMode, setFutureUpdateMode] = useState<"template" | "openFuture">("template");

  const recurringTemplate = task.recurrenceTemplateId
    ? recurringTaskTemplates.find((template) => template.id === task.recurrenceTemplateId) ?? null
    : null;

  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>(recurringTemplate?.frequency ?? "daily");
  const [recurrenceInterval, setRecurrenceInterval] = useState(recurringTemplate?.interval ?? 1);
  const [recurrenceByWeekday, setRecurrenceByWeekday] = useState<number[]>(recurringTemplate?.byWeekday ?? []);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(recurringTemplate?.endDate ?? "");

  const extraRemindersCount = reminders.filter((item) => item.taskId === task.id && item.enabled).length;
  const [remindersOpen, setRemindersOpen] = useState(extraRemindersCount > 1);
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(task.parentId) || Boolean(task.recurrenceTemplateId));

  const visibleProjects = projects.filter((project) => project.deletedAt === null && project.status !== "archived");
  const selectedProject = projectId === "none" ? null : projectById(projects, projectId);
  const taskReminders = reminders.filter((item) => item.taskId === task.id && item.enabled);
  const taskAttachments = attachments.filter((item) => item.task_id === task.id);
  const tasksById = useMemo(() => new Map(tasks.map((item) => [item.id, item])), [tasks]);

  const parentTaskOptions = useMemo(() => {
    const activeParentId = parentId !== "none" ? parentId : task.parentId;
    const currentProjectId = projectId !== "none" ? projectId : task.projectId;

    const MAX_CANDIDATES = 100;
    const candidates: TaskSummary[] = [];
    const seenIds = new Set<string>();

    if (activeParentId) {
      const activeParentTask = tasksById.get(activeParentId);
      if (
        activeParentTask &&
        activeParentTask.deletedAt === null &&
        !wouldCreateParentCycle(tasksById, task.id, activeParentTask.id)
      ) {
        candidates.push(activeParentTask);
        seenIds.add(activeParentTask.id);
      }
    }

    const remainingPool = tasks.filter(
      (item) => item.id !== task.id && item.deletedAt === null && !seenIds.has(item.id),
    );

    remainingPool.sort((a, b) => {
      const aSameProj = a.projectId === currentProjectId ? 1 : 0;
      const bSameProj = b.projectId === currentProjectId ? 1 : 0;
      if (aSameProj !== bSameProj) return bSameProj - aSameProj;
      const aActive = a.status === "todo" || a.status === "in_progress" ? 1 : 0;
      const bActive = b.status === "todo" || b.status === "in_progress" ? 1 : 0;
      return bActive - aActive;
    });

    for (const item of remainingPool) {
      if (candidates.length >= MAX_CANDIDATES) {
        break;
      }
      if (!wouldCreateParentCycle(tasksById, task.id, item.id)) {
        candidates.push(item);
      }
    }

    return candidates;
  }, [tasks, tasksById, task, parentId, projectId]);

  const { children: childTasks, progress: childProgress } = useMemo(
    () => getDirectChildrenWithProgress(tasks, task.id),
    [tasks, task.id],
  );
  const inheritedFolder = selectedProject?.workingFolder ?? settings.defaultWorkingFolder ?? "";
  const effectiveFolder = workingFolder.trim() || inheritedFolder;

  const isDirty = useMemo(() => {
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
      parentId !== (task.parentId ?? "none") ||
      tags.length !== currentTags.length ||
      tags.some((tag, i) => tag !== currentTags[i]) ||
      (recurringTemplate !== null &&
        (recurrenceFrequency !== recurringTemplate.frequency ||
          recurrenceInterval !== recurringTemplate.interval ||
          recurrenceEndDate !== (recurringTemplate.endDate ?? "") ||
          recurrenceByWeekday.length !== (recurringTemplate.byWeekday?.length ?? 0) ||
          recurrenceByWeekday.some((day, i) => day !== recurringTemplate.byWeekday?.[i])))
    );
  }, [
    title,
    notes,
    dueDate,
    dueTime,
    priority,
    projectId,
    workingFolder,
    useReminder,
    reminderOffset,
    parentId,
    tags,
    task,
    nextReminder,
    settings.defaultReminderOffset,
    recurringTemplate,
    recurrenceFrequency,
    recurrenceInterval,
    recurrenceEndDate,
    recurrenceByWeekday,
  ]);

  // Synchronize dirty state upwards if listener provided
  useMemo(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

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
        await revealLocalPath(effectiveFolder);
        setSaveState("idle");
      } catch {
        setSaveErrorMessage(t("openFolderFailed"));
        setSaveState("error");
      }
    }
  };

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed || tags.includes(trimmed)) {
      return;
    }
    setTags((current) => [...current, trimmed]);
    setTagInput("");
  };

  const removeTag = (tagToRemove: string) => {
    setTags((current) => current.filter((tag) => tag !== tagToRemove));
  };

  const save = async (): Promise<boolean> => {
    if (!title.trim() || isSaving) {
      return false;
    }

    setIsSaving(true);
    setSaveState("idle");
    setSaveErrorMessage(null);

    try {
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

      if (parentId !== (task.parentId ?? "none")) {
        await actions.setTaskParent(task.id, parentId === "none" ? null : parentId);
      }

      const currentReminder = reminders.find((item) => item.taskId === task.id && item.enabled);
      if (useReminder) {
        if (!currentReminder || currentReminder.offsetMinutes !== reminderOffset) {
          await actions.updateTaskReminder(task.id, reminderOffset);
        }
      } else if (currentReminder) {
        await actions.updateTaskReminder(task.id, null);
      }

      setSaveState("saved");
      return true;
    } catch (err) {
      setSaveErrorMessage(`${t("taskUpdateFailed")}: ${describeError(err)}`);
      setSaveState("error");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const executeFutureSave = async (mode: "template" | "openFuture") => {
    if (!recurringTemplate) return;
    setIsSavingFuture(true);
    setFutureSaveState("idle");
    setSaveErrorMessage(null);

    try {
      await actions.updateRecurringSeries(
        recurringTemplate.id,
        {
          title: title.trim(),
          notes,
          projectId: projectId === "none" ? null : projectId,
          workingFolder: workingFolder.trim() || null,
          dueTime: dueTime || null,
          priority,
          reminderOffset: useReminder ? reminderOffset : null,
          frequency: recurrenceFrequency,
          interval: Math.max(1, recurrenceInterval),
          byWeekday: recurrenceFrequency === "weekly" ? recurrenceByWeekday : null,
          endDate: recurrenceEndDate || null,
          parentId: parentId === "none" ? null : parentId,
          tags,
        },
        mode,
      );
      setFutureSaveState("saved");
      setFutureUpdateOpen(false);
    } catch (err) {
      setSaveErrorMessage(`${t("taskUpdateFailed")}: ${describeError(err)}`);
      setFutureSaveState("error");
    } finally {
      setIsSavingFuture(false);
    }
  };

  const chooseAttachmentFile = async () => {
    const selected = await openDialog({
      multiple: false,
      title: t("selectAttachmentFile"),
    });
    if (typeof selected === "string") {
      setNewAttachmentPath(selected);
    }
  };

  const addAttachmentFromPath = async () => {
    const path = newAttachmentPath.trim();
    if (!path) return;
    const name = path.split(/[\\/]/).pop() || "attachment";
    let finalPath = path;
    if (isTauriRuntime()) {
      try {
        finalPath = await prepareManagedAttachmentPath(path, createId("att"), name);
      } catch (err) {
        setAttachmentCopyError(`${t("attachmentCopyFailed")}: ${describeError(err)}`);
        return;
      }
    }
    await actions.addAttachment({
      taskId: task.id,
      filename: name,
      path: finalPath,
      mimeType: null,
      size: null,
    });
    setNewAttachmentPath("");
  };

  const disableFutureRepeats = async () => {
    if (!recurringTemplate) return;
    try {
      await actions.disableRecurringTaskTemplate(recurringTemplate.id);
    } catch (err) {
      setSaveErrorMessage(`${t("taskUpdateFailed")}: ${describeError(err)}`);
    }
  };

  return (
    <div className="motion-pane-content flex h-full min-w-[320px] flex-col max-sm:min-w-0">
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="min-w-0">
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <span className="truncate">{task.title}</span>
            {isDirty && (
              <span
                aria-atomic="true"
                aria-live="polite"
                className="shrink-0 rounded-full bg-warning/12 px-1.5 py-0.5 text-xs font-medium text-warning-foreground dark:text-warning"
                role="status"
              >
                {t("unsavedBadge")}
              </span>
            )}
          </h2>
        </div>
        <Button
          aria-label={t("close")}
          size="icon-sm"
          type="button"
          variant="ghost"
          title={t("close")}
          onClick={onRequestClose}
        >
          <PanelRightClose aria-hidden="true" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <section aria-labelledby="detail-essentials-heading" className="grid gap-3">
          <h3 id="detail-essentials-heading" className="text-xs font-medium text-muted-foreground">
            {t("taskDetailEssentials")}
          </h3>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="detail-title">
              {t("taskTitle")}
            </label>
            <input
              id="detail-title"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-medium outline-none transition-colors focus:border-ring"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
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

          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="detail-project">
              {t("project")}
            </label>
            <select
              id="detail-project"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-ring"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="none">{t("noProject")}</option>
              {visibleProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="mb-1 block text-xs text-muted-foreground">{t("priority")}</span>
            <div className="grid grid-cols-3 gap-2">
              {priorities.map((item) => (
                <button
                  key={item}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md border border-border text-xs capitalize transition-colors hover:bg-accent",
                    priority === item && "border-ring bg-accent font-semibold text-accent-foreground",
                  )}
                  type="button"
                  onClick={() => setPriority(item)}
                >
                  {t(item)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="detail-content-heading" className="mt-4 grid gap-3 border-t border-border pt-4">
          <h3 id="detail-content-heading" className="text-xs font-medium text-muted-foreground">
            {t("taskDetailContent")}
          </h3>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="detail-notes">
              {t("notes")}
            </label>
            <textarea
              id="detail-notes"
              className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm outline-none transition-colors focus:border-ring"
              placeholder={t("addNotes")}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="detail-tags">
              {t("tags")}
            </label>
            <div className="flex gap-2">
              <input
                id="detail-tags"
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
                placeholder={t("tagInputPlaceholder")}
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button size="sm" type="button" variant="outline" onClick={addTag}>
                {t("add")}
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                  >
                    <span>{tag}</span>
                    <button
                      aria-label={t("delete")}
                      className="text-muted-foreground hover:text-foreground"
                      type="button"
                      onClick={() => removeTag(tag)}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="detail-links-heading" className="mt-4 grid gap-3 border-t border-border pt-4">
          <h3 id="detail-links-heading" className="text-xs font-medium text-muted-foreground">
            {t("taskDetailLinks")}
          </h3>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="detail-working-folder">
              {t("workingFolder")}
            </label>
            <div className="flex gap-2">
              <input
                id="detail-working-folder"
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
                placeholder={inheritedFolder ? `${t("inheritedFromProject")}: ${inheritedFolder}` : "D:\\Projects\\..."}
                value={workingFolder}
                onChange={(event) => setWorkingFolder(event.target.value)}
              />
              <Button
                aria-label={t("chooseFolder")}
                size="icon-lg"
                title={t("chooseFolder")}
                type="button"
                variant="secondary"
                onClick={() => void chooseFolder()}
              >
                <FolderOpen className="size-4" />
              </Button>
              {effectiveFolder && (
                <Button
                  aria-label={t("openFolder")}
                  size="icon-lg"
                  title={t("openFolder")}
                  type="button"
                  variant="outline"
                  onClick={() => void openFolder()}
                >
                  <FolderOpen className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </section>

        <TaskAttachmentsSection
          actions={actions}
          addAttachmentFromPath={addAttachmentFromPath}
          attachmentCopyError={attachmentCopyError}
          attachmentErrorId={attachmentErrorId}
          chooseAttachmentFile={chooseAttachmentFile}
          isSaving={isSaving}
          newAttachmentPath={newAttachmentPath}
          setAttachmentErrorId={setAttachmentErrorId}
          setNewAttachmentPath={setNewAttachmentPath}
          taskAttachments={taskAttachments}
        />

        <section aria-labelledby="detail-reminders-heading" className="mt-4 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <h3 id="detail-reminders-heading" className="text-xs font-medium text-muted-foreground">
              {t("reminder")}
            </h3>
            <button
              aria-expanded={remindersOpen}
              className="text-xs text-muted-foreground hover:text-foreground"
              type="button"
              onClick={() => setRemindersOpen((prev) => !prev)}
            >
              {remindersOpen ? t("collapse") : t("expand")}
            </button>
          </div>

          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground" htmlFor="detail-use-reminder">
              <input
                id="detail-use-reminder"
                checked={useReminder}
                className="size-3.5 rounded border-input"
                type="checkbox"
                onChange={(event) => setUseReminder(event.target.checked)}
              />
              <span>{t("enableReminder")}</span>
            </label>

            {useReminder && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none transition-colors focus:border-ring"
                  value={reminderOffset}
                  onChange={(event) => setReminderOffset(Number(event.target.value))}
                >
                  {reminderOffsetOptions.map((offset) => (
                    <option key={offset} value={offset}>
                      {t(`reminderOffset_${offset}`)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {remindersOpen && (
              <div className="mt-2 space-y-1.5 border-t border-border/50 pt-2">
                <p className="text-xs font-medium text-muted-foreground">{t("additionalReminders")}</p>
                {taskReminders.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs">
                    <span className="truncate">{formatReminderDateTime(r.remindAt, i18n.language)}</span>
                    <Button
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                      onClick={() => void actions.deleteReminder(r.id)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <select
                    className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none transition-colors focus:border-ring"
                    value={newReminderOffset}
                    onChange={(event) => setNewReminderOffset(Number(event.target.value))}
                  >
                    {reminderOffsetOptions.map((offset) => (
                      <option key={offset} value={offset}>
                        {t(`reminderOffset_${offset}`)}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => void actions.createTaskReminder(task.id, newReminderOffset)}
                  >
                    <Plus className="size-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="detail-advanced-heading" className="mt-4 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <h3 id="detail-advanced-heading" className="text-xs font-medium text-muted-foreground">
              {t("advanced")}
            </h3>
            <button
              aria-expanded={advancedOpen}
              className="text-xs text-muted-foreground hover:text-foreground"
              type="button"
              onClick={() => setAdvancedOpen((prev) => !prev)}
            >
              {advancedOpen ? t("collapse") : t("expand")}
            </button>
          </div>

          {advancedOpen && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground" htmlFor="detail-parent">
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
              </div>

              {childTasks.length > 0 && (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">
                    {childProgress
                      ? t("subtasksProgress", {
                          completed: childProgress.completed,
                          total: childProgress.total,
                        })
                      : t("subtasksCount", { count: childTasks.length })}
                  </p>
                  <ul className="grid gap-1">
                    {childTasks.map((child) => (
                      <li key={child.id} className="text-xs text-foreground">
                        {child.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {recurringTemplate && (
                <TaskRecurrenceSection
                  dueDate={dueDate}
                  futureSaveState={futureSaveState}
                  isSavingFuture={isSavingFuture}
                  onDisableFutureRepeats={disableFutureRepeats}
                  onOpenFutureUpdate={() => {
                    setFutureUpdateMode("template");
                    setFutureUpdateOpen(true);
                  }}
                  recurrenceByWeekday={recurrenceByWeekday}
                  recurrenceEndDate={recurrenceEndDate}
                  recurrenceFrequency={recurrenceFrequency}
                  recurrenceInterval={recurrenceInterval}
                  recurringTemplate={recurringTemplate}
                  saveErrorMessage={saveErrorMessage}
                  setRecurrenceByWeekday={setRecurrenceByWeekday}
                  setRecurrenceEndDate={setRecurrenceEndDate}
                  setRecurrenceFrequency={setRecurrenceFrequency}
                  setRecurrenceInterval={setRecurrenceInterval}
                />
              )}
            </div>
          )}
        </section>
      </div>

      <div className="flex items-center justify-between border-t border-border p-4">
        <Button
          size="sm"
          type="button"
          variant="destructive"
          onClick={onRequestDelete}
        >
          <Trash2 className="size-4" />
          <span>{t("delete")}</span>
        </Button>

        <div className="flex items-center gap-2">
          {saveState === "saved" && (
            <span className="flex items-center gap-1 text-xs text-success">
              <Check className="size-3" />
              <span>{t("saved")}</span>
            </span>
          )}
          {saveErrorMessage && (
            <span className="text-xs text-destructive">{saveErrorMessage}</span>
          )}
          <Button
            disabled={!title.trim() || isSaving}
            size="sm"
            type="button"
            variant="default"
            onClick={() => void save()}
          >
            {isSaving ? t("saving") : t("save")}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        confirmLabel={t("confirm")}
        description={
          futureUpdateMode === "openFuture"
            ? t("confirmUpdateRecurringFutureHint")
            : t("confirmUpdateRecurringTemplateHint")
        }
        open={futureUpdateOpen}
        title={t("confirmUpdateRecurringSeries")}
        onConfirm={() => void executeFutureSave(futureUpdateMode)}
        onOpenChange={setFutureUpdateOpen}
      />
    </div>
  );
}
