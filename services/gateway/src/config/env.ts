import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

// Carregar .env da raiz do workspace
// services/gateway/src/config/env.ts -> workspace/.env (4 níveis acima)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, '../../../../.env');

// Tenta carregar da raiz do workspace
dotenv.config({ path: rootEnvPath });
// Fallback: tenta do diretório atual
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
// Fallback final: tenta do diretório atual sem especificar caminho
dotenv.config();

const gatewayEnvSchema = z.object({
  port: z
    .string()
    .optional()
    .default("3334")
    .transform((val: string) => {
      const parsed = Number.parseInt(val, 10);
      return Number.isNaN(parsed) ? 3334 : parsed;
    }),
  legacyApiUrl: z.string().url().default("http://localhost:3333"),
  jwtSecret: z.string().min(1, "JWT_SECRET não definido para o gateway."),
  allowedOrigins: z
    .string()
    .optional()
    .default("*")
    .transform((val: string) =>
      val
        .split(",")
        .map((origin: string) => origin.trim())
        .filter(Boolean),
    ),
});

export type GatewayEnv = z.infer<typeof gatewayEnvSchema>;

export function getGatewayEnv(): GatewayEnv {
  return gatewayEnvSchema.parse({
    port: process.env.GATEWAY_PORT,
    legacyApiUrl: process.env.LEGACY_API_URL,
    jwtSecret: process.env.JWT_SECRET,
    allowedOrigins: process.env.GATEWAY_ALLOWED_ORIGINS,
  });
}
