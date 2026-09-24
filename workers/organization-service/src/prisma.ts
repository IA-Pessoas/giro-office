import { createWorkerPrismaClient } from "@workspace/runtime";

import { PrismaClient } from "./generated/prisma/client.js";
import type { OrganizationPrismaClient, OrganizationWorkerEnv } from "./types.js";

export function createOrganizationPrisma(env: OrganizationWorkerEnv): OrganizationPrismaClient {
  return createWorkerPrismaClient(
    env,
    PrismaClient as unknown as new (options: {
      adapter: unknown;
    }) => OrganizationPrismaClient,
  );
}
