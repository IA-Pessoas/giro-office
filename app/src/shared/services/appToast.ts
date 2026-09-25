import type { Id, ToastContent, ToastOptions, toast as baseToast } from "react-toastify";
import { SERVER_ERROR_TOAST_ID } from "./serverErrorToast.ts";

type ToastApi = typeof baseToast;
type ToastKind = "default" | "success" | "error" | "info" | "warn" | "warning";

/**
 * Regras globais dos toasts (#1364), aplicadas em um só lugar:
 * - mensagem de texto idêntica e ainda visível não empilha (toastId derivado do texto);
 * - sucesso dispensa os erros que ainda estão na tela;
 * - enquanto o toast de 5xx do interceptor está na tela, o erro do chamador não aparece:
 *   o de 5xx já traz a mensagem e o requestId para o suporte (#1365), e uma falha gera um
 *   toast só.
 */
// Erro do chamador que chega logo depois do toast de 5xx é a mesma falha; depois disso, é outra.
const SERVER_ERROR_SUPPRESSION_MS = 1_500;

export function createAppToast(base: ToastApi, now: () => number = Date.now): ToastApi {
  let serverErrorShownAt = Number.NEGATIVE_INFINITY;
  // ponytail: sucesso limpa todos os erros visíveis, não só os da mesma ação; basta
  // enquanto os toasts não carregam contexto.
  const visibleErrors = new Set<Id>();

  const withDedupe = <T>(kind: ToastKind, content: ToastContent<T>, options?: ToastOptions<T>) =>
    options?.toastId !== undefined || typeof content !== "string"
      ? options
      : { ...options, toastId: `${kind}:${content}` };

  const show =
    (kind: ToastKind, fn: (content: ToastContent<unknown>, options?: ToastOptions<unknown>) => Id) =>
    <T>(content: ToastContent<T>, options?: ToastOptions<T>): Id =>
      fn(content as ToastContent<unknown>, withDedupe(kind, content, options) as ToastOptions<unknown>);

  const showSuccess = show("success", base.success);
  const showError = show("error", base.error);

  const success = <T>(content: ToastContent<T>, options?: ToastOptions<T>) => {
    for (const id of visibleErrors) base.dismiss(id);
    visibleErrors.clear();
    return showSuccess(content, options);
  };

  const error = <T>(content: ToastContent<T>, options?: ToastOptions<T>) => {
    if (options?.toastId === SERVER_ERROR_TOAST_ID) {
      serverErrorShownAt = now();
      // Fica fora de visibleErrors: um sucesso não pode apagar o código para o suporte.
      return showError(content, options);
    }
    if (
      base.isActive(SERVER_ERROR_TOAST_ID) &&
      now() - serverErrorShownAt < SERVER_ERROR_SUPPRESSION_MS
    ) {
      return SERVER_ERROR_TOAST_ID;
    }
    const id = showError(content, options);
    visibleErrors.add(id);
    return id;
  };

  return Object.assign(show("default", base), base, {
    success,
    error,
    info: show("info", base.info),
    warn: show("warn", base.warn),
    warning: show("warning", base.warning),
  }) as ToastApi;
}
