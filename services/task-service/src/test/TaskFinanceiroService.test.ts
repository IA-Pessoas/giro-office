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

import { TaskFinanceiroService } from "../services/TaskFinanceiroService.js";

describe("TaskFinanceiroService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updateChargeFinanceiro lança 404 quando tarefa não existe", async () => {
    prismaMock.task.findFirst.mockResolvedValue(null);
    const service = new TaskFinanceiroService();

    await expect(
      service.updateChargeFinanceiro({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
