import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "./repositoryContract";
import type { Attachment, OrphanedAttachmentsCleanupResult, OrphanedAttachmentsSummary } from "./types";

/** Heuristic: managed copies live under `{appData}/attachments/{id}/{filename}`. */
export const isManagedAttachmentPath = (path: string): boolean => {
  const normalized = path.replace(/\\/g, "/");
  return /(?:^|\/)attachments\/[^/]+\/[^/]+$/.test(normalized);
};

export const listExternalAttachments = (attachments: ReadonlyArray<Attachment>): Attachment[] =>
  attachments.filter((attachment) => !isManagedAttachmentPath(attachment.path));

/** Keep metadata, drop executable/arbitrary paths that are not in the managed folder. */
export const sanitizeImportedAttachment = <T extends { path: string }>(attachment: T): T =>
  isManagedAttachmentPath(attachment.path) ? attachment : { ...attachment, path: "" };

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

export const analyzeOrphanedAttachments = async (): Promise<OrphanedAttachmentsSummary> => {
  if (!isTauriRuntime()) {
    return { orphanedCount: 0, orphanedBytes: 0 };
  }
  return invoke<OrphanedAttachmentsSummary>("analyze_orphaned_attachments");
};

export const cleanupOrphanedAttachments = async (): Promise<OrphanedAttachmentsCleanupResult> => {
  if (!isTauriRuntime()) {
    return { deletedCount: 0, freedBytes: 0 };
  }
  return invoke<OrphanedAttachmentsCleanupResult>("cleanup_orphaned_attachments");
};

export const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};
