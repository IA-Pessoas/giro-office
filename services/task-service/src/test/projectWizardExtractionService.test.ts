import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import type {
  AiTaskExtractionContext,
  AiTaskExtractionProvider,
} from "../integrations/aiTaskExtraction.js";
import {
  type ExtractProjectTasksRequest,
  PREVISION_DATE_WARNING,
  ProjectWizardExtractionService,
} from "../services/projectWizardExtractionService.js";

const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const catalog = [
  {
    id: "department-fiscal",
    name: "Fiscal",
    tasksModel: [
      { id: "model-apuracao", name: "Apuração" },
      { id: "model-revisao", name: "Revisão" },
    ],
  },
  {
    id: "department-contabil",
    name: "Contábil",
    tasksModel: [{ id: "model-balanco", name: "Balanço" }],
  },
];

function createPrisma(departments = catalog) {
  return {
    department: {
      findMany: vi.fn().mockResolvedValue(departments),
    },
  };
}

function createRequest(
  overrides: Partial<ExtractProjectTasksRequest> = {},
): ExtractProjectTasksRequest {
  return {
    userId: USER_ID,
    organizationId: ORG_ID,
    integracaoLevel: 2,
    isOwner: false,
    content: "Ata colada pelo usuário.",
    name: "Implantação fiscal",
    objective: "Estruturar a operação fiscal do cliente",
    start_date: new Date("2026-09-01T00:00:00.000Z"),
    end_date: new Date("2026-09-30T00:00:00.000Z"),
    ...overrides,
  };
}

function createProvider(extract: AiTaskExtractionProvider["extract"]): {
  provider: AiTaskExtractionProvider;
  extract: AiTaskExtractionProvider["extract"];
} {
  const spy = vi.fn(extract);
  return { provider: { extract: spy }, extract: spy };
}

describe("ProjectWizardExtractionService", () => {
  it("resolve departamento e Modelo sugeridos para os identificadores da organização", async () => {
    const { provider } = createProvider(async () => [
      {
        name: "Apurar impostos",
        prevision_date: "2026-09-10",
        department: "Fiscal",
        model: "Apuração",
      },
    ]);
    const prisma = createPrisma();
    const service = new ProjectWizardExtractionService(provider, prisma);

    await expect(service.extractTasks(createRequest())).resolves.toEqual({
      tasks: [
        {
          name: "Apurar impostos",
          prevision_date: "2026-09-10",
          department_id: "department-fiscal",
          model_id: "model-apuracao",
        },
      ],
    });
    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organization_id: ORG_ID, status: "Ativo" }),
      }),
    );
  });

  it.each([
    ["departamento desconhecido", { department: "Jurídico", model: "Apuração" }],
    ["Modelo desconhecido", { department: "Fiscal", model: "Inexistente" }],
    ["Modelo de outro departamento", { department: "Fiscal", model: "Balanço" }],
    ["sem correspondência", {}],
  ])("mantém a proposta e descarta %s", async (_label, suggestion) => {
    const { provider } = createProvider(async () => [{ name: "Tarefa proposta", ...suggestion }]);
    const service = new ProjectWizardExtractionService(provider, createPrisma());

    const result = await service.extractTasks(createRequest());

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.name).toBe("Tarefa proposta");
    expect(result.tasks[0]?.model_id).toBeUndefined();
  });

  it.each([
    ["data ambígua", "10/09/2026"],
    ["data relativa", "próxima semana"],
    ["data inexistente no calendário", "2026-13-45"],
    ["dia fora do mês", "2026-02-30"],
  ])("deixa o prazo em branco e avisa quando a IA sugere %s", async (_label, prevision) => {
    const { provider } = createProvider(async () => [
      { name: "Tarefa proposta", prevision_date: prevision },
    ]);
    const service = new ProjectWizardExtractionService(provider, createPrisma());

    const result = await service.extractTasks(createRequest());

    expect(result.tasks).toEqual([
      { name: "Tarefa proposta", prevision_date_warning: PREVISION_DATE_WARNING },
    ]);
  });

  it("não avisa sobre prazo quando a IA não sugeriu nenhum", async () => {
    const { provider } = createProvider(async () => [
      { name: "Tarefa proposta", prevision_date: "" },
    ]);
    const service = new ProjectWizardExtractionService(provider, createPrisma());

    await expect(service.extractTasks(createRequest())).resolves.toEqual({
      tasks: [{ name: "Tarefa proposta" }],
    });
  });

  it("normaliza data civil inequívoca com horário para o dia sem horário", async () => {
    const { provider } = createProvider(async () => [
      { name: "Tarefa proposta", prevision_date: "2026-09-10T13:45:00.000Z" },
    ]);
    const service = new ProjectWizardExtractionService(provider, createPrisma());

    await expect(service.extractTasks(createRequest())).resolves.toEqual({
      tasks: [{ name: "Tarefa proposta", prevision_date: "2026-09-10" }],
    });
  });

  it.each([
    [
      "espaços repetidos e quebras de linha",
      "  apurar   impostos\n do cliente ",
      "Apurar impostos do cliente",
    ],
    ["acentos decompostos", "revisa\u0303o de documentos", "Revisão de documentos"],
    ["marcador de lista", "- enviar relatório", "Enviar relatório"],
  ])("normaliza o título proposto com %s", async (_label, proposed, expected) => {
    const { provider } = createProvider(async () => [{ name: proposed }]);
    const service = new ProjectWizardExtractionService(provider, createPrisma());

    const result = await service.extractTasks(createRequest());

    expect(result.tasks[0]?.name).toBe(expected);
  });

  it("deixa o departamento em branco quando a correspondência é conflitante", async () => {
    const { provider } = createProvider(async () => [
      { name: "Tarefa proposta", department: "Fiscal", model: "Apuração" },
    ]);
    const service = new ProjectWizardExtractionService(
      provider,
      createPrisma([
        ...catalog,
        {
          id: "department-fiscal-legado",
          name: "FISCAL",
          tasksModel: [{ id: "model-apuracao-legado", name: "Apuração" }],
        },
      ]),
    );

    const result = await service.extractTasks(createRequest());

    expect(result.tasks).toEqual([{ name: "Tarefa proposta" }]);
  });

  it("deixa o Modelo em branco quando o departamento tem Modelos homônimos", async () => {
    const { provider } = createProvider(async () => [
      { name: "Tarefa proposta", department: "Fiscal", model: "Apuração" },
    ]);
    const service = new ProjectWizardExtractionService(
      provider,
      createPrisma([
        {
          id: "department-fiscal",
          name: "Fiscal",
          tasksModel: [
            { id: "model-apuracao", name: "Apuração" },
            { id: "model-apuracao-2", name: "APURAÇÃO" },
          ],
        },
      ]),
    );

    await expect(service.extractTasks(createRequest())).resolves.toEqual({
      tasks: [{ name: "Tarefa proposta", department_id: "department-fiscal" }],
    });
  });

  it("restringe o catálogo a Modelos do tipo Projeto da organização autenticada", async () => {
    const { provider } = createProvider(async () => [{ name: "Tarefa proposta" }]);
    const prisma = createPrisma();
    const service = new ProjectWizardExtractionService(provider, prisma);

    await service.extractTasks(createRequest());

    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG_ID, status: "Ativo" },
        select: expect.objectContaining({
          tasksModel: expect.objectContaining({
            where: { organization_id: ORG_ID, type: "Projeto" },
          }),
        }),
      }),
    );
  });

  it.each([
    [[]],
    [[{ name: "   " }]],
  ])("trata ausência de proposta válida como falha de extração", async (proposals) => {
    const { provider } = createProvider(async () => proposals);
    const service = new ProjectWizardExtractionService(provider, createPrisma());

    await expect(service.extractTasks(createRequest())).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it.each([
    ["falha do provedor", new Error("boom")],
    ["timeout", Object.assign(new Error("timeout"), { name: "TimeoutError" })],
  ])("trata %s como falha de extração", async (_label, failure) => {
    const { provider } = createProvider(async () => {
      throw failure;
    });
    const service = new ProjectWizardExtractionService(provider, createPrisma());

    await expect(service.extractTasks(createRequest())).rejects.toBeInstanceOf(ServiceError);
    await expect(service.extractTasks(createRequest())).rejects.toMatchObject({ statusCode: 502 });
  });

  it("preserva a falha original do provedor sem reembrulhar", async () => {
    const { provider } = createProvider(async () => {
      throw new ServiceError(502, "Resposta da IA em formato incompatível.");
    });
    const service = new ProjectWizardExtractionService(provider, createPrisma());

    await expect(service.extractTasks(createRequest())).rejects.toMatchObject({
      statusCode: 502,
      message: "Resposta da IA em formato incompatível.",
    });
  });

  it("envia ao provedor apenas o contexto permitido pela especificação", async () => {
    let received: AiTaskExtractionContext | null = null;
    const { provider } = createProvider(async ({ context }) => {
      received = context;
      return [{ name: "Tarefa proposta" }];
    });
    const service = new ProjectWizardExtractionService(provider, createPrisma());

    await service.extractTasks(createRequest());

    expect(received).toEqual({
      project: {
        name: "Implantação fiscal",
        objective: "Estruturar a operação fiscal do cliente",
        start_date: "2026-09-01",
        end_date: "2026-09-30",
      },
      departments: [
        { name: "Fiscal", taskModels: ["Apuração", "Revisão"] },
        { name: "Contábil", taskModels: ["Balanço"] },
      ],
    });
    const serialized = JSON.stringify(received);
    expect(serialized).not.toContain(ORG_ID);
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toContain("department-fiscal");
    expect(serialized).not.toContain("model-apuracao");
  });

  it.each([0, 1])("bloqueia Integração nível %i antes de chamar o provedor", async (level) => {
    const { provider, extract } = createProvider(async () => [{ name: "Tarefa" }]);
    const prisma = createPrisma();
    const service = new ProjectWizardExtractionService(provider, prisma);

    await expect(
      service.extractTasks(createRequest({ integracaoLevel: level as 0 | 1 })),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(extract).not.toHaveBeenCalled();
    expect(prisma.department.findMany).not.toHaveBeenCalled();
  });

  it("permite owner sem nível de Integração", async () => {
    const { provider } = createProvider(async () => [{ name: "Tarefa" }]);
    const service = new ProjectWizardExtractionService(provider, createPrisma());

    await expect(
      service.extractTasks(createRequest({ integracaoLevel: 0, isOwner: true })),
    ).resolves.toMatchObject({ tasks: [{ name: "Tarefa" }] });
  });
});
