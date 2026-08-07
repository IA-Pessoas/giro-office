export const SERVER_ERROR_TOAST_ID = "server-error";
export const SERVER_ERROR_TOAST_MESSAGE =
  "Não foi possível concluir a operação. Tente de novo daqui a pouco.";

export interface ServerErrorToastAdapter {
  isActive(id: string): boolean;
  error(message: string, options: { toastId: string }): unknown;
}

export function notifyServerError(adapter: ServerErrorToastAdapter): void {
  if (adapter.isActive(SERVER_ERROR_TOAST_ID)) {
    return;
  }

  adapter.error(SERVER_ERROR_TOAST_MESSAGE, {
    toastId: SERVER_ERROR_TOAST_ID,
  });
}
