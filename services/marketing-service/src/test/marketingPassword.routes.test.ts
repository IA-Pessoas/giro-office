import "./envBootstrap.js";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createMarketingApp } from "../app.js";
import { getMarketingServiceEnv } from "../config/env.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const credentialId = "30000000-0000-4000-8000-000000000001";

function gatewayHeaders(permission = 1): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "marketing-service-internal-token-test",
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

function createPasswordProvider() {
  return {
    list: vi.fn(async () => [
      { id: credentialId, local: "Instagram", user: "acme@example.com", notes: null },
    ]),
    detail: vi.fn(async () => ({
      id: credentialId,
      local: "Instagram",
      user: "acme@example.com",
      notes: null,
    })),
    create: vi.fn(async () => ({
      id: credentialId,
      local: "Instagram",
      user: "acme@example.com",
      notes: null,
    })),
    update: vi.fn(async () => ({
      id: credentialId,
      local: "Instagram",
      user: "acme@example.com",
      notes: null,
    })),
    reveal: vi.fn(async () => ({ password: "sensitive-secret" })),
    export: vi.fn(async () => ({
      id: credentialId,
      local: "Instagram",
      user: "acme@example.com",
      notes: null,
      password: "sensitive-secret",
    })),
    importLegacyRecords: vi.fn(async () => ({ imported: 1, quarantined: 0 })),
    listImportReconciliation: vi.fn(async () => []),
  };
}

function createTestApp(passwordService: ReturnType<typeof createPasswordProvider>) {
  return createMarketingApp({
    env: getMarketingServiceEnv(),
    logger: createLogger({
      service: "marketing-service-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    }),
    passwordService,
  } as never);
}

describe("Marketing password routes", () => {
  it("returns only metadata from list and detail in the authenticated organization", async () => {
    const service = createPasswordProvider();
    const app = createTestApp(service);

    const list = await request(app).get("/marketing/passwords/list").set(gatewayHeaders());
    const detail = await request(app)
      .get(`/marketing/passwords/${credentialId}`)
      .set(gatewayHeaders());

    expect(list.status).toBe(200);
    expect(detail.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain("password");
    expect(JSON.stringify(detail.body)).not.toContain("password");
    expect(service.list).toHaveBeenCalledWith(organizationId);
    expect(service.detail).toHaveBeenCalledWith(organizationId, credentialId);
  });

  it("requires editor permission and explicit confirmation to reveal", async () => {
    const service = createPasswordProvider();
    const app = createTestApp(service);

    const forbidden = await request(app)
      .post(`/marketing/passwords/${credentialId}/reveal`)
      .set(gatewayHeaders(1))
      .send({ confirmed: true });
    const unconfirmed = await request(app)
      .post(`/marketing/passwords/${credentialId}/reveal`)
      .set(gatewayHeaders(2))
      .send({ confirmed: false });
    const revealed = await request(app)
      .post(`/marketing/passwords/${credentialId}/reveal`)
      .set(gatewayHeaders(2))
      .send({ confirmed: true });

    expect(forbidden.status).toBe(403);
    expect(unconfirmed.status).toBe(400);
    expect(service.reveal).toHaveBeenCalledOnce();
    expect(revealed.status).toBe(200);
    expect(revealed.body.data.password).toBe("sensitive-secret");
    expect(service.reveal).toHaveBeenCalledWith(organizationId, credentialId, true, userId);
  });

  it("rejects tenant overrides and blocks deletion routes", async () => {
    const service = createPasswordProvider();
    const app = createTestApp(service);

    const spoofedCreate = await request(app)
      .post("/marketing/passwords")
      .set(gatewayHeaders(2))
      .send({
        organization_id: "another-organization",
        local: "Instagram",
        user: "acme@example.com",
        password: "sensitive-secret",
      });
    const deletion = await request(app)
      .delete(`/marketing/passwords/${credentialId}`)
      .set(gatewayHeaders(2));

    expect(spoofedCreate.status).toBe(400);
    expect(deletion.status).toBe(404);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("exports only when an editor explicitly confirms", async () => {
    const service = createPasswordProvider();
    const response = await request(createTestApp(service))
      .post(`/marketing/passwords/${credentialId}/export`)
      .set(gatewayHeaders(2))
      .send({ confirmed: true });

    expect(response.status).toBe(200);
    expect(response.body.data.password).toBe("sensitive-secret");
    expect(service.export).toHaveBeenCalledWith(organizationId, credentialId, true, userId);
  });

  it("scopes imports and quarantine reads to the authenticated organization", async () => {
    const service = createPasswordProvider();
    const app = createTestApp(service);
    const records = [
      {
        organization_id: organizationId,
        local: "Instagram",
        user: "acme@example.com",
        password: "OfficeCiphertext",
      },
    ];

    const imported = await request(app)
      .post("/marketing/passwords/import")
      .set(gatewayHeaders(2))
      .send({ records });
    const reconciliation = await request(app)
      .get("/marketing/passwords/import/reconciliation?organization_id=another-org")
      .set(gatewayHeaders(2));

    expect(imported.status).toBe(201);
    expect(service.importLegacyRecords).toHaveBeenCalledWith(organizationId, records);
    expect(reconciliation.status).toBe(200);
    expect(service.listImportReconciliation).toHaveBeenCalledWith(organizationId);
  });
});
