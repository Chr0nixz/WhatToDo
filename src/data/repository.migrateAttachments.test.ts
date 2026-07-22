import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "@tauri-apps/plugin-sql";

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(),
  },
}));

vi.mock("./managedAttachments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./managedAttachments")>();
  return {
    ...actual,
    migrateAttachmentToManaged: vi.fn(async (attachment: { id: string; path: string; filename: string }) => {
      if (attachment.path.includes("missing")) {
        throw new Error("Source attachment file was not found.");
      }
      return `/app/attachments/${attachment.id}/${attachment.filename}`;
    }),
  };
});

import { SqlRepository } from "./repository";
import { migrateAttachmentToManaged } from "./managedAttachments";

describe("SqlRepository.migrateExternalAttachments", () => {
  beforeEach(() => {
    vi.mocked(Database.load).mockReset();
    vi.mocked(migrateAttachmentToManaged).mockClear();
  });

  it("updates external paths, skips managed, and counts failures", async () => {
    const attachmentRows = [
      {
        id: "att_external",
        task_id: "task_a",
        filename: "a.pdf",
        path: "/tmp/a.pdf",
        mime_type: null,
        size: null,
        created_at: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "att_managed",
        task_id: "task_a",
        filename: "b.pdf",
        path: "/app/attachments/att_managed/b.pdf",
        mime_type: null,
        size: null,
        created_at: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "att_missing",
        task_id: "task_a",
        filename: "c.pdf",
        path: "/tmp/missing/c.pdf",
        mime_type: null,
        size: null,
        created_at: "2026-06-01T00:00:00.000Z",
      },
    ];
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          return [
            {
              id: "local-workspace",
              name: "Default",
              color: "#4fb8d8",
              created_at: "2026-06-01T00:00:00.000Z",
              updated_at: "2026-06-01T00:00:00.000Z",
              deleted_at: null,
            },
          ];
        }
        if (query.includes("FROM attachments") || query.includes("attachments.*")) {
          return attachmentRows;
        }
        if (
          query.includes("FROM projects") ||
          query.includes("FROM workspace_folders") ||
          query.includes("FROM saved_views") ||
          query.includes("FROM recurring_task_templates") ||
          query.includes("FROM reminders") ||
          query.includes("FROM settings") ||
          query.includes("FROM tasks")
        ) {
          return [];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const result = await repository.migrateExternalAttachments();

    expect(result.report).toEqual({ migrated: 1, skipped: 1, failed: 1 });
    expect(result.patch.affectedKeys).toEqual(["attachments"]);
    expect(result.data.attachments.find((item) => item.id === "att_external")?.path).toBe(
      "/app/attachments/att_external/a.pdf",
    );
    expect(result.data.attachments.find((item) => item.id === "att_missing")?.path).toBe("/tmp/missing/c.pdf");
    expect(db.execute).toHaveBeenCalledWith("UPDATE attachments SET path = ? WHERE id = ?", [
      "/app/attachments/att_external/a.pdf",
      "att_external",
    ]);
  });
});
