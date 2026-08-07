const STOCK_EXIT_CONFLICT_MESSAGE =
  "Não foi possível registrar a saída: o saldo disponível é insuficiente.";
const STOCK_EXIT_FORBIDDEN_MESSAGE = "Acesso negado para registrar a saída.";
const STOCK_EXIT_FALLBACK_MESSAGE = "Não foi possível registrar a saída.";
const TECHNICAL_HTTP_STATUS_MESSAGE = /^request failed with status code \d{3}[.!]?$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getResponseStatus(error: unknown): number | undefined {
  if (!isRecord(error) || !isRecord(error.response)) {
    return undefined;
  }

  return typeof error.response.status === "number" ? error.response.status : undefined;
}

function getDomainErrorMessage(error: unknown): string | undefined {
  if (!isRecord(error) || !isRecord(error.response) || !isRecord(error.response.data)) {
    return undefined;
  }

  const message = error.response.data.error;

  if (typeof message !== "string") {
    return undefined;
  }

  const normalizedMessage = message.trim();

  if (!normalizedMessage || TECHNICAL_HTTP_STATUS_MESSAGE.test(normalizedMessage)) {
    return undefined;
  }

  return normalizedMessage;
}

export function getTiStockMutationErrorMessage(error: unknown, fallback: string): string {
  const domainMessage = getDomainErrorMessage(error);

  if (domainMessage) {
    return domainMessage;
  }

  const status = getResponseStatus(error);

  if (status === 403) {
    return STOCK_EXIT_FORBIDDEN_MESSAGE;
  }

  if (status === 409) {
    return STOCK_EXIT_CONFLICT_MESSAGE;
  }

  return fallback.trim() || STOCK_EXIT_FALLBACK_MESSAGE;
}
