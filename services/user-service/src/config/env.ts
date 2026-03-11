import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  port: z
    .string()
    .optional()
    .default("3335")
    .transform((val: string) => {
      const parsed = Number.parseInt(val, 10);
      return Number.isNaN(parsed) ? 3335 : parsed;
    }),
  databaseUrl: z.string().url("DATABASE_URL não definida."),
  jwtSecret: z.string().min(1, "JWT_SECRET não definido."),
  adminPassword: z.string().min(1, "ADMIN_PASSWORD não definido."),
});

export type UserServiceEnv = z.infer<typeof envSchema>;

export function getUserServiceEnv(): UserServiceEnv {
  return envSchema.parse({
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    adminPassword: process.env.ADMIN_PASSWORD,
  });
}
