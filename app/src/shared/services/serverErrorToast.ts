export const SERVER_ERROR_TOAST_ID = "server-error";
export const SERVER_ERROR_TOAST_MESSAGE =
  "Não foi possível concluir a operação. Tente de novo daqui a pouco.";

export interface ServerErrorToastAdapter {
  isActive(id: string): boolean;
  error(message: string, options: { toastId: string }): unknown;
}

interface ServerErrorShape {
  response?: { data?: unknown; headers?: Record<string, unknown> };
}

/**
 * Texto do toast de 5xx: a mensagem do backend (neutra, ou de negócio quando o serviço a
 * expõe) mais o requestId que o usuário repassa ao suporte (#1365).
 */
export function serverErrorMessage(error: unknown): string {
  const response = (error as ServerErrorShape | null)?.response;
  const data = (response?.data ?? {}) as { error?: unknown; requestId?: unknown };
  const message =
    typeof data.error === "string" && data.error.trim() ? data.error.trim() : SERVER_ERROR_TOAST_MESSAGE;
  const requestId =
    typeof data.requestId === "string" ? data.requestId : response?.headers?.["x-request-id"];

  return typeof requestId === "string" && requestId
    ? `${message} Código para o suporte: ${requestId}`
    : message;
}

export function notifyServerError(adapter: ServerErrorToastAdapter, error?: unknown): void {
  if (adapter.isActive(SERVER_ERROR_TOAST_ID)) {
    return;
  }

  adapter.error(serverErrorMessage(error), {
    toastId: SERVER_ERROR_TOAST_ID,
  });
}

/** 5xx já ganha o toast genérico do interceptor; o chamador não deve repetir. */
export function isServerErrorAlreadyNotified(error: unknown): boolean {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === "number" && status >= 500;
}
