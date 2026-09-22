import { ServiceError } from "@workspace/shared";
import * as original from "@workspace/task-service/src/integrations/projectProgress.js";
import { currentTaskContext } from "../context.js";

export type {
  ProjectProgressIntegration,
  RecalculateProjectProgressParams,
} from "@workspace/task-service/src/integrations/projectProgress.js";

/**
 * Substitui a integração no bundle, reaproveitando a classe HTTP original com o
 * binding PROJECT_SERVICE. A instância pode nascer fora de uma requisição (default
 * do construtor do TaskWorkflowService), então o binding é resolvido na chamada.
 * O Node envia o AUDIT_SERVICE_TOKEN; o project Worker valida o próprio
 * INTERNAL_SERVICE_TOKEN, então aqui vai o token interno.
 */
export function createHttpProjectProgressIntegration(): original.ProjectProgressIntegration {
  return {
    recalculateProjectProgress(params) {
      const { env } = currentTaskContext();
      const binding = env.PROJECT_SERVICE;
      if (!binding) throw new ServiceError(502, "Binding PROJECT_SERVICE ausente no task-service.");
      return original
        .createHttpProjectProgressIntegration({
          serviceUrl: "https://project-service",
          serviceToken: env.INTERNAL_SERVICE_TOKEN,
          fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) =>
            binding.fetch(input, init)) as typeof fetch,
        })
        .recalculateProjectProgress(params);
    },
  };
}
