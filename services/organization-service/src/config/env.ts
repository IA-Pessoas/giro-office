import "dotenv/config";

import { z } from "zod";

const organizationEnvSchema = z.object({
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
});

export type OrganizationEnv = z.infer<typeof organizationEnvSchema>;

export function getOrganizationEnv(): OrganizationEnv {
  return organizationEnvSchema.parse({
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
  });
}
