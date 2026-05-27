import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  CertificatePjListQuery,
  CreateCertificatePjInput,
  UpdateCertificatePjInput,
} from "../schemas/certificatePj.schemas.js";
import { getPaginationParams } from "../schemas/pagination.schemas.js";
import { isPrismaUniqueConstraintError } from "./prismaErrors.js";

export interface CertificatePjContext {
  organizationId: string;
}

export interface CertificatePjListInput extends CertificatePjContext {
  query: CertificatePjListQuery;
}

export interface CertificatePjGetInput extends CertificatePjContext {
  id: string;
  canViewPassword: boolean;
}

export interface CertificatePjCreateInput extends CertificatePjContext {
  data: CreateCertificatePjInput;
}

export interface CertificatePjUpdateInput extends CertificatePjContext {
  id: string;
  data: UpdateCertificatePjInput;
}

export interface CertificatePjPublicResult {
  id: string;
  client_castelo_status: boolean;
  client_focus_status: boolean;
  name: string;
  cnpj: string;
  responsible: string;
  model: string;
  legal_nature: string;
  expiration_date: Date;
  notes: string | null;
  was_paid: boolean;
  payment_date: Date | null;
  payment_amount: number | null;
  contact_info: string | null;
  file_path: string | null;
  has_certificate: boolean;
  organization_id: string;
}

export interface CertificatePjDetailResult extends CertificatePjPublicResult {
  password?: string;
}

export type CertificatePjListResult = CertificatePjPublicResult[];

const certificatePjPublicSelect = {
  id: true,
  client_castelo_status: true,
  client_focus_status: true,
  name: true,
  cnpj: true,
  responsible: true,
  model: true,
  legal_nature: true,
  expiration_date: true,
  notes: true,
  was_paid: true,
  payment_date: true,
  payment_amount: true,
  contact_info: true,
  file_path: true,
  has_certificate: true,
  organization_id: true,
};

function removePassword(record: CertificatePjDetailResult): CertificatePjPublicResult {
  const { password: _password, ...publicRecord } = record;
  return publicRecord;
}

function buildListWhere(organizationId: string, query: CertificatePjListQuery) {
  return {
    organization_id: organizationId,
    ...(query.name ? { name: { contains: query.name, mode: "insensitive" as const } } : {}),
    ...(query.cnpj ? { cnpj: { contains: query.cnpj } } : {}),
    ...(query.responsible
      ? { responsible: { contains: query.responsible, mode: "insensitive" as const } }
      : {}),
    ...(query.model ? { model: query.model } : {}),
    ...(query.client_castelo_status === undefined
      ? {}
      : { client_castelo_status: query.client_castelo_status }),
    ...(query.client_focus_status === undefined
      ? {}
      : { client_focus_status: query.client_focus_status }),
    ...(query.was_paid === undefined ? {} : { was_paid: query.was_paid }),
    ...(query.has_certificate === undefined ? {} : { has_certificate: query.has_certificate }),
  };
}

export class CertificatePjService {
  constructor(private readonly prisma: PrismaClient) {}

  async listCertificatePj(input: CertificatePjListInput): Promise<CertificatePjListResult> {
    const pagination = getPaginationParams(input.query);
    const records = await this.prisma.certificatePJ.findMany({
      where: buildListWhere(input.organizationId, input.query),
      orderBy: [{ expiration_date: "asc" }, { name: "asc" }],
      ...pagination,
      select: certificatePjPublicSelect,
    });

    return records.map((record) => removePassword(record as CertificatePjDetailResult));
  }

  async getCertificatePj(input: CertificatePjGetInput): Promise<CertificatePjDetailResult> {
    const record = await this.prisma.certificatePJ.findFirst({
      where: {
        id: input.id,
        organization_id: input.organizationId,
      },
    });

    if (!record) {
      throw new ServiceError(404, "Certificado PJ nao encontrado.");
    }

    if (!input.canViewPassword) {
      return removePassword(record);
    }

    return record;
  }

  async createCertificatePj(input: CertificatePjCreateInput): Promise<CertificatePjDetailResult> {
    try {
      const existing = await this.prisma.certificatePJ.findFirst({
        where: {
          organization_id: input.organizationId,
          name: input.data.name,
          cnpj: input.data.cnpj,
          model: input.data.model,
        },
      });

      if (existing) {
        throw new ServiceError(409, "Ja existe um certificado PJ com estes dados.");
      }

      return await this.prisma.certificatePJ.create({
        data: {
          ...input.data,
          organization_id: input.organizationId,
        },
      });
    } catch (err: unknown) {
      logError("Erro ao criar certificado PJ", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueConstraintError(err)) {
        throw new ServiceError(409, "Ja existe um certificado PJ com estes dados.", err);
      }
      throw new ServiceError(500, "Erro ao criar certificado PJ.", err);
    }
  }

  async updateCertificatePj(input: CertificatePjUpdateInput): Promise<CertificatePjDetailResult> {
    try {
      const existing = await this.prisma.certificatePJ.findFirst({
        where: { id: input.id, organization_id: input.organizationId },
      });

      if (!existing) {
        throw new ServiceError(404, "Certificado PJ nao encontrado.");
      }

      const name = input.data.name ?? existing.name;
      const cnpj = input.data.cnpj ?? existing.cnpj;
      const model = input.data.model ?? existing.model;
      const shouldCheckDuplicate =
        input.data.name !== undefined ||
        input.data.cnpj !== undefined ||
        input.data.model !== undefined;

      if (shouldCheckDuplicate) {
        const duplicate = await this.prisma.certificatePJ.findFirst({
          where: {
            organization_id: input.organizationId,
            name,
            cnpj,
            model,
            NOT: { id: input.id },
          },
        });

        if (duplicate) {
          throw new ServiceError(409, "Ja existe um certificado PJ com estes dados.");
        }
      }

      return await this.prisma.certificatePJ.update({
        where: { id: input.id, organization_id: input.organizationId },
        data: input.data,
      });
    } catch (err: unknown) {
      logError("Erro ao atualizar certificado PJ", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueConstraintError(err)) {
        throw new ServiceError(409, "Ja existe um certificado PJ com estes dados.", err);
      }
      throw new ServiceError(500, "Erro ao atualizar certificado PJ.", err);
    }
  }
}
