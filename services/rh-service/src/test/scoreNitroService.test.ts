import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    scoreNitro: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    scoreQuarter: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    rhNitroHoursSubmission: { aggregate: vi.fn() },
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { ScoreNitroService } from "../services/scoreNitroService.js";

describe("ScoreNitroService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updateMetric lança 404 quando registro nitro não existe", async () => {
    prismaMock.scoreNitro.findUnique.mockResolvedValue(null);
    const service = new ScoreNitroService();
    await expect(
      service.updateMetric("org-1", "user-1", {
        score_id: "550e8400-e29b-41d4-a716-446655440099",
        type: "projects",
        value: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("updateMetric lança 400 quando organization_id é vazio", async () => {
    const service = new ScoreNitroService();
    await expect(
      service.updateMetric("", "user-1", {
        score_id: "550e8400-e29b-41d4-a716-446655440099",
        type: "projects",
        value: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("updateMetric bloqueia alteração Nitro em OfficeV1 concluído sem trilha auditável", async () => {
    prismaMock.scoreNitro.findUnique.mockResolvedValue({ organization_id: "org-1" });
    prismaMock.scoreQuarter.findUnique.mockResolvedValue({
      organization_id: "org-1",
      formula_version: "OfficeV1",
      evaluations: [{ status: "Completed" }],
    });

    await expect(
      new ScoreNitroService().updateMetric("org-1", "user-1", {
        score_id: "550e8400-e29b-41d4-a716-446655440099",
        type: "projects",
        value: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prismaMock.scoreNitro.update).not.toHaveBeenCalled();
  });

  it("updateMetric bloqueia alteração Nitro para fórmula desconhecida", async () => {
    prismaMock.scoreNitro.findUnique.mockResolvedValue({ organization_id: "org-1" });
    prismaMock.scoreQuarter.findUnique.mockResolvedValue({
      organization_id: "org-1",
      formula_version: "FutureV2",
      evaluations: [{ status: "Pending" }],
    });

    await expect(
      new ScoreNitroService().updateMetric("org-1", "user-1", {
        score_id: "550e8400-e29b-41d4-a716-446655440099",
        type: "projects",
        value: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prismaMock.scoreNitro.update).not.toHaveBeenCalled();
  });

  it("deriva o bônus manual de horas somente do total de certificados aceitos", async () => {
    prismaMock.scoreNitro.findUnique.mockResolvedValue({ organization_id: "org-1" });
    prismaMock.scoreQuarter.findUnique.mockResolvedValue({
      id: "score-1",
      organization_id: "org-1",
      user_id: "user-1",
      quarter: "2026-Q3",
      formula_version: "LegacyV1",
      evaluations: [],
    });
    prismaMock.rhNitroHoursSubmission.aggregate.mockResolvedValue({ _sum: { hours: 10 } });
    prismaMock.scoreNitro.update.mockResolvedValue({ id: "nitro-1" });

    await new ScoreNitroService().updateMetric("org-1", "rh-1", {
      score_id: "score-1",
      type: "hours",
      value: 0,
    });

    expect(prismaMock.rhNitroHoursSubmission.aggregate).toHaveBeenCalledWith({
      where: {
        organization_id: "org-1",
        user_id: "user-1",
        quarter: "2026-Q3",
        status: "Accepted",
      },
      _sum: { hours: true },
    });
    expect(prismaMock.scoreNitro.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { hours_score: 1, total_hours: 10 } }),
    );
  });
});
