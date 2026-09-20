import { createServer } from "node:http";
import { FORWARDED_AUTH_PERMISSION_HEADER, INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { createTestEnv, createTestLogger, startServer, stopServer } from "./gatewayTestUtils.js";

const runningServers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  while (runningServers.length > 0) {
    await stopServer(runningServers.pop() as ReturnType<typeof createServer>);
  }
});

function token(modules: Record<string, number>, permission = 1): string {
  return jwt.sign(
    {
      user_id: "user-1",
      organization_id: "org-1",
      permission,
      type: "user",
      modules,
    },
    "test-secret",
  );
}

describe("regularize gateway boundary", () => {
  it("forwards the scoped permission and trusted service token", async () => {
    let seenPermission: string | undefined;
    let seenInternalToken: string | undefined;
    const upstream = createServer((request, response) => {
      seenPermission = request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined;
      seenInternalToken = request.headers[INTERNAL_SERVICE_TOKEN_HEADER] as string | undefined;
      response.statusCode = 200;
      response.end(JSON.stringify({ success: true }));
    });
    runningServers.push(upstream);
    const upstreamUrl = await startServer(upstream);
    const gateway = createServer(
      createApp(createTestEnv({ regularizeServiceUrl: upstreamUrl }), createTestLogger()),
    );
    runningServers.push(gateway);
    const gatewayUrl = await startServer(gateway);

    const response = await fetch(`${gatewayUrl}/regularize/dashboard`, {
      headers: { Authorization: `Bearer ${token({ regularize: 1 })}` },
    });

    expect(response.status).toBe(200);
    expect(seenPermission).toBe("1");
    expect(seenInternalToken).toBe("regularize-service-internal-token");
  });

  it.each([
    { method: "GET", permission: 0, expected: 403, upstreamHits: 0 },
    { method: "POST", permission: 1, expected: 403, upstreamHits: 0 },
    { method: "POST", permission: 2, expected: 200, upstreamHits: 1 },
  ])("applies module permission $permission to $method", async ({
    method,
    permission,
    expected,
    upstreamHits,
  }) => {
    let hits = 0;
    const upstream = createServer((_request, response) => {
      hits += 1;
      response.statusCode = 200;
      response.end(JSON.stringify({ success: true }));
    });
    runningServers.push(upstream);
    const upstreamUrl = await startServer(upstream);
    const gateway = createServer(
      createApp(createTestEnv({ regularizeServiceUrl: upstreamUrl }), createTestLogger()),
    );
    runningServers.push(gateway);
    const gatewayUrl = await startServer(gateway);

    const response = await fetch(`${gatewayUrl}/regularize/dashboard`, {
      method,
      headers: {
        Authorization: `Bearer ${token({ regularize: permission }, permission)}`,
        "content-type": "application/json",
      },
      body: method === "POST" ? "{}" : undefined,
    });

    expect(response.status).toBe(expected);
    expect(hits).toBe(upstreamHits);
  });
});
