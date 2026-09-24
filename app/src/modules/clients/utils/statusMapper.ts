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

const REACTIVATABLE_STATUSES = new Set(["Inativo", "Processo de Inativação", "Paralisado"]);

// Nega por padrão: Prospect, Não Contratado e status desconhecido não têm ação de ciclo de vida.
export function getClientLifecycleActions(uiStatus: string): ClientLifecycleActions {
  if (uiStatus === "Ativo") {
    return { canActivate: false, canDeactivate: true, canTerminate: true };
  }

  return { canActivate: REACTIVATABLE_STATUSES.has(uiStatus), canDeactivate: false, canTerminate: false };
}
