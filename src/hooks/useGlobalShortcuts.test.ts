import { describe, expect, it, vi } from "vitest";

import { runGlobalShortcut, shouldDeferToDomShortcuts } from "./useGlobalShortcuts";

describe("runGlobalShortcut", () => {
  it("skips the handler when the document already has focus", () => {
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => true,
    });
    const handler = vi.fn();
    expect(shouldDeferToDomShortcuts()).toBe(true);
    runGlobalShortcut(handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the handler when the document is blurred", () => {
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => false,
    });
    const handler = vi.fn();
    expect(shouldDeferToDomShortcuts()).toBe(false);
    runGlobalShortcut(handler);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
