import "dotenv/config";

import { z } from "zod";

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const organizationEnvSchema = z
  .object({
    port: z
      .string()
      .optional()
      .default("3400")
      .transform((val: string) => {
        const parsed = Number.parseInt(val, 10);
        return Number.isNaN(parsed) ? 3400 : parsed;
      }),
    databaseUrl: z.string().min(1, "DATABASE_URL não definido para o organization-service."),
    jwtSecret: z.string().min(1, "JWT_SECRET não definido para o organization-service."),
    nodeEnv: z.string().optional().default("development"),
    enableApiDocsEnv: z.string().optional(),
  })
  .transform((env) => {
    const { enableApiDocsEnv, ...rest } = env;
    const enableApiDocs =
      enableApiDocsEnv !== undefined && enableApiDocsEnv !== ""
        ? parseBoolean(enableApiDocsEnv)
        : rest.nodeEnv !== "production";
    return { ...rest, enableApiDocs };
  });

export type OrganizationEnv = z.infer<typeof organizationEnvSchema>;

export function getOrganizationEnv(): OrganizationEnv {
  return organizationEnvSchema.parse({
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
  });
}
