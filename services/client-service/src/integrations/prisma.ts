import { PrismaPg } from "@prisma/adapter-pg";
import { parseDatabasePoolMax } from "@workspace/shared/database";
import { getClientServiceEnv } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const globalForPrisma = globalThis as unknown as {
  prismaClient?: PrismaClient;
};

/**
 * Cliente Prisma singleton (reutilizado em dev para hot reload).
 * Em testes de integração com DB, prefira mockar o service em vez deste módulo.
 */
export function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prismaClient) {
    const { databaseUrl } = getClientServiceEnv();
    const adapter = new PrismaPg({
      connectionString: databaseUrl,
      max: parseDatabasePoolMax(process.env.DATABASE_POOL_MAX),
    });
    globalForPrisma.prismaClient = new PrismaClient({ adapter });
  }
  return globalForPrisma.prismaClient;
}

export const prismaClient = getPrismaClient();
