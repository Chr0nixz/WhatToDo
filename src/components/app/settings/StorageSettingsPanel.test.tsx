import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TodoActions } from "@/hooks/useTodos";
import { StorageSettingsPanel } from "./StorageSettingsPanel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; size?: string }) => {
      if (options?.count !== undefined) {
        return `${key}:${options.count}:${options.size ?? ""}`;
      }
      return key;
    },
  }),
}));

describe("StorageSettingsPanel", () => {
  const createMockActions = (overrides?: Partial<TodoActions>): TodoActions =>
    ({
      analyzeOrphanedAttachments: vi.fn().mockResolvedValue({
        orphanedCount: 0,
        orphanedBytes: 0,
      }),
      cleanupOrphanedAttachments: vi.fn().mockResolvedValue({
        deletedCount: 0,
        freedBytes: 0,
      }),
      ...overrides,
    }) as unknown as TodoActions;

  it("renders panel title and scan button", () => {
    const actions = createMockActions();
    render(<StorageSettingsPanel actions={actions} />);

    expect(screen.getByText("storageManagement")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "scanOrphaned" })).toBeInTheDocument();
  });

  it("handles scan with 0 orphaned files found", async () => {
    const actions = createMockActions();
    render(<StorageSettingsPanel actions={actions} />);

    const scanBtn = screen.getByRole("button", { name: "scanOrphaned" });
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(actions.analyzeOrphanedAttachments).toHaveBeenCalledTimes(1);
      expect(screen.getByText("noOrphanedFound")).toBeInTheDocument();
    });
  });

  it("handles scan with orphaned files and performs cleanup", async () => {
    const actions = createMockActions({
      analyzeOrphanedAttachments: vi.fn().mockResolvedValue({
        orphanedCount: 5,
        orphanedBytes: 15_728_640, // 15 MB
      }),
      cleanupOrphanedAttachments: vi.fn().mockResolvedValue({
        deletedCount: 5,
        freedBytes: 15_728_640,
      }),
    });

    render(<StorageSettingsPanel actions={actions} />);

    // 1. Scan
    fireEvent.click(screen.getByRole("button", { name: "scanOrphaned" }));

    await waitFor(() => {
      expect(screen.getByText(/orphanedFound:5/)).toBeInTheDocument();
    });

    // 2. Open clean confirm dialog
    const cleanBtn = screen.getByRole("button", { name: "cleanOrphaned" });
    expect(cleanBtn).toBeInTheDocument();
    fireEvent.click(cleanBtn);

    // 3. Confirm clean
    await waitFor(() => {
      expect(screen.getByText("cleanOrphanedConfirmTitle")).toBeInTheDocument();
    });

    const confirmBtns = screen.getAllByRole("button", { name: "cleanOrphaned" });
    // The dialog's confirm action button
    fireEvent.click(confirmBtns[confirmBtns.length - 1]!);

    // 4. Verify cleanup success message
    await waitFor(() => {
      expect(actions.cleanupOrphanedAttachments).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/orphanedCleaned:5/)).toBeInTheDocument();
    });
  });

  it("renders error message on scan failure", async () => {
    const actions = createMockActions({
      analyzeOrphanedAttachments: vi.fn().mockRejectedValue(new Error("Disk access denied")),
    });

    render(<StorageSettingsPanel actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "scanOrphaned" }));

    await waitFor(() => {
      expect(screen.getByText("Disk access denied")).toBeInTheDocument();
    });
  });
});
