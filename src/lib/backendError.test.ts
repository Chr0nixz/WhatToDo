import { describe, expect, it } from "vitest";

import { formatBackendError, sanitizeErrorMessage } from "./backendError";

describe("formatBackendError", () => {
  const mockTranslate = ((key: string, options?: { detail?: string }) => {
    if (options?.detail) {
      return `${key}:${options.detail}`;
    }
    return key;
  }) as unknown as import("i18next").TFunction;

  it("returns empty string when error is empty or null", () => {
    expect(formatBackendError(null, mockTranslate)).toBe("");
    expect(formatBackendError(undefined, mockTranslate)).toBe("");
    expect(formatBackendError("", mockTranslate)).toBe("");
  });

  it("localizes lock poisoned error message", () => {
    const error = new Error("Database init state lock is poisoned.");
    expect(formatBackendError(error, mockTranslate)).toBe("dbErrorLockPoisoned");
  });

  it("localizes missing verified backup error message", () => {
    const error = "No verified backup is available. Create a backup before resetting.";
    expect(formatBackendError(error, mockTranslate)).toBe("dbErrorNoVerifiedBackup");
  });

  it("localizes system critical directory access denial", () => {
    const error = "Access to system critical directory is denied.";
    expect(formatBackendError(error, mockTranslate)).toBe("dbErrorPathDenied");
  });

  it("extracts and localizes detailed migration failure", () => {
    const error = "Migration v18 (optimize_hot_path_indexes) failed: table already exists";
    expect(formatBackendError(error, mockTranslate)).toBe("dbErrorMigrationFailed:table already exists");
  });

  it("formats generic unknown error with detail prefix", () => {
    const error = "Unexpected SQLite disk IO failure";
    expect(formatBackendError(error, mockTranslate)).toBe("dbErrorUnknown:Unexpected SQLite disk IO failure");
  });

  it("redacts Windows and Unix user home paths in error details (SEC-012)", () => {
    const winError = "Failed to access C:\\Users\\secret_user\\AppData\\Local\\whattodo\\file.json";
    expect(sanitizeErrorMessage(winError)).toBe("Failed to access <user-path>\\AppData\\Local\\whattodo\\file.json");
    expect(formatBackendError(winError, mockTranslate)).toBe(
      "dbErrorUnknown:Failed to access <user-path>\\AppData\\Local\\whattodo\\file.json",
    );

    const winForwardSlash = "Failed at C:/Users/secret_user/Documents/backup.json";
    expect(sanitizeErrorMessage(winForwardSlash)).toBe("Failed at <user-path>/Documents/backup.json");

    const macError = "IO error at /Users/john_doe/.config/whattodo/backup.json";
    expect(sanitizeErrorMessage(macError)).toBe("IO error at ~/.config/whattodo/backup.json");
    expect(formatBackendError(macError, mockTranslate)).toBe(
      "dbErrorUnknown:IO error at ~/.config/whattodo/backup.json",
    );

    const linuxError = "IO error at /home/developer/.config/whattodo/backup.json";
    expect(sanitizeErrorMessage(linuxError)).toBe("IO error at ~/.config/whattodo/backup.json");
  });
});
