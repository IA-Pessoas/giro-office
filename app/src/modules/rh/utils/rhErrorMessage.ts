const TECHNICAL_HTTP_STATUS_MESSAGE = /^request failed with status code \d{3}[.!]?$/i;

interface ErrorResponseData {
  error?: unknown;
  message?: unknown;
}

function getResponseMessage(error: unknown): string {
  if (error === null || typeof error !== "object" || !("response" in error)) {
    return "";
  }

  const response = (
    error as { response?: { status?: unknown; data?: ErrorResponseData } }
  ).response;
  const status = response?.status;
  if (typeof status === "number" && status >= 500) {
    return "";
  }

  const responseMessage = response?.data?.error ?? response?.data?.message;

  return typeof responseMessage === "string" ? responseMessage.trim() : "";
}

export function getRhErrorMessage(error: unknown, fallback: string): string {
  const responseMessage = getResponseMessage(error);
  if (responseMessage) {
    return responseMessage;
  }

  const message = error instanceof Error ? error.message.trim() : "";
  return message && !TECHNICAL_HTTP_STATUS_MESSAGE.test(message) ? message : fallback;
}
