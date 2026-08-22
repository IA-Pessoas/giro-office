import { PrismaPg } from "@prisma/adapter-pg";
import { parseDatabasePoolMax } from "@workspace/shared/database";

import { PrismaClient } from "../generated/prisma/client.js";

export function createParcelamentoPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: parseDatabasePoolMax(process.env.DATABASE_POOL_MAX),
  });

  return new PrismaClient({ adapter });
}

export type ParcelamentoPrismaClient = PrismaClient;
