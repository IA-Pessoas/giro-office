import { describe, expect, it, vi } from "vitest";
import { type ClientAuditEvent, ClientService } from "./clientService.js";
import type { PrismaClient } from "./generated/prisma/client.js";

const ORG = "org-1";
const editor = { userId: "user-1", level: 2, permission: 2, isOwner: false };
const viewer = { userId: "user-2", level: 1, permission: 1, isOwner: false };

function setup(options: { regimes?: Array<{ id: string; name: string }>; regime?: string | null }) {
  const regimes = options.regimes ?? [];
  const byNormalized = (where: { normalized_name: string; id?: { not: string } }) =>
    regimes.find(
      (row) =>
        row.name
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLocaleLowerCase("pt-BR") === where.normalized_name && row.id !== where.id?.not,
    ) ?? null;
  const prisma = {
    organization: { findUnique: vi.fn().mockResolvedValue({ id: ORG }) },
    client: {
      findFirst: vi.fn().mockResolvedValue({ id: "client-1", regime: options.regime ?? null }),
      update: vi.fn(async ({ data }) => ({ id: "client-1", ...data })),
    },
    clientRegime: {
      findMany: vi.fn().mockResolvedValue(regimes),
      findFirst: vi.fn(async ({ where }) =>
        where.id ? (regimes.find((row) => row.id === where.id) ?? null) : byNormalized(where),
      ),
      create: vi.fn(async ({ data }) => ({ id: "regime-new", ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
  };
  const events: ClientAuditEvent[] = [];
  const service = new ClientService(
    prisma as unknown as PrismaClient,
    undefined,
    undefined,
    undefined,
    false,
    async (event) => {
      events.push(event);
    },
  );
  return { prisma, service, events };
}

describe("client regime catalog", () => {
  it("creates a regime scoped to the organization and audits it", async () => {
    const { prisma, service, events } = setup({});
    await service.createRegime(ORG, "  MEI  ", editor);
    expect(prisma.clientRegime.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { organization_id: ORG, name: "MEI", normalized_name: "mei" },
      }),
    );
    expect(events).toEqual([
      expect.objectContaining({
        organizationId: ORG,
        userId: "user-1",
        action: "create",
        referring: "clients.regimes",
        referringId: "regime-new",
        changes: { name: { from: null, to: "MEI" } },
      }),
    ]);
  });

  it("rejects duplicate names ignoring case and accents", async () => {
    const { service } = setup({ regimes: [{ id: "r1", name: "Imune" }] });
    await expect(service.createRegime(ORG, "imúne", editor)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("renames without touching clients and audits the old and new name", async () => {
    const { prisma, service, events } = setup({ regimes: [{ id: "r1", name: "Imune" }] });
    await service.updateRegime("r1", ORG, "Isenta", editor);
    expect(prisma.clientRegime.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: { name: "Isenta", normalized_name: "isenta" },
      }),
    );
    expect(prisma.client.update).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({
      action: "update",
      referringId: "r1",
      changes: { name: { from: "Imune", to: "Isenta" } },
    });
  });

  it("returns 404 when the regime belongs to another organization", async () => {
    const { prisma, service } = setup({});
    await expect(service.updateRegime("r9", ORG, "X", editor)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prisma.clientRegime.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "r9", organization_id: ORG } }),
    );
  });

  it("requires edit permission to create or rename", async () => {
    const { service } = setup({});
    await expect(service.createRegime(ORG, "MEI", viewer)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(service.listRegimes(ORG, viewer)).resolves.toEqual([]);
  });
});

describe("client regime selection", () => {
  it("stores the catalog name and audits the change", async () => {
    const { prisma, service, events } = setup({
      regimes: [{ id: "r1", name: "Imune" }],
      regime: "Lucro Real",
    });
    await service.update("client-1", ORG, { regime: "imune" }, editor);
    expect(prisma.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { regime: "Imune" } }),
    );
    expect(events).toEqual([
      expect.objectContaining({
        action: "update",
        referring: "clients",
        referringId: "client-1",
        changes: { regime: { from: "Lucro Real", to: "Imune" } },
      }),
    ]);
  });

  it("keeps a stored value outside the catalog without converting it", async () => {
    const { prisma, service, events } = setup({ regime: "Regime antigo" });
    await service.update("client-1", ORG, { regime: "Regime antigo", name: "Acme" }, editor);
    expect(prisma.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { regime: "Regime antigo", name: "Acme" } }),
    );
    expect(events).toEqual([]);
  });

  it("accepts the shared tax regimes and clearing the value", async () => {
    const { prisma, service } = setup({ regime: "MEI" });
    await service.update("client-1", ORG, { regime: "Simples Nacional" }, editor);
    await service.update("client-1", ORG, { regime: "" }, editor);
    expect(prisma.client.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: { regime: "Simples Nacional" } }),
    );
    expect(prisma.client.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: { regime: null } }),
    );
  });

  it("keeps the stored value when it differs only in case or spacing", async () => {
    const { prisma, service, events } = setup({ regime: "simples nacional " });
    await service.update("client-1", ORG, { regime: "Simples  Nacional" }, editor);
    expect(prisma.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { regime: "simples nacional " } }),
    );
    expect(events).toEqual([]);
  });

  it("audits a regime change made through the integration form", async () => {
    const { service, events } = setup({ regime: "MEI" });
    await service.updateIntegration("client-1", ORG, { regime: "Lucro Real" }, editor);
    expect(events).toEqual([
      expect.objectContaining({ changes: { regime: { from: "MEI", to: "Lucro Real" } } }),
    ]);
  });

  it("rejects a regime outside the organization catalog", async () => {
    const { prisma, service } = setup({ regime: null });
    await expect(
      service.update("client-1", ORG, { regime: "Inventado" }, editor),
    ).rejects.toMatchObject({ statusCode: 400, message: "Regime não cadastrado na organização." });
    expect(prisma.client.update).not.toHaveBeenCalled();
  });
});
