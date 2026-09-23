import { randomUUID } from "node:crypto";
import {
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  MAX_REPORTING_QUERY_LIMIT,
  REQUEST_ID_HEADER,
  regularizeMunicipalTaxesReportingCatalog,
  ServiceError,
} from "@workspace/shared";
import type {
  ReportCatalogRelation,
  ReportPreviewAdapterInput,
  ReportPreviewAdapterResult,
  ReportSourceAdapter,
} from "../catalog/types.js";
import type { ReportsServiceEnv } from "../config/env.js";
import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";
import {
  createRegularizeReportingGrant,
  isRegularizeExtractResponse,
  projectRegularizeReportingRows,
  publicReportingSources,
} from "./regularizeReportingProtocol.js";
import {
  readReportSourcePayload,
  reportCriteria,
  reportingQueryFields,
  reportResultFields,
} from "./reportCriteria.js";

const REPORTS_GRANT_HEADER = "x-reports-grant";
const REPORTS_GRANT_SIGNATURE_HEADER = "x-reports-grant-signature";
const sources = publicReportingSources(regularizeMunicipalTaxesReportingCatalog.sources);
const relations: readonly ReportCatalogRelation[] = [];

export class RegularizeMunicipalTaxesAdapter implements ReportSourceAdapter {
  readonly sources = sources;
  readonly relations = relations;

  constructor(
    private readonly env: Pick<
      ReportsServiceEnv,
      | "regularizeServiceUrl"
      | "regularizeReportingToken"
      | "regularizeReportingGrantSecret"
      | "sourceTimeoutMs"
    >,
  ) {}

  isEnabled(scope: { modules: Readonly<Record<string, number>> }): boolean {
    return (scope.modules.regularize ?? 0) >= 1;
  }

  async preview(input: ReportPreviewAdapterInput): Promise<ReportPreviewAdapterResult> {
    const definition = input.definition as ReportDefinition;
    if (definition.sources.length !== 1 || definition.joins.length > 0) {
      throw new ServiceError(
        400,
        "A prévia de Tributos Municipais do Regularize aceita somente colunas de uma fonte.",
      );
    }
    const source = definition.sources[0];
    const fields = definition.columns.map((column) => column.field);
    if (new Set(fields).size !== fields.length) {
      throw new ServiceError(
        400,
        "As colunas de Tributos Municipais do Regularize devem usar campos únicos.",
      );
    }
    const body = {
      ...reportCriteria(definition, input.parameter_values),
      source,
      fields,
      limit: Math.min(input.limit, MAX_REPORTING_QUERY_LIMIT),
    };
    const requestId = input.request_id || randomUUID();
    const signed = createRegularizeReportingGrant({
      secret: this.env.regularizeReportingGrantSecret,
      source,
      fields: reportingQueryFields(fields, body.query),
      organizationId: input.organization_id,
      requestId,
      body,
    });

    try {
      const response = await fetch(
        new URL("/internal/reporting/extract", this.env.regularizeServiceUrl),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [INTERNAL_SERVICE_TOKEN_HEADER]: this.env.regularizeReportingToken,
            [REQUEST_ID_HEADER]: requestId,
            [REPORTS_GRANT_HEADER]: signed.grant,
            [REPORTS_GRANT_SIGNATURE_HEADER]: signed.signature,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.env.sourceTimeoutMs),
        },
      );
      const payload = await readReportSourcePayload(response);
      if (!response.ok || !isRegularizeExtractResponse(payload)) {
        throw new Error("Resposta interna inválida.");
      }
      return {
        rows: projectRegularizeReportingRows(
          payload.data.rows,
          reportResultFields(fields, body.query),
        ),
        reachedLimit: payload.data.reachedLimit,
      };
    } catch (err: unknown) {
      logError("Falha ao extrair tributos municipais do Regularize para relatório", {
        errorType: err instanceof Error ? err.name : typeof err,
      });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(
        503,
        "Não foi possível obter Tributos Municipais do Regularize para o relatório.",
      );
    }
  }
}
