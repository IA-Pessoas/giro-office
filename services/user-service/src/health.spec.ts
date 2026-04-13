import { createLogger } from "@workspace/shared/logger";
import request from "supertest";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createUserApp } from "./app.js";
import { getUserServiceEnv } from "./config/env.js";

class MemoryLogStream extends Writable {
  _write(
    _chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

describe("user-service", () => {
  it("GET /health returns success envelope", async () => {
    const env = getUserServiceEnv();
    const logger = createLogger({
      service: "user-service-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    });
    const app = createUserApp(env, logger);
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.service).toBe("user-service");
    expect(res.body.data?.status).toBe("ok");
  });
});
