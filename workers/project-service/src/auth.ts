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
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared/http";
import type { ProjectWorkerEnv } from "./env.js";

function forwarded(request: Request, env: ProjectWorkerEnv): WorkerAuthContext | undefined {
  if (request.headers.get(INTERNAL_SERVICE_TOKEN_HEADER) !== env.INTERNAL_SERVICE_TOKEN)
    return undefined;
  const userId = request.headers.get(FORWARDED_AUTH_USER_ID_HEADER);
  const organizationId = request.headers.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  if (!userId || !organizationId) return undefined;
  const modulesHeader = request.headers.get(FORWARDED_AUTH_MODULES_HEADER);
  let modules: unknown;
  try {
    modules = modulesHeader ? JSON.parse(modulesHeader) : undefined;
  } catch {
    modules = undefined;
  }
  const permission = Number(request.headers.get(FORWARDED_AUTH_PERMISSION_HEADER));
  const actorKind =
    request.headers.get(FORWARDED_AUTH_KIND_HEADER) === "platform" ? "platform" : "organization";
  const type = request.headers.get(FORWARDED_AUTH_TYPE_HEADER);
  return {
    token: "forwarded-by-gateway",
    userId,
    organizationId,
    actorKind,
    isPlatformAdmin: actorKind === "platform",
    claims: {
      user_id: userId,
      organization_id: organizationId,
      auth_kind: actorKind,
      modules: normalizeModulePermissions(modules) as WorkerAuthContext["claims"]["modules"],
      modulePermissionsPresent: modulesHeader !== null,
      ...(Number.isFinite(permission) ? { permission } : {}),
      ...(type === "owner" || type === "admin" || type === "user" ? { type } : {}),
    },
  };
}

export async function authenticateProjectRequest(request: Request, env: ProjectWorkerEnv) {
  const context = forwarded(request, env);
  if (context) return context;
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
