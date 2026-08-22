import { PrismaPg } from "@prisma/adapter-pg";
import { parseDatabasePoolMax } from "@workspace/shared/database";
import { getTaskServiceEnv } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: getTaskServiceEnv().databaseUrl,
  max: parseDatabasePoolMax(process.env.DATABASE_POOL_MAX),
});

export const prismaClient = new PrismaClient({ adapter });

export default prismaClient;
