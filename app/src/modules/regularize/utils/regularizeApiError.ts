export function getRegularizeRequestId(error: unknown): string | undefined {
  if (error === null || typeof error !== "object" || !("response" in error)) {
    return undefined;
  }

  const response = (error as { response?: { data?: unknown } }).response;
  const data = response?.data;

  if (data === null || typeof data !== "object" || !("requestId" in data)) {
    return undefined;
  }

  const requestId = (data as { requestId?: unknown }).requestId;
  return typeof requestId === "string" && requestId.length > 0 ? requestId : undefined;
}
