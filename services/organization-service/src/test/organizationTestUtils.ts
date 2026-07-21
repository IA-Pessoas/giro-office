import {
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
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

import { createOrganizationApp } from "../app.js";
import type { OrganizationEnv } from "../config/env.js";

const DEFAULT_TEST_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const DEFAULT_TEST_USER_ID = "00000000-0000-4000-8000-000000000002";

export function gatewayAuthHeaders(overrides?: {
  userId?: string;
  organizationId?: string;
  permission?: number;
  type?: "owner" | "admin" | "user";
  modules?: Record<string, number | null>;
}): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_USER_ID_HEADER]: overrides?.userId ?? DEFAULT_TEST_USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]:
      overrides?.organizationId ?? DEFAULT_TEST_ORGANIZATION_ID,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(overrides?.permission ?? 2),
    ...(overrides?.type ? { [FORWARDED_AUTH_TYPE_HEADER]: overrides.type } : {}),
    ...(overrides?.modules
      ? { [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify(overrides.modules) }
      : {}),
  };
}

export function gatewayPlatformAuthHeaders(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_USER_ID_HEADER]: "platform-1",
    [FORWARDED_AUTH_KIND_HEADER]: "platform",
    [FORWARDED_AUTH_PLATFORM_ROLE_HEADER]: "super_admin",
  };
}

export function createTestApp() {
  const env = {
    port: 3031,
    databaseUrl: "postgresql://localhost/organization_test",
    jwtSecret: "test-secret",
    nodeEnv: "test",
    logLevel: "silent",
    logPretty: false,
    allowedOrigins: ["*"],
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
