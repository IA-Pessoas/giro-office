import { Writable } from "node:stream";

import { createLogger } from "@workspace/shared/logger";
import type { NextFunction } from "express";
import { vi } from "vitest";

const {
  taskCrudServiceMock,
  taskModelServiceMock,
  taskDependentServiceMock,
  taskIntegrationRegularizeServiceMock,
  taskLifecycleServiceMock,
  taskComercialServiceMock,
  taskFinanceiroServiceMock,
} = vi.hoisted(() => ({
  taskCrudServiceMock: {
    createTask: vi.fn(),
    listTasks: vi.fn(),
    updateTask: vi.fn(),
    detailTask: vi.fn(),
    deleteTask: vi.fn(),
  },
  taskModelServiceMock: {
    createModel: vi.fn(),
    detailModel: vi.fn(),
    updateModel: vi.fn(),
    listModel: vi.fn(),
    deleteModel: vi.fn(),
  },
  taskDependentServiceMock: {
    addDependent: vi.fn(),
    listDependents: vi.fn(),
    deleteDependent: vi.fn(),
  },
  taskIntegrationRegularizeServiceMock: {
    createLink: vi.fn(),
    removeLink: vi.fn(),
    list: vi.fn(),
  },
  taskLifecycleServiceMock: {
    concludeTask: vi.fn(),
    approveTaskCompletion: vi.fn(),
  },
  taskComercialServiceMock: {
    updateChargeComercial: vi.fn(),
  },
  taskFinanceiroServiceMock: {
    updateChargeFinanceiro: vi.fn(),
  },
}));

vi.mock("../services/taskCrudService.js", () => ({
  TaskCrudService: vi.fn(function TaskCrudService() {
    return taskCrudServiceMock;
  }),
}));

vi.mock("../services/taskModelService.js", () => ({
  TaskModelService: vi.fn(function TaskModelService() {
    return taskModelServiceMock;
  }),
}));

vi.mock("../services/taskDependentService.js", () => ({
  TaskDependentService: vi.fn(function TaskDependentService() {
    return taskDependentServiceMock;
  }),
}));

vi.mock("../services/taskIntegrationRegularizeService.js", () => ({
  TaskIntegrationRegularizeService: vi.fn(function TaskIntegrationRegularizeService() {
    return taskIntegrationRegularizeServiceMock;
  }),
}));

vi.mock("../services/taskLifecycleService.js", () => ({
  TaskLifecycleService: vi.fn(function TaskLifecycleService() {
    return taskLifecycleServiceMock;
  }),
}));

vi.mock("../services/taskComercialService.js", () => ({
  TaskComercialService: vi.fn(function TaskComercialService() {
    return taskComercialServiceMock;
  }),
}));

vi.mock("../services/taskFinanceiroService.js", () => ({
  TaskFinanceiroService: vi.fn(function TaskFinanceiroService() {
    return taskFinanceiroServiceMock;
  }),
}));

vi.mock("../middlewares/isAuthenticated.js", () => ({
  isAuthenticated: (
    req: Express.Request,
    _res: Express.Response,
    next: NextFunction,
  ) => {
    req.user_id = "user-1";
    req.organization_id = "org-1";
    next();
  },
}));

import { createTaskApp } from "../app.js";
import type { TaskServiceEnv } from "../config/env.js";

class MemoryLogStream extends Writable {
  _write(
    _chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

export function createTestApp() {
  const env = {
    port: 3032,
    databaseUrl: "postgresql://localhost/task_test",
    jwtSecret: "test-secret",
    nodeEnv: "test",
    logLevel: "silent",
    logPretty: false,
    auditEnabled: false,
    auditServiceUrl: "http://localhost:3020",
    auditServiceToken: "audit-service-token",
    projectServiceUrl: "http://localhost:3033",
    enableApiDocs: false,
  } satisfies TaskServiceEnv;
  const logger = createLogger({
    service: "task-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });

  return createTaskApp(env, logger);
}

export function resetTaskRouteMocks() {
  vi.clearAllMocks();

  taskCrudServiceMock.createTask.mockResolvedValue({ id: "task-1" });
  taskCrudServiceMock.listTasks.mockResolvedValue([{ id: "task-1" }]);
  taskCrudServiceMock.updateTask.mockResolvedValue({ id: "task-1" });
  taskCrudServiceMock.detailTask.mockResolvedValue({ id: "task-1" });
  taskCrudServiceMock.deleteTask.mockResolvedValue({ id: "task-1" });

  taskModelServiceMock.createModel.mockResolvedValue({ id: "model-1" });
  taskModelServiceMock.detailModel.mockResolvedValue({ id: "model-1" });
  taskModelServiceMock.updateModel.mockResolvedValue({ id: "model-1" });
  taskModelServiceMock.listModel.mockResolvedValue([{ id: "model-1" }]);
  taskModelServiceMock.deleteModel.mockResolvedValue({ id: "model-1" });

  taskDependentServiceMock.addDependent.mockResolvedValue({ id: "dep-1" });
  taskDependentServiceMock.listDependents.mockResolvedValue([{ id: "dep-1" }]);
  taskDependentServiceMock.deleteDependent.mockResolvedValue({ id: "dep-1" });

  taskIntegrationRegularizeServiceMock.createLink.mockResolvedValue({ id: "integration-1" });
  taskIntegrationRegularizeServiceMock.removeLink.mockResolvedValue({ id: "integration-1" });
  taskIntegrationRegularizeServiceMock.list.mockResolvedValue([{ id: "integration-1" }]);

  taskLifecycleServiceMock.concludeTask.mockResolvedValue({ id: "task-1" });
  taskLifecycleServiceMock.approveTaskCompletion.mockResolvedValue({ id: "task-1" });
  taskComercialServiceMock.updateChargeComercial.mockResolvedValue({ id: "task-1" });
  taskFinanceiroServiceMock.updateChargeFinanceiro.mockResolvedValue({ id: "task-1" });
}

export {
  taskComercialServiceMock,
  taskCrudServiceMock,
  taskDependentServiceMock,
  taskFinanceiroServiceMock,
  taskIntegrationRegularizeServiceMock,
  taskLifecycleServiceMock,
  taskModelServiceMock,
};
