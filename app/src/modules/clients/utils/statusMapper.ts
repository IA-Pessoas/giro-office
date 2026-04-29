export function mapClientStatusFromApi(status: string | null | undefined): string {
  if (status === "Prospecção") {
    return "Prospect";
  }

  return status ?? "";
}

export function mapClientStatusToApi(status: string | null | undefined): string {
  if (status === "Prospect") {
    return "Prospecção";
  }

  return status ?? "";
}
