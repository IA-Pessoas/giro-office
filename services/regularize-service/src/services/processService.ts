import { ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { CreateProcessBody, UpdateProcessBody } from "../schemas/process.schemas.js";
import { buildProcessStatusFilter } from "../schemas/status.schemas.js";
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
  status: true,
  observation: true,
  responsible1_id: true,
  responsible2_id: true,
  responsible3_id: true,
  locking_type: true,
  urgency: true,
  task_id: true,
  responsible1: { select: { id: true, name: true } },
  responsible2: { select: { id: true, name: true } },
  responsible3: { select: { id: true, name: true } },
} as const;

const processHistorySelect = {
  id: true,
  action: true,
  referring: true,
  referring_id: true,
  changes: true,
  date: true,
  user: { select: { id: true, name: true } },
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

function withoutResponsibleRelations(data: Record<string, unknown>): Record<string, unknown> {
  const {
    responsible1: _responsible1,
    responsible2: _responsible2,
    responsible3: _responsible3,
    ...scalars
  } = data;
  return scalars;
}

export class ProcessService {
  readonly #logs: RegularizeLogService;

  constructor(private readonly prisma: PrismaClient) {
    this.#logs = new RegularizeLogService(prisma);
  }

  async create(input: {
    organizationId: string;
    userId: string;
    body: CreateProcessBody;
  }): Promise<Record<string, unknown>> {
    await this.ensureRelations(input.organizationId, input.body);

    const exists = await this.prisma.process.findFirst({
      where: {
        organization_id: input.organizationId,
        client_pf_id: input.body.client_pf_id,
        cpf_cnpj: input.body.cpf_cnpj,
        process_type: input.body.process_type,
        status: input.body.status,
      },
      select: { id: true },
    });
    if (exists) {
      throw new ServiceError(409, "Processo ja cadastrado.");
    }

    const created = await this.prisma.process.create({
      data: {
        ...input.body,
        observation: input.body.observation ?? null,
        locking_type: input.body.locking_type ?? null,
        urgency: input.body.urgency ?? null,
        organization_id: input.organizationId,
      },
      select: processSelect,
    });

    await this.#logs.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Cadastro",
      referring: "regularize.process",
      referringId: created.id,
      changes: "{}",
    });

    return { create: created };
  }

  async update(input: {
    organizationId: string;
    userId: string;
    body: UpdateProcessBody;
  }): Promise<Record<string, unknown>> {
    const existing = await this.prisma.process.findFirst({
      where: { id: input.body.id, organization_id: input.organizationId },
      select: processSelect,
    });
    if (!existing) {
      throw new ServiceError(404, "Processo nao encontrado.");
    }

    await this.ensureRelations(input.organizationId, input.body);

    const updated = await this.prisma.process.update({
      where: { id: input.body.id },
      data: (() => {
        const { id: _id, ...body } = input.body;

        return {
          ...body,
          observation: body.observation ?? null,
          locking_type: body.locking_type ?? null,
          urgency: body.urgency ?? null,
        };
      })(),
      select: processSelect,
    });

    await this.#logs.logUpdateIfChanged({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Atualizacao",
      referring: "regularize.process",
      referringId: existing.id,
      oldData: withoutResponsibleRelations(existing as unknown as Record<string, unknown>),
      updatedData: withoutResponsibleRelations(updated as unknown as Record<string, unknown>),
    });

    return updated as unknown as Record<string, unknown>;
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
        ...detail,
        elapsed_days: calculateElapsedCalendarDays(
          detail.entry_date,
          detail.completion_date ?? new Date(),
        ),
        history,
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
      return this.prisma.process.findMany(findManyArgs) as unknown as Record<string, unknown>[];
    }

    const [list, total] = await Promise.all([
      this.prisma.process.findMany(findManyArgs),
      this.prisma.process.count({ where }),
    ]);

    return {
      data: list,
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
  }

  private async recordFiscalAction(
    input: { organizationId: string; userId: string; processId: string },
    action: string,
  ): Promise<Record<string, unknown>> {
    const process = await this.prisma.process.findFirst({
      where: { id: input.processId, organization_id: input.organizationId },
      select: processSelect,
    });
    if (!process) {
      throw new ServiceError(404, "Processo nao encontrado.");
    }

    await this.#logs.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action,
      referring: "regularize.process",
      referringId: input.processId,
      changes: { processId: input.processId, action },
    });

    return { process, action };
  }
}
