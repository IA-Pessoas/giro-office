import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import type { NextFunction } from "express";
import { type Mock, vi } from "vitest";

interface OrganizationRouteMocks {
  organizationServiceMock: {
    list: Mock;
    create: Mock;
    findById: Mock;
    updateStatus: Mock;
    updateSubscriptionPlan: Mock;
    updateLogoUrl: Mock;
  };
}

const organizationRouteMocks: OrganizationRouteMocks = vi.hoisted(
  (): OrganizationRouteMocks => ({
    organizationServiceMock: {
      list: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      updateStatus: vi.fn(),
      updateSubscriptionPlan: vi.fn(),
      updateLogoUrl: vi.fn(),
    },
  }),
);

vi.mock("../services/organizationService.js", () => ({
  OrganizationService: vi.fn(function OrganizationService() {
    return organizationRouteMocks.organizationServiceMock;
  }),
}));

vi.mock("../middlewares/isAuthenticated.js", () => ({
  isAuthenticated: (req: Express.Request, _res: Express.Response, next: NextFunction) => {
    req.user_id = "user-1";
    req.organization_id = "00000000-0000-4000-8000-000000000001";
    next();
  },
}));

import { createOrganizationApp } from "../app.js";
import type { OrganizationEnv } from "../config/env.js";

export function createTestApp() {
  const env = {
    port: 3031,
    databaseUrl: "postgresql://localhost/organization_test",
    jwtSecret: "test-secret",
    nodeEnv: "test",
    logLevel: "silent",
    logPretty: false,
    enableApiDocs: false,
  } satisfies OrganizationEnv;
  const logger = createLogger({
    service: "organization-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });

  return createOrganizationApp(env, logger);
}

export function resetOrganizationRouteMocks() {
  vi.clearAllMocks();
}

const organizationServiceMock: OrganizationRouteMocks["organizationServiceMock"] =
  organizationRouteMocks.organizationServiceMock;

export { organizationServiceMock };
