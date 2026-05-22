import { randomUUID } from "node:crypto";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

export interface CertificatePermission {
  certificado?: number;
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parseCertificatePermission(value: string | undefined): CertificatePermission | undefined {
  const normalized = value?.trim();
  if (normalized === undefined || normalized === "") {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(normalized);
    if (typeof parsed === "number" && Number.isInteger(parsed)) {
      return { certificado: parsed };
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const certificado = (parsed as Record<string, unknown>).certificado;
      return typeof certificado === "number" && Number.isInteger(certificado)
        ? { certificado }
        : undefined;
    }
  } catch {
    const certificado = Number(normalized);
    if (Number.isInteger(certificado)) {
      return { certificado };
    }
  }

  return undefined;
}

export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const requestId = getHeaderValue(request.headers[REQUEST_ID_HEADER]) ?? randomUUID();
  const userId = getHeaderValue(request.headers[FORWARDED_AUTH_USER_ID_HEADER]);
  const organizationId = getHeaderValue(request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER]);

  request.requestId = requestId;
  request.user_id = userId ?? "";
  request.organization_id = organizationId ?? "";
  request.permission = parseCertificatePermission(
    getHeaderValue(request.headers[FORWARDED_AUTH_PERMISSION_HEADER]),
  );
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
      next(new ServiceError(401, "Token interno do certificate-service invalido."));
      return;
    }

    next();
  };
}
