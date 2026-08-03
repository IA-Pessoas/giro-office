const FALLBACK_MESSAGE = "Não foi possível concluir a ação.";
const TECHNICAL_AXIOS_MESSAGES = [
  /^request failed with status code \d{3}[.!]?$/i,
  /^network error[.!]?$/i,
  /^timeout of \d+ms exceeded[.!]?$/i,
  /^(canceled|cancelled)[.!]?$/i,
  /^(econnaborted|err_(network|canceled))[.!]?$/i,
];

type InventoryMutationError = {
  code?: unknown;
  isAxiosError?: unknown;
  message?: unknown;
  response?: {
    data?: {
      error?: unknown;
    };
  };
};

function isInventoryMutationError(error: unknown): error is InventoryMutationError {
  return typeof error === "object" && error !== null;
}

function isTransportError(error: InventoryMutationError): boolean {
  return (
    error.isAxiosError === true ||
    (typeof error.code === "string" && /^(ECONN|ERR_)/i.test(error.code))
  );
}

export function getTiInventoryMutationErrorMessage(error: unknown): string {
  if (
    isInventoryMutationError(error) &&
    error.response &&
    error.response.data &&
    typeof error.response.data.error === "string" &&
    error.response.data.error.trim()
  ) {
    return error.response.data.error.trim();
  }

  if (isInventoryMutationError(error) && isTransportError(error)) {
    return FALLBACK_MESSAGE;
  }

  if (isInventoryMutationError(error) && typeof error.message === "string") {
    const message = error.message.trim();

    if (message && !TECHNICAL_AXIOS_MESSAGES.some((pattern) => pattern.test(message))) {
      return message;
    }
  }

  return FALLBACK_MESSAGE;
}
