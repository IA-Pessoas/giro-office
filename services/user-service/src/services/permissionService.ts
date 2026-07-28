import {
  ACTIVE_MODULE_KEYS,
  error as logError,
  ServiceError,
  type ModulePermissionKey,
  type ModulePermissions,
} from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import prismaClient from "../prisma/index.js";

const PERMISSION_PUBLIC_SELECT = {
  id: true,
  user_id: true,
  organization_id: true,
  certificado: true,
  comercial: true,
  contabil: true,
  financeiro: true,
  fiscal: true,
  integracao: true,
  marketing: true,
  parcelamento: true,
  pessoal: true,
  regularize: true,
  rh: true,
  ti: true,
  triagem: true,
} as const;

const PERMISSION_SPECIFIC_SELECT = {
  user_id: true,
  organization_id: true,
  task_completion: true,
} as const;

const MODULE_FIELDS = [...ACTIVE_MODULE_KEYS] as const;

type ModuleField = ModulePermissionKey;

type PermissionPublicRow = Prisma.PermissionGetPayload<{ select: typeof PERMISSION_PUBLIC_SELECT }>;
type PermissionSpecificRow = Prisma.PermissionSpecificGetPayload<{
  select: typeof PERMISSION_SPECIFIC_SELECT;
}>;

type UpdatePermissionInput = Partial<ModulePermissions>;

interface PermissionChangeAudit {
  actorUserId?: string;
}

class PermissionService {
  async create(userId: string, organizationId: string): Promise<PermissionPublicRow> {
    const exists = await prismaClient.permission.findFirst({
      where: { user_id: userId, organization_id: organizationId },
    });

    if (exists) {
      throw new ServiceError(409, "Permissões já cadastradas para este usuário.");
    }

    try {
      const permission = await prismaClient.permission.create({
        data: {
          user_id: userId,
          organization_id: organizationId,
        },
        select: PERMISSION_PUBLIC_SELECT,
      });

      return permission;
    } catch (err: unknown) {
      logError("Erro ao criar permissão", { err });
      throw new ServiceError(500, "Erro ao criar permissão.", err);
    }
  }

  async getByUserId(
    userId: string,
    modulo?: string,
    organizationId?: string,
  ): Promise<PermissionPublicRow> {
    const permission = await prismaClient.permission.findFirst({
      where: {
        user_id: userId,
        ...(organizationId ? { organization_id: organizationId } : {}),
      },
      select: PERMISSION_PUBLIC_SELECT,
    });

    if (!permission) {
      throw new ServiceError(404, "Permissão não encontrada.");
    }

    if (modulo) {
      if (!MODULE_FIELDS.includes(modulo as ModuleField)) {
        throw new ServiceError(400, `Módulo '${modulo}' inválido.`);
      }

      if (permission[modulo as ModuleField] === 0) {
        throw new ServiceError(403, `Usuário sem acesso ao módulo '${modulo}'.`);
      }
    }

    return permission;
  }

  async update(
    userId: string,
    data: UpdatePermissionInput,
    organizationId?: string,
    audit: PermissionChangeAudit = {},
  ): Promise<PermissionPublicRow> {
    const previousPermission = await this.getByUserId(userId, undefined, organizationId);

    const updateData: Partial<Record<ModuleField, number>> = {};

    for (const field of MODULE_FIELDS) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    try {
      return await prismaClient.$transaction(async (transaction) => {
        const permission = await transaction.permission.updateMany({
          where: {
            user_id: userId,
            ...(organizationId ? { organization_id: organizationId } : {}),
          },
          data: updateData,
        });

        if (permission.count === 0) {
          throw new ServiceError(404, "Permissão não encontrada.");
        }

        const nextPermission = await transaction.permission.findFirst({
          where: {
            user_id: userId,
            ...(organizationId ? { organization_id: organizationId } : {}),
          },
          select: PERMISSION_PUBLIC_SELECT,
        });

        if (!nextPermission) {
          throw new ServiceError(404, "Permissão não encontrada.");
        }

        await transaction.user.update({
          where: { id: userId },
          data: { session_version: { increment: 1 } },
        });

        if (audit.actorUserId) {
          await transaction.logs.create({
            data: {
              user_id: audit.actorUserId,
              organization_id: organizationId ?? nextPermission.organization_id,
              action: "UPDATE",
              referring: "Permission",
              referring_id: userId,
              changes: {
                affected_user_id: userId,
                organization_id: organizationId ?? nextPermission.organization_id,
                previous: previousPermission,
                next: nextPermission,
              },
            },
          });
        }

        return nextPermission;
      });
    } catch (err: unknown) {
      if (err instanceof ServiceError) throw err;
      logError("Erro ao atualizar permissão", { err });
      throw new ServiceError(500, "Erro ao atualizar permissão.", err);
    }
  }

  async createSpecific(
    userId: string,
    organizationId: string,
    taskCompletion?: boolean | null,
  ): Promise<PermissionSpecificRow> {
    const exists = await prismaClient.permissionSpecific.findUnique({
      where: { user_id: userId },
    });

    if (exists) {
      throw new ServiceError(409, "Permissão específica já cadastrada para este usuário.");
    }

    try {
      const permission = await prismaClient.permissionSpecific.create({
        data: {
          user_id: userId,
          organization_id: organizationId,
          task_completion: taskCompletion ?? null,
        },
        select: PERMISSION_SPECIFIC_SELECT,
      });

      return permission;
    } catch (err: unknown) {
      logError("Erro ao criar permissão específica", { err });
      throw new ServiceError(500, "Erro ao criar permissão específica.", err);
    }
  }

  async updateSpecific(userId: string, taskCompletion: boolean): Promise<PermissionSpecificRow> {
    const exists = await prismaClient.permissionSpecific.findUnique({
      where: { user_id: userId },
    });

    if (!exists) {
      throw new ServiceError(404, "Permissão específica não encontrada.");
    }

    try {
      const permission = await prismaClient.permissionSpecific.update({
        where: { user_id: userId },
        data: { task_completion: taskCompletion },
        select: PERMISSION_SPECIFIC_SELECT,
      });

      return permission;
    } catch (err: unknown) {
      logError("Erro ao atualizar permissão específica", { err });
      throw new ServiceError(500, "Erro ao atualizar permissão específica.", err);
    }
  }

  async getSpecific(userId: string): Promise<PermissionSpecificRow> {
    const permission = await prismaClient.permissionSpecific.findUnique({
      where: { user_id: userId },
      select: PERMISSION_SPECIFIC_SELECT,
    });

    if (!permission) {
      throw new ServiceError(404, "Permissão específica não encontrada.");
    }

    return permission;
  }
}

export { PermissionService };
