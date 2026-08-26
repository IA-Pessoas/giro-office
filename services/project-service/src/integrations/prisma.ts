import { PrismaPg } from "@prisma/adapter-pg";
import {
  parseDatabasePoolConnectionTimeoutMs,
  parseDatabasePoolMax,
} from "@workspace/shared/database";
import { getProjectServiceEnv } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const { databaseUrl } = getProjectServiceEnv();

const adapter = new PrismaPg({
  connectionString: databaseUrl,
  max: parseDatabasePoolMax(process.env.DATABASE_POOL_MAX),
  connectionTimeoutMillis: parseDatabasePoolConnectionTimeoutMs(
    process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
  ),
});

export const prismaClient = new PrismaClient({ adapter });

export default prismaClient;
