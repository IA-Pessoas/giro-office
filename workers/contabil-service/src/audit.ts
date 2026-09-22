import { ServiceError } from "@workspace/shared";
import type { ContabilWorkerEnv } from "./env.js";

export type AuditParams = {
  userId: string;
  organizationId?: string | null;
  permission?: number | null;
  action: string;
  referring: string;
  referringId: string;
  changes: Record<string, unknown> | string;
};

export type AuditUpdateParams = Omit<AuditParams, "changes"> & {
  oldData: Record<string, unknown> | null;
  updatedData: Record<string, unknown>;
};

export type ContabilAuditOptions = {
  timeoutMs?: number;
  retryMaxAttempts?: number;
  retryBaseDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
};

function payload(params: AuditParams): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    requestId: crypto.randomUUID(),
    organizationId: params.organizationId ?? null,
    userId: params.userId,
    permission: params.permission ?? null,
    method: "ENTITY_CHANGE",
    path: `/${params.referring.replace(/\./gu, "/")}`,
    outcome: "success",
    serviceSource: "contabil-service",
    createdAt: now,
    finishedAt: now,
    action: params.action,
    referring: params.referring,
    referringId: params.referringId,
    changes: params.changes,
  };
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isTimeout(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
  );
}

async function sendAudit(
  env: ContabilWorkerEnv,
  data: Record<string, unknown>,
  options: ContabilAuditOptions = {},
): Promise<void> {
  if (!env.AUDIT_SERVICE || !env.AUDIT_SERVICE_TOKEN) {
    throw new ServiceError(503, "Auditoria externa não configurada.");
  }

  const timeoutMs = Math.max(1, options.timeoutMs ?? 5_000);
  const maxAttempts = Math.max(1, Math.floor(options.retryMaxAttempts ?? 3));
  const baseDelayMs = Math.max(0, options.retryBaseDelayMs ?? 250);
  const sleep = options.sleep ?? defaultSleep;
  let lastStatus: number | undefined;
  let timedOut = false;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastStatus = undefined;
    timedOut = false;
    lastError = undefined;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    try {
      timeoutSignal.throwIfAborted();
      const response = await env.AUDIT_SERVICE.fetch(
        new Request("https://audit-service/internal/audit/requests", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-internal-service-token": env.AUDIT_SERVICE_TOKEN,
          },
          body: JSON.stringify(data),
          signal: timeoutSignal,
        }),
      );
      timeoutSignal.throwIfAborted();
      if (response.ok) return;
      lastStatus = response.status;
      lastError = undefined;
    } catch (error) {
      lastError = error;
      timedOut = isTimeout(error, timeoutSignal);
    }

    const retryable =
      lastStatus === undefined ||
      lastStatus === 408 ||
      lastStatus === 425 ||
      lastStatus === 429 ||
      lastStatus >= 500;
    const willRetry = retryable && attempt < maxAttempts;
    const status = timedOut ? 504 : (lastStatus ?? 503);
    const event = {
      event: willRetry ? "contabil.audit.retry" : "contabil.audit.failed",
      attempt,
      status,
      willRetry,
      requestId: data.requestId,
      ...(lastError instanceof Error ? { error: lastError.message } : {}),
    };
    if (willRetry) console.warn(event);
    else console.error(event);
    if (!willRetry) {
      throw new ServiceError(
        status,
        timedOut
          ? "Timeout ao persistir auditoria externa."
          : "Falha ao persistir auditoria externa.",
        lastError ?? lastStatus,
      );
    }
    await sleep(baseDelayMs * 2 ** (attempt - 1));
  }
}

export function createContabilAudit(env: ContabilWorkerEnv, options: ContabilAuditOptions = {}) {
  return {
    createLog: async (params: AuditParams) => sendAudit(env, payload(params), options),
    logUpdateIfChanged: async (params: AuditUpdateParams) => {
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(params.updatedData)) {
        const from = params.oldData?.[key];
        const to = params.updatedData[key];
        if (from !== to) changes[key] = { from, to };
      }
      await sendAudit(
        env,
        payload({
          userId: params.userId,
          organizationId: params.organizationId,
          permission: params.permission,
          action: params.action,
          referring: params.referring,
          referringId: params.referringId,
          changes,
        }),
        options,
      );
    },
  };
}
