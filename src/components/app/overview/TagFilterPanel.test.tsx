import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TagFilterPanel } from "@/components/app/overview/TagFilterPanel";
import { defaultTaskViewFilters } from "@/data/taskFilters";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("TagFilterPanel", () => {
  it("renders tags and triggers onChange when tag is added", () => {
    const handleChange = vi.fn();
    const filters = { ...defaultTaskViewFilters(), tags: ["work"] };

    render(
      <TagFilterPanel
        availableTags={["work", "home", "urgent"]}
        filters={filters}
        onChange={handleChange}
      />,
    );

    expect(screen.getByText("work")).toBeInTheDocument();

    const input = screen.getByPlaceholderText("tagFilterPlaceholder");
    fireEvent.change(input, { target: { value: "urgent" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(handleChange).toHaveBeenCalledWith({
      tags: ["work", "urgent"],
      tagMatch: "any",
    });
  });

  it("removes a tag when the tag chip delete button is clicked", () => {
    const handleChange = vi.fn();
    const filters = { ...defaultTaskViewFilters(), tags: ["work", "urgent"] };

    render(
      <TagFilterPanel
        availableTags={["work", "urgent"]}
        filters={filters}
        onChange={handleChange}
      />,
    );

    const workChip = screen.getByText("work");
    fireEvent.click(workChip);

    expect(handleChange).toHaveBeenCalledWith({
      tags: ["urgent"],
      tagMatch: "any",
    });
  });
});
