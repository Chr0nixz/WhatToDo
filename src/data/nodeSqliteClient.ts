import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import type { SqliteClient } from "./sqliteClient";

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "testSchema.sql");
const TEST_SCHEMA = readFileSync(schemaPath, "utf8");

type SqlBind = null | number | bigint | string | Uint8Array;

const bindParams = (params: unknown[] = []): SqlBind[] =>
  params.map((value): SqlBind => {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }
    if (typeof value === "number" || typeof value === "bigint" || typeof value === "string") {
      return value;
    }
    if (value instanceof Uint8Array) {
      return value;
    }
    return String(value);
  });

const normalizeSqlValue = (value: unknown): unknown => {
  if (typeof value === "bigint") {
    return Number(value);
  }
  return value;
};

const normalizeRow = (row: Record<string, unknown>): Record<string, unknown> => {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    next[key] = normalizeSqlValue(value);
  }
  return next;
};

export const createMemorySqliteClient = (): SqliteClient & { close: () => void } => {
  const db = new DatabaseSync(":memory:");
  db.exec(TEST_SCHEMA);

  const client: SqliteClient & { close: () => void } = {
    execute: async (query, params = []) => {
      const bound = bindParams(params);
      if (bound.length === 0 && !/^\s*select\b/i.test(query) && !/^\s*with\b/i.test(query)) {
        db.exec(query);
        return 0;
      }
      const statement = db.prepare(query);
      const result = statement.run(...bound) as { changes?: number | bigint };
      return Number(result.changes ?? 0);
    },
    select: async (query, params = []) => {
      const statement = db.prepare(query);
      const rows = statement.all(...bindParams(params)) as Record<string, unknown>[];
      return rows.map(normalizeRow);
    },
    close: () => {
      db.close();
    },
  };

  return client;
};
