import { randomUUID } from "node:crypto";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  REQUEST_ID_HEADER,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function requestContext(request: Request, response: Response, next: NextFunction): void {
  request.requestId = getHeaderValue(request.headers[REQUEST_ID_HEADER]) ?? randomUUID();
  request.user_id = getHeaderValue(request.headers[FORWARDED_AUTH_USER_ID_HEADER]) ?? "";
  request.organization_id =
    getHeaderValue(request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER]) ?? "";
  const permission = Number(getHeaderValue(request.headers[FORWARDED_AUTH_PERMISSION_HEADER]));
  request.permission = Number.isInteger(permission) ? permission : undefined;
  response.setHeader(REQUEST_ID_HEADER, request.requestId);
  next();
}
