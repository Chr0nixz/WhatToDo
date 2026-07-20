import { describe, expect, it } from "vitest";

import { planRescheduleDrop } from "./taskDrag";

describe("planRescheduleDrop", () => {
  it("no-ops when due date is unchanged or unknown", () => {
    expect(planRescheduleDrop({ taskId: "t1", currentDueDate: "2026-06-01", nextDueDate: "2026-06-01" })).toEqual({
      kind: "noop",
    });
    expect(planRescheduleDrop({ taskId: "t1", currentDueDate: null, nextDueDate: "2026-06-02" })).toEqual({
      kind: "noop",
    });
  });

  it("returns apply payload when the date changes", () => {
    expect(planRescheduleDrop({ taskId: "t1", currentDueDate: "2026-06-01", nextDueDate: "2026-06-03" })).toEqual({
      kind: "apply",
      taskId: "t1",
      previousDueDate: "2026-06-01",
      nextDueDate: "2026-06-03",
    });
  });
});
