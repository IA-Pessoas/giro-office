import { ServiceError } from "@workspace/shared";

import type {
  CreateMarketingEventInput,
  MarketingEvent,
  MarketingEventsProvider,
  UpdateMarketingEventInput,
} from "../routes/marketingEvents.routes.js";
import type { PrismaClient } from "../generated/prisma/client.js";

const marketingEventSelect = {
  id: true,
  name: true,
  logo: true,
  status: true,
  priority: true,
  objective: true,
  audience: true,
} as const;

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
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function duplicateNameError(error: unknown): never {
  if (hasPrismaCode(error, "P2002")) {
    throw new ServiceError(409, "Já existe um evento com esse nome nesta organização.", error);
  }
  throw error;
}

export class MarketingEventsService implements MarketingEventsProvider {
  constructor(private readonly prisma: PrismaClient) {}

  listEvents(organizationId: string): Promise<MarketingEvent[]> {
    return this.prisma.marketingEvent.findMany({
      where: { organization_id: organizationId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: marketingEventSelect,
    });
  }

  async createEvent(
    organizationId: string,
    input: CreateMarketingEventInput,
  ): Promise<MarketingEvent> {
    const name = input.name.trim();
    try {
      return await this.prisma.marketingEvent.create({
        data: {
          organization_id: organizationId,
          name,
          name_key: nameKey(name),
          logo: input.logo,
          status: input.status,
          priority: input.priority,
          objective: input.objective,
          audience: input.audience,
        },
        select: marketingEventSelect,
      });
    } catch (error: unknown) {
      return duplicateNameError(error);
    }
  }

  async updateEvent(
    organizationId: string,
    eventId: string,
    input: UpdateMarketingEventInput,
  ): Promise<MarketingEvent | null> {
    const data = {
      ...input,
      ...(input.name === undefined
        ? {}
        : { name: input.name.trim(), name_key: nameKey(input.name) }),
    };

    try {
      return await this.prisma.marketingEvent.update({
        where: { id: eventId, organization_id: organizationId },
        data,
        select: marketingEventSelect,
      });
    } catch (error: unknown) {
      if (hasPrismaCode(error, "P2025")) return null;
      return duplicateNameError(error);
    }
  }
}
