import { createServer, type Server } from "node:http";
import {
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTaskApp } from "../app.js";
import type { TaskServiceEnv } from "../config/env.js";
import { buildTaskServiceOpenApiSpec } from "../openapi/spec.js";

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

  function createApp() {
    return createTaskApp(
      { ...env, projectServiceUrl },
      createLogger({
        service: "task-service-test",
        env: "test",
        level: "silent",
        destination: new MemoryLogStream(),
      }),
    );
  }

  const validBody = {
    client_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    name: "Novo projeto",
    start_date: "2026-09-01T00:00:00.000Z",
    objective: "Objetivo do projeto",
  };

  it("documenta a chave obrigatória no OpenAPI", () => {
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

  it("POST /task/project-wizard rejeita corpo inválido", async () => {
    const response = await request(createApp())
      .post("/task/project-wizard")
      .set(gatewayHeaders())
      .set("Idempotency-Key", "wizard-open-1")
      .send({ ...validBody, end_date: "2026-08-31T00:00:00.000Z" });

    expect(response.status).toBe(400);
    expect(forwardedRequest).toBeNull();
  });

  it("POST /task/project-wizard cria projeto sem tarefas", async () => {
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
        counters: { main: 0, dependencies: 0, unassigned: 0 },
      },
    });
    expect(forwardedRequest).toMatchObject({
      body: validBody,
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
