import { INTERNAL_ERROR_MESSAGE, error as logError, ServiceError } from "@workspace/shared";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { AUDITED_TRANSACTION, changedFields, type MarketingAudit } from "../integrations/audit.js";
import type { MarketingEvent } from "../routes/marketingEvents.routes.js";
import {
  MARKETING_EVENT_PRIORITIES,
  MARKETING_EVENT_STATUSES,
  type MarketingEventPriority,
  type MarketingEventStatus,
} from "../schemas/marketingEvent.schemas.js";
import type {
  MarketingEventEditionFeedbackInput,
  MarketingEventEditionInput,
} from "../schemas/marketingEventEdition.schemas.js";

const editionInclude: Prisma.MarketingEventEditionInclude = {
  budgetItems: { orderBy: [{ position: "asc" }, { id: "asc" }] },
  feedback: true,
};
const reportInclude: Prisma.MarketingEventEditionInclude = { ...editionInclude, event: true };

type EditionRecord = Prisma.MarketingEventEditionGetPayload<{ include: typeof editionInclude }>;
type EditionReportRecord = Prisma.MarketingEventEditionGetPayload<{
  include: typeof reportInclude;
}>;
const eventStatuses = new Set<string>(MARKETING_EVENT_STATUSES);
const eventPriorities = new Set<string>(MARKETING_EVENT_PRIORITIES);

export interface MarketingEventEditionBudgetItem {
  id: string;
  name: string;
  amount: string;
  position: number;
}

export interface MarketingEventEditionFeedback {
  rating: number;
  observation: string | null;
  evaluatedAt: string;
}

export interface MarketingEventEdition {
  id: string;
  eventId: string;
  name: string;
  date: string;
  place: string;
  budgetItems: MarketingEventEditionBudgetItem[];
  budgetTotal: string;
  partnerships: string[];
  organizingTeam: string[];
  logistics: MarketingEventEditionInput["logistics"];
  marketingCommunication: MarketingEventEditionInput["marketingCommunication"];
  duringEvent: MarketingEventEditionInput["duringEvent"];
  afterEvent: MarketingEventEditionInput["afterEvent"];
  notes: string;
  feedbackPeriodStart: string | null;
  feedbackPeriodEnd: string | null;
  feedback: MarketingEventEditionFeedback | null;
}

export interface MarketingEventEditionReport {
  event: MarketingEvent;
  edition: MarketingEventEdition;
}

function toCents(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function fromCents(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

function mapEdition(record: EditionRecord): MarketingEventEdition {
  return {
    id: record.id,
    eventId: record.event_id,
    name: record.name,
    date: record.date.toISOString().slice(0, 10),
    place: record.place,
    budgetItems: record.budgetItems.map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount.toString(),
      position: item.position,
    })),
    budgetTotal: fromCents(
      record.budgetItems.reduce((total, item) => total + toCents(item.amount.toString()), 0n),
    ),
    partnerships: record.partnerships as string[],
    organizingTeam: record.organizing_team as string[],
    logistics: record.logistics as MarketingEventEditionInput["logistics"],
    marketingCommunication:
      record.marketing_communication as MarketingEventEditionInput["marketingCommunication"],
    duringEvent: record.during_event as MarketingEventEditionInput["duringEvent"],
    afterEvent: record.after_event as MarketingEventEditionInput["afterEvent"],
    notes: record.notes,
    feedbackPeriodStart: record.feedback_period_start?.toISOString() ?? null,
    feedbackPeriodEnd: record.feedback_period_end?.toISOString() ?? null,
    feedback: record.feedback
      ? {
          rating: record.feedback.rating,
          observation: record.feedback.observation,
          evaluatedAt: record.feedback.evaluated_at.toISOString(),
        }
      : null,
  };
}

function mapReportEvent(event: EditionReportRecord["event"]): MarketingEvent {
  if (!eventStatuses.has(event.status) || !eventPriorities.has(event.priority)) {
    throw new ServiceError(500, "O evento salvo contém status ou prioridade inválidos.");
  }
  return {
    id: event.id,
    name: event.name,
    logo: event.logo,
    status: event.status as MarketingEventStatus,
    priority: event.priority as MarketingEventPriority,
    objective: event.objective,
    audience: event.audience,
  };
}

function editionData(input: MarketingEventEditionInput) {
  return {
    name: input.name,
    date: new Date(`${input.date}T00:00:00.000Z`),
    place: input.place,
    partnerships: input.partnerships,
    organizing_team: input.organizingTeam,
    logistics: input.logistics,
    marketing_communication: input.marketingCommunication,
    during_event: input.duringEvent,
    after_event: input.afterEvent,
    notes: input.notes,
    feedback_period_start: input.feedbackPeriodStart ? new Date(input.feedbackPeriodStart) : null,
    feedback_period_end: input.feedbackPeriodEnd ? new Date(input.feedbackPeriodEnd) : null,
  };
}

function budgetCreateData(items: MarketingEventEditionInput["budgetItems"]) {
  return items.map((item, position) => ({
    name: item.name,
    amount: item.amount,
    position,
  }));
}

const EDITION_REFERRING = "marketing.eventEditions";
const FEEDBACK_REFERRING = "marketing.eventEditionFeedback";

/** Campos da edição que entram na trilha: planejamento, orçamento e período de avaliação. */
function auditedEdition(edition: MarketingEventEdition): Record<string, unknown> {
  const { id: _id, eventId, budgetTotal: _total, feedback: _feedback, ...fields } = edition;
  return {
    eventId,
    ...fields,
    budgetItems: edition.budgetItems.map(({ name, amount }) => ({ name, amount })),
  };
}

export class MarketingEventEditionsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: MarketingAudit,
  ) {}

  async listEditions(organizationId: string, eventId: string): Promise<MarketingEventEdition[]> {
    const records = await this.prisma.marketingEventEdition.findMany({
      where: { organization_id: organizationId, event_id: eventId },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      include: editionInclude,
    });
    return records.map(mapEdition);
  }

  async createEdition(
    organizationId: string,
    eventId: string,
    input: MarketingEventEditionInput,
    actorUserId: string,
  ): Promise<MarketingEventEdition> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const edition = mapEdition(
          await tx.marketingEventEdition.create({
            data: {
              ...editionData(input),
              event: {
                connect: { id_organization_id: { id: eventId, organization_id: organizationId } },
              },
              budgetItems: { create: budgetCreateData(input.budgetItems) },
            },
            include: editionInclude,
          }),
        );
        await this.audit({
          organizationId,
          userId: actorUserId,
          action: "Cadastro",
          referring: EDITION_REFERRING,
          referringId: edition.id,
          changes: changedFields({}, auditedEdition(edition)),
        });
        return edition;
      }, AUDITED_TRANSACTION);
    } catch (error) {
      logError("Falha ao criar edição do evento.", { err: error });
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2025"
      ) {
        throw new ServiceError(404, "Evento não encontrado.", error);
      }
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(500, INTERNAL_ERROR_MESSAGE, error);
    }
  }

  async updateEdition(
    organizationId: string,
    eventId: string,
    editionId: string,
    input: MarketingEventEditionInput,
    actorUserId: string,
  ): Promise<MarketingEventEdition | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.marketingEventEdition.findFirst({
          where: { id: editionId, organization_id: organizationId, event_id: eventId },
          include: editionInclude,
        });
        if (!current) return null;
        const record = await tx.marketingEventEdition.update({
          where: { id_organization_id: { id: editionId, organization_id: organizationId } },
          data: {
            ...editionData(input),
            budgetItems: {
              deleteMany: {},
              create: budgetCreateData(input.budgetItems),
            },
          },
          include: editionInclude,
        });
        const edition = mapEdition(record);
        const changes = changedFields(auditedEdition(mapEdition(current)), auditedEdition(edition));
        if (Object.keys(changes).length > 0) {
          await this.audit({
            organizationId,
            userId: actorUserId,
            action: "Edição",
            referring: EDITION_REFERRING,
            referringId: editionId,
            changes,
          });
        }
        return edition;
      }, AUDITED_TRANSACTION);
    } catch (error) {
      // Apagada entre a leitura e a escrita: mesmo 404 da edição inexistente.
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2025"
      ) {
        return null;
      }
      throw error;
    }
  }

  async createEditionFeedback(
    organizationId: string,
    eventId: string,
    editionId: string,
    input: MarketingEventEditionFeedbackInput,
    actorUserId: string,
  ): Promise<MarketingEventEditionFeedback> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const edition = await tx.marketingEventEdition.findFirst({
          where: { id: editionId, organization_id: organizationId, event_id: eventId },
          select: { id: true },
        });
        if (!edition) throw new ServiceError(404, "Edição não encontrada.");

        const feedback = await tx.marketingEventEditionFeedback.create({
          data: {
            organization_id: organizationId,
            edition_id: edition.id,
            rating: input.rating,
            observation: input.observation?.trim() || null,
            evaluated_at: new Date(),
          },
        });
        const result = {
          rating: feedback.rating,
          observation: feedback.observation,
          evaluatedAt: feedback.evaluated_at.toISOString(),
        };
        await this.audit({
          organizationId,
          userId: actorUserId,
          action: "Avaliação",
          referring: FEEDBACK_REFERRING,
          referringId: edition.id,
          changes: changedFields({}, { rating: result.rating, observation: result.observation }),
        });
        return result;
      }, AUDITED_TRANSACTION);
    } catch (error) {
      logError("Falha ao registrar avaliação da edição.", { err: error });
      if (error instanceof ServiceError) throw error;
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new ServiceError(409, "Esta edição já possui uma avaliação.", error);
      }
      throw new ServiceError(500, INTERNAL_ERROR_MESSAGE, error);
    }
  }

  async getEditionReport(
    organizationId: string,
    eventId: string,
    editionId: string,
  ): Promise<MarketingEventEditionReport | null> {
    const record = await this.prisma.marketingEventEdition.findFirst({
      where: { id: editionId, organization_id: organizationId, event_id: eventId },
      include: reportInclude,
    });
    if (!record) return null;
    return {
      event: mapReportEvent(record.event),
      edition: mapEdition(record),
    };
  }
}
