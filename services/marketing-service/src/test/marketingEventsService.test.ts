import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { MarketingEventsService } from "../services/marketingEventsService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const eventId = "20000000-0000-4000-8000-000000000001";
const event = {
  id: eventId,
  name: "Evento Á",
  logo: "",
  status: "Novo",
  priority: "Média",
  objective: "",
  audience: "",
};

describe("MarketingEventsService", () => {
  it("lists only events owned by the requested organization", async () => {
    const prisma = {
      marketingEvent: {
        findMany: vi.fn().mockResolvedValue([event]),
      },
    };

    await expect(
      new MarketingEventsService(prisma as never).listEvents(organizationId),
    ).resolves.toEqual([event]);
    expect(prisma.marketingEvent.findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        logo: true,
        status: true,
        priority: true,
        objective: true,
        audience: true,
      },
    });
  });

  it("stores a normalized legacy-comparable duplicate key per organization", async () => {
    const prisma = {
      marketingEvent: {
        create: vi.fn().mockResolvedValue(event),
      },
    };

    await new MarketingEventsService(prisma as never).createEvent(organizationId, {
      name: " AÇÃO ÇãO ",
      logo: "",
      priority: "Média",
      objective: "",
      audience: "",
    });

    expect(prisma.marketingEvent.create).toHaveBeenCalledWith({
      data: {
        organization_id: organizationId,
        name: " AÇÃO ÇãO ",
        name_key: " acao cao",
        logo: "",
        status: "Novo",
        priority: "Média",
        objective: "",
        audience: "",
      },
      select: {
        id: true,
        name: true,
        logo: true,
        status: true,
        priority: true,
        objective: true,
        audience: true,
      },
    });
  });

  it("matches the legacy general_ci equivalence between sharp s and s", async () => {
    const prisma = {
      marketingEvent: {
        create: vi.fn().mockResolvedValue(event),
      },
    };

    await new MarketingEventsService(prisma as never).createEvent(organizationId, {
      name: "Straße",
      logo: "",
      priority: "Média",
      objective: "",
      audience: "",
    });

    expect(prisma.marketingEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name_key: "strase" }) }),
    );
  });

  it("matches the legacy general_ci weight for supplementary Unicode characters", async () => {
    const prisma = {
      marketingEvent: {
        create: vi.fn().mockResolvedValue(event),
      },
    };

    await new MarketingEventsService(prisma as never).createEvent(organizationId, {
      name: "Evento 🚀",
      logo: "",
      priority: "Média",
      objective: "",
      audience: "",
    });

    expect(prisma.marketingEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name_key: "evento �" }) }),
    );
  });

  it("preserves leading spaces but ignores trailing spaces like the legacy collation", async () => {
    const prisma = {
      marketingEvent: {
        create: vi.fn().mockResolvedValue(event),
      },
    };

    await new MarketingEventsService(prisma as never).createEvent(organizationId, {
      name: " Evento ",
      logo: "",
      priority: "Média",
      objective: "",
      audience: "",
    });

    expect(prisma.marketingEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: " Evento ", name_key: " evento" }),
      }),
    );
  });

  it("converts a concurrent duplicate-key violation to the legacy conflict response", async () => {
    const prisma = {
      marketingEvent: {
        create: vi.fn().mockRejectedValue({ code: "P2002" }),
      },
    };

    await expect(
      new MarketingEventsService(prisma as never).createEvent(organizationId, {
        name: "Evento Á",
        logo: "",
        priority: "Média",
        objective: "",
        audience: "",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("updates by event id and organization together", async () => {
    const prisma = {
      marketingEvent: {
        update: vi.fn().mockResolvedValue({ ...event, name: "Novo nome", name_key: "novo nome" }),
      },
    };

    await new MarketingEventsService(prisma as never).updateEvent(organizationId, eventId, {
      name: "Novo nome",
    });

    expect(prisma.marketingEvent.update).toHaveBeenCalledWith({
      where: { id: eventId, organization_id: organizationId },
      data: { name: "Novo nome", name_key: "novo nome" },
      select: {
        id: true,
        name: true,
        logo: true,
        status: true,
        priority: true,
        objective: true,
        audience: true,
      },
    });
  });

  it("does not expose an event that was not found within the organization", async () => {
    const prisma = {
      marketingEvent: {
        update: vi.fn().mockRejectedValue({ code: "P2025" }),
      },
    };

    await expect(
      new MarketingEventsService(prisma as never).updateEvent(organizationId, eventId, {
        name: "Novo nome",
      }),
    ).resolves.toBeNull();
  });
});
