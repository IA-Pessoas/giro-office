import { ServiceError } from "@workspace/shared/http";
import {
  HttpProjectProgressIntegration,
  type ProjectProgressIntegration,
} from "@workspace/task-service/src/integrations/projectProgressHttp.js";
import type { TaskWorkerEnv } from "./env.js";

/**
 * A classe HTTP do Node com o binding PROJECT_SERVICE. O Node envia o
 * AUDIT_SERVICE_TOKEN; o project Worker valida o próprio INTERNAL_SERVICE_TOKEN.
 */
export function createProjectProgressIntegration(env: TaskWorkerEnv): ProjectProgressIntegration {
  return {
    recalculateProjectProgress(params) {
      const binding = env.PROJECT_SERVICE;
      if (!binding) {
        return Promise.reject(
          new ServiceError(502, "Binding PROJECT_SERVICE ausente no task-service."),
        );
      }
      return new HttpProjectProgressIntegration({
        serviceUrl: "https://project-service",
        serviceToken: env.INTERNAL_SERVICE_TOKEN,
        fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) =>
          binding.fetch(input, init)) as typeof fetch,
      }).recalculateProjectProgress(params);
    },
  };
}
