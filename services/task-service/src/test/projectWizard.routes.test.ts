import { createServer, type Server } from "node:http";
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
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTaskApp } from "../app.js";
import type { TaskServiceEnv } from "../config/env.js";
import { createAiTaskExtractionProvider } from "../integrations/aiTaskExtraction.js";
import { buildTaskServiceOpenApiSpec } from "../openapi/spec.js";
import type {
  ProjectWizardExtractionRouteDeps,
  ProjectWizardRouteDeps,
} from "../routes/projectWizard.routes.js";
import { projectWizardCreateBodySchema } from "../schemas/projectWizard.schemas.js";
import { ProjectWizardExtractionService } from "../services/projectWizardExtractionService.js";

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
  let upstream: Server;
  let projectServiceUrl = "";
  let forwardedRequest: {
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
  } | null;

  beforeAll(async () => {
    upstream = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      forwardedRequest = {
        body: JSON.parse(Buffer.concat(chunks).toString()),
        headers: req.headers,
      };
      res.writeHead(201, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          data: {
            create: {
              id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
              name: "Novo projeto",
              client_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
            },
          },
        }),
      );
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const address = upstream.address();
    if (!address || typeof address === "string") throw new Error("Porta do upstream indisponível.");
    projectServiceUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      upstream.close((err) => (err ? reject(err) : resolve())),
    );
  });

  beforeEach(() => {
    forwardedRequest = null;
  });

  function createApp(projectWizardService?: ProjectWizardRouteDeps) {
    return createTaskApp(
      { ...env, projectServiceUrl },
      createLogger({
        service: "task-service-test",
        env: "test",
        level: "silent",
        destination: new MemoryLogStream(),
      }),
      projectWizardService ? { projectWizardService } : undefined,
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
  });

  it("POST /task/project-wizard aceita lista vazia", async () => {
    const service: ProjectWizardRouteDeps = {
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
  ])("POST /task/project-wizard rejeita Modelo repetido %j antes do service", async (modelId) => {
    const service: ProjectWizardRouteDeps = { create: vi.fn() };
    const response = await request(createApp(service))
      .post("/task/project-wizard")
      .set(gatewayHeaders())
      .set("Idempotency-Key", "wizard-duplicate-model")
      .send({
        ...validBody,
        tasks: [validTask, { ...validTask, name: "Outra tarefa", model_id: modelId }],
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: "Cada Modelo pode ser usado em apenas uma tarefa do projeto.",
    });
    expect(service.create).not.toHaveBeenCalled();
    expect(forwardedRequest).toBeNull();
  });

  it.each([
    "name",
    "department_id",
    "model_id",
  ] as const)("POST /task/project-wizard rejeita Tarefa sem %s antes do service", async (field) => {
    const service: ProjectWizardRouteDeps = { create: vi.fn() };
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
    expect(forwardedRequest).toBeNull();
  });

  it("POST /task/project-wizard exige Idempotency-Key", async () => {
    const response = await request(createApp())
      .post("/task/project-wizard")
      .set(gatewayHeaders())
      .send(validBody);

    expect(response.status).toBe(400);
    expect(forwardedRequest).toBeNull();
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
    expect(forwardedRequest).toBeNull();
  });

  it("POST /task/project-wizard rejeita corpo inválido", async () => {
    const response = await request(createApp())
      .post("/task/project-wizard")
      .set(gatewayHeaders())
      .set("Idempotency-Key", "wizard-open-1")
      .send({ ...validBody, end_date: "2026-08-31T00:00:00.000Z" });

    expect(response.status).toBe(400);
    expect(forwardedRequest).toBeNull();
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
    expect(forwardedRequest).toMatchObject({
      body: {
        client_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        name: "Novo projeto",
        start_date: "2026-09-01T00:00:00.000Z",
        end_date: "2026-09-30T00:00:00.000Z",
        objective: "Objetivo do projeto",
      },
      headers: {
        "idempotency-key": "wizard-open-1",
        [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
        [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG_ID,
        [FORWARDED_AUTH_MODULES_HEADER]: expect.any(String),
      },
    });
    expect(
      JSON.parse(forwardedRequest?.headers[FORWARDED_AUTH_MODULES_HEADER] as string),
    ).toMatchObject({ integracao: 2 });
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
    expect(forwardedRequest).toBeNull();
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
