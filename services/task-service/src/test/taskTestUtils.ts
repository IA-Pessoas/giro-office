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
    requestTaskCompletion: Mock;
    concludeTask: Mock;
    approveTaskCompletion: Mock;
    cancelTaskCompletion: Mock;
    listTaskCompletionRequests: Mock;
    reopenTask: Mock;
  };
  taskFinanceiroServiceMock: {
    listCollectors: Mock;
    listQueue: Mock;
    setCollectors: Mock;
    settle: Mock;
    settleExpress: Mock;
  };
  taskAttachmentServiceMock: {
    upload: Mock;
    list: Mock;
    createAccessUrl: Mock;
    remove: Mock;
  };
  taskPostponementServiceMock: {
    create: Mock;
    list: Mock;
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
      requestTaskCompletion: vi.fn(),
      concludeTask: vi.fn(),
      approveTaskCompletion: vi.fn(),
      cancelTaskCompletion: vi.fn(),
      listTaskCompletionRequests: vi.fn(),
      reopenTask: vi.fn(),
    },
    taskFinanceiroServiceMock: {
      listCollectors: vi.fn(),
      listQueue: vi.fn(),
      setCollectors: vi.fn(),
      settle: vi.fn(),
      settleExpress: vi.fn(),
    },
    taskAttachmentServiceMock: {
      upload: vi.fn(),
      list: vi.fn(),
      createAccessUrl: vi.fn(),
      remove: vi.fn(),
    },
    taskPostponementServiceMock: {
      create: vi.fn(),
      list: vi.fn(),
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

vi.mock("../services/taskAttachmentService.js", () => ({
  TaskAttachmentService: vi.fn(function TaskAttachmentService() {
    return taskRouteMocks.taskAttachmentServiceMock;
  }),
}));

vi.mock("../services/taskPostponementService.js", () => ({
  TaskPostponementService: vi.fn(function TaskPostponementService() {
    return taskRouteMocks.taskPostponementServiceMock;
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
    supabaseUrl: "http://localhost:54321",
    supabaseServiceRoleKey: "task-attachment-storage-test-key",
    taskAttachmentStorageBucket: "TaskAttachmentsPrivate",
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
  const taskAttachmentServiceMock = taskRouteMocks.taskAttachmentServiceMock;
  const taskPostponementServiceMock = taskRouteMocks.taskPostponementServiceMock;

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
  taskLifecycleServiceMock.requestTaskCompletion.mockResolvedValue({
    id: "request-1",
    status: "pending",
  });
  taskLifecycleServiceMock.approveTaskCompletion.mockResolvedValue({ id: "task-1" });
  taskLifecycleServiceMock.cancelTaskCompletion.mockResolvedValue({
    id: "request-1",
    status: "canceled",
  });
  taskLifecycleServiceMock.listTaskCompletionRequests.mockResolvedValue([]);
  taskLifecycleServiceMock.reopenTask.mockResolvedValue({ id: "task-1", status: "Em Andamento" });
  taskFinanceiroServiceMock.listQueue.mockResolvedValue([]);
  taskFinanceiroServiceMock.listCollectors.mockResolvedValue([]);
  taskFinanceiroServiceMock.setCollectors.mockResolvedValue({ department_id: "department-1", collector_ids: [] });
  taskFinanceiroServiceMock.settle.mockResolvedValue({ task_ids: ["task-1"], settled: 1 });
  taskFinanceiroServiceMock.settleExpress.mockResolvedValue({ task_ids: ["task-1"], settled: 1 });
  taskAttachmentServiceMock.upload.mockResolvedValue({ id: "attachment-1" });
  taskAttachmentServiceMock.list.mockResolvedValue([]);
  taskAttachmentServiceMock.createAccessUrl.mockResolvedValue({
    url: "https://signed.example/file",
  });
  taskAttachmentServiceMock.remove.mockResolvedValue({ id: "attachment-1" });
  taskPostponementServiceMock.create.mockResolvedValue({ id: "postponement-1" });
  taskPostponementServiceMock.list.mockResolvedValue([]);
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
const taskAttachmentServiceMock: TaskRouteMocks["taskAttachmentServiceMock"] =
  taskRouteMocks.taskAttachmentServiceMock;
const taskPostponementServiceMock: TaskRouteMocks["taskPostponementServiceMock"] =
  taskRouteMocks.taskPostponementServiceMock;

export {
  taskCrudServiceMock,
  taskDependentServiceMock,
  taskFinanceiroServiceMock,
  taskAttachmentServiceMock,
  taskPostponementServiceMock,
  taskIntegrationRegularizeServiceMock,
  taskLifecycleServiceMock,
  taskModelServiceMock,
};
