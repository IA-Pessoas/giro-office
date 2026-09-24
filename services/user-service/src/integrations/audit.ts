import { randomUUID } from "node:crypto";
import { ServiceError } from "@workspace/shared";
import {
  type AuditOutcome,
  type CreateAuditRequestPayload,
  createAuditRecorder,
} from "@workspace/shared/audit";
import type { Logger } from "@workspace/shared/logger";

export interface CreateUserAuditParams {
  actorUserId?: string;
  platformActorUserId?: string;
  organizationId: string;
  action: string;
  referring: string;
  referringId: string;
  changes: Record<string, unknown>;
  outcome: AuditOutcome;
  required?: boolean;
}

export interface UserAuditOptions {
  enabled: boolean;
  serviceUrl: string;
  serviceToken: string;
  logger: Logger;
}

export type UserAuditRecorder = (params: CreateUserAuditParams) => Promise<void>;

export function createUserAudit(options: UserAuditOptions): UserAuditRecorder {
  const recordAudit = createAuditRecorder(options);

  return async (params) => {
    const now = new Date().toISOString();
    const payload: CreateAuditRequestPayload = {
      requestId: randomUUID(),
      organizationId: params.organizationId,
      ...(params.actorUserId ? { userId: params.actorUserId } : {}),
      method: "ENTITY_CHANGE",
      path: `/${params.referring}`,
      outcome: params.outcome,
      serviceSource: "user-service",
      createdAt: now,
      finishedAt: now,
      action: params.action,
      referring: params.referring,
      referringId: params.referringId,
      changes: params.changes,
      ...(params.platformActorUserId
        ? { metadata: { actorPlatformUserId: params.platformActorUserId } }
        : {}),
    };

    if (params.required) {
      try {
        await recordAudit.recordRequired(payload);
      } catch {
        throw new ServiceError(503, "Auditoria indisponível para iniciar personificação.");
      }
      return;
    }

    await recordAudit(payload);
  };
}
