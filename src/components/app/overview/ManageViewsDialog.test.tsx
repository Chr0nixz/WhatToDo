import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ManageViewsDialog } from "@/components/app/overview/ManageViewsDialog";
import { DEFAULT_SETTINGS } from "@/data/repositoryContract";
import { defaultTaskViewFilters } from "@/data/taskFilters";
import type { SavedTaskView } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("ManageViewsDialog", () => {
  const mockSavedViews: SavedTaskView[] = [
    {
      id: "view-1",
      workspaceId: "ws-1",
      name: "High Priority",
      filters: defaultTaskViewFilters(),
      pinned: false,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  ];

  const mockActions: TodoActions = {
    createSavedView: vi.fn().mockResolvedValue({}),
    updateSavedView: vi.fn().mockResolvedValue({}),
    deleteSavedView: vi.fn().mockResolvedValue({}),
    saveSettings: vi.fn().mockResolvedValue({}),
  } as unknown as TodoActions;

  it("renders saved view items and can toggle pinned status", async () => {
    render(
      <ManageViewsDialog
        actions={mockActions}
        currentFilters={defaultTaskViewFilters()}
        onClearSelection={vi.fn()}
        onOpenChange={vi.fn()}
        onSelectView={vi.fn()}
        open={true}
        savedViews={mockSavedViews}
        selectedViewId={null}
        settings={DEFAULT_SETTINGS}
      />,
    );

    expect(screen.getByText("High Priority")).toBeInTheDocument();

    const pinButton = screen.getByText("pinSavedView");
    fireEvent.click(pinButton);

    await waitFor(() => {
      expect(mockActions.updateSavedView).toHaveBeenCalledWith("view-1", {
        name: "High Priority",
        filters: mockSavedViews[0].filters,
        pinned: true,
      });
    });
  });

  it("creates a new view on form submit", async () => {
    render(
      <ManageViewsDialog
        actions={mockActions}
        currentFilters={defaultTaskViewFilters()}
        onClearSelection={vi.fn()}
        onOpenChange={vi.fn()}
        onSelectView={vi.fn()}
        open={true}
        savedViews={mockSavedViews}
        selectedViewId={null}
        settings={DEFAULT_SETTINGS}
      />,
    );

    const input = screen.getByPlaceholderText("viewName");
    fireEvent.change(input, { target: { value: "Inbox Only" } });

    const createBtn = screen.getByText("createNewView");
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(mockActions.createSavedView).toHaveBeenCalledWith({
        name: "Inbox Only",
        filters: defaultTaskViewFilters(),
      });
    });
  });
});
