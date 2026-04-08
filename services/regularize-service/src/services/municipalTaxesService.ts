import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  CreateMunicipalTaxesBody,
  UpdateMunicipalTaxesBody,
} from "../schemas/municipalTaxes.schema.js";
import { RegularizeLogService } from "./regularizeLogService.js";

const municipalTaxesSelect = {
  id: true,
  client_id: true,
  year: true,
  tff_is_applicable: true,
  tff_amount: true,
  tff_notes: true,
  tff_analysis_is_done: true,
  tff_analysis_notes: true,
  tff_sent_date: true,
  tff_due_date: true,
  tlp_is_applicable: true,
  tlp_amount: true,
  tlp_notes: true,
  tlp_is_sent: true,
  tlp_sent_date: true,
  tlp_due_date: true,
  tlp_not_email: true,
  tll_is_applicable: true,
  tll_amount: true,
  tll_notes: true,
  tll_is_sent: true,
  tll_sent_date: true,
  tll_due_date: true,
  tll_analysis_is_done: true,
  tll_analysis_notes: true,
} as const;

export class MunicipalTaxesService {
  readonly #logs: RegularizeLogService;

  constructor(private readonly prisma: PrismaClient) {
    this.#logs = new RegularizeLogService(prisma);
  }

  async create(input: {
    organizationId: string;
    userId: string;
    body: CreateMunicipalTaxesBody;
  }): Promise<Record<string, unknown>> {
    await this.ensureClientExists(input.organizationId, input.body.client_id);

    const exists = await this.prisma.municipalTaxes.findFirst({
      where: {
        organization_id: input.organizationId,
        client_id: input.body.client_id,
        year: input.body.year,
      },
      select: { id: true },
    });
    if (exists) {
      throw new ServiceError(409, "Tributo municipal ja cadastrado para o ano informado.");
    }

    const created = await this.prisma.municipalTaxes.create({
      data: {
        ...input.body,
        tff_notes: input.body.tff_notes ?? null,
        tff_analysis_notes: input.body.tff_analysis_notes ?? null,
        tlp_notes: input.body.tlp_notes ?? null,
        tll_notes: input.body.tll_notes ?? null,
        tll_analysis_notes: input.body.tll_analysis_notes ?? null,
        organization_id: input.organizationId,
      },
      select: municipalTaxesSelect,
    });

    await this.#logs.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Cadastro",
      referring: "regularize.municipalTaxes",
      referringId: created.id,
      changes: "{}",
    });

    return { create: created };
  }

  async update(input: {
    organizationId: string;
    userId: string;
    body: UpdateMunicipalTaxesBody;
  }): Promise<Record<string, unknown>> {
    const existing = await this.prisma.municipalTaxes.findFirst({
      where: { id: input.body.id, organization_id: input.organizationId },
      select: municipalTaxesSelect,
    });
    if (!existing) {
      throw new ServiceError(404, "Tributo municipal nao encontrado.");
    }

    const updated = await this.prisma.municipalTaxes.update({
      where: { id: input.body.id },
      data: {
        ...input.body,
        tff_notes: input.body.tff_notes ?? null,
        tff_analysis_notes: input.body.tff_analysis_notes ?? null,
        tlp_notes: input.body.tlp_notes ?? null,
        tll_notes: input.body.tll_notes ?? null,
        tll_analysis_notes: input.body.tll_analysis_notes ?? null,
      },
      select: municipalTaxesSelect,
    });

    await this.#logs.logUpdateIfChanged({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Atualizacao",
      referring: "regularize.municipalTaxes",
      referringId: existing.id,
      oldData: existing as unknown as Record<string, unknown>,
      updatedData: updated as unknown as Record<string, unknown>,
    });

    return updated as unknown as Record<string, unknown>;
  }

  async detail(organizationId: string, id: string): Promise<Record<string, unknown>> {
    const detail = await this.prisma.municipalTaxes.findFirst({
      where: { id, organization_id: organizationId },
      select: municipalTaxesSelect,
    });
    if (!detail) {
      throw new ServiceError(404, "Tributo municipal nao encontrado.");
    }

    return { detail };
  }

  async list(organizationId: string, year: number): Promise<Record<string, unknown>[]> {
    const list = await this.prisma.client.findMany({
      where: {
        organization_id: organizationId,
        status: "Ativo",
      },
      select: {
        id: true,
        dominio_code: true,
        name: true,
        cpf_cnpj: true,
        city: true,
        municipalTaxes: {
          where: {
            organization_id: organizationId,
            year,
          },
          select: { id: true },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return list as unknown as Record<string, unknown>[];
  }

  private async ensureClientExists(organizationId: string, clientId: string): Promise<void> {
    const exists = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    if (!exists) {
      throw new ServiceError(404, "Cliente nao encontrado.");
    }
  }
}
