import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const workspaceCount = 4;
const taskCount = 20_000;
const projectCountPerWorkspace = 8;
const folderCountPerWorkspace = 3;
const outputDir = join(process.cwd(), "tmp");
const outputPath = join(outputDir, "performance-backup-20000.json");
const exportedAt = "2026-05-31T00:00:00.000Z";
const colors = ["#4fb8d8", "#6cc083", "#d7a742", "#ec6f5d"];
const priorities = ["high", "medium", "low"];

const timestamp = (index) => new Date(Date.UTC(2026, 4, 1, 0, index % 60, Math.floor(index / 60) % 60)).toISOString();
const dateKey = (index) => new Date(Date.UTC(2026, 4, 1 + (index % 120))).toISOString().slice(0, 10);
const timeKey = (index) => `${String(8 + (index % 11)).padStart(2, "0")}:${index % 2 === 0 ? "00" : "30"}`;

const settings = {
  theme: "system",
  accentColor: "blue",
  language: "zh",
  defaultReminderOffset: 30,
  defaultWorkingFolder: null,
  defaultSavedViewId: null,
  notificationsEnabled: false,
  closeToTray: true,
};

const workspaces = Array.from({ length: workspaceCount }, (_, index) => ({
  id: index === 0 ? "local-workspace" : `perf-workspace-${index + 1}`,
  name: index === 0 ? "Default" : `Performance Workspace ${index + 1}`,
  color: colors[index % colors.length],
  createdAt: timestamp(index),
  updatedAt: timestamp(index),
  deletedAt: null,
}));

const projects = workspaces.flatMap((workspace, workspaceIndex) =>
  Array.from({ length: projectCountPerWorkspace }, (_, index) => ({
    id: `perf-project-${workspaceIndex + 1}-${index + 1}`,
    workspaceId: workspace.id,
    name: `Project ${workspaceIndex + 1}.${index + 1}`,
    color: colors[(workspaceIndex + index) % colors.length],
    status: index === projectCountPerWorkspace - 1 ? "archived" : "active",
    dueDate: dateKey(index * 9 + workspaceIndex),
    workingFolder: null,
    createdAt: timestamp(index + workspaceIndex * 100),
    updatedAt: timestamp(index + workspaceIndex * 100),
    archivedAt: index === projectCountPerWorkspace - 1 ? timestamp(index + workspaceIndex * 100 + 1) : null,
    deletedAt: null,
  })),
);

const workspaceFolders = workspaces.flatMap((workspace, workspaceIndex) =>
  Array.from({ length: folderCountPerWorkspace }, (_, index) => ({
    id: `perf-folder-${workspaceIndex + 1}-${index + 1}`,
    workspaceId: workspace.id,
    name: `Folder ${workspaceIndex + 1}.${index + 1}`,
    path: `D:\\Performance\\Workspace-${workspaceIndex + 1}\\Folder-${index + 1}`,
    createdAt: timestamp(index + workspaceIndex * 20),
    updatedAt: timestamp(index + workspaceIndex * 20),
    deletedAt: null,
  })),
);

const tasks = Array.from({ length: taskCount }, (_, index) => {
  const workspace = workspaces[index % workspaces.length];
  const workspaceIndex = index % workspaces.length;
  const projectSlot = index % (projectCountPerWorkspace + 1);
  const projectId =
    projectSlot === projectCountPerWorkspace
      ? null
      : `perf-project-${workspaceIndex + 1}-${(projectSlot % (projectCountPerWorkspace - 1)) + 1}`;
  const completed = index % 4 === 0;

  return {
    id: `perf-task-${String(index + 1).padStart(5, "0")}`,
    workspaceId: workspace.id,
    projectId,
    workingFolder: index % 6 === 0 ? `D:\\Performance\\TaskFolders\\${index % 20}` : null,
    title: `Performance task ${index + 1}`,
    notes: index % 7 === 0 ? `Synthetic notes for task ${index + 1}` : "",
    dueDate: dateKey(index),
    dueTime: index % 3 === 0 ? timeKey(index) : null,
    timezone: "Asia/Shanghai",
    priority: priorities[index % priorities.length],
    status: completed ? "completed" : "todo",
    completedAt: completed ? timestamp(index + 10_000) : null,
    createdAt: timestamp(index),
    updatedAt: timestamp(index),
    deletedAt: null,
    recurrenceTemplateId: null,
    recurrenceInstanceDate: null,
  };
});

const reminders = tasks
  .filter((_, index) => index % 5 === 0)
  .map((task, index) => ({
    id: `perf-reminder-${String(index + 1).padStart(5, "0")}`,
    taskId: task.id,
    remindAt: `${task.dueDate}T${task.dueTime ?? "09:00"}:00.000+08:00`,
    offsetMinutes: 30,
    snoozedUntil: null,
    firedAt: index % 9 === 0 ? timestamp(index + 20_000) : null,
    failedAt: null,
    lastError: null,
    lastAttemptedAt: null,
    enabled: index % 11 !== 0,
  }));

const savedViews = workspaces.flatMap((workspace, index) => [
  {
    id: `perf-view-open-${index + 1}`,
    workspaceId: workspace.id,
    name: "Open high priority",
    filters: {
      scope: "open",
      priority: "high",
      projectId: "all",
      reminder: "all",
      folder: "all",
      dateRange: "all",
    },
    createdAt: timestamp(index),
    updatedAt: timestamp(index),
  },
  {
    id: `perf-view-reminders-${index + 1}`,
    workspaceId: workspace.id,
    name: "With reminders",
    filters: {
      scope: "all",
      priority: "all",
      projectId: "all",
      reminder: "with",
      folder: "all",
      dateRange: "week",
    },
    createdAt: timestamp(index + 10),
    updatedAt: timestamp(index + 10),
  },
]);

const backup = {
  whattodoBackupVersion: 2,
  exportedAt,
  workspaceId: workspaces[0].id,
  workspaces,
  workspaceFolders,
  projects,
  tasks,
  reminders,
  settingsByWorkspace: Object.fromEntries(workspaces.map((workspace) => [workspace.id, settings])),
  savedViews,
  recurringTaskTemplates: [],
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");

// Self-check: settings must include fields required by backupSchema (with defaults applied).
for (const [workspaceId, workspaceSettings] of Object.entries(backup.settingsByWorkspace)) {
  const required = [
    "theme",
    "accentColor",
    "language",
    "defaultReminderOffset",
    "defaultWorkingFolder",
    "defaultSavedViewId",
    "notificationsEnabled",
    "closeToTray",
  ];
  for (const key of required) {
    if (!(key in workspaceSettings)) {
      console.error(`Fixture settings for ${workspaceId} missing ${key}`);
      process.exit(1);
    }
  }
}

if (backup.whattodoBackupVersion !== 2 || !Array.isArray(backup.recurringTaskTemplates)) {
  console.error("Fixture failed structural self-check for v2 backup shape");
  process.exit(1);
}

const validate = spawnSync(
  process.execPath,
  [join(process.cwd(), "scripts", "validate-performance-fixture.mjs"), outputPath],
  { stdio: "inherit", cwd: process.cwd() },
);
if (validate.status !== 0) {
  console.error("Fixture failed parseBackupPayload self-check");
  process.exit(validate.status ?? 1);
}

console.log(`Wrote ${outputPath}`);
console.log(`${workspaces.length} workspaces, ${tasks.length} tasks, ${reminders.length} reminders`);
