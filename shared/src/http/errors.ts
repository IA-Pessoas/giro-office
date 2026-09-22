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

const STATUS_METADATA = new Map<number, { code: string; message: string }>([
  [400, { code: "BAD_REQUEST", message: "Bad Request" }],
  [401, { code: "UNAUTHORIZED", message: "Unauthorized" }],
  [403, { code: "FORBIDDEN", message: "Forbidden" }],
  [404, { code: "NOT_FOUND", message: "Not Found" }],
  [409, { code: "CONFLICT", message: "Conflict" }],
  [422, { code: "UNPROCESSABLE_ENTITY", message: "Unprocessable Entity" }],
  [429, { code: "TOO_MANY_REQUESTS", message: "Too Many Requests" }],
  [500, { code: "INTERNAL_ERROR", message: "Internal Server Error" }],
  [502, { code: "BAD_GATEWAY", message: "Bad Gateway" }],
  [503, { code: "SERVICE_UNAVAILABLE", message: "Service Unavailable" }],
  [504, { code: "GATEWAY_TIMEOUT", message: "Gateway Timeout" }],
]);

function getErrorCodeForStatusCode(statusCode: number): string {
  return STATUS_METADATA.get(statusCode)?.code ?? `HTTP_${statusCode}_ERROR`;
}

function getDefaultMessageForStatusCode(statusCode: number): string {
  return STATUS_METADATA.get(statusCode)?.message ?? `HTTP ${statusCode} Error`;
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
