import { ServiceError } from "./errors.js";

const DEFAULT_AUTH_CONTEXT_MESSAGE =
  "Usu\u00e1rio ou organiza\u00e7\u00e3o n\u00e3o identificados.";

export interface AuthenticatedRequestContextSource {
  user_id?: unknown;
  organization_id?: unknown;
  permission?: unknown;
}

export interface AuthenticatedRequestContext {
  user_id: string;
  organization_id: string;
  permission?: number;
}

export interface RequireAuthenticatedRequestContextOptions {
  statusCode?: number;
  userIdMessage?: string;
  organizationIdMessage?: string;
}

export function requireAuthenticatedRequestContext(
  source: AuthenticatedRequestContextSource,
  options: RequireAuthenticatedRequestContextOptions = {},
): AuthenticatedRequestContext {
  const {
    statusCode = 401,
    userIdMessage = DEFAULT_AUTH_CONTEXT_MESSAGE,
    organizationIdMessage = DEFAULT_AUTH_CONTEXT_MESSAGE,
  } = options;

  if (typeof source.user_id !== "string" || source.user_id.length === 0) {
    throw new ServiceError(statusCode, userIdMessage);
  }

  if (typeof source.organization_id !== "string" || source.organization_id.length === 0) {
    throw new ServiceError(statusCode, organizationIdMessage);
  }

  return {
    user_id: source.user_id,
    organization_id: source.organization_id,
    permission: typeof source.permission === "number" ? source.permission : undefined,
  };
}
