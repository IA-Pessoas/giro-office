import { PrismaClient } from "../../../src/src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

export const prismaClient = new PrismaClient({ adapter });
export default prismaClient;
