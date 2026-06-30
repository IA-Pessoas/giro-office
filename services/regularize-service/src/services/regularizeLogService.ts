import type { PrismaClient } from "../generated/prisma/client.js";

interface CreateLogInput {
  userId: string;
  organizationId: string;
  action: string;
  referring: string;
  referringId: string;
  changes: unknown;
}

interface LogUpdateInput {
  userId: string;
  organizationId: string;
  action: string;
  referring: string;
  referringId: string;
  oldData: Record<string, unknown> | null;
  updatedData: Record<string, unknown>;
}

const sensitiveLogFields = new Set(["login", "password", "user"]);
const redactedValue = "[redigido]";

function redactLogValue(key: string, value: unknown): unknown {
  if (sensitiveLogFields.has(key)) {
    return redactedValue;
  }

  return value;
}

export class RegularizeLogService {
  constructor(private readonly prisma: PrismaClient) {}

  async createLog(input: CreateLogInput): Promise<void> {
    await this.prisma.logs.create({
      data: {
        user_id: input.userId,
        organization_id: input.organizationId,
        action: input.action,
        referring: input.referring,
        referring_id: input.referringId,
        changes: input.changes as never,
      },
    });
  }

  async logUpdateIfChanged(input: LogUpdateInput): Promise<void> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    for (const key of Object.keys(input.updatedData)) {
      if (input.oldData?.[key] !== input.updatedData[key]) {
        changes[key] = {
          from: redactLogValue(key, input.oldData?.[key]),
          to: redactLogValue(key, input.updatedData[key]),
        };
      }
    }

    if (Object.keys(changes).length === 0) {
      return;
    }

    await this.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: input.action,
      referring: input.referring,
      referringId: input.referringId,
      changes,
    });
  }
}
