import {
  ACTIVE_MODULE_KEYS,
  error as logError,
  type ModulePermissionKey,
  type ModulePermissions,
  withTenantTransaction as runWithTenantTransaction,
  ServiceError,
} from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import type { UserAuditRecorder } from "../integrations/audit.js";
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
type PermissionTransaction = {
  permission: Pick<Prisma.TransactionClient["permission"], "findFirst" | "create" | "updateMany">;
  permissionSpecific: Pick<
    Prisma.TransactionClient["permissionSpecific"],
    "findFirst" | "create" | "updateMany"
  >;
  user: Pick<Prisma.TransactionClient["user"], "update">;
  logs: Pick<Prisma.TransactionClient["logs"], "createMany">;
};

type UpdatePermissionInput = Partial<ModulePermissions>;

interface PermissionChangeAudit {
  actorUserId?: string;
}

class PermissionService {
  constructor(
    private readonly audit?: UserAuditRecorder,
    private readonly transaction?: PermissionTransaction,
  ) {}

  async create(userId: string, organizationId: string): Promise<PermissionPublicRow> {
    return await this.#withTenantTransaction(organizationId, async (prisma) => {
      const exists = await prisma.permission.findFirst({
        where: { user_id: userId, organization_id: organizationId },
      });

      if (exists) {
        throw new ServiceError(409, "Permissões já cadastradas para este usuário.");
      }

      try {
        return await prisma.permission.create({
          data: {
            user_id: userId,
            organization_id: organizationId,
          },
          select: PERMISSION_PUBLIC_SELECT,
        });
      } catch (err: unknown) {
        logError("Erro ao criar permissão", { err });
        throw new ServiceError(500, "Erro ao criar permissão.", err);
      }
    });
  }

  async getByUserId(
    userId: string,
    modulo?: string,
    organizationId?: string,
  ): Promise<PermissionPublicRow> {
    const tenantOrganizationId = this.#requireOrganizationId(organizationId);

    return await this.#withTenantTransaction(tenantOrganizationId, async (prisma) => {
      return await this.#getByUserId(prisma, userId, modulo, tenantOrganizationId);
    });
  }

  async update(
    userId: string,
    data: UpdatePermissionInput,
    organizationId: string,
    audit: PermissionChangeAudit = {},
  ): Promise<PermissionPublicRow> {
    const updateData: Partial<Record<ModuleField, number>> = {};

    for (const field of MODULE_FIELDS) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    try {
      const { previousPermission, nextPermission } = await this.#withTenantTransaction(
        organizationId,
        async (prisma) => {
          const previousPermission = await this.#getByUserId(
            prisma,
            userId,
            undefined,
            organizationId,
          );
          const permission = await prisma.permission.updateMany({
            where: {
              user_id: userId,
              organization_id: organizationId,
            },
            data: updateData,
          });

          if (permission.count === 0) {
            throw new ServiceError(404, "Permissão não encontrada.");
          }

          const nextPermission = await prisma.permission.findFirst({
            where: {
              user_id: userId,
              organization_id: organizationId,
            },
            select: PERMISSION_PUBLIC_SELECT,
          });

          if (!nextPermission) {
            throw new ServiceError(404, "Permissão não encontrada.");
          }

          await prisma.user.update({
            where: { id: userId },
            data: { session_version: { increment: 1 } },
          });

          if (audit.actorUserId) {
            await prisma.logs.createMany({
              data: [
                {
                  user_id: audit.actorUserId,
                  organization_id: organizationId,
                  action: "UPDATE",
                  referring: "Permission",
                  referring_id: userId,
                  changes: {
                    affected_user_id: userId,
                    organization_id: organizationId,
                    previous: previousPermission,
                    next: nextPermission,
                  },
                },
              ],
            });
          }

          return { previousPermission, nextPermission };
        },
      );

      if (audit.actorUserId) {
        this.#recordAudit({
          actorUserId: audit.actorUserId,
          organizationId,
          action: "UPDATE",
          referring: "Permission",
          referringId: userId,
          changes: {
            affected_user_id: userId,
            organization_id: organizationId,
            previous: previousPermission,
            next: nextPermission,
          },
          outcome: "success",
        });
      }

      return nextPermission;
    } catch (err: unknown) {
      if (err instanceof ServiceError) throw err;
      logError("Erro ao atualizar permissão", { err });
      throw new ServiceError(500, "Erro ao atualizar permissão.", err);
    }
  }

  async #withTenantTransaction<T>(
    organizationId: string | undefined,
    action: (prisma: PermissionTransaction) => Promise<T>,
  ): Promise<T> {
    const tenantOrganizationId = this.#requireOrganizationId(organizationId);

    if (this.transaction) {
      return await action(this.transaction);
    }

    return await runWithTenantTransaction<Prisma.TransactionClient, T>(
      prismaClient,
      tenantOrganizationId,
      action,
    );
  }

  #requireOrganizationId(organizationId: string | undefined): string {
    if (!organizationId) {
      throw new ServiceError(400, "Organização não informada.");
    }

    return organizationId;
  }

  async #getByUserId(
    prisma: PermissionTransaction,
    userId: string,
    modulo: string | undefined,
    organizationId: string,
  ): Promise<PermissionPublicRow> {
    const permission = await prisma.permission.findFirst({
      where: { user_id: userId, organization_id: organizationId },
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

  #recordAudit(params: Parameters<UserAuditRecorder>[0]): void {
    try {
      void Promise.resolve(this.audit?.(params)).catch((err: unknown) => {
        logError("Erro ao registrar auditoria de permissao", { err });
      });
    } catch (err: unknown) {
      logError("Erro ao registrar auditoria de permissao", { err });
    }
  }

  async createSpecific(
    userId: string,
    organizationId: string,
    taskCompletion?: boolean | null,
  ): Promise<PermissionSpecificRow> {
    return await this.#withTenantTransaction(organizationId, async (prisma) => {
      const exists = await prisma.permissionSpecific.findFirst({
        where: { user_id: userId, organization_id: organizationId },
      });

      if (exists) {
        throw new ServiceError(409, "Permissão específica já cadastrada para este usuário.");
      }

      try {
        return await prisma.permissionSpecific.create({
          data: {
            user_id: userId,
            organization_id: organizationId,
            task_completion: taskCompletion ?? null,
          },
          select: PERMISSION_SPECIFIC_SELECT,
        });
      } catch (err: unknown) {
        logError("Erro ao criar permissão específica", { err });
        throw new ServiceError(500, "Erro ao criar permissão específica.", err);
      }
    });
  }

  async updateSpecific(
    userId: string,
    taskCompletion: boolean,
    organizationId: string,
  ): Promise<PermissionSpecificRow> {
    return await this.#withTenantTransaction(organizationId, async (prisma) => {
      try {
        const { count } = await prisma.permissionSpecific.updateMany({
          where: { user_id: userId, organization_id: organizationId },
          data: { task_completion: taskCompletion },
        });

        if (count === 0) {
          throw new ServiceError(404, "Permissão específica não encontrada.");
        }

        const permission = await prisma.permissionSpecific.findFirst({
          where: { user_id: userId, organization_id: organizationId },
          select: PERMISSION_SPECIFIC_SELECT,
        });

        if (!permission) {
          throw new ServiceError(404, "Permissão específica não encontrada.");
        }

        return permission;
      } catch (err: unknown) {
        if (err instanceof ServiceError) throw err;
        logError("Erro ao atualizar permissão específica", { err });
        throw new ServiceError(500, "Erro ao atualizar permissão específica.", err);
      }
    });
  }

  async getSpecific(userId: string, organizationId: string): Promise<PermissionSpecificRow> {
    return await this.#withTenantTransaction(organizationId, async (prisma) => {
      const permission = await prisma.permissionSpecific.findFirst({
        where: { user_id: userId, organization_id: organizationId },
        select: PERMISSION_SPECIFIC_SELECT,
      });

      if (!permission) {
        throw new ServiceError(404, "Permissão específica não encontrada.");
      }

      return permission;
    });
  }
}

export { PermissionService };
