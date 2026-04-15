import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    taskModel: {
      findFirst: vi.fn(),
    },
    tasksIntegrationRegularize: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
  auditMock: {
    createLog: vi.fn(),
  },
}));

vi.mock("../prisma/index.js", () => ({ default: prismaMock }));
vi.mock("../integrations/audit.js", () => auditMock);

import { TaskIntegrationRegularizeService } from "../services/taskIntegrationRegularizeService.js";

describe("TaskIntegrationRegularizeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createLink lança 404 quando modelo não existe", async () => {
    prismaMock.taskModel.findFirst.mockResolvedValue(null);
    const service = new TaskIntegrationRegularizeService();

    await expect(
      service.createLink({
        user_id: "user-1",
        organization_id: "org-1",
        task_model_id: "model-1",
        referring: "regularize",
        referring_type: "folder",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("removeLink lança 404 quando vínculo não existe", async () => {
    prismaMock.tasksIntegrationRegularize.deleteMany.mockResolvedValue({ count: 0 });
    const service = new TaskIntegrationRegularizeService();

    await expect(
      service.removeLink({
        user_id: "user-1",
        organization_id: "org-1",
        integration_id: "integration-1",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
