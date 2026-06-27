import { endOfWeek, isWithinInterval } from "date-fns";

import { overdueTasks, parseDateKey, todayKey } from "./date";
import type { AppData, FilterCondition, FilterGroup, Task, TaskFilterContext, TaskViewFilters } from "./types";

export const defaultTaskViewFilters = (): TaskViewFilters => ({
  scope: "open",
  priority: "all",
  projectId: "all",
  reminder: "all",
  folder: "all",
  dateRange: "all",
  tags: [],
  tagMatch: "any",
  advancedFilter: null,
});

const evalCondition = (
  condition: FilterCondition,
  task: Task,
  context: AppData | TaskFilterContext,
): boolean => {
  const { field, op, value } = condition;
  const hasReminder =
    "reminderTaskIds" in context
      ? context.reminderTaskIds.has(task.id)
      : context.reminders.some((reminder) => reminder.taskId === task.id && reminder.enabled);

  switch (field) {
    case "priority":
      if (op === "eq") return task.priority === value;
      if (op === "neq") return task.priority !== value;
      if (op === "in") return Array.isArray(value) && value.includes(task.priority);
      if (op === "notIn") return Array.isArray(value) && !value.includes(task.priority);
      return false;
    case "status":
      if (op === "eq") return task.status === value;
      if (op === "neq") return task.status !== value;
      if (op === "in") return Array.isArray(value) && value.includes(task.status);
      if (op === "notIn") return Array.isArray(value) && !value.includes(task.status);
      return false;
    case "projectId":
      if (op === "eq") return task.projectId === value;
      if (op === "neq") return task.projectId !== value;
      if (op === "isEmpty") return task.projectId === null;
      if (op === "isNotEmpty") return task.projectId !== null;
      return false;
    case "tags":
      if (op === "contains") return task.tags.includes(String(value));
      if (op === "notContains") return !task.tags.includes(String(value));
      if (op === "in") return Array.isArray(value) && value.some((tag) => task.tags.includes(tag));
      if (op === "notIn") return Array.isArray(value) && !value.some((tag) => task.tags.includes(tag));
      if (op === "isEmpty") return task.tags.length === 0;
      if (op === "isNotEmpty") return task.tags.length > 0;
      return false;
    case "hasReminder":
      if (op === "eq") return hasReminder === (value === "true");
      return false;
    case "hasFolder":
      if (op === "eq") return Boolean(task.workingFolder) === (value === "true");
      return false;
    case "dueDate":
      if (op === "eq") return task.dueDate === value;
      if (op === "neq") return task.dueDate !== value;
      if (op === "before") return task.dueDate < String(value);
      if (op === "after") return task.dueDate > String(value);
      return false;
    case "parentId":
      if (op === "eq") return task.parentId === value;
      if (op === "isEmpty") return task.parentId === null;
      if (op === "isNotEmpty") return task.parentId !== null;
      return false;
    default:
      return false;
  }
};

export const matchesFilterGroup = (
  task: Task,
  group: FilterGroup,
  context: AppData | TaskFilterContext,
): boolean => {
  const conditionResults = group.conditions.map((condition) => evalCondition(condition, task, context));
  const subgroupResults = group.groups.map((subgroup) => matchesFilterGroup(task, subgroup, context));
  const all = [...conditionResults, ...subgroupResults];

  if (all.length === 0) {
    return !group.negate;
  }

  const result = group.operator === "AND" ? all.every(Boolean) : all.some(Boolean);
  return group.negate ? !result : result;
};

export const taskMatchesFilters = (
  task: Task,
  dataOrContext: AppData | TaskFilterContext,
  filters: TaskViewFilters,
  referenceDateKey = todayKey(),
) => {
  // "open" = active tasks not yet completed or cancelled (todo + in_progress)
  if (filters.scope === "open" && (task.status === "completed" || task.status === "cancelled")) {
    return false;
  }

  if (filters.scope === "completed" && task.status !== "completed") {
    return false;
  }

  if (filters.scope === "cancelled" && task.status !== "cancelled") {
    return false;
  }

  if (filters.priority !== "all" && task.priority !== filters.priority) {
    return false;
  }

  if (filters.projectId === "none" && task.projectId !== null) {
    return false;
  }

  if (filters.projectId !== "all" && filters.projectId !== "none" && task.projectId !== filters.projectId) {
    return false;
  }

  const hasReminder =
    "reminderTaskIds" in dataOrContext
      ? dataOrContext.reminderTaskIds.has(task.id)
      : dataOrContext.reminders.some((reminder) => reminder.taskId === task.id && reminder.enabled);
  if (filters.reminder === "with" && !hasReminder) {
    return false;
  }
  if (filters.reminder === "without" && hasReminder) {
    return false;
  }

  const hasFolder = Boolean(task.workingFolder);
  if (filters.folder === "with" && !hasFolder) {
    return false;
  }
  if (filters.folder === "without" && hasFolder) {
    return false;
  }

  if (filters.dateRange === "today" && task.dueDate !== referenceDateKey) {
    return false;
  }

  if (filters.dateRange === "overdue") {
    if (overdueTasks([task], referenceDateKey).length === 0) {
      return false;
    }
  } else if (filters.dateRange === "week") {
    const referenceDate = parseDateKey(referenceDateKey);
    if (!isWithinInterval(parseDateKey(task.dueDate), { start: referenceDate, end: endOfWeek(referenceDate) })) {
      return false;
    }
  }

  // Tag filtering (simple mode): match any/all/none of the selected tags.
  if (filters.tags.length > 0) {
    const tagSet = filters.tags;
    if (filters.tagMatch === "any" && !tagSet.some((tag) => task.tags.includes(tag))) {
      return false;
    }
    if (filters.tagMatch === "all" && !tagSet.every((tag) => task.tags.includes(tag))) {
      return false;
    }
    if (filters.tagMatch === "none" && tagSet.some((tag) => task.tags.includes(tag))) {
      return false;
    }
  }

  // Advanced nested filter tree (AND/OR/NOT groups).
  if (filters.advancedFilter && !matchesFilterGroup(task, filters.advancedFilter, dataOrContext)) {
    return false;
  }

  return true;
};
