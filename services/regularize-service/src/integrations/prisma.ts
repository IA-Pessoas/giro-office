import { PrismaPg } from "@prisma/adapter-pg";

import { getRegularizeServiceEnv } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const globalForPrisma = globalThis as unknown as {
  prismaClient?: PrismaClient;
};

export function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prismaClient) {
    const { databaseUrl } = getRegularizeServiceEnv();
    const adapter = new PrismaPg({
      connectionString: databaseUrl,
    });
    globalForPrisma.prismaClient = new PrismaClient({ adapter });
  }

  return globalForPrisma.prismaClient;
}

export const prismaClient = getPrismaClient();
