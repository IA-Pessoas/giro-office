import { PrismaPg } from "@prisma/adapter-pg";

import { getPessoalServiceEnv } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: getPessoalServiceEnv().databaseUrl,
});

export const prismaClient = new PrismaClient({ adapter });

export default prismaClient;
