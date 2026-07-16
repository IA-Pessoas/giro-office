import {
  extractBearerToken,
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_SUPPORT_MODE_HEADER,
  FORWARDED_AUTH_SUPPORT_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_SUPPORT_SESSION_ID_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  ServiceError,
  verifyJwtToken,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

type JwtClaims = {
  user_id: string;
  organization_id?: string;
  permission?: number;
  type?: "owner" | "admin" | "user";
  auth_kind?: "organization" | "platform";
  platform_role?: "super_admin";
  support_mode?: boolean;
  support_session_id?: string;
  support_organization_id?: string;
  modules?: Record<string, number | null>;
};

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeUserType(value: string | undefined): "owner" | "admin" | "user" | undefined {
  return value === "owner" || value === "admin" || value === "user" ? value : undefined;
}

function parseForwardedModules(
  value: string | undefined,
): Record<string, number | null> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const modules: Record<string, number | null> = {};
    for (const [key, permission] of Object.entries(parsed)) {
      if (typeof permission === "number" || permission === null) {
        modules[key] = permission;
      }
    }

    return modules;
  } catch {
    return undefined;
  }
}

function isValidClaims(claims: unknown): claims is JwtClaims {
  if (!claims || typeof claims !== "object") {
    return false;
  }

  const value = claims as Record<string, unknown>;

  if (typeof value.user_id !== "string" || value.user_id.length === 0) {
    return false;
  }

  if (value.organization_id !== undefined && typeof value.organization_id !== "string") {
    return false;
  }

  return true;
}

function applyForwardedAuth(request: Request): boolean {
  const forwardedUserId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
  const forwardedOrgId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  const forwardedPermission = request.get(FORWARDED_AUTH_PERMISSION_HEADER);
  const forwardedAuthKind = normalizeHeaderValue(request.get(FORWARDED_AUTH_KIND_HEADER));
  const forwardedPlatformRole = normalizeHeaderValue(
    request.get(FORWARDED_AUTH_PLATFORM_ROLE_HEADER),
  );
  const forwardedSupportMode = normalizeHeaderValue(
    request.get(FORWARDED_AUTH_SUPPORT_MODE_HEADER),
  );
  const forwardedSupportSessionId = normalizeHeaderValue(
    request.get(FORWARDED_AUTH_SUPPORT_SESSION_ID_HEADER),
  );
  const forwardedSupportOrganizationId = normalizeHeaderValue(
    request.get(FORWARDED_AUTH_SUPPORT_ORGANIZATION_ID_HEADER),
  );
  const forwardedType = normalizeHeaderValue(request.get(FORWARDED_AUTH_TYPE_HEADER));
  const forwardedModules = normalizeHeaderValue(request.get(FORWARDED_AUTH_MODULES_HEADER));
  const internalToken = request.get(INTERNAL_SERVICE_TOKEN_HEADER);
  const auditServiceToken = process.env.AUDIT_SERVICE_TOKEN ?? "audit-service-token";

  if (!internalToken || internalToken !== auditServiceToken || !forwardedUserId) {
    return false;
  }

  const isPlatformForwarded =
    forwardedAuthKind === "platform" && forwardedPlatformRole === "super_admin";

  const isOrganizationForwarded = forwardedOrgId !== undefined;

  if (!isPlatformForwarded && !isOrganizationForwarded) {
    return false;
  }

  request.user_id = forwardedUserId;
  request.organization_id = forwardedOrgId ?? forwardedSupportOrganizationId ?? "";
  const parsedPermission =
    forwardedPermission !== undefined ? Number.parseInt(forwardedPermission, 10) : Number.NaN;
  request.permission = Number.isNaN(parsedPermission) ? undefined : parsedPermission;
  request.auth_kind = forwardedAuthKind === "platform" ? "platform" : "organization";
  request.platform_role = forwardedPlatformRole === "super_admin" ? "super_admin" : undefined;
  request.support_mode = forwardedSupportMode === "true";
  request.support_session_id = forwardedSupportSessionId;
  request.support_organization_id = forwardedSupportOrganizationId;
  request.user_type = normalizeUserType(forwardedType);
  request.modules = parseForwardedModules(forwardedModules);

  return true;
}

export async function isAuthenticated(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  if (applyForwardedAuth(request)) {
    next();
    return;
  }

  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader) {
    next(new ServiceError(401, "Token de autenticacao nao informado."));
    return;
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET is not defined in environment variables");
    }

    const token = extractBearerToken(authorizationHeader);
    const claims = verifyJwtToken(token, jwtSecret);

    if (!isValidClaims(claims)) {
      next(new ServiceError(401, "Token invalido."));
      return;
    }

    const headerUserId = normalizeHeaderValue(request.headers.user_id);
    const headerOrganizationId = normalizeHeaderValue(request.headers.organization_id);

    if (headerUserId && headerUserId !== claims.user_id) {
      next(new ServiceError(400, "Cabecalho user_id nao corresponde ao token."));
      return;
    }

    if (headerOrganizationId && headerOrganizationId !== claims.organization_id) {
      next(new ServiceError(400, "Cabecalho organization_id nao corresponde ao token."));
      return;
    }

    request.user_id = claims.user_id;
    request.organization_id = claims.organization_id ?? "";
    request.permission = claims.permission;
    request.user_type = normalizeUserType(claims.type);
    request.modules = claims.modules;
    request.auth_kind = claims.auth_kind === "platform" ? "platform" : "organization";
    request.platform_role = claims.platform_role === "super_admin" ? "super_admin" : undefined;
    request.support_mode = claims.support_mode === true;
    request.support_session_id = claims.support_session_id;
    request.support_organization_id = claims.support_organization_id;

    // CNPJ verification (disabled - not currently used on routes)
    // const { cnpj } = request.params;
    // if (cnpj) {
    //   const organizationId = request.organization_id;
    //   if (!organizationId) {
    //     response.status(403).json({ error: "Acesso à organização não autorizado." });
    //     return;
    //   }
    //
    //   const organization = await prismaClient.organization.findFirst({
    //     where: { cnpj },
    //     select: { id: true },
    //   });
    //
    //   if (!organization) {
    //     response.status(404).json({ error: "Organização não encontrada." });
    //     return;
    //   }
    //
    //   if (organization.id !== organizationId) {
    //     response.status(403).json({ error: "Acesso à organização não autorizado." });
    //     return;
    //   }
    // }

    next();
  } catch (err) {
    logError("Erro ao validar autenticacao", { err });
    next(new ServiceError(401, "Nao autenticado."));
  }
}
