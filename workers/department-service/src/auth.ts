import {
  authenticateWorkerRequest,
  type WorkerAuthContext,
  WorkerAuthenticationError,
} from "@workspace/runtime";
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

import type { DepartmentWorkerEnv } from "./env.js";

const MODULE_PERMISSION_MINIMUM = {
  read: 1,
  write: 2,
} as const;

const MODULE_KEYS = [
  "certificado",
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "marketing",
  "parcelamento",
  "pessoal",
  "regularize",
  "rh",
  "ti",
  "triagem",
] as const;

function header(request: Request, name: string): string | undefined {
  const value = request.headers.get(name);
  return value && value.length > 0 ? value : undefined;
}

function readModules(request: Request): Record<string, number> | undefined {
  const value = header(request, FORWARDED_AUTH_MODULES_HEADER);
  if (!value) return undefined;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const source = parsed as Record<string, unknown>;
    const modules: Record<string, number> = {};
    for (const key of MODULE_KEYS) {
      const value = source[key];
      modules[key] = typeof value === "number" && Number.isFinite(value) ? value : 0;
    }
    return modules;
  } catch {
    return undefined;
  }
}

function forwardedAuth(request: Request, env: DepartmentWorkerEnv): WorkerAuthContext | undefined {
  const internalToken = header(request, INTERNAL_SERVICE_TOKEN_HEADER);
  const userId = header(request, FORWARDED_AUTH_USER_ID_HEADER);
  const organizationId = header(request, FORWARDED_AUTH_ORGANIZATION_ID_HEADER);

  if (internalToken !== env.INTERNAL_SERVICE_TOKEN || !userId || !organizationId) {
    return undefined;
  }

  const actorKind =
    header(request, FORWARDED_AUTH_KIND_HEADER) === "platform" ? "platform" : "organization";
  const type = header(request, FORWARDED_AUTH_TYPE_HEADER);
  const platformRole = header(request, FORWARDED_AUTH_PLATFORM_ROLE_HEADER);
  const permissionHeader = header(request, FORWARDED_AUTH_PERMISSION_HEADER);
  const permission = permissionHeader === undefined ? undefined : Number(permissionHeader);
  const modules = readModules(request);

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
      modules: (modules ??
        Object.fromEntries(
          MODULE_KEYS.map((key) => [key, 0]),
        )) as WorkerAuthContext["claims"]["modules"],
      modulePermissionsPresent: modules !== undefined,
      ...(Number.isFinite(permission) ? { permission } : {}),
      ...(type === "owner" || type === "admin" || type === "user" ? { type } : {}),
      ...(platformRole === "super_admin" ? { platform_role: "super_admin" as const } : {}),
    },
  };
}

export async function authenticateDepartmentRequest(
  request: Request,
  env: DepartmentWorkerEnv,
): Promise<WorkerAuthContext> {
  const forwarded = forwardedAuth(request, env);
  if (forwarded) return forwarded;

  try {
    return await authenticateWorkerRequest(request, {
      jwtSecret: env.JWT_SECRET,
      allowBearer: true,
    });
  } catch (error) {
    if (error instanceof WorkerAuthenticationError) {
      throw new ServiceError(401, "Não autenticado.");
    }
    throw error;
  }
}

export function authorizeDepartmentRequest(request: Request, auth: WorkerAuthContext): void {
  if (auth.actorKind === "organization" && !auth.organizationId) {
    throw new ServiceError(401, "Organização não informada.");
  }

  const minimum =
    request.method.toUpperCase() === "GET"
      ? MODULE_PERMISSION_MINIMUM.read
      : MODULE_PERMISSION_MINIMUM.write;

  if (auth.actorKind === "organization" && auth.claims.type === "owner") return;

  const tiPermission = auth.claims.modules?.ti ?? 0;
  if (auth.actorKind !== "organization" || tiPermission < minimum) {
    throw new ServiceError(403, "Acesso negado para esta rota.");
  }
}
