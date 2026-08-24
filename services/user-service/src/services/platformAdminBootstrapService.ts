import { ServiceError } from "@workspace/shared";
import { z } from "zod";

import type { PlatformRole } from "../generated/prisma/enums.js";
import { hashPassword } from "../security/passwordHashService.js";

const PLATFORM_ROLE: PlatformRole = "super_admin";
const COMMON_ADMIN_PASSWORDS = new Set([
  "adminadminadminadmin",
  "changemechangeme",
  "passwordpassword",
  "password12345678",
  "qwertyuiopasdfgh",
  "1234567890123456",
]);

function isTrivialPlatformPassword(password: string): boolean {
  const normalized = password.toLowerCase();
  if (
    COMMON_ADMIN_PASSWORDS.has(normalized) ||
    /^(.)\1+$/.test(normalized) ||
    /^\d+$/.test(normalized)
  ) {
    return true;
  }

  const direction = normalized.charCodeAt(1) - normalized.charCodeAt(0);
  return (
    (direction === 1 || direction === -1) &&
    [...normalized].every(
      (character, index) =>
        index === 0 || character.charCodeAt(0) - normalized.charCodeAt(index - 1) === direction,
    )
  );
}

const platformAdminBootstrapInputSchema = z
  .object({
    name: z.string().trim().min(1, "PLATFORM_ADMIN_NAME é obrigatório."),
    email: z.string().trim().toLowerCase().email("PLATFORM_ADMIN_EMAIL inválido."),
    password: z
      .string()
      .min(16, "PLATFORM_ADMIN_PASSWORD deve ter no mínimo 16 caracteres.")
      .refine(
        (password) => !isTrivialPlatformPassword(password),
        "PLATFORM_ADMIN_PASSWORD é muito comum.",
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
