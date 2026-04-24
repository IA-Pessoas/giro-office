import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    timeSheets: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { TimeSheetService } from "../services/timeSheetService.js";

describe("TimeSheetService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("create lança 400 quando end_time não é posterior ao start_time", async () => {
    const service = new TimeSheetService();
    const start = new Date("2025-01-01T10:00:00.000Z");
    await expect(
      service.create({
        organization_id: "org-1",
        user_id: "user-1",
        start_time: start,
        end_time: start,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("sign lança 404 quando folha não existe", async () => {
    prismaMock.timeSheets.findFirst.mockResolvedValue(null);
    const service = new TimeSheetService();
    await expect(
      service.sign({
        organization_id: "org-1",
        timesheet_id: "sheet-1",
        signer_user_id: "user-1",
        signature: "assinatura",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
