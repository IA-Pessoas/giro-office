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
import type { FiscalWorkerEnv } from "./env.js";

const FISCAL_WRITE_PERMISSION = 2;
const FISCAL_ADMIN_PERMISSION = 3;
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

function forwardedAuth(request: Request, env: FiscalWorkerEnv): WorkerAuthContext | undefined {
  const internalToken = header(request, INTERNAL_SERVICE_TOKEN_HEADER);
  const userId = header(request, FORWARDED_AUTH_USER_ID_HEADER);
  const organizationId = header(request, FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  if (internalToken !== env.INTERNAL_SERVICE_TOKEN || !userId || !organizationId) return undefined;

  let source: Record<string, unknown> = {};
  const modulesHeader = header(request, FORWARDED_AUTH_MODULES_HEADER);
  if (modulesHeader) {
    try {
      const parsed: unknown = JSON.parse(modulesHeader);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        source = parsed as Record<string, unknown>;
      }
    } catch {
      source = {};
    }
  }

  const modules = Object.fromEntries(
    MODULE_KEYS.map((key) => [key, typeof source[key] === "number" ? source[key] : 0]),
  ) as WorkerAuthContext["claims"]["modules"];
  const permissionHeader = header(request, FORWARDED_AUTH_PERMISSION_HEADER);
  const permission = permissionHeader === undefined ? undefined : Number(permissionHeader);
  const actorKind =
    header(request, FORWARDED_AUTH_KIND_HEADER) === "platform" ? "platform" : "organization";
  const platformRole = header(request, FORWARDED_AUTH_PLATFORM_ROLE_HEADER);
  const type = header(request, FORWARDED_AUTH_TYPE_HEADER);

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
      modules,
      modulePermissionsPresent: modulesHeader !== undefined,
      ...(Number.isFinite(permission) ? { permission } : {}),
      ...(platformRole === "super_admin" ? { platform_role: "super_admin" as const } : {}),
      ...(type === "owner" || type === "admin" || type === "user" ? { type } : {}),
    },
  };
}

export async function authenticateFiscalRequest(
  request: Request,
  env: FiscalWorkerEnv,
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

export function authorizeFiscalRequest(request: Request, auth: WorkerAuthContext): void {
  if (request.method === "GET") return;

  const required = request.method === "DELETE" ? FISCAL_ADMIN_PERMISSION : FISCAL_WRITE_PERMISSION;
  if (Number(auth.claims.permission ?? 0) < required) {
    const message =
      request.method === "DELETE"
        ? "Permissao insuficiente para excluir dados fiscais."
        : "Permissao insuficiente para alterar dados fiscais.";
    throw new ServiceError(403, message);
  }
}
