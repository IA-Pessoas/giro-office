import { error as logError, ServiceError } from "@workspace/shared";

import {
  type CreateLogParams,
  createLog,
  type LogUpdateParams,
  logUpdateIfChanged,
} from "../integrations/audit.js";
import prismaClient from "../integrations/prisma.js";
import { getPaginationParams, type PaginationQuery } from "../schemas/pagination.schemas.js";

export type IcmsServicePrisma = typeof prismaClient;

type IcmsServiceAuditFns = {
  createLog: (params: CreateLogParams) => Promise<void>;
  logUpdateIfChanged: (params: LogUpdateParams) => Promise<void>;
};

export interface IcmsAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
}

export interface CreateIcmsRequest extends IcmsAuthContext {
  state: string;
  item_number?: string;
  cest_code?: string;
  description: string;
  interstate_agreement?: string;
  applied_original_mva?: string;
  adjusted_mva?: string;
  original_mva?: string;
}

export interface UpdateIcmsRequest extends IcmsAuthContext {
  icms_id: string;
  state: string;
  item_number?: string;
  cest_code?: string;
  description: string;
  interstate_agreement?: string;
  applied_original_mva?: string;
  adjusted_mva?: string;
  original_mva?: string;
}

export interface ListIcmsRequest extends PaginationQuery {
  icmsCodes?: string[];
}

export interface IcmsListResult {
  data: unknown[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

const ICMS_SELECT = {
  id: true,
  state: true,
  item_number: true,
  cest_code: true,
  description: true,
  interstate_agreement: true,
  applied_original_mva: true,
  adjusted_mva: true,
  original_mva: true,
} as const;

export class IcmsService {
  constructor(
    private readonly prisma: IcmsServicePrisma = prismaClient,
    private readonly audit: IcmsServiceAuditFns = { createLog, logUpdateIfChanged },
  ) {}

  async create(data: CreateIcmsRequest): Promise<{ create: unknown }> {
    const exists = await this.prisma.icms.findFirst({
      where: {
        organization_id: data.organizationId,
        state: data.state,
        item_number: data.item_number,
        cest_code: data.cest_code,
        description: data.description,
        interstate_agreement: data.interstate_agreement,
        applied_original_mva: data.applied_original_mva,
        adjusted_mva: data.adjusted_mva,
        original_mva: data.original_mva,
      },
    });

    if (exists) {
      throw new ServiceError(409, "Já cadastrado.");
    }

    const create = await this.prisma.icms.create({
      data: {
        organization_id: data.organizationId,
        state: data.state,
        item_number: data.item_number,
        cest_code: data.cest_code,
        description: data.description,
        interstate_agreement: data.interstate_agreement,
        applied_original_mva: data.applied_original_mva,
        adjusted_mva: data.adjusted_mva,
        original_mva: data.original_mva,
      },
      select: ICMS_SELECT,
    });

    await this.audit.createLog({
      userId: data.userId,
      organizationId: data.organizationId,
      permission: data.permission ?? null,
      action: "Cadastro",
      referring: "fiscal.icms",
      referringId: create.id,
      changes: "{}",
    });

    return { create };
  }

  async update(data: UpdateIcmsRequest): Promise<unknown> {
    try {
      const exists = await this.prisma.icms.findFirst({
        where: { id: data.icms_id, organization_id: data.organizationId },
      });

      if (!exists) {
        throw new ServiceError(404, "ICMS não existe.");
      }

      const updated = await this.prisma.icms.update({
        where: { id: data.icms_id },
        data: {
          state: data.state,
          item_number: data.item_number,
          cest_code: data.cest_code,
          description: data.description,
          interstate_agreement: data.interstate_agreement,
          applied_original_mva: data.applied_original_mva,
          adjusted_mva: data.adjusted_mva,
          original_mva: data.original_mva,
        },
        select: ICMS_SELECT,
      });

      await this.audit.logUpdateIfChanged({
        userId: data.userId,
        organizationId: data.organizationId,
        permission: data.permission ?? null,
        action: "Atualização",
        referring: "fiscal.icms",
        referringId: data.icms_id,
        oldData: exists as unknown as Record<string, unknown>,
        updatedData: updated as unknown as Record<string, unknown>,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar ICMS", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar.", err);
    }
  }

  async detail(icmsId: string, organizationId: string): Promise<{ detail: unknown }> {
    const detail = await this.prisma.icms.findFirst({
      where: { id: icmsId, organization_id: organizationId },
      select: ICMS_SELECT,
    });

    if (!detail) {
      throw new ServiceError(404, "ICMS não encontrado.");
    }

    return { detail };
  }

  async list(query: ListIcmsRequest, organizationId: string): Promise<IcmsListResult> {
    const page = query.page ?? 1;
    const { skip, take } = getPaginationParams(query);
    const terms = query.icmsCodes?.map((code) => code.trim()).filter(Boolean) ?? [];
    const where = {
      organization_id: organizationId,
      ...(terms.length > 0
        ? {
            OR: terms.map((code) => ({
              description: { contains: code, mode: "insensitive" as const },
            })),
          }
        : {}),
    };
    const [total, data] = await Promise.all([
      this.prisma.icms.count({ where }),
      this.prisma.icms.findMany({
        where,
        select: ICMS_SELECT,
        orderBy: { description: "asc" },
        skip,
        take,
      }),
    ]);

    return {
      data,
      total,
      page,
      limit: take,
      hasMore: page * take < total,
    };
  }
}
