/** Status literals returned by the API for the simplified client status field. */
export type ClientStatusApi = "ProspecÃ§Ã£o" | "active" | "inactive";

/** Normalized status values used in forms and detail UI. */
export type ClientStatusForm = "Prospect" | "Ativo" | "Inativo";

function isProspectingStatus(value: string | null | undefined): boolean {
  return value === "ProspecÃ§Ã£o" || value === "Prospecção";
}

export function mapClientStatusFromApi(
  status: ClientStatusApi | string | null | undefined,
): ClientStatusForm | string {
  if (isProspectingStatus(status)) {
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

export function mapClientStatusToApi(
  status: ClientStatusForm | string | null | undefined,
): ClientStatusApi | string {
  if (status === "Prospect") {
    return "ProspecÃ§Ã£o";
  }

  return status ?? "";
}
