import { describe, expect, it, vi } from "vitest";

import {
  type TriageCompetencePrisma,
  TriageCompetenceService,
} from "../services/triageCompetenceService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const OTHER_ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000002";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const COMPETENCE_ID = "d0000000-0000-4000-8000-000000000001";
const COMPETENCE = "2026-09";

const record = {
  id: COMPETENCE_ID,
  organization_id: ORGANIZATION_ID,
  client_id: CLIENT_ID,
  competence: COMPETENCE,
  configuration_snapshot: { version: 1, configs: [] },
  responsible_snapshot: { version: 1, responsibles: [] },
  archived_at: null,
  created_at: new Date("2026-09-17T00:00:00.000Z"),
  updated_at: new Date("2026-09-17T00:00:00.000Z"),
};

function createMockPrisma(): TriageCompetencePrisma {
  const prisma = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(async (callback: (transaction: TriageCompetencePrisma) => unknown) =>
      callback(prisma as unknown as TriageCompetencePrisma),
    ),
    client: { findFirst: vi.fn() },
    triageConfig: { findMany: vi.fn() },
    triageResponsible: { findMany: vi.fn() },
    triageCompetence: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    triageCompetenceHistory: { create: vi.fn() },
    triageOutboxEvent: { create: vi.fn() },
  };

  return prisma as unknown as TriageCompetencePrisma;
}

function editor() {
  return {
    userId: USER_ID,
    organizationId: ORGANIZATION_ID,
    permission: 2,
    modules: { triagem: 2 },
  };
}

describe("TriageCompetenceService", () => {
  it("cria competência com snapshots de configuração e responsáveis", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.client.findFirst).mockResolvedValue({ id: CLIENT_ID } as never);
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.triageConfig.findMany).mockResolvedValue([
      { id: "config-1", type: "CONTABIL", active_items: ["item-1"] },
    ] as never);
    vi.mocked(prisma.triageResponsible.findMany).mockResolvedValue([
      { id: "responsible-1", type: "CONTABIL", user_id: USER_ID },
    ] as never);
    vi.mocked(prisma.triageCompetence.create).mockResolvedValue(record as never);

    const service = new TriageCompetenceService(prisma);
    const result = await service.create({ client_id: CLIENT_ID, competence: COMPETENCE }, editor());

    expect(result).toMatchObject({
      id: COMPETENCE_ID,
      client_id: CLIENT_ID,
      competence: COMPETENCE,
    });
    expect(prisma.triageCompetence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: ORGANIZATION_ID,
        client_id: CLIENT_ID,
        competence: COMPETENCE,
        configuration_snapshot: expect.objectContaining({
          version: 1,
          configs: [{ id: "config-1", type: "CONTABIL", active_items: ["item-1"] }],
        }),
        responsible_snapshot: expect.objectContaining({
          version: 1,
          responsibles: [{ id: "responsible-1", type: "CONTABIL", user_id: USER_ID }],
        }),
      }),
      select: expect.any(Object),
    });
    expect(prisma.triageCompetenceHistory.create).toHaveBeenCalledOnce();
    expect(prisma.triageOutboxEvent.create).toHaveBeenCalledOnce();
  });

  it("captura o catálogo dentro da mesma transação da competência", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.client.findFirst).mockResolvedValue({ id: CLIENT_ID } as never);
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.triageConfig.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.triageResponsible.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.triageCompetence.create).mockResolvedValue(record as never);
    const snapshotCatalog = vi.fn().mockResolvedValue([]);

    await new TriageCompetenceService(prisma, undefined, snapshotCatalog).create(
      { client_id: CLIENT_ID, competence: COMPETENCE },
      editor(),
    );

    expect(snapshotCatalog).toHaveBeenCalledWith(prisma, ORGANIZATION_ID, COMPETENCE_ID);
  });

  it("aborta a transação quando o snapshot falha antes do histórico e outbox", async () => {
    const prisma = createMockPrisma();
    let committed = false;
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const result = await callback(prisma);
      committed = true;
      return result;
    });
    vi.mocked(prisma.client.findFirst).mockResolvedValue({ id: CLIENT_ID } as never);
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.triageConfig.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.triageResponsible.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.triageCompetence.create).mockResolvedValue(record as never);
    const snapshotCatalog = vi.fn().mockRejectedValue(new Error("catalog snapshot failed"));

    await expect(
      new TriageCompetenceService(prisma, undefined, snapshotCatalog).create(
        { client_id: CLIENT_ID, competence: COMPETENCE },
        editor(),
      ),
    ).rejects.toMatchObject({ statusCode: 500 });

    expect(committed).toBe(false);
    expect(prisma.triageCompetenceHistory.create).not.toHaveBeenCalled();
    expect(prisma.triageOutboxEvent.create).not.toHaveBeenCalled();
  });

  it("repete criação sem duplicar competência, histórico ou outbox", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue(record as never);
    const snapshotCatalog = vi.fn().mockResolvedValue([]);

    const result = await new TriageCompetenceService(prisma, undefined, snapshotCatalog).create(
      { client_id: CLIENT_ID, competence: COMPETENCE },
      editor(),
    );

    expect(result.id).toBe(COMPETENCE_ID);
    expect(prisma.triageCompetence.create).not.toHaveBeenCalled();
    expect(snapshotCatalog).toHaveBeenCalledWith(prisma, ORGANIZATION_ID, COMPETENCE_ID);
    expect(prisma.triageCompetenceHistory.create).not.toHaveBeenCalled();
    expect(prisma.triageOutboxEvent.create).not.toHaveBeenCalled();
  });

  it("criar de novo uma competência arquivada restaura e registra histórico (#1326)", async () => {
    const prisma = createMockPrisma();
    const archived = { ...record, archived_at: new Date("2026-09-17T01:00:00.000Z") };
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue(archived as never);
    vi.mocked(prisma.triageCompetence.update).mockResolvedValue(record as never);

    const result = await new TriageCompetenceService(prisma, undefined, vi.fn()).create(
      { client_id: CLIENT_ID, competence: COMPETENCE },
      editor(),
    );

    expect(result.archived_at).toBeNull();
    expect(prisma.triageCompetence.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: COMPETENCE_ID }, data: { archived_at: null } }),
    );
    expect(prisma.triageCompetenceHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "restored" }),
    });
  });

  it("lista somente competências da organização autenticada", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCompetence.findMany).mockResolvedValue([record] as never);

    await new TriageCompetenceService(prisma).list(
      {},
      { ...editor(), organizationId: OTHER_ORGANIZATION_ID },
    );

    expect(prisma.triageCompetence.findMany).toHaveBeenCalledWith({
      where: { organization_id: OTHER_ORGANIZATION_ID, archived_at: null },
      orderBy: [{ competence: "desc" }, { created_at: "desc" }],
      select: expect.any(Object),
    });
  });

  it("bloqueia criação para viewer mesmo com contexto autenticado", async () => {
    const prisma = createMockPrisma();

    await expect(
      new TriageCompetenceService(prisma).create(
        { client_id: CLIENT_ID, competence: COMPETENCE },
        { ...editor(), permission: 1, modules: { triagem: 1 } },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(prisma.triageCompetence.findFirst).not.toHaveBeenCalled();
  });

  it("arquiva competência uma vez e torna repetição idempotente", async () => {
    const prisma = createMockPrisma();
    const archived = {
      ...record,
      archived_at: new Date("2026-09-17T01:00:00.000Z"),
    };
    vi.mocked(prisma.triageCompetence.findFirst)
      .mockResolvedValueOnce(record as never)
      .mockResolvedValueOnce(archived as never);
    vi.mocked(prisma.triageCompetence.update).mockResolvedValue(archived as never);

    const service = new TriageCompetenceService(prisma);
    await service.archive(COMPETENCE_ID, editor());
    await service.archive(COMPETENCE_ID, editor());

    expect(prisma.triageCompetence.update).toHaveBeenCalledOnce();
    expect(prisma.triageCompetenceHistory.create).toHaveBeenCalledOnce();
    expect(prisma.triageOutboxEvent.create).toHaveBeenCalledOnce();
  });
});
