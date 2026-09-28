import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateLogParams } from "../integrations/audit.js";
import { getPaginationParams, type PaginationQuery } from "../schemas/pagination.schemas.js";
import {
  calculateSimplesPreview,
  previousCompetences,
  type SimplesPreview,
} from "./simplesNationalService.js";

export type MonthlyRevenuePrisma = Pick<PrismaClient, "client" | "fiscalMonthlyRevenue">;

const REFERRING = "fiscal.monthly_revenues";
const DUPLICATE_MESSAGE =
  "Já existe receita registrada para este cliente nesta competência. Use Corrigir na lista.";

interface Actor {
  organizationId: string;
  userId: string;
  permission?: number;
}

export interface CreateMonthlyRevenueInput extends Actor {
  client_id: string;
  competence: string;
  amount: string;
}

export interface UpdateMonthlyRevenueInput extends Actor {
  id: string;
  amount: string;
}

export interface ListMonthlyRevenuesInput extends PaginationQuery {
  client_id: string;
  from?: string;
  to?: string;
}

export interface MonthlyRevenueDto {
  id: string;
  client_id: string;
  competence: string;
  amount: string;
  created_by: string;
  updated_by: string;
  createdAt: string;
  updatedAt: string;
}

function competenceDate(competence: string): Date {
  return new Date(`${competence}-01T00:00:00.000Z`);
}

function competenceKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function serialize(value: {
  id: string;
  client_id: string;
  competence: Date;
  amount: { toString(): string };
  created_by: string;
  updated_by: string;
  createdAt: Date;
  updatedAt: Date;
}): MonthlyRevenueDto {
  return {
    id: value.id,
    client_id: value.client_id,
    competence: competenceKey(value.competence),
    amount: value.amount.toString(),
    created_by: value.created_by,
    updated_by: value.updated_by,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}

/** Receita bruta mensal por cliente e competência, base do RBT12 do Simples Nacional. */
export class MonthlyRevenueService {
  constructor(
    private readonly prisma: MonthlyRevenuePrisma,
    private readonly audit: { createLog(params: CreateLogParams): Promise<void> },
  ) {}

  private async requireClient(clientId: string, organizationId: string): Promise<{ id: string }> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    if (!client) throw new ServiceError(404, "Cliente não encontrado.");
    return client;
  }

  async create(input: CreateMonthlyRevenueInput): Promise<MonthlyRevenueDto> {
    const client = await this.requireClient(input.client_id, input.organizationId);

    const competence = competenceDate(input.competence);
    const existing = await this.prisma.fiscalMonthlyRevenue.findFirst({
      where: { organization_id: input.organizationId, client_id: client.id, competence },
      select: { id: true },
    });
    if (existing) throw new ServiceError(409, DUPLICATE_MESSAGE);

    let created: Parameters<typeof serialize>[0];
    try {
      created = await this.prisma.fiscalMonthlyRevenue.create({
        data: {
          organization_id: input.organizationId,
          client_id: client.id,
          competence,
          amount: input.amount,
          created_by: input.userId,
          updated_by: input.userId,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ServiceError(409, DUPLICATE_MESSAGE);
      throw error;
    }
    await this.audit.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      permission: input.permission ?? null,
      action: "Cadastro",
      referring: REFERRING,
      referringId: created.id,
      changes: { competence: input.competence, amount: input.amount },
    });
    return serialize(created);
  }

  async update(input: UpdateMonthlyRevenueInput): Promise<MonthlyRevenueDto> {
    const current = await this.prisma.fiscalMonthlyRevenue.findFirst({
      where: { id: input.id, organization_id: input.organizationId },
    });
    if (!current) throw new ServiceError(404, "Receita não encontrada.");

    const updated = await this.prisma.fiscalMonthlyRevenue.update({
      where: { id: current.id },
      data: { amount: input.amount, updated_by: input.userId },
    });
    await this.audit.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      permission: input.permission ?? null,
      action: "Atualização",
      referring: REFERRING,
      referringId: current.id,
      changes: { amount: { from: current.amount.toString(), to: input.amount } },
    });
    return serialize(updated);
  }

  /** Prévia do Simples: RBT12 dos 11 meses anteriores à competência e alíquota por anexo. */
  async simplesPreview(
    input: { client_id: string; competence: string },
    organizationId: string,
  ): Promise<SimplesPreview & { client_id: string }> {
    await this.requireClient(input.client_id, organizationId);
    const months = previousCompetences(input.competence);
    const records = await this.prisma.fiscalMonthlyRevenue.findMany({
      where: {
        organization_id: organizationId,
        client_id: input.client_id,
        competence: {
          gte: competenceDate(months[months.length - 1]),
          lte: competenceDate(months[0]),
        },
      },
      select: { competence: true, amount: true },
    });
    return {
      client_id: input.client_id,
      ...calculateSimplesPreview(
        input.competence,
        records.map((record) => ({
          competence: competenceKey(record.competence),
          amount: record.amount.toString(),
        })),
      ),
    };
  }

  async list(
    input: ListMonthlyRevenuesInput,
    organizationId: string,
  ): Promise<{
    data: MonthlyRevenueDto[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    await this.requireClient(input.client_id, organizationId);
    const page = input.page ?? 1;
    const { skip, take } = getPaginationParams(input);
    const range = {
      ...(input.from ? { gte: competenceDate(input.from) } : {}),
      ...(input.to ? { lte: competenceDate(input.to) } : {}),
    };
    const where = {
      organization_id: organizationId,
      client_id: input.client_id,
      ...(input.from || input.to ? { competence: range } : {}),
    };
    const [total, records] = await Promise.all([
      this.prisma.fiscalMonthlyRevenue.count({ where }),
      this.prisma.fiscalMonthlyRevenue.findMany({
        where,
        orderBy: [{ competence: "desc" }],
        skip,
        take,
      }),
    ]);
    return {
      data: records.map(serialize),
      total,
      page,
      limit: take,
      hasMore: page * take < total,
    };
  }
}
