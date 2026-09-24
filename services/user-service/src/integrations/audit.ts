import { randomUUID } from "node:crypto";
import { ServiceError } from "@workspace/shared";
import {
  type AuditOutcome,
  type CreateAuditRequestPayload,
  createAuditRecorder,
} from "@workspace/shared/audit";
import type { Logger } from "@workspace/shared/logger";
import type { ImpersonationEndEvent } from "../services/authService.js";

export interface CreateUserAuditParams {
  requestId?: string;
  actorUserId?: string;
  platformActorUserId?: string;
  organizationId?: string | null;
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

export interface ImpersonationStartEvent {
  organizationId: string;
  targetUserId: string;
  targetName: string;
  platformUserId: string;
  startedAt: Date;
}

export function impersonationStartAuditParams(
  event: ImpersonationStartEvent,
): CreateUserAuditParams {
  return {
    actorUserId: event.targetUserId,
    platformActorUserId: event.platformUserId,
    organizationId: event.organizationId,
    action: "platform.impersonation.started",
    referring: "user",
    referringId: event.targetUserId,
    changes: {
      operatorPlatformUserId: event.platformUserId,
      target: { id: event.targetUserId, name: event.targetName },
      startedAt: event.startedAt.toISOString(),
    },
    outcome: "success",
    required: true,
  };
}

export function impersonationEndAuditParams(event: ImpersonationEndEvent): CreateUserAuditParams {
  return {
    actorUserId: event.targetUserId,
    platformActorUserId: event.platformUserId,
    organizationId: event.organizationId,
    action: "platform.impersonation.ended",
    referring: "user",
    referringId: event.targetUserId,
    changes: {
      operatorPlatformUserId: event.platformUserId,
      target: { id: event.targetUserId, name: event.targetName },
      startedAt: event.startedAt.toISOString(),
      endedAt: event.endedAt.toISOString(),
      durationMs: event.durationMs,
      reason: event.reason,
    },
    outcome: "success",
    required: true,
  };
}

export function createUserAudit(options: UserAuditOptions): UserAuditRecorder {
  const recordAudit = createAuditRecorder(options);

  return async (params) => {
    const now = new Date().toISOString();
    const payload: CreateAuditRequestPayload = {
      requestId: params.requestId ?? randomUUID(),
      organizationId: params.organizationId ?? null,
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
      } catch (err: unknown) {
        options.logger.error({ err }, "Falha na auditoria obrigatória para ação de plataforma.");
        throw new ServiceError(503, "Auditoria indisponível para registrar a ação.");
      }
      return;
    }

    await recordAudit(payload);
  };
}
