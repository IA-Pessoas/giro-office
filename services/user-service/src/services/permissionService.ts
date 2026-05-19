import { error as logError, ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import prismaClient from "../prisma/index.js";

const PERMISSION_PUBLIC_SELECT = {
  id: true,
  user_id: true,
  organization_id: true,
  atendimento: true,
  certificado: true,
  comercial: true,
  contabil: true,
  financeiro: true,
  fiscal: true,
  integracao: true,
  marketing: true,
  parcelamento: true,
  pec: true,
  pessoal: true,
  regularize: true,
  rh: true,
  ti: true,
  triagem: true,
  wiki: true,
} as const;

const PERMISSION_SPECIFIC_SELECT = {
  user_id: true,
  organization_id: true,
  task_completion: true,
} as const;

const MODULE_FIELDS = [
  "atendimento",
  "certificado",
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "marketing",
  "parcelamento",
  "pec",
  "pessoal",
  "regularize",
  "rh",
  "ti",
  "triagem",
  "wiki",
] as const;

type ModuleField = (typeof MODULE_FIELDS)[number];

type PermissionPublicRow = Prisma.PermissionGetPayload<{ select: typeof PERMISSION_PUBLIC_SELECT }>;
type PermissionSpecificRow = Prisma.PermissionSpecificGetPayload<{
  select: typeof PERMISSION_SPECIFIC_SELECT;
}>;

interface UpdatePermissionInput {
  atendimento?: number | null;
  certificado?: number | null;
  comercial?: number | null;
  contabil?: number | null;
  financeiro?: number | null;
  fiscal?: number | null;
  integracao?: number | null;
  marketing?: number | null;
  parcelamento?: number | null;
  pec?: number | null;
  pessoal?: number | null;
  regularize?: number | null;
  rh?: number | null;
  ti?: number | null;
  triagem?: number | null;
  wiki?: number | null;
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

      if (permission[modulo as ModuleField] === null) {
        throw new ServiceError(403, `Usuário sem acesso ao módulo '${modulo}'.`);
      }
    }

    return permission;
  }

  async update(
    userId: string,
    data: UpdatePermissionInput,
    organizationId?: string,
  ): Promise<PermissionPublicRow> {
    await this.getByUserId(userId, undefined, organizationId);

    const updateData: Record<string, unknown> = {};

    for (const field of MODULE_FIELDS) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    try {
      const permission = await prismaClient.permission.updateMany({
        where: {
          user_id: userId,
          ...(organizationId ? { organization_id: organizationId } : {}),
        },
        data: updateData,
      });

      if (permission.count === 0) {
        throw new ServiceError(404, "Permissão não encontrada.");
      }

      return this.getByUserId(userId, undefined, organizationId);
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
