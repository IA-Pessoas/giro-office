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
const TI_VIEWER_PERMISSION = 1;
const TI_REQUESTER_PERMISSION = 2;
const TI_ADMIN_PERMISSION = 3;

function gatewayHeaders(permission: number): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
    [INTERNAL_SERVICE_TOKEN_HEADER]: "ti-service-internal-token-test",
  };
}

describe("ti request category routes", () => {
  it("GET /ti/request-categories/list allows Viewer to read organization categories", async () => {
    const response = await request(createTestApp())
      .get("/ti/request-categories/list")
      .set(gatewayHeaders(TI_VIEWER_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: [] });
  });

  it("POST /ti/request-categories rejects Viewer permission", async () => {
    const response = await request(createTestApp())
      .post("/ti/request-categories")
      .set(gatewayHeaders(TI_VIEWER_PERMISSION))
      .send({ name: "Hardware" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });

  it("POST /ti/request-categories allows Requester permission", async () => {
    const response = await request(createTestApp())
      .post("/ti/request-categories")
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .send({ name: "Hardware" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        name: "Hardware",
        organization_id: organizationId,
      },
    });
  });

  it("PATCH /ti/request-categories/:id rejects Viewer permission", async () => {
    const app = createTestApp();

    const response = await request(app)
      .patch("/ti/request-categories/20000000-0000-4000-8000-000000000001")
      .set(gatewayHeaders(TI_VIEWER_PERMISSION))
      .send({ active: false });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissão insuficiente para acessar o módulo de TI.",
      code: "FORBIDDEN",
    });
  });

  it("POST /ti/request-categories validates body after admin level 3 passes auth", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/ti/request-categories")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ name: "" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: "name é obrigatório.",
      code: "BAD_REQUEST",
    });
  });
});
