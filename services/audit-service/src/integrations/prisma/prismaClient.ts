import { PrismaPg } from "@prisma/adapter-pg";
import { parseDatabasePoolMax } from "@workspace/shared/database";

import { PrismaClient } from "../../../generated/prisma/client.js";

let auditPrisma: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (auditPrisma) {
    return auditPrisma;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não definido para o audit-service.");
  }

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: parseDatabasePoolMax(process.env.DATABASE_POOL_MAX),
  });
  auditPrisma = new PrismaClient({ adapter });
  return auditPrisma;
}

export async function disconnectPrismaClient(): Promise<void> {
  const client = auditPrisma;
  if (!client) {
    return;
  }
  auditPrisma = undefined;
  await client.$disconnect();
}
