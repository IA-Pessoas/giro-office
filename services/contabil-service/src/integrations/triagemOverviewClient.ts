import {
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
  ServiceError,
  TRIAGE_ACCOUNTING_STATUS_PRECEDENCE,
  TRIAGE_ACCOUNTING_SUMMARY_VERSION,
  type TriageAccountingStatus,
  type TriageAccountingSummaryDto,
} from "@workspace/shared";

const COMPETENCE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

type TriagemOverviewResponse = {
  success: true;
  data: {
    items: Array<{
      client_id: string;
      legal_name: string;
      competence: string;
      status: string;
    }>;
  };
};

export interface TriagemOverviewClientOptions {
  baseUrl: string;
  serviceToken: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export interface TriagemOverviewSummaryRequest {
  organizationId: string;
  userId: string;
  clientId: string;
  competence: string;
  requestId?: string;
}

function isStatus(value: string): value is TriageAccountingStatus {
  return (TRIAGE_ACCOUNTING_STATUS_PRECEDENCE as readonly string[]).includes(value);
}

function isOverviewResponse(value: unknown): value is TriagemOverviewResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { success?: unknown; data?: { items?: unknown } };
  return candidate.success === true && Array.isArray(candidate.data?.items);
}

export class TriagemOverviewClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: TriagemOverviewClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getSummary(input: TriagemOverviewSummaryRequest): Promise<TriageAccountingSummaryDto> {
    if (!COMPETENCE_PATTERN.test(input.competence)) {
      throw new ServiceError(400, "Competência deve estar no formato AAAA-MM.");
    }
    if (!input.organizationId || !input.userId || !input.clientId) {
      throw new ServiceError(400, "Contexto da integração Triagem–Contábil incompleto.");
    }

    const url = new URL("/triagem/overview", this.options.baseUrl);
    url.search = new URLSearchParams({
      client_id: input.clientId,
      competence: input.competence,
      page: "1",
      page_size: "1",
    }).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await this.fetchImpl(url.toString(), {
        method: "GET",
        headers: {
          "content-type": "application/json",
          [INTERNAL_SERVICE_TOKEN_HEADER]: this.options.serviceToken,
          [FORWARDED_AUTH_USER_ID_HEADER]: input.userId,
          [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: input.organizationId,
          [FORWARDED_AUTH_PERMISSION_HEADER]: "1",
          [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ triagem: 1 }),
          ...(input.requestId ? { [REQUEST_ID_HEADER]: input.requestId } : {}),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ServiceError(503, "Resumo da Triagem indisponível.");
      }

      const payload: unknown = await response.json();
      if (!isOverviewResponse(payload)) {
        throw new ServiceError(502, "Resposta incompatível do resumo da Triagem.");
      }

      const item = payload.data.items[0];
      if (
        !item ||
        item.client_id !== input.clientId ||
        item.competence !== input.competence ||
        typeof item.legal_name !== "string" ||
        !isStatus(item.status)
      ) {
        throw new ServiceError(502, "Resposta incompatível do resumo da Triagem.");
      }

      return {
        version: TRIAGE_ACCOUNTING_SUMMARY_VERSION,
        organization_id: input.organizationId,
        client_id: item.client_id,
        legal_name: item.legal_name,
        competence: item.competence,
        status: item.status,
      };
    } catch (error: unknown) {
      if (error instanceof ServiceError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ServiceError(504, "Tempo excedido ao consultar o resumo da Triagem.", error);
      }
      throw new ServiceError(503, "Não foi possível consultar o resumo da Triagem.", error);
    } finally {
      clearTimeout(timeout);
    }
  }
}
