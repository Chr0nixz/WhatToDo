import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceCreateForm } from "@/components/app/workspaces/WorkspaceCreateForm";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("WorkspaceCreateForm", () => {
  it("renders workspace name field and handles submit", () => {
    const handleName = vi.fn();
    const handleColor = vi.fn();
    const handleSubmit = vi.fn((e) => e.preventDefault());

    render(
      <WorkspaceCreateForm
        isCreatingWorkspace={false}
        onColorChange={handleColor}
        onNameChange={handleName}
        onSubmit={handleSubmit}
        workspaceColor="#4fb8d8"
        workspaceError={null}
        workspaceName="Research"
      />,
    );

    expect(screen.getByDisplayValue("Research")).toBeInTheDocument();

    const input = screen.getByLabelText("workspaceName");
    fireEvent.change(input, { target: { value: "Engineering" } });
    expect(handleName).toHaveBeenCalledWith("Engineering");

    const submitBtn = screen.getByRole("button", { name: /createWorkspace/i });
    fireEvent.click(submitBtn);
    expect(handleSubmit).toHaveBeenCalled();
  });
});
