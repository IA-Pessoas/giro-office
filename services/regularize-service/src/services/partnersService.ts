import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreatePartnerBody, UpdatePartnerBody } from "../schemas/partners.schemas.js";
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

const partnerListSelect = {
  ...partnerSelect,
  clientPF: {
    select: {
      id: true,
      name: true,
      cpf: true,
      date_of_birth: true,
    },
  },
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
      throw new ServiceError(409, "Sócio já cadastrado.");
    }
    await this.ensurePjParticipationFits(input.organizationId, input.body.pj_id, input.body.part);

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
      throw new ServiceError(404, "Sócio não encontrado.");
    }

    await this.ensureClientPfExists(input.organizationId, input.body.pf_id);
    await this.ensureClientPjExists(input.organizationId, input.body.pj_id);
    await this.ensurePjParticipationFits(
      input.organizationId,
      input.body.pj_id,
      input.body.part,
      existing.id,
    );

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
      throw new ServiceError(404, "Sócio não encontrado.");
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
      select: partnerListSelect,
      orderBy: {
        entry: "asc",
      },
    });

    return list as unknown as Record<string, unknown>[];
  }

  async remove(input: {
    organizationId: string;
    userId: string;
    id: string;
  }): Promise<{ ok: true }> {
    const existing = await this.prisma.partners.findFirst({
      where: { id: input.id, organization_id: input.organizationId },
      select: partnerSelect,
    });
    if (!existing) {
      throw new ServiceError(404, "Sócio não encontrado.");
    }

    await this.prisma.partners.delete({ where: { id: existing.id } });
    await this.#logs.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Exclusao",
      referring: "regularize.partners",
      referringId: existing.id,
      changes: "{}",
    });
    await this.reconciliationService.handlePartnersChanged(input.organizationId, existing.pf_id);

    return { ok: true };
  }

  // A soma dos vínculos de uma PJ não passa de 100%; na edição o próprio vínculo sai da conta.
  private async ensurePjParticipationFits(
    organizationId: string,
    pjId: string,
    part: number,
    ignoreId?: string,
  ): Promise<void> {
    const { _sum } = await this.prisma.partners.aggregate({
      where: {
        organization_id: organizationId,
        pj_id: pjId,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      _sum: { part: true },
    });
    const current = _sum.part ?? 0;
    if (current + part > 100) {
      throw new ServiceError(
        400,
        `A soma das participações da empresa passaria de 100% (atual: ${current}%).`,
      );
    }
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
