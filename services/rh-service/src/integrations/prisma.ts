import { PrismaPg } from "@prisma/adapter-pg";
import { parseDatabasePoolConnectionTimeoutMs } from "@workspace/shared/database";
import { getRhEnv } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const { databaseUrl, databasePoolMax } = getRhEnv();

const adapter = new PrismaPg({
  connectionString: databaseUrl,
  max: databasePoolMax,
  connectionTimeoutMillis: parseDatabasePoolConnectionTimeoutMs(
    process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
  ),
});

export const prismaClient = new PrismaClient({ adapter });

export default prismaClient;
