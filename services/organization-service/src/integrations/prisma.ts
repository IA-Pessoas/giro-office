import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { getOrganizationEnv } from "../config/env.js";

const { databaseUrl } = getOrganizationEnv();

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

export const prismaClient = new PrismaClient({ adapter });

export default prismaClient;
