import type { TFunction } from "i18next";

/**
 * Sanitizes raw error messages by redacting local user home directory paths,
 * preventing username leaks and internal filesystem exposures in UI feedback.
 */
export const sanitizeErrorMessage = (message: string): string => {
  if (!message) {
    return "";
  }

  // Redact Windows user home paths (e.g. C:\Users\username or C:/Users/username -> <user-path>)
  let sanitized = message.replace(
    /[A-Za-z]:[/\\]+Users[/\\]+[^\\/:*?"<>|\r\n]+/gi,
    "<user-path>",
  );

  // Redact macOS / Linux user home paths (e.g. /Users/username/... or /home/username/... -> ~)
  sanitized = sanitized.replace(
    /(?:\/Users|\/home)\/[^/\0\r\n]+/g,
    "~",
  );

  return sanitized.trim();
};

export const formatBackendError = (error: unknown, t: TFunction): string => {
  if (!error) {
    return "";
  }

  const raw = error instanceof Error ? error.message : String(error);
  const trimmed = raw.trim();

  if (trimmed.includes("lock is poisoned")) {
    return t("dbErrorLockPoisoned");
  }

  if (trimmed.includes("No verified backup is available")) {
    return t("dbErrorNoVerifiedBackup");
  }

  if (
    trimmed.includes("Access to system critical directory is denied") ||
    trimmed.includes("sensitive system directory")
  ) {
    return t("dbErrorPathDenied");
  }

  const sanitized = sanitizeErrorMessage(trimmed);

  const migrationMatch = sanitized.match(/Migration v\d+ \([^)]+\) failed:\s*(.+)/);
  if (migrationMatch?.[1]) {
    return t("dbErrorMigrationFailed", { detail: migrationMatch[1] });
  }

  if (sanitized.startsWith("Migration v")) {
    return t("dbErrorMigrationFailed", { detail: sanitized });
  }

  return t("dbErrorUnknown", { detail: sanitized });
};
