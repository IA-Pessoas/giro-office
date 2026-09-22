import {
  authenticateWorkerRequest,
  type WorkerAuthContext,
  WorkerAuthenticationError,
} from "@workspace/runtime";
import { normalizeModulePermissions } from "@workspace/shared/auth";
import {
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared/http";
import type { TiWorkerEnv } from "./env.js";

function value(request: Request, name: string): string | undefined {
  const header = request.headers.get(name);
  return header && header.length > 0 ? header : undefined;
}

function forwardedAuth(request: Request, env: TiWorkerEnv): WorkerAuthContext | undefined {
  if (value(request, INTERNAL_SERVICE_TOKEN_HEADER) !== env.INTERNAL_SERVICE_TOKEN) {
    return undefined;
  }

  const userId = value(request, FORWARDED_AUTH_USER_ID_HEADER);
  const organizationId = value(request, FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  if (!userId || !organizationId) return undefined;

  let modules: unknown;
  const modulesHeader = value(request, FORWARDED_AUTH_MODULES_HEADER);
  if (modulesHeader) {
    try {
      modules = JSON.parse(modulesHeader);
    } catch {
      modules = undefined;
    }
  }

  const actorKind =
    value(request, FORWARDED_AUTH_KIND_HEADER) === "platform" ? "platform" : "organization";
  const platformRole = value(request, FORWARDED_AUTH_PLATFORM_ROLE_HEADER);
  const type = value(request, FORWARDED_AUTH_TYPE_HEADER);
  const permissionHeader = value(request, FORWARDED_AUTH_PERMISSION_HEADER);
  const permission = permissionHeader === undefined ? undefined : Number(permissionHeader);

  return {
    token: "forwarded-by-gateway",
    userId,
    organizationId,
    actorKind,
    isPlatformAdmin: actorKind === "platform" && platformRole === "super_admin",
    claims: {
      user_id: userId,
      organization_id: organizationId,
      auth_kind: actorKind,
      modules: normalizeModulePermissions(modules) as WorkerAuthContext["claims"]["modules"],
      modulePermissionsPresent: modulesHeader !== undefined,
      ...(Number.isFinite(permission) ? { permission } : {}),
      ...(platformRole === "super_admin" ? { platform_role: "super_admin" as const } : {}),
      ...(type === "owner" || type === "admin" || type === "user" ? { type } : {}),
    },
  };
}

export async function authenticateTiRequest(
  request: Request,
  env: TiWorkerEnv,
): Promise<WorkerAuthContext> {
  const forwarded = forwardedAuth(request, env);
  if (forwarded) return forwarded;

  try {
    return await authenticateWorkerRequest(request, {
      jwtSecret: env.JWT_SECRET,
      allowBearer: true,
    });
  } catch (error) {
    if (error instanceof WorkerAuthenticationError) throw new ServiceError(401, "Não autenticado.");
    throw error;
  }
}

export function requireTiPermission(auth: WorkerAuthContext, minimum: number): void {
  if (typeof auth.claims.permission !== "number" || auth.claims.permission < minimum) {
    throw new ServiceError(403, "Permissão insuficiente para acessar o ti-service.");
  }
}
