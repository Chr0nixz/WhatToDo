import { LocalRepository } from "./localRepository";
import { SqlRepository } from "./sql/sqlRepository";
import { isTauriRuntime, DEFAULT_SETTINGS, DEFAULT_WORKSPACE_ID } from "./repositoryContract";
import type { TodoRepository } from "./repositoryContract";
import { buildTasksIcs } from "./export/tasksIcs";

export const createRepository = (): TodoRepository => (isTauriRuntime() ? new SqlRepository() : new LocalRepository());

export { buildTasksIcs, DEFAULT_SETTINGS, DEFAULT_WORKSPACE_ID, LocalRepository, SqlRepository };
export { CANNOT_DELETE_LAST_WORKSPACE } from "./repositoryContract";
export type { TodoRepository } from "./repositoryContract";
