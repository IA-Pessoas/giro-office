import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

// Carregar .env da raiz do workspace antes de usar process.env
// Calcula o caminho relativo: services/src/src/prisma -> raiz (4 níveis acima)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, '../../../../.env');

// Tenta carregar da raiz do workspace
dotenv.config({ path: rootEnvPath });
// Fallback: tenta do diretório atual
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
// Fallback final: tenta do diretório atual sem especificar caminho
dotenv.config();

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não está definida no arquivo .env");
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

export const prismaClient = new PrismaClient({ adapter });

export default prismaClient;
