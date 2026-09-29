import { error as logError, ServiceError } from "@workspace/shared";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
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
type MarketingEventEdition = ReturnType<typeof mapEdition>;

function toCents(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function fromCents(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

function mapEdition(record: EditionRecord) {
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
    partnerships: record.partnerships,
    organizingTeam: record.organizing_team,
    logistics: record.logistics,
    marketingCommunication: record.marketing_communication,
    duringEvent: record.during_event,
    afterEvent: record.after_event,
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

export class MarketingEventEditionsService {
  constructor(private readonly prisma: PrismaClient) {}

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
  ): Promise<MarketingEventEdition> {
    try {
      const record = await this.prisma.marketingEventEdition.create({
        data: {
          ...editionData(input),
          event: {
            connect: { id_organization_id: { id: eventId, organization_id: organizationId } },
          },
          budgetItems: { create: budgetCreateData(input.budgetItems) },
        },
        include: editionInclude,
      });
      return mapEdition(record);
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
      throw error;
    }
  }

  async updateEdition(
    organizationId: string,
    eventId: string,
    editionId: string,
    input: MarketingEventEditionInput,
  ): Promise<MarketingEventEdition | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.marketingEventEdition.findFirst({
        where: { id: editionId, organization_id: organizationId, event_id: eventId },
        select: { id: true },
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
      return mapEdition(record);
    });
  }

  async createEditionFeedback(
    organizationId: string,
    eventId: string,
    editionId: string,
    input: MarketingEventEditionFeedbackInput,
  ): Promise<{ rating: number; observation: string | null; evaluatedAt: string }> {
    try {
      const edition = await this.prisma.marketingEventEdition.findFirst({
        where: { id: editionId, organization_id: organizationId, event_id: eventId },
        select: { id: true },
      });
      if (!edition) throw new ServiceError(404, "Edição não encontrada.");

      const feedback = await this.prisma.marketingEventEditionFeedback.create({
        data: {
          organization_id: organizationId,
          edition_id: edition.id,
          rating: input.rating,
          observation: input.observation?.trim() || null,
          evaluated_at: new Date(),
        },
      });
      return {
        rating: feedback.rating,
        observation: feedback.observation,
        evaluatedAt: feedback.evaluated_at.toISOString(),
      };
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
      throw error;
    }
  }

  async getEditionReport(
    organizationId: string,
    eventId: string,
    editionId: string,
  ): Promise<{ event: Record<string, unknown>; edition: MarketingEventEdition } | null> {
    const record = await this.prisma.marketingEventEdition.findFirst({
      where: { id: editionId, organization_id: organizationId, event_id: eventId },
      include: reportInclude,
    });
    if (!record) return null;
    return {
      event: {
        id: record.event.id,
        name: record.event.name,
        logo: record.event.logo,
        status: record.event.status,
        priority: record.event.priority,
        objective: record.event.objective,
        audience: record.event.audience,
      },
      edition: mapEdition(record),
    };
  }
}
