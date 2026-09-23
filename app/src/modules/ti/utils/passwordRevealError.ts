type PasswordRevealError = {
  response?: {
    status?: unknown;
  };
};

function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return undefined;
  }

  const response = (error as PasswordRevealError).response;
  return typeof response?.status === "number" ? response.status : undefined;
}

export function getTiPasswordRevealErrorMessage(error: unknown): string {
  switch (getHttpStatus(error)) {
    case 401:
    case 403:
      return "Você não tem permissão para revelar esta senha.";
    case 404:
      return "Esta senha não está mais disponível. Atualize a lista e tente novamente.";
    case 500:
      return "Não foi possível revelar esta senha. Solicite à equipe de TI a revisão do cadastro.";
    default:
      return "Não foi possível revelar esta senha. Tente novamente mais tarde.";
  }
}
