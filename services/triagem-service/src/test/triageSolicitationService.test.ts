import { describe, expect, it, vi } from "vitest";

import {
  type TriageSolicitationPrisma,
  TriageSolicitationService,
} from "../services/triageSolicitationService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const RESPONSIBLE_ID = "c0000000-0000-4000-8000-000000000002";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "e0000000-0000-4000-8000-000000000001";
const FIRST_ID = "d0000000-0000-4000-8000-000000000001";
const SECOND_ID = "d0000000-0000-4000-8000-000000000002";
const COMPETENCE = "2026-09";
const NOW = new Date("2026-10-09T12:00:00.000Z");

function record(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    organization_id: ORGANIZATION_ID,
    client_id: CLIENT_ID,
    competence: COMPETENCE,
    category_id: CATEGORY_ID,
    description: "Conferir notas do mês.",
    requester_id: USER_ID,
    responsible_id: RESPONSIBLE_ID,
    status: "OPEN",
    closed_at: null,
    created_at: NOW,
    updated_at: NOW,
    client: { id: CLIENT_ID, name: "Cliente" },
    category: { id: CATEGORY_ID, code: "NOTAS", label: "Notas" },
    requester: { id: USER_ID, name: "Solicitante", full_name: null },
    responsible: { id: RESPONSIBLE_ID, name: "Responsável", full_name: null },
    ...overrides,
  };
}

function createMockPrisma(): TriageSolicitationPrisma {
  const prisma = {
    $transaction: vi.fn(async (callback: (transaction: TriageSolicitationPrisma) => unknown) =>
      callback(prisma as unknown as TriageSolicitationPrisma),
    ),
    $executeRaw: vi.fn().mockResolvedValue(0),
    client: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    triageCatalogItem: { findFirst: vi.fn() },
    triageCompetence: { findFirst: vi.fn() },
    triageSolicitation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  return prisma as unknown as TriageSolicitationPrisma;
}

const auth = (level: number, userId = USER_ID) => ({
  userId,
  organizationId: ORGANIZATION_ID,
  modules: { triagem: level },
});

const createInput = {
  client_id: CLIENT_ID,
  competence: COMPETENCE,
  category_id: CATEGORY_ID,
  description: "  Conferir notas do mês.  ",
  responsible_id: RESPONSIBLE_ID,
};

function mockCreatable(prisma: TriageSolicitationPrisma) {
  vi.mocked(prisma.client.findFirst).mockResolvedValue({ id: CLIENT_ID } as never);
  vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: RESPONSIBLE_ID } as never);
  vi.mocked(prisma.triageCatalogItem.findFirst).mockResolvedValue({ id: CATEGORY_ID } as never);
  vi.mocked(prisma.triageSolicitation.create).mockResolvedValue(record(FIRST_ID) as never);
}

describe("TriageSolicitationService", () => {
  it("cria solicitação aberta com solicitante autenticado e categoria do catálogo", async () => {
    const prisma = createMockPrisma();
    mockCreatable(prisma);

    const result = await new TriageSolicitationService(prisma).create(createInput, auth(2));

    expect(result).not.toHaveProperty("organization_id");
    expect(result).toMatchObject({ id: FIRST_ID, status: "OPEN", closed_at: null });
    expect(prisma.triageCatalogItem.findFirst).toHaveBeenCalledWith({
      where: {
        id: CATEGORY_ID,
        organization_id: ORGANIZATION_ID,
        kind: "REQUEST_CATEGORY",
        archived_at: null,
      },
      select: { id: true },
    });
    expect(prisma.triageSolicitation.create).toHaveBeenCalledWith({
      data: {
        organization_id: ORGANIZATION_ID,
        client_id: CLIENT_ID,
        competence: COMPETENCE,
        category_id: CATEGORY_ID,
        description: "Conferir notas do mês.",
        requester_id: USER_ID,
        responsible_id: RESPONSIBLE_ID,
        status: "OPEN",
      },
      select: expect.any(Object),
    });
  });

  it("recusa categoria fora do catálogo de solicitações", async () => {
    const prisma = createMockPrisma();
    mockCreatable(prisma);
    vi.mocked(prisma.triageCatalogItem.findFirst).mockResolvedValue(null);

    await expect(
      new TriageSolicitationService(prisma).create(createInput, auth(2)),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.triageSolicitation.create).not.toHaveBeenCalled();
  });

  it("recusa criação sem nível de escrita", async () => {
    const prisma = createMockPrisma();

    await expect(
      new TriageSolicitationService(prisma).create(createInput, auth(1)),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("recusa competência arquivada", async () => {
    const prisma = createMockPrisma();
    mockCreatable(prisma);
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue({
      archived_at: NOW,
    } as never);

    await expect(
      new TriageSolicitationService(prisma).create(createInput, auth(2)),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("limita operador comum aos pedidos sob sua responsabilidade", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageSolicitation.findMany).mockResolvedValue([]);

    await new TriageSolicitationService(prisma).list({ status: "OPEN" }, auth(2));

    expect(prisma.triageSolicitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORGANIZATION_ID, status: "OPEN", responsible_id: USER_ID },
      }),
    );
  });

  it("administrador lista todos os pedidos da organização com filtros", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageSolicitation.findMany).mockResolvedValue([
      record(FIRST_ID),
      record(SECOND_ID),
    ] as never);

    const result = await new TriageSolicitationService(prisma).list(
      { clientId: CLIENT_ID, competence: COMPETENCE },
      auth(3),
    );

    expect(result.map((item) => item.id)).toEqual([FIRST_ID, SECOND_ID]);
    expect(prisma.triageSolicitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORGANIZATION_ID, client_id: CLIENT_ID, competence: COMPETENCE },
      }),
    );
  });

  it("recusa listagem sem nível de leitura", async () => {
    await expect(
      new TriageSolicitationService(createMockPrisma()).list({}, auth(0)),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("fecha um pedido pelo ID sem tocar no outro da mesma competência", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageSolicitation.findFirst).mockResolvedValue(record(SECOND_ID) as never);
    vi.mocked(prisma.triageSolicitation.update).mockResolvedValue(
      record(SECOND_ID, { status: "CLOSED", closed_at: NOW }) as never,
    );

    const result = await new TriageSolicitationService(prisma, () => NOW).close(
      SECOND_ID,
      auth(2, RESPONSIBLE_ID),
    );

    expect(result).toMatchObject({ id: SECOND_ID, status: "CLOSED", closed_at: NOW });
    expect(prisma.triageSolicitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SECOND_ID, organization_id: ORGANIZATION_ID } }),
    );
    expect(prisma.triageSolicitation.update).toHaveBeenCalledTimes(1);
    expect(prisma.triageSolicitation.update).toHaveBeenCalledWith({
      where: { id: SECOND_ID },
      data: { status: "CLOSED", closed_at: NOW },
      select: expect.any(Object),
    });
  });

  it("fechar pedido já fechado não altera a data de fechamento", async () => {
    const prisma = createMockPrisma();
    const closed = record(FIRST_ID, { status: "CLOSED", closed_at: NOW });
    vi.mocked(prisma.triageSolicitation.findFirst).mockResolvedValue(closed as never);

    const result = await new TriageSolicitationService(prisma).close(FIRST_ID, auth(3));

    expect(result.closed_at).toBe(NOW);
    expect(prisma.triageSolicitation.update).not.toHaveBeenCalled();
  });

  it("operador comum não fecha nem consulta pedido de outro responsável", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageSolicitation.findFirst).mockResolvedValue(record(FIRST_ID) as never);
    const service = new TriageSolicitationService(prisma);

    await expect(service.close(FIRST_ID, auth(2))).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.get(FIRST_ID, auth(1))).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.triageSolicitation.update).not.toHaveBeenCalled();
  });

  it("pedido de outra organização não é encontrado", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageSolicitation.findFirst).mockResolvedValue(null);

    await expect(
      new TriageSolicitationService(prisma).get(FIRST_ID, auth(3)),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.triageSolicitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: FIRST_ID, organization_id: ORGANIZATION_ID } }),
    );
    const setConfig = vi
      .mocked(prisma.$executeRaw)
      .mock.calls.find(([sql]) => String(sql).includes("set_config"));
    expect(setConfig?.slice(1)).toEqual([ORGANIZATION_ID]);
  });
});
