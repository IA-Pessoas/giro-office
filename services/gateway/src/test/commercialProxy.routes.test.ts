import { createServer } from "node:http";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import jwt from "jsonwebtoken";
import { expect, it } from "vitest";

import { createApp } from "../app.js";
import { createTestEnv, createTestLogger, startServer, stopServer } from "./gatewayTestUtils.js";

const CONFIG_ID = "d0000000-0000-4000-8000-000000000001";

function createSessionToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      user_id: "user-1",
      organization_id: "org-1",
      permission: 3,
      type: "owner",
      ...overrides,
    },
    "test-secret",
  );
}

it("encaminha catálogo Comercial autenticado com contexto tenantizado", async () => {
  let received: Record<string, string | undefined> = {};
  const commercialService = createServer((request, response) => {
    received = {
      internalToken: request.headers[INTERNAL_SERVICE_TOKEN_HEADER] as string | undefined,
      userId: request.headers[FORWARDED_AUTH_USER_ID_HEADER] as string | undefined,
      organizationId: request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER] as string | undefined,
    };
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: [{ id: CONFIG_ID }] }));
  });
  const commercialServiceUrl = await startServer(commercialService);
  const gateway = createServer(
    createApp(createTestEnv({ commercialServiceUrl }), createTestLogger()),
  );
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/commercial/proposal-configs`, {
      headers: { Authorization: `Bearer ${createSessionToken()}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [{ id: CONFIG_ID }],
    });
    expect(received).toEqual({
      internalToken: "audit-service-token",
      userId: "user-1",
      organizationId: "org-1",
    });
  } finally {
    await stopServer(gateway);
    await stopServer(commercialService);
  }
});

it("mantém catálogo Comercial protegido sem autenticação", async () => {
  let serviceCalls = 0;
  const commercialService = createServer((_request, response) => {
    serviceCalls += 1;
    response.statusCode = 200;
    response.end();
  });
  const commercialServiceUrl = await startServer(commercialService);
  const gateway = createServer(
    createApp(createTestEnv({ commercialServiceUrl }), createTestLogger()),
  );
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/commercial/proposal-configs`);
    expect(response.status).toBe(401);
    expect(serviceCalls).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(commercialService);
  }
});

it("aplica autorização modular antes de encaminhar o catálogo Comercial", async () => {
  let serviceCalls = 0;
  const commercialService = createServer((_request, response) => {
    serviceCalls += 1;
    response.statusCode = 200;
    response.end();
  });
  const commercialServiceUrl = await startServer(commercialService);
  const gateway = createServer(
    createApp(createTestEnv({ commercialServiceUrl }), createTestLogger()),
  );
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/commercial/proposal-configs`, {
      headers: {
        Authorization: `Bearer ${createSessionToken({
          permission: 0,
          type: "user",
          modules: { comercial: 0 },
        })}`,
      },
    });

    expect(response.status).toBe(403);
    expect(serviceCalls).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(commercialService);
  }
});
