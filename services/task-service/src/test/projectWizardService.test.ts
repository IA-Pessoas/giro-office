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
  revision: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
};

describe("ProjectWizardService", () => {
  it("prévia expande somente dependências diretas com status e responsável resolvidos", async () => {
    const integration: ProjectWizardIntegration = { createProject: vi.fn() };
    const compositionRepository = {
      findTaskModels: vi.fn(async () => [
        {
          id: "model-main",
          name: "Principal",
          department_id: "department-1",
          responsible_id: "default-main",
          observations: "Observação principal",
          type: "Projeto",
          department_status: "Ativo",
          dependencies: [
            {
              dependent_id: "model-wait",
              wait: true,
              observation: "Aguardar principal",
              dependent: {
                id: "model-wait",
                name: "Dependência em espera",
                department_id: "department-2",
                responsible_id: "default-wait",
                observations: "Ignorada pela ligação",
                type: "Projeto",
                department_status: "Ativo",
              },
            },
            {
              dependent_id: "model-ready",
              wait: false,
              observation: "Pode iniciar",
              dependent: {
                id: "model-ready",
                name: "Dependência pronta",
                department_id: "department-3",
                responsible_id: "default-ready",
                observations: "",
                type: "Projeto",
                department_status: "Ativo",
              },
            },
          ],
        },
      ]),
      listEligibleTaskResponsibles: vi.fn(async (_organizationId: string, departmentId: string) =>
        departmentId === "department-3" ? [] : [{ id: `responsible-${departmentId}` }],
      ),
    };
    const service = new ProjectWizardService(
      integration,
      { createTask: vi.fn() },
      compositionRepository,
    );

    await expect(
      service.preview({
        ...request,
        tasks: [
          {
            name: "Tarefa principal",
            department_id: "department-1",
            model_id: "model-main",
            responsible_id: "responsible-department-1",
          },
        ],
      }),
    ).resolves.toMatchObject({
      tasks: [
        {
          model_id: "model-main",
          status: "A Realizar",
          responsible_id: "responsible-department-1",
          dependencies: [
            {
              model_id: "model-wait",
              status: "Em Espera",
              observation: "Aguardar principal",
              responsible_id: "responsible-department-2",
            },
            {
              model_id: "model-ready",
              status: "A Realizar",
              observation: "Pode iniciar",
              responsible_id: null,
            },
          ],
        },
      ],
      revision: expect.any(String),
    });
  });

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
    const compositionRepository = {
      findTaskModels: vi.fn(async () =>
        tasks.map((task) => ({
          id: task.model_id,
          name: task.name,
          department_id: task.department_id,
          responsible_id: task.responsible_id,
          observations: "",
          type: "Projeto",
          department_status: "Ativo",
          dependencies: [],
        })),
      ),
      listEligibleTaskResponsibles: vi.fn(async (_organizationId: string, departmentId: string) =>
        departmentId === "department-2" ? [] : [{ id: "user-1" }],
      ),
    };
    const service = new ProjectWizardService(integration, taskCreator, compositionRepository);
    const preview = await service.preview({ ...request, tasks });

    const result = await service.create({
      ...request,
      tasks,
      revision: preview.revision,
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

  it("rejeita uma revisão alterada antes de criar o Projeto", async () => {
    const integration: ProjectWizardIntegration = { createProject: vi.fn() };
    const model = {
      id: "model-1",
      name: "Principal",
      department_id: "department-1",
      responsible_id: "user-1",
      observations: "original",
      type: "Projeto",
      department_status: "Ativo",
      dependencies: [],
    };
    const repository = {
      findTaskModels: vi
        .fn()
        .mockResolvedValueOnce([model])
        .mockResolvedValueOnce([{ ...model, observations: "alterada" }]),
      listEligibleTaskResponsibles: vi.fn(async () => [{ id: "user-1" }]),
    };
    const service = new ProjectWizardService(integration, { createTask: vi.fn() }, repository);
    const tasks = [{ name: "Principal", department_id: "department-1", model_id: "model-1" }];
    const preview = await service.preview({ ...request, tasks });

    await expect(
      service.create({ ...request, tasks, revision: preview.revision }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(integration.createProject).not.toHaveBeenCalled();
  });

  it("persiste exatamente a principal e dependências diretas canônicas", async () => {
    const integration: ProjectWizardIntegration = {
      createProject: vi.fn(async () => ({ id: "project-1" })),
    };
    const repository = {
      findTaskModels: vi.fn(async () => [
        {
          id: "model-main",
          name: "Principal",
          department_id: "department-1",
          responsible_id: "user-1",
          observations: "Observação principal",
          type: "Projeto",
          department_status: "Ativo",
          dependencies: [
            {
              dependent_id: "model-wait",
              wait: true,
              observation: "Aguardar",
              dependent: {
                id: "model-wait",
                name: "Em espera",
                department_id: "department-2",
                responsible_id: "user-2",
                observations: "",
                type: "Projeto",
                department_status: "Ativo",
              },
            },
            {
              dependent_id: "model-ready",
              wait: false,
              observation: "Iniciar",
              dependent: {
                id: "model-ready",
                name: "Pronta",
                department_id: "department-3",
                responsible_id: "user-3",
                observations: "",
                type: "Projeto",
                department_status: "Ativo",
              },
            },
          ],
        },
      ]),
      listEligibleTaskResponsibles: vi.fn(async (_organizationId: string, departmentId: string) =>
        departmentId === "department-3" ? [] : [{ id: `user-${departmentId.at(-1)}` }],
      ),
    };
    const taskCreator = {
      createTask: vi
        .fn()
        .mockResolvedValueOnce({ create: { id: "task-main", responsible_id: "user-1" } })
        .mockResolvedValueOnce({ create: { id: "task-wait", responsible_id: "user-2" } })
        .mockResolvedValueOnce({ create: { id: "task-ready", responsible_id: null } }),
    };
    const service = new ProjectWizardService(integration, taskCreator, repository);
    const tasks = [
      { name: "Principal personalizada", department_id: "department-1", model_id: "model-main" },
    ];
    const preview = await service.preview({ ...request, tasks });

    await expect(
      service.create({ ...request, tasks, revision: preview.revision }),
    ).resolves.toMatchObject({
      counts: { main: 1, dependencies: 2, unassigned: 1 },
    });
    expect(taskCreator.createTask).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        model_id: "model-main",
        status: "A Realizar",
        observations: "Observação principal",
        createDependencies: false,
      }),
    );
    expect(taskCreator.createTask).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        model_id: "model-wait",
        status: "Em Espera",
        observations: "Aguardar",
        createDependencies: false,
      }),
    );
    expect(taskCreator.createTask).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        model_id: "model-ready",
        status: "A Realizar",
        observations: "Iniciar",
        createDependencies: false,
      }),
    );
  });

  it.each([
    { type: "Outro", department_status: "Ativo", department_id: "department-1" },
    { type: "Projeto", department_status: "Inativo", department_id: "department-1" },
    { type: "Projeto", department_status: "Ativo", department_id: "other-department" },
  ])("rejeita principal inelegível", async (overrides) => {
    const repository = {
      findTaskModels: vi.fn(async () => [
        {
          id: "model-1",
          name: "Principal",
          responsible_id: "user-1",
          observations: "",
          dependencies: [],
          ...overrides,
        },
      ]),
      listEligibleTaskResponsibles: vi.fn(),
    };
    const service = new ProjectWizardService(
      { createProject: vi.fn() },
      { createTask: vi.fn() },
      repository,
    );

    await expect(
      service.preview({
        ...request,
        tasks: [{ name: "Principal", department_id: "department-1", model_id: "model-1" }],
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("identifica Modelo repetido entre dependências e suas principais", async () => {
    const dependent = {
      id: "model-shared",
      name: "Compartilhada",
      department_id: "department-3",
      responsible_id: "user-3",
      observations: "",
      type: "Projeto",
      department_status: "Ativo",
    };
    const repository = {
      findTaskModels: vi.fn(async () =>
        ["model-1", "model-2"].map((id, index) => ({
          id,
          name: `Principal ${index + 1}`,
          department_id: `department-${index + 1}`,
          responsible_id: `user-${index + 1}`,
          observations: "",
          type: "Projeto",
          department_status: "Ativo",
          dependencies: [
            {
              dependent_id: "model-shared",
              wait: true,
              observation: "Aguardar",
              dependent,
            },
          ],
        })),
      ),
      listEligibleTaskResponsibles: vi.fn(async (_organizationId: string, departmentId: string) => [
        { id: `user-${departmentId.at(-1)}` },
      ]),
    };
    const service = new ProjectWizardService(
      { createProject: vi.fn() },
      { createTask: vi.fn() },
      repository,
    );

    await expect(
      service.preview({
        ...request,
        tasks: [
          { name: "Primeira", department_id: "department-1", model_id: "model-1" },
          { name: "Segunda", department_id: "department-2", model_id: "model-2" },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("model-shared") });
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
