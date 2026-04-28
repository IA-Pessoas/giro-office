import { error as logError, ServiceError } from "@workspace/shared";

import {
  type CreateLogParams,
  createLog,
  type LogUpdateParams,
  logUpdateIfChanged,
} from "../integrations/audit.js";
import prismaClient from "../integrations/prisma.js";

export type ResponsibleServicePrisma = typeof prismaClient;

type ResponsibleServiceAuditFns = {
  createLog: (params: CreateLogParams) => Promise<void>;
  logUpdateIfChanged: (params: LogUpdateParams) => Promise<void>;
};

export type ResponsibleContabilEntity = NonNullable<
  Awaited<ReturnType<ResponsibleServicePrisma["responsibleContabil"]["findFirst"]>>
>;

export interface ResponsibleAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
}

export interface CreateResponsibleRequest {
  client_id: string;
  person_responsible_id?: string;
  posted_by_id?: string;
  customer_with_movement?: boolean;
}

export interface UpdateResponsibleRequest {
  client_id?: string;
  person_responsible_id?: string | null;
  posted_by_id?: string | null;
  customer_with_movement?: boolean;
}

export class ResponsibleService {
  constructor(
    private readonly prisma: ResponsibleServicePrisma = prismaClient,
    private readonly audit: ResponsibleServiceAuditFns = { createLog, logUpdateIfChanged },
  ) {}

  async create(
    data: CreateResponsibleRequest,
    auth: ResponsibleAuthContext,
  ): Promise<ResponsibleContabilEntity> {
    try {
      const duplicate = await this.prisma.responsibleContabil.findFirst({
        where: {
          client_id: data.client_id,
          organization_id: auth.organizationId,
        },
      });

      if (duplicate) {
        throw new ServiceError(409, "Já está cadastrado para esta organização.");
      }

      const responsible = await this.prisma.responsibleContabil.create({
        data: {
          client_id: data.client_id,
          organization_id: auth.organizationId,
          person_responsible_id: data.person_responsible_id ?? null,
          posted_by_id: data.posted_by_id ?? null,
          customer_with_movement: data.customer_with_movement ?? false,
        },
      });

      await this.audit.createLog({
        userId: auth.userId,
        organizationId: auth.organizationId,
        permission: auth.permission ?? null,
        action: "Cadastro",
        referring: "contabil.responsibles",
        referringId: responsible.id,
        changes: "{}",
      });

      return responsible;
    } catch (err: unknown) {
      logError("Erro ao criar responsável contábil", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      throw new ServiceError(500, "Erro ao criar responsável contábil.", err);
    }
  }

  async update(
    id: string,
    data: UpdateResponsibleRequest,
    auth: ResponsibleAuthContext,
  ): Promise<ResponsibleContabilEntity> {
    try {
      const exists = await this.prisma.responsibleContabil.findFirst({
        where: { id, organization_id: auth.organizationId },
      });

      if (!exists) {
        throw new ServiceError(404, "Não está cadastrado.");
      }

      const updatePayload: {
        client_id?: string;
        person_responsible_id?: string | null;
        posted_by_id?: string | null;
        customer_with_movement?: boolean;
      } = {};

      if (data.client_id !== undefined) {
        updatePayload.client_id = data.client_id;
      }
      if (data.person_responsible_id !== undefined) {
        updatePayload.person_responsible_id = data.person_responsible_id;
      }
      if (data.posted_by_id !== undefined) {
        updatePayload.posted_by_id = data.posted_by_id;
      }
      if (data.customer_with_movement !== undefined) {
        updatePayload.customer_with_movement = data.customer_with_movement;
      }

      const updated = await this.prisma.responsibleContabil.update({
        where: { id },
        data: updatePayload,
      });

      await this.audit.logUpdateIfChanged({
        userId: auth.userId,
        organizationId: auth.organizationId,
        permission: auth.permission ?? null,
        action: "Atualização",
        referring: "contabil.responsibles",
        referringId: id,
        oldData: exists as unknown as Record<string, unknown>,
        updatedData: updated as unknown as Record<string, unknown>,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar responsável contábil", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      throw new ServiceError(500, "Erro ao atualizar responsável contábil.", err);
    }
  }

  async getByClientId(clientId: string, organizationId: string): Promise<ResponsibleContabilEntity> {
    const responsible = await this.prisma.responsibleContabil.findFirst({
      where: {
        client_id: clientId,
        organization_id: organizationId,
      },
    });

    if (!responsible) {
      throw new ServiceError(404, "Registro de responsáveis não encontrado para este cliente.");
    }

    return responsible;
  }

  async delete(id: string, organizationId: string): Promise<{ message: string }> {
    try {
      const exists = await this.prisma.responsibleContabil.findFirst({
        where: { id, organization_id: organizationId },
      });

      if (!exists) {
        throw new ServiceError(404, "Não está cadastrado.");
      }

      await this.prisma.responsibleContabil.delete({
        where: { id },
      });

      return { message: "Registro deletado com sucesso." };
    } catch (err: unknown) {
      logError("Erro ao deletar responsável contábil", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      throw new ServiceError(500, "Erro ao deletar responsável contábil.", err);
    }
  }
}
