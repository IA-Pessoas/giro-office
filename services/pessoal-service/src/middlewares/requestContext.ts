import { randomUUID } from "node:crypto";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  REQUEST_ID_HEADER,
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

export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const requestId = getHeaderValue(request.headers[REQUEST_ID_HEADER]) ?? randomUUID();

  request.requestId = requestId;
  request.user_id = getHeaderValue(request.headers[FORWARDED_AUTH_USER_ID_HEADER]) ?? "";
  request.organization_id =
    getHeaderValue(request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER]) ?? "";
  request.permission = parsePermission(
    getHeaderValue(request.headers[FORWARDED_AUTH_PERMISSION_HEADER]),
  );
  response.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
