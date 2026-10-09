import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateLogParams } from "../integrations/audit.js";
import { competenceDate, competenceKey } from "../schemas/competence.schemas.js";
import type { MonthlyControlStatus } from "../schemas/monthlyControl.schemas.js";
import { createSuggestedObligations } from "./monthlyObligationService.js";
import {
  hasTriagePendency,
  type TriageDocumentsView,
  triageDocumentsView,
} from "./triageDocuments.js";

export type MonthlyControlPrisma = Pick<
  PrismaClient,
  | "client"
  | "fiscalMonthlyControl"
  | "fiscalMonthlyControlEvent"
  | "fiscalMonthlyControlObligation"
  | "triageMonthly"
  | "triageCompetence"
  | "$transaction"
>;

type MonthlyControlTx = Pick<
  PrismaClient,
  "fiscalMonthlyControl" | "fiscalMonthlyControlEvent" | "fiscalMonthlyControlObligation"
>;

const REFERRING = "fiscal.monthly_controls";
const FISCAL_ADMIN_PERMISSION = 3;

interface Actor {
  organizationId: string;
  userId: string;
  permission?: number;
}

export interface OpenMonthlyControlInput extends Actor {
  client_id: string;
  competence: string;
  reason?: string;
}

export interface UpdateMonthlyControlInput extends Actor {
  id: string;
  status?: MonthlyControlStatus;
  no_movement?: boolean;
  reason?: string;
}

export interface MonthlyControlDto {
  id: string;
  client_id: string;
  competence: string;
  status: MonthlyControlStatus;
  no_movement: boolean;
  regime: string | null;
  opening_reason: string | null;
  updated_by: string;
  updatedAt: string;
}

export interface MonthlyControlListItem extends MonthlyControlDto {
  client_name: string;
  /** Obrigações aplicáveis ainda sem cumprimento; não mudam a situação do controle. */
  pending_obligations: number;
  /** Documentos pendentes na Triagem; null quando a Triagem não tem registro. */
  triage_pending: number | null;
}

export interface MonthlyControlTriage extends TriageDocumentsView {
  control_id: string;
  competence: string;
}

type StoredControl = {
  id: string;
  client_id: string;
  competence: Date;
  status: string;
  no_movement: boolean;
  regime: string | null;
  opening_reason: string | null;
  updated_by: string;
  updatedAt: Date;
};

type EventInput = {
  action:
    | "CREATED"
    | "EXCEPTIONAL_OPENING"
    | "STATUS"
    | "EXCEPTIONAL_COMPLETION"
    | "REOPENED"
    | "NO_MOVEMENT";
  from_value: string | null;
  to_value: string | null;
  reason: string | null;
};

function serialize(value: StoredControl): MonthlyControlDto {
  return {
    id: value.id,
    client_id: value.client_id,
    competence: competenceKey(value.competence),
    status: value.status as MonthlyControlStatus,
    no_movement: value.no_movement,
    regime: value.regime,
    opening_reason: value.opening_reason,
    updated_by: value.updated_by,
    updatedAt: value.updatedAt.toISOString(),
  };
}

function competenceEnd(start: Date): Date {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

/** Mesma janela de entrada/saída do controle contábil, mas só com Fiscal contratado. */
function eligibleClientsWhere(organizationId: string, start: Date) {
  return {
    organization_id: organizationId,
    fiscal: true,
    AND: [
      { OR: [{ competence_entry: null }, { competence_entry: { lte: competenceEnd(start) } }] },
      { OR: [{ competence_output: null }, { competence_output: { gte: start } }] },
    ],
  };
}

/** Geração automática vai até o mês seguinte ao corrente; além disso só abertura explícita. */
function isGenerable(competence: Date, now: Date): boolean {
  return competence <= new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}

/**
 * Controle fiscal mensal: um por organização, cliente e competência. Separado da receita
 * do Simples e do checklist da Triagem.
 */
export class MonthlyControlService {
  constructor(
    private readonly prisma: MonthlyControlPrisma,
    private readonly audit: { createLog(params: CreateLogParams): Promise<void> },
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async recordEvents(
    tx: MonthlyControlTx,
    organizationId: string,
    actorId: string,
    controlId: string,
    events: EventInput[],
  ): Promise<void> {
    if (!events.length) return;
    await tx.fiscalMonthlyControlEvent.createMany({
      data: events.map((event) => ({
        organization_id: organizationId,
        control_id: controlId,
        ...event,
        actor_id: actorId,
      })),
    });
  }

  /** Reconcilia a competência (gera os controles que faltam) e devolve a carteira. */
  async list(
    input: { competence: string },
    actor: Actor,
  ): Promise<{ competence: string; items: MonthlyControlListItem[] }> {
    const { organizationId, userId } = actor;
    const competence = competenceDate(input.competence);

    const eligible = isGenerable(competence, this.now())
      ? await this.prisma.client.findMany({
          where: eligibleClientsWhere(organizationId, competence),
          select: { id: true, regime: true },
        })
      : [];
    const existing = await this.prisma.fiscalMonthlyControl.findMany({
      where: { organization_id: organizationId, competence },
    });
    const withControl = new Set(existing.map((control) => control.client_id));
    const missing = eligible.filter((client) => !withControl.has(client.id));

    let controls: StoredControl[] = existing;
    if (missing.length) {
      await this.prisma.$transaction(async (tx) => {
        // Listagens concorrentes: o índice único descarta a perdedora e só a linha
        // inserida aqui ganha o evento de criação.
        const created = await tx.fiscalMonthlyControl.createManyAndReturn({
          data: missing.map((client) => ({
            organization_id: organizationId,
            client_id: client.id,
            competence,
            status: "PENDING",
            regime: client.regime,
            created_by: userId,
            updated_by: userId,
          })),
          skipDuplicates: true,
          select: { id: true, regime: true },
        });
        if (!created.length) return;
        await createSuggestedObligations(tx, organizationId, userId, created);
        await tx.fiscalMonthlyControlEvent.createMany({
          data: created.map((control) => ({
            organization_id: organizationId,
            control_id: control.id,
            action: "CREATED",
            from_value: null,
            to_value: "PENDING",
            reason: null,
            actor_id: userId,
          })),
        });
      });
      controls = await this.prisma.fiscalMonthlyControl.findMany({
        where: { organization_id: organizationId, competence },
      });
    }

    const clients = controls.length
      ? await this.prisma.client.findMany({
          where: {
            organization_id: organizationId,
            id: { in: controls.map((control) => control.client_id) },
          },
          select: { id: true, name: true, company_name: true },
        })
      : [];
    const names = new Map(
      clients.map((client) => [client.id, client.company_name?.trim() || client.name]),
    );
    const pending = controls.length
      ? await this.prisma.fiscalMonthlyControlObligation.groupBy({
          by: ["control_id"],
          where: {
            organization_id: organizationId,
            control_id: { in: controls.map((control) => control.id) },
            applicable: true,
            completed_on: null,
          },
          _count: { _all: true },
        })
      : [];
    const pendingByControl = new Map(pending.map((row) => [row.control_id, row._count._all]));
    const triage = await this.triageByClient(
      organizationId,
      input.competence,
      controls.map((control) => control.client_id),
    );

    const items = controls
      .map((control) => ({
        ...serialize(control),
        client_name: names.get(control.client_id) ?? "",
        pending_obligations: pendingByControl.get(control.id) ?? 0,
        triage_pending: triage(control.client_id).pending,
      }))
      .sort((a, b) => a.client_name.localeCompare(b.client_name, "pt-BR", { sensitivity: "base" }));
    return { competence: input.competence, items };
  }

  /** Estado documental da Triagem Fiscal por cliente na competência (só leitura). */
  private async triageByClient(
    organizationId: string,
    competence: string,
    clientIds: string[],
  ): Promise<(clientId: string) => TriageDocumentsView> {
    const where = {
      organization_id: organizationId,
      competence,
      archived_at: null,
      client_id: { in: clientIds },
    };
    const [monthlies, competences] = clientIds.length
      ? await Promise.all([
          this.prisma.triageMonthly.findMany({
            where: { ...where, type: "FISCAL" },
            select: { client_id: true, checklist: true },
          }),
          this.prisma.triageCompetence.findMany({
            where,
            select: { client_id: true, configuration_snapshot: true },
          }),
        ])
      : [[], []];
    const monthlyByClient = new Map(monthlies.map((row) => [row.client_id, row]));
    const competenceByClient = new Map(competences.map((row) => [row.client_id, row]));
    return (clientId) =>
      triageDocumentsView(monthlyByClient.get(clientId), competenceByClient.get(clientId));
  }

  private async triageFor(
    control: { client_id: string; competence: Date },
    organizationId: string,
  ): Promise<TriageDocumentsView> {
    const read = await this.triageByClient(organizationId, competenceKey(control.competence), [
      control.client_id,
    ]);
    return read(control.client_id);
  }

  /** Documentos da Triagem do mesmo cliente e competência; Fiscal só consulta. */
  async triage(controlId: string, actor: Actor): Promise<MonthlyControlTriage> {
    const control = await this.prisma.fiscalMonthlyControl.findFirst({
      where: { id: controlId, organization_id: actor.organizationId },
    });
    if (!control) throw new ServiceError(404, "Controle fiscal não encontrado.");
    return {
      control_id: control.id,
      competence: competenceKey(control.competence),
      ...(await this.triageFor(control, actor.organizationId)),
    };
  }

  /** Abre o controle de um cliente; fora da regra de elegibilidade exige motivo. */
  async open(
    input: OpenMonthlyControlInput,
  ): Promise<{ control: MonthlyControlDto; created: boolean }> {
    const client = await this.prisma.client.findFirst({
      where: { id: input.client_id, organization_id: input.organizationId },
      select: { id: true, regime: true },
    });
    if (!client) throw new ServiceError(404, "Cliente não encontrado.");

    const competence = competenceDate(input.competence);
    const where = { organization_id: input.organizationId, client_id: client.id, competence };
    const existing = await this.prisma.fiscalMonthlyControl.findFirst({ where });
    if (existing) return { control: serialize(existing), created: false };

    const eligible = await this.prisma.client.count({
      where: { ...eligibleClientsWhere(input.organizationId, competence), id: client.id },
    });
    const exceptional = eligible === 0;
    const reason = input.reason ?? null;
    if (exceptional && !reason) {
      throw new ServiceError(
        400,
        "Cliente sem Fiscal ativo nesta competência: informe o motivo da abertura excepcional.",
      );
    }

    let created: StoredControl;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const control = await tx.fiscalMonthlyControl.create({
          data: {
            ...where,
            status: "PENDING",
            regime: client.regime,
            opening_reason: exceptional ? reason : null,
            created_by: input.userId,
            updated_by: input.userId,
          },
        });
        await this.recordEvents(tx, input.organizationId, input.userId, control.id, [
          {
            action: exceptional ? "EXCEPTIONAL_OPENING" : "CREATED",
            from_value: null,
            to_value: "PENDING",
            reason,
          },
        ]);
        await createSuggestedObligations(tx, input.organizationId, input.userId, [control]);
        return control;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.prisma.fiscalMonthlyControl.findFirst({ where });
      if (!winner) throw error;
      return { control: serialize(winner), created: false };
    }

    await this.audit.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      permission: input.permission ?? null,
      action: exceptional ? "Abertura excepcional" : "Cadastro",
      referring: REFERRING,
      referringId: created.id,
      changes: { competence: input.competence, client_id: client.id, reason },
    });
    return { control: serialize(created), created: true };
  }

  /**
   * Mudança explícita de situação e/ou movimento. Reabrir concluído exige nível 3 e motivo.
   * Concluir com documento pendente (ou sem registro) na Triagem é conclusão excepcional:
   * nível 3 e justificativa. A Triagem não é alterada.
   */
  async update(input: UpdateMonthlyControlInput): Promise<MonthlyControlDto> {
    const current = await this.prisma.fiscalMonthlyControl.findFirst({
      where: { id: input.id, organization_id: input.organizationId },
    });
    if (!current) throw new ServiceError(404, "Controle fiscal não encontrado.");

    const reason = input.reason ?? null;
    const events: EventInput[] = [];
    const data: { status?: string; no_movement?: boolean } = {};
    let triage: TriageDocumentsView | null = null;

    if (input.status !== undefined && input.status !== current.status) {
      const reopening = current.status === "COMPLETED";
      const completing = input.status === "COMPLETED";
      if (completing) {
        triage = await this.triageFor(current, input.organizationId);
      }
      const exceptional = triage !== null && hasTriagePendency(triage);
      if (exceptional && Number(input.permission ?? 0) < FISCAL_ADMIN_PERMISSION) {
        throw new ServiceError(
          403,
          "Há documentos pendentes na Triagem: concluir exige Fiscal nível 3 e justificativa.",
        );
      }
      if (exceptional && !reason) {
        throw new ServiceError(400, "Informe a justificativa da conclusão com pendência.");
      }
      if (reopening && Number(input.permission ?? 0) < FISCAL_ADMIN_PERMISSION) {
        throw new ServiceError(403, "Reabrir controle concluído exige Fiscal nível 3.");
      }
      if (reopening && !reason) {
        throw new ServiceError(400, "Informe o motivo da reabertura.");
      }
      data.status = input.status;
      events.push({
        action: reopening ? "REOPENED" : exceptional ? "EXCEPTIONAL_COMPLETION" : "STATUS",
        from_value: current.status,
        to_value: input.status,
        reason,
      });
    }
    if (input.no_movement !== undefined && input.no_movement !== current.no_movement) {
      if (current.status === "COMPLETED" && data.status === undefined) {
        throw new ServiceError(409, "Controle concluído: reabra antes de alterar o movimento.");
      }
      data.no_movement = input.no_movement;
      events.push({
        action: "NO_MOVEMENT",
        from_value: String(current.no_movement),
        to_value: String(input.no_movement),
        reason,
      });
    }
    if (!events.length) return serialize(current);

    await this.prisma.$transaction(async (tx) => {
      // Só grava se ninguém mudou o controle desde a leitura; senão a trilha mentiria.
      const { count } = await tx.fiscalMonthlyControl.updateMany({
        where: {
          id: current.id,
          organization_id: input.organizationId,
          status: current.status,
          no_movement: current.no_movement,
        },
        data: { ...data, updated_by: input.userId },
      });
      if (count === 0) {
        throw new ServiceError(
          409,
          "O controle foi alterado por outra pessoa. Recarregue a lista.",
        );
      }
      await this.recordEvents(tx, input.organizationId, input.userId, current.id, events);
    });

    const updated = await this.prisma.fiscalMonthlyControl.findFirst({
      where: { id: current.id, organization_id: input.organizationId },
    });
    if (!updated) throw new ServiceError(404, "Controle fiscal não encontrado.");

    await this.audit.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      permission: input.permission ?? null,
      action: events.some((event) => event.action === "REOPENED")
        ? "Reabertura"
        : events.some((event) => event.action === "EXCEPTIONAL_COMPLETION")
          ? "Conclusão excepcional"
          : "Atualização",
      referring: REFERRING,
      referringId: current.id,
      changes: {
        ...Object.fromEntries(
          events.map((event) => [event.action, { from: event.from_value, to: event.to_value }]),
        ),
        // Estado da Triagem lido na conclusão, para a autorização ficar explicável depois.
        ...(triage ? { triage: { source: triage.source, pending: triage.pending } } : {}),
      },
    });
    return serialize(updated);
  }
}
