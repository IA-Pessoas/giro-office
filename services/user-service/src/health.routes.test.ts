import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createUserApp } from "./app.js";
import { getUserServiceEnv } from "./config/env.js";

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
