/** Status literals returned by the API for the simplified client status field. */
export type ClientStatusApi = "Prospecção" | "active" | "inactive";

/** Normalized status values used in forms and detail UI. */
export type ClientStatusForm = "Prospect" | "Ativo" | "Inativo";

function isProspectingStatus(value: string | null | undefined): boolean {
  return value === "Prospecção" || value === "ProspecÃ§Ã£o" || value === "ProspecÃƒÂ§ÃƒÂ£o";
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
    return "Prospecção";
  }

  return status ?? "";
}

export type ClientLifecycleActions = {
  canActivate: boolean;
  canDeactivate: boolean;
  canTerminate: boolean;
};

// Prospect não tem ciclo de vida; Inativo e em inativação só podem ser reativados.
export function getClientLifecycleActions(uiStatus: string): ClientLifecycleActions {
  if (uiStatus === "Prospect") {
    return { canActivate: false, canDeactivate: false, canTerminate: false };
  }

  if (uiStatus === "Inativo" || uiStatus === "Processo de Inativação") {
    return { canActivate: true, canDeactivate: false, canTerminate: false };
  }

  return { canActivate: false, canDeactivate: true, canTerminate: true };
}
