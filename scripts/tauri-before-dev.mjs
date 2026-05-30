import { spawn } from "node:child_process";
import http from "node:http";

const DEV_HOST = "127.0.0.1";
const DEV_PORT = 5173;
const DEV_URL = `http://${DEV_HOST}:${DEV_PORT}/`;
const CHECK_TIMEOUT_MS = 1200;

const isWhatToDoViteServerRunning = () =>
  new Promise((resolve) => {
    const request = http.get(DEV_URL, { timeout: CHECK_TIMEOUT_MS }, (response) => {
      let body = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve(response.statusCode === 200 && body.includes("/@vite/client") && body.includes("<title>WhatToDo</title>"));
      });
    });

    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });

if (await isWhatToDoViteServerRunning()) {
  console.log(`Reusing existing WhatToDo Vite dev server at ${DEV_URL}`);
  setInterval(() => undefined, 60_000);
} else {
  const isWindows = process.platform === "win32";
  const command = "pnpm";
  const child = spawn(command, ["dev", "--", "--host", DEV_HOST], {
    stdio: "inherit",
    shell: isWindows,
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}
