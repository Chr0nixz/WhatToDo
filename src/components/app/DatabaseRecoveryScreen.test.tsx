import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n";
import i18n from "@/i18n";
import { DatabaseRecoveryScreen, type DbInitStatus } from "./DatabaseRecoveryScreen";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock("@/lib/openLocalPath", () => ({
  revealLocalPath: vi.fn().mockResolvedValue(undefined),
}));

describe("DatabaseRecoveryScreen", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    invoke.mockReset();
  });

  const baseStatus: DbInitStatus = {
    state: "failed",
    reason: "Database disk image is malformed.",
    dbPath: "C:\\Users\\test\\.config\\whattodo\\ddl_todo.db",
    backupPath: null,
  };

  it("renders recovery prompt, reason, and requires backup before reset", () => {
    const onStatusChange = vi.fn();
    render(<DatabaseRecoveryScreen onStatusChange={onStatusChange} status={baseStatus} />);

    expect(screen.getByText("Database could not start")).toBeInTheDocument();
    expect(screen.getByText(/Database disk image is malformed/i)).toBeInTheDocument();
    expect(screen.getByText(/A verified backup is required before reset/i)).toBeInTheDocument();

    const resetButton = screen.getByRole("button", { name: /confirm database reset/i });
    expect(resetButton).toBeDisabled();
  });

  it("handles backup creation and enables reset button once backup exists", async () => {
    const onStatusChange = vi.fn();
    const updatedStatus: DbInitStatus = {
      ...baseStatus,
      backupPath: "C:\\Users\\test\\.config\\whattodo\\backup.db",
    };
    invoke.mockResolvedValueOnce(updatedStatus);

    render(<DatabaseRecoveryScreen onStatusChange={onStatusChange} status={baseStatus} />);

    const backupButton = screen.getByRole("button", { name: /create verified backup/i });
    fireEvent.click(backupButton);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("backup_database_for_recovery");
      expect(onStatusChange).toHaveBeenCalledWith(updatedStatus);
    });
  });

  it("guards against concurrent clicks on retry action using mutex lock (ARC-026)", async () => {
    const onStatusChange = vi.fn();
    let slowResolve: (val: DbInitStatus) => void;
    const slowPromise = new Promise<DbInitStatus>((resolve) => {
      slowResolve = resolve;
    });
    invoke.mockReturnValueOnce(slowPromise);

    render(<DatabaseRecoveryScreen onStatusChange={onStatusChange} status={baseStatus} />);

    const retryButton = screen.getByRole("button", { name: /retry migration/i });

    // Double click rapidly: mutex lock must reject the second call
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(retryButton).toBeDisabled();

    slowResolve!({ ...baseStatus, state: "ready" });
    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledTimes(1);
    });
  });

  it("displays action error with role='alert' when retry command fails", async () => {
    const onStatusChange = vi.fn();
    invoke.mockRejectedValueOnce(new Error("Database lock is poisoned."));
    invoke.mockResolvedValueOnce(baseStatus); // get_db_init_status refresh call

    render(<DatabaseRecoveryScreen onStatusChange={onStatusChange} status={baseStatus} />);

    const retryButton = screen.getByRole("button", { name: /retry migration/i });
    fireEvent.click(retryButton);

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveAttribute("aria-live", "assertive");
      expect(alert).toHaveTextContent("Database state lock is poisoned. Please restart the app.");
    });
  });
});
