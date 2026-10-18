/**
 * Safe localStorage wrapper that gracefully handles security restrictions,
 * quota exceptions, and headless/node test environments without crashing the application.
 */

const getStorage = (): Storage | null => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== "undefined" && globalThis.localStorage) {
      return globalThis.localStorage;
    }
    return null;
  } catch {
    return null;
  }
};

export const safeGetItem = (key: string): string | null => {
  try {
    const storage = getStorage();
    if (!storage) {
      return null;
    }
    return storage.getItem(key);
  } catch {
    return null;
  }
};

export const safeSetItem = (key: string, value: string): boolean => {
  try {
    const storage = getStorage();
    if (!storage) {
      return false;
    }
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const safeRemoveItem = (key: string): boolean => {
  try {
    const storage = getStorage();
    if (!storage) {
      return false;
    }
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};
