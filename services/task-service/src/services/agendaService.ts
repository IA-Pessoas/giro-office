import {
  type ModulePermissionKey,
  resolveDepartmentModuleKey,
  ServiceError,
} from "@workspace/shared";
import type { TaskAudit } from "../integrations/audit.js";
import type prismaClient from "../prisma/index.js";
import type { AGENDA_STATUSES } from "../schemas/agenda.schemas.js";

export type AgendaPrisma = Pick<typeof prismaClient, "agenda" | "department">;

/** Quem pede e por qual módulo: a agenda é uma só, o departamento é o filtro. */
export interface AgendaScope {
  organizationId: string;
  userId: string;
  module: ModulePermissionKey;
  /** Nível do usuário no módulo pedido. */
  level: number;
}

export interface AgendaEventInput {
  agenda: string;
  date: Date;
  status?: (typeof AGENDA_STATUSES)[number];
  obs?: string | null;
  location?: string | null;
}

const AGENDA_SELECT = {
  id: true,
  agenda: true,
  date: true,
  status: true,
  obs: true,
  location: true,
  department_control_id: true,
} as const;

export interface AgendaEventRow {
  id: string;
  agenda: string;
  date: Date;
  status: string | null;
  obs: string | null;
  location: string | null;
  department_control_id: string;
}

/** Níveis do módulo (0 a 3) exigidos pela agenda; o owner entra com o maior. */
export const AGENDA_LEVEL = { READ: 1, WRITE: 2, OWNER: 3 } as const;

const NOT_FOUND = "Evento da agenda não encontrado.";

export class AgendaService {
  constructor(
    private readonly prisma: AgendaPrisma,
    private readonly audit: TaskAudit,
  ) {}

  /** Departamentos da organização que pertencem ao módulo (ex.: "Contábil Fiscal" -> contabil). */
  private async departmentIds(scope: AgendaScope, minimumLevel: number): Promise<string[]> {
    if (scope.level < minimumLevel) {
      throw new ServiceError(403, "Permissão insuficiente para a agenda deste departamento.");
    }
    const departments = await this.prisma.department.findMany({
      where: { organization_id: scope.organizationId },
      select: { id: true, name: true },
      // Ordem estável: sem `department_id`, a criação usa sempre o mesmo departamento.
      orderBy: { name: "asc" },
    });
    return departments
      .filter((department) => resolveDepartmentModuleKey(department.name) === scope.module)
      .map((department) => department.id);
  }

  private async scopedWhere(scope: AgendaScope, id: string) {
    return {
      id,
      organization_id: scope.organizationId,
      department_control_id: { in: await this.departmentIds(scope, AGENDA_LEVEL.WRITE) },
    };
  }

  private log(scope: AgendaScope, action: string, id: string, changes: Record<string, unknown>) {
    return this.audit.createLog({
      userId: scope.userId,
      organizationId: scope.organizationId,
      action,
      referring: "agenda",
      referringId: id,
      changes,
    });
  }

  /** `month` no formato AAAA-MM; o intervalo é o mês em UTC. */
  async list(scope: AgendaScope, month: string): Promise<AgendaEventRow[]> {
    const [year, monthNumber] = month.split("-").map(Number);
    return this.prisma.agenda.findMany({
      where: {
        organization_id: scope.organizationId,
        department_control_id: { in: await this.departmentIds(scope, AGENDA_LEVEL.READ) },
        date: {
          gte: new Date(Date.UTC(year, monthNumber - 1, 1)),
          lt: new Date(Date.UTC(year, monthNumber, 1)),
        },
      },
      select: AGENDA_SELECT,
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
  }

  async create(
    scope: AgendaScope,
    input: AgendaEventInput & { department_id?: string },
  ): Promise<AgendaEventRow> {
    const { department_id, ...event } = input;
    const departmentIds = await this.departmentIds(scope, AGENDA_LEVEL.WRITE);
    const departmentId = department_id ?? departmentIds[0];
    if (!departmentId || !departmentIds.includes(departmentId)) {
      throw new ServiceError(404, "Departamento não encontrado para este módulo.");
    }
    const created = await this.prisma.agenda.create({
      data: {
        ...event,
        status: event.status ?? "Pendente",
        organization_id: scope.organizationId,
        department_control_id: departmentId,
      },
      select: AGENDA_SELECT,
    });
    await this.log(scope, "Cadastro", created.id, {});
    return created;
  }

  async update(
    scope: AgendaScope,
    id: string,
    input: Partial<AgendaEventInput>,
  ): Promise<{ id: string }> {
    const { count } = await this.prisma.agenda.updateMany({
      where: await this.scopedWhere(scope, id),
      data: input,
    });
    if (count === 0) throw new ServiceError(404, NOT_FOUND);
    await this.log(scope, "Atualização", id, input);
    return { id };
  }

  async remove(scope: AgendaScope, id: string): Promise<{ id: string }> {
    const { count } = await this.prisma.agenda.deleteMany({
      where: await this.scopedWhere(scope, id),
    });
    if (count === 0) throw new ServiceError(404, NOT_FOUND);
    await this.log(scope, "Exclusão", id, {});
    return { id };
  }
}
