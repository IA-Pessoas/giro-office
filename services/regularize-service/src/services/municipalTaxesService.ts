import { ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type {
  CreateMunicipalTaxesBody,
  MunicipalTaxesType,
  UpdateMunicipalTaxesBody,
} from "../schemas/municipalTaxes.schemas.js";
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

const municipalTaxesApplicabilityFields = {
  TFF: "tff_is_applicable",
  TLP: "tlp_is_applicable",
  TLL: "tll_is_applicable",
} as const;

export type MunicipalTaxesListParams = {
  organizationId: string;
  year: number;
  search: string;
  status: "Todos" | "Criado" | "Pendente";
  type?: MunicipalTaxesType;
  page: number;
  limit: number;
};

export type MunicipalTaxesListPage = {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

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

  async list(params: MunicipalTaxesListParams): Promise<MunicipalTaxesListPage> {
    const municipalTaxesWhere: Prisma.MunicipalTaxesWhereInput = {
      organization_id: params.organizationId,
      year: params.year,
      ...(params.type ? { [municipalTaxesApplicabilityFields[params.type]]: true } : {}),
    };
    const where: Prisma.ClientWhereInput = {
      organization_id: params.organizationId,
      status: "Ativo",
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: "insensitive" } },
              { cpf_cnpj: { contains: params.search, mode: "insensitive" } },
              { city: { contains: params.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(params.status === "Todos"
        ? params.type
          ? {
              municipalTaxes: {
                some: municipalTaxesWhere,
              },
            }
          : {}
        : {
            municipalTaxes: {
              [params.status === "Criado" ? "some" : "none"]: {
                ...municipalTaxesWhere,
              },
            },
          }),
    };
    const [list, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        select: {
          id: true,
          dominio_code: true,
          name: true,
          cpf_cnpj: true,
          city: true,
          municipalTaxes: {
            where: {
              ...municipalTaxesWhere,
            },
            select: { id: true },
          },
        },
        orderBy: {
          name: "asc",
        },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      data: list as unknown as Record<string, unknown>[],
      total,
      page: params.page,
      limit: params.limit,
      hasMore: params.page * params.limit < total,
    };
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
