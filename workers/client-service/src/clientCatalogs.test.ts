import { describe, expect, it, vi } from "vitest";
import { type ClientAuditEvent, ClientService } from "./clientService.js";
import type { PrismaClient } from "./generated/prisma/client.js";

const ORG = "org-1";
const editor = { userId: "user-1", level: 2, permission: 2, isOwner: false };
const viewer = { userId: "user-2", level: 1, permission: 1, isOwner: false };

type CatalogRow = { id: string; name: string; type?: string; organization_id?: string };

const normalize = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");

// Delegate em memória que respeita organization_id, para provar o isolamento por organização.
function catalogDelegate(rows: CatalogRow[], newId: string) {
  const matches = (row: CatalogRow, where: Record<string, unknown>) =>
    (row.organization_id ?? ORG) === where.organization_id &&
    (where.id === undefined || typeof where.id !== "string" || row.id === where.id) &&
    (where.normalized_name === undefined || normalize(row.name) === where.normalized_name) &&
    row.id !== (where.id as { not?: string } | undefined)?.not;
  return {
    findMany: vi.fn(async ({ where }) => rows.filter((row) => matches(row, where))),
    findFirst: vi.fn(async ({ where }) => rows.find((row) => matches(row, where)) ?? null),
    create: vi.fn(async ({ data }) => ({ id: newId, ...data })),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
  };
}

function setup(options: {
  regimes?: CatalogRow[];
  segments?: CatalogRow[];
  regime?: string | null;
  segment?: string | null;
}) {
  const prisma = {
    organization: { findUnique: vi.fn().mockResolvedValue({ id: ORG }) },
    client: {
      findFirst: vi.fn().mockResolvedValue({
        id: "client-1",
        regime: options.regime ?? null,
        segment: options.segment ?? null,
      }),
      create: vi.fn(async ({ data }) => ({ id: "client-new", ...data })),
      update: vi.fn(async ({ data }) => ({ id: "client-1", ...data })),
    },
    clientRegime: catalogDelegate(options.regimes ?? [], "regime-new"),
    clientSegment: catalogDelegate(options.segments ?? [], "segment-new"),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback(prisma),
  );
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

describe("client segment catalog", () => {
  const OTHER_ORG = "org-2";

  it("creates a typed segment and audits name and type", async () => {
    const { prisma, service, events } = setup({});
    await service.createSegment(ORG, { name: " Varejo ", type: "comercio" }, editor);
    expect(prisma.clientSegment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { organization_id: ORG, name: "Varejo", type: "comercio", normalized_name: "varejo" },
      }),
    );
    expect(events[0]).toMatchObject({
      action: "create",
      referring: "clients.segments",
      changes: { name: { from: null, to: "Varejo" }, type: { from: null, to: "comercio" } },
    });
  });

  it("changes only the type and audits it", async () => {
    const { prisma, service, events } = setup({
      segments: [{ id: "s1", name: "Varejo", type: "comercio" }],
    });
    await service.updateSegment("s1", ORG, { type: "industria" }, editor);
    expect(prisma.clientSegment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" }, data: { type: "industria" } }),
    );
    expect(events[0]).toMatchObject({ changes: { type: { from: "comercio", to: "industria" } } });
  });

  it("isolates segments by organization", async () => {
    const segments = [
      { id: "s1", name: "Varejo", type: "comercio" },
      { id: "s2", name: "Agro", type: "industria", organization_id: OTHER_ORG },
    ];
    const { service } = setup({ segments });
    await expect(service.listSegments(ORG, viewer)).resolves.toEqual([segments[0]]);
    // Outra organização pode ter o mesmo nome; aqui ele não existe e não é aceito.
    await expect(
      service.createSegment(ORG, { name: "agro", type: "servico" }, editor),
    ).resolves.toMatchObject({ name: "agro" });
    await expect(service.updateSegment("s2", ORG, { name: "X" }, editor)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      service.update("client-1", ORG, { segment: "Agro" }, editor),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Segmento não cadastrado na organização.",
    });
  });

  it("selects a catalog segment and keeps a stored value outside the catalog", async () => {
    const { prisma, service, events } = setup({
      segments: [{ id: "s1", name: "Varejo", type: "comercio" }],
      segment: "Contabilidade",
    });
    await service.updateRegularize("client-1", ORG, "user-1", { segment: "Contabilidade" });
    expect(events).toEqual([]);
    await service.updateRegularize("client-1", ORG, "user-1", { segment: "varejo" });
    expect(prisma.client.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { segment: "Varejo" } }),
    );
    expect(events[0]).toMatchObject({
      referring: "clients",
      changes: { segment: { from: "Contabilidade", to: "Varejo" } },
    });
  });
});
