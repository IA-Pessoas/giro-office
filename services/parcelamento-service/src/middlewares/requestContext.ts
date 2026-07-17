import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

const REQUEST_ID_HEADER = "x-request-id";
const USER_ID_HEADER = "x-user-id";
const ORGANIZATION_ID_HEADER = "x-organization-id";
const PERMISSION_HEADER = "x-permission";

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
  const userId = getHeaderValue(request.headers[USER_ID_HEADER]);
  const organizationId = getHeaderValue(request.headers[ORGANIZATION_ID_HEADER]);
  const permission = getHeaderValue(request.headers[PERMISSION_HEADER]);

  request.parcelamentoContext = {
    requestId,
    ...(userId ? { userId } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(permission ? { permission } : {}),
  };
  response.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
