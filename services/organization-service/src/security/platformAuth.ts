import { ServiceError } from "@workspace/shared";
import type { Request } from "express";

export interface PlatformRequestContext {
  platformUserId: string;
  platformRole: "super_admin";
}

export function requirePlatformSuperAdmin(request: Request): PlatformRequestContext {
  if (request.auth_kind !== "platform" || request.platform_role !== "super_admin") {
    throw new ServiceError(403, "Usuario de plataforma sem permissao.");
  }

  if (typeof request.user_id !== "string" || request.user_id.length === 0) {
    throw new ServiceError(401, "Nao autenticado.");
  }

  return {
    platformUserId: request.user_id,
    platformRole: "super_admin",
  };
}
