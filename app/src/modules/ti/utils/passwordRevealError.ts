type PasswordRevealError = {
  response?: {
    status?: unknown;
    data?: {
      error?: unknown;
    };
  };
};

const DECRYPTION_FAILURE_MESSAGE =
  "Não foi possível revelar esta senha. Solicite à equipe de TI a revisão do cadastro.";

function getResponse(error: unknown): PasswordRevealError["response"] {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return undefined;
  }

  return (error as PasswordRevealError).response;
}

export function getTiPasswordRevealErrorMessage(error: unknown): string {
  const response = getResponse(error);
  const status = typeof response?.status === "number" ? response.status : undefined;

  if (status === 500 && response?.data?.error === DECRYPTION_FAILURE_MESSAGE) {
    return DECRYPTION_FAILURE_MESSAGE;
  }

  switch (status) {
    case 401:
    case 403:
      return "Você não tem permissão para revelar esta senha.";
    case 404:
      return "Esta senha não está mais disponível. Atualize a lista e tente novamente.";
    default:
      return "Não foi possível revelar esta senha. Tente novamente mais tarde.";
  }
}
