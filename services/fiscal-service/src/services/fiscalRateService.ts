import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateLogParams } from "../integrations/audit.js";
import { getPaginationParams, type PaginationQuery } from "../schemas/pagination.schemas.js";

export type FiscalRatePrisma = Pick<PrismaClient, "client" | "fiscalRate">;
export type FiscalTaxType = "ISS" | "ICMS";

export interface CreateFiscalRateInput {
  organizationId: string;
  userId: string;
  permission?: number;
  client_id: string;
  competence: string;
  tax_type: FiscalTaxType;
  rate: string;
}

export interface FiscalRateDto {
  id: string;
  client_id: string;
  client_name: string;
  client_document: string;
  competence: string;
  tax_type: string;
  rate: string;
  issued_by: string;
  createdAt: string;
}

export interface ListFiscalRatesInput extends PaginationQuery {
  client_id: string;
  competence?: string;
  tax_type?: FiscalTaxType;
}

function serializeRate(value: {
  id: string;
  client_id: string;
  client_name: string;
  client_document: string;
  competence: Date;
  tax_type: string;
  rate: { toString(): string };
  issued_by: string;
  createdAt: Date;
}): FiscalRateDto {
  return {
    id: value.id,
    client_id: value.client_id,
    client_name: value.client_name,
    client_document: value.client_document,
    competence: value.competence.toISOString().slice(0, 7),
    tax_type: value.tax_type,
    rate: value.rate.toString(),
    issued_by: value.issued_by,
    createdAt: value.createdAt.toISOString(),
  };
}

export class FiscalRateService {
  constructor(
    private readonly prisma: FiscalRatePrisma,
    private readonly audit: { createLog(params: CreateLogParams): Promise<void> },
  ) {}

  async create(input: CreateFiscalRateInput): Promise<FiscalRateDto> {
    const client = await this.prisma.client.findFirst({
      where: { id: input.client_id, organization_id: input.organizationId, type: "PJ" },
      select: { id: true, name: true, company_name: true, cpf_cnpj: true },
    });
    if (!client) throw new ServiceError(404, "Empresa não encontrada.");
    if (client.cpf_cnpj.replace(/\D/g, "").length !== 14) {
      throw new ServiceError(422, "Empresa sem CNPJ válido cadastrado.");
    }

    const rate = input.rate.replace(",", ".");
    const created = await this.prisma.fiscalRate.create({
      data: {
        organization_id: input.organizationId,
        client_id: client.id,
        client_name: client.company_name?.trim() || client.name,
        client_document: client.cpf_cnpj,
        competence: new Date(`${input.competence}-01T00:00:00.000Z`),
        tax_type: input.tax_type,
        rate,
        issued_by: input.userId,
      },
    });
    await this.audit.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      permission: input.permission ?? null,
      action: "Cadastro",
      referring: "fiscal.rate_statements",
      referringId: created.id,
      changes: "{}",
    });
    return { ...serializeRate(created), rate };
  }

  async list(
    input: ListFiscalRatesInput,
    organizationId: string,
  ): Promise<{
    data: FiscalRateDto[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const page = input.page ?? 1;
    const { skip, take } = getPaginationParams(input);
    const where = {
      organization_id: organizationId,
      client_id: input.client_id,
      ...(input.competence ? { competence: new Date(`${input.competence}-01T00:00:00.000Z`) } : {}),
      ...(input.tax_type ? { tax_type: input.tax_type } : {}),
    };
    const [total, records] = await Promise.all([
      this.prisma.fiscalRate.count({ where }),
      this.prisma.fiscalRate.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
    ]);
    return {
      data: records.map(serializeRate),
      total,
      page,
      limit: take,
      hasMore: page * take < total,
    };
  }

  async get(id: string, organizationId: string): Promise<FiscalRateDto> {
    const record = await this.prisma.fiscalRate.findFirst({
      where: { id, organization_id: organizationId },
    });
    if (!record) throw new ServiceError(404, "Alíquota não encontrada.");
    return serializeRate(record);
  }
}
