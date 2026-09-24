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
import type { TriagemWorkerEnv } from "./env.js";

const FORWARDED_TOKEN = "forwarded-by-gateway";

function value(request: Request, name: string): string | undefined {
  const header = request.headers.get(name);
  return header && header.length > 0 ? header : undefined;
}

function forwardedAuth(request: Request, env: TriagemWorkerEnv): WorkerAuthContext | undefined {
  if (value(request, INTERNAL_SERVICE_TOKEN_HEADER) !== env.INTERNAL_SERVICE_TOKEN)
    return undefined;
  const userId = value(request, FORWARDED_AUTH_USER_ID_HEADER);
  const organizationId = value(request, FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  if (!userId || !organizationId) return undefined;
  const modulesHeader = value(request, FORWARDED_AUTH_MODULES_HEADER);
  let modules: unknown;
  if (modulesHeader) {
    try {
      const parsed: unknown = JSON.parse(modulesHeader);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) modules = parsed;
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
    token: FORWARDED_TOKEN,
    userId,
    organizationId,
    actorKind,
    isPlatformAdmin: actorKind === "platform" && platformRole === "super_admin",
    claims: {
      user_id: userId,
      organization_id: organizationId,
      auth_kind: actorKind,
      modules: normalizeModulePermissions(modules) as WorkerAuthContext["claims"]["modules"],
      modulePermissionsPresent: modules !== undefined,
      ...(Number.isFinite(permission) ? { permission } : {}),
      ...(platformRole === "super_admin" ? { platform_role: "super_admin" as const } : {}),
      ...(type === "owner" || type === "admin" || type === "user" ? { type } : {}),
    },
  };
}

// Paridade com o isAuthenticated do Node: aceita só auth encaminhada pelo gateway ou Bearer.
// Cookie de sessão é ignorado, porque o serviço Node não aceita cookie nem valida CSRF.
export async function authenticateTriagemRequest(
  request: Request,
  env: TriagemWorkerEnv,
): Promise<WorkerAuthContext> {
  const forwarded = forwardedAuth(request, env);
  if (forwarded) return forwarded;
  const authorization = value(request, "authorization");
  if (!authorization) throw new ServiceError(401, "Token de autenticação não informado.");
  try {
    return await authenticateWorkerRequest(
      new Request(request.url, { headers: { authorization } }),
      { jwtSecret: env.JWT_SECRET, allowBearer: true },
    );
  } catch (error) {
    if (error instanceof WorkerAuthenticationError) throw new ServiceError(401, "Não autenticado.");
    throw error;
  }
}

// Contexto no formato dos services Node. Sem cabeçalho de módulos encaminhado, `modules`
// fica ausente e o service cai para a permissão global, como no requestContext do Node.
export function triagemAuthContext(auth: WorkerAuthContext) {
  const forwardedWithoutModules =
    auth.token === FORWARDED_TOKEN && !auth.claims.modulePermissionsPresent;
  return {
    userId: auth.userId,
    organizationId: auth.organizationId,
    permission: auth.claims.permission,
    modules: forwardedWithoutModules ? undefined : (auth.claims.modules as Record<string, number>),
  };
}
