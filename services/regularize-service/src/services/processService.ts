import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateProcessBody, UpdateProcessBody } from "../schemas/process.schemas.js";
import { RegularizeLogService } from "./regularizeLogService.js";

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
} as const;

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
      data: {
        ...input.body,
        observation: input.body.observation ?? null,
        locking_type: input.body.locking_type ?? null,
        urgency: input.body.urgency ?? null,
      },
      select: processSelect,
    });

    await this.#logs.logUpdateIfChanged({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Atualizacao",
      referring: "regularize.process",
      referringId: existing.id,
      oldData: existing as unknown as Record<string, unknown>,
      updatedData: updated as unknown as Record<string, unknown>,
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

    return { detail };
  }

  async list(organizationId: string, status: string): Promise<Record<string, unknown>[]> {
    const list = await this.prisma.process.findMany({
      where: {
        organization_id: organizationId,
        ...(status === "Todos" ? {} : { status }),
      },
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
    });

    return list as unknown as Record<string, unknown>[];
  }

  private async ensureRelations(
    organizationId: string,
    body: CreateProcessBody | UpdateProcessBody,
  ): Promise<void> {
    if (body.client_pj_id) {
      const client = await this.prisma.client.findFirst({
        where: { id: body.client_pj_id, organization_id: organizationId },
        select: { id: true },
      });
      if (!client) {
        throw new ServiceError(404, "Cliente PJ nao encontrado.");
      }
    }

    if (body.client_pf_id) {
      const clientPf = await this.prisma.clientPF.findFirst({
        where: { id: body.client_pf_id, organization_id: organizationId },
        select: { id: true },
      });
      if (!clientPf) {
        throw new ServiceError(404, "Cliente PF nao encontrado.");
      }
    }
  }
}
