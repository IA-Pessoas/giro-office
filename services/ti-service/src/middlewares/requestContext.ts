import { randomUUID } from "node:crypto";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parsePermission(value: string | undefined): number | undefined {
  const normalized = value?.trim();
  if (normalized === undefined || normalized === "") {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseUserType(value: string | undefined): "owner" | "admin" | "user" | undefined {
  return value === "owner" || value === "admin" || value === "user" ? value : undefined;
}

export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const requestId = getHeaderValue(request.headers[REQUEST_ID_HEADER]) ?? randomUUID();
  const userId = getHeaderValue(request.headers[FORWARDED_AUTH_USER_ID_HEADER]);
  const organizationId = getHeaderValue(request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER]);

  request.requestId = requestId;
  request.user_id = userId ?? "";
  request.organization_id = organizationId ?? "";
  request.permission = parsePermission(
    getHeaderValue(request.headers[FORWARDED_AUTH_PERMISSION_HEADER]),
  );
  request.user_type = parseUserType(getHeaderValue(request.headers[FORWARDED_AUTH_TYPE_HEADER]));
  response.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}

export function createForwardedAuthContextMiddleware(internalServiceToken: string) {
  return function forwardedAuthContext(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): void {
    const token = getHeaderValue(request.headers[INTERNAL_SERVICE_TOKEN_HEADER]);

    if (token !== internalServiceToken) {
      next(new ServiceError(401, "Token interno do ti-service invalido."));
      return;
    }

    next();
  };
}
