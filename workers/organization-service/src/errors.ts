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
    : new OrganizationWorkerError(500, "Erro interno no organization-service.");

  return Response.json(
    {
      success: false,
      error: workerError.message,
      code: workerError.code,
      ...(requestId ? { requestId } : {}),
    },
    { status: workerError.statusCode },
  );
}

export function successResponse<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data }, { status });
}
