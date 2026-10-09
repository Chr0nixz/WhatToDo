import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n";
import i18n from "@/i18n";

import { CommandPalette } from "./CommandPalette";

describe("CommandPalette", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("moves between command and task tabs with arrow keys", () => {
    const onModeChange = vi.fn();

    render(
      <CommandPalette
        open
        mode="commands"
        taskSearchScope="current"
        query=""
        activeIndex={0}
        visibleItems={[]}
        isSearchingTasks={false}
        taskSearchError={null}
        onOpenChange={() => undefined}
        onQueryChange={() => undefined}
        onModeChange={onModeChange}
        onTaskSearchScopeChange={() => undefined}
        onActiveIndexChange={() => undefined}
        onRunItem={() => undefined}
      />,
    );

    const commandsTab = screen.getByRole("tab", { name: "Commands" });
    expect(commandsTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(commandsTab, { key: "ArrowRight" });

    expect(onModeChange).toHaveBeenCalledWith("tasks");
  });
});
