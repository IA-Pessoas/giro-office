import { ServiceError } from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { getClientServiceEnv } from "../config/env.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import {
  type ClientListPage,
  type ClientPublic,
  ClientService,
  type IClientService,
  type OrganizationPublic,
} from "../services/clientService.js";
import type { HistoryFileStorage } from "../services/historyStorageService.js";

const TEST_JWT_SECRET = "test-jwt-secret-for-client-service";
const TEST_ORG_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_CLIENT_ID = "660e8400-e29b-41d4-a716-446655440001";
const TEST_PENDING_ID = "770e8400-e29b-41d4-a716-446655440002";

function testOrganization(overrides: Partial<OrganizationPublic> = {}): OrganizationPublic {
  return {
    id: TEST_ORG_ID,
    name: "Org Test",
    slug: "org-test",
    logo_url: null,
    status: "active",
    subscription_plan: "trial",
    ...overrides,
  };
}

function baseClient(overrides: Partial<ClientPublic> = {}): ClientPublic {
  return {
    id: TEST_CLIENT_ID,
    name: "Cliente A",
    organization_id: TEST_ORG_ID,
    status: "Ativo",
    cpf_cnpj: "123",
    company_name: null,
    fantasy_name: null,
    service_unique: false,
    deletion_date: null,
    organization: testOrganization(),
    ...overrides,
  };
}

function emptyListPage(): ClientListPage {
  return { items: [], total: 0, page: 1, pageSize: 20, hasMore: false };
}

function mockServiceBase(): Pick<
  IClientService,
  "listByOrganization" | "getById" | "create" | "update" | "deactivate" | "activate"
> {
  return {
    listByOrganization: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    activate: vi.fn(),
  };
}

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/test";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-supabase-service-role-key";
  process.env.ENABLE_API_DOCS = "true";
});

function buildTestApp(
  mock: IClientService,
  overrides?: {
    prisma?: PrismaClient;
    historyStorage?: HistoryFileStorage;
    env?: Partial<ReturnType<typeof getClientServiceEnv>>;
  },
) {
  const env = { ...getClientServiceEnv(), ...overrides?.env };
  const logger = createLogger({
    service: "client-service-test",
    env: "test",
    level: "silent",
  });
  const prisma = overrides?.prisma ?? ({} as unknown as PrismaClient);
  const historyStorage =
    overrides?.historyStorage ??
    ({
      saveObjectPath: vi.fn(),
      createSignedAccessUrl: vi.fn(),
    } as unknown as HistoryFileStorage);
  return createApp({ clientService: mock, env, logger, prisma, historyStorage });
}

function buildPAPrismaMock() {
  const paFindFirst = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({
      client_id: TEST_CLIENT_ID,
      activities: "Comercio",
    })
    .mockResolvedValueOnce({
      client_id: TEST_CLIENT_ID,
      activities: "Comercio",
    });

  return {
    client: {
      findFirst: vi.fn().mockResolvedValue({ id: TEST_CLIENT_ID }),
    },
    pA: {
      findFirst: paFindFirst,
      create: vi.fn().mockResolvedValue({
        client_id: TEST_CLIENT_ID,
        activities: null,
      }),
      update: vi.fn().mockResolvedValue({
        client_id: TEST_CLIENT_ID,
        activities: "Atualizado",
      }),
    },
  } as unknown as PrismaClient;
}

function bearerToken(organizationId: string, permission?: number): string {
  return jwt.sign(
    {
      user_id: "user-test-1",
      organization_id: organizationId,
      ...(permission !== undefined ? { permission } : {}),
    },
    TEST_JWT_SECRET,
  );
}

describe("client-service", () => {
  it("GET /health returns success envelope", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const app = buildTestApp(mock);
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.service).toBe("client-service");
    expect(res.body.data?.status).toBe("ok");
  });

  it("GET /openapi.json returns service specification", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const app = buildTestApp(mock);
    const res = await request(app).get("/openapi.json");

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.3");
    expect(res.body.info?.title).toBe("client-service");
    expect(res.body.paths?.["/client/list"]).toBeDefined();
    expect(res.body.paths?.["/client/commercial/overview"]).toBeDefined();
    expect(res.body.paths?.["/client/{id}/pa"]).toBeDefined();
    expect(res.body.paths?.["/internal/competence-output-update"]).toBeDefined();
  });

  it("GET /openapi.json documents client detail Regularize fields", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const app = buildTestApp(mock);
    const res = await request(app).get("/openapi.json");

    const detailResponse =
      res.body.paths?.["/client/{id}"]?.get?.responses?.["200"]?.content?.["application/json"]
        ?.schema;
    const detailSchema = res.body.components?.schemas?.ClientDetail;

    expect(res.status).toBe(200);
    expect(detailResponse?.properties?.data).toEqual({
      $ref: "#/components/schemas/ClientDetail",
    });
    expect(detailSchema?.properties).toEqual(
      expect.objectContaining({
        responsible: { type: ["string", "null"] },
        cpf_responsible: { type: ["string", "null"] },
        address: { type: ["string", "null"] },
        customer_since: { type: ["string", "null"], format: "date-time" },
        contabil: { type: ["boolean", "null"] },
      }),
    );
  });

  it("GET /openapi.json marks client create organization_id as token-derived", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const app = buildTestApp(mock);
    const res = await request(app).get("/openapi.json");

    const clientCreateRequired =
      res.body.paths?.["/client"]?.post?.requestBody?.content?.["application/json"]?.schema
        ?.required;
    const integrationCreateRequired =
      res.body.paths?.["/client/integration"]?.post?.requestBody?.content?.["application/json"]
        ?.schema?.required;

    expect(res.status).toBe(200);
    expect(clientCreateRequired).toEqual(["name", "status"]);
    expect(integrationCreateRequired).toEqual(["type", "name", "cpf_cnpj"]);
  });

  it("GET /docs serves Swagger UI assets", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const app = buildTestApp(mock);

    const docsResponse = await request(app).get("/docs");
    const initScriptResponse = await request(app).get("/docs/swagger-ui-init.js");

    expect(docsResponse.status).toBe(301);
    expect(docsResponse.headers.location).toBe("/docs/");
    expect(initScriptResponse.status).toBe(200);
    expect(initScriptResponse.text).toContain("/openapi.json");
  });

  it("GET /client/list returns paginated list from injected service", async () => {
    const items: ClientPublic[] = [baseClient()];
    const page: ClientListPage = {
      items,
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    };
    const mock: IClientService = {
      ...mockServiceBase(),
      listByOrganization: vi.fn().mockResolvedValue(page),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app).get("/client/list").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(page);
    expect(mock.listByOrganization).toHaveBeenCalledWith(TEST_ORG_ID, {
      ref: undefined,
      status: undefined,
      page: 1,
      pageSize: 20,
      search: undefined,
    });
  });

  it("GET /client/commercial/overview returns overview scoped to authenticated organization", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const prisma = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({ id: TEST_ORG_ID }),
      },
      client: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaClient;
    const app = buildTestApp(mock, { prisma });
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .get("/client/commercial/overview")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary).toEqual({
      totalLeads: 0,
      activeLeads: 0,
      wonLeads: 0,
      totalValue: 0,
      conversionRate: 0,
      activeProposals: 0,
      activeContracts: 0,
    });
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: TEST_ORG_ID },
      select: { id: true },
    });
  });

  it("GET /client/list passes status filter mapped to BD when query has status Ativo", async () => {
    const page = emptyListPage();
    const mock: IClientService = {
      ...mockServiceBase(),
      listByOrganization: vi.fn().mockResolvedValue(page),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .get("/client/list")
      .query({ status: "Ativo" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mock.listByOrganization).toHaveBeenCalledWith(TEST_ORG_ID, {
      ref: undefined,
      status: "Ativo",
      page: 1,
      pageSize: 20,
      search: undefined,
    });
  });

  it("GET /client maps Prospect to Prospecção for list filter", async () => {
    const page = emptyListPage();
    const mock: IClientService = {
      ...mockServiceBase(),
      listByOrganization: vi.fn().mockResolvedValue(page),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .get("/client/list")
      .query({ status: "Prospect" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mock.listByOrganization).toHaveBeenCalledWith(TEST_ORG_ID, {
      ref: undefined,
      status: "Prospect",
      page: 1,
      pageSize: 20,
      search: undefined,
    });
  });

  it("GET /client/list passes page, limit and search to service", async () => {
    const page = emptyListPage();
    const mock: IClientService = {
      ...mockServiceBase(),
      listByOrganization: vi.fn().mockResolvedValue(page),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .get("/client/list")
      .query({ page: "2", limit: "10", search: "  acme  " })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mock.listByOrganization).toHaveBeenCalledWith(TEST_ORG_ID, {
      ref: undefined,
      status: undefined,
      page: 2,
      pageSize: 10,
      search: "  acme  ",
    });
  });

  it("GET /client/list returns 400 for invalid status query", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .get("/client/list")
      .query({ status: "invalid" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
    expect(mock.listByOrganization).not.toHaveBeenCalled();
  });

  it("POST /client creates via injected service and returns 201 envelope", async () => {
    const created = baseClient({
      id: "770e8400-e29b-41d4-a716-446655440003",
      name: "Novo Cliente",
      cpf_cnpj: "",
      service_unique: true,
    });
    const mock: IClientService = {
      ...mockServiceBase(),
      create: vi.fn().mockResolvedValue(created),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app).post("/client").set("Authorization", `Bearer ${token}`).send({
      organization_id: TEST_ORG_ID,
      name: "Novo Cliente",
      status: "Ativo",
      service_unique: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(created);
    expect(mock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: TEST_ORG_ID,
        name: "Novo Cliente",
        status: "Ativo",
        service_unique: true,
      }),
    );
  });

  it("PATCH /client/:id updates via injected service and returns 200 envelope", async () => {
    const updated = baseClient({
      name: "Nome atualizado",
      cpf_cnpj: "12345678000199",
      company_name: "ACME",
    });
    const mock: IClientService = {
      ...mockServiceBase(),
      update: vi.fn().mockResolvedValue(updated),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .patch(`/client/${TEST_CLIENT_ID}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Nome atualizado", cpf_cnpj: "12345678000199", company_name: "ACME" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(updated);
    expect(mock.update).toHaveBeenCalledWith(
      TEST_CLIENT_ID,
      TEST_ORG_ID,
      expect.objectContaining({
        name: "Nome atualizado",
        cpf_cnpj: "12345678000199",
        company_name: "ACME",
      }),
    );
  });

  it("DELETE /client/:id devolve 403 sem permission=2 no token", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .delete(`/client/${TEST_CLIENT_ID}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(mock.deactivate).not.toHaveBeenCalled();
  });

  it("DELETE /client/:id desativa via service e devolve envelope", async () => {
    const deactivated = baseClient({
      status: "Inativo",
      deletion_date: "2026-01-01T00:00:00.000Z",
    });
    const mock: IClientService = {
      ...mockServiceBase(),
      deactivate: vi.fn().mockResolvedValue(deactivated),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID, 2);

    const res = await request(app)
      .delete(`/client/${TEST_CLIENT_ID}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(deactivated);
    expect(mock.deactivate).toHaveBeenCalledWith(TEST_CLIENT_ID, TEST_ORG_ID);
  });

  it("DELETE /client/:id aceita superadmin permission=999", async () => {
    const deactivated = baseClient({
      status: "Inativo",
      deletion_date: "2026-01-01T00:00:00.000Z",
    });
    const mock: IClientService = {
      ...mockServiceBase(),
      deactivate: vi.fn().mockResolvedValue(deactivated),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID, 999);

    const res = await request(app)
      .delete(`/client/${TEST_CLIENT_ID}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mock.deactivate).toHaveBeenCalledWith(TEST_CLIENT_ID, TEST_ORG_ID);
  });

  it("POST /client/:id/activate reativa via service e devolve envelope", async () => {
    const activated = baseClient({ status: "Ativo", deletion_date: null });
    const mock: IClientService = {
      ...mockServiceBase(),
      activate: vi.fn().mockResolvedValue(activated),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .post(`/client/${TEST_CLIENT_ID}/activate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(activated);
    expect(mock.activate).toHaveBeenCalledWith(TEST_CLIENT_ID, TEST_ORG_ID);
  });

  it("POST /client returns 400 when service rejects unknown organization", async () => {
    const mock: IClientService = {
      ...mockServiceBase(),
      create: vi.fn().mockRejectedValue(new ServiceError(400, "Organização não encontrada.")),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app).post("/client").set("Authorization", `Bearer ${token}`).send({
      organization_id: TEST_ORG_ID,
      name: "Cliente",
      status: "Ativo",
    });

    expect(res.status).toBe(400);
    expect(mock.create).toHaveBeenCalled();
  });

  it("POST /client rejects organization_id that does not match authenticated organization", async () => {
    const mock: IClientService = {
      ...mockServiceBase(),
      create: vi.fn(),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app).post("/client").set("Authorization", `Bearer ${token}`).send({
      organization_id: "550e8400-e29b-41d4-a716-446655440099",
      name: "Cliente",
      status: "Ativo",
    });

    expect(res.status).toBe(403);
    expect(mock.create).not.toHaveBeenCalled();
  });

  it("POST /client uses authenticated organization when body omits organization_id", async () => {
    const created = baseClient();
    const mock: IClientService = {
      ...mockServiceBase(),
      create: vi.fn().mockResolvedValue(created),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app).post("/client").set("Authorization", `Bearer ${token}`).send({
      name: "Cliente",
      status: "Ativo",
    });

    expect(res.status).toBe(201);
    expect(mock.create).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: TEST_ORG_ID }),
    );
  });

  it("DELETE /client/histories/pending/:pendingId aceita superadmin permission=999", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const prisma = {
      clientHistoryPending: {
        findFirst: vi.fn().mockResolvedValue({ id: TEST_PENDING_ID }),
        delete: vi.fn().mockResolvedValue({ id: TEST_PENDING_ID }),
      },
    } as unknown as PrismaClient;
    const app = buildTestApp(mock, { prisma });
    const token = bearerToken(TEST_ORG_ID, 999);

    const res = await request(app)
      .delete(`/client/histories/pending/${TEST_PENDING_ID}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { ok: true } });
    expect(prisma.clientHistoryPending.delete).toHaveBeenCalledWith({
      where: { id: TEST_PENDING_ID },
    });
  });

  it("POST /client/:id/histories rejects unsupported file MIME types", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .post(`/client/${TEST_CLIENT_ID}/histories`)
      .set("Authorization", `Bearer ${token}`)
      .field("date", "2026-01-01")
      .field("history", "Histórico")
      .attach("file", Buffer.from("<script>alert(1)</script>"), {
        filename: "payload.html",
        contentType: "text/html",
      });

    expect(res.status).toBe(400);
  });

  it("POST /client/:id/histories rejects files with spoofed allowed MIME types", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const historyStorage = {
      saveObjectPath: vi.fn(),
      createSignedAccessUrl: vi.fn(),
    } as unknown as HistoryFileStorage;
    const app = buildTestApp(mock, { historyStorage });
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .post(`/client/${TEST_CLIENT_ID}/histories`)
      .set("Authorization", `Bearer ${token}`)
      .field("date", "2026-01-01")
      .field("history", "Histórico")
      .attach("file", Buffer.from("<script>alert(1)</script>"), {
        filename: "payload.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(historyStorage.saveObjectPath).not.toHaveBeenCalled();
  });

  it("POST /client/:id/histories rate limits repeated uploads", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const app = buildTestApp(mock, {
      env: {
        uploadRateLimitMax: 1,
        uploadRateLimitWindowMs: 60_000,
      },
    });
    const token = bearerToken(TEST_ORG_ID);

    await request(app)
      .post(`/client/${TEST_CLIENT_ID}/histories`)
      .set("Authorization", `Bearer ${token}`)
      .field("date", "2026-01-01")
      .field("history", "Histórico")
      .attach("file", Buffer.from("<script>alert(1)</script>"), {
        filename: "payload.html",
        contentType: "text/html",
      });

    const second = await request(app)
      .post(`/client/${TEST_CLIENT_ID}/histories`)
      .set("Authorization", `Bearer ${token}`)
      .field("date", "2026-01-01")
      .field("history", "Histórico")
      .attach("file", Buffer.from("<script>alert(1)</script>"), {
        filename: "payload.html",
        contentType: "text/html",
      });

    expect(second.status).toBe(429);
  });

  it("POST /client/:id/histories rejects files above 10 MB", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .post(`/client/${TEST_CLIENT_ID}/histories`)
      .set("Authorization", `Bearer ${token}`)
      .field("date", "2026-01-01")
      .field("history", "Histórico")
      .attach("file", Buffer.alloc(10 * 1024 * 1024 + 1), {
        filename: "large.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
  });

  it("POST /client/:id/histories accepts allowed file types", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const prisma = {
      client: {
        findFirst: vi.fn().mockResolvedValue({ id: TEST_CLIENT_ID }),
      },
      clientHistory: {
        create: vi.fn().mockResolvedValue({
          id: "770e8400-e29b-41d4-a716-446655440003",
          client_id: TEST_CLIENT_ID,
          file: "client-history/doc.pdf",
        }),
      },
    } as unknown as PrismaClient;
    const historyStorage = {
      saveObjectPath: vi.fn().mockResolvedValue("client-history/doc.pdf"),
      createSignedAccessUrl: vi.fn(),
    } as unknown as HistoryFileStorage;
    const app = buildTestApp(mock, { prisma, historyStorage });
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .post(`/client/${TEST_CLIENT_ID}/histories`)
      .set("Authorization", `Bearer ${token}`)
      .field("date", "2026-01-01")
      .field("history", "Histórico")
      .attach("file", Buffer.from("%PDF-1.7"), {
        filename: "doc.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(201);
    expect(historyStorage.saveObjectPath).toHaveBeenCalledWith(
      TEST_CLIENT_ID,
      expect.objectContaining({
        mimetype: "application/pdf",
        originalName: "doc.pdf",
      }),
    );
  });

  it("GET /client/:id/histories/:historyId/file returns a signed attachment URL", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const historyId = "770e8400-e29b-41d4-a716-446655440003";
    const prisma = {
      clientHistory: {
        findFirst: vi.fn().mockResolvedValue({
          id: historyId,
          client_id: TEST_CLIENT_ID,
          file: "clients/historys/client-1/doc.pdf",
        }),
      },
    } as unknown as PrismaClient;
    const historyStorage = {
      saveObjectPath: vi.fn(),
      createSignedAccessUrl: vi
        .fn()
        .mockResolvedValue("https://example.supabase.co/signed/history-file"),
    } as unknown as HistoryFileStorage;
    const app = buildTestApp(mock, { prisma, historyStorage });
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .get(`/client/${TEST_CLIENT_ID}/histories/${historyId}/file`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ url: "https://example.supabase.co/signed/history-file" });
    expect(prisma.clientHistory.findFirst).toHaveBeenCalledWith({
      where: {
        id: historyId,
        client_id: TEST_CLIENT_ID,
        organization_id: TEST_ORG_ID,
      },
      select: {
        id: true,
        file: true,
      },
    });
    expect(historyStorage.createSignedAccessUrl).toHaveBeenCalledWith(
      "clients/historys/client-1/doc.pdf",
    );
  });

  it("supports create, detail and update for client PA", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const prisma = buildPAPrismaMock();
    const app = buildTestApp(mock, { prisma });
    const token = bearerToken(TEST_ORG_ID);

    const createResponse = await request(app)
      .post(`/client/${TEST_CLIENT_ID}/pa`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.success).toBe(true);

    const detailResponse = await request(app)
      .get(`/client/${TEST_CLIENT_ID}/pa`)
      .set("Authorization", `Bearer ${token}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.success).toBe(true);
    expect(detailResponse.body.data.detail.client_id).toBe(TEST_CLIENT_ID);

    const updateResponse = await request(app)
      .patch(`/client/${TEST_CLIENT_ID}/pa`)
      .set("Authorization", `Bearer ${token}`)
      .send({ activities: "Atualizado" });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.success).toBe(true);
    expect(updateResponse.body.data.activities).toBe("Atualizado");
  });
});

describe("ClientService", () => {
  it("create does not call prisma.client.create when organization is missing", async () => {
    const findUniqueOrg = vi.fn().mockResolvedValue(null);
    const createClient = vi.fn();
    const prisma = {
      organization: { findUnique: findUniqueOrg },
      client: { create: createClient },
    } as unknown as PrismaClient;
    const service = new ClientService(prisma);
    const missingOrgId = "880e8400-e29b-41d4-a716-446655440099";

    await expect(
      service.create({
        name: "X",
        organization_id: missingOrgId,
        status: "Ativo",
        cpf_cnpj: "",
        prospecting_status: "Lead",
        type: "PJ",
        type_registration: "Novo",
        service_unique: false,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Organização não encontrada.",
    });

    expect(findUniqueOrg).toHaveBeenCalledWith({
      where: { id: missingOrgId },
      select: { id: true },
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});
