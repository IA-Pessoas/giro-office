import { Writable } from "node:stream";

import { createLogger } from "@workspace/shared/logger";
import request from "supertest";
import { describe, expect, it } from "vitest";

class MemoryLogStream extends Writable {
  _write(
    _chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

describe("department-service", () => {
  it("GET /health returns success envelope", async () => {
    const { getDepartmentServiceEnv } = await import("../config/env.js");
    const { createDepartmentApp } = await import("../app.js");
    const env = getDepartmentServiceEnv();
    const logger = createLogger({
      service: "department-service-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    });
    const app = createDepartmentApp(env, logger);
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.service).toBe("department-service");
    expect(res.body.data?.status).toBe("ok");
  });
});
