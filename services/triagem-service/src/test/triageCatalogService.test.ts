import { describe, expect, it, vi } from "vitest";

import {
  type TriageCatalogPrisma,
  TriageCatalogService,
} from "../services/triageCatalogService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const OTHER_ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000002";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CATALOG_ID = "d0000000-0000-4000-8000-000000000001";
const COMPETENCE_ID = "e0000000-0000-4000-8000-000000000001";

const record = {
  id: CATALOG_ID,
  organization_id: ORGANIZATION_ID,
  kind: "JUSTIFICATION" as const,
  code: "NO_MOVEMENT",
  label: "Sem movimento",
  url: null,
  archived_at: null,
  created_at: new Date("2026-09-18T00:00:00.000Z"),
  updated_at: new Date("2026-09-18T00:00:00.000Z"),
};

function createMockPrisma(): TriageCatalogPrisma {
  const prisma = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(async (callback: (transaction: TriageCatalogPrisma) => unknown) =>
      callback(prisma as unknown as TriageCatalogPrisma),
    ),
    triageCatalogItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    triageCompetence: { findFirst: vi.fn() },
    triageCompetenceCatalogSnapshot: {
      findFirst: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
  };

  return prisma as unknown as TriageCatalogPrisma;
}

function editor() {
  return {
    userId: USER_ID,
    organizationId: ORGANIZATION_ID,
    permission: 2,
    modules: { triagem: 2 },
  };
}

describe("TriageCatalogService", () => {
  it("cria um item ativo no escopo da organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCatalogItem.create).mockResolvedValue(record as never);

    const result = await new TriageCatalogService(prisma).create(
      {
        kind: "JUSTIFICATION",
        code: "NO_MOVEMENT",
        label: "Sem movimento",
      },
      editor(),
    );

    expect(result).toMatchObject({ id: CATALOG_ID, code: "NO_MOVEMENT", archived_at: null });
    expect(prisma.triageCatalogItem.create).toHaveBeenCalledWith({
      data: {
        organization_id: ORGANIZATION_ID,
        kind: "JUSTIFICATION",
        code: "NO_MOVEMENT",
        label: "Sem movimento",
        url: null,
      },
      select: expect.any(Object),
    });
  });

  it("rejeita valores inválidos antes de acessar o banco", async () => {
    const prisma = createMockPrisma();

    await expect(
      new TriageCatalogService(prisma).create(
        { kind: "LINK_TYPE", code: " ", label: "Drive" },
        editor(),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      new TriageCatalogService(prisma).create(
        { kind: "LINK_TYPE", code: "DRIVE", label: "Drive", url: "http://insecure.test" },
        editor(),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.triageCatalogItem.create).not.toHaveBeenCalled();
  });

  it("bloqueia viewer e arquiva item ativo com sucesso", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCatalogItem.findFirst).mockResolvedValue(record as never);
    vi.mocked(prisma.triageCatalogItem.update).mockResolvedValue({
      ...record,
      archived_at: new Date("2026-09-18T01:00:00.000Z"),
    } as never);

    await expect(
      new TriageCatalogService(prisma).create(
        { kind: "LINK_TYPE", code: "DRIVE", label: "Drive" },
        { ...editor(), permission: 1, modules: { triagem: 1 } },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    const archived = await new TriageCatalogService(prisma).archive(CATALOG_ID, editor());
    expect(archived.archived_at).toEqual(new Date("2026-09-18T01:00:00.000Z"));
    expect(prisma.triageCatalogItem.update).toHaveBeenCalledWith({
      where: { id: CATALOG_ID },
      data: { archived_at: expect.any(Date) },
      select: expect.any(Object),
    });
  });

  it("lista apenas itens ativos da organização e filtra por tipo", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCatalogItem.findMany).mockResolvedValue([record] as never);

    const result = await new TriageCatalogService(prisma).list({ kind: "JUSTIFICATION" }, editor());

    expect(result).toEqual([expect.objectContaining({ id: CATALOG_ID })]);
    expect(prisma.triageCatalogItem.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: ORGANIZATION_ID,
        kind: "JUSTIFICATION",
        archived_at: null,
      },
      orderBy: [{ kind: "asc" }, { label: "asc" }, { code: "asc" }],
      select: expect.any(Object),
    });
  });

  it("lista os valores do snapshot quando a competência é informada", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue({ id: COMPETENCE_ID } as never);
    vi.mocked(prisma.triageCompetenceCatalogSnapshot.findMany).mockResolvedValue([
      {
        id: "snapshot-id",
        organization_id: ORGANIZATION_ID,
        competence_id: COMPETENCE_ID,
        catalog_item_id: CATALOG_ID,
        kind: "LINK_TYPE",
        code: "ARCHIVED_LINK",
        label: "Link histórico",
        url: null,
        created_at: record.created_at,
      },
    ] as never);

    const result = await new TriageCatalogService(prisma).list(
      {
        kind: "LINK_TYPE",
        clientId: "b0000000-0000-4000-8000-000000000001",
        competence: "2026-09",
      },
      editor(),
    );

    expect(result).toEqual([expect.objectContaining({ code: "ARCHIVED_LINK", archived_at: null })]);
    expect(prisma.triageCatalogItem.findMany).not.toHaveBeenCalled();
  });

  it("arquiva logicamente e não altera item de outra organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCatalogItem.findFirst).mockResolvedValue(null);

    await expect(
      new TriageCatalogService(prisma).archive(CATALOG_ID, {
        ...editor(),
        organizationId: OTHER_ORGANIZATION_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(prisma.triageCatalogItem.update).not.toHaveBeenCalled();
  });

  it("snapshotta os valores dos itens ativos uma única vez por competência", async () => {
    const prisma = createMockPrisma();
    const snapshot = {
      id: "f0000000-0000-4000-8000-000000000001",
      organization_id: ORGANIZATION_ID,
      competence_id: COMPETENCE_ID,
      catalog_item_id: CATALOG_ID,
      kind: record.kind,
      code: record.code,
      label: record.label,
      url: record.url,
      created_at: record.created_at,
    };
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue({
      id: COMPETENCE_ID,
    } as never);
    vi.mocked(prisma.triageCatalogItem.findMany).mockResolvedValue([record] as never);
    vi.mocked(prisma.triageCompetenceCatalogSnapshot.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.triageCompetenceCatalogSnapshot.findMany).mockResolvedValue([
      snapshot,
    ] as never);

    const result = await new TriageCatalogService(prisma).snapshotForCompetence(
      ORGANIZATION_ID,
      COMPETENCE_ID,
    );

    expect(result).toEqual([
      expect.objectContaining({ code: "NO_MOVEMENT", label: "Sem movimento" }),
    ]);
    expect(prisma.triageCompetenceCatalogSnapshot.createMany).toHaveBeenCalledWith({
      data: [
        {
          organization_id: ORGANIZATION_ID,
          competence_id: COMPETENCE_ID,
          catalog_item_id: CATALOG_ID,
          kind: "JUSTIFICATION",
          code: "NO_MOVEMENT",
          label: "Sem movimento",
          url: null,
        },
      ],
      skipDuplicates: true,
    });
  });

  it("não incorpora item novo quando a competência já tem qualquer snapshot", async () => {
    const prisma = createMockPrisma();
    const existingSnapshot = {
      id: "f0000000-0000-4000-8000-000000000001",
      organization_id: ORGANIZATION_ID,
      competence_id: COMPETENCE_ID,
      catalog_item_id: CATALOG_ID,
      kind: record.kind,
      code: record.code,
      label: record.label,
      url: record.url,
      created_at: record.created_at,
    };
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue({ id: COMPETENCE_ID } as never);
    vi.mocked(prisma.triageCompetenceCatalogSnapshot.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingSnapshot as never);
    vi.mocked(prisma.triageCatalogItem.findMany).mockResolvedValue([record] as never);
    vi.mocked(prisma.triageCompetenceCatalogSnapshot.findMany).mockResolvedValue([
      existingSnapshot,
    ] as never);

    await new TriageCatalogService(prisma).snapshotForCompetence(ORGANIZATION_ID, COMPETENCE_ID);
    await new TriageCatalogService(prisma).snapshotForCompetence(ORGANIZATION_ID, COMPETENCE_ID);

    expect(prisma.triageCatalogItem.findMany).toHaveBeenCalledOnce();
    expect(prisma.triageCompetenceCatalogSnapshot.createMany).toHaveBeenCalledOnce();
  });
});
