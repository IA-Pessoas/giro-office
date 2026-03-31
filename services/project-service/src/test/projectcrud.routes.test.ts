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
import type { ProjectCrudRouteDeps } from "../routes/projectcrud.routes.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "audit-service-token";

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

test("POST /integracao-projects sem token interno retorna 401", async () => {
  const deps: ProjectCrudRouteDeps = {
    create: mock.fn(async () => ({ create: {} })),
    list: mock.fn(async () => []),
    update: mock.fn(async () => ({})),
    detail: mock.fn(async () => ({ detail: {} })),
    delete: mock.fn(async () => ({ response: {} })),
  };
  const { app } = createProjectApplication({ projectCrudService: deps });
  const { server, baseUrl } = await startServer(app);

  try {
    const res = await new Promise<{ statusCode: number }>((resolve, reject) => {
      const req = nodeRequest(
        `${baseUrl}/integracao-projects`,
        { method: "POST", headers: { "content-type": "application/json" } },
        (r) => resolve({ statusCode: r.statusCode ?? 0 }),
      );
      req.on("error", reject);
      req.end(JSON.stringify({}));
    });

    assert.equal(res.statusCode, 401);
    assert.equal(deps.create.mock.calls.length, 0);
  } finally {
    await stopServer(server);
  }
});

test("POST /integracao-projects com auth gateway chama create e retorna 201", async () => {
  const payload = {
    create: {
      id: "d0000000-0000-4000-8000-000000000001",
      name: "Novo",
    },
  };
  const deps: ProjectCrudRouteDeps = {
    create: mock.fn(async () => payload),
    list: mock.fn(async () => []),
    update: mock.fn(async () => ({})),
    detail: mock.fn(async () => ({ detail: {} })),
    delete: mock.fn(async () => ({ response: {} })),
  };
  const { app } = createProjectApplication({ projectCrudService: deps });
  const { server, baseUrl } = await startServer(app);

  try {
    const body = {
      name: "Novo",
      client_id: "b0000000-0000-4000-8000-000000000001",
      start_date: "2025-02-01",
      objective: "obj",
    };

    const res = await new Promise<{ statusCode: number; raw: string }>((resolve, reject) => {
      const req = nodeRequest(
        `${baseUrl}/integracao-projects`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...gatewayHeaders(),
          },
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
      req.end(JSON.stringify(body));
    });

    assert.equal(res.statusCode, 201);
    const json = JSON.parse(res.raw) as { success: boolean; data: typeof payload };
    assert.equal(json.success, true);
    assert.deepEqual(json.data, payload);
    assert.equal(deps.create.mock.calls.length, 1);
  } finally {
    await stopServer(server);
  }
});

test("GET /integracao-projects sem ref válido retorna 400", async () => {
  const deps: ProjectCrudRouteDeps = {
    create: mock.fn(async () => ({ create: {} })),
    list: mock.fn(async () => []),
    update: mock.fn(async () => ({})),
    detail: mock.fn(async () => ({ detail: {} })),
    delete: mock.fn(async () => ({ response: {} })),
  };
  const { app } = createProjectApplication({ projectCrudService: deps });
  const { server, baseUrl } = await startServer(app);

  try {
    const res = await new Promise<{ statusCode: number }>((resolve, reject) => {
      const req = nodeRequest(
        `${baseUrl}/integracao-projects?ref=invalido&id=b0000000-0000-4000-8000-000000000001`,
        { method: "GET", headers: gatewayHeaders() },
        (r) => resolve({ statusCode: r.statusCode ?? 0 }),
      );
      req.on("error", reject);
      req.end();
    });

    assert.equal(res.statusCode, 400);
    assert.equal(deps.list.mock.calls.length, 0);
  } finally {
    await stopServer(server);
  }
});
