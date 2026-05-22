import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  CertificatePfListQuery,
  CreateCertificatePfInput,
  UpdateCertificatePfInput,
} from "../schemas/certificatePf.schemas.js";

export interface CertificatePfContext {
  organizationId: string;
}

export interface CertificatePfListInput extends CertificatePfContext {
  query: CertificatePfListQuery;
}

export interface CertificatePfGetInput extends CertificatePfContext {
  id: string;
  canViewPassword: boolean;
}

export interface CertificatePfCreateInput extends CertificatePfContext {
  data: CreateCertificatePfInput;
}

export interface CertificatePfUpdateInput extends CertificatePfContext {
  id: string;
  data: UpdateCertificatePfInput;
}

export interface CertificatePfPublicResult {
  id: string;
  client_castelo_status: boolean;
  client_focus_status: boolean;
  name: string;
  cpf: string;
  model: string;
  expiration_date: Date;
  notes: string | null;
  enterprise: string | null;
  cnpj: string | null;
  was_paid: boolean;
  payment_date: Date | null;
  payment_amount: number | null;
  contact_info: string | null;
  file_path: string | null;
  has_certificate: boolean;
  organization_id: string;
}

export interface CertificatePfDetailResult extends CertificatePfPublicResult {
  password?: string;
}

export type CertificatePfListResult = CertificatePfPublicResult[];

const certificatePfPublicSelect = {
  id: true,
  client_castelo_status: true,
  client_focus_status: true,
  name: true,
  cpf: true,
  model: true,
  expiration_date: true,
  notes: true,
  enterprise: true,
  cnpj: true,
  was_paid: true,
  payment_date: true,
  payment_amount: true,
  contact_info: true,
  file_path: true,
  has_certificate: true,
  organization_id: true,
};

function removePassword(record: CertificatePfDetailResult): CertificatePfPublicResult {
  const { password: _password, ...publicRecord } = record;
  return publicRecord;
}

function buildListWhere(organizationId: string, query: CertificatePfListQuery) {
  return {
    organization_id: organizationId,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { cpf: { contains: query.search } },
            { enterprise: { contains: query.search, mode: "insensitive" as const } },
            { cnpj: { contains: query.search } },
          ],
        }
      : {}),
    ...(query.name ? { name: { contains: query.name, mode: "insensitive" as const } } : {}),
    ...(query.cpf ? { cpf: { contains: query.cpf } } : {}),
    ...(query.enterprise
      ? { enterprise: { contains: query.enterprise, mode: "insensitive" as const } }
      : {}),
    ...(query.cnpj ? { cnpj: { contains: query.cnpj } } : {}),
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

export class CertificatePfService {
  constructor(private readonly prisma: PrismaClient) {}

  async listCertificatePf(input: CertificatePfListInput): Promise<CertificatePfListResult> {
    const records = await this.prisma.certificatePF.findMany({
      where: buildListWhere(input.organizationId, input.query),
      orderBy: [{ expiration_date: "asc" }, { name: "asc" }],
      select: certificatePfPublicSelect,
    });

    return records.map((record) => removePassword(record as CertificatePfDetailResult));
  }

  async getCertificatePf(input: CertificatePfGetInput): Promise<CertificatePfDetailResult> {
    const record = await this.prisma.certificatePF.findFirst({
      where: {
        id: input.id,
        organization_id: input.organizationId,
      },
    });

    if (!record) {
      throw new ServiceError(404, "Certificado PF nao encontrado.");
    }

    if (!input.canViewPassword) {
      return removePassword(record);
    }

    return record;
  }

  async createCertificatePf(input: CertificatePfCreateInput): Promise<CertificatePfDetailResult> {
    try {
      const existing = await this.prisma.certificatePF.findFirst({
        where: {
          organization_id: input.organizationId,
          name: input.data.name,
          cpf: input.data.cpf,
          model: input.data.model,
        },
      });

      if (existing) {
        throw new ServiceError(409, "Ja existe um certificado PF com estes dados.");
      }

      return this.prisma.certificatePF.create({
        data: {
          ...input.data,
          organization_id: input.organizationId,
        },
      });
    } catch (err: unknown) {
      logError("Erro ao criar certificado PF", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar certificado PF.", err);
    }
  }

  async updateCertificatePf(input: CertificatePfUpdateInput): Promise<CertificatePfDetailResult> {
    try {
      const existing = await this.prisma.certificatePF.findFirst({
        where: { id: input.id, organization_id: input.organizationId },
      });

      if (!existing) {
        throw new ServiceError(404, "Certificado PF nao encontrado.");
      }

      const name = input.data.name ?? existing.name;
      const cpf = input.data.cpf ?? existing.cpf;
      const model = input.data.model ?? existing.model;
      const shouldCheckDuplicate =
        input.data.name !== undefined ||
        input.data.cpf !== undefined ||
        input.data.model !== undefined;

      if (shouldCheckDuplicate) {
        const duplicate = await this.prisma.certificatePF.findFirst({
          where: {
            organization_id: input.organizationId,
            name,
            cpf,
            model,
            NOT: { id: input.id },
          },
        });

        if (duplicate) {
          throw new ServiceError(409, "Ja existe um certificado PF com estes dados.");
        }
      }

      return this.prisma.certificatePF.update({
        where: { id: input.id, organization_id: input.organizationId },
        data: input.data,
      });
    } catch (err: unknown) {
      logError("Erro ao atualizar certificado PF", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar certificado PF.", err);
    }
  }
}
