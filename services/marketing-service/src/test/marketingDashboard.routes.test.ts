import "./envBootstrap.js";

import {
  FORWARDED_AUTH_MODULES_HEADER,
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
import type { MarketingDashboardProvider } from "../routes/marketingDashboard.routes.js";
import type {
  MarketingDashboardResponse,
  MarketingMonthlyBirthdaysResponse,
} from "../schemas/marketingDashboard.schemas.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";

const dashboard: MarketingDashboardResponse = {
  requests: {
    active: { total: 4, rh: 1, ti: 3 },
    new: { total: 2, rh: 1, ti: 1 },
    urgent: { total: 1, rh: 0, ti: 1 },
  },
  birthdays: {
    clients: { total: 1, items: [{ id: "client-1", name: "Cliente", day: 29 }] },
    employees: { total: 1, items: [{ id: "employee-1", name: "Colaboradora", day: 30 }] },
    companies: { total: 0, items: [] },
  },
  aiUsage: { competence: "2026-09", pendingKnowledge: 0 },
  alerts: [
    { code: "new-requests", count: 2, label: "Solicitações novas" },
    { code: "urgent-requests", count: 1, label: "Solicitações urgentes em aberto" },
  ],
};

function createTestLogger() {
  return createLogger({
    service: "marketing-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });
}

const monthlyBirthdays: MarketingMonthlyBirthdaysResponse = {
  month: 5,
  employees: {
    total: 1,
    items: [{ id: "e-1", name: "Ana", birthDate: "1990-05-01", day: 1, department: "Marketing" }],
  },
  clients: {
    total: 1,
    items: [{ id: "pf-1", name: "Carla", birthDate: "1970-05-15", day: 15, companies: "Alfa" }],
  },
};

function createDashboardProvider(): MarketingDashboardProvider {
  return {
    getDashboard: vi.fn(async () => dashboard),
    getMonthlyBirthdays: vi.fn(async () => monthlyBirthdays),
  };
}

function gatewayHeaders(permission = 1): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "marketing-service-internal-token-test",
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

function createTestApp(service: MarketingDashboardProvider) {
  return createMarketingApp({
    env: getMarketingServiceEnv(),
    logger: createTestLogger(),
    dashboardService: service,
  });
}

describe("GET /marketing/dashboard", () => {
  it("returns organization-scoped dashboard to Marketing viewers", async () => {
    const service = createDashboardProvider();
    const response = await request(createTestApp(service))
      .get("/marketing/dashboard")
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: dashboard });
    expect(service.getDashboard).toHaveBeenCalledWith(organizationId);
  });

  it("requires authentication", async () => {
    const service = createDashboardProvider();
    const response = await request(createTestApp(service)).get("/marketing/dashboard");

    expect(response.status).toBe(401);
    expect(service.getDashboard).not.toHaveBeenCalled();
  });

  it("rejects users without Marketing permission", async () => {
    const service = createDashboardProvider();
    const response = await request(createTestApp(service))
      .get("/marketing/dashboard")
      .set(gatewayHeaders(0));

    expect(response.status).toBe(403);
    expect(service.getDashboard).not.toHaveBeenCalled();
  });

  it("uses the forwarded Marketing module permission", async () => {
    const service = createDashboardProvider();
    const headers = gatewayHeaders();
    delete headers[FORWARDED_AUTH_PERMISSION_HEADER];
    headers[FORWARDED_AUTH_MODULES_HEADER] = JSON.stringify({ marketing: 1 });

    const response = await request(createTestApp(service)).get("/marketing/dashboard").set(headers);

    expect(response.status).toBe(200);
    expect(service.getDashboard).toHaveBeenCalledWith(organizationId);
  });

  it("does not let global permission override disabled Marketing module access", async () => {
    const service = createDashboardProvider();
    const headers = gatewayHeaders(1);
    headers[FORWARDED_AUTH_MODULES_HEADER] = JSON.stringify({ marketing: 0 });

    const response = await request(createTestApp(service)).get("/marketing/dashboard").set(headers);

    expect(response.status).toBe(403);
    expect(service.getDashboard).not.toHaveBeenCalled();
  });

  it("requires organization context before reading dashboard data", async () => {
    const service = createDashboardProvider();
    const headers = gatewayHeaders();
    delete headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER];
    const response = await request(createTestApp(service)).get("/marketing/dashboard").set(headers);

    expect(response.status).toBe(401);
    expect(service.getDashboard).not.toHaveBeenCalled();
  });
});

describe("GET /marketing/birthdays", () => {
  it("returns the selected month for the authenticated organization", async () => {
    const service = createDashboardProvider();
    const response = await request(createTestApp(service))
      .get("/marketing/birthdays?month=5")
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: monthlyBirthdays });
    expect(service.getMonthlyBirthdays).toHaveBeenCalledWith(organizationId, 5);
  });

  it.each([
    "",
    "?month=0",
    "?month=13",
    "?month=abc",
  ])("rejects invalid month %s", async (query) => {
    const service = createDashboardProvider();
    const response = await request(createTestApp(service))
      .get(`/marketing/birthdays${query}`)
      .set(gatewayHeaders());

    expect(response.status).toBe(400);
    expect(service.getMonthlyBirthdays).not.toHaveBeenCalled();
  });

  it("rejects users without Marketing permission", async () => {
    const service = createDashboardProvider();
    const response = await request(createTestApp(service))
      .get("/marketing/birthdays?month=5")
      .set(gatewayHeaders(0));

    expect(response.status).toBe(403);
    expect(service.getMonthlyBirthdays).not.toHaveBeenCalled();
  });
});
