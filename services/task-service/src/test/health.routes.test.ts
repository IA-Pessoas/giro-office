import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTaskApp } from "../app.js";
import { getTaskServiceEnv } from "../config/env.js";

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
