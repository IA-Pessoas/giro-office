import {
  CSRF_HEADER_NAME,
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  hashCsrfToken,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  organizationServiceConstructorMock,
  organizationServiceMock,
  prismaMock,
  verifyJwtTokenMock,
} = vi.hoisted(() => {
  const service = {
    list: vi.fn(),
    listPlatform: vi.fn(),
    createPlatform: vi.fn(),
    findPlatformById: vi.fn(),
    updatePlatformStatus: vi.fn(),
    updatePlatformSubscriptionPlan: vi.fn(),
    updatePlatformLogoUrl: vi.fn(),
  };
  return {
    organizationServiceConstructorMock: vi.fn(function OrganizationService() {
      return service;
    }),
    organizationServiceMock: service,
    prismaMock: { platformAuthSession: { findFirst: vi.fn() } },
    verifyJwtTokenMock: vi.fn(),
  };
});

vi.mock("@workspace/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/shared")>()),
  verifyJwtToken: verifyJwtTokenMock,
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

vi.mock("../services/organizationService.js", () => ({
  OrganizationService: organizationServiceConstructorMock,
}));

import { createOrganizationApp } from "../app.js";
import type { OrganizationEnv } from "../config/env.js";
import { buildOrganizationServiceOpenApiSpec } from "../openapi/spec.js";

interface OpenApiOperationForTest {
  security?: unknown;
  parameters?: unknown[];
  responses?: Record<string, unknown>;
}

type OpenApiPathsForTest = Record<
  string,
  {
    get?: OpenApiOperationForTest;
    post?: OpenApiOperationForTest;
    patch?: OpenApiOperationForTest;
  }
>;

const env = {
  port: 3031,
  databaseUrl: "postgresql://localhost/organization_test",
  jwtSecret: "test-jwt-secret-for-organization-service-min-32",
  nodeEnv: "test",
  logLevel: "silent",
  logPretty: false,
  allowedOrigins: ["*"],
  enableApiDocs: false,
  auditServiceToken: "audit-service-token",
  auditServiceUrl: "http://audit-service:3020",
  organizationDomainAuditEnabled: true,
} as OrganizationEnv & { auditServiceToken: string };
const csrfToken = "A".repeat(43);
const platformSession = {
  csrf_hash: hashCsrfToken(csrfToken),
  platformUser: {
    id: "platform-user-1",
    name: "Platform Administrator",
    email: "admin@example.com",
    platform_role: "super_admin",
    status: "active",
    session_version: 1,
  },
};

function createApp() {
  return createOrganizationApp(
    env,
    createLogger({
      service: "organization-service-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    }),
  );
}

function platformHeaders(
  overrides: Partial<Record<"userId" | "authKind" | "platformRole" | "internalToken", string>> = {},
): Record<string, string> {
  verifyJwtTokenMock.mockReturnValue({
    user_id: overrides.userId ?? "platform-user-1",
    auth_kind: "platform",
    platform_role: "super_admin",
    session_version: 1,
    session_id: "platform-session-1",
    csrf_hash: hashCsrfToken(csrfToken),
  });
  return {
    Cookie: `cw.session=platform-session; cw.csrf=${csrfToken}`,
    [FORWARDED_AUTH_USER_ID_HEADER]: overrides.userId ?? "platform-user-1",
    [FORWARDED_AUTH_KIND_HEADER]: overrides.authKind ?? "platform",
    [FORWARDED_AUTH_PLATFORM_ROLE_HEADER]: overrides.platformRole ?? "super_admin",
    [INTERNAL_SERVICE_TOKEN_HEADER]: overrides.internalToken ?? env.auditServiceToken,
    [CSRF_HEADER_NAME]: csrfToken,
  };
}

describe("platform organization routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.platformAuthSession.findFirst.mockResolvedValue(platformSession);
    organizationServiceMock.listPlatform.mockResolvedValue({
      organizations: [{ id: "org-1", name: "Castelo", status: "active" }],
      total: 1,
      page: 2,
      pageSize: 20,
    });
    organizationServiceMock.createPlatform.mockResolvedValue({ id: "org-1", status: "active" });
    organizationServiceMock.findPlatformById.mockResolvedValue({ id: "org-1", name: "Castelo" });
    organizationServiceMock.updatePlatformStatus.mockResolvedValue({
      id: "org-1",
      status: "suspended",
    });
    organizationServiceMock.updatePlatformSubscriptionPlan.mockResolvedValue({
      id: "org-1",
      subscription_plan: "pro",
    });
    organizationServiceMock.updatePlatformLogoUrl.mockResolvedValue({
      id: "org-1",
      logo_url: "https://cdn.example.com/logo.png",
    });
  });

  it("lista organizações somente para a sessão HTTP-only de super administrador", async () => {
    const response = await request(createApp())
      .get("/platform/organizations?page=2&pageSize=20&status=active&search=castelo")
      .set(platformHeaders());

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      organizations: [{ id: "org-1", name: "Castelo", status: "active" }],
      total: 1,
      page: 2,
      pageSize: 20,
    });
    expect(organizationServiceMock.listPlatform).toHaveBeenCalledWith({
      page: 2,
      pageSize: 20,
      status: "active",
      search: "castelo",
    });
  });

  it("rejeita ausência de sessão de plataforma", async () => {
    const response = await request(createApp()).get("/platform/organizations");

    expect(response.status).toBe(401);
    expect(organizationServiceMock.listPlatform).not.toHaveBeenCalled();
  });

  it("rejeita uma identidade organizacional", async () => {
    const response = await request(createApp())
      .get("/platform/organizations")
      .set(platformHeaders({ authKind: "organization", platformRole: "" }));

    expect(response.status).toBe(403);
    expect(organizationServiceMock.listPlatform).not.toHaveBeenCalled();
  });

  it("rejeita headers de plataforma forjados sem token interno válido", async () => {
    const response = await request(createApp())
      .get("/platform/organizations")
      .set(platformHeaders({ internalToken: "attacker-token" }));

    expect(response.status).toBe(401);
    expect(organizationServiceMock.listPlatform).not.toHaveBeenCalled();
  });

  it("rejeita uma página cujo offset excede a janela administrativa", async () => {
    const response = await request(createApp())
      .get("/platform/organizations?page=502&pageSize=20")
      .set(platformHeaders());

    expect(response.status).toBe(400);
    expect(organizationServiceMock.listPlatform).not.toHaveBeenCalled();
  });

  it("cria organização com identidade derivada e contrato estrito", async () => {
    // Falha detectada: o cliente consegue injetar identidade/defaults ou a rota não retorna 201.
    const response = await request(createApp())
      .post("/platform/organizations")
      .set(platformHeaders())
      .send({ name: "Castelo", cnpj: "11222333000181" });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({ id: "org-1", status: "active" });
    expect(organizationServiceMock.createPlatform).toHaveBeenCalledWith({
      name: "Castelo",
      cnpj: "11222333000181",
      emailCreatedBy: "admin@example.com",
      actorPlatformUserId: "platform-user-1",
    });
  });

  it("rejeita campos extras no body de criação", async () => {
    // Falha detectada: o cliente define status, plano, owner ou e-mail do criador.
    const response = await request(createApp())
      .post("/platform/organizations")
      .set(platformHeaders())
      .send({
        name: "Castelo",
        cnpj: "11222333000181",
        email_created_by: "attacker@example.com",
      });

    expect(response.status).toBe(400);
    expect(organizationServiceMock.createPlatform).not.toHaveBeenCalled();
  });

  it("rejeita mutação sem CSRF", async () => {
    // Falha detectada: cookie de sessão sozinho autoriza mutações da plataforma.
    const headers = platformHeaders();
    delete headers[CSRF_HEADER_NAME];

    const response = await request(createApp())
      .post("/platform/organizations")
      .set(headers)
      .send({ name: "Castelo", cnpj: "11222333000181" });

    expect(response.status).toBe(403);
    expect(organizationServiceMock.createPlatform).not.toHaveBeenCalled();
  });

  it("rejeita CSRF que coincide entre cookie e header mas não com a sessão validada", async () => {
    // Falha detectada: um par cookie/header forjado ignora o hash CSRF vinculado à sessão.
    const forgedCsrf = "B".repeat(43);
    const headers = platformHeaders();
    headers.Cookie = `cw.session=platform-session; cw.csrf=${forgedCsrf}`;
    headers[CSRF_HEADER_NAME] = forgedCsrf;

    const response = await request(createApp())
      .patch("/platform/organizations/11111111-1111-4111-8111-111111111111/status")
      .set(headers)
      .send({ status: "suspended", expected_updated_at: "2026-08-25T12:00:00.000Z" });

    expect(response.status).toBe(403);
    expect(organizationServiceMock.updatePlatformStatus).not.toHaveBeenCalled();
  });

  it("busca detalhe pela projeção segura de plataforma", async () => {
    // Falha detectada: o detalhe não é protegido ou usa o service legado que expõe e-mail.
    const response = await request(createApp())
      .get("/platform/organizations/11111111-1111-4111-8111-111111111111")
      .set(platformHeaders());

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ id: "org-1", name: "Castelo" });
    expect(organizationServiceMock.findPlatformById).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("atualiza status com concorrência otimista", async () => {
    // Falha detectada: a rota descarta expected_updated_at ou a identidade do ator.
    const response = await request(createApp())
      .patch("/platform/organizations/11111111-1111-4111-8111-111111111111/status")
      .set(platformHeaders())
      .send({ status: "suspended", expected_updated_at: "2026-08-25T12:00:00.000Z" });

    expect(response.status).toBe(200);
    expect(organizationServiceMock.updatePlatformStatus).toHaveBeenCalledWith({
      id: "11111111-1111-4111-8111-111111111111",
      status: "suspended",
      expectedUpdatedAt: "2026-08-25T12:00:00.000Z",
      actorPlatformUserId: "platform-user-1",
    });
  });

  it("atualiza plano fechado com concorrência otimista", async () => {
    // Falha detectada: a rota usa plano livre ou deixa de propagar o timestamp esperado.
    const response = await request(createApp())
      .patch("/platform/organizations/11111111-1111-4111-8111-111111111111/subscription-plan")
      .set(platformHeaders())
      .send({ subscription_plan: "pro", expected_updated_at: "2026-08-25T12:00:00.000Z" });

    expect(response.status).toBe(200);
    expect(organizationServiceMock.updatePlatformSubscriptionPlan).toHaveBeenCalledWith({
      id: "11111111-1111-4111-8111-111111111111",
      subscriptionPlan: "pro",
      expectedUpdatedAt: "2026-08-25T12:00:00.000Z",
      actorPlatformUserId: "platform-user-1",
    });
  });

  it("atualiza logo HTTPS com concorrência otimista", async () => {
    // Falha detectada: a rota perde a URL validada, o timestamp ou o ator da mudança.
    const response = await request(createApp())
      .patch("/platform/organizations/11111111-1111-4111-8111-111111111111/logo-url")
      .set(platformHeaders())
      .send({
        logo_url: "https://cdn.example.com/logo.png",
        expected_updated_at: "2026-08-25T12:00:00.000Z",
      });

    expect(response.status).toBe(200);
    expect(organizationServiceMock.updatePlatformLogoUrl).toHaveBeenCalledWith({
      id: "11111111-1111-4111-8111-111111111111",
      logoUrl: "https://cdn.example.com/logo.png",
      expectedUpdatedAt: "2026-08-25T12:00:00.000Z",
      actorPlatformUserId: "platform-user-1",
    });
  });

  it("injeta o recorder de auditoria somente no service das rotas de plataforma", () => {
    // Falha detectada: mutações de plataforma usam OrganizationService sem auditoria de domínio.
    createApp();

    expect(organizationServiceConstructorMock).toHaveBeenCalledWith(expect.any(Function));
  });
});

describe("platform organization OpenAPI", () => {
  it("documenta a paginação limitada por offset", () => {
    const spec = buildOrganizationServiceOpenApiSpec(env);

    expect(spec.paths).toHaveProperty(
      ["/platform/organizations", "get", "parameters", 0, "schema"],
      { type: "integer", minimum: 1, maximum: 10_001, default: 1 },
    );
    expect(spec.paths).toHaveProperty(
      ["/platform/organizations", "get", "parameters", 2, "schema"],
      { type: "string", enum: ["trial", "past_due", "active", "suspended", "cancelled"] },
    );
  });

  it("documenta criação estrita com cookie, CSRF e respostas de segurança", () => {
    // Falha detectada: consumidores enviam campos proibidos ou omitem proteção CSRF documentada.
    const spec = buildOrganizationServiceOpenApiSpec(env);
    const paths = spec.paths as OpenApiPathsForTest;

    expect(spec.paths).toHaveProperty(
      ["/platform/organizations", "post", "requestBody", "content", "application/json", "schema"],
      {
        type: "object",
        properties: {
          name: { type: "string" },
          cnpj: {
            description: expect.any(String),
            oneOf: [
              { type: "string", pattern: "^[0-9]{14}$", example: "11222333000181" },
              {
                type: "string",
                pattern: "^[0-9]{2}\\.[0-9]{3}\\.[0-9]{3}/[0-9]{4}-[0-9]{2}$",
                example: "11.222.333/0001-81",
              },
            ],
          },
        },
        required: ["name", "cnpj"],
        additionalProperties: false,
      },
    );
    expect(spec.paths).toHaveProperty(
      ["/platform/organizations", "post", "security"],
      [{ cookieAuth: [] }],
    );
    expect(spec.paths).toHaveProperty(
      ["/platform/organizations", "post", "parameters", 0],
      expect.objectContaining({ name: "x-csrf-token", in: "header", required: true }),
    );
    expect(Object.keys(paths["/platform/organizations"]?.post?.responses ?? {})).toEqual([
      "201",
      "400",
      "401",
      "403",
      "409",
    ]);
  });

  it("documenta detalhe e todas as mutações explícitas da plataforma", () => {
    // Falha detectada: uma rota implementada fica fora do contrato ou sem respostas 404/409.
    const spec = buildOrganizationServiceOpenApiSpec(env);
    const paths = spec.paths as OpenApiPathsForTest;

    expect(paths["/platform/organizations/{id}"]?.get).toBeDefined();
    for (const path of [
      "/platform/organizations/{id}/status",
      "/platform/organizations/{id}/subscription-plan",
      "/platform/organizations/{id}/logo-url",
    ]) {
      expect(paths[path]?.patch?.security).toEqual([{ cookieAuth: [] }]);
      expect(paths[path]?.patch?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "id", in: "path", required: true }),
          expect.objectContaining({ name: "x-csrf-token", in: "header", required: true }),
        ]),
      );
      expect(Object.keys(paths[path]?.patch?.responses ?? {})).toEqual([
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
      ]);
    }
    expect(spec.paths).toHaveProperty(
      [
        "/platform/organizations/{id}/logo-url",
        "patch",
        "requestBody",
        "content",
        "application/json",
        "schema",
        "properties",
        "logo_url",
      ],
      {
        type: "string",
        format: "uri",
        pattern: "^https://(?![^/?#]*@).+$",
        maxLength: 2_048,
        nullable: true,
        description: "URL HTTPS sem credenciais embutidas, ou null para remover a logo.",
      },
    );
  });
});
