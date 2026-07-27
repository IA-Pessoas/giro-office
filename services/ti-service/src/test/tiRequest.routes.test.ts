import "./envBootstrap.js";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestApp } from "./tiServiceTestUtils.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const categoryId = "20000000-0000-4000-8000-000000000001";
const requestId = "30000000-0000-4000-8000-000000000001";
const TI_VIEWER_PERMISSION = 0;
const TI_REQUESTER_PERMISSION = 1;
const TI_ADMIN_PERMISSION = 2;

function gatewayHeaders(permission: number): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
    [INTERNAL_SERVICE_TOKEN_HEADER]: "ti-service-internal-token-test",
  };
}

describe("ti request routes", () => {
  it("GET /ti/requests/list allows Viewer to list only own requests", async () => {
    const response = await request(createTestApp())
      .get("/ti/requests/list")
      .set(gatewayHeaders(TI_VIEWER_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: [] });
  });

  it("POST /ti/requests allows Viewer to create an own request", async () => {
    const response = await request(createTestApp())
      .post("/ti/requests")
      .set(gatewayHeaders(TI_VIEWER_PERMISSION))
      .send({
        title: "Notebook nao liga",
        description: "Equipamento nao inicia.",
        category_id: categoryId,
        urgency: "High",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        requester_id: userId,
        status: "New",
        organization_id: organizationId,
      },
    });
  });

  it("POST /ti/requests creates a request", async () => {
    const response = await request(createTestApp())
      .post("/ti/requests")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({
        title: "Notebook nao liga",
        description: "Equipamento nao inicia.",
        category_id: categoryId,
        urgency: "High",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        requester_id: userId,
        status: "New",
        organization_id: organizationId,
      },
    });
  });

  it("POST /ti/requests requires forwarded auth context", async () => {
    const response = await request(createTestApp()).post("/ti/requests").send({
      title: "Notebook nao liga",
      description: "Equipamento nao inicia.",
      category_id: categoryId,
      urgency: "High",
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: "Token interno do ti-service invalido.",
      code: "UNAUTHORIZED",
    });
  });

  it("PATCH /ti/requests/:id/assign requires admin permission", async () => {
    const response = await request(createTestApp())
      .patch(`/ti/requests/${requestId}/assign`)
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .send({ assigned_to_id: userId });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissao insuficiente para acessar o ti-service.",
      code: "FORBIDDEN",
    });
  });

  it("PATCH /ti/requests/:id/assign accepts admin level 2", async () => {
    const response = await request(createTestApp())
      .patch(`/ti/requests/${requestId}/assign`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ assigned_to_id: userId });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: requestId,
        assigned_to_id: userId,
      },
    });
  });

  it("POST /ti/requests validates body", async () => {
    const response = await request(createTestApp())
      .post("/ti/requests")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({
        title: "",
        description: "Equipamento nao inicia.",
        category_id: categoryId,
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
  });

  it("POST /ti/requests/:id/messages creates a message", async () => {
    const response = await request(createTestApp())
      .post(`/ti/requests/${requestId}/messages`)
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .send({ message: "Estou verificando o chamado." });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        request_id: requestId,
        sender_id: userId,
        message: "Estou verificando o chamado.",
        organization_id: organizationId,
      },
    });
  });
});
