import type { TiRequestMessagePayload } from "../types";

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const MAX_TI_REQUEST_MESSAGE_IMAGE_BYTES = 5 * 1024 * 1024;

const TI_REQUEST_MESSAGE_ACTION_ERROR_FALLBACK =
  "Não foi possível enviar a mensagem. Tente novamente.";

export function validateTiRequestMessageImage(
  file: Pick<File, "size" | "type">,
): string | null {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    return "Selecione uma imagem PNG, JPEG ou WebP.";
  }

  if (file.size > MAX_TI_REQUEST_MESSAGE_IMAGE_BYTES) {
    return "A imagem deve ter no máximo 5 MB.";
  }

  return null;
}

export function getTiRequestMessageActionError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return TI_REQUEST_MESSAGE_ACTION_ERROR_FALLBACK;
  }

  const response = (error as { response?: unknown }).response;

  if (!response || typeof response !== "object") {
    return TI_REQUEST_MESSAGE_ACTION_ERROR_FALLBACK;
  }

  const data = (response as { data?: unknown }).data;

  if (!data || typeof data !== "object") {
    return TI_REQUEST_MESSAGE_ACTION_ERROR_FALLBACK;
  }

  const domainError = (data as { error?: unknown }).error;

  return typeof domainError === "string" && domainError.trim()
    ? domainError.trim()
    : TI_REQUEST_MESSAGE_ACTION_ERROR_FALLBACK;
}

export function buildTiRequestMessageSubmission(
  payload: TiRequestMessagePayload,
): FormData | { message: string } {
  if (!payload.attachment) {
    return { message: payload.message };
  }

  const formData = new FormData();
  formData.append("message", payload.message);
  formData.append("file", payload.attachment);
  return formData;
}
