import {
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  REQUEST_ID_HEADER,
  ServiceError,
} from "@workspace/shared";

import type { ReportsServiceEnv } from "../config/env.js";

const ACCESS_CONTEXT_ERROR = "Não foi possível validar o acesso atual ao relatório.";

interface ReportingAccessContextResponse {
  success: true;
  data: unknown;
}

interface GetAccessContextInput {
  userId: string;
  organizationId: string;
  requestId: string;
}

function isSuccessResponse(value: unknown): value is ReportingAccessContextResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    (value as { success?: unknown }).success === true &&
    "data" in value
  );
}

export class UserAccessContextClient {
  readonly #url: string;

  constructor(
    private readonly env: Pick<
      ReportsServiceEnv,
      "userServiceUrl" | "reportsInternalToken" | "sourceTimeoutMs"
    >,
  ) {
    this.#url = new URL("/internal/reporting/access-context", env.userServiceUrl).toString();
  }

  async getAccessContext({
    userId,
    organizationId,
    requestId,
  }: GetAccessContextInput): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.env.sourceTimeoutMs);

    try {
      const response = await fetch(this.#url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_SERVICE_TOKEN_HEADER]: this.env.reportsInternalToken,
          [REQUEST_ID_HEADER]: requestId,
        },
        body: JSON.stringify({ userId, organizationId }),
        signal: controller.signal,
      });
      const payload: unknown = await response.json();

      if (!response.ok || !isSuccessResponse(payload)) {
        throw new Error("Resposta inválida do user-service.");
      }

      return payload.data;
    } catch (err: unknown) {
      logError("Falha ao consultar contexto de acesso no user-service", {
        errorType: err instanceof Error ? err.name : typeof err,
      });
      throw new ServiceError(503, ACCESS_CONTEXT_ERROR);
    } finally {
      clearTimeout(timeout);
    }
  }
}
