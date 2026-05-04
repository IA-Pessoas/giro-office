/** Status literals returned by the API for the simplified client status field. */
export type ClientStatusApi = "Prospecção" | "active" | "inactive";

/** Normalized status values used in forms and detail UI. */
export type ClientStatusForm = "Prospect" | "Ativo" | "Inativo";

export function mapClientStatusFromApi(
  status: ClientStatusApi | string | null | undefined,
): ClientStatusForm | string {
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

export function mapClientStatusToApi(
  status: ClientStatusForm | string | null | undefined,
): ClientStatusApi | string {
  if (status === "Prospect") {
    return "Prospecção";
  }

  return status ?? "";
}
