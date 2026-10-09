import { todayKey } from "./date";
import { DEFAULT_TASK_VIEW_FILTERS } from "./repositoryMappers";
import type {
  FilterCondition,
  FilterGroup,
  TaskPageInput,
  TaskSummary,
  TaskViewFilters,
} from "./types";

export const normalizeTaskPageInput = (input: TaskPageInput, fallbackWorkspaceId: string) => ({
  ...input,
  workspaceId: input.workspaceId ?? fallbackWorkspaceId,
  workspaceScope: input.workspaceScope === "all" ? ("all" as const) : ("current" as const),
  limit: Math.max(1, Math.min(Math.trunc(input.limit), 500)),
  offset: Math.max(0, Math.trunc(input.offset)),
  query: input.query?.trim().toLowerCase() ?? "",
  date: input.date || null,
  projectId: input.projectId ?? null,
  priority: input.priority ?? DEFAULT_TASK_VIEW_FILTERS.priority,
  reminder: input.reminder ?? DEFAULT_TASK_VIEW_FILTERS.reminder,
  folder: input.folder ?? DEFAULT_TASK_VIEW_FILTERS.folder,
  dateRange: input.dateRange ?? DEFAULT_TASK_VIEW_FILTERS.dateRange,
  referenceDate: input.referenceDate ?? todayKey(),
  tags: Array.isArray(input.tags) ? input.tags.filter((tag) => tag.trim().length > 0) : [],
  tagMatch: input.tagMatch ?? DEFAULT_TASK_VIEW_FILTERS.tagMatch,
  advancedFilter: input.advancedFilter ?? null,
});

export const taskPageFiltersFromInput = (input: ReturnType<typeof normalizeTaskPageInput>): TaskViewFilters => ({
  scope: input.scope,
  priority: input.priority,
  projectId: input.projectId ?? DEFAULT_TASK_VIEW_FILTERS.projectId,
  reminder: input.reminder,
  folder: input.folder,
  dateRange: input.dateRange,
  tags: input.tags,
  tagMatch: input.tagMatch,
  advancedFilter: input.advancedFilter,
});

export const escapeSqlLikeTag = (tag: string): string =>
  tag.replace(/[%_\\]/g, "\\$&").replace(/"/g, '\\"');

export const appendTagFiltersSql = (
  where: string[],
  values: unknown[],
  tags: string[],
  tagMatch: TaskViewFilters["tagMatch"],
): void => {
  if (tags.length === 0) {
    return;
  }
  const clauses = tags.map(() => `tags LIKE ? ESCAPE '\\'`);
  const patterns = tags.map((tag) => `%"${escapeSqlLikeTag(tag)}"%`);
  if (tagMatch === "all") {
    where.push(...clauses);
    values.push(...patterns);
    return;
  }
  if (tagMatch === "none") {
    where.push(`NOT (${clauses.join(" OR ")})`);
    values.push(...patterns);
    return;
  }
  where.push(`(${clauses.join(" OR ")})`);
  values.push(...patterns);
};

export const sqlConditionForFilter = (
  condition: FilterCondition,
  where: string[],
  values: unknown[],
): boolean => {
  const { field, op, value } = condition;
  switch (field) {
    case "priority":
    case "status":
      if (op === "eq") {
        where.push(`${field === "priority" ? "priority" : "status"} = ?`);
        values.push(value);
        return true;
      }
      if (op === "neq") {
        where.push(`${field === "priority" ? "priority" : "status"} <> ?`);
        values.push(value);
        return true;
      }
      if (op === "in" && Array.isArray(value) && value.length > 0) {
        where.push(`${field === "priority" ? "priority" : "status"} IN (${value.map(() => "?").join(", ")})`);
        values.push(...value);
        return true;
      }
      if (op === "notIn" && Array.isArray(value) && value.length > 0) {
        where.push(`${field === "priority" ? "priority" : "status"} NOT IN (${value.map(() => "?").join(", ")})`);
        values.push(...value);
        return true;
      }
      return false;
    case "projectId":
      if (op === "eq") {
        where.push("project_id = ?");
        values.push(value);
        return true;
      }
      if (op === "neq") {
        where.push("(project_id IS NULL OR project_id <> ?)");
        values.push(value);
        return true;
      }
      if (op === "isEmpty") {
        where.push("project_id IS NULL");
        return true;
      }
      if (op === "isNotEmpty") {
        where.push("project_id IS NOT NULL");
        return true;
      }
      return false;
    case "parentId":
      if (op === "eq") {
        where.push("parent_id = ?");
        values.push(value);
        return true;
      }
      if (op === "isEmpty") {
        where.push("parent_id IS NULL");
        return true;
      }
      if (op === "isNotEmpty") {
        where.push("parent_id IS NOT NULL");
        return true;
      }
      return false;
    case "dueDate":
      if (op === "eq") {
        where.push("due_date = ?");
        values.push(value);
        return true;
      }
      if (op === "neq") {
        where.push("due_date <> ?");
        values.push(value);
        return true;
      }
      if (op === "before") {
        where.push("due_date < ?");
        values.push(value);
        return true;
      }
      if (op === "after") {
        where.push("due_date > ?");
        values.push(value);
        return true;
      }
      return false;
    case "hasReminder":
      if (op === "eq") {
        const exists = value === "true";
        where.push(
          `${exists ? "" : "NOT "}EXISTS (SELECT 1 FROM reminders WHERE reminders.task_id = tasks.id AND reminders.enabled = 1)`,
        );
        return true;
      }
      return false;
    case "hasFolder":
      if (op === "eq") {
        if (value === "true") {
          where.push("working_folder IS NOT NULL AND working_folder <> ''");
        } else {
          where.push("(working_folder IS NULL OR working_folder = '')");
        }
        return true;
      }
      return false;
    case "tags":
      if (op === "contains") {
        where.push(`tags LIKE ? ESCAPE '\\'`);
        values.push(`%"${escapeSqlLikeTag(String(value))}"%`);
        return true;
      }
      if (op === "notContains") {
        where.push(`tags NOT LIKE ? ESCAPE '\\'`);
        values.push(`%"${escapeSqlLikeTag(String(value))}"%`);
        return true;
      }
      if (op === "isEmpty") {
        where.push(`(tags IS NULL OR tags = '' OR tags = '[]')`);
        return true;
      }
      if (op === "isNotEmpty") {
        where.push(`(tags IS NOT NULL AND tags <> '' AND tags <> '[]')`);
        return true;
      }
      if ((op === "in" || op === "notIn") && Array.isArray(value) && value.length > 0) {
        const clauses = value.map(() => `tags LIKE ? ESCAPE '\\'`);
        const patterns = value.map((tag) => `%"${escapeSqlLikeTag(String(tag))}"%`);
        where.push(op === "in" ? `(${clauses.join(" OR ")})` : `NOT (${clauses.join(" OR ")})`);
        values.push(...patterns);
        return true;
      }
      return false;
    default:
      return false;
  }
};

export const appendAdvancedFilterSql = (
  where: string[],
  values: unknown[],
  group: FilterGroup | null,
): void => {
  if (!group) {
    return;
  }
  const parts: string[] = [];
  const partValues: unknown[] = [];
  for (const condition of group.conditions) {
    const localWhere: string[] = [];
    const localValues: unknown[] = [];
    if (sqlConditionForFilter(condition, localWhere, localValues)) {
      parts.push(...localWhere);
      partValues.push(...localValues);
    }
  }
  for (const child of group.groups) {
    const childWhere: string[] = [];
    const childValues: unknown[] = [];
    appendAdvancedFilterSql(childWhere, childValues, child);
    if (childWhere.length > 0) {
      parts.push(`(${childWhere.join(` ${child.operator} `)})`);
      partValues.push(...childValues);
    }
  }
  if (parts.length === 0) {
    return;
  }
  const joined = parts.join(` ${group.operator} `);
  where.push(group.negate ? `NOT (${joined})` : `(${joined})`);
  values.push(...partValues);
};

export const priorityRank: Record<TaskSummary["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const taskStatusRank: Record<TaskSummary["status"], number> = {
  todo: 0,
  in_progress: 1,
  completed: 2,
  cancelled: 3,
};

export const taskPageComparator = (sort: TaskPageInput["sort"]) => (a: TaskSummary, b: TaskSummary): number => {
  if (sort === "createdDesc") {
    return b.createdAt.localeCompare(a.createdAt);
  }

  if (sort === "overview" && a.status !== b.status) {
    return taskStatusRank[a.status] - taskStatusRank[b.status];
  }

  const dueDate = a.dueDate.localeCompare(b.dueDate);
  if (dueDate !== 0) {
    return dueDate;
  }

  const dueTime = (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99");
  if (dueTime !== 0) {
    return dueTime;
  }

  const priority = priorityRank[a.priority] - priorityRank[b.priority];
  if (priority !== 0) {
    return priority;
  }

  return a.createdAt.localeCompare(b.createdAt);
};
