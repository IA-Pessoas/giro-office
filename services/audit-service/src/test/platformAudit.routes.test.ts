import {
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { AuditServiceEnv } from "../config/env.js";
import {
  type AuditRequestRepository,
  createAuditRequestRepository,
} from "../integrations/prisma/auditRequestRepository.js";
import { buildAuditServiceOpenApiSpec } from "../openapi/spec.js";

const env: AuditServiceEnv = {
  nodeEnv: "test",
  auditEnabled: true,
  auditServicePort: 3020,
  auditServiceToken: "audit-service-token",
  databaseUrl: "postgresql://localhost:5432/test",
  logLevel: "silent",
  logPretty: false,
  enableApiDocs: false,
};

function createTestLogger() {
  return createLogger({
    service: "audit-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });
}

function createRepository(): AuditRequestRepository {
  return {
    create: vi.fn(),
    search: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
    findByRequestId: vi.fn().mockResolvedValue(null),
  };
}

function platformHeaders(
  overrides: Partial<
    Record<
      "userId" | "authKind" | "platformRole" | "organizationId" | "internalToken" | "permission",
      string
    >
  > = {},
): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: overrides.userId ?? "platform-user-1",
    [FORWARDED_AUTH_KIND_HEADER]: overrides.authKind ?? "platform",
    [FORWARDED_AUTH_PLATFORM_ROLE_HEADER]: overrides.platformRole ?? "super_admin",
    [INTERNAL_SERVICE_TOKEN_HEADER]: overrides.internalToken ?? env.auditServiceToken,
    ...(overrides.organizationId
      ? { [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: overrides.organizationId }
      : {}),
    ...(overrides.permission ? { [FORWARDED_AUTH_PERMISSION_HEADER]: overrides.permission } : {}),
  };
}

function organizationHeaders(organizationId = "org-1"): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: "organization-user-1",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: "2",
    [FORWARDED_AUTH_KIND_HEADER]: "organization",
    [INTERNAL_SERVICE_TOKEN_HEADER]: env.auditServiceToken,
  };
}

describe("platform audit routes", () => {
  let repository: AuditRequestRepository;

  beforeEach(() => {
    repository = createRepository();
  });

  it("permite busca global somente ao super administrador da plataforma", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests?page=1&pageSize=25")
      .set(platformHeaders());

    expect(response.status).toBe(200);
    expect(repository.search).toHaveBeenCalledOnce();
    const [filters] = vi.mocked(repository.search).mock.calls[0];
    expect(filters).toMatchObject({ page: 1, pageSize: 25 });
    expect(filters).not.toHaveProperty("organizationId");
  });

  it.each([
    ["organizationId", { organizationId: "forged-org" }],
    ["permission", { permission: "2" }],
    ["permission invalida", { permission: "not-a-number" }],
    ["organizationId e permission", { organizationId: "forged-org", permission: "2" }],
  ])("rejeita busca platform com header organizacional %s", async (_label, overrides) => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests")
      .set(platformHeaders(overrides));

    expect(response.status).toBe(403);
    expect(repository.search).not.toHaveBeenCalled();
  });

  it("mantem administradores organizacionais confinados ao tenant encaminhado", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests")
      .set(organizationHeaders("org-2"));

    expect(response.status).toBe(200);
    expect(repository.search).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-2" }),
    );
  });

  it("rejeita headers de plataforma sem o token interno do gateway", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests")
      .set(platformHeaders({ internalToken: "attacker-token" }));

    expect(response.status).toBe(401);
    expect(repository.search).not.toHaveBeenCalled();
  });

  it("rejeita identidade de plataforma sem o par exato platform/super_admin", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests")
      .set(platformHeaders({ platformRole: "support" }));

    expect(response.status).toBe(401);
    expect(repository.search).not.toHaveBeenCalled();
  });

  it("nao permite que identidade organizacional omita o tenant", async () => {
    const headers = organizationHeaders();
    delete headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER];

    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests")
      .set(headers);

    expect(response.status).toBe(401);
    expect(repository.search).not.toHaveBeenCalled();
  });

  it("nao abre uma rota direta /platform no audit-service", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/platform/audit/requests")
      .set(platformHeaders());

    expect(response.status).toBe(404);
    expect(repository.search).not.toHaveBeenCalled();
  });

  it("mantem o detalhe restrito a uma organizacao", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests/req-1")
      .set(platformHeaders());

    expect(response.status).toBe(403);
    expect(repository.findByRequestId).not.toHaveBeenCalled();
  });

  it("nao aceita permissao organizacional injetada em identidade de plataforma", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests/req-1")
      .set(platformHeaders({ organizationId: "forged-org", permission: "2" }));

    expect(response.status).toBe(403);
    expect(repository.findByRequestId).not.toHaveBeenCalled();
  });

  it("rejeita pagina cujo offset excede a janela administrativa", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests?page=52&pageSize=200")
      .set(platformHeaders());

    expect(response.status).toBe(400);
    expect(repository.search).not.toHaveBeenCalled();
  });

  it("rejeita filtro textual acima do limite", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get(`/audit/requests?path=${"a".repeat(201)}`)
      .set(platformHeaders());

    expect(response.status).toBe(400);
    expect(repository.search).not.toHaveBeenCalled();
  });
});

describe("platform audit persistence", () => {
  it("limita o total global, anuncia ultima pagina acessivel e retorna DTO por allowlist", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "audit-1",
        request_id: "request-1",
        organization_id: "org-1",
        user_id: "sensitive-user",
        permission: 3,
        method: "GET",
        path: "/user",
        query_json: { token: "sensitive-query" },
        status_code: 200,
        outcome: "success",
        duration_ms: 12,
        ip: "127.0.0.1",
        user_agent: "sensitive-agent",
        origin: "sensitive-origin",
        error_code: null,
        error_message: "sensitive-error",
        service_source: "gateway",
        metadata_json: { secret: true },
        created_at: new Date("2026-08-24T12:00:00.000Z"),
        finished_at: new Date("2026-08-24T12:00:00.012Z"),
        action: "READ",
        referring: "user",
        referring_id: "user-1",
        changes_json: { password: "sensitive-change" },
        department: "Sensitive",
      },
    ]);
    const count = vi.fn().mockResolvedValue(50_000);
    const repository = createAuditRequestRepository({
      auditRequest: { findMany, count },
      $transaction: (operations: Array<Promise<unknown>>) => Promise.all(operations),
    } as never);

    const result = await repository.search({ page: 401, pageSize: 25 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        skip: 10_000,
        take: 25,
        select: {
          id: true,
          request_id: true,
          organization_id: true,
          method: true,
          path: true,
          status_code: true,
          outcome: true,
          duration_ms: true,
          service_source: true,
          created_at: true,
        },
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: {}, take: 10_025 });
    expect(result.total).toBe(10_025);
    expect((Math.ceil(result.total / result.pageSize) - 1) * result.pageSize).toBe(10_000);
    expect(result.items).toEqual([
      {
        id: "audit-1",
        requestId: "request-1",
        organizationId: "org-1",
        method: "GET",
        path: "/user",
        statusCode: 200,
        outcome: "success",
        durationMs: 12,
        serviceSource: "gateway",
        createdAt: "2026-08-24T12:00:00.000Z",
      },
    ]);
  });
});

describe("platform audit OpenAPI", () => {
  it("documenta paginacao limitada para a rota clonada pelo gateway", () => {
    const spec = buildAuditServiceOpenApiSpec(env);

    expect(spec.paths).toHaveProperty(["/audit/requests", "get", "parameters", 0, "schema"], {
      type: "integer",
      minimum: 1,
      maximum: 10_001,
      default: 1,
    });
    expect(spec.paths).toHaveProperty(["/audit/requests", "get", "parameters", 1, "schema"], {
      type: "integer",
      minimum: 1,
      maximum: 200,
      default: 50,
    });
  });

  it("documenta filtros, limites e respostas de erro da busca", () => {
    const spec = buildAuditServiceOpenApiSpec(env);
    const operation = (spec.paths["/audit/requests"] as { get: unknown }).get as {
      parameters: Array<{ name: string; in: string; schema: Record<string, unknown> }>;
      responses: Record<string, unknown>;
    };
    const parameters = Object.fromEntries(
      operation.parameters.map((parameter) => [parameter.name, parameter]),
    );

    for (const name of [
      "requestId",
      "userId",
      "method",
      "path",
      "referring",
      "referringId",
      "department",
    ]) {
      expect(parameters[name]).toMatchObject({
        in: "query",
        schema: { type: "string", maxLength: 200 },
      });
    }
    expect(parameters.statusCode).toMatchObject({
      in: "query",
      schema: { type: "integer" },
    });
    expect(parameters.dateFrom).toMatchObject({
      in: "query",
      schema: { type: "string", format: "date-time" },
    });
    expect(parameters.dateTo).toMatchObject({
      in: "query",
      schema: { type: "string", format: "date-time" },
    });
    expect(operation.responses).toEqual(
      expect.objectContaining({
        "400": expect.any(Object),
        "401": expect.any(Object),
        "403": expect.any(Object),
      }),
    );
  });
});
