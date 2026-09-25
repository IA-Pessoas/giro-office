import { INTERNAL_ERROR_MESSAGE } from "@workspace/shared/http";

const STATUS_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  500: "INTERNAL_ERROR",
  503: "SERVICE_UNAVAILABLE",
};

export class OrganizationWorkerError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "OrganizationWorkerError";
    this.statusCode = statusCode;
    this.code = STATUS_CODES[statusCode] ?? `HTTP_${statusCode}_ERROR`;
  }
}

export function isOrganizationWorkerError(error: unknown): error is OrganizationWorkerError {
  return error instanceof OrganizationWorkerError;
}

export function errorResponse(error: unknown, requestId?: string): Response {
  const workerError = isOrganizationWorkerError(error)
    ? error
    : new OrganizationWorkerError(500, INTERNAL_ERROR_MESSAGE, error);
  const isServerError = workerError.statusCode >= 500;
  if (isServerError) {
    console.error(`[organization-service] erro ${workerError.statusCode}`, {
      requestId,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
  }

  return Response.json(
    {
      success: false,
      // 5xx nunca expõe o motivo interno; ele fica no log com o requestId (#1365).
      error: isServerError ? INTERNAL_ERROR_MESSAGE : workerError.message,
      code: workerError.code,
      ...(requestId ? { requestId } : {}),
    },
    { status: workerError.statusCode },
  );
}

export function successResponse<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data }, { status });
}
