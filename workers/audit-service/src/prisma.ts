import { createWorkerPrismaClient } from "@workspace/runtime";

import { PrismaClient } from "./generated/prisma/client.js";

export function createAuditPrismaClient(env: Parameters<typeof createWorkerPrismaClient>[0]) {
  return createWorkerPrismaClient(env, PrismaClient);
}

export { PrismaClient };
