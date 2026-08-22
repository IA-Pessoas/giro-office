import { PrismaPg } from "@prisma/adapter-pg";
import {
  parseDatabasePoolConnectionTimeoutMs,
  parseDatabasePoolMax,
} from "@workspace/shared/database";

import { PrismaClient } from "../generated/prisma/client.js";

export function createReportsPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
      max: parseDatabasePoolMax(process.env.DATABASE_POOL_MAX),
      connectionTimeoutMillis: parseDatabasePoolConnectionTimeoutMs(
        process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
      ),
    }),
  });
}

export type ReportsPrismaClient = PrismaClient;
