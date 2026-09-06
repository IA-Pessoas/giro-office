import { ServiceError } from "@workspace/shared";

export const ACTIVE_TASK_CONFLICT_MESSAGE = "Tarefa já foi cadastrada em andamento.";

export function throwIfActiveTaskConflict(err: unknown): void {
  if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
    throw new ServiceError(409, ACTIVE_TASK_CONFLICT_MESSAGE, err);
  }
}
