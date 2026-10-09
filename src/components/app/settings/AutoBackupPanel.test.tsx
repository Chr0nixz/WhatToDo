import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AutoBackupPanel } from "@/components/app/settings/AutoBackupPanel";
import type { AutoBackupConfig } from "@/hooks/useAutoBackup";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("AutoBackupPanel", () => {
  const mockConfig: AutoBackupConfig = {
    enabled: true,
    intervalHours: 6,
    retentionCount: 10,
    retentionDays: 30,
    folder: "D:\\Backups",
  };

  it("renders backup configuration inputs and handles interval change", () => {
    const handleUpdate = vi.fn();
    const handleChoose = vi.fn();
    const handleRun = vi.fn();

    render(
      <AutoBackupPanel
        autoBackup={mockConfig}
        autoBackupFeedback={null}
        autoBackupState="idle"
        onChooseFolder={handleChoose}
        onRunNow={handleRun}
        onUpdateAutoBackup={handleUpdate}
      />,
    );

    expect(screen.getByText("autoBackup")).toBeInTheDocument();
    expect(screen.getByDisplayValue("D:\\Backups")).toBeInTheDocument();

    const intervalInput = screen.getByLabelText((_content, element) => {
      return element?.id === "settings-auto-backup-interval";
    });
    fireEvent.change(intervalInput, { target: { value: "12" } });

    expect(handleUpdate).toHaveBeenCalledWith({ intervalHours: 12 });

    const runNowBtn = screen.getByText("autoBackupRunNow");
    fireEvent.click(runNowBtn);
    expect(handleRun).toHaveBeenCalledTimes(1);
  });
});
