import { isAxiosError } from "axios";

const DEFAULT_FISCAL_ERROR_MESSAGE =
  "Não foi possível concluir a busca fiscal agora. Tente novamente em instantes.";

export function getFiscalErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const responseMessage = error.response?.data?.error;

    if (typeof responseMessage === "string" && responseMessage.trim()) {
      return responseMessage;
    }
  }

  return DEFAULT_FISCAL_ERROR_MESSAGE;
}
