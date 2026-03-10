import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, '../../../../.env');

dotenv.config({ path: rootEnvPath });

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não está definida no arquivo .env");
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

export const prismaClient = new PrismaClient({ adapter });

export default prismaClient;
