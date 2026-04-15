import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    task: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
  auditMock: {
    logUpdateIfChanged: vi.fn(),
  },
}));

vi.mock("../prisma/index.js", () => ({ default: prismaMock }));
vi.mock("../integrations/audit.js", () => auditMock);

import { TaskComercialService } from "../services/taskComercialService.js";

describe("TaskComercialService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updateChargeComercial lança 404 quando tarefa não existe", async () => {
    prismaMock.task.findFirst.mockResolvedValue(null);
    const service = new TaskComercialService();

    await expect(
      service.updateChargeComercial({
        user_id: "user-1",
        organization_id: "org-1",
        body: {
          task_id: "task-1",
          hiring_status: "Contratado",
          payment: "Pago",
          billing_description: "desc",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
