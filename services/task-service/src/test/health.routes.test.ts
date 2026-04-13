import { createLogger } from "@workspace/shared/logger";
import request from "supertest";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createTaskApp } from "../app.js";
import { getTaskServiceEnv } from "../config/env.js";

class MemoryLogStream extends Writable {
  _write(
    _chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

describe("task-service", () => {
  it("GET /health returns success envelope", async () => {
    const env = getTaskServiceEnv();
    const logger = createLogger({
      service: "task-service-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    });
    const app = createTaskApp(env, logger);
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.service).toBe("task-service");
    expect(res.body.data?.status).toBe("ok");
  });
});
