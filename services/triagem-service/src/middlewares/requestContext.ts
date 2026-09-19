import { randomUUID } from "node:crypto";

import {
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  REQUEST_ID_HEADER,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

export interface TriagemRequestContext {
  requestId: string;
  userId?: string;
  organizationId?: string;
  permission?: number;
  modules?: Record<string, number>;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const requestId = firstHeader(request.headers[REQUEST_ID_HEADER]) ?? randomUUID();
  const permissionHeader = firstHeader(request.headers[FORWARDED_AUTH_PERMISSION_HEADER]);
  const permission = permissionHeader === undefined ? undefined : Number(permissionHeader);
  const modulesHeader = firstHeader(request.headers[FORWARDED_AUTH_MODULES_HEADER]);
  let modules: Record<string, number> | undefined;

  if (modulesHeader) {
    try {
      const parsed: unknown = JSON.parse(modulesHeader);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        modules = parsed as Record<string, number>;
      }
    } catch {
      modules = undefined;
    }
  }

  request.triagemContext = {
    requestId,
    userId: firstHeader(request.headers[FORWARDED_AUTH_USER_ID_HEADER]),
    organizationId: firstHeader(request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER]),
    ...(typeof permission === "number" && Number.isFinite(permission) ? { permission } : {}),
    ...(modules ? { modules } : {}),
  };
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
