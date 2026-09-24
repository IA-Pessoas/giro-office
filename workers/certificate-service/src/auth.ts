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
import type { CertificateWorkerEnv } from "./env.js";

const CERTIFICATE_READ_PERMISSION = 1;
const CERTIFICATE_WRITE_PERMISSION = 2;
const CERTIFICATE_DELETE_PERMISSION = 3;
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

function forwardedAuth(request: Request, env: CertificateWorkerEnv): WorkerAuthContext | undefined {
  if (
    header(request, INTERNAL_SERVICE_TOKEN_HEADER) !== env.INTERNAL_SERVICE_TOKEN ||
    !header(request, FORWARDED_AUTH_USER_ID_HEADER) ||
    !header(request, FORWARDED_AUTH_ORGANIZATION_ID_HEADER)
  ) {
    return undefined;
  }

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
    userId: header(request, FORWARDED_AUTH_USER_ID_HEADER) as string,
    organizationId: header(request, FORWARDED_AUTH_ORGANIZATION_ID_HEADER) as string,
    actorKind,
    isPlatformAdmin: actorKind === "platform" && platformRole === "super_admin",
    claims: {
      user_id: header(request, FORWARDED_AUTH_USER_ID_HEADER) as string,
      organization_id: header(request, FORWARDED_AUTH_ORGANIZATION_ID_HEADER) as string,
      auth_kind: actorKind,
      modules,
      modulePermissionsPresent: modulesHeader !== undefined,
      ...(Number.isFinite(permission) ? { permission } : {}),
      ...(platformRole === "super_admin" ? { platform_role: "super_admin" as const } : {}),
      ...(type === "owner" || type === "admin" || type === "user" ? { type } : {}),
    },
  };
}

export async function authenticateCertificateRequest(
  request: Request,
  env: CertificateWorkerEnv,
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

export function authorizeCertificateRequest(request: Request, auth: WorkerAuthContext): void {
  if (!auth.organizationId) throw new ServiceError(401, "Organização não informada.");

  const permission = Number(auth.claims.permission ?? auth.claims.modules.certificado ?? 0);
  const required =
    request.method === "GET"
      ? CERTIFICATE_READ_PERMISSION
      : request.method === "DELETE"
        ? CERTIFICATE_DELETE_PERMISSION
        : CERTIFICATE_WRITE_PERMISSION;

  if (permission < required) {
    throw new ServiceError(403, "Permissao insuficiente para acessar certificados.");
  }
}

export function certificatePermission(auth: WorkerAuthContext): number {
  return Number(auth.claims.permission ?? auth.claims.modules.certificado ?? 0);
}
