import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseAllowedOrigins,
  validateProductionCorsOrigins,
  validateProductionInternalServiceToken,
} from "@workspace/shared";
import { loggerLevelSchema } from "@workspace/shared/logger";
import dotenv from "dotenv";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceEnvPath = path.resolve(__dirname, "../../.env");

dotenv.config({ path: serviceEnvPath });

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const organizationEnvSchema = z
  .object({
    port: z
      .string()
      .optional()
      .default("3031")
      .transform((val: string) => {
        const parsed = Number.parseInt(val, 10);
        return Number.isNaN(parsed) ? 3031 : parsed;
      }),
    databaseUrl: z.string().min(1, "DATABASE_URL não definido para o organization-service."),
    jwtSecret: z.string().min(1, "JWT_SECRET não definido para o organization-service."),
    auditServiceToken: z
      .string()
      .min(1, "AUDIT_SERVICE_TOKEN não definido para o organization-service."),
    nodeEnv: z.string().optional().default("development"),
    logLevel: loggerLevelSchema.optional().default("info"),
    logPretty: z
      .string()
      .optional()
      .default("false")
      .transform((value) => parseBoolean(value)),
    enableApiDocsEnv: z.string().optional(),
    allowedOrigins: z
      .string()
      .optional()
      .default("*")
      .transform((value) => parseAllowedOrigins(value)),
  })
  .transform((env) => {
    const { enableApiDocsEnv, ...rest } = env;
    const enableApiDocs =
      enableApiDocsEnv !== undefined && enableApiDocsEnv !== ""
        ? parseBoolean(enableApiDocsEnv)
        : rest.nodeEnv !== "production";

    validateProductionCorsOrigins({
      nodeEnv: rest.nodeEnv,
      serviceName: "organization-service",
      envName: "SERVICE_ALLOWED_ORIGINS",
      allowedOrigins: rest.allowedOrigins,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "organization-service",
      envName: "AUDIT_SERVICE_TOKEN",
      token: rest.auditServiceToken,
    });

    return {
      ...rest,
      logPretty: rest.nodeEnv !== "production" && rest.logPretty,
      enableApiDocs,
    };
  });

export type OrganizationEnv = z.infer<typeof organizationEnvSchema>;

export function getOrganizationEnv(): OrganizationEnv {
  return organizationEnvSchema.parse({
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    auditServiceToken: process.env.AUDIT_SERVICE_TOKEN,
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
    allowedOrigins: process.env.SERVICE_ALLOWED_ORIGINS,
  });
}
