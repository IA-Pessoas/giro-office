import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateLogParams } from "../integrations/audit.js";
import {
  FISCAL_OBLIGATION_CATALOG,
  FISCAL_OBLIGATION_ORIGIN,
  type FiscalObligationCode,
  type FiscalObligationDefinition,
  findObligation,
  isObligationAllowed,
  suggestedObligations,
} from "./fiscalObligationCatalog.js";
import {
  dateKey,
  ITEM_APPLICABILITY,
  OBLIGATION_ITEM_ACTION,
  type ObligationItemEvent,
  type ObligationItemInput,
  type ObligationItemStatus,
  obligationItemStatus,
  planObligationItemChange,
} from "./obligationItem.js";

export type MonthlyObligationPrisma = Pick<
  PrismaClient,
  | "fiscalMonthlyControl"
  | "fiscalMonthlyControlObligation"
  | "fiscalMonthlyControlEvent"
  | "$transaction"
>;

const REFERRING = "fiscal.monthly_control_obligations";
const COMPLETED_CONTROL_MESSAGE = "Controle concluído: reabra antes de alterar as obrigações.";

interface Actor {
  organizationId: string;
  userId: string;
  permission?: number;
}

export type UpdateMonthlyObligationInput = ObligationItemInput;

export type MonthlyObligationStatus = ObligationItemStatus;

export interface MonthlyObligationDto {
  code: FiscalObligationCode;
  name: string;
  note: string;
  source: string;
  origin: string;
  status: MonthlyObligationStatus;
  not_applicable_reason: string | null;
  completed_on: string | null;
  completed_by: string | null;
  protocol: string | null;
  updatedAt: string;
}

export interface MonthlyObligationCatalogItem {
  code: FiscalObligationCode;
  name: string;
  note: string;
  source: string;
  conditional: boolean;
}

type StoredObligation = {
  id: string;
  code: string;
  origin: string;
  applicable: boolean;
  not_applicable_reason: string | null;
  completed_on: Date | null;
  completed_by: string | null;
  protocol: string | null;
  updatedAt: Date;
};

type EventInput =
  | ObligationItemEvent
  | {
      action: (typeof OBLIGATION_ITEM_ACTION)["suggested" | "added"];
      from_value: string | null;
      to_value: string | null;
      reason: string | null;
    };

function catalogItem(definition: FiscalObligationDefinition): MonthlyObligationCatalogItem {
  return {
    code: definition.code,
    name: definition.name,
    note: definition.note,
    source: definition.source,
    conditional: definition.conditional,
  };
}

function serialize(value: StoredObligation): MonthlyObligationDto {
  const definition = findObligation(value.code);
  return {
    code: value.code as FiscalObligationCode,
    name: definition?.name ?? value.code,
    note: definition?.note ?? "",
    source: definition?.source ?? "",
    origin: value.origin,
    status: obligationItemStatus(value),
    not_applicable_reason: value.not_applicable_reason,
    completed_on: dateKey(value.completed_on),
    completed_by: value.completed_by,
    protocol: value.protocol,
    updatedAt: value.updatedAt.toISOString(),
  };
}

function catalogOrder(code: string): number {
  return FISCAL_OBLIGATION_CATALOG.findIndex((item) => item.code === code);
}

/**
 * Sugestões do catálogo para controles recém-criados, pelo regime registrado neles, com o
 * evento de cada uma. Só roda ao nascer o controle: ampliar o catálogo não muda competências
 * já abertas nem concluídas.
 */
export async function createSuggestedObligations(
  tx: Pick<PrismaClient, "fiscalMonthlyControlObligation" | "fiscalMonthlyControlEvent">,
  organizationId: string,
  actorId: string,
  controls: Array<{ id: string; regime: string | null }>,
): Promise<void> {
  const data = controls.flatMap((control) =>
    suggestedObligations(control.regime).map((obligation) => ({
      organization_id: organizationId,
      control_id: control.id,
      code: obligation.code,
      origin: FISCAL_OBLIGATION_ORIGIN.suggested,
    })),
  );
  if (!data.length) return;
  await tx.fiscalMonthlyControlObligation.createMany({ data });
  await tx.fiscalMonthlyControlEvent.createMany({
    data: data.map((row) => ({
      organization_id: organizationId,
      control_id: row.control_id,
      obligation_code: row.code,
      action: OBLIGATION_ITEM_ACTION.suggested,
      from_value: null,
      to_value: ITEM_APPLICABILITY.applicable,
      reason: null,
      actor_id: actorId,
    })),
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}

/**
 * Obrigações de um controle mensal. Cumprir ou dispensar uma obrigação nunca muda a
 * situação do controle; cada mudança grava a trilha na mesma transação.
 */
export class MonthlyObligationService {
  constructor(
    private readonly prisma: MonthlyObligationPrisma,
    private readonly audit: { createLog(params: CreateLogParams): Promise<void> },
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async requireControl(controlId: string, organizationId: string) {
    const control = await this.prisma.fiscalMonthlyControl.findFirst({
      where: { id: controlId, organization_id: organizationId },
      select: { id: true, status: true, regime: true },
    });
    if (!control) throw new ServiceError(404, "Controle fiscal não encontrado.");
    return control;
  }

  private async requireOpenControl(controlId: string, organizationId: string) {
    const control = await this.requireControl(controlId, organizationId);
    if (control.status === "COMPLETED") throw new ServiceError(409, COMPLETED_CONTROL_MESSAGE);
    return control;
  }

  private async findObligation(controlId: string, code: string, organizationId: string) {
    return this.prisma.fiscalMonthlyControlObligation.findFirst({
      where: { control_id: controlId, code, organization_id: organizationId },
    });
  }

  private async writeEvents(
    tx: Pick<PrismaClient, "fiscalMonthlyControlEvent">,
    actor: Actor,
    controlId: string,
    code: string,
    events: EventInput[],
  ): Promise<void> {
    await tx.fiscalMonthlyControlEvent.createMany({
      data: events.map((event) => ({
        organization_id: actor.organizationId,
        control_id: controlId,
        obligation_code: code,
        ...event,
        actor_id: actor.userId,
      })),
    });
  }

  /** Lista as obrigações do controle (só leitura) e as que ainda podem ser incluídas. */
  async list(
    controlId: string,
    actor: Actor,
  ): Promise<{
    control_id: string;
    items: MonthlyObligationDto[];
    addable: MonthlyObligationCatalogItem[];
  }> {
    const control = await this.requireControl(controlId, actor.organizationId);
    const stored = await this.prisma.fiscalMonthlyControlObligation.findMany({
      where: { control_id: control.id, organization_id: actor.organizationId },
    });
    const items = stored.map(serialize).sort((a, b) => catalogOrder(a.code) - catalogOrder(b.code));
    const present = new Set(items.map((item) => item.code));
    const addable = FISCAL_OBLIGATION_CATALOG.filter(
      (item) => !present.has(item.code) && isObligationAllowed(item, control.regime),
    ).map(catalogItem);
    return { control_id: control.id, items, addable };
  }

  /** Inclui obrigação do catálogo; condicional (ex.: DIRBI) só com motivo. */
  async add(
    controlId: string,
    input: { code: FiscalObligationCode; reason?: string },
    actor: Actor,
  ): Promise<MonthlyObligationDto> {
    const control = await this.requireOpenControl(controlId, actor.organizationId);
    const definition = findObligation(input.code);
    if (!definition) throw new ServiceError(400, "Obrigação fora do catálogo.");
    if (!isObligationAllowed(definition, control.regime)) {
      throw new ServiceError(400, `${definition.name} não se aplica ao regime ${control.regime}.`);
    }
    const reason = input.reason ?? null;
    if (definition.conditional && !reason) {
      throw new ServiceError(400, `${definition.name} é condicional: informe por que se aplica.`);
    }
    const duplicate = new ServiceError(409, `${definition.name} já está neste controle.`);
    if (await this.findObligation(control.id, input.code, actor.organizationId)) throw duplicate;

    let created: StoredObligation;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.fiscalMonthlyControlObligation.create({
          data: {
            organization_id: actor.organizationId,
            control_id: control.id,
            code: input.code,
            origin: FISCAL_OBLIGATION_ORIGIN.manual,
          },
        });
        await this.writeEvents(tx, actor, control.id, input.code, [
          {
            action: OBLIGATION_ITEM_ACTION.added,
            from_value: null,
            to_value: ITEM_APPLICABILITY.applicable,
            reason,
          },
        ]);
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate;
      throw error;
    }

    await this.audit.createLog({
      userId: actor.userId,
      organizationId: actor.organizationId,
      permission: actor.permission ?? null,
      action: "Inclusão de obrigação",
      referring: REFERRING,
      referringId: control.id,
      changes: { code: input.code, reason },
    });
    return serialize(created);
  }

  /** Aplicabilidade (não aplicável exige motivo) e cumprimento (data e ator). */
  async update(
    controlId: string,
    code: FiscalObligationCode,
    input: UpdateMonthlyObligationInput,
    actor: Actor,
  ): Promise<MonthlyObligationDto> {
    const control = await this.requireOpenControl(controlId, actor.organizationId);
    const current = await this.findObligation(control.id, code, actor.organizationId);
    if (!current) throw new ServiceError(404, "Obrigação não está neste controle.");

    const { data, events } = planObligationItemChange(
      current,
      input,
      actor.userId,
      this.now().toISOString().slice(0, 10),
    );
    if (!events.length) return serialize(current);

    await this.prisma.$transaction(async (tx) => {
      // Só grava se ninguém mudou a obrigação desde a leitura; senão a trilha mentiria.
      const { count } = await tx.fiscalMonthlyControlObligation.updateMany({
        where: {
          id: current.id,
          organization_id: actor.organizationId,
          applicable: current.applicable,
          completed_on: current.completed_on,
        },
        data,
      });
      if (count === 0) {
        throw new ServiceError(409, "A obrigação foi alterada por outra pessoa. Recarregue.");
      }
      await this.writeEvents(tx, actor, control.id, code, events);
    });

    const updated = await this.findObligation(control.id, code, actor.organizationId);
    if (!updated) throw new ServiceError(404, "Obrigação não está neste controle.");
    await this.audit.createLog({
      userId: actor.userId,
      organizationId: actor.organizationId,
      permission: actor.permission ?? null,
      action: "Atualização de obrigação",
      referring: REFERRING,
      referringId: control.id,
      changes: Object.fromEntries(
        events.map((event) => [event.action, { code, from: event.from_value, to: event.to_value }]),
      ),
    });
    return serialize(updated);
  }
}
