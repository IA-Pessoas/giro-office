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
  it("omite o filtro de organizacao e usa ordenacao global estavel", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const repository = createAuditRequestRepository({
      auditRequest: { findMany, count },
      $transaction: (operations: Array<Promise<unknown>>) => Promise.all(operations),
    } as never);

    await repository.search({ page: 1, pageSize: 25 });

    expect(findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip: 0,
      take: 25,
    });
    expect(count).toHaveBeenCalledWith({ where: {} });
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
});
