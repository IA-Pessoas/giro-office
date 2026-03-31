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

const TEST_JWT_SECRET = "test-jwt-secret-for-client-service";
const TEST_ORG_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_CLIENT_ID = "660e8400-e29b-41d4-a716-446655440001";

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
});

function buildTestApp(mock: IClientService) {
  const env = getClientServiceEnv();
  const logger = createLogger({
    service: "client-service-test",
    env: "test",
    level: "silent",
  });
  return createApp({ clientService: mock, env, logger });
}

function bearerToken(organizationId: string): string {
  return jwt.sign({ user_id: "user-test-1", organization_id: organizationId }, TEST_JWT_SECRET);
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

  it("GET /clients returns paginated list from injected service", async () => {
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

    const res = await request(app).get("/clients").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(page);
    expect(mock.listByOrganization).toHaveBeenCalledWith(TEST_ORG_ID, {
      statusDbValue: undefined,
      page: 1,
      pageSize: 20,
      search: undefined,
    });
  });

  it("GET /clients passes status filter mapped to BD when query has status Ativo", async () => {
    const page = emptyListPage();
    const mock: IClientService = {
      ...mockServiceBase(),
      listByOrganization: vi.fn().mockResolvedValue(page),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .get("/clients")
      .query({ status: "Ativo" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mock.listByOrganization).toHaveBeenCalledWith(TEST_ORG_ID, {
      statusDbValue: "Ativo",
      page: 1,
      pageSize: 20,
      search: undefined,
    });
  });

  it("GET /clients maps Prospect to Prospecção for list filter", async () => {
    const page = emptyListPage();
    const mock: IClientService = {
      ...mockServiceBase(),
      listByOrganization: vi.fn().mockResolvedValue(page),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .get("/clients")
      .query({ status: "Prospect" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mock.listByOrganization).toHaveBeenCalledWith(TEST_ORG_ID, {
      statusDbValue: "Prospecção",
      page: 1,
      pageSize: 20,
      search: undefined,
    });
  });

  it("GET /clients passes page, limit and search to service", async () => {
    const page = emptyListPage();
    const mock: IClientService = {
      ...mockServiceBase(),
      listByOrganization: vi.fn().mockResolvedValue(page),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .get("/clients")
      .query({ page: "2", limit: "10", search: "  acme  " })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mock.listByOrganization).toHaveBeenCalledWith(TEST_ORG_ID, {
      statusDbValue: undefined,
      page: 2,
      pageSize: 10,
      search: "  acme  ",
    });
  });

  it("GET /clients returns 400 for invalid status query", async () => {
    const mock: IClientService = { ...mockServiceBase() };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .get("/clients")
      .query({ status: "invalid" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(mock.listByOrganization).not.toHaveBeenCalled();
  });

  it("POST /clients creates via injected service and returns 201 envelope", async () => {
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

    const res = await request(app).post("/clients").set("Authorization", `Bearer ${token}`).send({
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

  it("PATCH /clients/:id updates via injected service and returns 200 envelope", async () => {
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
      .patch(`/clients/${TEST_CLIENT_ID}`)
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

  it("DELETE /clients/:id desativa via service e devolve envelope", async () => {
    const deactivated = baseClient({
      status: "Inativo",
      deletion_date: "2026-01-01T00:00:00.000Z",
    });
    const mock: IClientService = {
      ...mockServiceBase(),
      deactivate: vi.fn().mockResolvedValue(deactivated),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .delete(`/clients/${TEST_CLIENT_ID}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(deactivated);
    expect(mock.deactivate).toHaveBeenCalledWith(TEST_CLIENT_ID, TEST_ORG_ID);
  });

  it("POST /clients/:id/activate reativa via service e devolve envelope", async () => {
    const activated = baseClient({ status: "Ativo", deletion_date: null });
    const mock: IClientService = {
      ...mockServiceBase(),
      activate: vi.fn().mockResolvedValue(activated),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app)
      .post(`/clients/${TEST_CLIENT_ID}/activate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(activated);
    expect(mock.activate).toHaveBeenCalledWith(TEST_CLIENT_ID, TEST_ORG_ID);
  });

  it("POST /clients returns 400 when service rejects unknown organization", async () => {
    const mock: IClientService = {
      ...mockServiceBase(),
      create: vi.fn().mockRejectedValue(new ServiceError(400, "Organização não encontrada.")),
    };
    const app = buildTestApp(mock);
    const token = bearerToken(TEST_ORG_ID);

    const res = await request(app).post("/clients").set("Authorization", `Bearer ${token}`).send({
      organization_id: TEST_ORG_ID,
      name: "Cliente",
      status: "Ativo",
    });

    expect(res.status).toBe(400);
    expect(mock.create).toHaveBeenCalled();
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
