// Nome de serviço, binding ou segredo interno (AUDIT_SERVICE, audit-service, *_TOKEN, *_URL,
// HYPERDRIVE) não chega à tela.
const INTERNAL_IDENTIFIER =
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:SERVICE|TOKEN|URL|SECRET|KEY)\b|\bHYPERDRIVE\b|\b(?!self[-_])[a-z]+[-_]service\b/iu;

function isDisplayableMessage(message: unknown): message is string {
  return typeof message === "string" && message.trim() !== "" && !INTERNAL_IDENTIFIER.test(message);
}

export function getPessoalErrorMessage(error: unknown, fallback: string): string {
  if (error !== null && typeof error === "object" && "response" in error) {
    const data = (error as { response?: { data?: { error?: unknown; message?: unknown } } })
      .response?.data;
    const message = data?.error ?? data?.message;

    if (isDisplayableMessage(message)) {
      return message;
    }
  }

  if (error instanceof Error && isDisplayableMessage(error.message)) {
    return error.message;
  }

  return fallback;
}
