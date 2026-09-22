import { AsyncLocalStorage } from "node:async_hooks";
import type { TaskWorkerEnv } from "./env.js";

interface DisconnectablePrisma {
  $disconnect(): Promise<void>;
}

export interface TaskContextOptions {
  env: TaskWorkerEnv;
  createPrisma: () => DisconnectablePrisma;
}

interface TaskContext {
  env: TaskWorkerEnv;
  prisma(): DisconnectablePrisma;
}

const storage = new AsyncLocalStorage<TaskContext>();

/**
 * Os serviços do task-service Node importam singletons de módulo (Prisma, env).
 * No Worker, cada requisição roda aqui dentro e os shims leem o estado dela:
 * I/O não pode ser compartilhado entre requisições no workerd.
 */
export async function runInTaskContext<T>(
  { env, createPrisma }: TaskContextOptions,
  fn: () => T | Promise<T>,
): Promise<T> {
  let client: DisconnectablePrisma | undefined;
  const context: TaskContext = {
    env,
    prisma: () => {
      client ??= createPrisma();
      return client;
    },
  };
  try {
    return await storage.run(context, fn);
  } finally {
    await client?.$disconnect();
  }
}

export function currentTaskContext(): TaskContext {
  const context = storage.getStore();
  if (!context)
    throw new Error("task-worker: acesso a estado de requisição fora de uma requisição.");
  return context;
}
