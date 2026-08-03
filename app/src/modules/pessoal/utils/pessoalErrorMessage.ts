export function getPessoalErrorMessage(error: unknown, fallback: string): string {
  if (error !== null && typeof error === "object" && "response" in error) {
    const data = (error as { response?: { data?: { error?: unknown; message?: unknown } } })
      .response?.data;
    const message = data?.error ?? data?.message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
