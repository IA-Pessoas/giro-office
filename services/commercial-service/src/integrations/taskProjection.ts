import {
  type CommercialTaskBillingUpdatedEvent,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
} from "@workspace/shared";

export interface TaskProjectionDelivery {
  deliver(event: CommercialTaskBillingUpdatedEvent): Promise<void>;
}

export class TaskProjectionHttpClient implements TaskProjectionDelivery {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string,
    private readonly timeoutMs = 10_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async deliver(event: CommercialTaskBillingUpdatedEvent): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/u, "")}/internal/commercial/task-billing`,
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
        throw new Error(`task-service projection failed with status ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
