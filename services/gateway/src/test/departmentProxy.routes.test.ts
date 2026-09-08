import { createServer } from "node:http";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
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

function createSessionToken(): string {
  return jwt.sign(
    {
      user_id: "user-1",
      organization_id: "org-1",
      permission: 3,
      type: "owner",
    },
    "test-secret",
  );
}

it("restores the HTTP-only session flow from login through department list", async () => {
  const sessionToken = createSessionToken();
  let userMeCalls = 0;
  let departmentRequestHeaders: {
    authorization?: string;
    cookie?: string;
    internalToken?: string;
    organizationId?: string;
    userId?: string;
  } = {};

  const userService = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/user/session") {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.setHeader(
        "set-cookie",
        `cw.session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax`,
      );
      response.end(JSON.stringify({ success: true, data: { id: "user-1" } }));
      return;
    }

    if (request.method === "GET" && request.url === "/user/me") {
      userMeCalls += 1;
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ success: true, data: { id: "user-1" } }));
      return;
    }

    response.statusCode = 404;
    response.end();
  });
  const departmentService = createServer((request, response) => {
    departmentRequestHeaders = {
      authorization: request.headers.authorization,
      cookie: request.headers.cookie,
      internalToken: request.headers[INTERNAL_SERVICE_TOKEN_HEADER] as string | undefined,
      organizationId: request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER] as string | undefined,
      userId: request.headers[FORWARDED_AUTH_USER_ID_HEADER] as string | undefined,
    };

    if (
      request.headers[INTERNAL_SERVICE_TOKEN_HEADER] !== "audit-service-token" ||
      request.headers[FORWARDED_AUTH_USER_ID_HEADER] !== "user-1" ||
      request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER] !== "org-1"
    ) {
      response.statusCode = 401;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ success: false, error: "Não autenticado." }));
      return;
    }

    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        success: true,
        data: [{ id: "department-org-1", organization_id: "org-1" }],
      }),
    );
  });
  const userServiceUrl = await startServer(userService);
  const departmentServiceUrl = await startServer(departmentService);
  const app = createApp(
    createEnv({
      departmentServiceUrl,
      userServiceUrl,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const login = await fetch(`${gatewayUrl}/user/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "user", password: "password" }),
    });
    const sessionSetCookie = login.headers
      .getSetCookie()
      .find((header) => header.startsWith("cw.session="));
    const sessionCookie = sessionSetCookie?.split(";", 1)[0];

    expect(login.status).toBe(200);
    expect(sessionSetCookie).toContain("HttpOnly");
    expect(sessionCookie).toBeTruthy();

    const userMe = await fetch(`${gatewayUrl}/user/me`, {
      headers: { Cookie: sessionCookie ?? "" },
    });
    const departments = await fetch(`${gatewayUrl}/department/list`, {
      headers: { Cookie: sessionCookie ?? "" },
    });

    expect(userMe.status).toBe(200);
    expect(userMeCalls).toBe(1);
    expect(departments.status).toBe(200);
    await expect(departments.json()).resolves.toEqual({
      success: true,
      data: [{ id: "department-org-1", organization_id: "org-1" }],
    });
    expect(departmentRequestHeaders).toEqual({
      authorization: undefined,
      cookie: undefined,
      internalToken: "audit-service-token",
      organizationId: "org-1",
      userId: "user-1",
    });
  } finally {
    await stopServer(gateway);
    await stopServer(departmentService);
    await stopServer(userService);
  }
});

it("keeps department list unauthenticated requests at 401", async () => {
  let departmentServiceCalls = 0;
  const departmentService = createServer((_request, response) => {
    departmentServiceCalls += 1;
    response.statusCode = 200;
    response.end();
  });
  const departmentServiceUrl = await startServer(departmentService);
  const app = createApp(createEnv({ departmentServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/department/list`);

    expect(response.status).toBe(401);
    expect(departmentServiceCalls).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(departmentService);
  }
});
