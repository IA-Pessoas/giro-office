import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateGroupBody, UpdateGroupBody } from "../schemas/group.schemas.js";
import type { PessoalAuditService } from "./pessoalAuditService.js";
import { NO_OBLIGATIONS_GROUP_POLICY, NORMAL_GROUP_POLICY } from "./pessoalGroupPolicy.js";
import {
  PESSOAL_READ_PERMISSION,
  PESSOAL_WRITE_PERMISSION,
  type PessoalAuthContext,
  requireMinimumPermission,
  requireUserId,
} from "./pessoalServiceTypes.js";

export const NO_MOVEMENT_GROUP_SYSTEM_KEY = "NO_MOVEMENT";
export const NO_MOVEMENT_GROUP_POLICY = NO_OBLIGATIONS_GROUP_POLICY;

const groupSelect = {
  id: true,
  name: true,
  policy: true,
  system_key: true,
  archived_at: true,
  organization_id: true,
} as const;

export type GroupRecord = {
  id: string;
  name: string;
  policy: string;
  system_key: string | null;
  archived_at: Date | null;
  organization_id: string;
};

export function normalizePessoalGroupName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function displayGroupName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function isPrismaUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

export class GroupService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: PessoalAuditService,
  ) {}

  async list(context: PessoalAuthContext): Promise<GroupRecord[]> {
    requireMinimumPermission(context, PESSOAL_READ_PERMISSION);
    await this.ensureNoMovementGroup(context.organizationId);

    return this.prisma.pessoalGroup.findMany({
      where: { organization_id: context.organizationId },
      orderBy: [{ archived_at: "asc" }, { name: "asc" }],
      select: groupSelect,
    });
  }

  async detail(context: PessoalAuthContext, id: string): Promise<GroupRecord> {
    requireMinimumPermission(context, PESSOAL_READ_PERMISSION);
    const group = await this.prisma.pessoalGroup.findFirst({
      where: { id, organization_id: context.organizationId },
      select: groupSelect,
    });

    if (!group) {
      throw new ServiceError(404, "Grupo de pessoal nao encontrado.");
    }

    return group;
  }

  async create(context: PessoalAuthContext, body: CreateGroupBody): Promise<GroupRecord> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      const name = displayGroupName(body.name);
      const created = await this.prisma.pessoalGroup.create({
        data: {
          name,
          normalized_name: normalizePessoalGroupName(name),
          policy: body.policy ?? NORMAL_GROUP_POLICY,
          organization_id: context.organizationId,
        },
        select: groupSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Cadastro",
        referring: "pessoal.group",
        referringId: created.id,
        changes: { name: created.name },
      });

      return created;
    } catch (err: unknown) {
      logError("Erro ao criar grupo de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueConstraintError(err)) {
        throw new ServiceError(409, "Ja existe um grupo com este nome na organizacao.", err);
      }
      throw new ServiceError(500, "Erro ao criar grupo de pessoal.", err);
    }
  }

  async update(
    context: PessoalAuthContext,
    id: string,
    body: UpdateGroupBody,
  ): Promise<GroupRecord> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      const existing = await this.detail(context, id);
      if (existing.system_key === NO_MOVEMENT_GROUP_SYSTEM_KEY) {
        throw new ServiceError(409, "O grupo Sem Movimento nao pode ser alterado.");
      }
      const data = {
        ...(body.name
          ? {
              name: displayGroupName(body.name),
              normalized_name: normalizePessoalGroupName(body.name),
            }
          : {}),
        ...(body.policy ? { policy: body.policy } : {}),
      };
      const updated = await this.prisma.pessoalGroup.update({
        where: { id },
        data,
        select: groupSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Atualizacao",
        referring: "pessoal.group",
        referringId: id,
        changes: data,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar grupo de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueConstraintError(err)) {
        throw new ServiceError(409, "Ja existe um grupo com este nome na organizacao.", err);
      }
      throw new ServiceError(500, "Erro ao atualizar grupo de pessoal.", err);
    }
  }

  async archive(context: PessoalAuthContext, id: string): Promise<GroupRecord> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      const existing = await this.detail(context, id);
      if (existing.system_key === NO_MOVEMENT_GROUP_SYSTEM_KEY) {
        throw new ServiceError(409, "O grupo Sem Movimento nao pode ser arquivado.");
      }
      const archived = await this.prisma.pessoalGroup.update({
        where: { id },
        data: { archived_at: new Date() },
        select: groupSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Atualizacao",
        referring: "pessoal.group",
        referringId: id,
        changes: { archived_at: archived.archived_at },
      });

      return archived;
    } catch (err: unknown) {
      logError("Erro ao arquivar grupo de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao arquivar grupo de pessoal.", err);
    }
  }

  async reactivate(context: PessoalAuthContext, id: string): Promise<GroupRecord> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      await this.detail(context, id);
      const reactivated = await this.prisma.pessoalGroup.update({
        where: { id },
        data: { archived_at: null },
        select: groupSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Atualizacao",
        referring: "pessoal.group",
        referringId: id,
        changes: { archived_at: null },
      });

      return reactivated;
    } catch (err: unknown) {
      logError("Erro ao reativar grupo de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao reativar grupo de pessoal.", err);
    }
  }

  private async ensureNoMovementGroup(organizationId: string): Promise<void> {
    await this.prisma.pessoalGroup.upsert({
      where: {
        organization_id_system_key: {
          organization_id: organizationId,
          system_key: NO_MOVEMENT_GROUP_SYSTEM_KEY,
        },
      },
      create: {
        name: "Sem Movimento",
        normalized_name: "sem movimento",
        policy: NO_MOVEMENT_GROUP_POLICY,
        system_key: NO_MOVEMENT_GROUP_SYSTEM_KEY,
        organization_id: organizationId,
      },
      update: {},
    });
  }
}
