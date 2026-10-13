import { error as logError, ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";
import type {
  CreateRhLifeObjectiveBody,
  UpdateRhLifeObjectiveBody,
  UpdateRhLifeProjectBody,
} from "../schemas/rhLifeProject.schemas.js";

const RH_SELF_SERVICE_PERMISSION = 1;
const RH_TEAM_PERMISSION = 2;
const RH_ADMIN_PERMISSION = 3;

export interface RhLifeProjectContext {
  actorUserId: string;
  organizationId: string;
  targetUserId?: string;
  rhPermission: number;
}

type ProjectWithObjectives = Prisma.RhLifeProjectGetPayload<{
  include: { objectives: { orderBy: { created_at: "asc" } } };
}>;

function organizationScope(organizationId: string): Prisma.UserWhereInput {
  return {
    OR: [
      { organization_id: organizationId },
      { organization_id: null, department: { organization_id: organizationId } },
    ],
  };
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

function serializeProject(project: ProjectWithObjectives) {
  const objectives = project.objectives.map((objective) => ({
    id: objective.id,
    title: objective.title,
    forecast_date: objective.forecast_date?.toISOString() ?? null,
    completed_at: objective.completed_at?.toISOString() ?? null,
    status: objective.status,
    rh_observations: objective.rh_observations,
    employee_observations: objective.employee_observations,
    created_by_id: objective.created_by_id,
    updated_by_id: objective.updated_by_id,
    created_at: objective.created_at.toISOString(),
    updated_at: objective.updated_at.toISOString(),
  }));
  const completedObjectiveCount = objectives.filter(
    (objective) => objective.status === "Realized",
  ).length;

  return {
    id: project.id,
    organization_id: project.organization_id,
    user_id: project.user_id,
    year: project.year,
    life_story: project.life_story,
    company_story: project.company_story,
    created_by_id: project.created_by_id,
    updated_by_id: project.updated_by_id,
    created_at: project.created_at.toISOString(),
    updated_at: project.updated_at.toISOString(),
    objectives,
    objective_count: objectives.length,
    completed_objective_count: completedObjectiveCount,
    progress: objectives.length === 0 ? 0 : completedObjectiveCount / objectives.length,
  };
}

class RhLifeProjectService {
  constructor(private readonly db: PrismaClient = prismaClient) {}

  private async findUser(userId: string, organizationId: string) {
    return this.db.user.findFirst({
      where: { AND: [{ id: userId }, organizationScope(organizationId)] },
      select: { id: true, department_id: true },
    });
  }

  private async resolveTarget(context: RhLifeProjectContext, targetUserId?: string) {
    if (context.rhPermission < RH_SELF_SERVICE_PERMISSION) {
      throw new ServiceError(403, "Permissão insuficiente para acessar o Projeto de Vida.");
    }
    const actor = await this.findUser(context.actorUserId, context.organizationId);
    if (!actor) throw new ServiceError(404, "Colaborador não encontrado.");
    const target = await this.findUser(targetUserId ?? context.actorUserId, context.organizationId);
    if (!target) throw new ServiceError(404, "Colaborador não encontrado.");

    if (actor.id !== target.id && context.rhPermission < RH_TEAM_PERMISSION) {
      throw new ServiceError(404, "Colaborador não encontrado.");
    }
    if (
      context.rhPermission === RH_TEAM_PERMISSION &&
      (!actor.department_id || actor.department_id !== target.department_id)
    ) {
      throw new ServiceError(404, "Colaborador não encontrado.");
    }
    return { actor, target };
  }

  private assertCanWrite(context: RhLifeProjectContext, targetUserId: string): void {
    if (
      context.rhPermission < RH_SELF_SERVICE_PERMISSION ||
      context.rhPermission === RH_TEAM_PERMISSION ||
      (context.rhPermission < RH_ADMIN_PERMISSION && context.actorUserId !== targetUserId)
    ) {
      throw new ServiceError(403, "Sem permissão para editar este Projeto de Vida.");
    }
  }

  private async findProjectTarget(
    context: RhLifeProjectContext,
    projectId: string,
  ): Promise<string> {
    const project = await this.db.rhLifeProject.findFirst({
      where: { id: projectId, organization_id: context.organizationId },
      select: { user_id: true },
    });
    if (!project) throw new ServiceError(404, "Projeto de Vida não encontrado.");
    await this.resolveTarget(context, project.user_id);
    return project.user_id;
  }

  async get(
    context: RhLifeProjectContext,
    year: number,
  ): Promise<ReturnType<typeof serializeProject> | null> {
    try {
      if (!Number.isInteger(year) || year < 1900 || year > 9999) {
        throw new ServiceError(400, "Ano do Projeto de Vida inválido.");
      }
      const { target } = await this.resolveTarget(context, context.targetUserId);
      const project = await this.db.rhLifeProject.findFirst({
        where: { organization_id: context.organizationId, user_id: target.id, year },
        include: { objectives: { orderBy: { created_at: "asc" } } },
      });
      return project ? serializeProject(project) : null;
    } catch (err: unknown) {
      logError("Erro ao consultar Projeto de Vida", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao consultar Projeto de Vida.", err);
    }
  }

  async create(
    context: RhLifeProjectContext,
    year: number,
  ): Promise<ReturnType<typeof serializeProject>> {
    try {
      if (!Number.isInteger(year) || year < 1900 || year > 9999) {
        throw new ServiceError(400, "Ano do Projeto de Vida inválido.");
      }
      const { actor, target } = await this.resolveTarget(context, context.targetUserId);
      this.assertCanWrite(context, target.id);
      const project = await this.db.rhLifeProject.create({
        data: {
          organization_id: context.organizationId,
          user_id: target.id,
          year,
          created_by_id: actor.id,
          updated_by_id: actor.id,
        },
        include: { objectives: { orderBy: { created_at: "asc" } } },
      });
      return serializeProject(project);
    } catch (err: unknown) {
      logError("Erro ao criar Projeto de Vida", { err });
      if (err instanceof ServiceError) throw err;
      if (isUniqueConstraintError(err)) {
        throw new ServiceError(
          409,
          "Já existe um Projeto de Vida para este colaborador e ano.",
          err,
        );
      }
      throw new ServiceError(500, "Erro interno ao criar Projeto de Vida.", err);
    }
  }

  async update(
    context: RhLifeProjectContext,
    projectId: string,
    changes: UpdateRhLifeProjectBody,
  ): Promise<ReturnType<typeof serializeProject>> {
    try {
      const targetUserId = await this.findProjectTarget(context, projectId);
      this.assertCanWrite(context, targetUserId);
      const updated = await this.db.rhLifeProject.updateMany({
        where: { id: projectId, organization_id: context.organizationId, user_id: targetUserId },
        data: { ...changes, updated_by_id: context.actorUserId },
      });
      if (updated.count !== 1) throw new ServiceError(404, "Projeto de Vida não encontrado.");
      const project = await this.db.rhLifeProject.findFirst({
        where: { id: projectId, organization_id: context.organizationId },
        include: { objectives: { orderBy: { created_at: "asc" } } },
      });
      if (!project) throw new ServiceError(404, "Projeto de Vida não encontrado.");
      return serializeProject(project);
    } catch (err: unknown) {
      logError("Erro ao atualizar Projeto de Vida", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao atualizar Projeto de Vida.", err);
    }
  }

  async createObjective(
    context: RhLifeProjectContext,
    projectId: string,
    objective: CreateRhLifeObjectiveBody,
  ): Promise<ReturnType<typeof serializeProject>> {
    try {
      const targetUserId = await this.findProjectTarget(context, projectId);
      this.assertCanWrite(context, targetUserId);
      await this.db.rhLifeProjectObjective.create({
        data: {
          organization_id: context.organizationId,
          project_id: projectId,
          title: objective.title,
          forecast_date: objective.forecast_date ?? null,
          employee_observations: objective.employee_observations ?? "",
          created_by_id: context.actorUserId,
          updated_by_id: context.actorUserId,
        },
      });
      return this.getProjectById(context.organizationId, projectId);
    } catch (err: unknown) {
      logError("Erro ao criar objetivo do Projeto de Vida", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao criar objetivo do Projeto de Vida.", err);
    }
  }

  async updateObjective(
    context: RhLifeProjectContext,
    projectId: string,
    objectiveId: string,
    changes: UpdateRhLifeObjectiveBody,
  ): Promise<ReturnType<typeof serializeProject>> {
    try {
      const targetUserId = await this.findProjectTarget(context, projectId);
      this.assertCanWrite(context, targetUserId);
      if (context.rhPermission < RH_ADMIN_PERMISSION) {
        const employeeFields = new Set(["title", "forecast_date", "employee_observations"]);
        if (Object.keys(changes).some((field) => !employeeFields.has(field))) {
          throw new ServiceError(
            403,
            "Somente o RH administrativo pode atualizar situação e observações do RH.",
          );
        }
      }

      const data: Prisma.RhLifeProjectObjectiveUncheckedUpdateManyInput = {
        updated_by_id: context.actorUserId,
      };
      if (changes.title !== undefined) data.title = changes.title;
      if (changes.forecast_date !== undefined) data.forecast_date = changes.forecast_date;
      if (changes.rh_observations !== undefined) data.rh_observations = changes.rh_observations;
      if (changes.employee_observations !== undefined) {
        data.employee_observations = changes.employee_observations;
      }
      if (changes.status !== undefined) {
        data.status = changes.status;
        data.completed_at =
          changes.status === "Realized" ? (changes.completed_at ?? new Date()) : null;
      } else if (changes.completed_at !== undefined) {
        data.completed_at = changes.completed_at;
        if (changes.completed_at !== null) data.status = "Realized";
      }

      const updated = await this.db.rhLifeProjectObjective.updateMany({
        where: {
          id: objectiveId,
          project_id: projectId,
          organization_id: context.organizationId,
        },
        data,
      });
      if (updated.count !== 1) throw new ServiceError(404, "Objetivo não encontrado.");
      return this.getProjectById(context.organizationId, projectId);
    } catch (err: unknown) {
      logError("Erro ao atualizar objetivo do Projeto de Vida", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao atualizar objetivo do Projeto de Vida.", err);
    }
  }

  private async getProjectById(
    organizationId: string,
    projectId: string,
  ): Promise<ReturnType<typeof serializeProject>> {
    const project = await this.db.rhLifeProject.findFirst({
      where: { id: projectId, organization_id: organizationId },
      include: { objectives: { orderBy: { created_at: "asc" } } },
    });
    if (!project) throw new ServiceError(404, "Projeto de Vida não encontrado.");
    return serializeProject(project);
  }
}

export { RhLifeProjectService };
