import "./envBootstrap.js";

import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { AUDIT_UNAVAILABLE_MESSAGE } from "../integrations/audit.js";
import { MarketingEventsService } from "../services/marketingEventsService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const eventId = "20000000-0000-4000-8000-000000000001";
const actorUserId = "00000000-0000-4000-8000-000000000009";

function serviceFor(prisma: object, audit = vi.fn(async () => {})) {
  const db = { ...prisma, $transaction: (run: (tx: unknown) => unknown) => run(db) };
  return new MarketingEventsService(db as never, audit);
}

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

    await expect(serviceFor(prisma).listEvents(organizationId)).resolves.toEqual([event]);
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

    await serviceFor(prisma).createEvent(
      organizationId,
      {
        name: " AÇÃO ÇãO ",
        logo: "",
        priority: "Média",
        objective: "",
        audience: "",
      },
      actorUserId,
    );

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

    await serviceFor(prisma).createEvent(
      organizationId,
      {
        name: "Straße",
        logo: "",
        priority: "Média",
        objective: "",
        audience: "",
      },
      actorUserId,
    );

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

    await serviceFor(prisma).createEvent(
      organizationId,
      {
        name: "Evento 🚀",
        logo: "",
        priority: "Média",
        objective: "",
        audience: "",
      },
      actorUserId,
    );

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

    await serviceFor(prisma).createEvent(
      organizationId,
      {
        name: " Evento ",
        logo: "",
        priority: "Média",
        objective: "",
        audience: "",
      },
      actorUserId,
    );

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
      serviceFor(prisma).createEvent(
        organizationId,
        {
          name: "Evento Á",
          logo: "",
          priority: "Média",
          objective: "",
          audience: "",
        },
        actorUserId,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("updates by event id and organization together", async () => {
    const prisma = {
      marketingEvent: {
        findFirst: vi.fn().mockResolvedValue(event),
        update: vi.fn().mockResolvedValue({ ...event, name: "Novo nome", name_key: "novo nome" }),
      },
    };

    await serviceFor(prisma).updateEvent(
      organizationId,
      eventId,
      {
        name: "Novo nome",
      },
      actorUserId,
    );

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
        findFirst: vi.fn().mockResolvedValue(event),
        update: vi.fn().mockRejectedValue({ code: "P2025" }),
      },
    };

    await expect(
      serviceFor(prisma).updateEvent(
        organizationId,
        eventId,
        {
          name: "Novo nome",
        },
        actorUserId,
      ),
    ).resolves.toBeNull();
  });

  it("records who created the event, in which organization and with which values", async () => {
    const audit = vi.fn(async () => {});
    const prisma = { marketingEvent: { create: vi.fn().mockResolvedValue(event) } };

    await serviceFor(prisma, audit).createEvent(
      organizationId,
      { name: "Evento Á", logo: "", priority: "Média", objective: "", audience: "" },
      actorUserId,
    );

    expect(audit).toHaveBeenCalledWith({
      organizationId,
      userId: actorUserId,
      action: "Cadastro",
      referring: "marketing.events",
      referringId: eventId,
      changes: {
        name: { from: null, to: "Evento Á" },
        logo: { from: null, to: "" },
        status: { from: null, to: "Novo" },
        priority: { from: null, to: "Média" },
        objective: { from: null, to: "" },
        audience: { from: null, to: "" },
      },
    });
  });

  it("records only the fields an update changed, with previous and new values", async () => {
    const audit = vi.fn(async () => {});
    const prisma = {
      marketingEvent: {
        findFirst: vi.fn().mockResolvedValue(event),
        update: vi.fn().mockResolvedValue({ ...event, status: "Concluído" }),
      },
    };

    await serviceFor(prisma, audit).updateEvent(
      organizationId,
      eventId,
      { status: "Concluído", priority: "Média" },
      actorUserId,
    );

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        userId: actorUserId,
        action: "Edição",
        referringId: eventId,
        changes: { status: { from: "Novo", to: "Concluído" } },
      }),
    );
  });

  it("does not write a trail entry when the update changed nothing", async () => {
    const audit = vi.fn(async () => {});
    const prisma = {
      marketingEvent: {
        findFirst: vi.fn().mockResolvedValue(event),
        update: vi.fn().mockResolvedValue(event),
      },
    };

    await serviceFor(prisma, audit).updateEvent(
      organizationId,
      eventId,
      { priority: "Média" },
      actorUserId,
    );

    expect(audit).not.toHaveBeenCalled();
  });

  it("neither updates nor audits an event of another organization", async () => {
    const audit = vi.fn(async () => {});
    const prisma = {
      marketingEvent: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    };

    await expect(
      serviceFor(prisma, audit).updateEvent(organizationId, eventId, { name: "X" }, actorUserId),
    ).resolves.toBeNull();
    expect(prisma.marketingEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: eventId, organization_id: organizationId } }),
    );
    expect(prisma.marketingEvent.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("fails the change inside its transaction when the required trail cannot be written", async () => {
    const audit = vi.fn(async () => {
      throw new ServiceError(503, AUDIT_UNAVAILABLE_MESSAGE);
    });
    const prisma = { marketingEvent: { create: vi.fn().mockResolvedValue(event) } };
    const transaction = vi.fn((run: (tx: unknown) => unknown) => run(prisma));
    const service = new MarketingEventsService(
      { ...prisma, $transaction: transaction } as never,
      audit,
    );

    await expect(
      service.createEvent(
        organizationId,
        { name: "Evento Á", logo: "", priority: "Média", objective: "", audience: "" },
        actorUserId,
      ),
    ).rejects.toMatchObject({ statusCode: 503, message: AUDIT_UNAVAILABLE_MESSAGE });
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
