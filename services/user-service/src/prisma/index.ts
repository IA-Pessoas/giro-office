import { PrismaClient } from "../../../src/src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
import { getUserServiceEnv } from "../config/env";
connectionString: getUserServiceEnv().databaseUrl,
});

export const prismaClient = new PrismaClient({ adapter });
export default prismaClient;
