import { z } from "zod";

import type { PlatformRole } from "../generated/prisma/enums.js";
import { hashPassword } from "../security/passwordHashService.js";

const PLATFORM_ROLE: PlatformRole = "super_admin";

const platformAdminBootstrapInputSchema = z
  .object({
    name: z.string().trim().min(1, "PLATFORM_ADMIN_NAME é obrigatório."),
    email: z.string().trim().toLowerCase().email("PLATFORM_ADMIN_EMAIL inválido."),
    password: z
      .string()
      .min(1, "PLATFORM_ADMIN_PASSWORD é obrigatória.")
      .refine(
        (password) => password.trim().length > 0,
        "PLATFORM_ADMIN_PASSWORD não pode ficar vazia.",
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
    can_impersonate: true;
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
): Promise<{ id: string; email: string; created: boolean }> {
  const parsed = parsePlatformAdminBootstrapInput(input);
  const existing = await repository.findByEmail(parsed.email);

  if (existing) {
    return { ...existing, created: false };
  }

  const created = await repository.create({
    name: parsed.name,
    email: parsed.email,
    password: await hashPassword(parsed.password),
    platform_role: PLATFORM_ROLE,
    status: "active",
    can_impersonate: true,
    session_version: 0,
  });

  return { id: created.id, email: created.email, created: true };
}
