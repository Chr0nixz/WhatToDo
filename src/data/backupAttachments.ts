import { invoke } from "@tauri-apps/api/core";

import { isManagedAttachmentPath } from "./managedAttachments";
import type { Attachment, BackupPayload, BackupClientPreferences } from "./types";

/** Portable path marker written into JSON when the binary lives in the sidecar folder. */
export const SIDECAR_PATH_PREFIX = "__whattodo_sidecar__";

export type AttachmentSidecarItem = {
  id: string;
  filename: string;
  sourcePath: string;
};

export type AttachmentSidecarImportResult = {
  id: string;
  path: string;
};

export const toSidecarRelativePath = (id: string, filename: string): string =>
  `${SIDECAR_PATH_PREFIX}/${id}/${filename}`;

export const parseSidecarRelativePath = (
  path: string,
): { id: string; filename: string } | null => {
  const normalized = path.replace(/\\/g, "/");
  const prefix = `${SIDECAR_PATH_PREFIX}/`;
  if (!normalized.startsWith(prefix)) {
    return null;
  }
  const rest = normalized.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash <= 0 || slash === rest.length - 1) {
    return null;
  }
  return {
    id: rest.slice(0, slash),
    filename: rest.slice(slash + 1),
  };
};

export const backupSidecarFolderName = (jsonPath: string): string => {
  const normalized = jsonPath.replace(/\\/g, "/");
  const base = normalized.split("/").pop() ?? jsonPath;
  const stem = base.endsWith(".json") ? base.slice(0, -5) : base;
  return `${stem}_attachments`;
};

export const getBackupAttachments = (payload: BackupPayload): Attachment[] => {
  if (payload.whattodoBackupVersion === 1) {
    return [];
  }
  return payload.attachments ?? [];
};

/**
 * Rewrites managed (or already-sidecar) attachment paths to portable markers and
 * optionally attaches client preferences (without device-local folder paths).
 */
export const prepareBackupExport = (
  payload: BackupPayload,
  options?: { clientPreferences?: BackupClientPreferences },
): {
  payload: Extract<BackupPayload, { whattodoBackupVersion: 3 }>;
  packItems: AttachmentSidecarItem[];
} => {
  const attachments = getBackupAttachments(payload);
  const packItems: AttachmentSidecarItem[] = [];
  const portableAttachments = attachments.map((attachment) => {
    const alreadySidecar = parseSidecarRelativePath(attachment.path);
    if (alreadySidecar || isManagedAttachmentPath(attachment.path)) {
      packItems.push({
        id: attachment.id,
        filename: attachment.filename,
        sourcePath: attachment.path,
      });
      return {
        ...attachment,
        path: toSidecarRelativePath(attachment.id, attachment.filename),
      };
    }
    return attachment;
  });

  return {
    payload: {
      whattodoBackupVersion: 3,
      exportedAt: payload.exportedAt,
      workspaceId: payload.workspaceId,
      workspaces: payload.workspaces,
      workspaceFolders: payload.workspaceFolders,
      projects: payload.projects,
      tasks: payload.tasks,
      reminders: payload.reminders,
      settingsByWorkspace: payload.settingsByWorkspace,
      savedViews: payload.savedViews,
      recurringTaskTemplates: payload.recurringTaskTemplates ?? [],
      attachments: portableAttachments,
      reminderEvents: payload.reminderEvents,
      attachmentBundle: packItems.length > 0 ? "sidecar" : "none",
      clientPreferences: options?.clientPreferences,
    },
    packItems,
  };
};

export const packAttachmentSidecar = async (
  backupJsonPath: string,
  items: ReadonlyArray<AttachmentSidecarItem>,
): Promise<string[]> => {
  if (items.length === 0) {
    return [];
  }
  return invoke<string[]>("export_attachment_sidecar", {
    backupJsonPath,
    items,
  });
};

export const restoreAttachmentSidecar = async (
  backupJsonPath: string,
  payload: BackupPayload,
): Promise<BackupPayload> => {
  const attachments = getBackupAttachments(payload);
  if (attachments.length === 0) {
    return payload;
  }

  const items = attachments
    .map((attachment) => {
      const parsed = parseSidecarRelativePath(attachment.path);
      if (parsed) {
        return {
          id: attachment.id,
          filename: parsed.filename || attachment.filename,
          sourcePath: attachment.path,
        };
      }
      if (payload.whattodoBackupVersion === 3 && payload.attachmentBundle === "sidecar") {
        return {
          id: attachment.id,
          filename: attachment.filename,
          sourcePath: attachment.path,
        };
      }
      return null;
    })
    .filter((item): item is AttachmentSidecarItem => item !== null);

  if (items.length === 0) {
    return payload;
  }

  const restored = await invoke<AttachmentSidecarImportResult[]>("import_attachment_sidecar", {
    backupJsonPath,
    items,
  });
  if (restored.length === 0) {
    return payload;
  }

  const byId = new Map(restored.map((item) => [item.id, item.path]));
  const nextAttachments = attachments.map((attachment) => {
    const nextPath = byId.get(attachment.id);
    return nextPath ? { ...attachment, path: nextPath } : attachment;
  });

  if (payload.whattodoBackupVersion === 1) {
    return payload;
  }

  return {
    ...payload,
    attachments: nextAttachments,
  };
};

export const cleanupAutoBackupFiles = async (
  folder: string,
  retentionCount: number,
  retentionDays: number,
): Promise<number> =>
  invoke<number>("cleanup_auto_backups", {
    folder,
    retentionCount,
    retentionDays,
  });

/** Write JSON backup + optional attachment sidecar (Tauri only). */
export const writeBackupBundle = async (
  backupJsonPath: string,
  payload: BackupPayload,
  options?: { clientPreferences?: BackupClientPreferences },
): Promise<Extract<BackupPayload, { whattodoBackupVersion: 3 }>> => {
  const prepared = prepareBackupExport(payload, options);
  await invoke("write_text_file", {
    path: backupJsonPath,
    contents: JSON.stringify(prepared.payload, null, 2),
  });
  if (prepared.packItems.length > 0) {
    await packAttachmentSidecar(backupJsonPath, prepared.packItems);
  }
  return prepared.payload;
};
