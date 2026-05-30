import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "./i18n";
import App from "./App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: "main" }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
  save: vi.fn().mockResolvedValue(null),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(false),
  requestPermission: vi.fn().mockResolvedValue("denied"),
  sendNotification: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn().mockResolvedValue(null),
}));

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the main shell and switches sidebar views", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("WhatToDo")).toBeInTheDocument());
    expect(screen.getAllByText("每日 DDL").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "项目" }));
    expect(screen.getAllByText("新建项目").length).toBeGreaterThan(0);
    expect(screen.getAllByText("无项目").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "工作区" }));
    expect(screen.getAllByText("新建工作区").length).toBeGreaterThan(0);
    expect(screen.getByText("常用文件夹")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "设置" }));
    expect(screen.getAllByText("系统通知").length).toBeGreaterThan(0);
    expect(screen.getByText("关闭到托盘")).toBeInTheDocument();
    expect(screen.getByText("默认文件夹")).toBeInTheDocument();
    expect(screen.getByText("恢复中心")).toBeInTheDocument();
    expect(screen.getByText("数据管理")).toBeInTheDocument();
  });
});
