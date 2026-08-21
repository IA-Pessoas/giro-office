import { ServiceError } from "@workspace/shared";

import type { PlatformRole } from "../generated/prisma/enums.js";
import { hashPassword } from "../security/passwordHashService.js";

const PLATFORM_ROLE: PlatformRole = "super_admin";

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

export async function bootstrapPlatformAdmin(
  input: PlatformAdminBootstrapInput,
  repository: PlatformAdminRepository,
): Promise<{ id: string; email: string; created: true }> {
  if (await repository.findByEmail(input.email)) {
    throw new ServiceError(409, "Administrador da plataforma já cadastrado.");
  }

  const created = await repository.create({
    name: input.name,
    email: input.email,
    password: await hashPassword(input.password),
    platform_role: PLATFORM_ROLE,
    status: "active",
    session_version: 0,
  });

  return { id: created.id, email: created.email, created: true };
}
