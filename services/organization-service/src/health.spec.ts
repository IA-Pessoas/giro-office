import { createLogger } from "@workspace/shared/logger";
import request from "supertest";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createOrganizationApp } from "./app.js";
import type { OrganizationEnv } from "./config/env.js";

class MemoryLogStream extends Writable {
  _write(
    _chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

describe("organization-service", () => {
  it("GET /health returns success envelope", async () => {
    const env = {
      port: 3400,
      databaseUrl: "https://example.com/db",
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
    const app = createOrganizationApp(env, logger);
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.service).toBe("organization-service");
    expect(res.body.data?.status).toBe("ok");
  });
});
