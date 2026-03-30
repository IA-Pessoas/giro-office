import { randomUUID } from "node:crypto";

import {
  createAuditRecorder,
  type CreateAuditRequestPayload,
} from "@workspace/shared/audit";
import { createLogger } from "@workspace/shared/logger";

import { getTaskServiceEnv } from "../config/env.js";

const env = getTaskServiceEnv();
const logger = createLogger({
  service: "task-service",
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
  permission?: number | null;
  action: string;
  referring: string;
  referringId: string;
  changes: Record<string, unknown> | string;
}

export interface LogUpdateParams {
  userId: string;
  organizationId?: string | null;
  permission?: number | null;
  action: string;
  referring: string;
  referringId: string;
  oldData: Record<string, unknown> | null;
  updatedData: Record<string, unknown>;
}

export async function createLog(params: CreateLogParams): Promise<void> {
  const now = new Date().toISOString();
  const payload: CreateAuditRequestPayload = {
    requestId: randomUUID(),
    organizationId: params.organizationId ?? null,
    userId: params.userId,
    permission: params.permission ?? null,
    method: "ENTITY_CHANGE",
    path: `/${params.referring.replace(/\./g, "/")}`,
    outcome: "success",
    serviceSource: "task-service",
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

  if (params.oldData) {
    for (const key of Object.keys(params.updatedData)) {
      const oldVal = params.oldData[key as keyof typeof params.oldData];
      const newVal = params.updatedData[key as keyof typeof params.updatedData];
      if (newVal !== oldVal) {
        changes[key] = { from: oldVal, to: newVal };
      }
    }
  }

  const now = new Date().toISOString();
  const payload: CreateAuditRequestPayload = {
    requestId: randomUUID(),
    organizationId: params.organizationId ?? null,
    userId: params.userId,
    permission: params.permission ?? null,
    method: "ENTITY_CHANGE",
    path: `/${params.referring.replace(/\./g, "/")}`,
    outcome: "success",
    serviceSource: "task-service",
    createdAt: now,
    finishedAt: now,
    action: params.action,
    referring: params.referring,
    referringId: params.referringId,
    changes: Object.keys(changes).length > 0 ? changes : {},
  };

  await recordAudit(payload);
}
