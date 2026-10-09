import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectCreateForm } from "@/components/app/projects/ProjectCreateForm";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("ProjectCreateForm", () => {
  it("renders form fields and triggers input handlers", () => {
    const handleName = vi.fn();
    const handleDueDate = vi.fn();
    const handleWorkingFolder = vi.fn();
    const handleColor = vi.fn();
    const handleChoose = vi.fn();
    const handleSubmit = vi.fn((e) => e.preventDefault());

    render(
      <ProjectCreateForm
        color="#4fb8d8"
        dueDate="2026-06-30"
        formError={null}
        isCreating={false}
        name="Apollo"
        onChooseFolder={handleChoose}
        onColorChange={handleColor}
        onDueDateChange={handleDueDate}
        onNameChange={handleName}
        onSubmit={handleSubmit}
        onWorkingFolderChange={handleWorkingFolder}
        workingFolder="/path/to/project"
      />,
    );

    expect(screen.getByDisplayValue("Apollo")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-06-30")).toBeInTheDocument();
    expect(screen.getByDisplayValue("/path/to/project")).toBeInTheDocument();

    const nameInput = screen.getByLabelText("projectName");
    fireEvent.change(nameInput, { target: { value: "Apollo 2" } });
    expect(handleName).toHaveBeenCalledWith("Apollo 2");

    const chooseBtn = screen.getByLabelText("chooseFolder");
    fireEvent.click(chooseBtn);
    expect(handleChoose).toHaveBeenCalledTimes(1);
  });
});
