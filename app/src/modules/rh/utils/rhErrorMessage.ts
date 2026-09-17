const TECHNICAL_HTTP_STATUS_MESSAGE = /^request failed with status code \d{3}[.!]?$/i;

interface ErrorResponseData {
  error?: unknown;
  message?: unknown;
}

function getResponseStatus(error: unknown): number | null {
  if (error === null || typeof error !== "object" || !("response" in error)) {
    return null;
  }

  const status = (error as { response?: { status?: unknown } }).response?.status;
  return typeof status === "number" ? status : null;
}

function getResponseMessage(error: unknown): string {
  if (error === null || typeof error !== "object" || !("response" in error)) {
    return "";
  }

  const response = (error as { response?: { data?: ErrorResponseData } }).response;
  const responseMessage = response?.data?.error ?? response?.data?.message;

  return typeof responseMessage === "string" ? responseMessage.trim() : "";
}

export function getRhErrorMessage(error: unknown, fallback: string): string {
  const responseStatus = getResponseStatus(error);
  if (responseStatus !== null && responseStatus >= 500) {
    return fallback;
  }

  const responseMessage = getResponseMessage(error);
  if (responseMessage) {
    return responseMessage;
  }

  const message = error instanceof Error ? error.message.trim() : "";
  return message && !TECHNICAL_HTTP_STATUS_MESSAGE.test(message) ? message : fallback;
}
