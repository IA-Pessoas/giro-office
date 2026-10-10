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
const controlId = "30000000-0000-4000-8000-000000000001";

function gatewayHeaders(permission = 1): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "marketing-service-internal-token-test",
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

function createControlProvider() {
  return {
    listEligibleUsers: vi.fn(async () => [{ id: userId, name: "Ana", full_name: null }]),
    createForUser: vi.fn(async () => ({ id: controlId })),
    createForActiveUsers: vi.fn(async () => ({ created: 2, alreadyExisted: 1 })),
    listControls: vi.fn(async () => []),
    updateAnswers: vi.fn(async () => ({ id: controlId })),
    getReport: vi.fn(async () => ({ pending: [], withoutIntegration: [] })),
    importLegacyRecords: vi.fn(async () => ({ imported: 1, alreadyExisted: 0, reconciliation: 1 })),
    listImportReconciliation: vi.fn(async () => []),
  };
}

function createTestApp(controlService: ReturnType<typeof createControlProvider>) {
  return createMarketingApp({
    env: getMarketingServiceEnv(),
    logger: createLogger({
      service: "marketing-service-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    }),
    controlService,
  } as never);
}

describe("Marketing AI usage control routes", () => {
  it("cria controles em lote para editores e usa organização autenticada", async () => {
    const service = createControlProvider();
    const response = await request(createTestApp(service))
      .post("/marketing/ai-usage-controls/batch")
      .set(gatewayHeaders(2))
      .send({ competence: "2026-04", organization_id: "outra-organizacao" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      data: { created: 2, alreadyExisted: 1 },
    });
    expect(service.createForActiveUsers).toHaveBeenCalledWith(organizationId, "2026-04");
  });

  it("nega criação a quem tem somente permissão de leitura", async () => {
    const service = createControlProvider();
    const response = await request(createTestApp(service))
      .post("/marketing/ai-usage-controls")
      .set(gatewayHeaders(1))
      .send({ userId, competence: "2026-04" });

    expect(response.status).toBe(403);
    expect(service.createForUser).not.toHaveBeenCalled();

    const answer = await request(createTestApp(service))
      .patch(`/marketing/ai-usage-controls/${userId}`)
      .set(gatewayHeaders(1))
      .send({ knowledge: true });
    // A negação acontece antes do serviço, que é quem grava a trilha.
    expect(answer.status).toBe(403);
    expect(service.updateAnswers).not.toHaveBeenCalled();
  });

  it("atribui criação e respostas ao usuário autenticado", async () => {
    const service = createControlProvider();
    const app = createTestApp(service);
    const target = "30000000-0000-4000-8000-000000000001";
    await request(app)
      .post("/marketing/ai-usage-controls")
      .set(gatewayHeaders(2))
      .send({ userId: target, competence: "2026-04" });
    await request(app)
      .patch(`/marketing/ai-usage-controls/${target}`)
      .set(gatewayHeaders(2))
      .send({ knowledge: true });

    expect(service.createForUser).toHaveBeenCalledWith(organizationId, target, "2026-04", userId);
    expect(service.updateAnswers).toHaveBeenCalledWith(
      organizationId,
      target,
      expect.objectContaining({ knowledge: true }),
      userId,
    );
  });

  it("lista controles apenas na organização autenticada", async () => {
    const service = createControlProvider();
    const response = await request(createTestApp(service))
      .get("/marketing/ai-usage-controls/list?competence=2026-04&organization_id=outra")
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(service.listControls).toHaveBeenCalledWith(organizationId, "2026-04");
  });

  it("encaminha importação legada e reconciliação no escopo autenticado", async () => {
    const service = createControlProvider();
    const response = await request(createTestApp(service))
      .post("/marketing/ai-usage-controls/import")
      .set(gatewayHeaders(2))
      .send({
        organization_id: "outra-organizacao",
        records: [{ legacyUserId: userId, competence: "2026-04", knowledge: true }],
      });

    expect(response.status).toBe(201);
    expect(service.importLegacyRecords).toHaveBeenCalledWith(organizationId, [
      {
        legacyUserId: userId,
        competence: "2026-04",
        knowledge: true,
        integration: null,
        frequency: null,
        purpose: null,
        perceived_gain: null,
      },
    ]);

    await request(createTestApp(service))
      .get("/marketing/ai-usage-controls/reconciliation")
      .set(gatewayHeaders());
    expect(service.listImportReconciliation).toHaveBeenCalledWith(organizationId);
  });
});
