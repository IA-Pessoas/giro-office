import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  CreateSituationBody,
  ListSituationQuery,
  UpdateSituationBody,
} from "../schemas/situation.schemas.js";
import type { PessoalAuditService } from "./pessoalAuditService.js";
import {
  omitUndefined,
  PESSOAL_WRITE_PERMISSION,
  type PessoalAuthContext,
  requireMinimumPermission,
  requireUserId,
} from "./pessoalServiceTypes.js";

const situationSelect = {
  id: true,
  client_id: true,
  status: true,
  title: true,
  description: true,
  registration_date: true,
  completion_date: true,
  registered_by_id: true,
  completed_by_id: true,
  organization_id: true,
} as const;

export type SituationRecord = {
  id: string;
  client_id: string;
  status: string;
  title: string;
  description: string;
  registration_date: Date;
  completion_date: Date | null;
  registered_by_id: string;
  completed_by_id: string | null;
  organization_id: string;
};

export class SituationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: PessoalAuditService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(context: PessoalAuthContext, body: CreateSituationBody): Promise<SituationRecord> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      await this.ensureClient(context.organizationId, body.client_id);

      const created = await this.prisma.situationsPessoal.create({
        data: {
          client_id: body.client_id,
          status: "Em andamento",
          title: body.title,
          description: body.description,
          registered_by_id: userId,
          organization_id: context.organizationId,
        },
        select: situationSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Cadastro",
        referring: "pessoal.situations",
        referringId: created.id,
        changes: {},
        path: `/pessoal/situations/${created.id}`,
      });

      return created;
    } catch (err: unknown) {
      logError("Erro ao criar situacao de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar situacao de pessoal.", err);
    }
  }

  async list(
    context: Pick<PessoalAuthContext, "organizationId">,
    query: ListSituationQuery,
  ): Promise<SituationRecord[]> {
    return this.prisma.situationsPessoal.findMany({
      where: {
        organization_id: context.organizationId,
        client_id: query.client_id,
      },
      select: situationSelect,
      orderBy: { registration_date: "desc" },
    });
  }

  async detail(
    context: Pick<PessoalAuthContext, "organizationId">,
    id: string,
  ): Promise<SituationRecord> {
    const detail = await this.prisma.situationsPessoal.findFirst({
      where: { id, organization_id: context.organizationId },
      select: situationSelect,
    });

    if (!detail) {
      throw new ServiceError(404, "Situacao nao encontrada.");
    }

    return detail;
  }

  async update(
    context: PessoalAuthContext,
    id: string,
    body: UpdateSituationBody,
  ): Promise<SituationRecord> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      const existing = await this.prisma.situationsPessoal.findFirst({
        where: { id, organization_id: context.organizationId },
        select: situationSelect,
      });

      if (!existing) {
        throw new ServiceError(404, "Situacao nao encontrada.");
      }

      const completionData =
        body.status === "Finalizado"
          ? { completed_by_id: userId, completion_date: this.now() }
          : body.status === "Em andamento"
            ? { completed_by_id: null, completion_date: null }
            : {};

      const data = {
        ...omitUndefined({
          status: body.status,
          title: body.title,
          description: body.description,
        }),
        ...completionData,
      };

      const updated = await this.prisma.situationsPessoal.update({
        where: { id },
        data,
        select: situationSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Atualizacao",
        referring: "pessoal.situations",
        referringId: id,
        changes: data,
        path: `/pessoal/situations/${id}`,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar situacao de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar situacao de pessoal.", err);
    }
  }

  async delete(context: PessoalAuthContext, id: string): Promise<SituationRecord> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      const existing = await this.prisma.situationsPessoal.findFirst({
        where: { id, organization_id: context.organizationId },
        select: situationSelect,
      });

      if (!existing) {
        throw new ServiceError(404, "Situacao nao encontrada.");
      }

      await this.prisma.situationsPessoal.delete({ where: { id } });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Exclusao",
        referring: "pessoal.situations",
        referringId: id,
        changes: existing,
        path: `/pessoal/situations/${id}`,
      });

      return existing;
    } catch (err: unknown) {
      logError("Erro ao remover situacao de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao remover situacao de pessoal.", err);
    }
  }

  private async ensureClient(organizationId: string, clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });

    if (!client) {
      throw new ServiceError(404, "Cliente nao encontrado para a organizacao.");
    }
  }
}
