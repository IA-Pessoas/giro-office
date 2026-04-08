import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateClientPfBody, UpdateClientPfBody } from "../schemas/clientPf.schema.js";
import { RegularizeLogService } from "./regularizeLogService.js";
import type { RegularizeReconciliationService } from "./regularizeReconciliationService.js";

const clientPfSelect = {
  id: true,
  code: true,
  name: true,
  sex: true,
  address: true,
  city: true,
  zip_code: true,
  state: true,
  profession: true,
  father: true,
  mother: true,
  marital_status: true,
  date_of_birth: true,
  cpf: true,
  rg: true,
  rg_expedition: true,
  rg_validity: true,
  military_certificate: true,
  ctps: true,
  cnh: true,
  cnh_expedition: true,
  cnh_validity: true,
  spouse: true,
  notes: true,
  status: true,
} as const;

export class ClientPfService {
  readonly #logs: RegularizeLogService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly reconciliationService: RegularizeReconciliationService,
  ) {
    this.#logs = new RegularizeLogService(prisma);
  }

  async create(input: {
    organizationId: string;
    userId: string;
    body: CreateClientPfBody;
  }): Promise<Record<string, unknown>> {
    await this.ensureUnique(input.organizationId, input.body);

    const created = await this.prisma.clientPF.create({
      data: {
        ...input.body,
        organization_id: input.organizationId,
      },
      select: clientPfSelect,
    });

    await this.#logs.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Cadastro",
      referring: "regularize.pf",
      referringId: created.id,
      changes: "{}",
    });

    await this.reconciliationService.handleClientPfChanged(input.organizationId, created.id);

    return { create: created };
  }

  async update(input: {
    organizationId: string;
    userId: string;
    body: UpdateClientPfBody;
  }): Promise<Record<string, unknown>> {
    const existing = await this.prisma.clientPF.findFirst({
      where: { id: input.body.id, organization_id: input.organizationId },
      select: clientPfSelect,
    });
    if (!existing) {
      throw new ServiceError(404, "Cliente PF nao encontrado.");
    }

    await this.ensureUnique(input.organizationId, input.body);

    const updated = await this.prisma.clientPF.update({
      where: { id: input.body.id },
      data: {
        ...input.body,
      },
      select: clientPfSelect,
    });

    await this.#logs.logUpdateIfChanged({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Atualizacao",
      referring: "regularize.clientPF",
      referringId: existing.id,
      oldData: existing as unknown as Record<string, unknown>,
      updatedData: updated as unknown as Record<string, unknown>,
    });

    await this.reconciliationService.handleClientPfChanged(input.organizationId, updated.id);

    return updated as unknown as Record<string, unknown>;
  }

  async detail(organizationId: string, id: string): Promise<Record<string, unknown>> {
    const detail = await this.prisma.clientPF.findFirst({
      where: { id, organization_id: organizationId },
      select: clientPfSelect,
    });
    if (!detail) {
      throw new ServiceError(404, "Cliente PF nao encontrado.");
    }

    return { detail };
  }

  async list(organizationId: string, status: string): Promise<Record<string, unknown>[]> {
    const list = await this.prisma.clientPF.findMany({
      where: {
        organization_id: organizationId,
        status,
      },
      select: {
        id: true,
        code: true,
        name: true,
        cpf: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return list as unknown as Record<string, unknown>[];
  }

  private async ensureUnique(
    organizationId: string,
    body: CreateClientPfBody | UpdateClientPfBody,
  ): Promise<void> {
    const exists = await this.prisma.clientPF.findFirst({
      where: {
        organization_id: organizationId,
        OR: [{ code: body.code }, { cpf: body.cpf }, { rg: body.rg }],
        ...("id" in body ? { NOT: { id: body.id } } : {}),
      },
      select: { id: true },
    });

    if (exists) {
      throw new ServiceError(409, "Cliente PF ja cadastrado.");
    }
  }
}
