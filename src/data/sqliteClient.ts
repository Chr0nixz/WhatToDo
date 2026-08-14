import { invoke } from "@tauri-apps/api/core";

export type SqliteClient = {
  execute(query: string, params?: unknown[]): Promise<number>;
  select(query: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
};

type SqliteClientLike = {
  execute(query: string, params?: unknown[]): Promise<unknown>;
  select(query: string, params?: unknown[]): Promise<unknown[]>;
};

let testOverride: SqliteClient | null = null;
let invokeClient: SqliteClient | null = null;
let sqlQueue: Promise<unknown> = Promise.resolve();

const enqueueSql = <T>(operation: () => Promise<T>): Promise<T> => {
  const run = sqlQueue.then(operation, operation);
  sqlQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};

const queuedClient = (client: SqliteClient): SqliteClient => ({
  execute: (query, params) => enqueueSql(() => client.execute(query, params)),
  select: (query, params) => enqueueSql(() => client.select(query, params)),
});

const createInvokeClient = (): SqliteClient => ({
  execute: (query, params = []) => invoke<number>("db_execute", { query, values: params }),
  select: (query, params = []) => invoke("db_select", { query, values: params }),
});

export const setSqliteClientForTests = (client: SqliteClientLike | null) => {
  testOverride = client as SqliteClient | null;
};

export const getSqliteClient = (): SqliteClient => {
  if (testOverride) {
    return queuedClient(testOverride);
  }
  invokeClient ??= queuedClient(createInvokeClient());
  return invokeClient;
};
