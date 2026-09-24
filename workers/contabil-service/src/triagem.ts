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
  type TriageAccountingSummaryDto,
} from "@workspace/shared";
import type { ContabilWorkerEnv } from "./env.js";
import type { OverviewClient } from "./services.js";

function isStatus(value: string): boolean {
  return (TRIAGE_ACCOUNTING_STATUS_PRECEDENCE as readonly string[]).includes(value);
}

export function createTriagemOverviewClient(
  env: ContabilWorkerEnv,
  requestUrl: string,
): OverviewClient {
  return {
    async getSummary(input): Promise<TriageAccountingSummaryDto> {
      if (!env.TRIAGEM_SERVICE || !env.TRIAGEM_INTERNAL_TOKEN) {
        throw new ServiceError(503, "Resumo da Triagem indisponível.");
      }
      const url = new URL("/triagem/overview", requestUrl);
      url.search = new URLSearchParams({
        client_id: input.clientId,
        competence: input.competence,
        page: "1",
        page_size: "1",
      }).toString();
      const response = await env.TRIAGEM_SERVICE.fetch(
        new Request(url, {
          headers: {
            "content-type": "application/json",
            [INTERNAL_SERVICE_TOKEN_HEADER]: env.TRIAGEM_INTERNAL_TOKEN,
            [FORWARDED_AUTH_USER_ID_HEADER]: input.userId,
            [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: input.organizationId,
            [FORWARDED_AUTH_PERMISSION_HEADER]: String(input.permission ?? 0),
            ...(input.modules
              ? { [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify(input.modules) }
              : {}),
            ...(input.requestId ? { [REQUEST_ID_HEADER]: input.requestId } : {}),
          },
        }),
      );
      if (!response.ok) throw new ServiceError(503, "Resumo da Triagem indisponível.");
      const payload = (await response.json()) as { success?: unknown; data?: { items?: unknown } };
      const item = Array.isArray(payload.data?.items) ? payload.data.items[0] : undefined;
      // Cliente sem competência criada na Triagem: o overview vem vazio.
      if (payload.success === true && Array.isArray(payload.data?.items) && !item) {
        throw new ServiceError(404, "Resumo da Triagem não encontrado.");
      }
      if (
        payload.success !== true ||
        !item ||
        typeof item !== "object" ||
        (item as Record<string, unknown>).client_id !== input.clientId ||
        (item as Record<string, unknown>).competence !== input.competence ||
        typeof (item as Record<string, unknown>).legal_name !== "string" ||
        typeof (item as Record<string, unknown>).status !== "string" ||
        !isStatus((item as Record<string, unknown>).status as string)
      ) {
        throw new ServiceError(502, "Resposta incompatível do resumo da Triagem.");
      }
      return {
        version: TRIAGE_ACCOUNTING_SUMMARY_VERSION,
        organization_id: input.organizationId,
        client_id: input.clientId,
        legal_name: (item as Record<string, unknown>).legal_name as string,
        competence: input.competence,
        status: (item as Record<string, unknown>).status as TriageAccountingSummaryDto["status"],
      };
    },
  };
}
