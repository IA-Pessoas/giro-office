import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    taskModel: {
      findFirst: vi.fn(),
    },
    taskDependent: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  auditMock: {
    createLog: vi.fn(),
  },
}));

vi.mock("../prisma/index.js", () => ({ default: prismaMock }));
vi.mock("../integrations/audit.js", () => auditMock);

import { TaskDependentService } from "../services/taskDependentService.js";

describe("TaskDependentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("addDependent lança 400 quando a tarefa depende de si mesma", async () => {
    const service = new TaskDependentService(prismaMock as never, auditMock as never);

    await expect(
      service.addDependent({
        user_id: "user-1",
        organization_id: "org-1",
        task_model_id: "model-1",
        dependent_id: "model-1",
        wait: true,
        observation: "obs",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("deleteDependent lança 404 quando dependência não existe", async () => {
    prismaMock.taskDependent.findFirst.mockResolvedValue(null);
    const service = new TaskDependentService(prismaMock as never, auditMock as never);

    await expect(
      service.deleteDependent({
        id: "dep-1",
        user_id: "user-1",
        organization_id: "org-1",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
