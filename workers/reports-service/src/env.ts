import type { WorkerEnv } from "@workspace/runtime";
import type { ReportsServiceEnv } from "../../../services/reports-service/src/config/env.js";

export interface ReportsWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  NODE_ENV?: string;
  USER_SERVICE_URL?: string;
  REPORTS_INTERNAL_TOKEN?: string;
  REPORTS_GRANT_SECRET?: string;
  CERTIFICATE_REPORTING_TOKEN?: string;
  CERTIFICATE_REPORTING_GRANT_SECRET?: string;
  REGULARIZE_REPORTING_TOKEN?: string;
  REGULARIZE_REPORTING_GRANT_SECRET?: string;
  AUDIT_ENABLED?: string;
  AUDIT_SERVICE_URL?: string;
  AUDIT_SERVICE_TOKEN?: string;
  PARCELAMENTO_SERVICE_URL?: string;
  CLIENT_SERVICE_URL?: string;
  CONTABIL_SERVICE_URL?: string;
  TASK_SERVICE_URL?: string;
  PROJECT_SERVICE_URL?: string;
  CERTIFICATE_SERVICE_URL?: string;
  FISCAL_SERVICE_URL?: string;
  PESSOAL_SERVICE_URL?: string;
  REGULARIZE_SERVICE_URL?: string;
  TI_SERVICE_URL?: string;
  RH_SERVICE_URL?: string;
  REPORTS_SOURCE_TIMEOUT_MS?: number;
  REPORTS_PREVIEW_ROW_LIMIT?: number;
}

const localServiceUrl = "http://127.0.0.1:9";

export function toReportsServiceEnv(env: Partial<ReportsWorkerEnv>): ReportsServiceEnv {
  return {
    nodeEnv: env.NODE_ENV ?? "production",
    databaseUrl: env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL ?? "",
    jwtSecret: env.JWT_SECRET ?? "",
    reportsInternalToken: env.REPORTS_INTERNAL_TOKEN ?? "",
    reportsGrantSecret: env.REPORTS_GRANT_SECRET ?? "",
    certificateReportingToken: env.CERTIFICATE_REPORTING_TOKEN ?? "",
    certificateReportingGrantSecret: env.CERTIFICATE_REPORTING_GRANT_SECRET ?? "",
    auditEnabled: env.AUDIT_ENABLED !== "false",
    auditServiceUrl: env.AUDIT_SERVICE_URL ?? "http://127.0.0.1:3020",
    auditServiceToken: env.AUDIT_SERVICE_TOKEN ?? "",
    userServiceUrl: env.USER_SERVICE_URL ?? localServiceUrl,
    parcelamentoServiceUrl: env.PARCELAMENTO_SERVICE_URL ?? localServiceUrl,
    clientServiceUrl: env.CLIENT_SERVICE_URL ?? localServiceUrl,
    contabilServiceUrl: env.CONTABIL_SERVICE_URL ?? localServiceUrl,
    taskServiceUrl: env.TASK_SERVICE_URL ?? localServiceUrl,
    projectServiceUrl: env.PROJECT_SERVICE_URL ?? localServiceUrl,
    certificateServiceUrl: env.CERTIFICATE_SERVICE_URL ?? localServiceUrl,
    fiscalServiceUrl: env.FISCAL_SERVICE_URL ?? localServiceUrl,
    pessoalServiceUrl: env.PESSOAL_SERVICE_URL ?? localServiceUrl,
    regularizeServiceUrl: env.REGULARIZE_SERVICE_URL ?? localServiceUrl,
    tiServiceUrl: env.TI_SERVICE_URL ?? localServiceUrl,
    regularizeReportingToken: env.REGULARIZE_REPORTING_TOKEN ?? "",
    regularizeReportingGrantSecret: env.REGULARIZE_REPORTING_GRANT_SECRET ?? "",
    rhServiceUrl: env.RH_SERVICE_URL ?? localServiceUrl,
    sourceTimeoutMs: env.REPORTS_SOURCE_TIMEOUT_MS ?? 10_000,
    previewRowLimit: env.REPORTS_PREVIEW_ROW_LIMIT ?? 100,
  } as ReportsServiceEnv;
}
