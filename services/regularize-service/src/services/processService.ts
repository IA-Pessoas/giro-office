import { error as logError, ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { CreateProcessBody, UpdateProcessBody } from "../schemas/process.schemas.js";
import { buildProcessStatusFilter } from "../schemas/status.schemas.js";
import {
  applyFinancialStatusTransition,
  normalizeFinancialStatus,
} from "./processFinancialService.js";
import { RegularizeLogService } from "./regularizeLogService.js";

const CALENDAR_DAY_MS = 24 * 60 * 60 * 1000;
const PROCESS_ACTIONS = {
  sendToFiscal: "Envio ao Fiscal",
  returnFromFiscal: "Retorno do Fiscal",
} as const;

const processSelect = {
  id: true,
  client_pj_id: true,
  client_pf_id: true,
  cpf_cnpj: true,
  process_type: true,
  description: true,
  entry_date: true,
  completion_date: true,
  expected_date: true,
  client_notice_date: true,
  status: true,
  financial_status: true,
  observation: true,
  responsible1_id: true,
  responsible2_id: true,
  responsible3_id: true,
  locking_type: true,
  urgency: true,
  task_id: true,
  responsible1: { select: { id: true, name: true, organization_id: true } },
  responsible2: { select: { id: true, name: true, organization_id: true } },
  responsible3: { select: { id: true, name: true, organization_id: true } },
} as const;

type ProcessSelectedRecord = Prisma.ProcessGetPayload<{ select: typeof processSelect }>;

const processHistorySelect = {
  id: true,
  action: true,
  referring: true,
  referring_id: true,
  changes: true,
  date: true,
  user: { select: { id: true, name: true, organization_id: true } },
} as const;

export function calculateElapsedCalendarDays(
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
): number | null {
  if (!startDate || !endDate) {
    return null;
  }

  const start = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  );
  const end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());

  return Math.max(0, Math.floor((end - start) / CALENDAR_DAY_MS));
}

function normalizeDocument(value: string | null | undefined): string {
  return value?.replace(/\D/g, "") ?? "";
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function withoutResponsibleRelations(data: Record<string, unknown>): Record<string, unknown> {
  const {
    responsible1: _responsible1,
    responsible2: _responsible2,
    responsible3: _responsible3,
    ...scalars
  } = data;
  return scalars;
}

function sanitizeOrganizationRelation(relation: unknown, organizationId: string): unknown {
  if (relation === null || relation === undefined) {
    return relation;
  }
  if (typeof relation !== "object") {
    return null;
  }

  const candidate = relation as Record<string, unknown>;
  if (
    candidate.organization_id !== organizationId ||
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string"
  ) {
    return null;
  }

  return { id: candidate.id, name: candidate.name };
}

function sanitizeProcessRecord(
  data: Record<string, unknown>,
  organizationId: string,
): Record<string, unknown> {
  const sanitized = { ...data };
  if (sanitized.financial_status !== undefined && sanitized.financial_status !== null) {
    try {
      sanitized.financial_status = normalizeFinancialStatus(sanitized.financial_status);
    } catch (error) {
      logError("Valor financeiro historico invalido no processo", {
        error,
        financialStatus: sanitized.financial_status,
      });
      // Preserve an unexpected historical value for auditability; writes reject it.
    }
  }
  for (const key of ["responsible1", "responsible2", "responsible3"]) {
    if (key in data) {
      sanitized[key] = sanitizeOrganizationRelation(data[key], organizationId);
    }
  }
  return sanitized;
}

function sanitizeProcessHistory(history: unknown[], organizationId: string): unknown[] {
  return history.map((entry) => {
    if (entry === null || typeof entry !== "object") {
      return entry;
    }

    const sanitized = { ...(entry as Record<string, unknown>) };
    if ("user" in sanitized) {
      sanitized.user = sanitizeOrganizationRelation(sanitized.user, organizationId);
    }
    return sanitized;
  });
}

export class ProcessService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    organizationId: string;
    userId: string;
    body: CreateProcessBody;
  }): Promise<Record<string, unknown>> {
    await this.ensureRelations(input.organizationId, input.body);

    const transition = applyFinancialStatusTransition({
      currentFinancialStatus: input.body.financial_status,
      currentStatus: input.body.status,
      currentLockingType: input.body.locking_type,
      nextFinancialStatus: input.body.financial_status,
      requestedStatus: input.body.status,
      requestedLockingType: input.body.locking_type,
    });
    const processData = {
      ...input.body,
      client_notice_date: input.body.client_notice_date ?? null,
      financial_status: transition.financialStatus,
      locking_type: transition.lockingType,
      status: transition.status,
    };

    const exists = await this.prisma.process.findFirst({
      where: {
        organization_id: input.organizationId,
        client_pj_id: processData.client_pj_id ?? null,
        client_pf_id: processData.client_pf_id ?? null,
        cpf_cnpj: processData.cpf_cnpj,
        process_type: processData.process_type,
        status: processData.status,
      },
      select: { id: true },
    });
    if (exists) {
      throw new ServiceError(409, "Processo ja cadastrado.");
    }

    let created: ProcessSelectedRecord;
    try {
      created = await this.withTransaction(async (prisma, logs) => {
        const created = await prisma.process.create({
          data: {
            ...processData,
            observation: processData.observation ?? null,
            urgency: processData.urgency ?? null,
            organization_id: input.organizationId,
          },
          select: processSelect,
        });

        await logs.createLog({
          userId: input.userId,
          organizationId: input.organizationId,
          action: "Cadastro",
          referring: "regularize.process",
          referringId: created.id,
          changes: {
            status: created.status,
            financial_status: created.financial_status,
            locking_type: created.locking_type,
            client_notice_date: created.client_notice_date,
          },
        });

        return created;
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      logError("Conflito de duplicidade ao criar processo do regularize", { error });
      throw new ServiceError(409, "Processo ja cadastrado.");
    }

    return {
      create: sanitizeProcessRecord(
        created as unknown as Record<string, unknown>,
        input.organizationId,
      ),
    };
  }

  async update(input: {
    organizationId: string;
    userId: string;
    body: UpdateProcessBody;
  }): Promise<Record<string, unknown>> {
    const existing = await this.prisma.process.findFirst({
      where: { id: input.body.id, organization_id: input.organizationId },
      select: { id: true },
    });
    if (!existing) {
      throw new ServiceError(404, "Processo nao encontrado.");
    }

    await this.ensureRelations(input.organizationId, input.body);

    let updated: ProcessSelectedRecord;
    try {
      updated = await this.withTransaction(async (prisma, logs) => {
        const current = await prisma.process.findFirst({
          where: { id: input.body.id, organization_id: input.organizationId },
          select: processSelect,
        });
        if (!current) {
          throw new ServiceError(404, "Processo nao encontrado.");
        }

        const financialStatus = normalizeFinancialStatus(
          input.body.financial_status ?? current.financial_status ?? "Pendente",
        );
        const transition = applyFinancialStatusTransition({
          currentFinancialStatus: current.financial_status,
          currentStatus: current.status,
          currentLockingType: current.locking_type,
          nextFinancialStatus: financialStatus,
          requestedStatus: input.body.status,
          requestedLockingType: input.body.locking_type,
        });
        const { id: _id, ...body } = input.body;
        const updateData = {
          ...body,
          client_notice_date:
            body.client_notice_date === undefined
              ? current.client_notice_date
              : body.client_notice_date,
          financial_status: transition.financialStatus,
          locking_type: transition.lockingType,
          status: transition.status,
          observation: body.observation ?? null,
          urgency: body.urgency ?? null,
        };
        const result = await prisma.process.updateMany({
          where: {
            id: input.body.id,
            organization_id: input.organizationId,
            status: current.status,
            financial_status: current.financial_status,
            locking_type: current.locking_type,
          },
          data: updateData,
        });
        if (result.count !== 1) {
          throw new ServiceError(409, "Processo foi alterado; recarregue e tente novamente.");
        }

        const updated = await prisma.process.findFirst({
          where: { id: input.body.id, organization_id: input.organizationId },
          select: processSelect,
        });
        if (!updated) {
          throw new ServiceError(404, "Processo nao encontrado.");
        }

        await logs.logUpdateIfChanged({
          userId: input.userId,
          organizationId: input.organizationId,
          action: "Atualizacao",
          referring: "regularize.process",
          referringId: current.id,
          oldData: withoutResponsibleRelations(current as unknown as Record<string, unknown>),
          updatedData: withoutResponsibleRelations(updated as unknown as Record<string, unknown>),
        });

        return updated;
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      logError("Conflito de duplicidade ao atualizar processo do regularize", { error });
      throw new ServiceError(409, "Processo ja cadastrado.");
    }

    return sanitizeProcessRecord(
      updated as unknown as Record<string, unknown>,
      input.organizationId,
    );
  }

  async detail(organizationId: string, id: string): Promise<Record<string, unknown>> {
    const detail = await this.prisma.process.findFirst({
      where: { id, organization_id: organizationId },
      select: processSelect,
    });
    if (!detail) {
      throw new ServiceError(404, "Processo nao encontrado.");
    }

    const history = await this.prisma.logs.findMany({
      where: {
        organization_id: organizationId,
        referring: "regularize.process",
        referring_id: id,
      },
      select: processHistorySelect,
      orderBy: { date: "asc" },
    });

    return {
      detail: {
        ...sanitizeProcessRecord(detail as unknown as Record<string, unknown>, organizationId),
        elapsed_days: calculateElapsedCalendarDays(
          detail.entry_date,
          detail.completion_date ?? new Date(),
        ),
        history: sanitizeProcessHistory(history as unknown[], organizationId),
      },
    };
  }

  async sendToFiscal(input: {
    organizationId: string;
    userId: string;
    processId: string;
  }): Promise<Record<string, unknown>> {
    return this.recordFiscalAction(input, PROCESS_ACTIONS.sendToFiscal);
  }

  async returnFromFiscal(input: {
    organizationId: string;
    userId: string;
    processId: string;
  }): Promise<Record<string, unknown>> {
    return this.recordFiscalAction(input, PROCESS_ACTIONS.returnFromFiscal);
  }

  async list(params: {
    organizationId: string;
    status: string;
    search: string;
    page: number;
    limit: number;
    paginationRequested: boolean;
  }): Promise<Record<string, unknown>[] | Record<string, unknown>> {
    const where: Prisma.ProcessWhereInput = {
      organization_id: params.organizationId,
      ...buildProcessStatusFilter(params.status),
      ...(params.search
        ? {
            OR: [
              { process_type: { contains: params.search, mode: "insensitive" } },
              { cpf_cnpj: { contains: params.search, mode: "insensitive" } },
              { clientPF: { name: { contains: params.search, mode: "insensitive" } } },
              { clientPF: { cpf: { contains: params.search, mode: "insensitive" } } },
              { clientPJ: { name: { contains: params.search, mode: "insensitive" } } },
              { clientPJ: { cpf_cnpj: { contains: params.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const findManyArgs = {
      where,
      select: {
        id: true,
        client_pj_id: true,
        client_pf_id: true,
        cpf_cnpj: true,
        process_type: true,
        status: true,
        financial_status: true,
        client_notice_date: true,
        clientPF: {
          select: {
            name: true,
            cpf: true,
          },
        },
        clientPJ: {
          select: {
            name: true,
            cpf_cnpj: true,
          },
        },
      },
      orderBy: {
        id: "asc",
      },
      ...(params.paginationRequested
        ? { skip: (params.page - 1) * params.limit, take: params.limit }
        : {}),
    } as const;

    if (!params.paginationRequested) {
      const list = await this.prisma.process.findMany(findManyArgs);
      return list.map((item) =>
        sanitizeProcessRecord(item as unknown as Record<string, unknown>, params.organizationId),
      );
    }

    const [list, total] = await Promise.all([
      this.prisma.process.findMany(findManyArgs),
      this.prisma.process.count({ where }),
    ]);

    return {
      data: list.map((item) =>
        sanitizeProcessRecord(item as unknown as Record<string, unknown>, params.organizationId),
      ),
      total,
      page: params.page,
      limit: params.limit,
      hasMore: params.page * params.limit < total,
    };
  }

  private async ensureRelations(
    organizationId: string,
    body: CreateProcessBody | UpdateProcessBody,
  ): Promise<void> {
    const hasPj = Boolean(body.client_pj_id);
    const hasPf = Boolean(body.client_pf_id);
    if (hasPj === hasPf) {
      throw new ServiceError(400, "Informe exatamente um cliente PJ ou PF.");
    }

    if (hasPj) {
      const client = await this.prisma.client.findFirst({
        where: { id: body.client_pj_id, organization_id: organizationId },
        select: { id: true, cpf_cnpj: true },
      });
      if (!client) {
        throw new ServiceError(404, "Cliente PJ nao encontrado.");
      }
      if (normalizeDocument(body.cpf_cnpj) !== normalizeDocument(client.cpf_cnpj)) {
        throw new ServiceError(400, "CPF/CNPJ nao corresponde ao cliente PJ.");
      }
    } else {
      const clientPf = await this.prisma.clientPF.findFirst({
        where: { id: body.client_pf_id, organization_id: organizationId },
        select: { id: true, cpf: true },
      });
      if (!clientPf) {
        throw new ServiceError(404, "Cliente PF nao encontrado.");
      }
      if (normalizeDocument(body.cpf_cnpj) !== normalizeDocument(clientPf.cpf)) {
        throw new ServiceError(400, "CPF/CNPJ nao corresponde ao cliente PF.");
      }
    }

    const responsibleIds = [
      body.responsible1_id,
      body.responsible2_id,
      body.responsible3_id,
    ].filter((id): id is string => Boolean(id));
    const uniqueResponsibleIds = [...new Set(responsibleIds)];
    if (uniqueResponsibleIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: uniqueResponsibleIds }, organization_id: organizationId },
        select: { id: true },
      });
      if (users.length !== uniqueResponsibleIds.length) {
        throw new ServiceError(404, "Responsavel nao encontrado na organizacao.");
      }
    }

    if (body.task_id) {
      const task = await this.prisma.task.findFirst({
        where: { id: body.task_id, organization_id: organizationId },
        select: { id: true },
      });
      if (!task) {
        throw new ServiceError(404, "Tarefa nao encontrada na organizacao.");
      }
    }
  }

  private async recordFiscalAction(
    input: { organizationId: string; userId: string; processId: string },
    action: string,
  ): Promise<Record<string, unknown>> {
    return this.withTransaction(async (prisma, logs) => {
      const process = await prisma.process.findFirst({
        where: { id: input.processId, organization_id: input.organizationId },
        select: processSelect,
      });
      if (!process) {
        throw new ServiceError(404, "Processo nao encontrado.");
      }

      await logs.createLog({
        userId: input.userId,
        organizationId: input.organizationId,
        action,
        referring: "regularize.process",
        referringId: input.processId,
        changes: { processId: input.processId, action },
      });

      return {
        process: sanitizeProcessRecord(
          process as unknown as Record<string, unknown>,
          input.organizationId,
        ),
        action,
      };
    });
  }

  private async withTransaction<T>(
    operation: (prisma: PrismaClient, logs: RegularizeLogService) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      const prisma = transaction as unknown as PrismaClient;
      return operation(prisma, new RegularizeLogService(prisma));
    });
  }
}
