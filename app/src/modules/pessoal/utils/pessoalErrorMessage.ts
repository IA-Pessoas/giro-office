// Nome de serviço ou segredo interno (AUDIT_SERVICE, audit-service, *_TOKEN) não chega à tela.
const INTERNAL_IDENTIFIER = /\b[A-Z]+(?:_[A-Z]+)*_(?:SERVICE|TOKEN)\b|\b[a-z]+-service\b/u;

function displayable(message: unknown): message is string {
  return typeof message === "string" && message.trim() !== "" && !INTERNAL_IDENTIFIER.test(message);
}

export function getPessoalErrorMessage(error: unknown, fallback: string): string {
  if (error !== null && typeof error === "object" && "response" in error) {
    const data = (error as { response?: { data?: { error?: unknown; message?: unknown } } })
      .response?.data;
    const message = data?.error ?? data?.message;

    if (displayable(message)) {
      return message;
    }
  }

  if (error instanceof Error && displayable(error.message)) {
    return error.message;
  }

  return fallback;
}
