import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for WhatToDo webview smoke tests.
 *
 * Scope (per docs/DESKTOP_VALIDATION.md section "E2E Automated Coverage"):
 * - Runs against the Vite dev server only (http://127.0.0.1:5173).
 * - Does NOT drive the Tauri desktop process, native notifications, tray,
 *   or file dialogs. Those flows remain manual desktop validation.
 * - Tauri-only APIs (invoke, @tauri-apps/plugin-*) are unavailable in this
 *   run; smoke tests assert the React tree mounts and renders a sane state
 *   (loading / error / shell), not full data flow.
 *
 * Coverage threshold: the smoke suite must maintain at least 10 passing
 * tests. This guards against accidental removal of view/nav coverage. The
 * check runs as a post-suite assertion in CI; locally it is informational.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: "chromium-webview-smoke",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
