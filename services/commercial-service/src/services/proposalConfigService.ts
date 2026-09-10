import { error as logError, ServiceError } from "@workspace/shared";

import * as commercialAudit from "../integrations/audit.js";
import prismaClient from "../integrations/prisma.js";

const PROPOSAL_CONFIG_SELECT = {
  id: true,
  name: true,
  contract_value: true,
} as const;

const DUPLICATE_CONFIG_MESSAGE = "Já existe uma configuração com esse nome.";

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export interface CommercialProposalConfig {
  id: string;
  name: string;
  contract_value: number;
}

export interface CreateCommercialProposalConfigRequest {
  user_id: string;
  organization_id: string;
  name: string;
  contract_value: number;
}

export interface UpdateCommercialProposalConfigRequest {
  user_id: string;
  organization_id: string;
  config_id: string;
  name?: string;
  contract_value?: number;
}

export type CommercialProposalConfigPrismaDeps = Pick<typeof prismaClient, "proposalConfig">;
export interface CommercialProposalConfigAuditDeps {
  createLog: typeof commercialAudit.createLog;
  logUpdateIfChanged: typeof commercialAudit.logUpdateIfChanged;
}

const defaultAuditDeps: CommercialProposalConfigAuditDeps = commercialAudit;

export class CommercialProposalConfigService {
  constructor(
    private readonly prisma: CommercialProposalConfigPrismaDeps = prismaClient,
    private readonly audit: CommercialProposalConfigAuditDeps = defaultAuditDeps,
  ) {}

  async create(data: CreateCommercialProposalConfigRequest): Promise<CommercialProposalConfig> {
    try {
      const duplicate = await this.prisma.proposalConfig.findFirst({
        where: { name: data.name, organization_id: data.organization_id },
        select: { id: true },
      });
      if (duplicate) throw new ServiceError(409, DUPLICATE_CONFIG_MESSAGE);

      const created = await this.prisma.proposalConfig.create({
        data: {
          name: data.name,
          contract_value: data.contract_value,
          organization_id: data.organization_id,
        },
        select: PROPOSAL_CONFIG_SELECT,
      });
      await this.audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Cadastro",
        referring: "proposal.config",
        referringId: created.id,
        changes: {},
      });
      return created;
    } catch (err: unknown) {
      logError("Erro ao cadastrar configuração comercial", { err });
      if (err instanceof ServiceError) throw err;
      if (isUniqueConstraintError(err)) throw new ServiceError(409, DUPLICATE_CONFIG_MESSAGE);
      throw new ServiceError(500, "Não foi possível cadastrar a configuração comercial.", err);
    }
  }

  async list(organization_id: string): Promise<CommercialProposalConfig[]> {
    try {
      return await this.prisma.proposalConfig.findMany({
        where: { organization_id },
        select: PROPOSAL_CONFIG_SELECT,
        orderBy: { name: "asc" },
      });
    } catch (err: unknown) {
      logError("Erro ao listar configurações comerciais", { err });
      throw new ServiceError(500, "Não foi possível listar as configurações comerciais.", err);
    }
  }

  async detail(id: string, organization_id: string): Promise<CommercialProposalConfig> {
    try {
      const item = await this.prisma.proposalConfig.findFirst({
        where: { id, organization_id },
        select: PROPOSAL_CONFIG_SELECT,
      });
      if (!item) throw new ServiceError(404, "Configuração comercial não encontrada.");
      return item;
    } catch (err: unknown) {
      logError("Erro ao buscar configuração comercial", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível buscar a configuração comercial.", err);
    }
  }

  async update(data: UpdateCommercialProposalConfigRequest): Promise<CommercialProposalConfig> {
    try {
      const current = await this.prisma.proposalConfig.findFirst({
        where: { id: data.config_id, organization_id: data.organization_id },
        select: PROPOSAL_CONFIG_SELECT,
      });
      if (!current) throw new ServiceError(404, "Configuração comercial não encontrada.");

      const nextName = data.name ?? current.name;
      if (nextName !== current.name) {
        const duplicate = await this.prisma.proposalConfig.findFirst({
          where: {
            name: nextName,
            organization_id: data.organization_id,
            NOT: { id: data.config_id },
          },
          select: { id: true },
        });
        if (duplicate) throw new ServiceError(409, DUPLICATE_CONFIG_MESSAGE);
      }

      const updateResult = await this.prisma.proposalConfig.updateMany({
        where: { id: data.config_id, organization_id: data.organization_id },
        data: { name: nextName, contract_value: data.contract_value ?? current.contract_value },
      });
      if (updateResult.count !== 1) {
        throw new ServiceError(404, "Configuração comercial não encontrada.");
      }

      const updated = await this.prisma.proposalConfig.findFirst({
        where: { id: data.config_id, organization_id: data.organization_id },
        select: PROPOSAL_CONFIG_SELECT,
      });
      if (!updated) throw new ServiceError(404, "Configuração comercial não encontrada.");
      await this.audit.logUpdateIfChanged({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Atualização",
        referring: "proposal.config",
        referringId: data.config_id,
        oldData: current,
        updatedData: updated,
      });
      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar configuração comercial", { err });
      if (err instanceof ServiceError) throw err;
      if (isUniqueConstraintError(err)) throw new ServiceError(409, DUPLICATE_CONFIG_MESSAGE);
      throw new ServiceError(500, "Não foi possível atualizar a configuração comercial.", err);
    }
  }
}
