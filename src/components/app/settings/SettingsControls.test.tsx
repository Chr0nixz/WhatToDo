import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToggleRow } from "@/components/app/settings/ToggleRow";
import { Segmented } from "@/components/app/settings/Segmented";

describe("Settings Micro Components", () => {
  it("ToggleRow renders label, switch role and responds to click", () => {
    const handleClick = vi.fn();
    render(<ToggleRow checked={true} label="Notifications" onClick={handleClick} />);

    const button = screen.getByRole("switch");
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Notifications")).toBeInTheDocument();

    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("Segmented renders choices and fires onChange", () => {
    const handleChange = vi.fn();
    const options = [
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ];

    render(<Segmented options={options} value="light" onChange={handleChange} />);

    const darkOption = screen.getByText("Dark");
    fireEvent.click(darkOption);
    expect(handleChange).toHaveBeenCalledWith("dark");
  });
});
