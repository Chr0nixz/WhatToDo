import { describe, expect, it } from "vitest";

import {
  getDirectChildren,
  getDirectChildProgress,
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
