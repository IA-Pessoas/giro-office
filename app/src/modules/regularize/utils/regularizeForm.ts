export function toRegularizeInputDate(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

export function trimRegularizeText(value: string): string {
  return value.trim();
}

export function trimRegularizeOptionalText(value: string): string | undefined {
  const trimmed = value.trim();

  return trimmed || undefined;
}

export function trimRegularizeOptionalUuid(value: string): string | undefined {
  return trimRegularizeOptionalText(value);
}

export function trimRegularizeNullableText(value: string): string | null {
  const trimmed = value.trim();

  return trimmed || null;
}

export function toRegularizeOptionalNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isNaN(parsed) ? undefined : parsed;
}

export function toRegularizeRequiredNumber(value: string): number {
  const parsed = Number(value);

  return Number.isNaN(parsed) ? 0 : parsed;
}

function getRegularizeApiErrorMessage(error: unknown): string {
  const response = (
    error as { response?: { data?: { error?: unknown; message?: unknown } } }
  ).response;
  const responseMessage =
    typeof response?.data?.error === "string"
      ? response.data.error
      : typeof response?.data?.message === "string"
        ? response.data.message
        : "";

  return responseMessage.trim();
}

export function getRegularizeErrorMessage(error: unknown, fallback: string): string {
  const apiMessage = getRegularizeApiErrorMessage(error);

  if (apiMessage) {
    return apiMessage;
  }

  const message = error instanceof Error ? error.message.trim() : "";

  return message || fallback;
}

export function getRegularizeMutationErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const message = getRegularizeErrorMessage(error, "");

  if (/403|forbidden|permission|permiss/i.test(message)) {
    return "Acesso negado para executar esta ação.";
  }

  if (/409|conflict|conflito|cadastrad/i.test(message)) {
    return message || "Registro já cadastrado.";
  }

  return message || fallback;
}

// A migração gravou "legacy" no escopo dos sites sem esfera conhecida (#1347).
export function formatSiteSphere(value: string | null | undefined): string {
  if (!value) return "-";
  return value === "legacy" ? "Não informado" : value;
}
