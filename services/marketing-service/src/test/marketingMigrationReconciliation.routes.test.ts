import "./envBootstrap.js";

import {
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createMarketingApp } from "../app.js";
import { getMarketingServiceEnv } from "../config/env.js";
import type { MarketingMigrationReconciliationProvider } from "../routes/marketingMigrationReconciliation.routes.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const actorId = "00000000-0000-4000-8000-000000000001";

function createProvider(): MarketingMigrationReconciliationProvider {
  return {
    getReconciliation: vi.fn(async (id: string) => ({ organizationId: id, datasets: [] })),
    getCanonicalEvents: vi.fn(async () => [{ id: "event-1", name: "Evento canônico" }]),
    resolveAssociation: vi.fn(async (input) => ({ id: "decision-1", actorId: input.actorId })),
  };
}

function createApp(provider: MarketingMigrationReconciliationProvider) {
  return createMarketingApp({
    env: getMarketingServiceEnv(),
    logger: createLogger({
      service: "marketing-service-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    }),
    reconciliationService: provider,
  });
}

function platformHeaders(role = "super_admin"): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "marketing-service-internal-token-test",
    [FORWARDED_AUTH_PLATFORM_ROLE_HEADER]: role,
    [FORWARDED_AUTH_USER_ID_HEADER]: actorId,
  };
}

describe("Marketing migration reconciliation platform routes", () => {
  it("requires the trusted platform role before reading the selected organization", async () => {
    const provider = createProvider();
    const response = await request(createApp(provider))
      .get(`/marketing/migration-reconciliation?organizationId=${organizationId}`)
      .set(platformHeaders("user"));

    expect(response.status).toBe(401);
    expect(provider.getReconciliation).not.toHaveBeenCalled();
  });

  it("reads only the organization selected in the validated platform request", async () => {
    const provider = createProvider();
    const response = await request(createApp(provider))
      .get(`/marketing/migration-reconciliation?organizationId=${organizationId}`)
      .set(platformHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { organizationId, datasets: [] },
    });
    expect(provider.getReconciliation).toHaveBeenCalledWith(organizationId);
  });

  it("rejects an untrusted internal token before reading reconciliation data", async () => {
    const provider = createProvider();
    const response = await request(createApp(provider))
      .get(`/marketing/migration-reconciliation?organizationId=${organizationId}`)
      .set({ ...platformHeaders(), [INTERNAL_SERVICE_TOKEN_HEADER]: "forged" });

    expect(response.status).toBe(401);
    expect(provider.getReconciliation).not.toHaveBeenCalled();
  });
});
