import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { TiRobotService } from "../services/tiRobotService.js";

const context = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000001",
  permission: 3,
};

const robotId = "90000000-0000-4000-8000-000000000001";

describe("TiRobotService", () => {
  it("creates robots scoped to the authenticated organization", async () => {
    const prisma = {
      tIRobot: {
        create: vi.fn(async ({ data }) => ({ id: robotId, ...data })),
      },
    };
    const service = new TiRobotService(prisma as never);

    const result = await service.create(context, {
      name: "Backup diario",
      description: "Executa backup dos arquivos internos.",
      type: "Backup",
      schedule: "0 2 * * *",
      status: "active",
      active: true,
    });

    expect(result).toMatchObject({
      id: robotId,
      name: "Backup diario",
      type: "Backup",
      status: "active",
      active: true,
      organization_id: context.organizationId,
    });
  });

  it("records robot run", async () => {
    const prisma = {
      tIRobot: {
        findFirst: vi.fn(async () => ({ id: robotId, organization_id: context.organizationId })),
      },
      tIRobotRun: {
        create: vi.fn(async ({ data }) => ({ id: "run-1", ...data })),
      },
    };
    const service = new TiRobotService(prisma as never);

    const result = await service.createRun(context, robotId, {
      status: "success",
      message: "Executado manualmente.",
      metadata_json: { durationMs: 2300 },
    });

    expect(result).toMatchObject({
      id: "run-1",
      robot_id: robotId,
      status: "success",
      message: "Executado manualmente.",
      organization_id: context.organizationId,
    });
  });

  it("rejects runs for robots outside the organization", async () => {
    const prisma = {
      tIRobot: {
        findFirst: vi.fn(async () => null),
      },
      tIRobotRun: {
        create: vi.fn(),
      },
    };
    const service = new TiRobotService(prisma as never);

    await expect(
      service.createRun(context, robotId, {
        status: "failed",
        message: "Nao encontrado.",
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Robo de TI nao encontrado.",
    });
    expect(prisma.tIRobotRun.create).not.toHaveBeenCalled();
  });
});
