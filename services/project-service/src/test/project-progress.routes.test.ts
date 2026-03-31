import "./env-bootstrap.js";

import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request as nodeRequest, type Server } from "node:http";
import { mock, test } from "node:test";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";

import { createProjectApplication } from "../app.js";
import type { ProjectProgressRouteDeps } from "../routes/project-progress.routes.js";
import type { ProjectCrudRouteDeps } from "../routes/projectcrud.routes.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const PROJECT_ID = "d0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "audit-service-token";

const stubCrudDeps: ProjectCrudRouteDeps = {
  create: mock.fn(async () => ({ create: {} })),
  list: mock.fn(async () => []),
  update: mock.fn(async () => ({})),
  detail: mock.fn(async () => ({ detail: {} })),
  delete: mock.fn(async () => ({ response: {} })),
};

async function startServer(app: ReturnType<typeof createProjectApplication>["app"]): Promise<{
  server: Server;
  baseUrl: string;
}> {
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve server address.");
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function gatewayHeaders(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: INTERNAL_TOKEN,
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG_ID,
  };
}

test("POST /integracao-project-progress sem token retorna 401", async () => {
  const progressDeps: ProjectProgressRouteDeps = {
    recalculateFromTasks: mock.fn(async () => ({
      project: {
        id: PROJECT_ID,
        status: "Em andamento",
        porcentage: 0,
        client_id: "b0000000-0000-4000-8000-000000000001",
      },
    })),
  };
  const { app } = createProjectApplication({
    projectCrudService: stubCrudDeps,
    projectProgressService: progressDeps,
  });
  const { server, baseUrl } = await startServer(app);

  try {
    const res = await new Promise<{ statusCode: number }>((resolve, reject) => {
      const req = nodeRequest(
        `${baseUrl}/integracao-project-progress`,
        { method: "POST", headers: { "content-type": "application/json" } },
        (r) => resolve({ statusCode: r.statusCode ?? 0 }),
      );
      req.on("error", reject);
      req.end(JSON.stringify({ project_id: PROJECT_ID }));
    });

    assert.equal(res.statusCode, 401);
    assert.equal(progressDeps.recalculateFromTasks.mock.calls.length, 0);
  } finally {
    await stopServer(server);
  }
});

test("POST /integracao-project-progress com body inválido retorna 400", async () => {
  const progressDeps: ProjectProgressRouteDeps = {
    recalculateFromTasks: mock.fn(async () => ({
      project: {
        id: PROJECT_ID,
        status: "Em andamento",
        porcentage: 0,
        client_id: "b0000000-0000-4000-8000-000000000001",
      },
    })),
  };
  const { app } = createProjectApplication({
    projectCrudService: stubCrudDeps,
    projectProgressService: progressDeps,
  });
  const { server, baseUrl } = await startServer(app);

  try {
    const res = await new Promise<{ statusCode: number }>((resolve, reject) => {
      const req = nodeRequest(
        `${baseUrl}/integracao-project-progress`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...gatewayHeaders() },
        },
        (r) => resolve({ statusCode: r.statusCode ?? 0 }),
      );
      req.on("error", reject);
      req.end(JSON.stringify({ project_id: "não-uuid" }));
    });

    assert.equal(res.statusCode, 400);
    assert.equal(progressDeps.recalculateFromTasks.mock.calls.length, 0);
  } finally {
    await stopServer(server);
  }
});

test("POST /integracao-project-progress com auth gateway chama service e retorna 200", async () => {
  const payload = {
    project: {
      id: PROJECT_ID,
      status: "Em andamento",
      porcentage: 50,
      client_id: "b0000000-0000-4000-8000-000000000001",
    },
  };
  const progressDeps: ProjectProgressRouteDeps = {
    recalculateFromTasks: mock.fn(async () => payload),
  };
  const { app } = createProjectApplication({
    projectCrudService: stubCrudDeps,
    projectProgressService: progressDeps,
  });
  const { server, baseUrl } = await startServer(app);

  try {
    const res = await new Promise<{ statusCode: number; raw: string }>((resolve, reject) => {
      const req = nodeRequest(
        `${baseUrl}/integracao-project-progress`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...gatewayHeaders() },
        },
        async (r) => {
          const chunks: Buffer[] = [];
          for await (const chunk of r) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          resolve({
            statusCode: r.statusCode ?? 0,
            raw: Buffer.concat(chunks).toString("utf8"),
          });
        },
      );
      req.on("error", reject);
      req.end(JSON.stringify({ project_id: PROJECT_ID }));
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.raw) as { success: boolean; data: typeof payload };
    assert.equal(json.success, true);
    assert.deepEqual(json.data, payload);
    assert.equal(progressDeps.recalculateFromTasks.mock.calls.length, 1);
    const args = progressDeps.recalculateFromTasks.mock.calls[0]?.arguments;
    assert.equal(args?.[0], PROJECT_ID);
    assert.equal(args?.[1], ORG_ID);
  } finally {
    await stopServer(server);
  }
});
