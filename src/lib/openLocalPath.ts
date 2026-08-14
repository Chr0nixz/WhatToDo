import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

const describeError = (err: unknown, fallback: string) => {
  const message = err instanceof Error ? err.message : String(err);
  return message.trim() || fallback;
};

export const revealLocalPath = async (path: string): Promise<void> => {
  const trimmed = path.trim();
  if (!trimmed) {
    throw new Error("Path is required.");
  }

  try {
    await revealItemInDir(trimmed);
  } catch (err) {
    throw new Error(describeError(err, "Unable to open folder."));
  }
};

export const openManagedAttachment = async (path: string): Promise<void> => {
  const trimmed = path.trim();
  if (!trimmed) {
    throw new Error("Attachment path is required.");
  }

  try {
    await invoke("open_managed_attachment", { path: trimmed });
  } catch (err) {
    throw new Error(describeError(err, "Unable to open attachment."));
  }
};
