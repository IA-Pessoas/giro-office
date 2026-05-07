import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, envMock } = vi.hoisted(() => ({
  prismaMock: {
    point: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    pointsConfig: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    holidays: {
      findFirst: vi.fn(),
    },
  },
  envMock: { pointMinIntervalMinutes: 30 },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));
vi.mock("../config/env.js", () => ({ getRhEnv: () => envMock }));

import { PointService } from "../services/pointService.js";

describe("PointService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registerPoint lança 400 quando user_id é obrigatório", async () => {
    const service = new PointService();
    await expect(
      service.registerPoint({ user_id: "", organization_id: "org-1" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("calculateDailyHours lança 404 quando ponto não existe", async () => {
    prismaMock.point.findUnique.mockResolvedValue(null);
    const service = new PointService();
    await expect(service.calculateDailyHours("point-1", "org-1")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
