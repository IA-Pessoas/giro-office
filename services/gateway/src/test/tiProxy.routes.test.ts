import { createServer } from "node:http";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import jwt from "jsonwebtoken";
import { expect, it } from "vitest";

import { createApp } from "../app.js";
import {
  createTestEnv as createEnv,
  createTestLogger,
  startServer,
  stopServer,
} from "./gatewayTestUtils.js";

function createSessionToken(tiPermission: number): string {
  return jwt.sign(
    {
      user_id: "user-1",
      organization_id: "org-1",
      permission: 1,
      type: "user",
      modules: { ti: tiPermission },
    },
    "test-secret",
  );
}

// #1929: os três fluxos de autoatendimento chegam ao TI Service com o nível 1 do módulo.
it("encaminha o autoatendimento de TI nível 1 e barra a gestão antes do TI Service", async () => {
  const received: Array<Record<string, unknown>> = [];
  const tiService = createServer((request, response) => {
    received.push({
      method: request.method,
      url: request.url,
      internalToken: request.headers[INTERNAL_SERVICE_TOKEN_HEADER],
      organizationId: request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER],
      permission: request.headers[FORWARDED_AUTH_PERMISSION_HEADER],
      userId: request.headers[FORWARDED_AUTH_USER_ID_HEADER],
    });
    request.resume();
    response.statusCode = request.method === "POST" ? 201 : 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { id: "resource-1" } }));
  });
  const tiServiceUrl = await startServer(tiService);
  const gateway = createServer(createApp(createEnv({ tiServiceUrl }), createTestLogger()));
  const gatewayUrl = await startServer(gateway);
  const send = (method: string, path: string, tiPermission: number) =>
    fetch(`${gatewayUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${createSessionToken(tiPermission)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: "Olá" }),
    });
  const forwarded = (method: string, url: string) => ({
    method,
    url,
    internalToken: "ti-service-token",
    organizationId: "org-1",
    permission: "1",
    userId: "user-1",
  });

  try {
    expect((await send("POST", "/ti/requests", 1)).status).toBe(201);
    expect((await send("POST", "/ti/requests/request-1/messages", 1)).status).toBe(201);
    expect((await send("PATCH", "/ti/terms/term-1/sign", 1)).status).toBe(200);
    expect(received).toEqual([
      forwarded("POST", "/ti/requests"),
      forwarded("POST", "/ti/requests/request-1/messages"),
      forwarded("PATCH", "/ti/terms/term-1/sign"),
    ]);

    received.length = 0;
    for (const [method, path, tiPermission] of [
      ["PATCH", "/ti/requests/request-1/status", 1],
      ["PATCH", "/ti/requests/request-1/assign", 1],
      ["POST", "/ti/terms", 1],
      ["POST", "/ti/requests", 0],
      ["PATCH", "/ti/terms/term-1/sign", 0],
    ] as const) {
      expect((await send(method, path, tiPermission)).status, `${method} ${path}`).toBe(403);
    }
    expect(received).toEqual([]);
  } finally {
    await stopServer(gateway);
    await stopServer(tiService);
  }
});
