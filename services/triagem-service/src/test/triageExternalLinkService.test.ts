import { describe, expect, it, vi } from "vitest";

import {
  type TriageExternalLinkPrisma,
  TriageExternalLinkService,
} from "../services/triageExternalLinkService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const RESPONSIBLE_ID = "c0000000-0000-4000-8000-000000000002";
const LINK_ID = "d0000000-0000-4000-8000-000000000001";

const record = {
  id: LINK_ID,
  organization_id: ORGANIZATION_ID,
  client_id: CLIENT_ID,
  competence: "2026-09",
  type: "DRIVE",
  url: "https://drive.example.test/triagem",
  description: "Pasta mensal",
  responsible_id: RESPONSIBLE_ID,
  archived_at: null,
  created_at: new Date("2026-09-18T00:00:00.000Z"),
  updated_at: new Date("2026-09-18T00:00:00.000Z"),
  responsible: { id: RESPONSIBLE_ID, name: "Ana", status: "Ativo" },
};

function createMockPrisma(): TriageExternalLinkPrisma {
  const prisma = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(async (callback: (transaction: TriageExternalLinkPrisma) => unknown) =>
      callback(prisma as unknown as TriageExternalLinkPrisma),
    ),
    client: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    triageCompetence: { findFirst: vi.fn() },
    triageCompetenceCatalogSnapshot: { findFirst: vi.fn() },
    triageCatalogItem: { findFirst: vi.fn().mockResolvedValue({ id: "catalog-link-type" }) },
    triageExternalLink: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  return prisma as unknown as TriageExternalLinkPrisma;
}

function editor() {
  return {
    userId: USER_ID,
    organizationId: ORGANIZATION_ID,
    permission: 2,
    modules: { triagem: 2 },
  };
}

describe("TriageExternalLinkService", () => {
  it("cria link HTTPS com tipo, descrição e responsável da organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.client.findFirst).mockResolvedValue({ id: CLIENT_ID } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: RESPONSIBLE_ID } as never);
    vi.mocked(prisma.triageExternalLink.create).mockResolvedValue(record as never);

    const result = await new TriageExternalLinkService(prisma).create(
      {
        client_id: CLIENT_ID,
        competence: "2026-09",
        type: "DRIVE",
        url: "https://drive.example.test/triagem",
        description: "Pasta mensal",
        responsible_id: RESPONSIBLE_ID,
      },
      editor(),
    );

    expect(result).toMatchObject({
      id: LINK_ID,
      client_id: CLIENT_ID,
      competence: "2026-09",
      type: "DRIVE",
      url: "https://drive.example.test/triagem",
      responsible_id: RESPONSIBLE_ID,
    });
    expect(prisma.triageExternalLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: ORGANIZATION_ID,
        client_id: CLIENT_ID,
        competence: "2026-09",
        type: "DRIVE",
        url: "https://drive.example.test/triagem",
        description: "Pasta mensal",
        responsible_id: RESPONSIBLE_ID,
      }),
      select: expect.any(Object),
    });
  });

  it("recusa link em competência arquivada (#1326)", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue({
      id: "competence-1",
      archived_at: new Date("2026-09-20T00:00:00.000Z"),
      catalog_snapshot_initialized_at: new Date("2026-09-01T00:00:00.000Z"),
    } as never);

    await expect(
      new TriageExternalLinkService(prisma).create(
        {
          client_id: CLIENT_ID,
          competence: "2026-09",
          type: "DRIVE",
          url: "https://drive.example.test/triagem",
          description: "Pasta mensal",
          responsible_id: RESPONSIBLE_ID,
        },
        editor(),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.triageExternalLink.create).not.toHaveBeenCalled();
  });

  it("lista somente links ativos da organização, cliente e competência", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageExternalLink.findMany).mockResolvedValue([record] as never);

    const result = await new TriageExternalLinkService(prisma).list(
      { clientId: CLIENT_ID, competence: "2026-09" },
      editor(),
    );

    expect(result).toEqual([expect.objectContaining({ id: LINK_ID, url: record.url })]);
    expect(prisma.triageExternalLink.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: ORGANIZATION_ID,
        client_id: CLIENT_ID,
        competence: "2026-09",
        archived_at: null,
      },
      orderBy: [{ competence: "desc" }, { created_at: "desc" }],
      select: expect.any(Object),
    });
  });

  it("usa o snapshot da competência para preservar um tipo após arquivamento", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue({
      id: "competence-id",
    } as never);
    vi.mocked(prisma.triageCompetenceCatalogSnapshot.findFirst).mockResolvedValue({
      id: "snapshot-id",
    } as never);
    vi.mocked(prisma.client.findFirst).mockResolvedValue({ id: CLIENT_ID } as never);
    vi.mocked(prisma.triageExternalLink.create).mockResolvedValue(record as never);

    await new TriageExternalLinkService(prisma).create(
      {
        client_id: CLIENT_ID,
        competence: "2026-09",
        type: "DRIVE",
        url: "https://drive.example.test/triagem",
      },
      editor(),
    );

    expect(prisma.triageCompetenceCatalogSnapshot.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: ORGANIZATION_ID,
        competence_id: "competence-id",
        kind: "LINK_TYPE",
        code: "DRIVE",
      },
      select: { id: true },
    });
    expect(prisma.triageCatalogItem.findFirst).not.toHaveBeenCalled();
  });

  it("não edita nem arquiva link de competência arquivada (#1326)", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageExternalLink.findFirst).mockResolvedValue(record as never);
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue({
      id: "competence-1",
      archived_at: new Date("2026-09-20T00:00:00.000Z"),
      catalog_snapshot_initialized_at: new Date("2026-09-01T00:00:00.000Z"),
    } as never);
    const service = new TriageExternalLinkService(prisma);

    await expect(service.archive(LINK_ID, editor())).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.triageExternalLink.update).not.toHaveBeenCalled();
  });

  it("revisa tipo, descrição e responsável sem alterar o vínculo do cliente", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageExternalLink.findFirst).mockResolvedValue(record as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: USER_ID } as never);
    vi.mocked(prisma.triageExternalLink.update).mockResolvedValue({
      ...record,
      type: "CLOUD",
      url: "https://cloud.example.test/triagem",
      description: "Pasta revisada",
      responsible_id: USER_ID,
      responsible: { id: USER_ID, name: "Bruno", status: "Ativo" },
    } as never);

    const result = await new TriageExternalLinkService(prisma).update(
      LINK_ID,
      {
        type: "CLOUD",
        url: "https://cloud.example.test/triagem",
        description: "Pasta revisada",
        responsible_id: USER_ID,
      },
      editor(),
    );

    expect(result).toMatchObject({ type: "CLOUD", responsible_id: USER_ID });
    expect(prisma.triageExternalLink.update).toHaveBeenCalledWith({
      where: { id: LINK_ID },
      data: {
        type: "CLOUD",
        url: "https://cloud.example.test/triagem",
        description: "Pasta revisada",
        responsible_id: USER_ID,
      },
      select: expect.any(Object),
    });
  });

  it("arquiva logicamente o link e não o remove", async () => {
    const prisma = createMockPrisma();
    const archived = { ...record, archived_at: new Date("2026-09-18T01:00:00.000Z") };
    vi.mocked(prisma.triageExternalLink.findFirst).mockResolvedValue(record as never);
    vi.mocked(prisma.triageExternalLink.update).mockResolvedValue(archived as never);

    const result = await new TriageExternalLinkService(prisma).archive(LINK_ID, editor());

    expect(result).toMatchObject({ id: LINK_ID, archived_at: archived.archived_at });
    expect(prisma.triageExternalLink.update).toHaveBeenCalledWith({
      where: { id: LINK_ID },
      data: { archived_at: expect.any(Date) },
      select: expect.any(Object),
    });
  });

  it("rejeita HTTP antes de tocar no banco", async () => {
    const prisma = createMockPrisma();

    await expect(
      new TriageExternalLinkService(prisma).create(
        {
          client_id: CLIENT_ID,
          competence: "2026-09",
          type: "DRIVE",
          url: "http://drive.example.test/triagem",
        },
        editor(),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejeita tipo de link ausente ou arquivado no catálogo da organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCatalogItem.findFirst).mockResolvedValue(null);

    await expect(
      new TriageExternalLinkService(prisma).create(
        {
          client_id: CLIENT_ID,
          competence: "2026-09",
          type: "ONEDRIVE",
          url: "https://cloud.example.test/triagem",
        },
        editor(),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.triageExternalLink.create).not.toHaveBeenCalled();
    expect(prisma.triageCatalogItem.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: ORGANIZATION_ID,
        kind: "LINK_TYPE",
        code: "ONEDRIVE",
        archived_at: null,
      },
      select: { id: true },
    });
  });

  it("não aceita responsável de outra organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.client.findFirst).mockResolvedValue({ id: CLIENT_ID } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    await expect(
      new TriageExternalLinkService(prisma).create(
        {
          client_id: CLIENT_ID,
          competence: "2026-09",
          type: "CLOUD",
          url: "https://cloud.example.test/triagem",
          responsible_id: RESPONSIBLE_ID,
        },
        editor(),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(prisma.triageExternalLink.create).not.toHaveBeenCalled();
  });

  it("bloqueia alterações para quem só pode consultar", async () => {
    const prisma = createMockPrisma();

    await expect(
      new TriageExternalLinkService(prisma).archive(LINK_ID, {
        ...editor(),
        permission: 1,
        modules: { triagem: 1 },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
