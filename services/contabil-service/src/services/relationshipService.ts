import { error as logError, ServiceError } from "@workspace/shared";

import {
  type CreateLogParams,
  createLog,
  type LogUpdateParams,
  logUpdateIfChanged,
} from "../integrations/audit.js";
import prismaClient from "../integrations/prisma.js";

export type RelationshipServicePrisma = typeof prismaClient;

type RelationshipServiceAuditFns = {
  createLog: (params: CreateLogParams) => Promise<void>;
  logUpdateIfChanged: (params: LogUpdateParams) => Promise<void>;
};

export type RelationshipContabilEntity = NonNullable<
  Awaited<ReturnType<RelationshipServicePrisma["relationshipContabil"]["findFirst"]>>
>;

export interface RelationshipAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
}

export interface CreateRelationshipRequest {
  client_id: string;
  bidding: boolean;
  chart_accounts: string;
  tool: string;
  system: string;
  note: string;
}

export interface UpdateRelationshipRequest {
  client_id?: string;
  bidding?: boolean;
  chart_accounts?: string;
  tool?: string;
  system?: string;
  note?: string;
}

export class RelationshipService {
  constructor(
    private readonly prisma: RelationshipServicePrisma = prismaClient,
    private readonly audit: RelationshipServiceAuditFns = { createLog, logUpdateIfChanged },
  ) {}

  async create(
    data: CreateRelationshipRequest,
    auth: RelationshipAuthContext,
  ): Promise<RelationshipContabilEntity> {
    try {
      const duplicate = await this.prisma.relationshipContabil.findFirst({
        where: {
          client_id: data.client_id,
          organization_id: auth.organizationId,
        },
      });

      if (duplicate) {
        throw new ServiceError(409, "Já está cadastrado para esta organização.");
      }

      const relationship = await this.prisma.relationshipContabil.create({
        data: {
          client_id: data.client_id,
          organization_id: auth.organizationId,
          bidding: data.bidding,
          chart_accounts: data.chart_accounts,
          tool: data.tool,
          system: data.system,
          note: data.note,
        },
      });

      await this.audit.createLog({
        userId: auth.userId,
        organizationId: auth.organizationId,
        permission: auth.permission ?? null,
        action: "Cadastro",
        referring: "contabil.relationship",
        referringId: relationship.id,
        changes: "{}",
      });

      return relationship;
    } catch (err: unknown) {
      logError("Erro ao criar relacionamento contábil", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      throw new ServiceError(500, "Erro ao criar relacionamento contábil.", err);
    }
  }

  async update(
    id: string,
    data: UpdateRelationshipRequest,
    auth: RelationshipAuthContext,
  ): Promise<RelationshipContabilEntity> {
    try {
      const exists = await this.prisma.relationshipContabil.findFirst({
        where: { id, organization_id: auth.organizationId },
      });

      if (!exists) {
        throw new ServiceError(404, "Não está cadastrado.");
      }

      const updatePayload: {
        client_id?: string;
        bidding?: boolean;
        chart_accounts?: string;
        tool?: string;
        system?: string;
        note?: string;
      } = {};

      if (data.client_id !== undefined) {
        updatePayload.client_id = data.client_id;
      }
      if (data.bidding !== undefined) {
        updatePayload.bidding = data.bidding;
      }
      if (data.chart_accounts !== undefined) {
        updatePayload.chart_accounts = data.chart_accounts;
      }
      if (data.tool !== undefined) {
        updatePayload.tool = data.tool;
      }
      if (data.system !== undefined) {
        updatePayload.system = data.system;
      }
      if (data.note !== undefined) {
        updatePayload.note = data.note;
      }

      const updated = await this.prisma.relationshipContabil.update({
        where: { id },
        data: updatePayload,
      });

      await this.audit.logUpdateIfChanged({
        userId: auth.userId,
        organizationId: auth.organizationId,
        permission: auth.permission ?? null,
        action: "Atualização",
        referring: "contabil.relationship",
        referringId: id,
        oldData: exists as unknown as Record<string, unknown>,
        updatedData: updated as unknown as Record<string, unknown>,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar relacionamento contábil", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      throw new ServiceError(500, "Erro ao atualizar relacionamento contábil.", err);
    }
  }

  async getByClientId(
    clientId: string,
    organizationId: string,
  ): Promise<RelationshipContabilEntity> {
    const relationship = await this.prisma.relationshipContabil.findFirst({
      where: {
        client_id: clientId,
        organization_id: organizationId,
      },
    });

    if (!relationship) {
      throw new ServiceError(404, "Registro de relacionamento não encontrado para este cliente.");
    }

    return relationship;
  }

  async delete(id: string, organizationId: string): Promise<{ message: string }> {
    try {
      const exists = await this.prisma.relationshipContabil.findFirst({
        where: { id, organization_id: organizationId },
      });

      if (!exists) {
        throw new ServiceError(404, "Não está cadastrado.");
      }

      await this.prisma.relationshipContabil.delete({
        where: { id },
      });

      return { message: "Registro deletado com sucesso." };
    } catch (err: unknown) {
      logError("Erro ao deletar relacionamento contábil", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      throw new ServiceError(500, "Erro ao deletar relacionamento contábil.", err);
    }
  }
}
