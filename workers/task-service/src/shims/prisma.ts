import type { PrismaClient } from "@workspace/task-service/src/generated/prisma/client.js";
import { currentTaskContext } from "../context.js";

/**
 * Substitui `services/task-service/src/prisma/index.ts` no bundle do Worker: em vez
 * de um client global, cada acesso resolve o client da requisição corrente.
 */
const prismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = currentTaskContext().prisma() as unknown as PrismaClient;
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export { prismaClient };
export default prismaClient;
