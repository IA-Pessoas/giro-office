import "dotenv/config";
import { z } from "zod";

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
        .filter(Boolean)
    )
});

export type GatewayEnv = z.infer<typeof gatewayEnvSchema>;

export function getGatewayEnv(): GatewayEnv {
  return gatewayEnvSchema.parse({
    port: process.env.GATEWAY_PORT,
    legacyApiUrl: process.env.LEGACY_API_URL,
    jwtSecret: process.env.JWT_SECRET,
    allowedOrigins: process.env.GATEWAY_ALLOWED_ORIGINS
  });
}
