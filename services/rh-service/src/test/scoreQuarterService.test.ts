import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    scoreQuarter: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    scoreQuestion: {
      findMany: vi.fn(),
    },
    scoreEvaluation: {
      create: vi.fn(),
    },
    scoreNitro: {},
    $transaction: vi.fn(),
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { ScoreQuarterService } from "../services/scoreQuarterService.js";

describe("ScoreQuarterService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generateQuarterlyScore lanca 409 quando trimestre ja existe", async () => {
    prismaMock.scoreQuarter.findUnique.mockResolvedValue({ id: "score-1" });
    const service = new ScoreQuarterService();
    await expect(
      service.generateQuarterlyScore({
        organization_id: "org-1",
        target_user_id: "user-1",
        quarter: "2026-Q1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("generateQuarterlyScore identifica novos trimestres com a formula legada", async () => {
    prismaMock.scoreQuarter.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      organization_id: "org-1",
      department_id: null,
      permissions: [{ organization_id: "org-1", rh: 0 }],
      permissionRef: { organization_id: "org-1", rh: 0 },
    });

    const tx = {
      scoreQuarter: {
        create: vi.fn().mockResolvedValue({ id: "score-1", formula_version: "LegacyV1" }),
      },
      scoreQuestion: { findMany: vi.fn().mockResolvedValue([]) },
      scoreEvaluation: { create: vi.fn() },
    };
    prismaMock.$transaction.mockImplementation(async (callback) =>
      (callback as (transaction: typeof tx) => Promise<unknown>)(tx),
    );

    await new ScoreQuarterService().generateQuarterlyScore({
      organization_id: "org-1",
      target_user_id: "user-1",
      quarter: "2026-Q4",
    });

    expect(tx.scoreQuarter.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ formula_version: "LegacyV1" }),
    });
  });

  it("getDetail lanca 404 quando score nao existe", async () => {
    prismaMock.scoreQuarter.findUnique.mockResolvedValue(null);
    const service = new ScoreQuarterService();
    await expect(
      service.getDetail({
        organization_id: "org-1",
        score_id: "score-1",
        user_id: "user-1",
        can_manage: false,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("getDetail inclui usuario dono do score com id e nome", async () => {
    prismaMock.scoreQuarter.findUnique.mockResolvedValue({
      id: "score-1",
      user_id: "user-1",
      organization_id: "org-1",
      formula_version: "OfficeV1",
      user: { id: "user-1", name: "Ana Silva" },
      nitro: null,
      evaluations: [],
    });

    const service = new ScoreQuarterService();
    await expect(
      service.getDetail({
        organization_id: "org-1",
        score_id: "score-1",
        user_id: "user-1",
        can_manage: false,
      }),
    ).resolves.toMatchObject({
      id: "score-1",
      formula_version: "OfficeV1",
      user: { id: "user-1", name: "Ana Silva" },
    });
    expect(prismaMock.scoreQuarter.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          user: { select: { id: true, name: true } },
        }),
      }),
    );
  });

  it("getDetail bloqueia usuario comum ao acessar score de terceiro", async () => {
    prismaMock.scoreQuarter.findUnique.mockResolvedValue({
      id: "score-1",
      user_id: "other-user",
      organization_id: "org-1",
      user: { id: "other-user", name: "Outra Pessoa" },
      nitro: null,
      evaluations: [],
    });

    const service = new ScoreQuarterService();
    await expect(
      service.getDetail({
        organization_id: "org-1",
        score_id: "score-1",
        user_id: "user-1",
        can_manage: false,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("getDetail permite gestor acessar score de terceiro", async () => {
    prismaMock.scoreQuarter.findUnique.mockResolvedValue({
      id: "score-1",
      user_id: "other-user",
      organization_id: "org-1",
      user: { id: "other-user", name: "Outra Pessoa" },
      nitro: null,
      evaluations: [],
    });

    const service = new ScoreQuarterService();
    await expect(
      service.getDetail({
        organization_id: "org-1",
        score_id: "score-1",
        user_id: "manager-1",
        can_manage: true,
      }),
    ).resolves.toMatchObject({ id: "score-1", user_id: "other-user" });
  });

  it("listForUser mantem scores isolados pela organizacao", async () => {
    prismaMock.scoreQuarter.findMany.mockResolvedValue([]);

    await expect(new ScoreQuarterService().listForUser("org-1", "user-1")).resolves.toEqual([]);

    expect(prismaMock.scoreQuarter.findMany).toHaveBeenCalledWith({
      where: { user_id: "user-1", organization_id: "org-1" },
      include: { nitro: true },
      orderBy: { quarter: "desc" },
    });
  });
});
