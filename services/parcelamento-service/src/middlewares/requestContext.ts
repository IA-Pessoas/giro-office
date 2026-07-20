import { randomUUID } from "node:crypto";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  REQUEST_ID_HEADER,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

export interface ParcelamentoRequestContext {
  requestId: string;
  userId?: string;
  organizationId?: string;
  permission?: string;
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const requestId = getHeaderValue(request.headers[REQUEST_ID_HEADER]) ?? randomUUID();
  const userId = getHeaderValue(request.headers[FORWARDED_AUTH_USER_ID_HEADER]);
  const organizationId = getHeaderValue(request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER]);
  const permission = getHeaderValue(request.headers[FORWARDED_AUTH_PERMISSION_HEADER]);

  request.parcelamentoContext = {
    requestId,
    ...(userId ? { userId } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(permission ? { permission } : {}),
  };
  response.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
