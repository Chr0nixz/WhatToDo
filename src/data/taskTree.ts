import type { TaskSummary } from "./types";

export const wouldCreateParentCycle = (
  tasks: ReadonlyArray<Pick<TaskSummary, "id" | "parentId">>,
  taskId: string,
  parentId: string | null,
): boolean => {
  if (parentId === null) {
    return false;
  }
  if (parentId === taskId) {
    return true;
  }

  const byId = new Map(tasks.map((task) => [task.id, task]));
  let cursor: string | null = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === taskId) {
      return true;
    }
    if (seen.has(cursor)) {
      return true;
    }
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return false;
};

export const getDirectChildren = <T extends Pick<TaskSummary, "id" | "parentId" | "deletedAt">>(
  tasks: ReadonlyArray<T>,
  parentId: string,
): T[] => tasks.filter((task) => task.deletedAt === null && task.parentId === parentId);

export const getDirectChildProgress = (
  tasks: ReadonlyArray<Pick<TaskSummary, "id" | "parentId" | "deletedAt" | "status">>,
  parentId: string,
): { completed: number; total: number } | null => {
  const children = getDirectChildren(tasks, parentId);
  if (children.length === 0) {
    return null;
  }
  const completed = children.filter((task) => task.status === "completed").length;
  return { completed, total: children.length };
};

/** True when any ancestor of taskId (within the list) is in collapsedParentIds. */
export const isHiddenByCollapsedAncestor = (
  tasks: ReadonlyArray<Pick<TaskSummary, "id" | "parentId">>,
  taskId: string,
  collapsedParentIds: ReadonlySet<string>,
): boolean => {
  if (collapsedParentIds.size === 0) {
    return false;
  }
  const byId = new Map(tasks.map((task) => [task.id, task]));
  let cursor: string | null = byId.get(taskId)?.parentId ?? null;
  const seen = new Set<string>();
  while (cursor) {
    if (collapsedParentIds.has(cursor)) {
      return true;
    }
    if (seen.has(cursor)) {
      break;
    }
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return false;
};

export const taskDepthInList = (
  tasks: ReadonlyArray<Pick<TaskSummary, "id" | "parentId">>,
  taskId: string,
  maxDepth = 3,
): number => {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  if (!byId.has(taskId)) {
    return 0;
  }

  let depth = 0;
  let cursor: string | null = byId.get(taskId)?.parentId ?? null;
  const seen = new Set<string>([taskId]);
  while (cursor && byId.has(cursor) && depth < maxDepth) {
    if (seen.has(cursor)) {
      break;
    }
    seen.add(cursor);
    depth += 1;
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return depth;
};
