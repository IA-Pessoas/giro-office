import {
  AUTH_SESSION_COOKIE_NAME,
  authenticateWorkerRequest,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  readCookie,
  verifyCsrfToken,
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
import type { GatewayWorkerEnv } from "./env.js";

export async function authenticateGatewayRequest(
  request: Request,
  env: GatewayWorkerEnv,
): Promise<WorkerAuthContext> {
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

export async function requireCsrfForMutation(
  request: Request,
  auth: WorkerAuthContext,
): Promise<void> {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const cookies = request.headers.get("cookie") ?? undefined;
  const session = readCookie(cookies, AUTH_SESSION_COOKIE_NAME);
  if (!session) return;
  const token = request.headers.get(CSRF_HEADER_NAME) ?? readCookie(cookies, CSRF_COOKIE_NAME);
  if (!token || !auth.claims.csrf_hash || !(await verifyCsrfToken(token, auth.claims.csrf_hash))) {
    throw new ServiceError(403, "Token CSRF inválido.");
  }
}

export function forwardIdentity(headers: Headers, auth: WorkerAuthContext, env: GatewayWorkerEnv) {
  headers.set(INTERNAL_SERVICE_TOKEN_HEADER, env.INTERNAL_SERVICE_TOKEN);
  headers.set(FORWARDED_AUTH_USER_ID_HEADER, auth.userId);
  headers.set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, auth.organizationId);
  headers.set(FORWARDED_AUTH_KIND_HEADER, auth.actorKind);
  headers.set(FORWARDED_AUTH_MODULES_HEADER, JSON.stringify(auth.claims.modules));
  if (auth.claims.permission !== undefined) {
    headers.set(FORWARDED_AUTH_PERMISSION_HEADER, String(auth.claims.permission));
  }
  if (auth.claims.platform_role) {
    headers.set(FORWARDED_AUTH_PLATFORM_ROLE_HEADER, auth.claims.platform_role);
  }
  if (auth.claims.type) headers.set(FORWARDED_AUTH_TYPE_HEADER, auth.claims.type);
}
