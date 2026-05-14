import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreatePartnerBody, UpdatePartnerBody } from "../schemas/partners.schema.js";
import { RegularizeLogService } from "./regularizeLogService.js";
import type { RegularizeReconciliationService } from "./regularizeReconciliationService.js";

const partnerSelect = {
  id: true,
  pj_id: true,
  pf_id: true,
  part: true,
  entry: true,
  exit: true,
} as const;

export class PartnersService {
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
    body: CreatePartnerBody;
  }): Promise<Record<string, unknown>> {
    await this.ensureClientPfExists(input.organizationId, input.body.pf_id);
    await this.ensureClientPjExists(input.organizationId, input.body.pj_id);

    const exists = await this.prisma.partners.findFirst({
      where: {
        organization_id: input.organizationId,
        pj_id: input.body.pj_id,
        pf_id: input.body.pf_id,
      },
      select: { id: true },
    });
    if (exists) {
      throw new ServiceError(409, "Socio ja cadastrado.");
    }

    const created = await this.prisma.partners.create({
      data: {
        ...input.body,
        exit: input.body.exit ?? null,
        organization_id: input.organizationId,
      },
      select: partnerSelect,
    });

    await this.#logs.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Cadastro",
      referring: "regularize.partners",
      referringId: created.id,
      changes: "{}",
    });

    await this.reconciliationService.handlePartnersChanged(input.organizationId, created.pf_id);

    return { create: created };
  }

  async update(input: {
    organizationId: string;
    userId: string;
    body: UpdatePartnerBody;
  }): Promise<Record<string, unknown>> {
    const existing = await this.prisma.partners.findFirst({
      where: { id: input.body.id, organization_id: input.organizationId },
      select: partnerSelect,
    });
    if (!existing) {
      throw new ServiceError(404, "Socio nao encontrado.");
    }

    await this.ensureClientPfExists(input.organizationId, input.body.pf_id);
    await this.ensureClientPjExists(input.organizationId, input.body.pj_id);

    const updated = await this.prisma.partners.update({
      where: { id: input.body.id },
      data: {
        pj_id: input.body.pj_id,
        pf_id: input.body.pf_id,
        part: input.body.part,
        entry: input.body.entry,
        exit: input.body.exit ?? null,
      },
      select: partnerSelect,
    });

    await this.#logs.logUpdateIfChanged({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Atualizacao",
      referring: "regularize.partners",
      referringId: existing.id,
      oldData: existing as unknown as Record<string, unknown>,
      updatedData: updated as unknown as Record<string, unknown>,
    });

    await this.reconciliationService.handlePartnersChanged(input.organizationId, updated.pf_id);

    return updated as unknown as Record<string, unknown>;
  }

  async detail(organizationId: string, id: string): Promise<Record<string, unknown>> {
    const detail = await this.prisma.partners.findFirst({
      where: { id, organization_id: organizationId },
      select: partnerSelect,
    });
    if (!detail) {
      throw new ServiceError(404, "Socio nao encontrado.");
    }

    return { detail };
  }

  async list(
    organizationId: string,
    type: "pf" | "pj",
    clientId: string,
  ): Promise<Record<string, unknown>[] | undefined> {
    const list = await this.prisma.partners.findMany({
      where: {
        organization_id: organizationId,
        ...(type === "pf" ? { pf_id: clientId } : { pj_id: clientId }),
      },
      select: partnerSelect,
      orderBy: {
        entry: "asc",
      },
    });

    return list as unknown as Record<string, unknown>[];
  }

  private async ensureClientPfExists(organizationId: string, pfId: string): Promise<void> {
    const exists = await this.prisma.clientPF.findFirst({
      where: { id: pfId, organization_id: organizationId },
      select: { id: true },
    });
    if (!exists) {
      throw new ServiceError(404, "Cliente PF nao encontrado.");
    }
  }

  private async ensureClientPjExists(organizationId: string, clientId: string): Promise<void> {
    const exists = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    if (!exists) {
      throw new ServiceError(404, "Cliente PJ nao encontrado.");
    }
  }
}
