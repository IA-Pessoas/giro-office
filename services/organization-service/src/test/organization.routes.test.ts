import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  gatewayAuthHeaders,
  organizationServiceMock,
  resetOrganizationRouteMocks,
} from "./organizationTestUtils.js";

describe("organization routes", () => {
  const organizationId = "00000000-0000-4000-8000-000000000111";

  beforeEach(() => {
    resetOrganizationRouteMocks();
  });

  it("GET /organizations lista organizacoes", async () => {
    organizationServiceMock.list.mockResolvedValue([{ id: organizationId }]);
    const app = createTestApp();

    const res = await request(app)
      .get("/organizations")
      .set(gatewayAuthHeaders())
      .query({ page: 2, pageSize: 10 });

    expect(res.status).toBe(200);
    expect(organizationServiceMock.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      status: undefined,
    });
  });

  it("POST /organizations cria organizacao", async () => {
    organizationServiceMock.create.mockResolvedValue({ id: organizationId });
    const app = createTestApp();

    const res = await request(app).post("/organizations").set(gatewayAuthHeaders()).send({
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

  it("GET /organizations/:id retorna detalhe", async () => {
    organizationServiceMock.findById.mockResolvedValue({ id: organizationId });
    const app = createTestApp();

    const res = await request(app)
      .get(`/organizations/${organizationId}`)
      .set(gatewayAuthHeaders());

    expect(res.status).toBe(200);
    expect(organizationServiceMock.findById).toHaveBeenCalledWith(organizationId);
  });

  it("PATCH /organizations/:id/status atualiza status", async () => {
    organizationServiceMock.updateStatus.mockResolvedValue({
      id: organizationId,
      status: "active",
    });
    const app = createTestApp();

    const res = await request(app)
      .patch(`/organizations/${organizationId}/status`)
      .set(gatewayAuthHeaders())
      .send({ status: "active" });

    expect(res.status).toBe(200);
    expect(organizationServiceMock.updateStatus).toHaveBeenCalledWith(organizationId, "active");
  });

  it("PATCH /organizations/:id/subscription-plan atualiza plano", async () => {
    organizationServiceMock.updateSubscriptionPlan.mockResolvedValue({ id: organizationId });
    const app = createTestApp();

    const res = await request(app)
      .patch(`/organizations/${organizationId}/subscription-plan`)
      .set(gatewayAuthHeaders())
      .send({ subscription_plan: "pro" });

    expect(res.status).toBe(200);
    expect(organizationServiceMock.updateSubscriptionPlan).toHaveBeenCalledWith(
      organizationId,
      "pro",
    );
  });

  it("PATCH /organizations/:id/logo-url atualiza logo", async () => {
    organizationServiceMock.updateLogoUrl.mockResolvedValue({ id: organizationId });
    const app = createTestApp();

    const res = await request(app)
      .patch(`/organizations/${organizationId}/logo-url`)
      .set(gatewayAuthHeaders())
      .send({ logo_url: "https://cdn/logo.png" });

    expect(res.status).toBe(200);
    expect(organizationServiceMock.updateLogoUrl).toHaveBeenCalledWith(
      organizationId,
      "https://cdn/logo.png",
    );
  });
});
