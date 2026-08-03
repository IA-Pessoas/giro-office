const FALLBACK_MESSAGE = "Não foi possível concluir a ação.";
const TECHNICAL_AXIOS_MESSAGES = [
  /^request failed with status code \d{3}[.!]?$/i,
  /^network error[.!]?$/i,
  /^timeout of \d+ms exceeded[.!]?$/i,
  /^(canceled|cancelled)[.!]?$/i,
  /^(econnaborted|err_(network|canceled))[.!]?$/i,
];

type InventoryMutationError = {
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

  if (isInventoryMutationError(error) && typeof error.message === "string") {
    const message = error.message.trim();

    if (message && !TECHNICAL_AXIOS_MESSAGES.some((pattern) => pattern.test(message))) {
      return message;
    }
  }

  return FALLBACK_MESSAGE;
}
