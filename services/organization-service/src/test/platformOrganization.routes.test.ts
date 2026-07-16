import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  gatewayAuthHeaders,
  gatewayPlatformAuthHeaders,
  organizationServiceMock,
  resetOrganizationRouteMocks,
} from "./organizationTestUtils.js";

describe("platform organization routes", () => {
  const organizationId = "00000000-0000-4000-8000-000000000111";

  beforeEach(() => {
    resetOrganizationRouteMocks();
  });

  it("GET /platform/organizations lista organizacoes para super admin", async () => {
    organizationServiceMock.list.mockResolvedValue({
      organizations: [{ id: organizationId, name: "Org 1" }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const app = createTestApp();
    const res = await request(app)
      .get("/platform/organizations")
      .set(gatewayPlatformAuthHeaders())
      .query({ page: 1, pageSize: 20 });

    expect(res.status).toBe(200);
    expect(organizationServiceMock.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: undefined,
    });
  });

  it("POST /platform/organizations cria organizacao para super admin", async () => {
    organizationServiceMock.create.mockResolvedValue({ id: organizationId });

    const app = createTestApp();
    const res = await request(app)
      .post("/platform/organizations")
      .set(gatewayPlatformAuthHeaders())
      .send({
        name: "Org Teste",
        email_created_by: "admin@example.com",
        cnpj: "12345678000199",
      });

    expect(res.status).toBe(201);
    expect(organizationServiceMock.create).toHaveBeenCalledWith({
      name: "Org Teste",
      email_created_by: "admin@example.com",
      cnpj: "12345678000199",
    });
  });

  it("GET /platform/organizations/:id retorna detalhe para super admin", async () => {
    organizationServiceMock.findById.mockResolvedValue({ id: organizationId });

    const app = createTestApp();
    const res = await request(app)
      .get(`/platform/organizations/${organizationId}`)
      .set(gatewayPlatformAuthHeaders());

    expect(res.status).toBe(200);
    expect(organizationServiceMock.findById).toHaveBeenCalledWith(organizationId);
  });

  it("PATCH /platform/organizations/:id atualiza status, plano e logo", async () => {
    organizationServiceMock.updateStatus.mockResolvedValue({
      id: organizationId,
      status: "active",
    });
    organizationServiceMock.updateSubscriptionPlan.mockResolvedValue({
      id: organizationId,
      subscription_plan: "enterprise",
    });
    organizationServiceMock.updateLogoUrl.mockResolvedValue({
      id: organizationId,
      logo_url: null,
    });
    organizationServiceMock.findById.mockResolvedValue({
      id: organizationId,
      status: "active",
      subscription_plan: "enterprise",
      logo_url: null,
    });

    const app = createTestApp();
    const res = await request(app)
      .patch(`/platform/organizations/${organizationId}`)
      .set(gatewayPlatformAuthHeaders())
      .send({ status: "active", subscription_plan: "enterprise", logo_url: null });

    expect(res.status).toBe(200);
    expect(organizationServiceMock.updateStatus).toHaveBeenCalledWith(organizationId, "active");
    expect(organizationServiceMock.updateSubscriptionPlan).toHaveBeenCalledWith(
      organizationId,
      "enterprise",
    );
    expect(organizationServiceMock.updateLogoUrl).toHaveBeenCalledWith(organizationId, null);
    expect(organizationServiceMock.findById).toHaveBeenCalledWith(organizationId);
  });

  it("bloqueia usuario de organizacao nas rotas platform", async () => {
    const app = createTestApp();

    const res = await request(app)
      .get("/platform/organizations")
      .set(gatewayAuthHeaders({ type: "owner", permission: 2 }));

    expect(res.status).toBe(403);
    expect(organizationServiceMock.list).not.toHaveBeenCalled();
  });
});
