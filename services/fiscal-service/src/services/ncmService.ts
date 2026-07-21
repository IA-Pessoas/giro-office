import { error as logError, ServiceError } from "@workspace/shared";

import {
  type CreateLogParams,
  createLog,
  type LogUpdateParams,
  logUpdateIfChanged,
} from "../integrations/audit.js";
import prismaClient from "../integrations/prisma.js";

export type NcmServicePrisma = typeof prismaClient;

type NcmServiceAuditFns = {
  createLog: (params: CreateLogParams) => Promise<void>;
  logUpdateIfChanged: (params: LogUpdateParams) => Promise<void>;
};

export interface NcmAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
}

export interface CreateNcmRequest extends NcmAuthContext {
  tax_regime: string;
  ncm_code: string;
  federal_taxation_type: string;
  description: string;
  ncm_notes?: string;
  cst_pis_outgoing?: string;
  cst_cofins_outgoing?: string;
  product_group?: string;
  validity_start_date: Date;
  information_source?: string;
  reference_legislation?: string;
  validity_end_date?: Date;
}

export interface UpdateNcmRequest extends NcmAuthContext {
  ncm_id: string;
  tax_regime: string;
  ncm_code: string;
  federal_taxation_type: string;
  description: string;
  ncm_notes?: string;
  cst_pis_outgoing?: string;
  cst_cofins_outgoing?: string;
  product_group?: string;
  validity_start_date: Date;
  information_source?: string;
  reference_legislation?: string;
  validity_end_date?: Date;
}

const NCM_SELECT = {
  id: true,
  tax_regime: true,
  ncm_code: true,
  federal_taxation_type: true,
  description: true,
  ncm_notes: true,
  cst_pis_outgoing: true,
  cst_cofins_outgoing: true,
  product_group: true,
  validity_start_date: true,
  information_source: true,
  reference_legislation: true,
  validity_end_date: true,
} as const;

export class NcmService {
  constructor(
    private readonly prisma: NcmServicePrisma = prismaClient,
    private readonly audit: NcmServiceAuditFns = { createLog, logUpdateIfChanged },
  ) {}

  async create(data: CreateNcmRequest): Promise<{ create: unknown }> {
    const exists = await this.prisma.ncm.findFirst({
      where: {
        organization_id: data.organizationId,
        tax_regime: data.tax_regime,
        ncm_code: data.ncm_code,
        federal_taxation_type: data.federal_taxation_type,
        description: data.description,
        ncm_notes: data.ncm_notes,
        cst_pis_outgoing: data.cst_pis_outgoing,
        cst_cofins_outgoing: data.cst_cofins_outgoing,
        product_group: data.product_group,
        validity_start_date: data.validity_start_date,
        information_source: data.information_source,
        reference_legislation: data.reference_legislation,
        validity_end_date: data.validity_end_date,
      },
    });

    if (exists) {
      throw new ServiceError(409, "Já cadastrado.");
    }

    const create = await this.prisma.ncm.create({
      data: {
        organization_id: data.organizationId,
        tax_regime: data.tax_regime,
        ncm_code: data.ncm_code,
        federal_taxation_type: data.federal_taxation_type,
        description: data.description,
        ncm_notes: data.ncm_notes,
        cst_pis_outgoing: data.cst_pis_outgoing,
        cst_cofins_outgoing: data.cst_cofins_outgoing,
        product_group: data.product_group,
        validity_start_date: data.validity_start_date,
        information_source: data.information_source,
        reference_legislation: data.reference_legislation,
        validity_end_date: data.validity_end_date,
      },
      select: NCM_SELECT,
    });

    await this.audit.createLog({
      userId: data.userId,
      organizationId: data.organizationId,
      permission: data.permission ?? null,
      action: "Cadastro",
      referring: "fiscal.ncm",
      referringId: create.id,
      changes: "{}",
    });

    return { create };
  }

  async update(data: UpdateNcmRequest): Promise<unknown> {
    try {
      const exists = await this.prisma.ncm.findFirst({
        where: { id: data.ncm_id, organization_id: data.organizationId },
      });

      if (!exists) {
        throw new ServiceError(404, "NCM não existe.");
      }

      const updated = await this.prisma.ncm.update({
        where: { id: data.ncm_id },
        data: {
          tax_regime: data.tax_regime,
          ncm_code: data.ncm_code,
          federal_taxation_type: data.federal_taxation_type,
          description: data.description,
          ncm_notes: data.ncm_notes,
          cst_pis_outgoing: data.cst_pis_outgoing,
          cst_cofins_outgoing: data.cst_cofins_outgoing,
          product_group: data.product_group,
          validity_start_date: data.validity_start_date,
          information_source: data.information_source,
          reference_legislation: data.reference_legislation,
          validity_end_date: data.validity_end_date,
        },
        select: NCM_SELECT,
      });

      await this.audit.logUpdateIfChanged({
        userId: data.userId,
        organizationId: data.organizationId,
        permission: data.permission ?? null,
        action: "Atualização",
        referring: "fiscal.ncm",
        referringId: data.ncm_id,
        oldData: exists as unknown as Record<string, unknown>,
        updatedData: updated as unknown as Record<string, unknown>,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar NCM", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar.", err);
    }
  }

  async detail(ncmId: string, organizationId: string): Promise<{ detail: unknown }> {
    const detail = await this.prisma.ncm.findFirst({
      where: { id: ncmId, organization_id: organizationId },
      select: NCM_SELECT,
    });

    if (!detail) {
      throw new ServiceError(404, "NCM não encontrado.");
    }

    return { detail };
  }

  async list(ncmCodes: string[], organizationId: string): Promise<unknown[]> {
    if (!ncmCodes || ncmCodes.length === 0) {
      return [];
    }

    return this.prisma.ncm.findMany({
      where: {
        organization_id: organizationId,
        ncm_code: { in: ncmCodes },
      },
      select: NCM_SELECT,
      orderBy: { ncm_code: "asc" },
    });
  }
}
