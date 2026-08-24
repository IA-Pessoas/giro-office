import { ServiceError } from "@workspace/shared";
import { z } from "zod";

import type { PlatformRole } from "../generated/prisma/enums.js";
import { hashPassword } from "../security/passwordHashService.js";

const PLATFORM_ROLE: PlatformRole = "super_admin";
function isGeneratedPlatformSecret(password: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(password) || new Set(password).size < 20) {
    return false;
  }

  const decoded = Buffer.from(password, "base64url");
  return decoded.length === 32 && decoded.toString("base64url") === password;
}

const platformAdminBootstrapInputSchema = z
  .object({
    name: z.string().trim().min(1, "PLATFORM_ADMIN_NAME é obrigatório."),
    email: z.string().trim().toLowerCase().email("PLATFORM_ADMIN_EMAIL inválido."),
    password: z
      .string()
      .length(43, "PLATFORM_ADMIN_PASSWORD deve codificar 32 bytes em Base64URL.")
      .refine(
        (password) => isGeneratedPlatformSecret(password),
        "PLATFORM_ADMIN_PASSWORD é muito comum; gere 32 bytes aleatórios em Base64URL.",
      ),
  })
  .strict();

export interface PlatformAdminBootstrapInput {
  name: string;
  email: string;
  password: string;
}

export interface PlatformAdminRepository {
  findByEmail(email: string): Promise<{ id: string; email: string } | null>;
  create(data: {
    name: string;
    email: string;
    password: string;
    platform_role: typeof PLATFORM_ROLE;
    status: "active";
    session_version: 0;
  }): Promise<{ id: string; email: string }>;
}

export function parsePlatformAdminBootstrapInput(
  input: PlatformAdminBootstrapInput,
): PlatformAdminBootstrapInput {
  return platformAdminBootstrapInputSchema.parse(input);
}

export async function bootstrapPlatformAdmin(
  input: PlatformAdminBootstrapInput,
  repository: PlatformAdminRepository,
): Promise<{ id: string; email: string; created: true }> {
  const parsed = parsePlatformAdminBootstrapInput(input);

  if (await repository.findByEmail(parsed.email)) {
    throw new ServiceError(409, "Administrador da plataforma já cadastrado.");
  }

  const created = await repository.create({
    name: parsed.name,
    email: parsed.email,
    password: await hashPassword(parsed.password),
    platform_role: PLATFORM_ROLE,
    status: "active",
    session_version: 0,
  });

  return { id: created.id, email: created.email, created: true };
}
