import type { TFunction } from "i18next";

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

  if (trimmed.includes("Access to system critical directory is denied")) {
    return t("dbErrorPathDenied");
  }

  const migrationMatch = trimmed.match(/Migration v\d+ \([^)]+\) failed:\s*(.+)/);
  if (migrationMatch?.[1]) {
    return t("dbErrorMigrationFailed", { detail: migrationMatch[1] });
  }

  if (trimmed.startsWith("Migration v")) {
    return t("dbErrorMigrationFailed", { detail: trimmed });
  }

  return t("dbErrorUnknown", { detail: trimmed });
};
