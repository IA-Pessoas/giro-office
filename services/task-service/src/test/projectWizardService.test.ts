import { describe, expect, it, vi } from "vitest";

import type { ProjectWizardIntegration } from "../integrations/projectWizard.js";
import { ProjectWizardService } from "../services/projectWizardService.js";

const request = {
  userId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  organizationId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  integracaoLevel: 2 as const,
  idempotencyKey: "wizard-open-1",
  client_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  name: "Novo projeto",
  start_date: new Date("2026-09-01T00:00:00.000Z"),
  objective: "Objetivo do projeto",
  tasks: [],
};

describe("ProjectWizardService", () => {
  it("cria projeto e retorna contadores zerados", async () => {
    const integration: ProjectWizardIntegration = {
      createProject: vi.fn(async () => ({ id: "project-1", name: "Novo projeto" })),
    };

    const result = await new ProjectWizardService(integration).create(request);

    expect(integration.createProject).toHaveBeenCalledWith(request);
    expect(result).toEqual({
      project: { id: "project-1", name: "Novo projeto" },
      counts: { main: 0, dependencies: 0, unassigned: 0 },
    });
  });

  it("bloqueia nível 1 antes de chamar o project-service", async () => {
    const integration: ProjectWizardIntegration = { createProject: vi.fn() };

    await expect(
      new ProjectWizardService(integration).create({ ...request, integracaoLevel: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(integration.createProject).not.toHaveBeenCalled();
  });

  it("permite owner sem nível de Integração", async () => {
    const integration: ProjectWizardIntegration = {
      createProject: vi.fn(async () => ({ id: "project-1" })),
    };

    await expect(
      new ProjectWizardService(integration).create({
        ...request,
        integracaoLevel: 0,
        isOwner: true,
        userType: "owner",
      }),
    ).resolves.toMatchObject({ project: { id: "project-1" } });
  });

  it("cria Tarefas principais manuais e conta o resultado persistido", async () => {
    const integration: ProjectWizardIntegration = {
      createProject: vi.fn(async () => ({ id: "project-1", client_id: request.client_id })),
    };
    const taskCreator = {
      createTask: vi
        .fn()
        .mockResolvedValueOnce({ create: { id: "task-1", responsible_id: "user-1" } })
        .mockResolvedValueOnce({ create: { id: "task-2", responsible_id: null } }),
    };
    const tasks = [
      {
        name: "Revisar documentos",
        department_id: "department-1",
        model_id: "model-1",
        prevision_date: "2026-09-15",
        responsible_id: "user-1",
      },
      {
        name: "Protocolar pedido",
        department_id: "department-2",
        model_id: "model-2",
        responsible_id: null,
      },
    ];

    const result = await new ProjectWizardService(integration, taskCreator).create({
      ...request,
      tasks,
    });

    expect(taskCreator.createTask).toHaveBeenNthCalledWith(1, {
      user_id: request.userId,
      organization_id: request.organizationId,
      model_id: "model-1",
      project_id: "project-1",
      client_id: request.client_id,
      prospecting_status: "Fechado",
      name: "Revisar documentos",
      status: "A Realizar",
      department_id: "department-1",
      observations: "",
      urgency: "",
      responsible_id: "user-1",
      prevision_date: "2026-09-15",
      integracaoLevel: request.integracaoLevel,
      isOwner: false,
      createDependencies: false,
    });
    expect(taskCreator.createTask).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        project_id: "project-1",
        client_id: request.client_id,
        status: "A Realizar",
        responsible_id: null,
        createDependencies: false,
      }),
    );
    expect(result).toEqual({
      project: { id: "project-1", client_id: request.client_id },
      counts: { main: 2, dependencies: 0, unassigned: 1 },
    });
  });

  it("bloqueia nível 1 antes de criar Projeto ou Tarefas", async () => {
    const integration: ProjectWizardIntegration = { createProject: vi.fn() };
    const taskCreator = { createTask: vi.fn() };

    await expect(
      new ProjectWizardService(integration, taskCreator).create({
        ...request,
        tasks: [{ name: "Tarefa", department_id: "department-1", model_id: "model-1" }],
        integracaoLevel: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(integration.createProject).not.toHaveBeenCalled();
    expect(taskCreator.createTask).not.toHaveBeenCalled();
  });
});
