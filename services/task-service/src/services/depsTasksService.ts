import { error as logError, ServiceError } from "@workspace/shared";
import prismaClient from "../prisma/index.js";

export type DepsTasksPrisma = Pick<typeof prismaClient, "department" | "user">;

export interface TaskModelOption {
  id: string;
  name: string;
}

export interface TaskModelOptions {
  users: TaskModelOption[];
  departments: TaskModelOption[];
}

export class DepsTasksService {
  constructor(private readonly prisma: DepsTasksPrisma = prismaClient) {}

  async listDepartmentsWithTaskModels(organizationId: string) {
    try {
      return await this.prisma.department.findMany({
        where: {
          organization_id: organizationId,
          status: "Ativo",
          tasksModel: {
            some: {},
          },
        },
        select: {
          id: true,
          name: true,
          color: true,
          solution: true,
          tasksModel: true,
        },
        orderBy: {
          name: "asc",
        },
      });
    } catch (err: unknown) {
      logError("Erro ao listar departamentos com modelos de tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível listar os departamentos.", err);
    }
  }

  async listTaskModelOptions(organizationId: string): Promise<TaskModelOptions> {
    try {
      const [users, departments] = await Promise.all([
        this.prisma.user.findMany({
          where: { organization_id: organizationId, status: "active" },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        this.prisma.department.findMany({
          where: { organization_id: organizationId, status: "Ativo" },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ]);

      return { users, departments };
    } catch (err: unknown) {
      logError("Erro ao listar opções de modelo de tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível listar as opções do modelo.", err);
    }
  }
}
