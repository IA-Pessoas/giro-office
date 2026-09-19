import { createServer } from "node:http";

import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app.js";
import {
  createTestEnv,
  createTestLogger,
  startServer,
  stopServer,
} from "./test/gatewayTestUtils.js";

describe("proxy público do triagem-service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("encaminha competências ao serviço novo e mantém contexto organizacional", async () => {
    const upstreamRequests: Array<{
      url: string;
      headers: Record<string, string | string[] | undefined>;
    }> = [];
    const upstream = createServer((request, response) => {
      upstreamRequests.push({ url: request.url ?? "", headers: request.headers });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ success: true, data: [] }));
    });
    const triagemServiceUrl = await startServer(upstream);
    const app = createApp(
      createTestEnv({ triagemServiceUrl, bearerAuthCompatibility: true }),
      createTestLogger(),
    );
    const gateway = createServer(app);
    const gatewayUrl = await startServer(gateway);
    const session = jwt.sign(
      {
        user_id: "triagem-user",
        organization_id: "triagem-org",
        permission: 2,
        type: "admin",
        modules: { triagem: 2 },
      },
      "test-secret",
    );

    try {
      const response = await fetch(
        `${gatewayUrl}/triagem/competencies?client_id=11111111-1111-4111-8111-111111111111`,
        { headers: { authorization: `Bearer ${session}` } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true, data: [] });
      expect(upstreamRequests).toHaveLength(1);
      expect(upstreamRequests[0]).toMatchObject({
        url: "/triagem/competencies?client_id=11111111-1111-4111-8111-111111111111",
        headers: {
          "x-internal-service-token": "audit-service-token",
          "x-auth-user-id": "triagem-user",
          "x-auth-organization-id": "triagem-org",
          "x-auth-permission": "2",
          "x-auth-modules": expect.stringContaining('"triagem":2'),
        },
      });
    } finally {
      await stopServer(gateway);
      await stopServer(upstream);
    }
  });

  it("encaminha links externos ao serviço novo", async () => {
    const upstreamRequests: Array<{ url: string }> = [];
    const upstream = createServer((request, response) => {
      upstreamRequests.push({ url: request.url ?? "" });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ success: true, data: [] }));
    });
    const triagemServiceUrl = await startServer(upstream);
    const app = createApp(
      createTestEnv({ triagemServiceUrl, bearerAuthCompatibility: true }),
      createTestLogger(),
    );
    const gateway = createServer(app);
    const gatewayUrl = await startServer(gateway);
    const session = jwt.sign(
      {
        user_id: "triagem-user",
        organization_id: "triagem-org",
        permission: 2,
        type: "admin",
        modules: { triagem: 2 },
      },
      "test-secret",
    );

    try {
      const response = await fetch(`${gatewayUrl}/triagem/external-links`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${session}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          client_id: "11111111-1111-4111-8111-111111111111",
          competence: "2026-09",
          type: "DRIVE",
          url: "https://drive.example.test/triagem",
        }),
      });

      expect(response.status).toBe(200);
      expect(upstreamRequests).toEqual([{ url: "/triagem/external-links" }]);
    } finally {
      await stopServer(gateway);
      await stopServer(upstream);
    }
  });

  it("encaminha o painel operacional ao triagem-service", async () => {
    const upstreamRequests: Array<{ url: string }> = [];
    const upstream = createServer((request, response) => {
      upstreamRequests.push({ url: request.url ?? "" });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ success: true, data: { items: [] } }));
    });
    const triagemServiceUrl = await startServer(upstream);
    const app = createApp(
      createTestEnv({ triagemServiceUrl, bearerAuthCompatibility: true }),
      createTestLogger(),
    );
    const gateway = createServer(app);
    const gatewayUrl = await startServer(gateway);
    const session = jwt.sign(
      {
        user_id: "triagem-user",
        organization_id: "triagem-org",
        permission: 2,
        type: "admin",
        modules: { triagem: 2 },
      },
      "test-secret",
    );

    try {
      const response = await fetch(`${gatewayUrl}/triagem/overview?page=1&page_size=20`, {
        headers: { authorization: `Bearer ${session}` },
      });

      expect(response.status).toBe(200);
      expect(upstreamRequests).toEqual([{ url: "/triagem/overview?page=1&page_size=20" }]);
    } finally {
      await stopServer(gateway);
      await stopServer(upstream);
    }
  });
});
