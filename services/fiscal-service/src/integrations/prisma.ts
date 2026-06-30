import { PrismaPg } from "@prisma/adapter-pg";
import { getFiscalServiceEnv } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const { databaseUrl } = getFiscalServiceEnv();

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

export const prismaClient = new PrismaClient({ adapter });

export default prismaClient;
