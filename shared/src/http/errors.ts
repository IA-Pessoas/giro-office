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
  [402, { code: "PAYMENT_REQUIRED", message: "Payment Required" }],
  [403, { code: "FORBIDDEN", message: "Forbidden" }],
  [404, { code: "NOT_FOUND", message: "Not Found" }],
  [405, { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" }],
  [406, { code: "NOT_ACCEPTABLE", message: "Not Acceptable" }],
  [407, { code: "PROXY_AUTHENTICATION_REQUIRED", message: "Proxy Authentication Required" }],
  [408, { code: "REQUEST_TIMEOUT", message: "Request Timeout" }],
  [409, { code: "CONFLICT", message: "Conflict" }],
  [410, { code: "GONE", message: "Gone" }],
  [411, { code: "LENGTH_REQUIRED", message: "Length Required" }],
  [412, { code: "PRECONDITION_FAILED", message: "Precondition Failed" }],
  [413, { code: "PAYLOAD_TOO_LARGE", message: "Payload Too Large" }],
  [414, { code: "URI_TOO_LONG", message: "URI Too Long" }],
  [415, { code: "UNSUPPORTED_MEDIA_TYPE", message: "Unsupported Media Type" }],
  [416, { code: "RANGE_NOT_SATISFIABLE", message: "Range Not Satisfiable" }],
  [417, { code: "EXPECTATION_FAILED", message: "Expectation Failed" }],
  [418, { code: "I_M_A_TEAPOT", message: "I'm a Teapot" }],
  [421, { code: "MISDIRECTED_REQUEST", message: "Misdirected Request" }],
  [422, { code: "UNPROCESSABLE_ENTITY", message: "Unprocessable Entity" }],
  [423, { code: "LOCKED", message: "Locked" }],
  [424, { code: "FAILED_DEPENDENCY", message: "Failed Dependency" }],
  [425, { code: "TOO_EARLY", message: "Too Early" }],
  [426, { code: "UPGRADE_REQUIRED", message: "Upgrade Required" }],
  [428, { code: "PRECONDITION_REQUIRED", message: "Precondition Required" }],
  [429, { code: "TOO_MANY_REQUESTS", message: "Too Many Requests" }],
  [
    431,
    {
      code: "REQUEST_HEADER_FIELDS_TOO_LARGE",
      message: "Request Header Fields Too Large",
    },
  ],
  [451, { code: "UNAVAILABLE_FOR_LEGAL_REASONS", message: "Unavailable For Legal Reasons" }],
  [500, { code: "INTERNAL_ERROR", message: "Internal Server Error" }],
  [501, { code: "NOT_IMPLEMENTED", message: "Not Implemented" }],
  [502, { code: "BAD_GATEWAY", message: "Bad Gateway" }],
  [503, { code: "SERVICE_UNAVAILABLE", message: "Service Unavailable" }],
  [504, { code: "GATEWAY_TIMEOUT", message: "Gateway Timeout" }],
  [505, { code: "HTTP_VERSION_NOT_SUPPORTED", message: "HTTP Version Not Supported" }],
  [506, { code: "VARIANT_ALSO_NEGOTIATES", message: "Variant Also Negotiates" }],
  [507, { code: "INSUFFICIENT_STORAGE", message: "Insufficient Storage" }],
  [508, { code: "LOOP_DETECTED", message: "Loop Detected" }],
  [509, { code: "BANDWIDTH_LIMIT_EXCEEDED", message: "Bandwidth Limit Exceeded" }],
  [510, { code: "NOT_EXTENDED", message: "Not Extended" }],
  [511, { code: "NETWORK_AUTHENTICATION_REQUIRED", message: "Network Authentication Required" }],
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
