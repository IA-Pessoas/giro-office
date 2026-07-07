import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";

const NOTIFICATION_CREATE_CHUNK_SIZE = 100;
const UNION_REGARDING = "union";

const tomorrowNotification = {
  title: "Sindicato prestes a vencer",
  message: "Data base sera alcancada amanha.",
} as const;

const monthAgoNotification = {
  title: "Sindicato vencido",
  message: "Data base foi alcancada no mes passado.",
} as const;

const unionOrganizationSelect = {
  organization_id: true,
} as const;

const unionCandidateSelect = {
  id: true,
  name: true,
  base_date: true,
  organization_id: true,
} as const;

const permissionUserSelect = {
  user_id: true,
} as const;

const notificationIdentitySelect = {
  user_id: true,
  regarding_id: true,
  title: true,
  reference_date: true,
} as const;

type UnionCandidate = {
  id: string;
  name: string;
  base_date: Date | null;
  organization_id: string;
};

type NotificationCandidate = {
  user_id: string;
  regarding: typeof UNION_REGARDING;
  regarding_id: string;
  title: string;
  message: string;
  reference_date: Date;
  organization_id: string;
};

export interface UnionNotificationRunInput {
  now: Date;
}

export interface UnionNotificationRunResult {
  organizations: number;
  unionsMatched: number;
  notificationsCreated: number;
  duplicatesSkipped: number;
}

export class UnionNotificationService {
  constructor(private readonly prisma: PrismaClient) {}

  async runForDate(input: UnionNotificationRunInput): Promise<UnionNotificationRunResult> {
    try {
      const organizationRows = await this.prisma.unionPessoal.findMany({
        where: { base_date: { not: null } },
        select: unionOrganizationSelect,
        distinct: ["organization_id"],
        orderBy: { organization_id: "asc" },
      });

      const result: UnionNotificationRunResult = {
        organizations: organizationRows.length,
        unionsMatched: 0,
        notificationsCreated: 0,
        duplicatesSkipped: 0,
      };

      for (const row of organizationRows) {
        await this.processOrganization(row.organization_id, input.now, result);
      }

      return result;
    } catch (err: unknown) {
      logError("Erro ao executar notificacoes de sindicatos de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao executar notificacoes de sindicatos de pessoal.", err);
    }
  }

  private async processOrganization(
    organizationId: string,
    now: Date,
    result: UnionNotificationRunResult,
  ): Promise<void> {
    const [permissions, unions] = await Promise.all([
      this.prisma.permission.findMany({
        where: {
          organization_id: organizationId,
          pessoal: { gte: 1 },
          user: {
            organization_id: organizationId,
            status: "Ativo",
          },
        },
        select: permissionUserSelect,
      }),
      this.prisma.unionPessoal.findMany({
        where: {
          organization_id: organizationId,
          base_date: { not: null },
        },
        select: unionCandidateSelect,
        orderBy: { name: "asc" },
      }),
    ]);

    const userIds = permissions.map((permission) => permission.user_id);
    const matchingUnions = getMatchingUnionNotifications(unions, now);
    result.unionsMatched += matchingUnions.length;
    if (userIds.length === 0 || matchingUnions.length === 0) {
      return;
    }

    const unionIds = [...new Set(matchingUnions.map((candidate) => candidate.regarding_id))];
    const titles = [...new Set(matchingUnions.map((candidate) => candidate.title))];
    const referenceDates = [
      ...new Set(matchingUnions.map((candidate) => candidate.reference_date.toISOString())),
    ].map((date) => new Date(date));
    const existingNotifications = await this.prisma.pessoalNotification.findMany({
      where: {
        organization_id: organizationId,
        regarding: UNION_REGARDING,
        user_id: { in: userIds },
        regarding_id: { in: unionIds },
        title: { in: titles },
        reference_date: { in: referenceDates },
      },
      select: notificationIdentitySelect,
    });
    const existingKeys = new Set(
      existingNotifications.map((notification) =>
        getNotificationKey(
          notification.user_id,
          notification.regarding_id,
          notification.title,
          notification.reference_date,
        ),
      ),
    );

    const createData: NotificationCandidate[] = [];
    for (const candidate of matchingUnions) {
      for (const userId of userIds) {
        const key = getNotificationKey(
          userId,
          candidate.regarding_id,
          candidate.title,
          candidate.reference_date,
        );
        if (existingKeys.has(key)) {
          result.duplicatesSkipped += 1;
          continue;
        }

        createData.push({
          ...candidate,
          user_id: userId,
        });
        existingKeys.add(key);
      }
    }

    for (let index = 0; index < createData.length; index += NOTIFICATION_CREATE_CHUNK_SIZE) {
      const chunk = createData.slice(index, index + NOTIFICATION_CREATE_CHUNK_SIZE);
      const createResult = await this.prisma.pessoalNotification.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      result.notificationsCreated += createResult.count;
    }
  }
}

function getMatchingUnionNotifications(
  unions: UnionCandidate[],
  now: Date,
): Omit<NotificationCandidate, "user_id">[] {
  const tomorrow = startOfUtcDay(addUtcDays(now, 1));
  const monthAgoFromTomorrow = startOfUtcDay(addUtcMonths(tomorrow, -1));
  const candidates: Omit<NotificationCandidate, "user_id">[] = [];

  for (const union of unions) {
    if (!union.base_date) {
      continue;
    }

    if (hasSameUtcMonthDay(union.base_date, tomorrow)) {
      candidates.push({
        regarding: UNION_REGARDING,
        regarding_id: union.id,
        title: tomorrowNotification.title,
        message: tomorrowNotification.message,
        reference_date: tomorrow,
        organization_id: union.organization_id,
      });
    }

    if (hasSameUtcMonthDay(union.base_date, monthAgoFromTomorrow)) {
      candidates.push({
        regarding: UNION_REGARDING,
        regarding_id: union.id,
        title: monthAgoNotification.title,
        message: monthAgoNotification.message,
        reference_date: monthAgoFromTomorrow,
        organization_id: union.organization_id,
      });
    }
  }

  return candidates;
}

function addUtcDays(value: Date, days: number): Date {
  const out = new Date(value);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function addUtcMonths(value: Date, months: number): Date {
  const out = new Date(value);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function hasSameUtcMonthDay(left: Date, right: Date): boolean {
  return left.getUTCMonth() === right.getUTCMonth() && left.getUTCDate() === right.getUTCDate();
}

function getNotificationKey(
  userId: string,
  regardingId: string,
  title: string,
  referenceDate: Date,
): string {
  return `${userId}|${regardingId}|${title}|${referenceDate.toISOString()}`;
}
