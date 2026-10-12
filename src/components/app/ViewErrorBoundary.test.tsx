import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ViewErrorBoundary } from "./ErrorBoundary";

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Simulated view chunk failure");
  }
  return <div data-testid="normal-view">Normal View Content</div>;
}

describe("ViewErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ViewErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ViewErrorBoundary>,
    );

    expect(screen.getByTestId("normal-view")).toBeDefined();
    expect(screen.getByText("Normal View Content")).toBeDefined();
  });

  it("catches render error, renders fallback UI, and prevents application crash", () => {
    // Suppress console.error in test runner output for expected caught exception
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ViewErrorBoundary fallbackTitle="Custom View Error">
        <ThrowingComponent shouldThrow={true} />
      </ViewErrorBoundary>,
    );

    expect(screen.queryByTestId("normal-view")).toBeNull();
    expect(screen.getByText("Custom View Error")).toBeDefined();
    expect(screen.getByText("Simulated view chunk failure")).toBeDefined();

    spy.mockRestore();
  });

  it("calls onRetry callback when retry button is clicked", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onRetry = vi.fn();

    render(
      <ViewErrorBoundary onRetry={onRetry}>
        <ThrowingComponent shouldThrow={true} />
      </ViewErrorBoundary>,
    );

    const retryButton = screen.getByRole("button");
    expect(retryButton).toBeDefined();

    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});
