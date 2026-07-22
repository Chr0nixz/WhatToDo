import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";

const arg = process.argv[2];
const fixturePath = arg
  ? isAbsolute(arg)
    ? arg
    : join(process.cwd(), arg)
  : join(process.cwd(), "tmp", "performance-backup-20000.json");

const raw = JSON.parse(readFileSync(fixturePath, "utf8"));

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
  ssr: {
    // Allow resolving workspace TS modules the same way Vitest does.
    external: [],
  },
});

try {
  const moduleUrl = pathToFileURL(join(process.cwd(), "src/data/backupSchema.ts")).href;
  const { parseBackupPayload } = await server.ssrLoadModule(moduleUrl);
  const result = parseBackupPayload(raw);
  if (!result.success) {
    console.error(`Fixture failed parseBackupPayload: ${result.error}`);
    process.exit(1);
  }
  console.log(`Validated ${fixturePath} via parseBackupPayload`);
} finally {
  await server.close();
}
