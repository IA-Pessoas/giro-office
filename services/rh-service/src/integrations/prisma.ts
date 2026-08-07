import { PrismaPg } from "@prisma/adapter-pg";
import { getRhEnv } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const { databaseUrl, databasePoolMax } = getRhEnv();

const adapter = new PrismaPg({
  connectionString: databaseUrl,
  max: databasePoolMax,
});

export const prismaClient = new PrismaClient({ adapter });

export default prismaClient;
