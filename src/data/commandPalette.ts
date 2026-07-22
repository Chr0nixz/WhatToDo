import type { AppData, AppView, SavedTaskView } from "./types";
import { sortSavedViews } from "./savedViews";

export type CommandGroup = "recent" | "navigation" | "tasks" | "workspaces" | "folders" | "savedViews" | "manage";

export type CommandItem = {
  id: string;
  group: CommandGroup;
  label: string;
  keywords: string[];
  shortcut?: string;
  enabled?: boolean;
  run: () => void | Promise<void>;
};

export type CommandPaletteContext = {
  data: AppData;
  t: (key: string, options?: Record<string, unknown>) => string;
  setView: (view: AppView) => void;
  onOpenTask: (taskId: string) => void;
  onNewTask: () => void;
  onSearchTasks: () => void;
  selectWorkspace: (workspaceId: string) => void | Promise<void>;
  openFolder: (path: string) => void | Promise<void>;
  applySavedView: (view: SavedTaskView) => void;
  onEditWorkspace: () => void;
  onEditProject: (projectId: string) => void;
  onCycleTheme: () => void | Promise<void>;
  onToggleLanguage: () => void | Promise<void>;
};

const navViews: { id: AppView; labelKey: string; keywords: string[] }[] = [
  { id: "home", labelKey: "home", keywords: ["calendar", "ddl"] },
  { id: "overview", labelKey: "overview", keywords: ["all tasks", "tasks"] },
  { id: "projects", labelKey: "projects", keywords: ["project"] },
  { id: "workspaces", labelKey: "workspaces", keywords: ["workspace"] },
  { id: "reminders", labelKey: "reminders", keywords: ["reminder"] },
  { id: "settings", labelKey: "settings", keywords: ["settings"] },
];

export const buildCommandItems = (context: CommandPaletteContext): CommandItem[] => {
  const {
    data,
    t,
    setView,
    onNewTask,
    onSearchTasks,
    selectWorkspace,
    openFolder,
    applySavedView,
    onEditWorkspace,
    onEditProject,
    onCycleTheme,
    onToggleLanguage,
  } = context;

  const items: CommandItem[] = [];

  for (const nav of navViews) {
    items.push({
      id: `nav:${nav.id}`,
      group: "navigation",
      label: t(nav.labelKey),
      keywords: nav.keywords,
      run: () => setView(nav.id),
    });
  }

  items.push({
    id: "task:new",
    group: "tasks",
    label: t("commandNewTask"),
    keywords: ["add", "create"],
    shortcut: t("shortcutNewTask"),
    run: onNewTask,
  });

  items.push({
    id: "task:search",
    group: "tasks",
    label: t("commandSearchTasks"),
    keywords: ["find", "search"],
    shortcut: t("shortcutSearchTasks"),
    run: onSearchTasks,
  });

  for (const workspace of data.workspaces) {
    items.push({
      id: `workspace:${workspace.id}`,
      group: "workspaces",
      label: t("commandSwitchWorkspace", { name: workspace.name }),
      keywords: [workspace.name, "switch"],
      enabled: workspace.id !== data.workspaceId,
      run: () => void selectWorkspace(workspace.id),
    });
  }

  for (const folder of data.workspaceFolders) {
    items.push({
      id: `folder:workspace:${folder.id}`,
      group: "folders",
      label: t("commandOpenFolder", { name: folder.name }),
      keywords: [folder.name, folder.path, "folder"],
      run: () => void openFolder(folder.path),
    });
  }

  for (const project of data.projects.filter((item) => item.deletedAt === null && item.status !== "archived")) {
    if (project.workingFolder?.trim()) {
      items.push({
        id: `folder:project:${project.id}`,
        group: "folders",
        label: t("commandOpenFolder", { name: project.name }),
        keywords: [project.name, project.workingFolder, "project"],
        run: () => void openFolder(project.workingFolder!.trim()),
      });
    }
  }

  if (data.settings.defaultWorkingFolder?.trim()) {
    items.push({
      id: "folder:default",
      group: "folders",
      label: t("commandOpenDefaultFolder"),
      keywords: ["default", data.settings.defaultWorkingFolder],
      run: () => void openFolder(data.settings.defaultWorkingFolder!.trim()),
    });
  }

  for (const view of sortSavedViews(data.savedViews)) {
    items.push({
      id: `saved-view:${view.id}`,
      group: "savedViews",
      label: t("commandApplySavedView", { name: view.name }),
      keywords: [view.name, "view", "filter"],
      run: () => applySavedView(view),
    });
  }

  items.push({
    id: "manage:workspace",
    group: "manage",
    label: t("commandEditWorkspace"),
    keywords: ["edit workspace"],
    run: onEditWorkspace,
  });

  const themeLabelKey = data.settings.theme === "system"
    ? "commandCycleThemeSystem"
    : data.settings.theme === "light"
      ? "commandCycleThemeLight"
      : "commandCycleThemeDark";
  items.push({
    id: "manage:cycle-theme",
    group: "manage",
    label: t(themeLabelKey),
    keywords: ["theme", "dark", "light", "system", "appearance"],
    run: () => void onCycleTheme(),
  });

  const languageLabelKey = data.settings.language === "zh" ? "commandToggleLanguageToEn" : "commandToggleLanguageToZh";
  items.push({
    id: "manage:toggle-language",
    group: "manage",
    label: t(languageLabelKey),
    keywords: ["language", "english", "chinese", "中文", "i18n", "locale"],
    run: () => void onToggleLanguage(),
  });

  for (const project of data.projects.filter((item) => item.deletedAt === null && item.status !== "archived")) {
    items.push({
      id: `manage:project:${project.id}`,
      group: "manage",
      label: t("commandEditProject", { name: project.name }),
      keywords: [project.name, "edit project"],
      run: () => onEditProject(project.id),
    });
  }

  return items.filter((item) => item.enabled !== false);
};

export const filterCommandItems = (items: CommandItem[], query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...items].sort((a, b) => a.label.localeCompare(b.label));
  }

  return items
    .filter((item) => {
      const haystack = [item.label, ...item.keywords].join(" ").toLowerCase();
      return haystack.includes(normalized);
    })
    .sort((a, b) => a.label.localeCompare(b.label));
};

export const COMMAND_RECENT_KEY = "whattodo:command-recent";
export const COMMAND_RECENT_LIMIT = 8;

export type CommandRecentTask = { id: string; title: string };

export type CommandRecentStore = {
  commands: string[];
  tasks: CommandRecentTask[];
};

const emptyRecentStore = (): CommandRecentStore => ({ commands: [], tasks: [] });

export const loadCommandRecent = (): CommandRecentStore => {
  try {
    const raw = localStorage.getItem(COMMAND_RECENT_KEY);
    if (!raw) {
      return emptyRecentStore();
    }
    const parsed = JSON.parse(raw) as Partial<CommandRecentStore>;
    return {
      commands: Array.isArray(parsed.commands) ? parsed.commands.filter((id) => typeof id === "string") : [],
      tasks: Array.isArray(parsed.tasks)
        ? parsed.tasks
            .filter((task): task is CommandRecentTask => !!task && typeof task.id === "string" && typeof task.title === "string")
            .slice(0, COMMAND_RECENT_LIMIT)
        : [],
    };
  } catch {
    return emptyRecentStore();
  }
};

export const saveCommandRecent = (store: CommandRecentStore) => {
  localStorage.setItem(COMMAND_RECENT_KEY, JSON.stringify(store));
};

export const pushRecentId = (ids: string[], id: string, limit = COMMAND_RECENT_LIMIT) => {
  const next = [id, ...ids.filter((item) => item !== id)];
  return next.slice(0, limit);
};

export const pushRecentTask = (tasks: CommandRecentTask[], entry: CommandRecentTask, limit = COMMAND_RECENT_LIMIT) => {
  const next = [entry, ...tasks.filter((task) => task.id !== entry.id)];
  return next.slice(0, limit);
};

export const recordRecentCommand = (commandId: string) => {
  const store = loadCommandRecent();
  saveCommandRecent({ ...store, commands: pushRecentId(store.commands, commandId) });
};

export const recordRecentTask = (task: CommandRecentTask) => {
  const store = loadCommandRecent();
  saveCommandRecent({ ...store, tasks: pushRecentTask(store.tasks, task) });
};

/** Empty-query ordering: recent matches first (group recent), then remaining alphabetically. */
export const orderCommandsWithRecent = (items: CommandItem[], recentIds: string[]) => {
  const byId = new Map(items.map((item) => [item.id, item]));
  const recent: CommandItem[] = [];
  const seen = new Set<string>();
  for (const id of recentIds) {
    const item = byId.get(id);
    if (!item || seen.has(id)) {
      continue;
    }
    seen.add(id);
    recent.push({ ...item, group: "recent" });
  }
  const rest = items
    .filter((item) => !seen.has(item.id))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [...recent, ...rest];
};

export const recentTasksAsCommandItems = (
  tasks: CommandRecentTask[],
  onOpenTask: (taskId: string) => void,
): CommandItem[] =>
  tasks.map((task) => ({
    id: `recent-task:${task.id}`,
    group: "recent" as const,
    label: task.title,
    keywords: ["recent", "task", task.title],
    run: () => onOpenTask(task.id),
  }));

export const groupCommandItems = (items: CommandItem[]) => {
  const groups = new Map<CommandGroup, CommandItem[]>();
  for (const item of items) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }
  return groups;
};

export const COMMAND_GROUP_LABEL_KEYS: Record<CommandGroup, string> = {
  recent: "commandGroupRecent",
  navigation: "commandGroupNavigation",
  tasks: "commandGroupTasks",
  workspaces: "commandGroupWorkspaces",
  folders: "commandGroupFolders",
  savedViews: "commandGroupSavedViews",
  manage: "commandGroupManage",
};

export const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return true;
  }

  return target.isContentEditable;
};

export const matchesShortcut = (event: KeyboardEvent, key: string) => {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const modifier = isMac ? event.metaKey : event.ctrlKey;
  return modifier && !event.altKey && event.key.toLowerCase() === key.toLowerCase();
};
