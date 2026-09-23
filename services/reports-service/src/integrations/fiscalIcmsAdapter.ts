import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  fiscalIcmsReportingCatalog,
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  MAX_REPORTING_QUERY_LIMIT,
  REQUEST_ID_HEADER,
  ServiceError,
} from "@workspace/shared";
import type {
  ReportCatalogRelation,
  ReportCatalogSource,
  ReportPreviewAdapterInput,
  ReportSourceAdapter,
} from "../catalog/types.js";
import type { ReportsServiceEnv } from "../config/env.js";
import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";
import {
  assertReportSourceResponse,
  reportCriteria,
  reportingQueryFields,
} from "./reportCriteria.js";

const REPORTS_GRANT_HEADER = "x-reports-grant";
const REPORTS_GRANT_SIGNATURE_HEADER = "x-reports-grant-signature";

const sources = fiscalIcmsReportingCatalog.sources.map(
  ({ keys: _keys, ...source }) => source,
) as readonly ReportCatalogSource[];
const relations: readonly ReportCatalogRelation[] = [];

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
    audience: "fiscal-service",
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

export class FiscalIcmsAdapter implements ReportSourceAdapter {
  readonly sources = sources;
  readonly relations = relations;

  constructor(
    private readonly env: Pick<
      ReportsServiceEnv,
      "fiscalServiceUrl" | "reportsInternalToken" | "reportsGrantSecret" | "sourceTimeoutMs"
    >,
  ) {}

  isEnabled(scope: { modules: Readonly<Record<string, number>> }): boolean {
    return (scope.modules.fiscal ?? 0) >= 1;
  }

  async preview(input: ReportPreviewAdapterInput): Promise<readonly Record<string, unknown>[]> {
    const definition = input.definition as ReportDefinition;
    if (definition.sources.length !== 1 || definition.joins.length > 0) {
      throw new ServiceError(400, "A prévia de ICMS fiscal aceita somente colunas de uma fonte.");
    }
    const source = definition.sources[0];
    const fields = definition.columns.map((column) => column.field);
    if (new Set(fields).size !== fields.length) {
      throw new ServiceError(400, "As colunas de ICMS fiscal devem usar campos únicos.");
    }
    const body = {
      ...reportCriteria(definition, input.parameter_values),
      source,
      fields,
      limit: Math.min(input.limit, MAX_REPORTING_QUERY_LIMIT),
    };
    const requestId = input.request_id || randomUUID();
    const signed = createGrant({
      secret: this.env.reportsGrantSecret,
      source,
      fields: reportingQueryFields(fields, body.query),
      organizationId: input.organization_id,
      requestId,
      body,
    });

    try {
      const response = await fetch(
        new URL("/internal/reporting/extract", this.env.fiscalServiceUrl),
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
      assertReportSourceResponse(response);
      const payload: unknown = await response.json();
      if (!response.ok || !isExtractResponse(payload)) {
        throw new Error("Resposta interna inválida.");
      }
      return payload.data.rows;
    } catch (err: unknown) {
      logError("Falha ao extrair ICMS fiscal para relatório", {
        errorType: err instanceof Error ? err.name : typeof err,
      });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(503, "Não foi possível obter ICMS fiscal para o relatório.");
    }
  }
}
