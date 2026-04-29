export function mapClientStatusFromApi(status: string | null | undefined): string {
  if (status === "Prospecção") {
    return "Prospect";
  }

  if (status === "active") {
    return "Ativo";
  }

  if (status === "inactive") {
    return "Inativo";
  }

  return status ?? "";
}

export function mapClientStatusToApi(status: string | null | undefined): string {
  if (status === "Prospect") {
    return "Prospecção";
  }

  return status ?? "";
}
