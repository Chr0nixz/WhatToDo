import type { AppData, AppView, SavedTaskView } from "./types";

export type CommandGroup = "navigation" | "tasks" | "workspaces" | "folders" | "savedViews" | "manage";

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
  const { data, t, setView, onNewTask, onSearchTasks, selectWorkspace, openFolder, applySavedView, onEditWorkspace, onEditProject } =
    context;

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

  for (const view of data.savedViews) {
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
