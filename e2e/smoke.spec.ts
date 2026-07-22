import { expect, test, type Page } from "@playwright/test";

/**
 * Webview smoke tests for WhatToDo.
 *
 * Scope (per docs/DESKTOP_VALIDATION.md "E2E Automated Coverage"):
 * - Runs against the Vite dev server only.
 * - In the browser dev server (no Tauri runtime), createRepository() falls
 *   back to LocalRepository (localStorage), so the app shell renders fully.
 *   These tests guard against regressions that break the webview mount
 *   itself (main.tsx, App.tsx, AppShell tree, i18n bootstrap, sidebar nav,
 *   view switching, create-task entry point, command palette, settings).
 * - Desktop-only flows (native notifications, tray, floating window, file
 *   dialogs, JSON/CSV/ICS export) are NOT covered here; see the manual
 *   checklist in docs/DESKTOP_VALIDATION.md.
 */

async function gotoAndTrackPageErrors(page: Page, path = "/") {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });
  await page.goto(path);
  return pageErrors;
}

function assertNoPageErrors(pageErrors: Error[]) {
  expect(pageErrors, pageErrors.map((error) => error.message).join("\n")).toEqual([]);
}

test.describe("WhatToDo webview smoke", () => {
  test("document title is WhatToDo", async ({ page }) => {
    const pageErrors = await gotoAndTrackPageErrors(page);
    await expect(page).toHaveTitle("WhatToDo");
    assertNoPageErrors(pageErrors);
  });

  test("app shell mounts with sidebar nav and main content", async ({ page }) => {
    const pageErrors = await gotoAndTrackPageErrors(page);

    // #root must be populated (i.e., React mounted instead of leaving the
    // boot placeholder from index.html).
    await expect(page.locator("#root")).not.toBeEmpty();

    // Sidebar <aside aria-label="WhatToDo"> must be present.
    const sidebar = page.locator('aside[aria-label="WhatToDo"]');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    // Default locale is zh, so the sidebar buttons should render Chinese
    // labels. This guards the i18n bootstrap path.
    await expect(page.getByRole("button", { name: "主页" })).toBeVisible();
    await expect(page.getByRole("button", { name: "总览" })).toBeVisible();
    await expect(page.getByRole("button", { name: "设置" })).toBeVisible();
    assertNoPageErrors(pageErrors);
  });

  test("sidebar switches to Projects view", async ({ page }) => {
    const pageErrors = await gotoAndTrackPageErrors(page);

    // Click the Projects nav button (zh: 项目, exact to avoid matching the
    // 搜索任务或项目 search button) and verify the ProjectsView lazy chunk
    // loads and renders its heading.
    await page.getByRole("button", { name: "项目", exact: true }).click();
    await expect(page.getByRole("heading", { name: "项目", exact: true }).first()).toBeVisible({ timeout: 10_000 });
    assertNoPageErrors(pageErrors);
  });

  test("sidebar switches to Overview view", async ({ page }) => {
    const pageErrors = await gotoAndTrackPageErrors(page);

    await page.getByRole("button", { name: "总览", exact: true }).click();
    // OverviewView renders the "所有任务" (allTasks) h1 heading.
    await expect(page.getByRole("heading", { name: "所有任务", exact: true }).first()).toBeVisible({ timeout: 10_000 });
    assertNoPageErrors(pageErrors);
  });

  test("sidebar switches to Reminders view", async ({ page }) => {
    const pageErrors = await gotoAndTrackPageErrors(page);

    await page.getByRole("button", { name: "提醒", exact: true }).click();
    // ReminderCenterView renders an h2 with "提醒" (reminders).
    await expect(page.getByRole("heading", { name: "提醒", exact: true }).first()).toBeVisible({ timeout: 10_000 });
    assertNoPageErrors(pageErrors);
  });

  test("sidebar switches to Workspaces view", async ({ page }) => {
    const pageErrors = await gotoAndTrackPageErrors(page);

    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await expect(page.getByRole("heading", { name: "工作区", exact: true }).first()).toBeVisible({ timeout: 10_000 });
    assertNoPageErrors(pageErrors);
  });

  test("sidebar switches to Settings view and shows theme section", async ({ page }) => {
    const pageErrors = await gotoAndTrackPageErrors(page);

    await page.getByRole("button", { name: "设置", exact: true }).click();
    // SettingsView renders the "主题" heading (theme section).
    await expect(page.getByRole("heading", { name: "主题", exact: true }).first()).toBeVisible({ timeout: 10_000 });
    assertNoPageErrors(pageErrors);
  });

  test("create-task entry point is reachable from Home view", async ({ page }) => {
    const pageErrors = await gotoAndTrackPageErrors(page);

    // Prefer the header Add control (data-testid) — Home also renders an
    // empty-state Add button with the same visible label.
    const addButton = page.getByTestId("add-task");
    await expect(addButton).toBeVisible({ timeout: 10_000 });
    assertNoPageErrors(pageErrors);
  });

  test("command palette opens via Ctrl+K and shows command list", async ({ page }) => {
    const pageErrors = await gotoAndTrackPageErrors(page);
    await expect(page.locator('aside[aria-label="WhatToDo"]')).toBeVisible({ timeout: 15_000 });

    // Header command button must expose a stable accessible name (not only the shortcut hint).
    await expect(page.getByRole("button", { name: "命令面板" })).toBeVisible();

    // Open the command palette with Ctrl+K (Cmd+K on macOS; Playwright runs
    // on Linux/Windows CI so Ctrl+K is correct).
    await page.keyboard.press("Control+K");

    // The palette renders a dialog with a search input (id=command-palette-input).
    const paletteInput = page.locator("#command-palette-input");
    await expect(paletteInput).toBeVisible({ timeout: 5_000 });
    await expect(paletteInput).toHaveAttribute("role", "combobox");
    await expect(paletteInput).toHaveAttribute("aria-controls", "command-palette-listbox");

    // The palette footer shows the Escape kbd hint, confirming the dialog body rendered.
    await expect(page.locator("dialog, [role='dialog']").filter({ hasText: "Esc" })).toBeVisible({ timeout: 5_000 });
    assertNoPageErrors(pageErrors);
  });

  test("browser mount has no Tauri listen pageerrors", async ({ page }) => {
    const pageErrors = await gotoAndTrackPageErrors(page);
    await expect(page.locator('aside[aria-label="WhatToDo"]')).toBeVisible({ timeout: 15_000 });
    assertNoPageErrors(pageErrors);
    expect(pageErrors.some((error) => /transformCallback|listen/i.test(error.message))).toBe(false);
  });

  test("sidebar rail can be collapsed and expanded", async ({ page }) => {
    const pageErrors = await gotoAndTrackPageErrors(page);
    const sidebar = page.locator('aside[aria-label="WhatToDo"]');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    // The rail toggle button flips its aria-label between collapse (收起侧边栏)
    // and expand (展开侧边栏). On a fresh localStorage state the rail starts
    // collapsed, so the button reads "展开侧边栏". Clicking it expands the rail.
    const expandBtn = page.getByRole("button", { name: "展开侧边栏" });
    await expect(expandBtn).toBeVisible({ timeout: 5_000 });
    await expandBtn.click();

    // After expanding, the collapse button (zh: 收起侧边栏) should appear.
    await expect(page.getByRole("button", { name: "收起侧边栏" })).toBeVisible({ timeout: 5_000 });
    assertNoPageErrors(pageErrors);
  });

  test("empty-day placeholder renders on Home view", async ({ page }) => {
    const pageErrors = await gotoAndTrackPageErrors(page);

    // Fresh localStorage shows first-run copy; after firstRunSeen it falls back to emptyDay.
    const emptyCopy = page.getByText(/这一天没有 DDL。|第一次使用？/).first();
    await expect(emptyCopy).toBeVisible({ timeout: 10_000 });
    assertNoPageErrors(pageErrors);
  });
});
