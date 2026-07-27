import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    holidays: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { HolidayService } from "../services/holidayService.js";

describe("HolidayService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("create lança 409 quando já existe feriado na data", async () => {
    prismaMock.holidays.findFirst.mockResolvedValue({ id: "holiday-1", name: "Natal" });
    const service = new HolidayService();
    await expect(
      service.create({ organization_id: "org-1", name: "Ano Novo", date: new Date("2025-12-25") }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("delete lança 404 quando feriado não existe", async () => {
    prismaMock.holidays.deleteMany.mockResolvedValue({ count: 0 });
    const service = new HolidayService();
    await expect(
      service.delete({ id: "holiday-1", organization_id: "org-1" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
