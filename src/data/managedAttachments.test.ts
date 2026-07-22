import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

describe("managedAttachments", () => {
  beforeEach(() => {
    invoke.mockReset();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("detects managed attachment paths across separators", async () => {
    const { isManagedAttachmentPath } = await import("./managedAttachments");
    expect(
      isManagedAttachmentPath(String.raw`C:\Users\app\attachments\attachment_1\notes.pdf`),
    ).toBe(true);
    expect(isManagedAttachmentPath("/home/app/attachments/attachment_1/notes.pdf")).toBe(true);
    expect(isManagedAttachmentPath("/home/app/Documents/notes.pdf")).toBe(false);
    expect(isManagedAttachmentPath("/home/app/attachments/notes.pdf")).toBe(false);
  });

  it("returns source path without invoke outside Tauri", async () => {
    const { prepareManagedAttachmentPath } = await import("./managedAttachments");
    await expect(prepareManagedAttachmentPath("/tmp/a.pdf", "attachment_1", "a.pdf")).resolves.toBe(
      "/tmp/a.pdf",
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("copies via Tauri command when runtime is available", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    invoke.mockResolvedValueOnce("/app/attachments/attachment_1/a.pdf");
    const { prepareManagedAttachmentPath } = await import("./managedAttachments");
    await expect(prepareManagedAttachmentPath("/tmp/a.pdf", "attachment_1", "a.pdf")).resolves.toBe(
      "/app/attachments/attachment_1/a.pdf",
    );
    expect(invoke).toHaveBeenCalledWith("copy_managed_attachment", {
      sourcePath: "/tmp/a.pdf",
      attachmentId: "attachment_1",
      filename: "a.pdf",
    });
  });

  it("deletes managed files via Tauri and ignores failures", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    invoke.mockRejectedValueOnce(new Error("gone"));
    const { deleteManagedAttachmentFile } = await import("./managedAttachments");
    await expect(
      deleteManagedAttachmentFile("/app/attachments/attachment_1/a.pdf"),
    ).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("delete_managed_attachment", {
      path: "/app/attachments/attachment_1/a.pdf",
    });
  });

  it("skips delete invoke for external paths", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    const { deleteManagedAttachmentFile } = await import("./managedAttachments");
    await deleteManagedAttachmentFile("/tmp/external.pdf");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("lists only external attachments", async () => {
    const { listExternalAttachments } = await import("./managedAttachments");
    const listed = listExternalAttachments([
      {
        id: "a1",
        task_id: "t1",
        filename: "a.pdf",
        path: "/tmp/a.pdf",
        mimeType: null,
        size: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "a2",
        task_id: "t1",
        filename: "b.pdf",
        path: "/app/attachments/a2/b.pdf",
        mimeType: null,
        size: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(listed.map((item) => item.id)).toEqual(["a1"]);
  });

  it("migrateAttachmentToManaged copies external files in Tauri", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    invoke.mockResolvedValueOnce("/app/attachments/a1/a.pdf");
    const { migrateAttachmentToManaged } = await import("./managedAttachments");
    await expect(
      migrateAttachmentToManaged({
        id: "a1",
        task_id: "t1",
        filename: "a.pdf",
        path: "/tmp/a.pdf",
        mimeType: null,
        size: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).resolves.toBe("/app/attachments/a1/a.pdf");
  });
});
