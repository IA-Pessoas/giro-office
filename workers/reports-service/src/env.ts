import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";
import type { ReportsServiceEnv } from "../../../services/reports-service/src/config/env.js";
import { bindingName, bindingUrl, type SourceService } from "./sourceFetch.js";

export interface ReportsWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  NODE_ENV?: string;
  USER_SERVICE_URL?: string;
  USER_SERVICE_INTERNAL_TOKEN?: string;
  REPORTS_INTERNAL_TOKEN?: string;
  REPORTS_GRANT_SECRET?: string;
  CERTIFICATE_REPORTING_TOKEN?: string;
  CERTIFICATE_REPORTING_GRANT_SECRET?: string;
  REGULARIZE_REPORTING_TOKEN?: string;
  REGULARIZE_REPORTING_GRANT_SECRET?: string;
  AUDIT_ENABLED?: string;
  AUDIT_SERVICE_URL?: string;
  AUDIT_SERVICE_TOKEN?: string;
  AUDIT_SERVICE?: ServiceBinding;
  USER_SERVICE?: ServiceBinding;
  PARCELAMENTO_SERVICE?: ServiceBinding;
  CLIENT_SERVICE?: ServiceBinding;
  CONTABIL_SERVICE?: ServiceBinding;
  TASK_SERVICE?: ServiceBinding;
  PROJECT_SERVICE?: ServiceBinding;
  CERTIFICATE_SERVICE?: ServiceBinding;
  FISCAL_SERVICE?: ServiceBinding;
  PESSOAL_SERVICE?: ServiceBinding;
  REGULARIZE_SERVICE?: ServiceBinding;
  TI_SERVICE?: ServiceBinding;
  RH_SERVICE?: ServiceBinding;
  REPORTS_WORKER_CONCURRENCY?: string;
  REPORTS_WORKER_LEASE_SECONDS?: string;
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
  REPORTS_SOURCE_TIMEOUT_MS?: string;
  REPORTS_PREVIEW_ROW_LIMIT?: string;
}

const localServiceUrl = "http://127.0.0.1:9";
const DEFAULT_SOURCE_TIMEOUT_MS = 10_000;
const MIN_SOURCE_TIMEOUT_MS = 100;
const MAX_SOURCE_TIMEOUT_MS = 60_000;

function positiveInteger(
  value: string | number | undefined,
  fallback: number,
  maximum?: number,
  minimum = 1,
) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) &&
    parsed >= minimum &&
    (maximum === undefined || parsed <= maximum)
    ? parsed
    : fallback;
}

/** URL explícita vence; com binding, o host que o fetch roteador entrega a ele. */
function sourceUrl(env: Partial<ReportsWorkerEnv>, service: SourceService, explicit?: string) {
  if (explicit) return explicit;
  return env[bindingName(service)] ? bindingUrl(service) : localServiceUrl;
}

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
    auditServiceUrl: env.AUDIT_SERVICE_URL ?? "",
    auditServiceToken: env.AUDIT_SERVICE_TOKEN ?? "",
    userServiceUrl: sourceUrl(env, "user", env.USER_SERVICE_URL),
    parcelamentoServiceUrl: sourceUrl(env, "parcelamento", env.PARCELAMENTO_SERVICE_URL),
    clientServiceUrl: sourceUrl(env, "client", env.CLIENT_SERVICE_URL),
    contabilServiceUrl: sourceUrl(env, "contabil", env.CONTABIL_SERVICE_URL),
    taskServiceUrl: sourceUrl(env, "task", env.TASK_SERVICE_URL),
    projectServiceUrl: sourceUrl(env, "project", env.PROJECT_SERVICE_URL),
    certificateServiceUrl: sourceUrl(env, "certificate", env.CERTIFICATE_SERVICE_URL),
    fiscalServiceUrl: sourceUrl(env, "fiscal", env.FISCAL_SERVICE_URL),
    pessoalServiceUrl: sourceUrl(env, "pessoal", env.PESSOAL_SERVICE_URL),
    regularizeServiceUrl: sourceUrl(env, "regularize", env.REGULARIZE_SERVICE_URL),
    tiServiceUrl: sourceUrl(env, "ti", env.TI_SERVICE_URL),
    regularizeReportingToken: env.REGULARIZE_REPORTING_TOKEN ?? "",
    regularizeReportingGrantSecret: env.REGULARIZE_REPORTING_GRANT_SECRET ?? "",
    rhServiceUrl: sourceUrl(env, "rh", env.RH_SERVICE_URL),
    sourceTimeoutMs: positiveInteger(
      env.REPORTS_SOURCE_TIMEOUT_MS,
      DEFAULT_SOURCE_TIMEOUT_MS,
      MAX_SOURCE_TIMEOUT_MS,
      MIN_SOURCE_TIMEOUT_MS,
    ),
    previewRowLimit: positiveInteger(env.REPORTS_PREVIEW_ROW_LIMIT, 100, 1000),
  } as ReportsServiceEnv;
}
