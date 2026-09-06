import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  error as logError,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import {
  type CreateLogParams,
  createLog,
  type LogUpdateParams,
  logUpdateIfChanged,
} from "../integrations/audit.js";
import prismaClient from "../integrations/prisma.js";

export type ProjectCrudPrisma = typeof prismaClient;

type ProjectCrudAuditFns = {
  createLog: (params: CreateLogParams) => Promise<void>;
  logUpdateIfChanged: (params: LogUpdateParams) => Promise<void>;
};

export interface ProjectCrudAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

export interface CreateProjectCrudRequest extends ProjectCrudAuthContext {
  name: string;
  client_id: string;
  start_date: Date;
  end_date?: Date;
  objective: string;
  sponsor_id?: string;
}

export interface UpdateProjectCrudRequest extends ProjectCrudAuthContext {
  project_id: string;
  name: string;
  start_date: Date;
  end_date: Date;
  objective: string;
  sponsor_id?: string;
}

export interface DeleteProjectCrudRequest extends ProjectCrudAuthContext {
  project_id: string;
}

const CREATE_SELECT = {
  id: true,
  name: true,
  client_id: true,
  status: true,
  start_date: true,
  end_date: true,
  objective: true,
  sponsor_id: true,
} as const;

const UPDATE_SELECT = {
  id: true,
  name: true,
  client_id: true,
  status: true,
  start_date: true,
  end_date: true,
  objective: true,
  sponsor_id: true,
  porcentage: true,
} as const;

const DETAIL_SELECT = {
  id: true,
  name: true,
  client_id: true,
  status: true,
  start_date: true,
  end_date: true,
  objective: true,
  sponsor_id: true,
  porcentage: true,
  client: true,
  tasks: true,
} as const;

export class ProjectCrudService {
  constructor(
    private readonly prisma: ProjectCrudPrisma = prismaClient,
    private readonly audit: ProjectCrudAuditFns = { createLog, logUpdateIfChanged },
  ) {}

  async create(data: CreateProjectCrudRequest): Promise<{ create: unknown }> {
    const result = await this.prisma.$transaction((tx) => this.createInTransaction(data, tx));

    try {
      await this.audit.createLog({
        userId: data.userId,
        organizationId: data.organizationId,
        permission: data.permission ?? null,
        action: "Cadastro",
        referring: "integracao.projects",
        referringId: result.create.id,
        changes: "{}",
      });
    } catch (err) {
      logError("Erro ao auditar criação de projeto", { err, projectId: result.create.id });
    }

    return result;
  }

  /** O chamador controla commit/rollback e emite auditoria somente após o commit. */
  async createInTransaction(
    data: CreateProjectCrudRequest,
    tx: Prisma.TransactionClient,
  ): Promise<{ create: Prisma.ProjectGetPayload<{ select: typeof CREATE_SELECT }> }> {
    requireIntegracaoRouteAccess("POST", "/project", {
      userId: data.userId,
      level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
      organizationId: data.organizationId,
      resourceOrganizationId: data.organizationId,
      isOwner: data.isOwner === true,
      requestedFields: ["name", "client_id", "start_date", "end_date", "objective", "sponsor_id"],
    });

    if (data.end_date && data.end_date < data.start_date) {
      throw new ServiceError(400, "A data final não pode ser anterior à data inicial.");
    }

    const client = await tx.client.findFirst({
      where: { id: data.client_id, organization_id: data.organizationId },
    });

    if (!client) {
      throw new ServiceError(404, "Cliente não encontrado.");
    }

    const duplicate = await tx.project.findFirst({
      where: {
        name: data.name,
        client_id: data.client_id,
        organization_id: data.organizationId,
      },
    });

    if (duplicate !== null) {
      throw new ServiceError(409, "Um objetivo com esse nome nesse cliente já foi cadastrada");
    }

    const create = await tx.project.create({
      data: {
        name: data.name,
        client_id: data.client_id,
        organization_id: data.organizationId,
        status: "Em andamento",
        start_date: data.start_date,
        end_date: data.end_date ?? null,
        objective: data.objective,
        sponsor_id: data.sponsor_id ?? null,
        porcentage: 0,
      },
      select: CREATE_SELECT,
    });

    return { create };
  }

  async detail(
    projectId: string,
    organizationId: string,
    auth: ProjectCrudAuthContext = { userId: "", organizationId },
  ): Promise<{ detail: unknown }> {
    const detail = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        organization_id: organizationId,
      },
      select: DETAIL_SELECT,
    });

    if (!detail) {
      throw new ServiceError(404, "Projeto não existe");
    }

    requireIntegracaoRouteAccess("GET", "/project", {
      userId: auth.userId,
      level: auth.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
      organizationId,
      resourceOrganizationId: organizationId,
      isOwner: auth.isOwner === true,
    });

    return { detail };
  }

  async update(data: UpdateProjectCrudRequest): Promise<unknown> {
    try {
      const exists = await this.prisma.project.findFirst({
        where: { id: data.project_id, organization_id: data.organizationId },
      });

      if (!exists) {
        throw new ServiceError(404, "Projeto não existe");
      }

      requireIntegracaoRouteAccess("PUT", "/project", {
        userId: data.userId,
        level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId: data.organizationId,
        resourceOrganizationId: data.organizationId,
        isOwner: data.isOwner === true,
        requestedFields: ["name", "start_date", "end_date", "objective", "sponsor_id"],
      });

      const updated = await this.prisma.project.update({
        where: {
          id: data.project_id,
        },
        data: {
          name: data.name,
          start_date: data.start_date,
          end_date: data.end_date,
          objective: data.objective,
          sponsor_id: data.sponsor_id ?? null,
        },
        select: UPDATE_SELECT,
      });

      await this.audit.logUpdateIfChanged({
        userId: data.userId,
        organizationId: data.organizationId,
        permission: data.permission ?? null,
        action: "Atualização",
        referring: "integracao.projects",
        referringId: data.project_id,
        oldData: exists as unknown as Record<string, unknown>,
        updatedData: updated as unknown as Record<string, unknown>,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar projeto", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      throw new ServiceError(500, "Erro ao atualizar", err);
    }
  }

  async list(
    ref: "client" | "status" | "sponsor",
    id: string,
    organizationId: string,
    auth: ProjectCrudAuthContext = { userId: "", organizationId },
  ): Promise<unknown[]> {
    requireIntegracaoRouteAccess("GET", "/project/list", {
      userId: auth.userId,
      level: auth.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
      organizationId,
      isOwner: auth.isOwner === true,
    });

    if (ref === "client") {
      return this.prisma.project.findMany({
        where: { client_id: id, organization_id: organizationId },
        orderBy: { start_date: "desc" },
      });
    }

    if (ref === "status") {
      return this.prisma.project.findMany({
        where: { status: id, organization_id: organizationId },
        orderBy: { start_date: "asc" },
      });
    }

    return this.prisma.project.findMany({
      where: { sponsor_id: id, organization_id: organizationId },
      orderBy: { start_date: "asc" },
    });
  }

  async delete(data: DeleteProjectCrudRequest): Promise<{ response: unknown }> {
    const exists = await this.prisma.project.findFirst({
      where: { id: data.project_id, organization_id: data.organizationId },
    });

    if (!exists) {
      throw new ServiceError(404, "Projeto não existe");
    }

    requireIntegracaoRouteAccess("DELETE", "/project", {
      userId: data.userId,
      level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
      organizationId: data.organizationId,
      resourceOrganizationId: data.organizationId,
      isOwner: data.isOwner === true,
    });

    try {
      const response = await this.prisma.project.delete({
        where: { id: data.project_id },
      });

      await this.audit.createLog({
        userId: data.userId,
        organizationId: data.organizationId,
        action: "Exclusão",
        referring: "integracao.projects",
        referringId: data.project_id,
        changes: "{}",
      });

      return { response };
    } catch (err: unknown) {
      logError("Erro ao excluir projeto no banco", { err });
      if (typeof err === "object" && err !== null && "code" in err && err.code === "P2003") {
        throw new ServiceError(409, "Não é possível excluir projeto com dependências.");
      }
      throw err;
    }
  }
}
