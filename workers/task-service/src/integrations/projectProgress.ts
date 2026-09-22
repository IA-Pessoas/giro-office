import type { ServiceBinding } from "@workspace/runtime";
import {
  debug,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";
import { currentTaskContext } from "../context.js";

export interface RecalculateProjectProgressParams {
  projectId: string;
  userId: string;
  organizationId: string;
}

export interface ProjectProgressIntegration {
  recalculateProjectProgress(params: RecalculateProjectProgressParams): Promise<void>;
}

export interface ProjectServiceTarget {
  binding?: ServiceBinding;
  serviceToken?: string;
}

/** `PROJECT_SERVICE` + `INTERNAL_SERVICE_TOKEN` da requisição, salvo o que vier em `options`. */
export function resolveProjectService(options: ProjectServiceTarget): {
  binding: ServiceBinding | undefined;
  serviceToken: string;
} {
  if (options.binding && options.serviceToken) {
    return { binding: options.binding, serviceToken: options.serviceToken };
  }
  const { env } = currentTaskContext();
  return {
    binding: options.binding ?? env.PROJECT_SERVICE,
    serviceToken: options.serviceToken ?? env.INTERNAL_SERVICE_TOKEN,
  };
}

/** Equivalente ao `HttpProjectProgressIntegration` do Node, pelo Service Binding. */
export function createHttpProjectProgressIntegration(
  options: ProjectServiceTarget = {},
): ProjectProgressIntegration {
  return {
    async recalculateProjectProgress(params) {
      const { binding, serviceToken } = resolveProjectService(options);
      let response: Response;
      try {
        if (!binding) throw new Error("Binding PROJECT_SERVICE ausente.");
        response = await binding.fetch(
          new Request("https://project-service.internal/project/progress", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              [INTERNAL_SERVICE_TOKEN_HEADER]: serviceToken,
              [FORWARDED_AUTH_USER_ID_HEADER]: params.userId,
              [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: params.organizationId,
            },
            body: JSON.stringify({ project_id: params.projectId }),
          }),
        );
      } catch (err: unknown) {
        throw new ServiceError(502, "Falha ao chamar o project-service.", err);
      }

      if (response.ok) {
        debug("Integracao com project-service concluida com sucesso", {
          projectId: params.projectId,
          statusCode: response.status,
        });
        return;
      }

      throw new ServiceError(
        502,
        `project-service retornou status ${response.status} ao recalcular progresso do projeto.`,
      );
    },
  };
}
