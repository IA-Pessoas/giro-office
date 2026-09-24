import type { Logger } from "@workspace/shared/logger";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { UserAuditOutboxStatus } from "../generated/prisma/enums.js";
import type { CreateUserAuditParams, UserAuditRecorder } from "../integrations/audit.js";

interface UserAuditOutboxEvent {
  id: string;
  payload: Prisma.JsonValue;
  attempts: number;
}

export type UserAuditOutboxPrisma = Pick<PrismaClient, "$transaction">;

const LEASE_MS = 120_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readAuditParams(payload: Prisma.JsonValue): CreateUserAuditParams | null {
  if (
    !isRecord(payload) ||
    typeof payload.requestId !== "string" ||
    typeof payload.action !== "string" ||
    typeof payload.referring !== "string" ||
    typeof payload.referringId !== "string" ||
    !isRecord(payload.changes) ||
    (payload.outcome !== "success" &&
      payload.outcome !== "error" &&
      payload.outcome !== "aborted") ||
    payload.required !== true
  ) {
    return null;
  }
  const optionalStrings = [payload.actorUserId, payload.platformActorUserId];
  if (optionalStrings.some((value) => value !== undefined && typeof value !== "string")) {
    return null;
  }
  if (
    payload.organizationId !== undefined &&
    payload.organizationId !== null &&
    typeof payload.organizationId !== "string"
  ) {
    return null;
  }

  return {
    requestId: payload.requestId,
    ...(typeof payload.actorUserId === "string" ? { actorUserId: payload.actorUserId } : {}),
    ...(typeof payload.platformActorUserId === "string"
      ? { platformActorUserId: payload.platformActorUserId }
      : {}),
    ...(typeof payload.organizationId === "string" || payload.organizationId === null
      ? { organizationId: payload.organizationId }
      : {}),
    action: payload.action,
    referring: payload.referring,
    referringId: payload.referringId,
    changes: payload.changes,
    outcome: payload.outcome,
    required: true,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida na auditoria.";
}

export class UserAuditOutboxService {
  constructor(
    private readonly prisma: UserAuditOutboxPrisma,
    private readonly audit: UserAuditRecorder,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async processNext(): Promise<boolean> {
    const event = await this.claimNext();
    if (!event) return false;

    const params = readAuditParams(event.payload);
    if (!params) {
      await this.updateEvent({
        where: { id: event.id, status: UserAuditOutboxStatus.processing },
        data: {
          status: UserAuditOutboxStatus.failed,
          locked_at: null,
          last_error: "Payload de auditoria inválido.",
        },
      });
      this.logger.error({ event: "user.audit_outbox.invalid", outboxEventId: event.id });
      return true;
    }

    try {
      await this.audit(params);
    } catch (error: unknown) {
      this.logger.warn({ event: "user.audit_outbox.retry", outboxEventId: event.id, error });
      const delayMs = Math.min(1_000 * 2 ** Math.max(0, event.attempts - 1), 60_000);
      await this.updateEvent({
        where: { id: event.id, status: UserAuditOutboxStatus.processing },
        data: {
          status: UserAuditOutboxStatus.pending,
          available_at: new Date(this.now().getTime() + delayMs),
          locked_at: null,
          last_error: errorMessage(error),
        },
      });
      return true;
    }

    await this.updateEvent({
      where: { id: event.id, status: UserAuditOutboxStatus.processing },
      data: {
        status: UserAuditOutboxStatus.delivered,
        processed_at: this.now(),
        locked_at: null,
        last_error: null,
      },
    });
    return true;
  }

  private async claimNext(): Promise<UserAuditOutboxEvent | null> {
    const now = this.now();
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE "giro_user_service_audit_runtime"`;
      await transaction.userAuditOutboxEvent.updateMany({
        where: {
          status: UserAuditOutboxStatus.processing,
          locked_at: { lt: new Date(now.getTime() - LEASE_MS) },
        },
        data: { status: UserAuditOutboxStatus.pending, available_at: now, locked_at: null },
      });
      const event = await transaction.userAuditOutboxEvent.findFirst({
        where: { status: UserAuditOutboxStatus.pending, available_at: { lte: now } },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        select: { id: true, payload: true, attempts: true },
      });
      if (!event) return null;

      const claimed = await transaction.userAuditOutboxEvent.updateMany({
        where: { id: event.id, status: UserAuditOutboxStatus.pending },
        data: {
          status: UserAuditOutboxStatus.processing,
          locked_at: now,
          attempts: { increment: 1 },
        },
      });
      return claimed.count === 1 ? { ...event, attempts: event.attempts + 1 } : null;
    });
  }

  private async updateEvent(args: Prisma.UserAuditOutboxEventUpdateManyArgs): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE "giro_user_service_audit_runtime"`;
      await transaction.userAuditOutboxEvent.updateMany(args);
    });
  }
}
