import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invoke } from "@tauri-apps/api/core";
import { runGlobalShortcut, shouldDeferToDomShortcuts, useGlobalShortcuts } from "./useGlobalShortcuts";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("useGlobalShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("shouldDeferToDomShortcuts", () => {
    it("returns true when document has focus", () => {
      vi.spyOn(document, "hasFocus").mockReturnValue(true);
      expect(shouldDeferToDomShortcuts()).toBe(true);
    });

    it("returns false when document is blurred (window hidden/minimized)", () => {
      vi.spyOn(document, "hasFocus").mockReturnValue(false);
      expect(shouldDeferToDomShortcuts()).toBe(false);
    });
  });

  describe("runGlobalShortcut", () => {
    it("defers without invoking when window is focused", () => {
      vi.spyOn(document, "hasFocus").mockReturnValue(true);
      const handler = vi.fn();

      runGlobalShortcut(handler);

      expect(handler).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();
    });

    it("executes handler and wakes main window via show_main_window_cmd in Tauri runtime (ARC-021)", () => {
      vi.spyOn(document, "hasFocus").mockReturnValue(false);
      // Simulate Tauri runtime
      (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};

      const handler = vi.fn();
      runGlobalShortcut(handler);

      expect(invoke).toHaveBeenCalledWith("show_main_window_cmd");
      expect(handler).toHaveBeenCalledTimes(1);

      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    });

    it("executes handler directly without invoke in non-Tauri web mode", () => {
      vi.spyOn(document, "hasFocus").mockReturnValue(false);
      const handler = vi.fn();

      runGlobalShortcut(handler);

      expect(invoke).not.toHaveBeenCalled();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("useGlobalShortcuts DOM fallback", () => {
    it("handles ? keydown to open help modal when not typing", () => {
      const onOpenHelp = vi.fn();
      renderHook(() =>
        useGlobalShortcuts({
          onOpenPalette: vi.fn(),
          onNewTask: vi.fn(),
          onSearchTasks: vi.fn(),
          onOpenHelp,
        }),
      );

      // Dispatch '?' key event on window
      const event = new KeyboardEvent("keydown", { key: "?", bubbles: true });
      window.dispatchEvent(event);

      expect(onOpenHelp).toHaveBeenCalledTimes(1);
    });

    it("ignores ? keydown when focus is inside an input field", () => {
      const onOpenHelp = vi.fn();
      renderHook(() =>
        useGlobalShortcuts({
          onOpenPalette: vi.fn(),
          onNewTask: vi.fn(),
          onSearchTasks: vi.fn(),
          onOpenHelp,
        }),
      );

      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", { key: "?", bubbles: true });
      input.dispatchEvent(event);

      expect(onOpenHelp).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });
  });
});
