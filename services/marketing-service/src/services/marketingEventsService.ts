import { error as logError, ServiceError } from "@workspace/shared";
import type { PrismaClient } from "../generated/prisma/client.js";
import { changedFields, type MarketingAudit } from "../integrations/audit.js";
import type { MarketingEvent, MarketingEventsProvider } from "../routes/marketingEvents.routes.js";
import type {
  CreateMarketingEventInput,
  MarketingEventPriority,
  MarketingEventStatus,
  UpdateMarketingEventInput,
} from "../schemas/marketingEvent.schemas.js";
import {
  DEFAULT_MARKETING_EVENT_STATUS,
  MARKETING_EVENT_PRIORITIES,
  MARKETING_EVENT_STATUSES,
} from "../schemas/marketingEvent.schemas.js";

const marketingEventSelect = {
  id: true,
  name: true,
  logo: true,
  status: true,
  priority: true,
  objective: true,
  audience: true,
} as const;

const eventStatuses = new Set<string>(MARKETING_EVENT_STATUSES);
const eventPriorities = new Set<string>(MARKETING_EVENT_PRIORITIES);

type MarketingEventRecord = {
  id: string;
  name: string;
  logo: string;
  status: string;
  priority: string;
  objective: string;
  audience: string;
};

function mapMarketingEvent(record: MarketingEventRecord): MarketingEvent {
  if (!eventStatuses.has(record.status) || !eventPriorities.has(record.priority)) {
    throw new ServiceError(500, "O evento salvo contém status ou prioridade inválidos.");
  }
  return {
    ...record,
    status: record.status as MarketingEventStatus,
    priority: record.priority as MarketingEventPriority,
  };
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function nameKey(name: string): string {
  return name
    .replace(/ +$/u, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\u{10000}-\u{10ffff}]/gu, "\uFFFD")
    .toLowerCase()
    .replace(/ß/g, "s");
}

function duplicateNameError(error: unknown): never {
  if (hasPrismaCode(error, "P2002")) {
    throw new ServiceError(409, "Já existe um evento com esse nome nesta organização.", error);
  }
  throw error;
}

const EVENT_REFERRING = "marketing.events";

export class MarketingEventsService implements MarketingEventsProvider {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: MarketingAudit,
  ) {}

  async listEvents(organizationId: string): Promise<MarketingEvent[]> {
    const records = await this.prisma.marketingEvent.findMany({
      where: { organization_id: organizationId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: marketingEventSelect,
    });
    return records.map(mapMarketingEvent);
  }

  async createEvent(
    organizationId: string,
    input: CreateMarketingEventInput,
    actorUserId: string,
  ): Promise<MarketingEvent> {
    const name = input.name;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const event = mapMarketingEvent(
          await tx.marketingEvent.create({
            data: {
              organization_id: organizationId,
              name,
              name_key: nameKey(name),
              logo: input.logo,
              status: DEFAULT_MARKETING_EVENT_STATUS,
              priority: input.priority,
              objective: input.objective,
              audience: input.audience,
            },
            select: marketingEventSelect,
          }),
        );
        const { id, ...created } = event;
        await this.audit({
          organizationId,
          userId: actorUserId,
          action: "Cadastro",
          referring: EVENT_REFERRING,
          referringId: id,
          changes: changedFields({}, created),
        });
        return event;
      });
    } catch (error: unknown) {
      logError("Falha ao criar evento de Marketing.", { err: error });
      return duplicateNameError(error);
    }
  }

  async updateEvent(
    organizationId: string,
    eventId: string,
    input: UpdateMarketingEventInput,
    actorUserId: string,
  ): Promise<MarketingEvent | null> {
    const data = {
      ...input,
      ...(input.name === undefined ? {} : { name: input.name, name_key: nameKey(input.name) }),
    };

    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await tx.marketingEvent.findFirst({
          where: { id: eventId, organization_id: organizationId },
          select: marketingEventSelect,
        });
        if (!before) return null;
        const event = mapMarketingEvent(
          await tx.marketingEvent.update({
            where: { id: eventId, organization_id: organizationId },
            data,
            select: marketingEventSelect,
          }),
        );
        const changes = changedFields(before, event);
        if (Object.keys(changes).length > 0) {
          await this.audit({
            organizationId,
            userId: actorUserId,
            action: "Edição",
            referring: EVENT_REFERRING,
            referringId: eventId,
            changes,
          });
        }
        return event;
      });
    } catch (error: unknown) {
      logError("Falha ao atualizar evento de Marketing.", { err: error });
      if (hasPrismaCode(error, "P2025")) return null;
      return duplicateNameError(error);
    }
  }
}
