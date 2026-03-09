import { STATUS_CODES } from "node:http";
import type { ErrorRequestHandler, Request } from "express";

import type { Logger } from "./logger.js";

interface SerializedErrorBody {
  error: string;
  code: string;
  requestId?: string;
}

interface SerializedErrorResult {
  statusCode: number;
  body: SerializedErrorBody;
}

interface SerializeErrorOptions {
  requestId?: string;
  fallbackMessage: string;
}

interface CreateExpressErrorHandlerOptions {
  logger: Logger;
  event: string;
  fallbackMessage: string;
  getContext?: (request: Request) => Record<string, unknown> | undefined;
}

type RequestWithLogger = Request & {
  log?: Logger;
  requestId?: string;
};

const ERROR_CODE_BY_STATUS = new Map<number, string>([
  [400, "BAD_REQUEST"],
  [401, "UNAUTHORIZED"],
  [403, "FORBIDDEN"],
  [404, "NOT_FOUND"],
  [409, "CONFLICT"],
  [422, "UNPROCESSABLE_ENTITY"],
  [429, "TOO_MANY_REQUESTS"],
  [500, "INTERNAL_ERROR"],
  [502, "BAD_GATEWAY"],
  [503, "SERVICE_UNAVAILABLE"],
  [504, "GATEWAY_TIMEOUT"],
]);

function getErrorCodeForStatusCode(statusCode: number): string {
  const explicitCode = ERROR_CODE_BY_STATUS.get(statusCode);
  if (explicitCode) {
    return explicitCode;
  }

  const statusText = STATUS_CODES[statusCode];
  if (!statusText) {
    return `HTTP_${statusCode}_ERROR`;
  }

  return statusText
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getDefaultMessageForStatusCode(statusCode: number): string {
  return STATUS_CODES[statusCode] ?? `HTTP ${statusCode} Error`;
}

export class ServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, message?: string, cause?: unknown) {
    if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
      throw new RangeError("ServiceError statusCode must be an integer between 400 and 599.");
    }

    const normalizedMessage = message?.trim() || getDefaultMessageForStatusCode(statusCode);
    super(normalizedMessage, cause === undefined ? undefined : { cause });

    this.name = "ServiceError";
    this.statusCode = statusCode;
    this.code = getErrorCodeForStatusCode(statusCode);

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

export function serializeError(
  error: unknown,
  { requestId, fallbackMessage }: SerializeErrorOptions,
): SerializedErrorResult {
  if (isServiceError(error)) {
    return {
      statusCode: error.statusCode,
      body: {
        error: error.message,
        code: error.code,
        ...(requestId ? { requestId } : {}),
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      error: fallbackMessage,
      code: "INTERNAL_ERROR",
      ...(requestId ? { requestId } : {}),
    },
  };
}

export function createExpressErrorHandler({
  logger,
  event,
  fallbackMessage,
  getContext,
}: CreateExpressErrorHandlerOptions): ErrorRequestHandler {
  return function expressErrorHandler(error, request, response, next) {
    if (response.headersSent) {
      next(error);
      return;
    }

    const requestWithLogger = request as RequestWithLogger;
    const requestLogger = requestWithLogger.log ?? logger;
    const serialized = serializeError(error, {
      requestId: requestWithLogger.requestId,
      fallbackMessage,
    });

    requestLogger.error({
      event,
      message: serialized.body.error,
      ...getContext?.(request),
      err: error,
    });

    response.status(serialized.statusCode).json(serialized.body);
  };
}
