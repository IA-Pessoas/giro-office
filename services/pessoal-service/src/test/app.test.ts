import "./envBootstrap.js";

import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createPessoalApp } from "../app.js";
import { getPessoalServiceEnv } from "../config/env.js";

function createTestLogger() {
  return createLogger({
    service: "pessoal-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });
}

describe("pessoal-service app", () => {
  it("retorna envelope de sucesso no health check", async () => {
    const app = createPessoalApp({ env: getPessoalServiceEnv(), logger: createTestLogger() });

    const response = await request(app).get("/health").expect(200);

    expect(response.body).toEqual({
      success: true,
      data: { status: "ok", service: "pessoal-service", env: "test" },
    });
  });

  it("retorna envelope de sucesso no readiness check", async () => {
    const app = createPessoalApp({ env: getPessoalServiceEnv(), logger: createTestLogger() });

    const response = await request(app).get("/ready").expect(200);

    expect(response.body).toEqual({
      success: true,
      data: { status: "ready", service: "pessoal-service" },
    });
  });

  it("preserva x-request-id recebido", async () => {
    const app = createPessoalApp({ env: getPessoalServiceEnv(), logger: createTestLogger() });

    const response = await request(app).get("/health").set("x-request-id", "req-pessoal-1");

    expect(response.headers["x-request-id"]).toBe("req-pessoal-1");
  });
});
