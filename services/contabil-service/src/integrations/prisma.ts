import { PrismaPg } from "@prisma/adapter-pg";
import { parseDatabasePoolMax } from "@workspace/shared/database";
import { getContabilServiceEnv } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const { databaseUrl } = getContabilServiceEnv();

const adapter = new PrismaPg({
  connectionString: databaseUrl,
  max: parseDatabasePoolMax(process.env.DATABASE_POOL_MAX),
});

export const prismaClient = new PrismaClient({ adapter });

export default prismaClient;
