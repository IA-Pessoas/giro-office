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

export function trimRegularizeNullableText(value: string): string | null {
  const trimmed = value.trim();

  return trimmed || null;
}

export function getRegularizeMutationErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const message = error instanceof Error ? error.message : "";

  if (/403|forbidden|permission|permiss/i.test(message)) {
    return "Acesso negado para executar esta ação.";
  }

  if (/409|conflict|conflito|cadastrad/i.test(message)) {
    return message || "Registro já cadastrado.";
  }

  return message || fallback;
}
