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

  it("create lança 404 quando ponto não existe", async () => {
    prismaMock.point.findUnique.mockResolvedValue(null);
    const service = new TimeClockRequestService();
    await expect(service.create({
      user_id: "user-1",
      organization_id: "org-1",
      point_id: "point-1",
      clock_in: new Date(),
      lunch_out: new Date(),
      lunch_in: new Date(),
      clock_out: new Date(),
      justification: "Ajuste",
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("approve lança 404 quando solicitação não existe", async () => {
    prismaMock.timeClockRequest.findUnique.mockResolvedValue(null);
    const service = new TimeClockRequestService();
    await expect(service.approve({ request_id: "req-1", approver_user_id: "user-2", organization_id: "org-1" })).rejects.toMatchObject({ statusCode: 404 });
  });
});
