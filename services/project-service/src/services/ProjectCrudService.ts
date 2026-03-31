import { error as logError, ServiceError } from "@workspace/shared";

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
}

export interface CreateProjectCrudRequest extends ProjectCrudAuthContext {
  name: string;
  client_id: string;
  start_date: Date;
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
    const client = await this.prisma.client.findFirst({
      where: { id: data.client_id, organization_id: data.organizationId },
    });

    if (!client) {
      throw new ServiceError(404, "Cliente não encontrado.");
    }

    const duplicate = await this.prisma.project.findFirst({
      where: {
        name: data.name,
        client_id: data.client_id,
        organization_id: data.organizationId,
      },
    });

    if (duplicate !== null) {
      throw new ServiceError(409, "Um objetivo com esse nome nesse cliente já foi cadastrada");
    }

    const create = await this.prisma.project.create({
      data: {
        name: data.name,
        client_id: data.client_id,
        organization_id: data.organizationId,
        status: "Em andamento",
        start_date: data.start_date,
        objective: data.objective,
        sponsor_id: data.sponsor_id ?? null,
        porcentage: 0,
      },
      select: CREATE_SELECT,
    });

    await this.audit.createLog({
      userId: data.userId,
      organizationId: data.organizationId,
      permission: data.permission ?? null,
      action: "Cadastro",
      referring: "integracao.projects",
      referringId: create.id,
      changes: "{}",
    });

    return { create };
  }

  async detail(projectId: string, organizationId: string): Promise<{ detail: unknown }> {
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
  ): Promise<unknown[]> {
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
    if (data.permission !== 2) {
      throw new ServiceError(403, "Usuário não tem permissão");
    }

    const exists = await this.prisma.project.findFirst({
      where: { id: data.project_id, organization_id: data.organizationId },
    });

    if (!exists) {
      throw new ServiceError(404, "Projeto não existe");
    }

    const response = await this.prisma.project.delete({
      where: { id: data.project_id },
    });

    return { response };
  }
}
