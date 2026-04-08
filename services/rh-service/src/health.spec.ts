import { Writable } from "node:stream";
import { createLogger } from "@workspace/shared/logger";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { RhEnv } from "./config/env.js";

class MemoryLogStream extends Writable {
  _write(
    _chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

describe("rh-service", () => {
  it("GET /health returns success envelope", async () => {
    const logger = createLogger({
      service: "rh-service-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    });
    const env = {
      port: 3034,
      databaseUrl: "postgresql://localhost/rh_test",
      jwtSecret: "test-jwt-secret",
      nodeEnv: "test",
      logLevel: "silent",
      logPretty: false,
      enableApiDocs: false,
    } satisfies RhEnv;
    const app = createApp(logger, env);
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.service).toBe("rh-service");
    expect(res.body.data?.status).toBe("ok");
  });
});
