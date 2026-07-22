import { describe, expect, it } from "vitest";

import { sortSavedViews } from "./savedViews";
import type { SavedTaskView } from "./types";

const makeView = (patch: Partial<SavedTaskView> & Pick<SavedTaskView, "id" | "name">): SavedTaskView => ({
  workspaceId: "ws-1",
  filters: {
    scope: "open",
    priority: "all",
    projectId: "all",
    reminder: "all",
    folder: "all",
    dateRange: "all",
    tags: [],
    tagMatch: "any",
    advancedFilter: null,
  },
  pinned: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...patch,
});

describe("sortSavedViews", () => {
  it("orders pinned views first, then by updatedAt desc", () => {
    const views = [
      makeView({ id: "a", name: "Alpha", updatedAt: "2026-01-03T00:00:00.000Z" }),
      makeView({ id: "b", name: "Beta", pinned: true, updatedAt: "2026-01-01T00:00:00.000Z" }),
      makeView({ id: "c", name: "Charlie", pinned: true, updatedAt: "2026-01-02T00:00:00.000Z" }),
    ];

    expect(sortSavedViews(views).map((view) => view.id)).toEqual(["c", "b", "a"]);
  });
});
