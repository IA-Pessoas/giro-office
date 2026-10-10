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
    triageNoteCount: { findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
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

describe("TriageSolicitationService — contadores de notas (#1697)", () => {
  const counts = { xml_inbound: 3, xml_outbound: 5, nfse_issued: 2, nfse_received: 1 };
  const stored = {
    ...counts,
    updated_at: NOW,
    updated_by: { id: USER_ID, name: "Solicitante", full_name: null },
  };

  it("dois pedidos da mesma competência leem o mesmo contador do cliente", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageSolicitation.findFirst)
      .mockResolvedValueOnce(record(FIRST_ID) as never)
      .mockResolvedValueOnce(record(SECOND_ID) as never);
    vi.mocked(prisma.triageNoteCount.findFirst).mockResolvedValue(stored as never);
    const service = new TriageSolicitationService(prisma);

    const first = await service.getNoteCounts(FIRST_ID, auth(3));
    const second = await service.getNoteCounts(SECOND_ID, auth(3));

    expect(first).toEqual(second);
    expect(first).toMatchObject({ client_id: CLIENT_ID, competence: COMPETENCE, ...counts });
    for (const call of vi.mocked(prisma.triageNoteCount.findFirst).mock.calls) {
      expect(call[0]).toMatchObject({
        where: { organization_id: ORGANIZATION_ID, client_id: CLIENT_ID, competence: COMPETENCE },
      });
    }
  });

  it("competência sem contagem devolve zeros sem gravar", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageSolicitation.findFirst).mockResolvedValue(record(FIRST_ID) as never);
    vi.mocked(prisma.triageNoteCount.findFirst).mockResolvedValue(null);

    const result = await new TriageSolicitationService(prisma).getNoteCounts(FIRST_ID, auth(3));

    expect(result).toMatchObject({
      xml_inbound: 0,
      xml_outbound: 0,
      nfse_issued: 0,
      nfse_received: 0,
      updated_at: null,
      updated_by: null,
    });
    expect(prisma.triageNoteCount.upsert).not.toHaveBeenCalled();
  });

  it("atualiza pelo ID do pedido com upsert único por cliente e competência", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageSolicitation.findFirst).mockResolvedValue(record(SECOND_ID) as never);
    vi.mocked(prisma.triageNoteCount.upsert).mockResolvedValue(stored as never);

    const result = await new TriageSolicitationService(prisma).updateNoteCounts(
      SECOND_ID,
      counts,
      auth(3),
    );

    expect(result).toMatchObject({ client_id: CLIENT_ID, competence: COMPETENCE, ...counts });
    expect(prisma.triageNoteCount.upsert).toHaveBeenCalledWith({
      where: {
        organization_id_client_id_competence: {
          organization_id: ORGANIZATION_ID,
          client_id: CLIENT_ID,
          competence: COMPETENCE,
        },
      },
      create: {
        organization_id: ORGANIZATION_ID,
        client_id: CLIENT_ID,
        competence: COMPETENCE,
        ...counts,
        updated_by_id: USER_ID,
      },
      update: { ...counts, updated_by_id: USER_ID },
      select: expect.any(Object),
    });
  });

  it("não atualiza contador por pedido fechado, alheio ou sem escrita", async () => {
    const prisma = createMockPrisma();
    const service = new TriageSolicitationService(prisma);
    vi.mocked(prisma.triageSolicitation.findFirst).mockResolvedValueOnce(
      record(FIRST_ID, { status: "CLOSED", closed_at: NOW }) as never,
    );
    await expect(service.updateNoteCounts(FIRST_ID, counts, auth(3))).rejects.toMatchObject({
      statusCode: 409,
    });

    vi.mocked(prisma.triageSolicitation.findFirst).mockResolvedValueOnce(record(FIRST_ID) as never);
    await expect(service.updateNoteCounts(FIRST_ID, counts, auth(2))).rejects.toMatchObject({
      statusCode: 404,
    });

    await expect(service.updateNoteCounts(FIRST_ID, counts, auth(1))).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prisma.triageNoteCount.upsert).not.toHaveBeenCalled();
  });
});

describe("TriageSolicitationService — indicadores (#1698)", () => {
  const OTHER_CLIENT = "b0000000-0000-4000-8000-000000000002";
  const OTHER_RESPONSIBLE = "c0000000-0000-4000-8000-000000000003";
  const user = (id: string, name: string) => ({ id, name, full_name: null });
  const row = (clientId: string, requesterId: string, responsibleId: string) => ({
    client_id: clientId,
    requester: user(requesterId, `Solicitante ${requesterId.slice(-1)}`),
    responsible: user(responsibleId, `Responsável ${responsibleId.slice(-1)}`),
  });

  it("soma notas por responsável sem multiplicar pedidos repetidos do mesmo cliente", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageSolicitation.findMany).mockResolvedValue([
      row(CLIENT_ID, USER_ID, RESPONSIBLE_ID),
      row(CLIENT_ID, USER_ID, RESPONSIBLE_ID),
      row(OTHER_CLIENT, RESPONSIBLE_ID, OTHER_RESPONSIBLE),
    ] as never);
    vi.mocked(prisma.triageNoteCount.findMany).mockResolvedValue([
      { client_id: CLIENT_ID, xml_inbound: 3, xml_outbound: 5, nfse_issued: 2, nfse_received: 1 },
      {
        client_id: OTHER_CLIENT,
        xml_inbound: 1,
        xml_outbound: 0,
        nfse_issued: 0,
        nfse_received: 0,
      },
    ] as never);

    const result = await new TriageSolicitationService(prisma).indicators(
      { competence: COMPETENCE, status: "OPEN" },
      auth(3),
    );

    expect(result.notes_by_responsible).toEqual([
      {
        user: user(RESPONSIBLE_ID, "Responsável 2"),
        clients: 1,
        xml_inbound: 3,
        xml_outbound: 5,
        nfse_issued: 2,
        nfse_received: 1,
        total: 11,
      },
      {
        user: user(OTHER_RESPONSIBLE, "Responsável 3"),
        clients: 1,
        xml_inbound: 1,
        xml_outbound: 0,
        nfse_issued: 0,
        nfse_received: 0,
        total: 1,
      },
    ]);
    expect(result.solicitations_by_requester).toEqual([
      { user: user(USER_ID, "Solicitante 1"), total: 2 },
      { user: user(RESPONSIBLE_ID, "Solicitante 2"), total: 1 },
    ]);
    expect(result.totals).toEqual({ solicitations: 3, clients: 2, notes: 12 });
    expect(prisma.triageSolicitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORGANIZATION_ID, competence: COMPETENCE, status: "OPEN" },
      }),
    );
    expect(prisma.triageNoteCount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: ORGANIZATION_ID,
          competence: COMPETENCE,
          client_id: { in: [CLIENT_ID, OTHER_CLIENT] },
        },
      }),
    );
  });

  it("operador comum vê só os indicadores dos pedidos sob sua responsabilidade", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageSolicitation.findMany).mockResolvedValue([]);

    const result = await new TriageSolicitationService(prisma).indicators(
      { competence: COMPETENCE },
      auth(1),
    );

    expect(result.totals).toEqual({ solicitations: 0, clients: 0, notes: 0 });
    expect(prisma.triageSolicitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: ORGANIZATION_ID,
          competence: COMPETENCE,
          responsible_id: USER_ID,
        },
      }),
    );
    expect(prisma.triageNoteCount.findMany).not.toHaveBeenCalled();
  });

  it("recusa indicadores sem nível de leitura", async () => {
    await expect(
      new TriageSolicitationService(createMockPrisma()).indicators(
        { competence: COMPETENCE },
        auth(0),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
