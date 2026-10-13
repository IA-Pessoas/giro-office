import {
  type CommercialProspectingTransitionEvent,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
} from "@workspace/shared";

export interface ProspectingTaskTransitionResult {
  event_id: string;
  client_id: string;
  updated_count: number;
  duplicate: boolean;
}

export interface ProspectingTaskTransitionDelivery {
  deliver(event: CommercialProspectingTransitionEvent): Promise<ProspectingTaskTransitionResult>;
}

interface SuccessResponse {
  success?: boolean;
  data?: ProspectingTaskTransitionResult;
}

function isTransitionResult(value: unknown): value is ProspectingTaskTransitionResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Partial<ProspectingTaskTransitionResult>;
  return (
    typeof result.event_id === "string" &&
    typeof result.client_id === "string" &&
    typeof result.updated_count === "number" &&
    typeof result.duplicate === "boolean"
  );
}

export class ProspectingTaskTransitionHttpClient implements ProspectingTaskTransitionDelivery {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string,
    private readonly timeoutMs = 10_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async deliver(
    event: CommercialProspectingTransitionEvent,
  ): Promise<ProspectingTaskTransitionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/u, "")}/internal/commercial/prospecting-transition`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [INTERNAL_SERVICE_TOKEN_HEADER]: this.serviceToken,
            [REQUEST_ID_HEADER]: event.audit_correlation_id,
          },
          body: JSON.stringify(event),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new Error(`Falha ao aplicar a situação comercial nas tarefas (${response.status}).`);
      }
      const body = (await response.json()) as SuccessResponse;
      if (!body.success || !isTransitionResult(body.data)) {
        throw new Error("A resposta do serviço de tarefas para a situação comercial é inválida.");
      }
      return body.data;
    } finally {
      clearTimeout(timeout);
    }
  }
}
