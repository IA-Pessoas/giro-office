import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { DTE_NOTICE_DEFAULT_WINDOW_DAYS, DteNoticeService } from "../services/dteNoticeService.js";

const ORG = "a0000000-0000-4000-8000-000000000001";
const NOTICE_ID = "c0000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-10T12:00:00.000Z");

function createPrisma(notice: Record<string, unknown> | null = null) {
  const prisma = {
    regularizeDteNotice: {
      findMany: vi.fn(async (_args: Record<string, unknown>) => []),
      count: vi.fn(async (_args: Record<string, unknown>) => 0),
      findFirst: vi.fn(async (_args: Record<string, unknown>) => notice),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        ...notice,
        ...args.data,
      })),
    },
    logs: { create: vi.fn(async (_args: Record<string, unknown>) => ({})) },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  return prisma;
}

function serviceFor(prisma: ReturnType<typeof createPrisma>) {
  return new DteNoticeService(prisma as unknown as PrismaClient, () => NOW);
}

describe("DteNoticeService.list", () => {
  it("começa nos últimos 45 dias da organização, do mais recente para o mais antigo", async () => {
    const prisma = createPrisma();

    const page = await serviceFor(prisma).list({
      organizationId: ORG,
      search: "",
      reading: "Todos",
      page: 1,
      limit: 20,
    });

    expect(DTE_NOTICE_DEFAULT_WINDOW_DAYS).toBe(45);
    expect(prisma.regularizeDteNotice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Pela emissão; aviso sem data de emissão legível entra pela data da importação.
        where: {
          organization_id: ORG,
          OR: [
            { data_emissao_at: { gte: new Date("2026-08-26T00:00:00.000Z") } },
            { data_emissao_at: null, created_at: { gte: new Date("2026-08-26T00:00:00.000Z") } },
          ],
        },
        orderBy: [
          { data_emissao_at: { sort: "desc", nulls: "last" } },
          { created_at: "desc" },
          { id: "desc" },
        ],
        skip: 0,
        take: 20,
      }),
    );
    expect(page).toEqual({ data: [], total: 0, page: 1, limit: 20, hasMore: false });
  });

  it("filtra por período, tipo, texto do aviso e leitura", async () => {
    const prisma = createPrisma();
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-01-31T00:00:00.000Z");
    // O último dia entra inteiro.
    const period = { gte: from, lt: new Date("2026-02-01T00:00:00.000Z") };

    await serviceFor(prisma).list({
      organizationId: ORG,
      from,
      to,
      tipo: "badge-warning",
      search: "intima",
      reading: "Pendente",
      page: 2,
      limit: 10,
    });

    expect(prisma.regularizeDteNotice.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        organization_id: ORG,
        OR: [
          { data_emissao_at: period },
          // Pela importação (instante em UTC), com um dia de folga no fim.
          {
            data_emissao_at: null,
            created_at: { gte: from, lt: new Date("2026-02-02T00:00:00.000Z") },
          },
        ],
        tipo: { contains: "badge-warning" },
        aviso: { contains: "intima", mode: "insensitive" },
        pending_reading: true,
      },
      skip: 10,
      take: 10,
    });
  });

  it("tipo vazio pede só os avisos sem cor", async () => {
    const prisma = createPrisma();

    await serviceFor(prisma).list({
      organizationId: ORG,
      tipo: "",
      search: "",
      reading: "Todos",
      page: 1,
      limit: 20,
    });

    expect(prisma.regularizeDteNotice.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { tipo: "" },
    });
  });

  it("traduz o filtro Lido para avisos sem leitura pendente", async () => {
    const prisma = createPrisma();

    await serviceFor(prisma).list({
      organizationId: ORG,
      search: "",
      reading: "Lido",
      page: 1,
      limit: 20,
    });

    expect(prisma.regularizeDteNotice.count.mock.calls[0]?.[0]).toMatchObject({
      where: { pending_reading: false },
    });
  });
});

describe("DteNoticeService.setReading", () => {
  const input = { organizationId: ORG, userId: "user-1", id: NOTICE_ID };

  it("altera a leitura e registra quem alterou", async () => {
    const prisma = createPrisma({ id: NOTICE_ID, organization_id: ORG, pending_reading: true });

    const updated = await serviceFor(prisma).setReading({ ...input, pendingReading: false });

    expect(prisma.regularizeDteNotice.findFirst).toHaveBeenCalledWith({
      where: { id: NOTICE_ID, organization_id: ORG },
    });
    expect(updated).toMatchObject({ id: NOTICE_ID, pending_reading: false });
    expect(prisma.logs.create).toHaveBeenCalledWith({
      data: {
        user_id: "user-1",
        organization_id: ORG,
        action: "Atualizacao",
        referring: "regularize.dte_notices",
        referring_id: NOTICE_ID,
        changes: { pending_reading: { from: true, to: false } },
      },
    });
  });

  it("não grava nem audita quando o estado já é o pedido", async () => {
    const prisma = createPrisma({ id: NOTICE_ID, organization_id: ORG, pending_reading: false });

    await serviceFor(prisma).setReading({ ...input, pendingReading: false });

    expect(prisma.regularizeDteNotice.update).not.toHaveBeenCalled();
    expect(prisma.logs.create).not.toHaveBeenCalled();
  });

  it("responde 404 para aviso de outra organização", async () => {
    const prisma = createPrisma(null);

    await expect(
      serviceFor(prisma).setReading({ ...input, pendingReading: false }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.regularizeDteNotice.update).not.toHaveBeenCalled();
  });
});
