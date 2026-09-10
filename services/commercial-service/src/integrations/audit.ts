import { randomUUID } from "node:crypto";

import { type CreateAuditRequestPayload, createAuditRecorder } from "@workspace/shared/audit";
import { createLogger } from "@workspace/shared/logger";

import { getCommercialServiceEnv } from "../config/env.js";

const env = getCommercialServiceEnv();
const logger = createLogger({
  service: "commercial-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});
const recordAudit = createAuditRecorder({
  enabled: env.auditEnabled,
  serviceUrl: env.auditServiceUrl,
  serviceToken: env.auditServiceToken,
  logger,
});

export interface CreateLogParams {
  userId: string;
  organizationId?: string | null;
  action: string;
  referring: string;
  referringId: string;
  changes: Record<string, unknown> | string;
  auditCorrelationId?: string;
}

export interface LogUpdateParams extends Omit<CreateLogParams, "changes"> {
  oldData: Record<string, unknown> | null;
  updatedData: Record<string, unknown>;
}

export async function createLog(params: CreateLogParams): Promise<void> {
  const now = new Date().toISOString();
  const payload: CreateAuditRequestPayload = {
    requestId: params.auditCorrelationId ?? randomUUID(),
    organizationId: params.organizationId ?? null,
    userId: params.userId,
    permission: null,
    method: "ENTITY_CHANGE",
    path: `/${params.referring.replace(/\./g, "/")}`,
    outcome: "success",
    serviceSource: "commercial-service",
    createdAt: now,
    finishedAt: now,
    action: params.action,
    referring: params.referring,
    referringId: params.referringId,
    changes: typeof params.changes === "string" ? params.changes : params.changes,
  };
  await recordAudit(payload);
}

export async function logUpdateIfChanged(params: LogUpdateParams): Promise<void> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(params.updatedData)) {
    const oldValue = params.oldData?.[key];
    const newValue = params.updatedData[key];
    if (oldValue !== newValue) changes[key] = { from: oldValue, to: newValue };
  }
  if (Object.keys(changes).length === 0) return;
  await createLog({ ...params, changes });
}
