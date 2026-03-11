import { STATUS_CODES } from "node:http";

export interface ErrorResponseBody {
  success: false;
  error: string;
  code: string;
  requestId?: string;
}

export interface SerializedErrorResult {
  statusCode: number;
  body: ErrorResponseBody;
}

interface SerializeErrorOptions {
  requestId?: string;
  fallbackMessage: string;
}

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
        success: false,
        error: error.message,
        code: error.code,
        ...(requestId ? { requestId } : {}),
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      success: false,
      error: fallbackMessage,
      code: "INTERNAL_ERROR",
      ...(requestId ? { requestId } : {}),
    },
  };
}
