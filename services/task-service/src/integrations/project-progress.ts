import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";

import { getTaskServiceEnv } from "../config/env.js";

export interface RecalculateProjectProgressParams {
  projectId: string;
  userId: string;
  organizationId: string;
}

export interface ProjectProgressIntegration {
  recalculateProjectProgress(params: RecalculateProjectProgressParams): Promise<void>;
}

interface CreateHttpProjectProgressIntegrationOptions {
  serviceUrl: string;
  serviceToken: string;
  fetchImpl?: typeof fetch;
}

class HttpProjectProgressIntegration implements ProjectProgressIntegration {
  readonly #url: URL;
  readonly #serviceToken: string;
  readonly #fetchImpl: typeof fetch;

  constructor(options: CreateHttpProjectProgressIntegrationOptions) {
    this.#url = new URL("/integracao-project-progress", options.serviceUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetchImpl = options.fetchImpl ?? fetch;
  }

  async recalculateProjectProgress(params: RecalculateProjectProgressParams): Promise<void> {
    let response: Response;

    try {
      response = await this.#fetchImpl(this.#url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_SERVICE_TOKEN_HEADER]: this.#serviceToken,
          [FORWARDED_AUTH_USER_ID_HEADER]: params.userId,
          [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: params.organizationId,
        },
        body: JSON.stringify({
          project_id: params.projectId,
        }),
      });
    } catch (err: unknown) {
      throw new ServiceError(502, "Falha ao chamar o project-service.", err);
    }

    if (response.ok) {
      return;
    }

    throw new ServiceError(
      502,
      `project-service retornou status ${response.status} ao recalcular progresso do projeto.`,
    );
  }
}

export function createHttpProjectProgressIntegration(
  options?: Partial<CreateHttpProjectProgressIntegrationOptions>,
): ProjectProgressIntegration {
  const env = getTaskServiceEnv();

  return new HttpProjectProgressIntegration({
    serviceUrl: options?.serviceUrl ?? env.projectServiceUrl,
    serviceToken: options?.serviceToken ?? env.auditServiceToken,
    fetchImpl: options?.fetchImpl,
  });
}
