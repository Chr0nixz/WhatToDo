import { describe, expect, it } from "vitest";

import { formatBackendError } from "./backendError";

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
});
