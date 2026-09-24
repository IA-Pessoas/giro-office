import { createWorkerPrismaClient } from "@workspace/runtime";
import type { UserWorkerEnv } from "./env.js";
import { PrismaClient } from "./generated/prisma/client.js";
import type { UserPrismaClient } from "./types.js";

export function createUserPrisma(env: UserWorkerEnv): UserPrismaClient {
  return createWorkerPrismaClient(
    env,
    PrismaClient as unknown as new (options: {
      adapter: unknown;
    }) => UserPrismaClient,
  );
}
