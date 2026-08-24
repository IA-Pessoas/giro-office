import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createOrganizationApp } from "./app.js";
import type { OrganizationEnv } from "./config/env.js";

describe("organization-service", () => {
  it("GET /health returns success envelope", async () => {
    const env = {
      port: 3031,
      databaseUrl: "https://example.com/db",
      jwtSecret: "test-secret",
      auditServiceToken: "audit-service-token",
      nodeEnv: "test",
      logLevel: "silent",
      logPretty: false,
      enableApiDocs: false,
      allowedOrigins: ["*"],
    } satisfies OrganizationEnv;
    const logger = createLogger({
      service: "organization-service-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    });
    const app = createOrganizationApp(env, logger);
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.service).toBe("organization-service");
    expect(res.body.data?.status).toBe("ok");
  });
});
