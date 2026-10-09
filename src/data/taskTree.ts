import type { TaskSummary } from "./types";

type TaskParentRef = Pick<TaskSummary, "id" | "parentId">;

const toTaskParentMap = (
  tasks: ReadonlyArray<TaskParentRef> | ReadonlyMap<string, TaskParentRef>,
): ReadonlyMap<string, TaskParentRef> => {
  if (tasks instanceof Map) {
    return tasks;
  }
  return new Map((tasks as ReadonlyArray<TaskParentRef>).map((task) => [task.id, task]));
};

export const wouldCreateParentCycle = (
  tasks: ReadonlyArray<TaskParentRef> | ReadonlyMap<string, TaskParentRef>,
  taskId: string,
  parentId: string | null,
): boolean => {
  if (parentId === null) {
    return false;
  }
  if (parentId === taskId) {
    return true;
  }

  const byId = toTaskParentMap(tasks);
  let cursor: string | null = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === taskId || seen.has(cursor)) {
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

export const computeAllChildProgress = (
  tasks: ReadonlyArray<Pick<TaskSummary, "id" | "parentId" | "deletedAt" | "status">>,
): Map<string, { completed: number; total: number }> => {
  const progressMap = new Map<string, { completed: number; total: number }>();
  for (const task of tasks) {
    if (task.deletedAt !== null || !task.parentId) continue;
    let entry = progressMap.get(task.parentId);
    if (!entry) {
      entry = { completed: 0, total: 0 };
      progressMap.set(task.parentId, entry);
    }
    entry.total += 1;
    if (task.status === "completed") {
      entry.completed += 1;
    }
  }
  return progressMap;
};

/** True when any ancestor of taskId (within the list) is in collapsedParentIds. */
export const isHiddenByCollapsedAncestor = (
  tasks: ReadonlyArray<TaskParentRef> | ReadonlyMap<string, TaskParentRef>,
  taskId: string,
  collapsedParentIds: ReadonlySet<string>,
): boolean => {
  if (collapsedParentIds.size === 0) {
    return false;
  }
  const byId = toTaskParentMap(tasks);
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
  tasks: ReadonlyArray<TaskParentRef> | ReadonlyMap<string, TaskParentRef>,
  taskId: string,
  maxDepth = 3,
): number => {
  const byId = toTaskParentMap(tasks);
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
