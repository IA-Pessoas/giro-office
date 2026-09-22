import { AsyncLocalStorage } from "node:async_hooks";
import { createWorkerPrismaClient } from "@workspace/runtime";
import { ServiceError } from "@workspace/shared/http";
import type { TaskWorkerEnv } from "./env.js";
import { PrismaClient } from "./generated/prisma/client.js";

/**
 * Os services vieram do task-service Node, que usa um Prisma e um env globais do processo.
 * No Worker cada requisição tem o seu: o contexto guarda env e um Prisma criado sob demanda,
 * e `prisma/index.ts` e `integrations/*` o leem daqui. Assim os services seguem idênticos.
 */
type TaskRequestContext = { env: TaskWorkerEnv; prisma(): PrismaClient };

const storage = new AsyncLocalStorage<TaskRequestContext>();

export function currentTaskContext(): TaskRequestContext {
  const context = storage.getStore();
  if (!context) throw new Error("Contexto de requisição do task Worker ausente.");
  return context;
}

export async function runInTaskContext<T>(env: TaskWorkerEnv, run: () => Promise<T>): Promise<T> {
  let client: PrismaClient | undefined;
  const prisma = () => {
    if (!env.HYPERDRIVE?.connectionString && !env.DATABASE_URL) {
      throw new ServiceError(503, "Banco de dados não configurado.");
    }
    client ??= createWorkerPrismaClient(env, PrismaClient);
    return client;
  };
  try {
    return await storage.run({ env, prisma }, run);
  } finally {
    await client?.$disconnect();
  }
}
