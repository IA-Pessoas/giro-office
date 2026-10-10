import {
  type ModulePermissionKey,
  resolveDepartmentModuleKey,
  ServiceError,
} from "@workspace/shared";
import type { TaskAudit } from "../integrations/audit.js";
import type prismaClient from "../prisma/index.js";
import type { AGENDA_STATUSES } from "../schemas/agenda.schemas.js";

export type AgendaPrisma = Pick<typeof prismaClient, "agenda" | "department" | "recurringAgenda">;

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

/** `recurrent` repete o evento todo mês; ausente na edição, não mexe na recorrência. */
type AgendaRecurrenceInput = { recurrent?: boolean };

const AGENDA_SELECT = {
  id: true,
  agenda: true,
  date: true,
  status: true,
  obs: true,
  location: true,
  department_control_id: true,
  recurring_agenda_id: true,
} as const;

export interface AgendaEventRow {
  id: string;
  agenda: string;
  date: Date;
  status: string | null;
  obs: string | null;
  location: string | null;
  department_control_id: string;
  /** Preenchido quando o evento é ocorrência de uma recorrência mensal. */
  recurring_agenda_id: string | null;
}

/** Níveis do módulo (0 a 3) exigidos pela agenda; o owner entra com o maior. */
export const AGENDA_LEVEL = { READ: 1, WRITE: 2, OWNER: 3 } as const;

const NOT_FOUND = "Evento da agenda não encontrado.";

const DEFAULT_STATUS = "Pendente" satisfies (typeof AGENDA_STATUSES)[number];
const MONTHLY = "mensal";

/** Competência (AAAA-MM) em UTC, o mesmo corte de mês usado na listagem. */
const monthOf = (date: Date) => date.toISOString().slice(0, 7);

/**
 * Data da ocorrência de `month` (AAAA-MM) para a regra do dia `day`, ao meio-dia UTC.
 * Mês curto usa o último dia; sábado e domingo vão para a sexta anterior ou, quando ela
 * cairia no mês anterior, para a segunda seguinte.
 */
export function monthlyOccurrenceDate(day: number, month: string): Date {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  let target = Math.min(day, lastDay);
  const weekday = new Date(Date.UTC(year, monthNumber - 1, target)).getUTCDay();
  if (weekday === 6) target += target > 1 ? -1 : 2;
  if (weekday === 0) target += target > 2 ? -2 : 1;
  return new Date(Date.UTC(year, monthNumber - 1, target, 12));
}

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

  /**
   * Cria a ocorrência do mês corrente de cada regra mensal ainda não gerada nele.
   * O índice único (regra, competência) descarta a repetição em leituras simultâneas, e o
   * marcador avançado impede que uma ocorrência removida volte.
   */
  // ponytail: gera só o mês corrente, ao abrir a agenda. Mês que ninguém abriu fica sem
  // ocorrência e mês futuro não é antecipado; se isso fizer falta, mover para um cron.
  private async generateRecurring(organizationId: string, departmentIds: string[], now: Date) {
    const month = monthOf(now);
    const pending = { generated_through: { lt: month } };
    const rules = await this.prisma.recurringAgenda.findMany({
      where: {
        organization_id: organizationId,
        department_control_id: { in: departmentIds },
        recurrence: MONTHLY,
        ...pending,
      },
      select: {
        id: true,
        agenda: true,
        day: true,
        obs: true,
        location: true,
        department_control_id: true,
      },
    });
    if (rules.length === 0) return;
    await this.prisma.agenda.createMany({
      data: rules.map(({ id, day, ...rule }) => ({
        ...rule,
        date: monthlyOccurrenceDate(day, month),
        status: DEFAULT_STATUS,
        organization_id: organizationId,
        recurring_agenda_id: id,
        recurrence_month: month,
      })),
      skipDuplicates: true,
    });
    await this.prisma.recurringAgenda.updateMany({
      where: { id: { in: rules.map((rule) => rule.id) }, ...pending },
      data: { generated_through: month },
    });
  }

  /** `month` no formato AAAA-MM; o intervalo é o mês em UTC. */
  async list(scope: AgendaScope, month: string, now = new Date()): Promise<AgendaEventRow[]> {
    const [year, monthNumber] = month.split("-").map(Number);
    const departmentIds = await this.departmentIds(scope, AGENDA_LEVEL.READ);
    await this.generateRecurring(scope.organizationId, departmentIds, now);
    return this.prisma.agenda.findMany({
      where: {
        organization_id: scope.organizationId,
        department_control_id: { in: departmentIds },
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
    input: AgendaEventInput & AgendaRecurrenceInput & { department_id?: string },
  ): Promise<AgendaEventRow> {
    const { department_id, recurrent, ...event } = input;
    const departmentIds = await this.departmentIds(scope, AGENDA_LEVEL.WRITE);
    const departmentId = department_id ?? departmentIds[0];
    if (!departmentId || !departmentIds.includes(departmentId)) {
      throw new ServiceError(404, "Departamento não encontrado para este módulo.");
    }
    const data = {
      ...event,
      status: event.status ?? DEFAULT_STATUS,
      organization_id: scope.organizationId,
      department_control_id: departmentId,
    };
    const created = recurrent
      ? await this.createRecurring(data)
      : await this.prisma.agenda.create({ data, select: AGENDA_SELECT });
    await this.log(scope, "Cadastro", created.id, {});
    return created;
  }

  /** Regra e primeira ocorrência em uma gravação só: não fica regra sem evento. */
  private async createRecurring(
    event: AgendaEventInput & { organization_id: string; department_control_id: string },
  ): Promise<AgendaEventRow> {
    const month = monthOf(event.date);
    const rule = await this.prisma.recurringAgenda.create({
      data: {
        agenda: event.agenda,
        day: event.date.getUTCDate(),
        recurrence: MONTHLY,
        obs: event.obs,
        location: event.location,
        organization_id: event.organization_id,
        department_control_id: event.department_control_id,
        generated_through: month,
        occurrences: { create: { ...event, recurrence_month: month } },
      },
      select: { occurrences: { select: AGENDA_SELECT } },
    });
    return rule.occurrences[0];
  }

  /**
   * Mantém a regra coerente com a edição da ocorrência e devolve o vínculo a gravar nela.
   * Só a ocorrência mais recente (a do marcador) altera a regra: editar uma antiga não muda
   * as próximas. O estado nunca vai para a regra.
   */
  private async syncRecurrence(
    scope: AgendaScope,
    existing: {
      agenda: string;
      date: Date;
      obs: string | null;
      location: string | null;
      department_control_id: string;
      recurring_agenda_id: string | null;
      recurrence_month: string | null;
    },
    { agenda, date, obs, location }: Partial<AgendaEventInput>,
    recurrent: boolean | undefined,
    now: Date,
  ) {
    const ruleId = existing.recurring_agenda_id;
    if (ruleId && recurrent === false) {
      await this.prisma.recurringAgenda.deleteMany({
        where: { id: ruleId, organization_id: scope.organizationId },
      });
      return { recurring_agenda_id: null, recurrence_month: null };
    }
    if (ruleId) {
      // Adiar a ocorrência para outro mês não muda o dia da regra: o mês de destino
      // ainda recebe a própria ocorrência, no dia de sempre.
      const sameMonth = date && monthOf(date) === existing.recurrence_month;
      const data = { agenda, obs, location, day: sameMonth ? date.getUTCDate() : undefined };
      if (Object.values(data).some((value) => value !== undefined)) {
        await this.prisma.recurringAgenda.updateMany({
          where: { id: ruleId, generated_through: existing.recurrence_month },
          data,
        });
      }
      return {};
    }
    if (!recurrent) return {};
    const day = date ?? existing.date;
    const month = monthOf(day);
    const currentMonth = monthOf(now);
    const rule = await this.prisma.recurringAgenda.create({
      data: {
        agenda: agenda ?? existing.agenda,
        day: day.getUTCDate(),
        recurrence: MONTHLY,
        obs: obs === undefined ? existing.obs : obs,
        location: location === undefined ? existing.location : location,
        organization_id: scope.organizationId,
        department_control_id: existing.department_control_id,
        // Série ligada em evento antigo começa no mês seguinte ao corrente: o mês corrente
        // pode já ter um evento que sobrou de uma série encerrada, e ganharia outro igual.
        generated_through: month > currentMonth ? month : currentMonth,
      },
      select: { id: true },
    });
    return { recurring_agenda_id: rule.id, recurrence_month: month };
  }

  async update(
    scope: AgendaScope,
    id: string,
    input: Partial<AgendaEventInput> & AgendaRecurrenceInput,
    now = new Date(),
  ): Promise<{ id: string }> {
    const where = await this.scopedWhere(scope, id);
    const { recurrent, ...fields } = input;
    const existing = await this.prisma.agenda.findFirst({
      where,
      select: {
        agenda: true,
        date: true,
        obs: true,
        location: true,
        department_control_id: true,
        recurring_agenda_id: true,
        recurrence_month: true,
      },
    });
    if (!existing) throw new ServiceError(404, NOT_FOUND);
    const link = await this.syncRecurrence(scope, existing, fields, recurrent, now);
    const data = { ...fields, ...link };
    // Pedido que não muda nada (recorrência já ligada, por exemplo) não grava nem deixa trilha.
    if (Object.keys(data).length === 0) return { id };
    const newRuleId = link.recurring_agenda_id;
    let count = 0;
    try {
      ({ count } = await this.prisma.agenda.updateMany({
        // Regra nova só se liga a evento ainda sem regra: de duas edições simultâneas, uma perde.
        where: newRuleId ? { ...where, recurring_agenda_id: null } : where,
        data,
      }));
    } finally {
      // Sem evento ligado, a regra recém-criada geraria ocorrências sem origem.
      if (count === 0 && newRuleId) {
        await this.prisma.recurringAgenda.deleteMany({ where: { id: newRuleId } });
      }
    }
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
