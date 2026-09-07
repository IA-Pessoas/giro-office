import { Writable } from "node:stream";
import {
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTaskApp } from "../app.js";
import type { TaskServiceEnv } from "../config/env.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createAiTaskExtractionProvider } from "../integrations/aiTaskExtraction.js";
import { createLog } from "../integrations/audit.js";
import { buildTaskServiceOpenApiSpec } from "../openapi/spec.js";
import type {
  ProjectWizardExtractionRouteDeps,
  ProjectWizardRouteDeps,
} from "../routes/projectWizard.routes.js";
import { projectWizardCreateBodySchema } from "../schemas/projectWizard.schemas.js";
import { ProjectWizardExtractionService } from "../services/projectWizardExtractionService.js";
import { ProjectWizardService } from "../services/projectWizardService.js";

vi.mock("../integrations/audit.js", () => ({ createLog: vi.fn() }));

const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const env: TaskServiceEnv = {
  port: 3032,
  databaseUrl: "postgresql://localhost:5432/task-service-test",
  jwtSecret: "task-service-secret",
  nodeEnv: "test",
  logLevel: "silent",
  logPretty: false,
  auditEnabled: false,
  auditServiceUrl: "http://localhost:3020",
  auditServiceToken: "audit-service-token",
  projectServiceUrl: "http://localhost:3033",
  aiExtractionMode: "fake" as const,
  aiExtractionTimeoutMs: 30_000,
  aiExtractionRateLimitMax: 10,
  aiExtractionRateLimitWindowMs: 60_000,
  reportsInternalToken: "reports-service-token",
  reportsGrantSecret: "reports-grant-secret",
  enableApiDocs: false,
  allowedOrigins: ["*"],
};

function gatewayHeaders(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG_ID,
    [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ integracao: 2 }),
  };
}

describe("project wizard routes", () => {
  const db = {
    client: { findFirst: vi.fn(async () => ({ id: "cccccccc-cccc-cccc-cccc-cccccccccccc" })) },
    project: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({
        id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        name: "Novo projeto",
        client_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      })),
    },
    projectWizardConfirmation: { findUnique: vi.fn(async () => null), create: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(async (callback) => callback(db)),
  };
  beforeEach(() => vi.clearAllMocks());

  function createApp(projectWizardService?: ProjectWizardRouteDeps) {
    return createTaskApp(
      env,
      createLogger({
        service: "task-service-test",
        env: "test",
        level: "silent",
        destination: new MemoryLogStream(),
      }),
      {
        projectWizardService:
          projectWizardService ?? new ProjectWizardService(db as unknown as PrismaClient),
      },
    );
  }

  const validTask = {
    name: "Revisar documentação",
    department_id: "department-1",
    model_id: "model-1",
    prevision_date: "2026-09-15",
    responsible_id: "user-1",
  };

  const validBody = {
    client_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    name: "Novo projeto",
    start_date: "2026-09-01T00:00:00.000Z",
    end_date: "2026-09-30T00:00:00.000Z",
    objective: "Objetivo do projeto",
    revision: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  };

  it("documenta o contrato público do wizard no OpenAPI", () => {
    const operation = buildTaskServiceOpenApiSpec(env).paths["/task/project-wizard"].post;

    expect(operation.parameters).toContainEqual(
      expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }),
    );
    expect(operation.requestBody.content["application/json"].schema.required).toEqual([
      "client_id",
      "name",
      "start_date",
      "objective",
      "revision",
    ]);
    expect(operation.requestBody.content["application/json"].schema.properties.tasks).toMatchObject(
      {
        type: "array",
        items: {
          required: ["name", "department_id", "model_id"],
          properties: {
            prevision_date: { type: "string", format: "date" },
            responsible_id: { type: ["string", "null"] },
          },
        },
      },
    );
    expect(
      buildTaskServiceOpenApiSpec(env).paths["/task/project-wizard/preview"].post,
    ).toMatchObject({
      tags: ["ProjectWizard"],
      responses: {
        "200": expect.any(Object),
        "409": expect.any(Object),
        "422": expect.any(Object),
      },
    });
  });

  it("POST /task/project-wizard/preview delega a composição autenticada", async () => {
    const service = {
      preview: vi.fn().mockResolvedValue({ tasks: [], revision: "revision-1" }),
      create: vi.fn(),
    } as unknown as ProjectWizardRouteDeps;

    const response = await request(createApp(service))
      .post("/task/project-wizard/preview")
      .set(gatewayHeaders())
      .send({ tasks: [] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { tasks: [], revision: "revision-1" } });
    expect(service.preview).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, organizationId: ORG_ID, tasks: [] }),
    );
  });

  it("POST /task/project-wizard/preview expõe dependências reais com espera e sem responsável", async () => {
    const service = new ProjectWizardService(undefined, undefined, () => ({
      findTaskModels: vi.fn(async () => [
        {
          id: "model-main",
          name: "Principal",
          department_id: "department-1",
          responsible_id: "responsible-main",
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
                responsible_id: "responsible-wait",
                observations: "",
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
                responsible_id: "responsible-ready",
                observations: "",
                type: "Projeto",
                department_status: "Ativo",
              },
            },
          ],
        },
      ]),
      listEligibleTaskResponsibles: vi.fn(async (_organizationId, departmentId) =>
        departmentId === "department-3" ? [] : [{ id: `responsible-${departmentId}` }],
      ),
    }));

    const response = await request(createApp(service))
      .post("/task/project-wizard/preview")
      .set(gatewayHeaders())
      .send({
        tasks: [
          {
            name: "Tarefa principal",
            department_id: "department-1",
            model_id: "model-main",
            responsible_id: "responsible-department-1",
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        revision: expect.any(String),
        tasks: [
          {
            model_id: "model-main",
            status: "A Realizar",
            dependencies: [
              {
                model_id: "model-wait",
                status: "Em Espera",
                responsible_id: "responsible-department-2",
              },
              {
                model_id: "model-ready",
                status: "A Realizar",
                responsible_id: null,
              },
            ],
          },
        ],
      },
    });
  });

  it("POST /task/project-wizard/preview identifica conflito da composição real", async () => {
    const sharedDependency = {
      id: "model-shared",
      name: "Dependência compartilhada",
      department_id: "department-3",
      responsible_id: "responsible-shared",
      observations: "",
      type: "Projeto",
      department_status: "Ativo",
    };
    const service = new ProjectWizardService(undefined, undefined, () => ({
      findTaskModels: vi.fn(async () =>
        ["model-one", "model-two"].map((id, index) => ({
          id,
          name: `Principal ${index + 1}`,
          department_id: `department-${index + 1}`,
          responsible_id: `responsible-${index + 1}`,
          observations: "",
          type: "Projeto",
          department_status: "Ativo",
          dependencies: [
            {
              dependent_id: "model-shared",
              wait: true,
              observation: "Aguardar",
              dependent: sharedDependency,
            },
          ],
        })),
      ),
      listEligibleTaskResponsibles: vi.fn(async () => [{ id: "responsible-1" }]),
    }));

    const response = await request(createApp(service))
      .post("/task/project-wizard/preview")
      .set(gatewayHeaders())
      .send({
        tasks: [
          { name: "Primeira", department_id: "department-1", model_id: "model-one" },
          { name: "Segunda", department_id: "department-2", model_id: "model-two" },
        ],
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      error:
        "Modelo model-shared repetido entre dependência model-shared da principal 1 (Primeira) e dependência model-shared da principal 2 (Segunda).",
    });
  });

  it("POST /task/project-wizard aceita lista vazia", async () => {
    const service: ProjectWizardRouteDeps = {
      preview: vi.fn(),
      create: vi.fn().mockResolvedValue({
        project: { id: "project-1" },
        counts: { main: 0, dependencies: 0, unassigned: 0 },
      }),
    };

    const emptyResponse = await request(createApp(service))
      .post("/task/project-wizard")
      .set(gatewayHeaders())
      .set("Idempotency-Key", "wizard-empty")
      .send({ ...validBody, tasks: [] });

    expect(emptyResponse.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ tasks: [] }));
  });

  it.each([
    1, 2,
  ])("POST /task/project-wizard aceita %i tarefa(s) com Modelos distintos", async (count) => {
    const service: ProjectWizardRouteDeps = {
      preview: vi.fn(),
      create: vi.fn().mockResolvedValue({
        project: { id: "project-1" },
        counts: { main: count, dependencies: 0, unassigned: count - 1 },
      }),
    };

    const tasks = [
      validTask,
      { ...validTask, model_id: "model-2", prevision_date: undefined, responsible_id: null },
    ].slice(0, count);
    const tasksResponse = await request(createApp(service))
      .post("/task/project-wizard")
      .set(gatewayHeaders())
      .set("Idempotency-Key", "wizard-tasks")
      .send({
        ...validBody,
        tasks,
      });

    expect(tasksResponse.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tasks,
      }),
    );
  });

  it.each([
    "model-1",
    " model-1 ",
  ])("POST /task/project-wizard propaga conflito de Modelo repetido %j", async (modelId) => {
    const service: ProjectWizardRouteDeps = {
      preview: vi.fn(),
      create: vi.fn().mockRejectedValue(new ServiceError(409, "Modelo model-1 repetido.")),
    };
    const response = await request(createApp(service))
      .post("/task/project-wizard")
      .set(gatewayHeaders())
      .set("Idempotency-Key", "wizard-duplicate-model")
      .send({
        ...validBody,
        tasks: [validTask, { ...validTask, name: "Outra tarefa", model_id: modelId }],
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      error: "Modelo model-1 repetido.",
    });
    expect(service.create).toHaveBeenCalled();
  });

  it.each([
    "name",
    "department_id",
    "model_id",
  ] as const)("POST /task/project-wizard rejeita Tarefa sem %s antes do service", async (field) => {
    const service: ProjectWizardRouteDeps = { preview: vi.fn(), create: vi.fn() };
    const invalidTask = { ...validTask };
    delete invalidTask[field];

    const response = await request(createApp(service))
      .post("/task/project-wizard")
      .set(gatewayHeaders())
      .set("Idempotency-Key", `wizard-invalid-${field}`)
      .send({ ...validBody, tasks: [invalidTask] });

    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("POST /task/project-wizard sem autenticação retorna 401", async () => {
    const response = await request(createApp())
      .post("/task/project-wizard")
      .set("Idempotency-Key", "wizard-open-1")
      .send(validBody);

    expect(response.status).toBe(401);
  });

  it("POST /task/project-wizard bloqueia Integração nível 1", async () => {
    const response = await request(createApp())
      .post("/task/project-wizard")
      .set({
        ...gatewayHeaders(),
        [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ integracao: 1 }),
      })
      .set("Idempotency-Key", "wizard-open-1")
      .send(validBody);

    expect(response.status).toBe(403);
  });

  it("POST /task/project-wizard exige Idempotency-Key", async () => {
    const response = await request(createApp())
      .post("/task/project-wizard")
      .set(gatewayHeaders())
      .send(validBody);

    expect(response.status).toBe(400);
  });

  it.each([
    "",
    "   ",
    "x".repeat(256),
  ])("POST /task/project-wizard rejeita Idempotency-Key inválida: %j", async (idempotencyKey) => {
    const response = await request(createApp())
      .post("/task/project-wizard")
      .set(gatewayHeaders())
      .set("Idempotency-Key", idempotencyKey)
      .send(validBody);

    expect(response.status).toBe(400);
  });

  it("POST /task/project-wizard rejeita corpo inválido", async () => {
    const response = await request(createApp())
      .post("/task/project-wizard")
      .set(gatewayHeaders())
      .set("Idempotency-Key", "wizard-open-1")
      .send({ ...validBody, end_date: "2026-08-31T00:00:00.000Z" });

    expect(response.status).toBe(400);
  });

  it("POST /task/project-wizard cria projeto quando tasks é omitido", async () => {
    const response = await request(createApp())
      .post("/task/project-wizard")
      .set(gatewayHeaders())
      .set("Idempotency-Key", "wizard-open-1")
      .send(validBody);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      data: {
        project: {
          id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
          name: "Novo projeto",
          client_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        },
        counts: { main: 0, dependencies: 0, unassigned: 0 },
      },
    });
  });

  it.each(["start_date", "end_date"] as const)("converte %s ISO em Date", (field) => {
    const parsed = projectWizardCreateBodySchema.parse(validBody);

    expect(parsed[field]).toBeInstanceOf(Date);
    expect(parsed[field]?.toISOString()).toBe(validBody[field]);
  });

  it.each(
    ["start_date", "end_date"].flatMap((field) =>
      [null, 0, true, false].map((value) => ({ field, value })),
    ),
  )("POST /task/project-wizard rejeita $field=$value", async ({ field, value }) => {
    const response = await request(createApp())
      .post("/task/project-wizard")
      .set(gatewayHeaders())
      .set("Idempotency-Key", "wizard-invalid-date")
      .send({ ...validBody, start_date: "1969-01-01T00:00:00.000Z", [field]: value });

    expect(response.status).toBe(400);
  });

  it("POST /task/project-wizard permite owner sem nível de Integração", async () => {
    const response = await request(createApp())
      .post("/task/project-wizard")
      .set({
        ...gatewayHeaders(),
        [FORWARDED_AUTH_TYPE_HEADER]: "owner",
        [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ integracao: 0 }),
      })
      .set("Idempotency-Key", "wizard-owner-1")
      .send(validBody);

    expect(response.status).toBe(201);
  });
});

describe("project wizard task extraction routes", () => {
  const validExtractionBody = {
    content: "- Apurar impostos do trimestre\n- Reunir documentos do cliente",
    name: "Novo projeto",
    objective: "Objetivo do projeto",
    start_date: "2026-09-01T00:00:00.000Z",
    end_date: "2026-09-30T00:00:00.000Z",
  };

  function createCapturingLogStream(sink: string[]) {
    return new Writable({
      write(chunk: string | Uint8Array, _encoding, callback) {
        sink.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
        callback();
      },
    });
  }

  function createExtractionApp(
    projectWizardExtractionService?: ProjectWizardExtractionRouteDeps,
    overrides: Partial<TaskServiceEnv> = {},
    logSink?: string[],
  ) {
    return createTaskApp(
      { ...env, ...overrides },
      createLogger({
        service: "task-service-test",
        env: "test",
        level: "error",
        destination: logSink ? createCapturingLogStream(logSink) : new MemoryLogStream(),
      }),
      projectWizardExtractionService ? { projectWizardExtractionService } : undefined,
    );
  }

  it("documenta o contrato público da extração no OpenAPI", () => {
    const operation =
      buildTaskServiceOpenApiSpec(env).paths["/task/project-wizard/extract-tasks"].post;

    expect(operation.requestBody.content["application/json"].schema.required).toEqual([
      "content",
      "name",
      "objective",
      "start_date",
    ]);
    expect(operation.responses["422"]).toBeDefined();
    expect(operation.responses["429"]).toBeDefined();
    expect(operation.requestBody.content["multipart/form-data"].schema.required).toEqual([
      "file",
      "name",
      "objective",
      "start_date",
    ]);
  });

  it.each([
    ["TXT", "ata.txt", "text/plain"],
    ["Markdown", "ata.md", "text/markdown"],
  ])("aceita Ata %s enviada como multipart", async (_label, filename, contentType) => {
    const service: ProjectWizardExtractionRouteDeps = {
      extractTasks: vi.fn().mockResolvedValue({ tasks: [{ name: "Tarefa" }] }),
    };
    const content = "- Apurar impostos do trimestre\n- Reunir documentos do cliente";

    const response = await request(createExtractionApp(service))
      .post("/task/project-wizard/extract-tasks")
      .set(gatewayHeaders())
      .field("name", validExtractionBody.name)
      .field("objective", validExtractionBody.objective)
      .field("start_date", validExtractionBody.start_date)
      .field("end_date", validExtractionBody.end_date)
      .attach("file", Buffer.from(content), { filename, contentType });

    expect(response.status).toBe(200);
    expect(service.extractTasks).toHaveBeenCalledWith(
      expect.objectContaining({ content, name: validExtractionBody.name }),
    );
  });

  it("rejeita multipart inválido antes do rate limit e do provedor", async () => {
    const service: ProjectWizardExtractionRouteDeps = {
      extractTasks: vi.fn().mockResolvedValue({ tasks: [{ name: "Tarefa" }] }),
    };
    const app = createExtractionApp(service, { aiExtractionRateLimitMax: 2 });

    const invalid = await request(app)
      .post("/task/project-wizard/extract-tasks")
      .set(gatewayHeaders())
      .field("name", validExtractionBody.name)
      .field("objective", validExtractionBody.objective)
      .field("start_date", validExtractionBody.start_date)
      .attach("file", Buffer.from("Ata inválida"), {
        filename: "ata.txt",
        contentType: "text/markdown",
      });

    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({
      success: false,
      error: "Tipo de arquivo não permitido.",
    });

    for (const expected of [200, 200]) {
      const response = await request(app)
        .post("/task/project-wizard/extract-tasks")
        .set(gatewayHeaders())
        .send(validExtractionBody);

      expect(response.status).toBe(expected);
    }

    expect(service.extractTasks).toHaveBeenCalledTimes(2);
  });

  it.each([
    "JSON",
    "multipart",
  ])("rejeita metadado inválido em %s antes do rate limit", async (transport) => {
    const service: ProjectWizardExtractionRouteDeps = {
      extractTasks: vi.fn().mockResolvedValue({ tasks: [{ name: "Tarefa" }] }),
    };
    const app = createExtractionApp(service, { aiExtractionRateLimitMax: 2 });
    const invalidRequest = request(app)
      .post("/task/project-wizard/extract-tasks")
      .set(gatewayHeaders());

    const invalid =
      transport === "JSON"
        ? await invalidRequest.send({ ...validExtractionBody, name: "" })
        : await invalidRequest
            .field("name", "")
            .field("objective", validExtractionBody.objective)
            .field("start_date", validExtractionBody.start_date)
            .attach("file", Buffer.from("Ata válida"), {
              filename: "ata.txt",
              contentType: "text/plain",
            });

    expect(invalid.status).toBe(400);

    for (const expected of [200, 200]) {
      const response = await request(app)
        .post("/task/project-wizard/extract-tasks")
        .set(gatewayHeaders())
        .send(validExtractionBody);

      expect(response.status).toBe(expected);
    }

    expect(service.extractTasks).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["mais de um arquivo", [Buffer.from("Ata 1"), Buffer.from("Ata 2")], "Upload inválido."],
    ["extensão não permitida", [Buffer.from("Ata inválida")], "Tipo de arquivo não permitido."],
    ["arquivo vazio", [Buffer.alloc(0)], "O arquivo da Ata é obrigatório e não pode estar vazio."],
    ["NUL", [Buffer.from("Ata\0inválida")], "O arquivo da Ata não pode conter NUL."],
    [
      "UTF-8 inválido",
      [Buffer.from([0xc3, 0x28])],
      "O arquivo da Ata deve conter texto UTF-8 válido.",
    ],
    [
      "arquivo acima de 10 MB",
      [Buffer.alloc(10 * 1024 * 1024 + 1, "a")],
      "Arquivo excede o limite de 10 MB.",
    ],
  ])("rejeita %s sem chamar o provedor", async (label, files, error) => {
    const service: ProjectWizardExtractionRouteDeps = { extractTasks: vi.fn() };
    let requestBuilder = request(createExtractionApp(service))
      .post("/task/project-wizard/extract-tasks")
      .set(gatewayHeaders())
      .field("name", validExtractionBody.name)
      .field("objective", validExtractionBody.objective)
      .field("start_date", validExtractionBody.start_date);

    for (const file of files) {
      requestBuilder = requestBuilder.attach("file", file, {
        filename: label === "extensão não permitida" ? "ata.pdf" : "ata.txt",
        contentType: "text/plain",
      });
    }

    const response = await requestBuilder;

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, error });
    expect(service.extractTasks).not.toHaveBeenCalled();
  });

  it("não registra nem audita Ata multipart rejeitada", async () => {
    const service: ProjectWizardExtractionRouteDeps = { extractTasks: vi.fn() };
    const written: string[] = [];
    const secret = "ATA-MULTIPART-TRANSITORIA";
    const auditLog = vi.mocked(createLog);
    const auditCallsBefore = auditLog.mock.calls.length;

    const response = await request(createExtractionApp(service, {}, written))
      .post("/task/project-wizard/extract-tasks")
      .set(gatewayHeaders())
      .field("name", validExtractionBody.name)
      .field("objective", validExtractionBody.objective)
      .field("start_date", validExtractionBody.start_date)
      .attach("file", Buffer.from(`${secret}\0`), {
        filename: "ata.txt",
        contentType: "text/plain",
      });

    expect(response.status).toBe(400);
    expect(service.extractTasks).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledTimes(auditCallsBefore);
    expect(written.join("\n")).not.toContain(secret);
  });

  it("devolve as Tarefas propostas para a Ata colada", async () => {
    const service: ProjectWizardExtractionRouteDeps = {
      extractTasks: vi.fn().mockResolvedValue({
        tasks: [
          { name: "Apurar impostos", prevision_date: "2026-09-10", department_id: "department-1" },
          { name: "Reunir documentos" },
        ],
      }),
    };

    const response = await request(createExtractionApp(service))
      .post("/task/project-wizard/extract-tasks")
      .set(gatewayHeaders())
      .send(validExtractionBody);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        tasks: [
          { name: "Apurar impostos", prevision_date: "2026-09-10", department_id: "department-1" },
          { name: "Reunir documentos" },
        ],
      },
    });
    expect(service.extractTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        organizationId: ORG_ID,
        integracaoLevel: 2,
        isOwner: false,
        content: validExtractionBody.content,
        name: "Novo projeto",
        objective: "Objetivo do projeto",
      }),
    );
  });

  it("entrega ao cliente o aviso de prazo da proposta", async () => {
    const service: ProjectWizardExtractionRouteDeps = {
      extractTasks: vi.fn().mockResolvedValue({
        tasks: [{ name: "Apurar impostos", prevision_date_warning: "Prazo não reconhecido." }],
      }),
    };

    const response = await request(createExtractionApp(service))
      .post("/task/project-wizard/extract-tasks")
      .set(gatewayHeaders())
      .send(validExtractionBody);

    expect(response.status).toBe(200);
    expect(response.body.data.tasks).toEqual([
      { name: "Apurar impostos", prevision_date_warning: "Prazo não reconhecido." },
    ]);
  });

  it("não envia identidade do cliente ao service de extração", async () => {
    const service: ProjectWizardExtractionRouteDeps = {
      extractTasks: vi.fn().mockResolvedValue({ tasks: [{ name: "Tarefa" }] }),
    };

    const response = await request(createExtractionApp(service))
      .post("/task/project-wizard/extract-tasks")
      .set(gatewayHeaders())
      .send({ ...validExtractionBody, client_id: "cccccccc-cccc-cccc-cccc-cccccccccccc" });

    expect(response.status).toBe(400);
    expect(service.extractTasks).not.toHaveBeenCalled();
  });

  it("sem autenticação retorna 401 sem chamar o provedor", async () => {
    const service: ProjectWizardExtractionRouteDeps = { extractTasks: vi.fn() };

    const response = await request(createExtractionApp(service))
      .post("/task/project-wizard/extract-tasks")
      .send(validExtractionBody);

    expect(response.status).toBe(401);
    expect(service.extractTasks).not.toHaveBeenCalled();
  });

  it("bloqueia Integração nível 1", async () => {
    const response = await request(createExtractionApp())
      .post("/task/project-wizard/extract-tasks")
      .set({
        ...gatewayHeaders(),
        [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ integracao: 1 }),
      })
      .send(validExtractionBody);

    expect(response.status).toBe(403);
  });

  it.each([
    ["content", { content: "   " }],
    ["name", { name: "" }],
    ["objective", { objective: "" }],
    ["start_date", { start_date: "ontem" }],
    ["end_date", { end_date: "2026-08-31T00:00:00.000Z" }],
  ])("rejeita %s inválido antes do provedor", async (_field, override) => {
    const service: ProjectWizardExtractionRouteDeps = { extractTasks: vi.fn() };

    const response = await request(createExtractionApp(service))
      .post("/task/project-wizard/extract-tasks")
      .set(gatewayHeaders())
      .send({ ...validExtractionBody, ...override });

    expect(response.status).toBe(400);
    expect(service.extractTasks).not.toHaveBeenCalled();
  });

  it.each([
    [422, "Nenhuma tarefa foi identificada na Ata."],
    [502, "Não foi possível extrair tarefas da Ata."],
  ])("serializa a falha de extração como %i", async (statusCode, message) => {
    const service: ProjectWizardExtractionRouteDeps = {
      extractTasks: vi.fn().mockRejectedValue(new ServiceError(statusCode, message)),
    };

    const response = await request(createExtractionApp(service))
      .post("/task/project-wizard/extract-tasks")
      .set(gatewayHeaders())
      .send(validExtractionBody);

    expect(response.status).toBe(statusCode);
    expect(response.body).toMatchObject({ success: false, error: message });
  });

  it("limita a taxa de extrações por usuário", async () => {
    const service: ProjectWizardExtractionRouteDeps = {
      extractTasks: vi.fn().mockResolvedValue({ tasks: [{ name: "Tarefa" }] }),
    };
    const app = createExtractionApp(service, { aiExtractionRateLimitMax: 2 });

    for (const expected of [200, 200, 429]) {
      const response = await request(app)
        .post("/task/project-wizard/extract-tasks")
        .set(gatewayHeaders())
        .send(validExtractionBody);

      expect(response.status).toBe(expected);
    }

    expect(service.extractTasks).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["falha", { extractTasks: () => Promise.reject(new ServiceError(502, "Falha do provedor.")) }],
    ["sucesso", { extractTasks: () => Promise.resolve({ tasks: [{ name: "Apurar impostos" }] }) }],
  ])("não registra a Ata nem a resposta da IA nos logs em caso de %s", async (_label, service) => {
    const written: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        written.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
        return true;
      });

    try {
      await request(createExtractionApp(service, {}, written))
        .post("/task/project-wizard/extract-tasks")
        .set(gatewayHeaders())
        .send(validExtractionBody);
    } finally {
      writeSpy.mockRestore();
    }

    const logs = written.join("\n");

    expect(logs).not.toContain("Apurar impostos do trimestre");
    expect(logs).not.toContain("Reunir documentos do cliente");
  });

  it.each([
    [
      "resposta do provedor fora do JSON",
      new Response('{"choices":[{"message":{"content":"SEGREDOXYZ da Ata"}}]}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ],
    [
      "corpo do provedor sem JSON",
      new Response("SEGREDOXYZ da Ata", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ],
  ])("não registra a resposta bruta da IA nos logs quando %s", async (_label, providerResponse) => {
    const extractionService = new ProjectWizardExtractionService(
      createAiTaskExtractionProvider({
        mode: "openai",
        apiKey: "sk-test",
        baseUrl: "https://provider.test/v1",
        fetchImpl: (async () => providerResponse) as unknown as typeof fetch,
      }),
      {
        department: {
          findMany: vi.fn().mockResolvedValue([{ id: "dep-1", name: "Fiscal", tasksModel: [] }]),
        },
      } as never,
    );
    const written: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        written.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
        return true;
      });

    let status = 0;
    try {
      status = (
        await request(createExtractionApp(extractionService, {}, written))
          .post("/task/project-wizard/extract-tasks")
          .set(gatewayHeaders())
          .send(validExtractionBody)
      ).status;
    } finally {
      writeSpy.mockRestore();
    }

    expect(status).toBe(502);
    expect(written.join("\n")).not.toContain("SEGREDOXYZ");
  });

  it("aceita owner sem nível de Integração", async () => {
    const service: ProjectWizardExtractionRouteDeps = {
      extractTasks: vi.fn().mockResolvedValue({ tasks: [{ name: "Tarefa" }] }),
    };

    const response = await request(createExtractionApp(service))
      .post("/task/project-wizard/extract-tasks")
      .set({
        ...gatewayHeaders(),
        [FORWARDED_AUTH_TYPE_HEADER]: "owner",
        [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ integracao: 0 }),
      })
      .send(validExtractionBody);

    expect(response.status).toBe(200);
    expect(service.extractTasks).toHaveBeenCalledWith(expect.objectContaining({ isOwner: true }));
  });
});
