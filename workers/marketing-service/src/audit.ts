import {
  AUDIT_UNAVAILABLE_MESSAGE,
  type MarketingAudit,
  marketingAuditPayload,
} from "@workspace/marketing-service/src/integrations/audit.js";
import { ServiceError } from "@workspace/shared/http";
import type { MarketingWorkerEnv } from "./env.js";

/** Mesmo payload do Node, pelo binding AUDIT_SERVICE; a trilha é exigida, então falha lança. */
export function createMarketingWorkerAudit(env: MarketingWorkerEnv): MarketingAudit {
  return async (entry) => {
    try {
      if (env.AUDIT_ENABLED === "false") throw new Error("auditoria desligada");
      if (!env.AUDIT_SERVICE || !env.AUDIT_SERVICE_TOKEN) {
        throw new Error("binding AUDIT_SERVICE ou AUDIT_SERVICE_TOKEN ausente");
      }
      const response = await env.AUDIT_SERVICE.fetch(
        new Request("https://audit-service/internal/audit/requests", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-internal-service-token": env.AUDIT_SERVICE_TOKEN,
          },
          body: JSON.stringify(marketingAuditPayload(entry)),
          signal: AbortSignal.timeout(5_000),
        }),
      );
      if (!response.ok) throw new Error(`AUDIT_SERVICE respondeu ${response.status}`);
    } catch (error) {
      console.warn("[marketing-service] auditoria exigida falhou.", error);
      throw new ServiceError(503, AUDIT_UNAVAILABLE_MESSAGE, error, undefined, { expose: true });
    }
  };
}
