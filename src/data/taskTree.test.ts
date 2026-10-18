import { describe, expect, it } from "vitest";

import {
  getDirectChildren,
  getDirectChildProgress,
  getDirectChildrenWithProgress,
  isHiddenByCollapsedAncestor,
  taskDepthInList,
  wouldCreateParentCycle,
} from "./taskTree";

const tasks = [
  { id: "a", parentId: null, deletedAt: null, status: "todo" as const },
  { id: "b", parentId: "a", deletedAt: null, status: "completed" as const },
  { id: "c", parentId: "b", deletedAt: null, status: "todo" as const },
];

describe("wouldCreateParentCycle", () => {
  it("rejects self parent", () => {
    expect(wouldCreateParentCycle(tasks, "a", "a")).toBe(true);
  });

  it("rejects ancestor cycles", () => {
    expect(wouldCreateParentCycle(tasks, "a", "c")).toBe(true);
    expect(wouldCreateParentCycle(tasks, "b", "c")).toBe(true);
  });

  it("allows valid parents", () => {
    expect(wouldCreateParentCycle(tasks, "c", "a")).toBe(false);
    expect(wouldCreateParentCycle(tasks, "c", null)).toBe(false);
  });
});

describe("getDirectChildren / taskDepthInList", () => {
  it("lists direct children", () => {
    expect(getDirectChildren(tasks, "a").map((task) => task.id)).toEqual(["b"]);
  });

  it("computes indent depth when ancestors are in the list", () => {
    expect(taskDepthInList(tasks, "a")).toBe(0);
    expect(taskDepthInList(tasks, "b")).toBe(1);
    expect(taskDepthInList(tasks, "c")).toBe(2);
  });
});

describe("getDirectChildProgress", () => {
  it("counts completed among direct children only", () => {
    const withTwoChildren = [
      { id: "parent", parentId: null, deletedAt: null, status: "todo" as const },
      { id: "child_done", parentId: "parent", deletedAt: null, status: "completed" as const },
      { id: "child_open", parentId: "parent", deletedAt: null, status: "todo" as const },
      { id: "grandchild", parentId: "child_done", deletedAt: null, status: "todo" as const },
    ];
    expect(getDirectChildProgress(withTwoChildren, "parent")).toEqual({ completed: 1, total: 2 });
    expect(getDirectChildProgress(withTwoChildren, "child_open")).toBeNull();
  });
});

describe("isHiddenByCollapsedAncestor", () => {
  it("hides descendants when an ancestor is collapsed", () => {
    const collapsed = new Set(["a"]);
    expect(isHiddenByCollapsedAncestor(tasks, "a", collapsed)).toBe(false);
    expect(isHiddenByCollapsedAncestor(tasks, "b", collapsed)).toBe(true);
    expect(isHiddenByCollapsedAncestor(tasks, "c", collapsed)).toBe(true);
  });
});

describe("getDirectChildrenWithProgress (PERF-023)", () => {
  it("yields direct children and completion progress in a single pass", () => {
    const taskSet = [
      { id: "root", parentId: null, deletedAt: null, status: "todo" as const },
      { id: "c1", parentId: "root", deletedAt: null, status: "completed" as const },
      { id: "c2", parentId: "root", deletedAt: null, status: "in_progress" as const },
      { id: "c3_del", parentId: "root", deletedAt: "2026-06-01T00:00:00.000Z", status: "completed" as const },
      { id: "other", parentId: "other_root", deletedAt: null, status: "completed" as const },
    ];

    const result = getDirectChildrenWithProgress(taskSet, "root");
    expect(result.children.map((t) => t.id)).toEqual(["c1", "c2"]);
    expect(result.progress).toEqual({ completed: 1, total: 2 });

    const emptyResult = getDirectChildrenWithProgress(taskSet, "c1");
    expect(emptyResult.children).toEqual([]);
    expect(emptyResult.progress).toBeNull();
  });
});
