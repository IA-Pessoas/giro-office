import { ServiceError } from "@workspace/shared";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

const COMPETENCE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function normalizeMarketingCompetence(value: string): Date {
  const match = COMPETENCE_PATTERN.exec(value);
  if (!match) throw new ServiceError(400, "Informe a competência no formato AAAA-MM.");

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1) throw new ServiceError(400, "A competência informada é inválida.");
  return new Date(Date.UTC(year, month - 1, 1));
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

function activeUserScope(organizationId: string) {
  return {
    status: "active",
    OR: [
      { organization_id: organizationId },
      { organization_id: null, department: { organization_id: organizationId } },
    ],
  };
}

export type MarketingAiUsageAnswers = {
  knowledge: boolean | null;
  integration: boolean | null;
  frequency: number | null;
  purpose: string | null;
  perceived_gain: string | null;
};

export type MarketingLegacyAiUsageRecord = MarketingAiUsageAnswers & {
  legacyUserId: string;
  competence: string;
};

const USER_SUMMARY = { id: true, name: true, full_name: true } as const;
const CONTROL_ORDER = [{ user: { name: "asc" as const } }, { id: "asc" as const }];

export class MarketingAiUsageControlService {
  constructor(private readonly prisma: PrismaClient) {}

  async createForUser(
    organizationId: string,
    userId: string,
    competenceValue: string,
  ): Promise<{ id: string }> {
    const competence = normalizeMarketingCompetence(competenceValue);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, ...activeUserScope(organizationId) },
      select: { id: true },
    });
    if (!user) throw new ServiceError(404, "Usuário ativo não encontrado nesta organização.");

    try {
      return await this.prisma.marketingAiUsageControl.create({
        data: { organization_id: organizationId, user_id: userId, competence },
        select: { id: true },
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw new ServiceError(409, "Já existe um controle para este usuário e competência.");
      }
      throw error;
    }
  }

  async createForActiveUsers(
    organizationId: string,
    competenceValue: string,
  ): Promise<{ created: number; alreadyExisted: number }> {
    const competence = normalizeMarketingCompetence(competenceValue);
    const users = await this.prisma.user.findMany({
      where: activeUserScope(organizationId),
      select: { id: true },
    });
    if (users.length === 0) return { created: 0, alreadyExisted: 0 };

    const result = await this.prisma.marketingAiUsageControl.createMany({
      data: users.map(({ id: userId }) => ({
        organization_id: organizationId,
        user_id: userId,
        competence,
      })),
      skipDuplicates: true,
    });
    return { created: result.count, alreadyExisted: users.length - result.count };
  }

  async listEligibleUsers(
    organizationId: string,
  ): Promise<Array<{ id: string; name: string; full_name: string | null }>> {
    return this.prisma.user.findMany({
      where: activeUserScope(organizationId),
      select: USER_SUMMARY,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  async importLegacyRecords(organizationId: string, records: MarketingLegacyAiUsageRecord[]) {
    const validUserIds = [
      ...new Set(
        records
          .map((record) => record.legacyUserId)
          .filter((id) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
          ),
      ),
    ];
    const users = validUserIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: { in: validUserIds },
            OR: [
              { organization_id: organizationId },
              { organization_id: null, department: { organization_id: organizationId } },
            ],
          },
          select: { id: true },
        })
      : [];
    const userIds = new Set(users.map(({ id }) => id));
    const importable: Array<{
      organization_id: string;
      user_id: string;
      competence: Date;
      knowledge: boolean | null;
      integration: boolean | null;
      frequency: number | null;
      purpose: string | null;
      perceived_gain: string | null;
    }> = [];
    const reconciliation: Array<{
      organization_id: string;
      legacy_user_id: string;
      legacy_competence: string;
      payload: Prisma.InputJsonValue;
      reason: string;
      status: "pending";
    }> = [];

    for (const record of records) {
      let competence: Date;
      try {
        competence = normalizeMarketingCompetence(record.competence);
      } catch {
        reconciliation.push({
          organization_id: organizationId,
          legacy_user_id: record.legacyUserId,
          legacy_competence: record.competence,
          payload: record as unknown as Prisma.InputJsonValue,
          reason: "invalid-competence",
          status: "pending",
        });
        continue;
      }

      if (!userIds.has(record.legacyUserId)) {
        reconciliation.push({
          organization_id: organizationId,
          legacy_user_id: record.legacyUserId,
          legacy_competence: record.competence,
          payload: record as unknown as Prisma.InputJsonValue,
          reason: "unmatched-user",
          status: "pending",
        });
        continue;
      }

      importable.push({
        organization_id: organizationId,
        user_id: record.legacyUserId,
        competence,
        knowledge: record.knowledge,
        integration: record.integration,
        frequency: record.frequency,
        purpose: record.purpose,
        perceived_gain: record.perceived_gain,
      });
    }

    const uniqueReconciliation = [
      ...new Map(
        reconciliation.map((record) => [
          JSON.stringify([record.organization_id, record.legacy_user_id, record.legacy_competence]),
          record,
        ]),
      ).values(),
    ];

    const [created, staged] = await Promise.all([
      importable.length
        ? this.prisma.marketingAiUsageControl.createMany({ data: importable, skipDuplicates: true })
        : Promise.resolve({ count: 0 }),
      uniqueReconciliation.length
        ? this.prisma.marketingAiUsageImportReconciliation.createMany({
            data: uniqueReconciliation,
            skipDuplicates: true,
          })
        : Promise.resolve({ count: 0 }),
    ]);

    return {
      imported: created.count,
      alreadyExisted: importable.length - created.count,
      reconciliation: staged.count,
    };
  }

  async listImportReconciliation(organizationId: string) {
    return this.prisma.marketingAiUsageImportReconciliation.findMany({
      where: { organization_id: organizationId, status: "pending" },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
  }

  async listControls(organizationId: string, competenceValue: string) {
    return this.prisma.marketingAiUsageControl.findMany({
      where: {
        organization_id: organizationId,
        competence: normalizeMarketingCompetence(competenceValue),
      },
      include: { user: { select: USER_SUMMARY } },
      orderBy: CONTROL_ORDER,
    });
  }

  async updateAnswers(
    organizationId: string,
    controlId: string,
    answers: Partial<MarketingAiUsageAnswers>,
  ) {
    if (Object.keys(answers).length === 0)
      throw new ServiceError(400, "Informe ao menos uma resposta.");
    if (
      answers.frequency !== undefined &&
      answers.frequency !== null &&
      (!Number.isInteger(answers.frequency) || answers.frequency < 1 || answers.frequency > 10)
    ) {
      throw new ServiceError(400, "A frequência deve ser um número inteiro entre 1 e 10.");
    }

    const where = { id: controlId, organization_id: organizationId };
    const result = await this.prisma.marketingAiUsageControl.updateMany({ where, data: answers });
    if (result.count === 0) throw new ServiceError(404, "Controle de IA não encontrado.");

    const control = await this.prisma.marketingAiUsageControl.findFirst({
      where,
      include: { user: { select: USER_SUMMARY } },
    });
    if (!control) throw new ServiceError(404, "Controle de IA não encontrado.");
    return control;
  }

  async getReport(organizationId: string, competenceValue: string) {
    const competence = normalizeMarketingCompetence(competenceValue);
    const [pending, unanswered, withoutIntegration] = await Promise.all([
      this.prisma.marketingAiUsageControl.findMany({
        where: {
          organization_id: organizationId,
          competence,
          OR: [
            { knowledge: null },
            { integration: null },
            { frequency: null },
            { purpose: null },
            { perceived_gain: null },
          ],
        },
        include: { user: { select: USER_SUMMARY } },
        orderBy: CONTROL_ORDER,
      }),
      // Relatório legado "sem resposta": conhecimento=0, importado como nulo.
      this.prisma.marketingAiUsageControl.findMany({
        where: { organization_id: organizationId, competence, knowledge: null },
        include: { user: { select: USER_SUMMARY } },
        orderBy: CONTROL_ORDER,
      }),
      // Relatório legado "sem integração": integracao=1, a resposta "Não".
      this.prisma.marketingAiUsageControl.findMany({
        where: { organization_id: organizationId, competence, integration: false },
        include: { user: { select: USER_SUMMARY } },
        orderBy: CONTROL_ORDER,
      }),
    ]);
    return { pending, unanswered, withoutIntegration };
  }

  async getPendingKnowledgeCount(organizationId: string, competence: Date): Promise<number> {
    return this.prisma.marketingAiUsageControl.count({
      where: { organization_id: organizationId, competence, knowledge: null },
    });
  }
}
