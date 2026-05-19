import "./envBootstrap.js";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestApp } from "./tiServiceTestUtils.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";

function gatewayHeaders(permission: number): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

describe("ti request category routes", () => {
  it("POST /ti/request-categories requires permission 3", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/ti/request-categories")
      .set(gatewayHeaders(1))
      .send({ name: "Hardware" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissao insuficiente para acessar o ti-service.",
      code: "FORBIDDEN",
    });
  });

  it("POST /ti/request-categories validates body", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/ti/request-categories")
      .set(gatewayHeaders(3))
      .send({ name: "" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: "name é obrigatório.",
      code: "BAD_REQUEST",
    });
  });
});
