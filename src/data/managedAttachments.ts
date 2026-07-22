import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "./repositoryContract";
import type { Attachment } from "./types";

/** Heuristic: managed copies live under `{appData}/attachments/{id}/{filename}`. */
export const isManagedAttachmentPath = (path: string): boolean => {
  const normalized = path.replace(/\\/g, "/");
  return /(?:^|\/)attachments\/[^/]+\/[^/]+$/.test(normalized);
};

export const listExternalAttachments = (attachments: ReadonlyArray<Attachment>): Attachment[] =>
  attachments.filter((attachment) => !isManagedAttachmentPath(attachment.path));

export const prepareManagedAttachmentPath = async (
  sourcePath: string,
  attachmentId: string,
  filename: string,
): Promise<string> => {
  if (!isTauriRuntime()) {
    return sourcePath;
  }
  return invoke<string>("copy_managed_attachment", {
    sourcePath,
    attachmentId,
    filename,
  });
};

export const migrateAttachmentToManaged = async (attachment: Attachment): Promise<string> => {
  if (isManagedAttachmentPath(attachment.path)) {
    return attachment.path;
  }
  return prepareManagedAttachmentPath(attachment.path, attachment.id, attachment.filename);
};

export const deleteManagedAttachmentFile = async (path: string): Promise<void> => {
  if (!isTauriRuntime() || !isManagedAttachmentPath(path)) {
    return;
  }
  try {
    await invoke("delete_managed_attachment", { path });
  } catch {
    // Prefer removing DB metadata over failing the mutation when the file is already gone.
  }
};
