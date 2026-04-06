import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectProgressIntegration } from "../src/integrations/project-progress.js";
import { TaskWorkflowService } from "../src/services/TaskWorkflowService.js";

test("aciona o project-service apos criar tarefa", async () => {
  const calls: Array<{ projectId: string; userId: string; organizationId: string }> = [];
  const projectProgressIntegration: ProjectProgressIntegration = {
    async recalculateProjectProgress(params) {
      calls.push(params);
    },
  };
  const service = new TaskWorkflowService(projectProgressIntegration);

  await service.afterTaskCreated({
    projectId: "project-1",
    userId: "user-1",
    organizationId: "org-1",
  });

  assert.deepEqual(calls, [
    {
      projectId: "project-1",
      userId: "user-1",
      organizationId: "org-1",
    },
  ]);
});

test("recalcula o projeto apos update quando o status muda", async () => {
  const calls: Array<{ projectId: string; userId: string; organizationId: string }> = [];
  const projectProgressIntegration: ProjectProgressIntegration = {
    async recalculateProjectProgress(params) {
      calls.push(params);
    },
  };
  const service = new TaskWorkflowService(projectProgressIntegration);

  await service.afterTaskUpdated({
    taskId: "task-1",
    projectId: "project-1",
    userId: "user-1",
    organizationId: "org-1",
    previousStatus: "A Realizar",
    newStatus: "Em Andamento",
    previousBilling: "Realizar",
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    projectId: "project-1",
    userId: "user-1",
    organizationId: "org-1",
  });
});

test("nao recalcula o projeto apos update quando o status nao muda", async () => {
  const calls: Array<{ projectId: string; userId: string; organizationId: string }> = [];
  const projectProgressIntegration: ProjectProgressIntegration = {
    async recalculateProjectProgress(params) {
      calls.push(params);
    },
  };
  const service = new TaskWorkflowService(projectProgressIntegration);

  await service.afterTaskUpdated({
    taskId: "task-1",
    projectId: "project-1",
    userId: "user-1",
    organizationId: "org-1",
    previousStatus: "Em Andamento",
    newStatus: "Em Andamento",
    previousBilling: "Realizar",
  });

  assert.equal(calls.length, 0);
});
