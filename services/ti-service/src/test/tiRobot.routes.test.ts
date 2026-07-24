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
const robotId = "90000000-0000-4000-8000-000000000001";
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

describe("ti robot routes", () => {
  it("GET /ti/robots/list requires admin permission", async () => {
    const response = await request(createTestApp())
      .get("/ti/robots/list")
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissao insuficiente para acessar o ti-service.",
      code: "FORBIDDEN",
    });
  });

  it("GET /ti/robots/list lists robots with admin permission", async () => {
    const response = await request(createTestApp())
      .get("/ti/robots/list")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: [],
    });
  });

  it("POST /ti/robots creates a robot with admin level 2", async () => {
    const response = await request(createTestApp())
      .post("/ti/robots")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({
        name: "Backup diario",
        description: "Executa backup dos arquivos internos.",
        type: "Backup",
        schedule: "0 2 * * *",
        status: "active",
        active: true,
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        name: "Backup diario",
        type: "Backup",
        status: "active",
        active: true,
        organization_id: organizationId,
      },
    });
  });

  it("POST /ti/robots requires admin permission", async () => {
    const response = await request(createTestApp())
      .post("/ti/robots")
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .send({
        name: "Backup diario",
        type: "Backup",
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissao insuficiente para acessar o ti-service.",
      code: "FORBIDDEN",
    });
  });

  it("POST /ti/robots validates body", async () => {
    const response = await request(createTestApp())
      .post("/ti/robots")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ name: "", type: "Backup" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
  });

  it("GET /ti/robots/:id/runs/list lists robot runs", async () => {
    const response = await request(createTestApp())
      .get(`/ti/robots/${robotId}/runs/list`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: [],
    });
  });

  it("POST /ti/robots/:id/runs records a run", async () => {
    const finishedAt = "2026-07-10T12:30:00.000Z";
    const response = await request(createTestApp())
      .post(`/ti/robots/${robotId}/runs`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({
        status: "success",
        finished_at: finishedAt,
        message: "Executado manualmente.",
        metadata_json: { durationMs: 2300 },
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        robot_id: robotId,
        status: "success",
        finished_at: finishedAt,
        message: "Executado manualmente.",
        organization_id: organizationId,
      },
    });
  });
});
