import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { Writable } from "node:stream";
import test from "node:test";

import {
  type AuditRequestRecord,
  type AuditSearchFilters,
  type AuditSearchResult,
  type CreateAuditRequestPayload,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { createApp } from "../src/app.js";
import type { AuditServiceEnv } from "../src/config/env.js";
import type { AuditRequestRepository } from "../src/integrations/prisma/audit-request-repository.js";

class MemoryLogStream extends Writable {
  _write(
    _chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

function createTestRepository(): AuditRequestRepository {
  const records = new Map<string, AuditRequestRecord>();

  return {
    async create(payload: CreateAuditRequestPayload): Promise<void> {
      records.set(payload.requestId, {
        id: payload.requestId,
        requestId: payload.requestId,
        organizationId: payload.organizationId ?? null,
        userId: payload.userId ?? null,
        permission: payload.permission ?? null,
        method: payload.method,
        path: payload.path,
        query: payload.query ?? {},
        statusCode: payload.statusCode ?? null,
        outcome: payload.outcome,
        durationMs: payload.durationMs ?? null,
        ip: payload.ip ?? null,
        userAgent: payload.userAgent ?? null,
        origin: payload.origin ?? null,
        errorCode: payload.errorCode ?? null,
        errorMessage: payload.errorMessage ?? null,
        serviceSource: payload.serviceSource,
        createdAt: payload.createdAt,
        finishedAt: payload.finishedAt ?? null,
        metadata: payload.metadata ?? null,
      });
    },
    async search(filters: AuditSearchFilters): Promise<AuditSearchResult> {
      const items = [...records.values()]
        .filter((record) => record.organizationId === filters.organizationId)
        .filter((record) => (filters.requestId ? record.requestId === filters.requestId : true))
        .filter((record) => (filters.userId ? record.userId === filters.userId : true))
        .filter((record) => (filters.method ? record.method === filters.method : true))
        .filter((record) => (filters.path ? record.path.includes(filters.path) : true))
        .filter((record) =>
          typeof filters.statusCode === "number" ? record.statusCode === filters.statusCode : true,
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

      const start = (filters.page - 1) * filters.pageSize;

      return {
        items: items.slice(start, start + filters.pageSize),
        total: items.length,
        page: filters.page,
        pageSize: filters.pageSize,
      };
    },
    async findByRequestId(
      requestId: string,
      organizationId: string,
    ): Promise<AuditRequestRecord | null> {
      const record = records.get(requestId);

      if (!record || record.organizationId !== organizationId) {
        return null;
      }

      return record;
    },
  };
}

async function startServer(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve server address.");
  }

  return `http://127.0.0.1:${address.port}`;
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function createTestLogger() {
  return createLogger({
    service: "audit-service-test",
    env: "test",
    destination: new MemoryLogStream(),
  });
}

function createEnv(overrides: Partial<AuditServiceEnv> = {}): AuditServiceEnv {
  return {
    nodeEnv: "test",
    auditEnabled: true,
    auditServicePort: 3335,
    auditServiceToken: "audit-service-token",
    databaseUrl: "postgresql://localhost:5432/test",
    logLevel: "silent",
    logPretty: false,
    ...overrides,
  };
}

function withInternalHeaders(headers: HeadersInit = {}, overrides: Record<string, string> = {}) {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    ...headers,
    ...overrides,
  };
}

function withReadHeaders(permission = "2", organizationId = "org-1"): HeadersInit {
  return withInternalHeaders({
    [FORWARDED_AUTH_USER_ID_HEADER]: "user-1",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: permission,
  });
}

test("returns 404 for audit routes when the feature flag is disabled", async () => {
  const app = createApp({
    env: createEnv({ auditEnabled: false }),
    logger: createTestLogger(),
    repository: createTestRepository(),
  });
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/audit/requests`, {
      headers: withReadHeaders(),
    });
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 404);
    assert.equal(body.error, "Recurso não encontrado.");
  } finally {
    await stopServer(server);
  }
});

test("stores audit records through the internal ingest endpoint", async () => {
  const repository = createTestRepository();
  const app = createApp({
    env: createEnv(),
    logger: createTestLogger(),
    repository,
  });
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const payload: CreateAuditRequestPayload = {
      requestId: "req-1",
      organizationId: "org-1",
      userId: "user-1",
      permission: 2,
      method: "GET",
      path: "/users",
      outcome: "success",
      statusCode: 200,
      durationMs: 12,
      serviceSource: "gateway",
      createdAt: new Date("2026-03-10T10:00:00.000Z").toISOString(),
      finishedAt: new Date("2026-03-10T10:00:00.012Z").toISOString(),
    };

    const createResponse = await fetch(`${baseUrl}/internal/audit/requests`, {
      method: "POST",
      headers: withInternalHeaders({
        "content-type": "application/json",
      }),
      body: JSON.stringify(payload),
    });

    assert.equal(createResponse.status, 201);

    const readResponse = await fetch(`${baseUrl}/audit/requests/req-1`, {
      headers: withReadHeaders(),
    });
    const readBody = (await readResponse.json()) as {
      success: true;
      data: { item: AuditRequestRecord };
    };

    assert.equal(readResponse.status, 200);
    assert.equal(readBody.data.item.requestId, "req-1");
    assert.equal(readBody.data.item.organizationId, "org-1");
  } finally {
    await stopServer(server);
  }
});

test("denies audit reads for non-admin permissions", async () => {
  const app = createApp({
    env: createEnv(),
    logger: createTestLogger(),
    repository: createTestRepository(),
  });
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/audit/requests`, {
      headers: withReadHeaders("1"),
    });
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 403);
    assert.equal(body.error, "Acesso negado para esta rota.");
  } finally {
    await stopServer(server);
  }
});

test("scopes audit search results to the forwarded organization", async () => {
  const repository = createTestRepository();
  await repository.create({
    requestId: "req-1",
    organizationId: "org-1",
    userId: "user-1",
    permission: 2,
    method: "GET",
    path: "/users",
    outcome: "success",
    statusCode: 200,
    durationMs: 10,
    serviceSource: "gateway",
    createdAt: new Date("2026-03-10T10:00:00.000Z").toISOString(),
    finishedAt: new Date("2026-03-10T10:00:00.010Z").toISOString(),
  });
  await repository.create({
    requestId: "req-2",
    organizationId: "org-2",
    userId: "user-2",
    permission: 2,
    method: "GET",
    path: "/users",
    outcome: "success",
    statusCode: 200,
    durationMs: 10,
    serviceSource: "gateway",
    createdAt: new Date("2026-03-10T11:00:00.000Z").toISOString(),
    finishedAt: new Date("2026-03-10T11:00:00.010Z").toISOString(),
  });

  const app = createApp({
    env: createEnv(),
    logger: createTestLogger(),
    repository,
  });
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/audit/requests`, {
      headers: withReadHeaders("2", "org-1"),
    });
    const body = (await response.json()) as {
      success: true;
      data: AuditSearchResult;
    };

    assert.equal(response.status, 200);
    assert.equal(body.data.total, 1);
    assert.equal(body.data.items[0]?.requestId, "req-1");
  } finally {
    await stopServer(server);
  }
});
