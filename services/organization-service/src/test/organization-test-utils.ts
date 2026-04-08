import { Writable } from "node:stream";

import { createLogger } from "@workspace/shared/logger";
import type { NextFunction } from "express";
import { vi } from "vitest";

const { organizationServiceMock } = vi.hoisted(() => ({
  organizationServiceMock: {
    list: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    updateStatus: vi.fn(),
    updateSubscriptionPlan: vi.fn(),
    updateLogoUrl: vi.fn(),
  },
}));

vi.mock("../services/organizationService.js", () => ({
  OrganizationService: vi.fn(function OrganizationService() {
    return organizationServiceMock;
  }),
}));

vi.mock("../middlewares/isAuthenticated.js", () => ({
  isAuthenticated: (
    req: Express.Request,
    _res: Express.Response,
    next: NextFunction,
  ) => {
    req.user_id = "user-1";
    req.organization_id = "00000000-0000-4000-8000-000000000001";
    next();
  },
}));

import { createOrganizationApp } from "../app.js";
import type { OrganizationEnv } from "../config/env.js";

class MemoryLogStream extends Writable {
  _write(
    _chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

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

export { organizationServiceMock };
