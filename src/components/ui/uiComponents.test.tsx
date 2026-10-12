import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { Input } from "./input";
import { Badge } from "./badge";
import { EmptyState } from "./empty-state";

describe("UI Foundation Components", () => {
  describe("Input", () => {
    it("renders input element and forwards ref properly", () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input ref={ref} placeholder="Enter task name" />);

      const input = screen.getByPlaceholderText("Enter task name");
      expect(input).toBeDefined();
      expect(ref.current).toBe(input);
    });

    it("applies custom className and disabled state", () => {
      render(<Input disabled className="custom-input-class" placeholder="Disabled input" />);
      const input = screen.getByPlaceholderText("Disabled input") as HTMLInputElement;
      expect(input.disabled).toBe(true);
      expect(input.className).toContain("custom-input-class");
      expect(input.className).toContain("disabled:opacity-50");
    });
  });

  describe("Badge", () => {
    it("renders default badge", () => {
      render(<Badge>Default Badge</Badge>);
      const badge = screen.getByText("Default Badge");
      expect(badge).toBeDefined();
      expect(badge.className).toContain("bg-primary");
    });

    it("renders warning and destructive badge variants", () => {
      const { rerender } = render(<Badge variant="warning">Warning Badge</Badge>);
      let badge = screen.getByText("Warning Badge");
      expect(badge.className).toContain("bg-warning/15");

      rerender(<Badge variant="destructive">Destructive Badge</Badge>);
      badge = screen.getByText("Destructive Badge");
      expect(badge.className).toContain("bg-destructive");
    });

    it("renders secondary and outline badge variants", () => {
      const { rerender } = render(<Badge variant="secondary">Secondary Badge</Badge>);
      let badge = screen.getByText("Secondary Badge");
      expect(badge.className).toContain("bg-secondary");

      rerender(<Badge variant="outline">Outline Badge</Badge>);
      badge = screen.getByText("Outline Badge");
      expect(badge.className).toContain("text-foreground");
    });
  });

  describe("EmptyState", () => {
    it("renders title and description", () => {
      render(
        <EmptyState
          title="No tasks found"
          description="Create a task to get started"
        />,
      );
      expect(screen.getByText("No tasks found")).toBeDefined();
      expect(screen.getByText("Create a task to get started")).toBeDefined();
    });

    it("renders optional icon and action slots", () => {
      render(
        <EmptyState
          icon={<span data-testid="test-icon">icon</span>}
          title="Empty project"
          action={<button type="button">Create Task</button>}
        />,
      );
      expect(screen.getByTestId("test-icon")).toBeDefined();
      expect(screen.getByRole("button", { name: "Create Task" })).toBeDefined();
    });
  });
});
