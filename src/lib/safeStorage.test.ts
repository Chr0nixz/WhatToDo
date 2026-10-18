import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeGetItem, safeRemoveItem, safeSetItem } from "./safeStorage";

describe("safeStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("handles normal getItem, setItem, and removeItem operations", () => {
    expect(safeGetItem("test-key")).toBeNull();

    const setSuccess = safeSetItem("test-key", "test-val");
    expect(setSuccess).toBe(true);
    expect(safeGetItem("test-key")).toBe("test-val");

    const removeSuccess = safeRemoveItem("test-key");
    expect(removeSuccess).toBe(true);
    expect(safeGetItem("test-key")).toBeNull();
  });

  it("catches getItem DOMExceptions gracefully and returns null", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: Access denied to localStorage");
    });

    const result = safeGetItem("restricted-key");
    expect(result).toBeNull();
  });

  it("catches setItem QuotaExceededError gracefully and returns false", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError: Storage quota exceeded");
    });

    const success = safeSetItem("overflow-key", "data");
    expect(success).toBe(false);
  });

  it("catches removeItem DOMExceptions gracefully and returns false", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError: Access denied");
    });

    const success = safeRemoveItem("locked-key");
    expect(success).toBe(false);
  });

  it("safely falls back to globalThis when window is undefined", () => {
    const originalWindow = globalThis.window;
    try {
      // @ts-expect-error simulating headless node runtime
      delete globalThis.window;
      expect(safeGetItem("fallback-key")).toBeNull();
      expect(safeSetItem("fallback-key", "fallback-val")).toBe(true);
      expect(safeGetItem("fallback-key")).toBe("fallback-val");
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
