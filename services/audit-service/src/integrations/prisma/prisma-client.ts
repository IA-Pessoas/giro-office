import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../../generated/prisma/client.js";

const globalForPrisma = globalThis as typeof globalThis & {
  auditPrisma?: PrismaClient;
};

export function getPrismaClient(): PrismaClient {
  if (globalForPrisma.auditPrisma) {
    return globalForPrisma.auditPrisma;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não definido para o audit-service.");
  }

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  const prismaClient = new PrismaClient({ adapter });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.auditPrisma = prismaClient;
  }

  return prismaClient;
}
