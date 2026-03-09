import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

import { getUserServiceEnv } from "../config/env.js";

const adapter = new PrismaPg({
connectionString: getUserServiceEnv().databaseUrl,
});

export const prismaClient = new PrismaClient({ adapter });
export default prismaClient;
