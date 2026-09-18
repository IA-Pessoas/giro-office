import { ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

const overviewCompetenceSelect = {
  id: true,
  client_id: true,
  competence: true,
  client: { select: { name: true, company_name: true } },
} as const;

const monthlySelect = {
  client_id: true,
  competence: true,
  checklist: true,
} as const;

const bankSelect = {
  client_id: true,
  competence: true,
  status: true,
} as const;

const urgentSelect = {
  client_id: true,
  competence: true,
  status: true,
} as const;

type OverviewCompetence = Prisma.TriageCompetenceGetPayload<{
  select: typeof overviewCompetenceSelect;
}>;
type MonthlyRecord = Prisma.TriageMonthlyGetPayload<{ select: typeof monthlySelect }>;
type BankRecord = Prisma.TriageBankStatementGetPayload<{ select: typeof bankSelect }>;
type UrgentRecord = Prisma.TriageUrgentRequestGetPayload<{ select: typeof urgentSelect }>;

export type TriageOverviewStatus = "URGENT_OPEN" | "ROUTINE_PENDING" | "BANK_PENDING" | "COMPLETE";

export type TriageOverviewPrisma = Pick<
  PrismaClient,
  | "$executeRaw"
  | "$transaction"
  | "triageCompetence"
  | "triageMonthly"
  | "triageBankStatement"
  | "triageUrgentRequest"
>;

export interface TriageOverviewAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
  modules?: Record<string, number>;
}

export interface ListTriageOverviewInput {
  page: number;
  pageSize: number;
  clientId?: string;
  competence?: string;
  status?: TriageOverviewStatus;
}

export interface TriageOverviewItem {
  client_id: string;
  legal_name: string;
  competence: string;
  status: TriageOverviewStatus;
}

export interface TriageOverviewIndicators {
  urgent_open: number;
  routine_pending: number;
  bank_pending: number;
  complete: number;
}

export interface TriageOverviewResult {
  items: TriageOverviewItem[];
  total: number;
  page: number;
  page_size: number;
  indicators: TriageOverviewIndicators;
}

function requireContext(auth: TriageOverviewAuthContext): void {
  if (!auth.userId || !auth.organizationId) {
    throw new ServiceError(400, "Contexto autenticado incompleto.");
  }
}

function modulePermission(auth: TriageOverviewAuthContext): number {
  return auth.modules ? (auth.modules.triagem ?? 0) : (auth.permission ?? 0);
}

function requireViewPermission(auth: TriageOverviewAuthContext): void {
  if (modulePermission(auth) < 1) {
    throw new ServiceError(403, "Permissão insuficiente para consultar a Triagem.");
  }
}

function isPendingStatus(status: unknown): boolean {
  return status !== "COMPLETED" && status !== "NOT_APPLICABLE";
}

function hasPendingRoutine(records: MonthlyRecord[]): boolean {
  return records.some((record) => {
    const checklist =
      record.checklist && typeof record.checklist === "object" && !Array.isArray(record.checklist)
        ? record.checklist
        : {};
    return Object.values(checklist).some((status) => isPendingStatus(status));
  });
}

function key(clientId: string, competence: string): string {
  return `${clientId}:${competence}`;
}

function legalName(record: OverviewCompetence): string {
  return record.client.company_name?.trim() || record.client.name;
}

function deriveStatus(
  monthly: MonthlyRecord[],
  banks: BankRecord[],
  urgentRequests: UrgentRecord[],
): TriageOverviewStatus {
  if (urgentRequests.some((request) => request.status === "OPEN")) {
    return "URGENT_OPEN";
  }
  if (hasPendingRoutine(monthly)) {
    return "ROUTINE_PENDING";
  }
  if (banks.some((statement) => isPendingStatus(statement.status))) {
    return "BANK_PENDING";
  }
  return "COMPLETE";
}

function emptyIndicators(): TriageOverviewIndicators {
  return { urgent_open: 0, routine_pending: 0, bank_pending: 0, complete: 0 };
}

function indicatorKey(status: TriageOverviewStatus): keyof TriageOverviewIndicators {
  return status.toLowerCase() as keyof TriageOverviewIndicators;
}

export class TriageOverviewService {
  constructor(private readonly prisma: TriageOverviewPrisma) {}

  async list(
    input: ListTriageOverviewInput,
    auth: TriageOverviewAuthContext,
  ): Promise<TriageOverviewResult> {
    requireContext(auth);
    requireViewPermission(auth);
    if (!Number.isInteger(input.page) || input.page < 1) {
      throw new ServiceError(400, "Página inválida.");
    }
    if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
      throw new ServiceError(400, "Tamanho de página inválido.");
    }

    return this.withOrganization(auth, async (transaction) => {
      const competences = await transaction.triageCompetence.findMany({
        where: {
          organization_id: auth.organizationId,
          ...(input.clientId ? { client_id: input.clientId } : {}),
          ...(input.competence ? { competence: input.competence } : {}),
          archived_at: null,
        },
        orderBy: [{ competence: "desc" }, { created_at: "desc" }],
        select: overviewCompetenceSelect,
      });

      if (competences.length === 0) {
        return {
          items: [],
          total: 0,
          page: input.page,
          page_size: input.pageSize,
          indicators: emptyIndicators(),
        };
      }

      const clientIds = [...new Set(competences.map((record) => record.client_id))];
      const competencesValues = [...new Set(competences.map((record) => record.competence))];
      const scope = {
        organization_id: auth.organizationId,
        client_id: { in: clientIds },
        competence: { in: competencesValues },
      };
      const [monthlyRecords, bankRecords, urgentRecords] = await Promise.all([
        transaction.triageMonthly.findMany({
          where: { ...scope, archived_at: null },
          select: monthlySelect,
        }),
        transaction.triageBankStatement.findMany({
          where: { ...scope, archived_at: null },
          select: bankSelect,
        }),
        transaction.triageUrgentRequest.findMany({
          where: scope,
          select: urgentSelect,
        }),
      ]);

      const monthlyByKey = new Map<string, MonthlyRecord[]>();
      for (const record of monthlyRecords) {
        const recordKey = key(record.client_id, record.competence);
        const records = monthlyByKey.get(recordKey) ?? [];
        records.push(record);
        monthlyByKey.set(recordKey, records);
      }
      const banksByKey = new Map<string, BankRecord[]>();
      for (const record of bankRecords) {
        const recordKey = key(record.client_id, record.competence);
        const records = banksByKey.get(recordKey) ?? [];
        records.push(record);
        banksByKey.set(recordKey, records);
      }
      const urgentByKey = new Map<string, UrgentRecord[]>();
      for (const record of urgentRecords) {
        const recordKey = key(record.client_id, record.competence);
        const records = urgentByKey.get(recordKey) ?? [];
        records.push(record);
        urgentByKey.set(recordKey, records);
      }

      const derivedItems = competences
        .map((record) => {
          const recordKey = key(record.client_id, record.competence);
          const status = deriveStatus(
            monthlyByKey.get(recordKey) ?? [],
            banksByKey.get(recordKey) ?? [],
            urgentByKey.get(recordKey) ?? [],
          );
          return {
            client_id: record.client_id,
            legal_name: legalName(record),
            competence: record.competence,
            status,
          } satisfies TriageOverviewItem;
        })
        .filter((item) => !input.status || item.status === input.status)
        .sort(
          (left, right) =>
            right.competence.localeCompare(left.competence) ||
            left.legal_name.localeCompare(right.legal_name, "pt-BR", { sensitivity: "base" }) ||
            left.client_id.localeCompare(right.client_id),
        );

      const indicators = emptyIndicators();
      for (const item of derivedItems) {
        indicators[indicatorKey(item.status)] += 1;
      }

      const skip = (input.page - 1) * input.pageSize;
      return {
        items: derivedItems.slice(skip, skip + input.pageSize),
        total: derivedItems.length,
        page: input.page,
        page_size: input.pageSize,
        indicators,
      };
    });
  }

  private async withOrganization<T>(
    auth: TriageOverviewAuthContext,
    callback: (transaction: TriageOverviewPrisma) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE "giro_user_runtime"`;
      await transaction.$executeRaw`SELECT set_config('app.organization_id', ${auth.organizationId}, true)`;
      return callback(transaction as unknown as TriageOverviewPrisma);
    });
  }
}
