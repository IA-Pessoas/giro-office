import { error as logError, ServiceError } from "@workspace/shared";

import {
  type CreateLogParams,
  createLog,
  type LogUpdateParams,
  logUpdateIfChanged,
} from "../integrations/audit.js";
import prismaClient from "../integrations/prisma.js";

export type IpiServicePrisma = typeof prismaClient;

type IpiServiceAuditFns = {
  createLog: (params: CreateLogParams) => Promise<void>;
  logUpdateIfChanged: (params: LogUpdateParams) => Promise<void>;
};

export interface IpiAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
}

export interface CreateIpiRequest extends IpiAuthContext {
  ncm: string;
  ex?: string;
  description?: string;
  aliquot?: string;
}

export interface UpdateIpiRequest extends IpiAuthContext {
  ipi_id: string;
  ncm: string;
  ex?: string;
  description?: string;
  aliquot?: string;
}

const IPI_SELECT = {
  id: true,
  ncm: true,
  ex: true,
  description: true,
  aliquot: true,
} as const;

export class IpiService {
  constructor(
    private readonly prisma: IpiServicePrisma = prismaClient,
    private readonly audit: IpiServiceAuditFns = { createLog, logUpdateIfChanged },
  ) {}

  async create(data: CreateIpiRequest): Promise<{ create: unknown }> {
    const exists = await this.prisma.ipi.findFirst({
      where: {
        organization_id: data.organizationId,
        ncm: data.ncm,
        ex: data.ex,
        description: data.description,
        aliquot: data.aliquot,
      },
    });

    if (exists) {
      throw new ServiceError(409, "Já cadastrado.");
    }

    const create = await this.prisma.ipi.create({
      data: {
        organization_id: data.organizationId,
        ncm: data.ncm,
        ex: data.ex,
        description: data.description,
        aliquot: data.aliquot,
      },
      select: IPI_SELECT,
    });

    await this.audit.createLog({
      userId: data.userId,
      organizationId: data.organizationId,
      permission: data.permission ?? null,
      action: "Cadastro",
      referring: "fiscal.ipi",
      referringId: create.id,
      changes: "{}",
    });

    return { create };
  }

  async update(data: UpdateIpiRequest): Promise<unknown> {
    try {
      const exists = await this.prisma.ipi.findFirst({
        where: { id: data.ipi_id, organization_id: data.organizationId },
      });

      if (!exists) {
        throw new ServiceError(404, "IPI não existe.");
      }

      const updated = await this.prisma.ipi.update({
        where: { id: data.ipi_id },
        data: {
          ncm: data.ncm,
          ex: data.ex,
          description: data.description,
          aliquot: data.aliquot,
        },
        select: IPI_SELECT,
      });

      await this.audit.logUpdateIfChanged({
        userId: data.userId,
        organizationId: data.organizationId,
        permission: data.permission ?? null,
        action: "Atualização",
        referring: "fiscal.ipi",
        referringId: data.ipi_id,
        oldData: exists as unknown as Record<string, unknown>,
        updatedData: updated as unknown as Record<string, unknown>,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar IPI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar.", err);
    }
  }

  async detail(ipiId: string, organizationId: string): Promise<{ detail: unknown }> {
    const detail = await this.prisma.ipi.findFirst({
      where: { id: ipiId, organization_id: organizationId },
      select: IPI_SELECT,
    });

    if (!detail) {
      throw new ServiceError(404, "IPI não encontrado.");
    }

    return { detail };
  }

  async list(ipiCodes: string[], organizationId: string): Promise<unknown[]> {
    if (!ipiCodes || ipiCodes.length === 0) {
      return [];
    }

    return this.prisma.ipi.findMany({
      where: {
        organization_id: organizationId,
        ncm: { in: ipiCodes },
      },
      select: IPI_SELECT,
      orderBy: { ncm: "asc" },
    });
  }
}
