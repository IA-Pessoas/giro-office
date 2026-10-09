import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateLogParams } from "../integrations/audit.js";
import {
  FISCAL_ANNUAL_CATALOG,
  type FiscalAnnualDeclarationCode,
  findAnnualDeclaration,
} from "./fiscalAnnualCatalog.js";
import {
  FISCAL_OBLIGATION_ORIGIN,
  type FiscalObligationDefinition,
  isObligationAllowed,
  suggestedFrom,
} from "./fiscalObligationCatalog.js";
import { loadDefaultResponsibles, loadUserNames } from "./fiscalResponsibles.js";
import {
  dateKey,
  type ObligationItemEvent,
  type ObligationItemInput,
  type ObligationItemStatus,
  obligationItemStatus,
  planObligationItemChange,
} from "./obligationItem.js";

export type AnnualControlPrisma = Pick<
  PrismaClient,
  | "client"
  | "triageResponsible"
  | "user"
  | "fiscalAnnualControl"
  | "fiscalAnnualControlItem"
  | "fiscalAnnualControlEvent"
  | "$transaction"
>;

type AnnualTx = Pick<
  PrismaClient,
  "fiscalAnnualControl" | "fiscalAnnualControlItem" | "fiscalAnnualControlEvent"
>;

const REFERRING = "fiscal.annual_controls";

interface Actor {
  organizationId: string;
  userId: string;
  permission?: number;
}

export interface AnnualDeclarationDto {
  code: FiscalAnnualDeclarationCode;
  name: string;
  note: string;
  source: string;
  origin: string;
  status: ObligationItemStatus;
  not_applicable_reason: string | null;
  completed_on: string | null;
  completed_by: string | null;
  protocol: string | null;
  updatedAt: string;
}

export interface AnnualDeclarationCatalogItem {
  code: FiscalAnnualDeclarationCode;
  name: string;
  note: string;
  source: string;
  conditional: boolean;
}

/** Sem situação geral: o andamento anual é o de cada declaração. */
export interface AnnualControlListItem {
  id: string;
  client_id: string;
  client_name: string;
  year: number;
  regime: string | null;
  responsible_id: string | null;
  responsible_name: string | null;
  declarations: Array<{ code: string; status: ObligationItemStatus; completed_on: string | null }>;
}

type StoredItem = {
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
      action: "CREATED" | "OBLIGATION_SUGGESTED" | "OBLIGATION_ADDED";
      from_value: string | null;
      to_value: string | null;
      reason: string | null;
    };

function catalogOrder(code: string): number {
  return FISCAL_ANNUAL_CATALOG.findIndex((entry) => entry.code === code);
}

function catalogItem(
  definition: FiscalObligationDefinition<FiscalAnnualDeclarationCode>,
): AnnualDeclarationCatalogItem {
  return {
    code: definition.code,
    name: definition.name,
    note: definition.note,
    source: definition.source,
    conditional: definition.conditional,
  };
}

function serializeItem(value: StoredItem): AnnualDeclarationDto {
  const definition = findAnnualDeclaration(value.code);
  return {
    code: value.code as FiscalAnnualDeclarationCode,
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

/** Cliente com Fiscal ativo em algum momento do ano (entrada/saída como no mensal). */
function eligibleClientsWhere(organizationId: string, year: number) {
  return {
    organization_id: organizationId,
    fiscal: true,
    AND: [
      {
        OR: [
          { competence_entry: null },
          { competence_entry: { lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)) } },
        ],
      },
      {
        OR: [
          { competence_output: null },
          { competence_output: { gte: new Date(Date.UTC(year, 0, 1)) } },
        ],
      },
    ],
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}

/**
 * Controle fiscal anual: um por organização, cliente e ano-calendário, com DEFIS, DMED,
 * DIMOB e DASN-SIMEI conforme aplicáveis. Regime e responsável ficam registrados ao nascer.
 */
export class AnnualControlService {
  constructor(
    private readonly prisma: AnnualControlPrisma,
    private readonly audit: { createLog(params: CreateLogParams): Promise<void> },
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async writeEvents(
    tx: Pick<PrismaClient, "fiscalAnnualControlEvent">,
    actor: Actor,
    controlId: string,
    code: string | null,
    events: EventInput[],
  ): Promise<void> {
    await tx.fiscalAnnualControlEvent.createMany({
      data: events.map((event) => ({
        organization_id: actor.organizationId,
        control_id: controlId,
        item_code: code,
        ...event,
        actor_id: actor.userId,
      })),
    });
  }

  private async requireControl(controlId: string, organizationId: string) {
    const control = await this.prisma.fiscalAnnualControl.findFirst({
      where: { id: controlId, organization_id: organizationId },
    });
    if (!control) throw new ServiceError(404, "Controle fiscal anual não encontrado.");
    return control;
  }

  private findItem(controlId: string, code: string, organizationId: string) {
    return this.prisma.fiscalAnnualControlItem.findFirst({
      where: { control_id: controlId, code, organization_id: organizationId },
    });
  }

  /** Reconcilia o ano (gera os controles que faltam) e devolve a carteira. */
  async list(
    input: { year: number },
    actor: Actor,
  ): Promise<{ year: number; items: AnnualControlListItem[] }> {
    const { organizationId, userId } = actor;
    const { year } = input;
    // Ano futuro ainda não tem fatos a declarar: só gera até o ano corrente.
    const eligible =
      year <= this.now().getUTCFullYear()
        ? await this.prisma.client.findMany({
            where: eligibleClientsWhere(organizationId, year),
            select: { id: true, regime: true },
          })
        : [];
    const existing = await this.prisma.fiscalAnnualControl.findMany({
      where: { organization_id: organizationId, year },
    });
    const withControl = new Set(existing.map((control) => control.client_id));
    const missing = eligible.filter((client) => !withControl.has(client.id));

    let controls = existing;
    if (missing.length) {
      const defaults = await loadDefaultResponsibles(
        this.prisma,
        organizationId,
        missing.map((client) => client.id),
      );
      await this.prisma.$transaction(async (tx: AnnualTx) => {
        // Listagens concorrentes: o índice único descarta a perdedora.
        const created = await tx.fiscalAnnualControl.createManyAndReturn({
          data: missing.map((client) => ({
            organization_id: organizationId,
            client_id: client.id,
            year,
            regime: client.regime,
            responsible_id: defaults.get(client.id) ?? null,
            created_by: userId,
            updated_by: userId,
          })),
          skipDuplicates: true,
          select: { id: true, regime: true },
        });
        if (!created.length) return;
        const suggested = created.flatMap((control) =>
          suggestedFrom(FISCAL_ANNUAL_CATALOG, control.regime).map((definition) => ({
            organization_id: organizationId,
            control_id: control.id,
            code: definition.code,
            origin: FISCAL_OBLIGATION_ORIGIN.suggested,
          })),
        );
        if (suggested.length) await tx.fiscalAnnualControlItem.createMany({ data: suggested });
        await tx.fiscalAnnualControlEvent.createMany({
          data: [
            ...created.map((control) => ({
              organization_id: organizationId,
              control_id: control.id,
              action: "CREATED",
              item_code: null,
              from_value: null,
              to_value: String(year),
              reason: null,
              actor_id: userId,
            })),
            ...suggested.map((row) => ({
              organization_id: organizationId,
              control_id: row.control_id,
              action: "OBLIGATION_SUGGESTED",
              item_code: row.code,
              from_value: null,
              to_value: "applicable",
              reason: null,
              actor_id: userId,
            })),
          ],
        });
      });
      controls = await this.prisma.fiscalAnnualControl.findMany({
        where: { organization_id: organizationId, year },
      });
    }
    if (!controls.length) return { year, items: [] };

    const ids = controls.map((control) => control.id);
    const [clients, items] = await Promise.all([
      this.prisma.client.findMany({
        where: { organization_id: organizationId, id: { in: controls.map((c) => c.client_id) } },
        select: { id: true, name: true, company_name: true },
      }),
      this.prisma.fiscalAnnualControlItem.findMany({
        where: { organization_id: organizationId, control_id: { in: ids } },
      }),
    ]);
    const names = new Map(
      clients.map((client) => [client.id, client.company_name?.trim() || client.name]),
    );
    const userNames = await loadUserNames(
      this.prisma,
      organizationId,
      controls.flatMap((control) => (control.responsible_id ? [control.responsible_id] : [])),
    );

    return {
      year,
      items: controls
        .map((control) => ({
          id: control.id,
          client_id: control.client_id,
          client_name: names.get(control.client_id) ?? "",
          year: control.year,
          regime: control.regime,
          responsible_id: control.responsible_id,
          responsible_name: control.responsible_id
            ? (userNames.get(control.responsible_id) ?? null)
            : null,
          declarations: items
            .filter((entry) => entry.control_id === control.id)
            .sort((a, b) => catalogOrder(a.code) - catalogOrder(b.code))
            .map((entry) => ({
              code: entry.code,
              status: obligationItemStatus(entry),
              completed_on: dateKey(entry.completed_on),
            })),
        }))
        .sort((a, b) =>
          a.client_name.localeCompare(b.client_name, "pt-BR", { sensitivity: "base" }),
        ),
    };
  }

  /** Declarações do controle (só leitura) e as que ainda podem ser incluídas. */
  async items(
    controlId: string,
    actor: Actor,
  ): Promise<{
    control_id: string;
    items: AnnualDeclarationDto[];
    addable: AnnualDeclarationCatalogItem[];
  }> {
    const control = await this.requireControl(controlId, actor.organizationId);
    const stored = await this.prisma.fiscalAnnualControlItem.findMany({
      where: { control_id: control.id, organization_id: actor.organizationId },
    });
    const items = stored
      .map(serializeItem)
      .sort((a, b) => catalogOrder(a.code) - catalogOrder(b.code));
    const present = new Set(items.map((entry) => entry.code));
    const addable = FISCAL_ANNUAL_CATALOG.filter(
      (entry) => !present.has(entry.code) && isObligationAllowed(entry, control.regime),
    ).map(catalogItem);
    return { control_id: control.id, items, addable };
  }

  /** Inclui declaração do catálogo; condicional só com motivo. */
  async addItem(
    controlId: string,
    input: { code: FiscalAnnualDeclarationCode; reason?: string },
    actor: Actor,
  ): Promise<AnnualDeclarationDto> {
    const control = await this.requireControl(controlId, actor.organizationId);
    const definition = findAnnualDeclaration(input.code);
    if (!definition) throw new ServiceError(400, "Declaração fora do catálogo.");
    if (!isObligationAllowed(definition, control.regime)) {
      throw new ServiceError(400, `${definition.name} não se aplica ao regime ${control.regime}.`);
    }
    const reason = input.reason ?? null;
    if (definition.conditional && !reason) {
      throw new ServiceError(400, `${definition.name} é condicional: informe por que se aplica.`);
    }
    const duplicate = new ServiceError(409, `${definition.name} já está neste controle.`);
    if (await this.findItem(control.id, input.code, actor.organizationId)) throw duplicate;

    let created: StoredItem;
    try {
      created = await this.prisma.$transaction(async (tx: AnnualTx) => {
        const row = await tx.fiscalAnnualControlItem.create({
          data: {
            organization_id: actor.organizationId,
            control_id: control.id,
            code: input.code,
            origin: FISCAL_OBLIGATION_ORIGIN.manual,
          },
        });
        await this.writeEvents(tx, actor, control.id, input.code, [
          { action: "OBLIGATION_ADDED", from_value: null, to_value: "applicable", reason },
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
      action: "Inclusão de declaração anual",
      referring: REFERRING,
      referringId: control.id,
      changes: { code: input.code, reason },
    });
    return serializeItem(created);
  }

  /** Aplicabilidade e cumprimento da declaração, com as mesmas regras do mensal. */
  async updateItem(
    controlId: string,
    code: FiscalAnnualDeclarationCode,
    input: ObligationItemInput,
    actor: Actor,
  ): Promise<AnnualDeclarationDto> {
    const control = await this.requireControl(controlId, actor.organizationId);
    const current = await this.findItem(control.id, code, actor.organizationId);
    if (!current) throw new ServiceError(404, "Declaração não está neste controle.");

    const { data, events } = planObligationItemChange(
      current,
      input,
      actor.userId,
      this.now().toISOString().slice(0, 10),
    );
    if (!events.length) return serializeItem(current);

    await this.prisma.$transaction(async (tx: AnnualTx) => {
      // Só grava se ninguém mudou a declaração desde a leitura.
      const { count } = await tx.fiscalAnnualControlItem.updateMany({
        where: {
          id: current.id,
          organization_id: actor.organizationId,
          applicable: current.applicable,
          completed_on: current.completed_on,
        },
        data,
      });
      if (count === 0) {
        throw new ServiceError(409, "A declaração foi alterada por outra pessoa. Recarregue.");
      }
      await this.writeEvents(tx, actor, control.id, code, events);
    });

    const updated = await this.findItem(control.id, code, actor.organizationId);
    if (!updated) throw new ServiceError(404, "Declaração não está neste controle.");
    await this.audit.createLog({
      userId: actor.userId,
      organizationId: actor.organizationId,
      permission: actor.permission ?? null,
      action: "Atualização de declaração anual",
      referring: REFERRING,
      referringId: control.id,
      changes: Object.fromEntries(
        events.map((event) => [event.action, { code, from: event.from_value, to: event.to_value }]),
      ),
    });
    return serializeItem(updated);
  }
}
