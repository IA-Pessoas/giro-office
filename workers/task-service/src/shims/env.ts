import { validateProductionInternalServiceToken } from "@workspace/shared";
import type { TaskServiceEnv } from "@workspace/task-service/src/config/env.js";
import {
  AI_TASK_EXTRACTION_MODES,
  type AiTaskExtractionMode,
} from "@workspace/task-service/src/integrations/aiTaskExtraction.js";
import { currentTaskContext } from "../context.js";

export type { TaskServiceEnv };

const parseBoolean = (value: string | undefined) => value === "true" || value === "1";

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Substitui `services/task-service/src/config/env.ts` no bundle: o original lê
 * `process.env` e `dotenv` via `fileURLToPath(import.meta.url)`, que não sobe no
 * workerd. Mantém as recusas de produção do Node. URLs de serviço viram hosts
 * fictícios: as chamadas saem por Service Binding (ver shims de integração).
 */
export function getTaskServiceEnv(): TaskServiceEnv {
  const env = currentTaskContext().env;
  const nodeEnv = env.NODE_ENV ?? "production";
  const production = nodeEnv === "production";
  const aiExtractionMode = (env.AI_EXTRACTION_MODE ?? "fake") as AiTaskExtractionMode;

  if (!AI_TASK_EXTRACTION_MODES.includes(aiExtractionMode)) {
    throw new Error(`AI_EXTRACTION_MODE inválido: ${aiExtractionMode}.`);
  }
  if (aiExtractionMode === "fake" && production) {
    throw new Error("AI_EXTRACTION_MODE=fake não é permitido em produção.");
  }
  if (aiExtractionMode === "openai" && !env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY é obrigatória quando AI_EXTRACTION_MODE=openai.");
  }
  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "TASK_ATTACHMENT_STORAGE_BUCKET",
  ] as const) {
    if (production && !env[name]) {
      throw new Error(`${name} é obrigatória para anexos de tarefas em produção.`);
    }
  }

  const auditServiceToken = env.AUDIT_SERVICE_TOKEN ?? "audit-service-token";
  const commercialServiceToken = env.COMMERCIAL_SERVICE_TOKEN ?? "audit-service-token";
  const reportsInternalToken = env.REPORTS_INTERNAL_TOKEN ?? "reports-service-token";
  const reportsGrantSecret = env.REPORTS_GRANT_SECRET ?? "reports-grant-secret";
  for (const [envName, token] of [
    ["AUDIT_SERVICE_TOKEN", auditServiceToken],
    ["COMMERCIAL_SERVICE_TOKEN", commercialServiceToken],
    ["REPORTS_INTERNAL_TOKEN", reportsInternalToken],
    ["REPORTS_GRANT_SECRET", reportsGrantSecret],
  ] as const) {
    validateProductionInternalServiceToken({
      nodeEnv,
      serviceName: "task-service",
      envName,
      token,
    });
  }

  return {
    port: 0,
    databaseUrl: env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL ?? "",
    jwtSecret: env.JWT_SECRET,
    nodeEnv,
    logLevel: "info",
    logPretty: false,
    auditEnabled: parseBoolean(env.AUDIT_ENABLED ?? "true"),
    auditServiceUrl: "https://audit-service",
    auditServiceToken,
    commercialServiceToken,
    projectServiceUrl: "https://project-service",
    supabaseUrl: env.SUPABASE_URL ?? "http://localhost:54321",
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "task-attachment-storage-test-key",
    taskAttachmentStorageBucket: env.TASK_ATTACHMENT_STORAGE_BUCKET ?? "task-attachments-private",
    aiExtractionMode,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiBaseUrl: env.OPENAI_BASE_URL,
    openaiModel: env.OPENAI_MODEL,
    aiExtractionTimeoutMs: parsePositiveInteger(env.AI_EXTRACTION_TIMEOUT_MS, 30_000),
    aiExtractionRateLimitMax: parsePositiveInteger(env.AI_EXTRACTION_RATE_LIMIT_MAX, 10),
    aiExtractionRateLimitWindowMs: parsePositiveInteger(
      env.AI_EXTRACTION_RATE_LIMIT_WINDOW_MS,
      60_000,
    ),
    reportsInternalToken,
    reportsGrantSecret,
    // Sem navegador do outro lado: o Worker só é alcançável por Service Binding.
    allowedOrigins: [],
    enableApiDocs: parseBoolean(env.ENABLE_API_DOCS),
  };
}
