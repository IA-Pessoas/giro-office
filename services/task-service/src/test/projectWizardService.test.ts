import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import * as audit from "../integrations/audit.js";
import { ProjectWizardService } from "../services/projectWizardService.js";
import { TaskCrudService } from "../services/taskCrudService.js";

vi.mock("../integrations/audit.js", () => ({ createLog: vi.fn() }));

/** Mesma montagem do app: audit do módulo (mockado aqui) e TaskCrudService sobre o mesmo db. */
function wizard(
  db?: unknown,
  taskService?: ConstructorParameters<typeof ProjectWizardService>[0]["taskService"],
  compositionRepository?: ConstructorParameters<
    typeof ProjectWizardService
  >[0]["compositionRepository"],
) {
  return new ProjectWizardService({
    db: db as never,
    audit: audit as never,
    taskService: taskService ?? new TaskCrudService(db as never, audit as never, {} as never),
    ...(compositionRepository ? { compositionRepository } : {}),
  });
}

function createDatabase(create = vi.fn()) {
  const db = {
    client: { findFirst: vi.fn(async () => ({ id: request.client_id })) },
    project: { findFirst: vi.fn(async () => null), create },
    projectWizardConfirmation: { findUnique: vi.fn(async () => null), create: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(async (callback) => callback(db)),
  };
  return db as unknown as PrismaClient;
}

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
  it("mantém projeto de cliente novo aguardando o fechamento Comercial", async () => {
    const db = createDatabase(
      vi.fn(async ({ data }: { data: object }) => ({ id: "project-1", ...data })),
    );
    db.client.findFirst = vi.fn(async () => ({
      id: request.client_id,
      type_registration: "Novo",
      prospecting_status: "Análise/Agendamento",
    }));

    await wizard(db).create(request);

    expect(db.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "Aguardando liberação do Comercial" }),
      }),
    );
  });

  it("não bloqueia cliente novo cuja prospecção já foi fechada", async () => {
    const db = createDatabase(
      vi.fn(async ({ data }: { data: object }) => ({ id: "project-1", ...data })),
    );
    db.client.findFirst = vi.fn(async () => ({
      id: request.client_id,
      type_registration: "Novo",
      prospecting_status: "Fechado",
    }));

    await wizard(db).create(request);

    expect(db.project.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "Em andamento" }) }),
    );
  });

  it("recompõe usando o banco da transação e recusa a revisão obsoleta sem gravar", async () => {
    const db = createDatabase();
    const tx = {
      ...db,
      taskModel: { findMany: vi.fn(async () => []) },
      user: { findMany: vi.fn(async () => []) },
    };
    vi.mocked(db.$transaction).mockImplementation(async (callback) => callback(tx));
    // A conexão fora do tx não tem os delegates da composição. Usá-la falharia fora do domínio.
    await expect(
      wizard(db).create({
        ...request,
        tasks: [{ name: "Principal", model_id: "modelo-removido", department_id: "department" }],
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "A configuração das dependências foi alterada. Gere uma nova prévia.",
    });
    expect(db.project.create).not.toHaveBeenCalled();
    expect(db.projectWizardConfirmation.create).not.toHaveBeenCalled();
  });

  it("hash ignora ordem de propriedades e autenticação, mas distingue o comando", async () => {
    const db = createDatabase(vi.fn(async () => ({ id: "project-1" })));
    const service = wizard(db);
    const result = await service.create(request);
    const saved = vi.mocked(db.projectWizardConfirmation.create).mock.calls[0][0].data;
    vi.mocked(db.projectWizardConfirmation.findUnique).mockResolvedValue(saved);
    const replay = await service.create({
      ...Object.fromEntries(Object.entries(request).reverse()),
      ...request,
      userId: "different-author",
      permission: 0,
      integracaoLevel: 0,
      userType: "owner",
      isOwner: true,
      modules: { integracao: 0, rh: 3 },
    });
    expect(replay).toEqual(result);
    await expect(service.create({ ...request, objective: "Novo objetivo" })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(db.project.create).toHaveBeenCalledTimes(1);
  });

  it("prévia expande somente dependências diretas com status e responsável resolvidos", async () => {
    const db = createDatabase();
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
    const service = wizard(db, { createTaskInTransaction: vi.fn() }, () => compositionRepository);

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
    const db = createDatabase(vi.fn(async () => ({ id: "project-1", name: "Novo projeto" })));

    const result = await wizard(db).create(request);

    expect(db.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Novo projeto",
          organization_id: request.organizationId,
        }),
      }),
    );
    expect(result).toEqual({
      project: { id: "project-1", name: "Novo projeto" },
      counts: { main: 0, dependencies: 0, unassigned: 0 },
    });
  });

  it("bloqueia nível 1 antes de abrir a transação", async () => {
    const db = createDatabase();

    await expect(wizard(db).create({ ...request, integracaoLevel: 1 })).rejects.toMatchObject({
      statusCode: 403,
    });

    expect(db.project.create).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("permite owner sem nível de Integração", async () => {
    const db = createDatabase(vi.fn(async () => ({ id: "project-1" })));

    await expect(
      wizard(db).create({
        ...request,
        integracaoLevel: 0,
        isOwner: true,
        userType: "owner",
      }),
    ).resolves.toMatchObject({ project: { id: "project-1" } });
  });

  it("cria Tarefas principais manuais e conta o resultado persistido", async () => {
    const db = createDatabase(
      vi.fn(async () => ({ id: "project-1", client_id: request.client_id })),
    );
    const taskCreator = {
      createTaskInTransaction: vi
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
    const service = wizard(db, taskCreator, () => compositionRepository);
    const preview = await service.preview({ ...request, tasks });

    const result = await service.create({
      ...request,
      tasks,
      revision: preview.revision,
    });

    expect(taskCreator.createTaskInTransaction).toHaveBeenNthCalledWith(
      1,
      {
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
      },
      expect.anything(),
      { allowPendingCommercialProject: true },
    );
    expect(taskCreator.createTaskInTransaction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        project_id: "project-1",
        client_id: request.client_id,
        status: "A Realizar",
        responsible_id: null,
        createDependencies: false,
      }),
      expect.anything(),
      { allowPendingCommercialProject: true },
    );
    expect(result).toEqual({
      project: { id: "project-1", client_id: request.client_id },
      counts: { main: 2, dependencies: 0, unassigned: 1 },
    });
  });

  it("rejeita uma revisão alterada antes de criar o Projeto", async () => {
    const db = createDatabase();
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
    const service = wizard(db, { createTaskInTransaction: vi.fn() }, () => repository);
    const tasks = [{ name: "Principal", department_id: "department-1", model_id: "model-1" }];
    const preview = await service.preview({ ...request, tasks });

    await expect(
      service.create({ ...request, tasks, revision: preview.revision }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(db.project.create).not.toHaveBeenCalled();
  });

  it("persiste exatamente a principal e dependências diretas canônicas", async () => {
    const db = createDatabase(vi.fn(async () => ({ id: "project-1" })));
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
      createTaskInTransaction: vi
        .fn()
        .mockResolvedValueOnce({ create: { id: "task-main", responsible_id: "user-1" } })
        .mockResolvedValueOnce({ create: { id: "task-wait", responsible_id: "user-2" } })
        .mockResolvedValueOnce({ create: { id: "task-ready", responsible_id: null } }),
    };
    const service = wizard(db, taskCreator, () => repository);
    const tasks = [
      { name: "Principal personalizada", department_id: "department-1", model_id: "model-main" },
    ];
    const preview = await service.preview({ ...request, tasks });

    await expect(
      service.create({ ...request, tasks, revision: preview.revision }),
    ).resolves.toMatchObject({
      counts: { main: 1, dependencies: 2, unassigned: 1 },
    });
    expect(taskCreator.createTaskInTransaction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        model_id: "model-main",
        status: "A Realizar",
        observations: "Observação principal",
        createDependencies: false,
      }),
      expect.anything(),
      { allowPendingCommercialProject: true },
    );
    expect(taskCreator.createTaskInTransaction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        model_id: "model-wait",
        status: "Em Espera",
        observations: "Aguardar",
        createDependencies: false,
      }),
      expect.anything(),
      { allowPendingCommercialProject: true },
    );
    expect(taskCreator.createTaskInTransaction).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        model_id: "model-ready",
        status: "A Realizar",
        observations: "Iniciar",
        createDependencies: false,
      }),
      expect.anything(),
      { allowPendingCommercialProject: true },
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
    const service = wizard(undefined, { createTaskInTransaction: vi.fn() }, () => repository);

    await expect(
      service.preview({
        ...request,
        tasks: [{ name: "Principal", department_id: "department-1", model_id: "model-1" }],
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("identifica dependências repetidas pelos dois pais", async () => {
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
    const service = wizard(undefined, { createTaskInTransaction: vi.fn() }, () => repository);

    await expect(
      service.preview({
        ...request,
        tasks: [
          { name: "Primeira", department_id: "department-1", model_id: "model-1" },
          { name: "Segunda", department_id: "department-2", model_id: "model-2" },
        ],
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Modelo model-shared repetido entre dependência model-shared da principal 1 (Primeira) e dependência model-shared da principal 2 (Segunda).",
    });
  });

  it("bloqueia nível 1 antes de criar Projeto ou Tarefas", async () => {
    const db = createDatabase();
    const taskCreator = { createTaskInTransaction: vi.fn() };

    await expect(
      wizard(db, taskCreator).create({
        ...request,
        tasks: [{ name: "Tarefa", department_id: "department-1", model_id: "model-1" }],
        integracaoLevel: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(db.project.create).not.toHaveBeenCalled();
    expect(taskCreator.createTaskInTransaction).not.toHaveBeenCalled();
  });

  it.each([
    {
      dependencyOrganizationId: "other-org",
      dependentOrganizationId: request.organizationId,
      departmentOrganizationId: request.organizationId,
    },
    {
      dependencyOrganizationId: request.organizationId,
      dependentOrganizationId: "other-org",
      departmentOrganizationId: request.organizationId,
    },
    {
      dependencyOrganizationId: request.organizationId,
      dependentOrganizationId: request.organizationId,
      departmentOrganizationId: "other-org",
    },
  ])("rejeita relação, dependência ou departamento de outra organização", async (tenant) => {
    const repository = {
      findTaskModels: vi.fn(async () => [
        {
          id: "model-main",
          name: "Principal",
          organization_id: request.organizationId,
          department_id: "department-1",
          department_organization_id: request.organizationId,
          responsible_id: "user-1",
          observations: "",
          type: "Projeto",
          department_status: "Ativo",
          dependencies: [
            {
              dependent_id: "model-dependent",
              organization_id: tenant.dependencyOrganizationId,
              wait: true,
              observation: "Aguardar",
              dependent: {
                id: "model-dependent",
                name: "Dependente",
                organization_id: tenant.dependentOrganizationId,
                department_id: "department-2",
                department_organization_id: tenant.departmentOrganizationId,
                responsible_id: "user-2",
                observations: "",
                type: "Projeto",
                department_status: "Ativo",
              },
            },
          ],
        },
      ]),
      listEligibleTaskResponsibles: vi.fn(async () => [{ id: "user-1" }]),
    };
    const service = wizard(undefined, { createTaskInTransaction: vi.fn() }, () => repository);

    await expect(
      service.preview({
        ...request,
        tasks: [{ name: "Principal", department_id: "department-1", model_id: "model-main" }],
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it.each([
    "type",
    "department",
    "dependency",
    "responsible",
  ] as const)("converte alteração de %s após a prévia em conflito antes do Projeto", async (mutation) => {
    const model = {
      id: "model-main",
      name: "Principal",
      department_id: "department-1",
      responsible_id: "user-1",
      observations: "",
      type: "Projeto",
      department_status: "Ativo",
      dependencies: [],
    };
    let current = model;
    let responsibles = [{ id: "user-1" }];
    const db = createDatabase();
    const repository = {
      findTaskModels: vi.fn(async () => [current]),
      listEligibleTaskResponsibles: vi.fn(async () => responsibles),
    };
    const service = wizard(db, { createTaskInTransaction: vi.fn() }, () => repository);
    const tasks = [{ name: "Principal", department_id: "department-1", model_id: "model-main" }];
    const preview = await service.preview({ ...request, tasks });

    if (mutation === "type") current = { ...current, type: "Outro" };
    if (mutation === "department") current = { ...current, department_status: "Inativo" };
    if (mutation === "dependency") {
      current = {
        ...current,
        dependencies: [
          {
            dependent_id: "model-dependent",
            wait: true,
            observation: "Aguardar",
            dependent: {
              id: "model-dependent",
              name: "Dependente",
              department_id: "department-2",
              responsible_id: "user-2",
              observations: "",
              type: "Projeto",
              department_status: "Ativo",
            },
          },
        ],
      };
    }
    if (mutation === "responsible") responsibles = [{ id: "user-2" }, { id: "user-3" }];

    await expect(
      service.create({ ...request, tasks, revision: preview.revision }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(db.project.create).not.toHaveBeenCalled();
  });

  it.each([
    {
      tasks: [
        { name: "Primeira", department_id: "department-1", model_id: "model-main" },
        { name: "Segunda", department_id: "department-1", model_id: "model-main" },
      ],
      models: [
        {
          id: "model-main",
          name: "Principal",
          department_id: "department-1",
          responsible_id: "user-1",
          observations: "",
          type: "Projeto",
          department_status: "Ativo",
          dependencies: [],
        },
      ],
      message: "Modelo model-main repetido entre principal 1 (Primeira) e principal 2 (Segunda).",
    },
    {
      tasks: [
        { name: "Principal", department_id: "department-1", model_id: "model-main" },
        { name: "Também dependente", department_id: "department-2", model_id: "model-dependent" },
      ],
      models: [
        {
          id: "model-main",
          name: "Principal",
          department_id: "department-1",
          responsible_id: "user-1",
          observations: "",
          type: "Projeto",
          department_status: "Ativo",
          dependencies: [
            {
              dependent_id: "model-dependent",
              wait: true,
              observation: "Aguardar",
              dependent: {
                id: "model-dependent",
                name: "Dependente",
                department_id: "department-2",
                responsible_id: "user-2",
                observations: "",
                type: "Projeto",
                department_status: "Ativo",
              },
            },
          ],
        },
        {
          id: "model-dependent",
          name: "Dependente",
          department_id: "department-2",
          responsible_id: "user-2",
          observations: "",
          type: "Projeto",
          department_status: "Ativo",
          dependencies: [],
        },
      ],
      message:
        "Modelo model-dependent repetido entre dependência model-dependent da principal 1 (Principal) e principal 2 (Também dependente).",
    },
  ])("identifica itens em conflito na composição", async ({ tasks, models, message }) => {
    const service = wizard(undefined, { createTaskInTransaction: vi.fn() }, () => ({
      findTaskModels: vi.fn(async () => models),
      listEligibleTaskResponsibles: vi.fn(async () => [{ id: "user-1" }]),
    }));

    await expect(service.preview({ ...request, tasks })).rejects.toMatchObject({
      statusCode: 409,
      message,
    });
  });
});
