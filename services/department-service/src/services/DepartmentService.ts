import { error as logError, ServiceError } from "@workspace/shared";

import * as departmentAudit from "../integrations/audit.js";
import prismaClient from "../integrations/prisma.js";

const DEPARTMENT_SELECT = {
  id: true,
  name: true,
  color: true,
  status: true,
  solution: true,
} as const;

type DepartmentStatus = "Ativo" | "Inativo";

export interface DepartmentItem {
  id: string;
  name: string;
  color: string | null;
  status: string;
  solution: boolean | null;
}

export interface CreateDepartmentRequest {
  user_id: string;
  organization_id: string;
  name: string;
  color: string;
  solution?: boolean;
}

export interface UpdateDepartmentRequest {
  user_id: string;
  organization_id: string;
  dep_id: string;
  name?: string;
  color?: string;
  status?: string;
  solution?: boolean;
}

function normalizeStatusFilter(status?: string): DepartmentStatus | undefined {
  if (!status || status === "Todos") {
    return undefined;
  }

  if (status === "Ativo" || status === "Inativo") {
    return status;
  }

  throw new ServiceError(400, "status deve ser Ativo, Inativo ou Todos.");
}

function normalizeStatusValue(status?: string): DepartmentStatus | undefined {
  if (status === undefined) {
    return undefined;
  }

  if (status === "Ativo" || status === "Inativo") {
    return status;
  }

  throw new ServiceError(400, "status deve ser Ativo ou Inativo.");
}

export type DepartmentPrismaDeps = Pick<typeof prismaClient, "department">;

export interface DepartmentAuditDeps {
  createLog: typeof departmentAudit.createLog;
  logUpdateIfChanged: typeof departmentAudit.logUpdateIfChanged;
}

const defaultAuditDeps: DepartmentAuditDeps = departmentAudit;

export class DepartmentService {
  constructor(
    private readonly prisma: DepartmentPrismaDeps = prismaClient,
    private readonly audit: DepartmentAuditDeps = defaultAuditDeps,
  ) {}

  async create(data: CreateDepartmentRequest): Promise<{ dep: DepartmentItem }> {
    try {
      const exists = await this.prisma.department.findFirst({
        where: {
          name: data.name,
          organization_id: data.organization_id,
        },
      });

      if (exists) {
        throw new ServiceError(409, "Departamento já cadastrado.");
      }

      const dep = await this.prisma.department.create({
        data: {
          name: data.name,
          color: data.color,
          status: "Ativo",
          solution: data.solution ?? false,
          organization_id: data.organization_id,
        },
        select: DEPARTMENT_SELECT,
      });

      await this.audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Cadastro",
        referring: "departments",
        referringId: dep.id,
        changes: "{}",
      });

      return { dep };
    } catch (err: unknown) {
      logError("Erro ao cadastrar departamento", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível cadastrar o departamento.", err);
    }
  }

  async detail(dep_id: string, organization_id: string): Promise<{ dep: DepartmentItem }> {
    try {
      const dep = await this.prisma.department.findFirst({
        where: {
          id: dep_id,
          organization_id,
        },
        select: DEPARTMENT_SELECT,
      });

      if (!dep) {
        throw new ServiceError(404, "Departamento não encontrado.");
      }

      return { dep };
    } catch (err: unknown) {
      logError("Erro ao buscar departamento", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível buscar o departamento.", err);
    }
  }

  async update(data: UpdateDepartmentRequest): Promise<DepartmentItem> {
    try {
      const current = await this.prisma.department.findFirst({
        where: {
          id: data.dep_id,
          organization_id: data.organization_id,
        },
        select: DEPARTMENT_SELECT,
      });

      if (!current) {
        throw new ServiceError(404, "Departamento não existe.");
      }

      const nextName = data.name ?? current.name;
      if (nextName !== current.name) {
        const duplicate = await this.prisma.department.findFirst({
          where: {
            name: nextName,
            organization_id: data.organization_id,
            NOT: { id: data.dep_id },
          },
          select: { id: true },
        });

        if (duplicate) {
          throw new ServiceError(409, "Já existe um departamento com esse nome.");
        }
      }

      const updated = await this.prisma.department.update({
        where: {
          id: data.dep_id,
        },
        data: {
          name: nextName,
          color: data.color ?? current.color,
          status: normalizeStatusValue(data.status) ?? current.status,
          solution: data.solution ?? current.solution,
        },
        select: DEPARTMENT_SELECT,
      });

      await this.audit.logUpdateIfChanged({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Atualização",
        referring: "departments",
        referringId: data.dep_id,
        oldData: current as Record<string, unknown>,
        updatedData: updated as Record<string, unknown>,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar departamento", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível atualizar o departamento.", err);
    }
  }

  async list(status: string | undefined, organization_id: string): Promise<DepartmentItem[]> {
    try {
      const normalizedStatus = normalizeStatusFilter(status);

      return await this.prisma.department.findMany({
        where: {
          organization_id,
          ...(normalizedStatus ? { status: normalizedStatus } : {}),
        },
        select: DEPARTMENT_SELECT,
        orderBy: {
          name: "asc",
        },
      });
    } catch (err: unknown) {
      logError("Erro ao listar departamentos", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível listar os departamentos.", err);
    }
  }
}
