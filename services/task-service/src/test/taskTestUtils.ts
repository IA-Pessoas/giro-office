import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import type { NextFunction } from "express";
import { type Mock, vi } from "vitest";

interface TaskRouteMocks {
  taskCrudServiceMock: {
    createTask: Mock;
    listTasks: Mock;
    updateTask: Mock;
    detailTask: Mock;
    deleteTask: Mock;
  };
  taskModelServiceMock: {
    createModel: Mock;
    detailModel: Mock;
    updateModel: Mock;
    listModel: Mock;
    deleteModel: Mock;
  };
  taskDependentServiceMock: {
    addDependent: Mock;
    listDependents: Mock;
    deleteDependent: Mock;
  };
  taskIntegrationRegularizeServiceMock: {
    createLink: Mock;
    removeLink: Mock;
    list: Mock;
  };
  taskLifecycleServiceMock: {
    concludeTask: Mock;
    approveTaskCompletion: Mock;
  };
  taskFinanceiroServiceMock: {
    updateChargeFinanceiro: Mock;
  };
}

const taskRouteMocks: TaskRouteMocks = vi.hoisted(
  (): TaskRouteMocks => ({
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
    taskFinanceiroServiceMock: {
      updateChargeFinanceiro: vi.fn(),
    },
  }),
);

vi.mock("../services/taskCrudService.js", () => ({
  TaskCrudService: vi.fn(function TaskCrudService() {
    return taskRouteMocks.taskCrudServiceMock;
  }),
}));

vi.mock("../services/taskModelService.js", () => ({
  TaskModelService: vi.fn(function TaskModelService() {
    return taskRouteMocks.taskModelServiceMock;
  }),
}));

vi.mock("../services/taskDependentService.js", () => ({
  TaskDependentService: vi.fn(function TaskDependentService() {
    return taskRouteMocks.taskDependentServiceMock;
  }),
}));

vi.mock("../services/taskIntegrationRegularizeService.js", () => ({
  TaskIntegrationRegularizeService: vi.fn(function TaskIntegrationRegularizeService() {
    return taskRouteMocks.taskIntegrationRegularizeServiceMock;
  }),
}));

vi.mock("../services/taskLifecycleService.js", () => ({
  TaskLifecycleService: vi.fn(function TaskLifecycleService() {
    return taskRouteMocks.taskLifecycleServiceMock;
  }),
}));

vi.mock("../services/taskFinanceiroService.js", () => ({
  TaskFinanceiroService: vi.fn(function TaskFinanceiroService() {
    return taskRouteMocks.taskFinanceiroServiceMock;
  }),
}));

vi.mock("../middlewares/isAuthenticated.js", () => ({
  isAuthenticated: (req: Express.Request, _res: Express.Response, next: NextFunction) => {
    req.user_id = "user-1";
    req.organization_id = "org-1";
    next();
  },
}));

import { createTaskApp } from "../app.js";
import type { TaskServiceEnv } from "../config/env.js";

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
    commercialServiceToken: "audit-service-token",
    projectServiceUrl: "http://localhost:3033",
    aiExtractionMode: "fake" as const,
    aiExtractionTimeoutMs: 30_000,
    aiExtractionRateLimitMax: 10,
    aiExtractionRateLimitWindowMs: 60_000,
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

  const taskCrudServiceMock = taskRouteMocks.taskCrudServiceMock;
  const taskModelServiceMock = taskRouteMocks.taskModelServiceMock;
  const taskDependentServiceMock = taskRouteMocks.taskDependentServiceMock;
  const taskIntegrationRegularizeServiceMock = taskRouteMocks.taskIntegrationRegularizeServiceMock;
  const taskLifecycleServiceMock = taskRouteMocks.taskLifecycleServiceMock;
  const taskFinanceiroServiceMock = taskRouteMocks.taskFinanceiroServiceMock;

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
  taskFinanceiroServiceMock.updateChargeFinanceiro.mockResolvedValue({ id: "task-1" });
}

const taskCrudServiceMock: TaskRouteMocks["taskCrudServiceMock"] =
  taskRouteMocks.taskCrudServiceMock;
const taskModelServiceMock: TaskRouteMocks["taskModelServiceMock"] =
  taskRouteMocks.taskModelServiceMock;
const taskDependentServiceMock: TaskRouteMocks["taskDependentServiceMock"] =
  taskRouteMocks.taskDependentServiceMock;
const taskIntegrationRegularizeServiceMock: TaskRouteMocks["taskIntegrationRegularizeServiceMock"] =
  taskRouteMocks.taskIntegrationRegularizeServiceMock;
const taskLifecycleServiceMock: TaskRouteMocks["taskLifecycleServiceMock"] =
  taskRouteMocks.taskLifecycleServiceMock;
const taskFinanceiroServiceMock: TaskRouteMocks["taskFinanceiroServiceMock"] =
  taskRouteMocks.taskFinanceiroServiceMock;

export {
  taskCrudServiceMock,
  taskDependentServiceMock,
  taskFinanceiroServiceMock,
  taskIntegrationRegularizeServiceMock,
  taskLifecycleServiceMock,
  taskModelServiceMock,
};
