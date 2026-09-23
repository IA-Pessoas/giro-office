import { createWorkerPrismaClient } from "@workspace/runtime";

import { PrismaClient } from "./generated/prisma/client.js";

export { PrismaClient };

export function createCertificatePrisma(env: Parameters<typeof createWorkerPrismaClient>[0]) {
  return createWorkerPrismaClient(
    env,
    PrismaClient as unknown as new (options: {
      adapter: unknown;
    }) => PrismaClient,
  );
}
