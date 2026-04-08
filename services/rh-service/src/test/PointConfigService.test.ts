import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    pointsConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { PointConfigService } from "../services/PointConfigService.js";

describe("PointConfigService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upsert lança 400 quando user_id não é informado", async () => {
    const service = new PointConfigService();
    await expect(service.upsert({
      user_id: "",
      organization_id: "org-1",
      start_time: "08:00",
      lunch_break: "12:00",
      lunch_return: "13:00",
      end_time: "18:00",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("getByUserId lança 400 quando organization_id não é informado", async () => {
    const service = new PointConfigService();
    await expect(service.getByUserId("user-1", "")).rejects.toMatchObject({ statusCode: 400 });
  });
});
