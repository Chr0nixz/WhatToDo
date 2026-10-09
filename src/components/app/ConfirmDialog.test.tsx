import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import "@/i18n";
import i18n from "@/i18n";

import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("uses Cancel for the dismiss action", () => {
    render(
      <ConfirmDialog
        open
        title="Delete this task?"
        onConfirm={() => undefined}
        onOpenChange={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});
