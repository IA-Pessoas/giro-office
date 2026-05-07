import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, pointServiceMock } = vi.hoisted(() => ({
  prismaMock: {
    point: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    timeClockRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    pointsConfig: {
      update: vi.fn(),
    },
  },
  pointServiceMock: {
    calculateDailyHours: vi.fn(),
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));
vi.mock("../services/pointService.js", () => ({
  PointService: vi.fn(function PointService() {
    return pointServiceMock;
  }),
}));

import { TimeClockRequestService } from "../services/timeClockRequestService.js";

describe("TimeClockRequestService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("create lanca 404 quando ponto nao existe", async () => {
    prismaMock.point.findUnique.mockResolvedValue(null);
    const service = new TimeClockRequestService();
    await expect(
      service.create({
        user_id: "user-1",
        organization_id: "org-1",
        point_id: "point-1",
        clock_in: new Date(),
        lunch_out: new Date(),
        lunch_in: new Date(),
        clock_out: new Date(),
        justification: "Ajuste",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("approve lanca 404 quando solicitacao nao existe", async () => {
    prismaMock.timeClockRequest.findUnique.mockResolvedValue(null);
    const service = new TimeClockRequestService();
    await expect(
      service.approve({
        request_id: "req-1",
        approver_user_id: "user-2",
        organization_id: "org-1",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("list filtra por status", async () => {
    prismaMock.timeClockRequest.findMany.mockResolvedValue([]);
    const service = new TimeClockRequestService();

    await service.list("org-1", { status: "Pendente" });

    expect(prismaMock.timeClockRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: "org-1",
          status: "Pendente",
        }),
      }),
    );
  });

  it("list filtra por user_id", async () => {
    prismaMock.timeClockRequest.findMany.mockResolvedValue([]);
    const service = new TimeClockRequestService();

    await service.list("org-1", { user_id: "user-1" });

    expect(prismaMock.timeClockRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: "org-1",
          user_id: "user-1",
        }),
      }),
    );
  });
});
