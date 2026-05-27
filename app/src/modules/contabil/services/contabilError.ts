import { isAxiosError } from "axios";

const DEFAULT_CONTABIL_ERROR_MESSAGE =
  "N\u00e3o foi poss\u00edvel concluir a opera\u00e7\u00e3o cont\u00e1bil agora. Tente novamente em instantes.";

export function getContabilErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const responseMessage =
      error.response?.data?.error ??
      error.response?.data?.message ??
      error.message;

    if (typeof responseMessage === "string" && responseMessage.trim()) {
      return responseMessage;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return DEFAULT_CONTABIL_ERROR_MESSAGE;
}
