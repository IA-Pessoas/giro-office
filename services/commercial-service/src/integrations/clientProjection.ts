import {
  type CommercialProspectingProjectionResult,
  type CommercialProspectingTransitionEvent,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
} from "@workspace/shared";

export interface ClientProjectionDelivery {
  deliver(event: CommercialProspectingTransitionEvent): Promise<
    CommercialProspectingProjectionResult & {
      client: {
        id: string;
        name: string;
        company_name: string | null;
        fantasy_name: string | null;
        service_unique: boolean | null;
        type_registration: string;
      };
    }
  >;
}

export class ClientProjectionHttpClient implements ClientProjectionDelivery {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string,
    private readonly timeoutMs = 10_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async deliver(event: CommercialProspectingTransitionEvent): Promise<
    CommercialProspectingProjectionResult & {
      client: {
        id: string;
        name: string;
        company_name: string | null;
        fantasy_name: string | null;
        service_unique: boolean | null;
        type_registration: string;
      };
    }
  > {
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
        throw new Error(`client-service projection failed with status ${response.status}`);
      }
      const body = (await response.json()) as {
        success?: boolean;
        data?: CommercialProspectingProjectionResult & {
          client: {
            id: string;
            name: string;
            company_name: string | null;
            fantasy_name: string | null;
            service_unique: boolean | null;
            type_registration: string;
          };
        };
      };
      if (!body.success || !body.data?.client) {
        throw new Error("client-service projection returned an invalid response");
      }
      return body.data;
    } finally {
      clearTimeout(timeout);
    }
  }
}
