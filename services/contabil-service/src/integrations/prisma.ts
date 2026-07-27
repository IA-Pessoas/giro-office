import { PrismaPg } from "@prisma/adapter-pg";
import { getContabilServiceEnv } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const { databaseUrl } = getContabilServiceEnv();

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

export const prismaClient = new PrismaClient({ adapter });

export default prismaClient;
