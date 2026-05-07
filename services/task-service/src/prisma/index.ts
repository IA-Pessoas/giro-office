import { PrismaPg } from "@prisma/adapter-pg";
import { getTaskServiceEnv } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: getTaskServiceEnv().databaseUrl,
});

export const prismaClient = new PrismaClient({ adapter });

export default prismaClient;
