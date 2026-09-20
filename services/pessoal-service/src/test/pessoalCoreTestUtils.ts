import "./envBootstrap.js";

import {
  createExpressErrorHandler,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import express, { type Router } from "express";
import { vi } from "vitest";

import { requestContext } from "../middlewares/requestContext.js";
import type { PessoalAuditService } from "../services/pessoalAuditService.js";

export const organizationId = "10000000-0000-4000-8000-000000000001";
export const otherOrganizationId = "10000000-0000-4000-8000-000000000099";
export const userId = "00000000-0000-4000-8000-000000000001";
export const clientId = "20000000-0000-4000-8000-000000000001";
export const otherClientId = "20000000-0000-4000-8000-000000000002";
export const recordId = "30000000-0000-4000-8000-000000000001";
export const unionId = "40000000-0000-4000-8000-000000000001";
export const groupId = "40000000-0000-4000-8000-000000000002";
export const responsibleId = "50000000-0000-4000-8000-000000000001";

export function gatewayHeaders(permission = 2): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

export function createAuditMock(): PessoalAuditService {
  return {
    recordChange: vi.fn(async () => undefined),
  } as unknown as PessoalAuditService;
}

export function createRouteTestApp(prefix: string, router: Router): express.Express {
  const app = express();
  const logger = createLogger({
    service: "pessoal-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });

  app.use(express.json());
  app.use(requestContext);
  app.use(prefix, router);
  app.use(
    createExpressErrorHandler({
      logger,
      event: "pessoal-service.test.error",
      fallbackMessage: "Erro interno no pessoal-service.",
    }),
  );

  return app;
}
