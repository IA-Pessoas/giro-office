import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { RegularizeServiceEnv } from "../config/env.js";

const env: RegularizeServiceEnv = {
  port: 3411,
  nodeEnv: "test",
  databaseUrl: "postgresql://localhost/test",
  jwtSecret: "secret",
  auditServiceToken: "audit-service-token",
  internalServiceToken: "internal-token",
  encryptionKey: "ZmFrZWtleWZmYWtla2V5ZmFrZWtleWZmYWtla2V5ZmFrZQ==",
  logLevel: "info",
  logPretty: false,
  enableApiDocs: false,
};

describe("regularize-service app", () => {
  it("GET /health returns 200", async () => {
    const app = createApp({
      env,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        fatal: vi.fn(),
        trace: vi.fn(),
        child: vi.fn(() => ({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
          fatal: vi.fn(),
          trace: vi.fn(),
          child: vi.fn(),
        })),
      } as never,
      prisma: {} as never,
      runReconciliation: vi.fn(async () => ({ processed: 0 })),
    });

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.service).toBe("regularize-service");
  });
});
