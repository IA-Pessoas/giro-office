import { createHash, createHmac, randomUUID } from "node:crypto";

import {
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  REQUEST_ID_HEADER,
  ServiceError,
} from "@workspace/shared";

import type {
  ReportCatalogSource,
  ReportPreviewAdapterInput,
  ReportSourceAdapter,
} from "../catalog/types.js";
import type { ReportsServiceEnv } from "../config/env.js";
import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";

const REPORTS_GRANT_HEADER = "x-reports-grant";
const REPORTS_GRANT_SIGNATURE_HEADER = "x-reports-grant-signature";

const sources = [
  {
    key: "parcelamento.installments",
    label: "Parcelamentos",
    module: "parcelamento",
    minimum_permission: 1,
    fields: [
      field("client_id", "Cliente", "string", ["eq", "in"], []),
      field("type", "Tipo", "string", ["eq", "neq", "contains", "in"], []),
      field("legal_nature", "Natureza jurídica", "string", ["eq", "neq", "contains", "in"], []),
      field("jurisdiction", "Jurisdição", "string", ["eq", "neq", "contains", "in"], []),
      field("status", "Status", "string", ["eq", "neq", "contains", "in"], []),
      field("is_automatic_debit", "Débito automático", "boolean", ["eq", "neq"], []),
      field(
        "consolidated_total_amount",
        "Total consolidado",
        "number",
        ["eq", "gt", "gte", "lt", "lte", "between"],
        ["sum", "avg", "min", "max"],
      ),
      field(
        "outstanding_balance",
        "Saldo devedor",
        "number",
        ["eq", "gt", "gte", "lt", "lte", "between"],
        ["sum", "avg", "min", "max"],
      ),
      field(
        "paid_installments_count",
        "Parcelas pagas",
        "number",
        ["eq", "gt", "gte", "lt", "lte", "between"],
        ["sum", "avg", "min", "max"],
      ),
      field(
        "overdue_installments_count",
        "Parcelas vencidas",
        "number",
        ["eq", "gt", "gte", "lt", "lte", "between"],
        ["sum", "avg", "min", "max"],
      ),
      field(
        "enrollment_date",
        "Data de adesão",
        "date",
        ["eq", "gt", "gte", "lt", "lte", "between"],
        [],
      ),
    ],
  },
  {
    key: "parcelamento.installment_competencies",
    label: "Competências de parcelamento",
    module: "parcelamento",
    minimum_permission: 1,
    fields: [
      field("installment_id", "Parcelamento", "string", ["eq", "in"], []),
      field(
        "how_many_paid",
        "Quantidade paga",
        "number",
        ["eq", "gt", "gte", "lt", "lte", "between"],
        ["sum", "avg", "min", "max"],
      ),
      field(
        "how_many_overdue",
        "Quantidade vencida",
        "number",
        ["eq", "gt", "gte", "lt", "lte", "between"],
        ["sum", "avg", "min", "max"],
      ),
      field("download", "Baixa realizada", "boolean", ["eq", "neq"], []),
      field("is_sent", "Enviado", "boolean", ["eq", "neq"], []),
      field("submission_type", "Tipo de envio", "string", ["eq", "neq", "contains", "in"], []),
      field(
        "installment_amount",
        "Valor da parcela",
        "number",
        ["eq", "gt", "gte", "lt", "lte", "between"],
        ["sum", "avg", "min", "max"],
      ),
      field("competence", "Competência", "string", ["eq", "neq", "contains", "in"], []),
    ],
  },
  {
    key: "parcelamento.panoramas",
    label: "Panoramas de parcelamento",
    module: "parcelamento",
    minimum_permission: 1,
    fields: [
      field("client_id", "Cliente", "string", ["eq", "in"], []),
      field("competence", "Competência", "string", ["eq", "neq", "contains", "in"], []),
      field("cnd_municipal", "CND municipal", "boolean", ["eq", "neq"], []),
      field("cnd_state", "CND estadual", "boolean", ["eq", "neq"], []),
      field("cnd_federal", "CND federal", "boolean", ["eq", "neq"], []),
      field("cnd_fgts", "CND FGTS", "boolean", ["eq", "neq"], []),
      field("cnd_labor", "CND trabalhista", "boolean", ["eq", "neq"], []),
      field("protests", "Protestos", "boolean", ["eq", "neq"], []),
    ],
  },
] as const satisfies readonly ReportCatalogSource[];

function field(
  key: string,
  label: string,
  value_type: ReportCatalogSource["fields"][number]["value_type"],
  filter_operators: ReportCatalogSource["fields"][number]["filter_operators"],
  aggregations: ReportCatalogSource["fields"][number]["aggregations"],
) {
  return { key, label, value_type, filter_operators, aggregations };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function createGrant(input: {
  secret: string;
  source: string;
  fields: readonly string[];
  organizationId: string;
  requestId: string;
  body: unknown;
}): { grant: string; signature: string } {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    audience: "parcelamento-service",
    body_sha256: createHash("sha256").update(canonicalJson(input.body)).digest("hex"),
    expires_at: issuedAt + 60,
    fields: input.fields,
    issued_at: issuedAt,
    operation: "extract",
    organization_id: input.organizationId,
    request_id: input.requestId,
    source: input.source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return { signature: createHmac("sha256", input.secret).update(grant).digest("hex"), grant };
}

function isExtractResponse(
  value: unknown,
): value is { success: true; data: { rows: readonly Record<string, unknown>[] } } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { success?: unknown }).success === true &&
    Array.isArray((value as { data?: { rows?: unknown } }).data?.rows)
  );
}

export class ParcelamentoAdapter implements ReportSourceAdapter {
  readonly sources = sources;
  readonly relations = [];

  constructor(
    private readonly env: Pick<
      ReportsServiceEnv,
      "parcelamentoServiceUrl" | "reportsInternalToken" | "reportsGrantSecret" | "sourceTimeoutMs"
    >,
  ) {}

  isEnabled(scope: { modules: Readonly<Record<string, number>> }): boolean {
    return (scope.modules.parcelamento ?? 0) >= 1;
  }

  async preview(input: ReportPreviewAdapterInput): Promise<readonly Record<string, unknown>[]> {
    const definition = input.definition as ReportDefinition;
    if (
      definition.sources.length !== 1 ||
      definition.joins.length > 0 ||
      definition.filters.length > 0 ||
      definition.aggregations.length > 0 ||
      definition.order_by.length > 0
    ) {
      throw new ServiceError(400, "A prévia de Parcelamento aceita somente colunas de uma fonte.");
    }
    const source = definition.sources[0];
    const fields = definition.columns.map((column) => column.field);
    if (new Set(fields).size !== fields.length) {
      throw new ServiceError(400, "As colunas de Parcelamento devem usar campos únicos.");
    }
    const body = { source, fields, limit: input.limit };
    const requestId = input.request_id || randomUUID();
    const signed = createGrant({
      secret: this.env.reportsGrantSecret,
      source,
      fields,
      organizationId: input.organization_id,
      requestId,
      body,
    });

    try {
      const response = await fetch(
        new URL("/internal/reporting/extract", this.env.parcelamentoServiceUrl),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [INTERNAL_SERVICE_TOKEN_HEADER]: this.env.reportsInternalToken,
            [REQUEST_ID_HEADER]: requestId,
            [REPORTS_GRANT_HEADER]: signed.grant,
            [REPORTS_GRANT_SIGNATURE_HEADER]: signed.signature,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.env.sourceTimeoutMs),
        },
      );
      const payload: unknown = await response.json();
      if (!response.ok || !isExtractResponse(payload))
        throw new Error("Resposta interna inválida.");
      return payload.data.rows;
    } catch (err: unknown) {
      logError("Falha ao extrair dados de Parcelamento para relatório", {
        errorType: err instanceof Error ? err.name : typeof err,
      });
      throw new ServiceError(503, "Não foi possível obter dados de Parcelamento para o relatório.");
    }
  }
}
