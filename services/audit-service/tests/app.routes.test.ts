import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { createLogger } from "@workspace/shared";
import type {
  AuditRequestRecord,
  AuditSearchFilters,
  AuditSearchResult,
  CreateAuditRequestPayload,
} from "@workspace/shared/audit";
import {
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared/http";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import { expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AuditServiceEnv } from "../src/config/env.js";
import type { AuditRequestRepository } from "../src/integrations/prisma/auditRequestRepository.js";

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
        .filter((record) =>
          filters.organizationId ? record.organizationId === filters.organizationId : true,
        )
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
      organizationId?: string,
    ): Promise<AuditRequestRecord | null> {
      const record = records.get(requestId);

      if (!record || (organizationId && record.organizationId !== organizationId)) {
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
    auditServicePort: 3020,
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

function withPlatformHeaders(): HeadersInit {
  return withInternalHeaders({
    [FORWARDED_AUTH_USER_ID_HEADER]: "platform-1",
    [FORWARDED_AUTH_KIND_HEADER]: "platform",
    [FORWARDED_AUTH_PLATFORM_ROLE_HEADER]: "super_admin",
  });
}

it("returns 404 for audit routes when the feature flag is disabled", async () => {
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

    expect(response.status).toBe(404);
    expect(body.error).toBe("Recurso não encontrado.");
  } finally {
    await stopServer(server);
  }
});

it("stores audit records through the internal ingest endpoint", async () => {
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

    expect(createResponse.status).toBe(201);

    const readResponse = await fetch(`${baseUrl}/audit/requests/req-1`, {
      headers: withReadHeaders(),
    });
    const readBody = (await readResponse.json()) as {
      success: true;
      data: { item: AuditRequestRecord };
    };

    expect(readResponse.status).toBe(200);
    expect(readBody.data.item.requestId).toBe("req-1");
    expect(readBody.data.item.organizationId).toBe("org-1");
  } finally {
    await stopServer(server);
  }
});

it("denies audit reads for non-admin permissions", async () => {
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

    expect(response.status).toBe(403);
    expect(body.error).toBe("Acesso negado para esta rota.");
  } finally {
    await stopServer(server);
  }
});

it("scopes audit search results to the forwarded organization", async () => {
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

    expect(response.status).toBe(200);
    expect(body.data.total).toBe(1);
    expect(body.data.items[0]?.requestId).toBe("req-1");
  } finally {
    await stopServer(server);
  }
});

it("allows platform super admin to search audit records by organizationId", async () => {
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
    path: "/organizations",
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
    const response = await fetch(
      `${baseUrl}/platform/audit/requests?organizationId=org-1&pageSize=20`,
      {
        headers: withPlatformHeaders(),
      },
    );
    const body = (await response.json()) as {
      success: true;
      data: AuditSearchResult;
    };

    expect(response.status).toBe(200);
    expect(body.data.total).toBe(1);
    expect(body.data.items[0]?.requestId).toBe("req-1");
  } finally {
    await stopServer(server);
  }
});

it("allows platform super admin to search audit records globally", async () => {
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
    path: "/organizations",
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
    const response = await fetch(`${baseUrl}/audit/requests?pageSize=20`, {
      headers: withPlatformHeaders(),
    });
    const body = (await response.json()) as {
      success: true;
      data: AuditSearchResult;
    };

    expect(response.status).toBe(200);
    expect(body.data.total).toBe(2);
    expect(body.data.items.map((item) => item.requestId)).toEqual(["req-2", "req-1"]);
  } finally {
    await stopServer(server);
  }
});

it("allows platform super admin to read audit records by requestId", async () => {
  const repository = createTestRepository();
  await repository.create({
    requestId: "req-2",
    organizationId: "org-2",
    userId: "user-2",
    permission: 2,
    method: "GET",
    path: "/organizations",
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
    const response = await fetch(`${baseUrl}/audit/requests/req-2`, {
      headers: withPlatformHeaders(),
    });
    const body = (await response.json()) as {
      success: true;
      data: { item: AuditRequestRecord };
    };

    expect(response.status).toBe(200);
    expect(body.data.item.requestId).toBe("req-2");
    expect(body.data.item.organizationId).toBe("org-2");
  } finally {
    await stopServer(server);
  }
});
