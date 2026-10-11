import { useFetch } from "@shared/hooks";

import { triagemAuditService } from "../services/triagemAuditService";

export function useTriageAudit(competenceId: string, enabled: boolean, page = 1) {
  return useFetch(
    ["triagem", "audit", competenceId, page] as const,
    () => triagemAuditService.listTimeline(competenceId, page),
    { enabled: Boolean(competenceId) && enabled },
  );
}
