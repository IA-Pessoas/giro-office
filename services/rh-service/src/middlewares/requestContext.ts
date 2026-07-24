import { randomUUID } from "node:crypto";

import { FORWARDED_AUTH_PERMISSION_HEADER } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

function getSingleHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePermissionHeader(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const requestId = String(request.headers["x-request-id"] ?? randomUUID());
  const permissionHeader = getSingleHeaderValue(
    request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | string[] | undefined,
  );

  request.requestId = requestId;
  request.rh_permission = parsePermissionHeader(permissionHeader);
  response.setHeader("x-request-id", requestId);

  next();
}
