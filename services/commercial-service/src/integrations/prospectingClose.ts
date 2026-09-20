import {
  type CommercialProspectingCloseResult,
  type CommercialProspectingTransitionEvent,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
} from "@workspace/shared";

export interface ProspectingCloseDelivery {
  deliver(event: CommercialProspectingTransitionEvent): Promise<CommercialProspectingCloseResult>;
}

interface SuccessResponse {
  success?: boolean;
  data?: CommercialProspectingCloseResult;
}

function isCloseResult(value: unknown): value is CommercialProspectingCloseResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Partial<CommercialProspectingCloseResult>;
  return (
    typeof result.event_id === "string" &&
    typeof result.client_id === "string" &&
    typeof result.competence === "string"
  );
}

export class ProspectingCloseHttpClient implements ProspectingCloseDelivery {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string,
    private readonly timeoutMs = 10_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async deliver(
    event: CommercialProspectingTransitionEvent,
  ): Promise<CommercialProspectingCloseResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/u, "")}/internal/commercial/prospecting-close`,
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
        throw new Error(`task-service prospecting close failed with status ${response.status}`);
      }
      const body = (await response.json()) as SuccessResponse;
      if (!body.success || !isCloseResult(body.data)) {
        throw new Error("task-service prospecting close returned an invalid response");
      }
      return body.data;
    } finally {
      clearTimeout(timeout);
    }
  }
}
