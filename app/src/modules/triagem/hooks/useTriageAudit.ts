import { useFetch } from "@shared/hooks";

import { triagemAuditService } from "../services/triagemAuditService";

export function useTriageAudit(competenceId: string, enabled: boolean) {
  return useFetch(
    ["triagem", "audit", competenceId] as const,
    () => triagemAuditService.listTimeline(competenceId),
    { enabled: Boolean(competenceId) && enabled },
  );
}
