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
import type { ClientWorkerEnv } from "./env.js";

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

function modules(request: Request): Record<string, number> | undefined {
  const value = header(request, FORWARDED_AUTH_MODULES_HEADER);
  if (!value) return undefined;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const source = parsed as Record<string, unknown>;
    return Object.fromEntries(
      MODULE_KEYS.map((key) => [key, typeof source[key] === "number" ? source[key] : 0]),
    ) as Record<string, number>;
  } catch {
    return undefined;
  }
}

function forwardedAuth(request: Request, env: ClientWorkerEnv): WorkerAuthContext | undefined {
  const internalToken = header(request, INTERNAL_SERVICE_TOKEN_HEADER);
  const userId = header(request, FORWARDED_AUTH_USER_ID_HEADER);
  const organizationId = header(request, FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  if (internalToken !== env.INTERNAL_SERVICE_TOKEN || !userId || !organizationId) return undefined;

  const actorKind =
    header(request, FORWARDED_AUTH_KIND_HEADER) === "platform" ? "platform" : "organization";
  const type = header(request, FORWARDED_AUTH_TYPE_HEADER);
  const platformRole = header(request, FORWARDED_AUTH_PLATFORM_ROLE_HEADER);
  const permissionHeader = header(request, FORWARDED_AUTH_PERMISSION_HEADER);
  const permission = permissionHeader === undefined ? undefined : Number(permissionHeader);
  const parsedModules = modules(request);

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
      modules: (parsedModules ??
        Object.fromEntries(
          MODULE_KEYS.map((key) => [key, 0]),
        )) as WorkerAuthContext["claims"]["modules"],
      modulePermissionsPresent: parsedModules !== undefined,
      ...(Number.isFinite(permission) ? { permission } : {}),
      ...(type === "owner" || type === "admin" || type === "user" ? { type } : {}),
      ...(platformRole === "super_admin" ? { platform_role: "super_admin" as const } : {}),
    },
  };
}

export async function authenticateClientRequest(
  request: Request,
  env: ClientWorkerEnv,
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

export function requireOrganization(auth: WorkerAuthContext): void {
  if (auth.actorKind !== "organization" || !auth.organizationId) {
    throw new ServiceError(403, "Organização não informada.");
  }
}

export function clientAuthorization(auth: WorkerAuthContext) {
  return {
    userId: auth.userId,
    level: auth.claims.modules.integracao,
    permission: auth.claims.permission,
    isOwner: auth.claims.type === "owner",
  };
}
