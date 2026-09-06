import {
  debug,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";

import { getTaskServiceEnv } from "../config/env.js";

export interface CreateProjectFromWizardParams {
  userId: string;
  organizationId: string;
  permission?: number;
  userType?: "owner" | "admin" | "user";
  modules?: Record<string, number>;
  idempotencyKey: string;
  client_id: string;
  name: string;
  start_date: Date;
  end_date?: Date;
  objective: string;
}

export interface ProjectWizardIntegration {
  createProject(params: CreateProjectFromWizardParams): Promise<Record<string, unknown>>;
}

interface CreateHttpProjectWizardIntegrationOptions {
  serviceUrl: string;
  serviceToken: string;
  fetchImpl?: typeof fetch;
}

function getCreatedProject(payload: unknown): Record<string, unknown> {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("data" in payload) ||
    typeof payload.data !== "object" ||
    payload.data === null ||
    !("create" in payload.data) ||
    typeof payload.data.create !== "object" ||
    payload.data.create === null
  ) {
    throw new ServiceError(502, "Resposta inválida do project-service.");
  }

  return payload.data.create as Record<string, unknown>;
}

class HttpProjectWizardIntegration implements ProjectWizardIntegration {
  readonly #url: URL;
  readonly #serviceToken: string;
  readonly #fetchImpl: typeof fetch;

  constructor(options: CreateHttpProjectWizardIntegrationOptions) {
    this.#url = new URL("/project", options.serviceUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetchImpl = options.fetchImpl ?? fetch;
  }

  async createProject(params: CreateProjectFromWizardParams): Promise<Record<string, unknown>> {
    let response: Response;

    try {
      response = await this.#fetchImpl(this.#url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": params.idempotencyKey,
          [INTERNAL_SERVICE_TOKEN_HEADER]: this.#serviceToken,
          [FORWARDED_AUTH_USER_ID_HEADER]: params.userId,
          [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: params.organizationId,
          ...(params.permission === undefined
            ? {}
            : { [FORWARDED_AUTH_PERMISSION_HEADER]: String(params.permission) }),
          ...(params.userType === undefined
            ? {}
            : { [FORWARDED_AUTH_TYPE_HEADER]: params.userType }),
          ...(params.modules === undefined
            ? {}
            : { [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify(params.modules) }),
        },
        body: JSON.stringify({
          client_id: params.client_id,
          name: params.name,
          start_date: params.start_date,
          ...(params.end_date === undefined ? {} : { end_date: params.end_date }),
          objective: params.objective,
        }),
      });
    } catch (err: unknown) {
      throw new ServiceError(502, "Falha ao chamar o project-service.", err);
    }

    if (!response.ok) {
      throw new ServiceError(
        502,
        `project-service retornou status ${response.status} ao criar o projeto.`,
      );
    }

    try {
      const project = getCreatedProject(await response.json());
      debug("Projeto criado pelo command do wizard", { projectId: project.id });
      return project;
    } catch (err: unknown) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(502, "Resposta inválida do project-service.", err);
    }
  }
}

export function createHttpProjectWizardIntegration(
  options?: Partial<CreateHttpProjectWizardIntegrationOptions>,
): ProjectWizardIntegration {
  if (options?.serviceUrl && options.serviceToken) {
    return new HttpProjectWizardIntegration({
      serviceUrl: options.serviceUrl,
      serviceToken: options.serviceToken,
      fetchImpl: options.fetchImpl,
    });
  }

  const env = getTaskServiceEnv();

  return new HttpProjectWizardIntegration({
    serviceUrl: options?.serviceUrl ?? env.projectServiceUrl,
    serviceToken: options?.serviceToken ?? env.auditServiceToken,
    fetchImpl: options?.fetchImpl,
  });
}
