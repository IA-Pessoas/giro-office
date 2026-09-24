import { withWorkerPrisma } from "@workspace/runtime";
import type { ReportsWorkerEnv } from "./env.js";
import { PrismaClient } from "./generated/prisma/client.js";

export type ReportsPrismaClient = InstanceType<typeof PrismaClient>;

export async function checkReportsDatabase(
  env: ReportsWorkerEnv,
  injected?: Pick<ReportsPrismaClient, "$queryRaw">,
): Promise<void> {
  if (injected) {
    await injected.$queryRaw`SELECT 1`;
    return;
  }

  await withWorkerPrisma(env, PrismaClient, async (client) => {
    await client.$queryRaw`SELECT 1`;
  });
}

export { PrismaClient };
