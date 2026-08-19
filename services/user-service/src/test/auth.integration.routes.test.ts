import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { $queryRaw: vi.fn() },
}));

vi.mock("../prisma/index.js", () => ({ default: prismaMock }));

import { createUserApp } from "../app.js";
import { getUserServiceEnv } from "../config/env.js";

function createTestApp() {
  return createUserApp(
    getUserServiceEnv(),
    createLogger({
      service: "user-service-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    }),
  );
}

describe("auth integration routes", () => {
  it("POST /user/session mantém idêntica a resposta pública para credenciais e contextos inválidos", async () => {
    const cases = Array.from({ length: 5 });
    const app = createTestApp();
    const responses = [];
    prismaMock.$queryRaw.mockResolvedValue([]);

    for (const _case of cases) {
      const response = await request(app)
        .post("/user/session")
        .send({ login: "account", password: "secret" });
      responses.push(response);
    }

    expect(
      responses.map((response) => ({
        status: response.status,
        error: response.body.error,
        code: response.body.code,
        fields: Object.keys(response.body).sort(),
        location: response.headers.location,
      })),
    ).toEqual(
      Array.from({ length: cases.length }, () => ({
        status: 401,
        error: "Login ou senha inválidos.",
        code: "UNAUTHORIZED",
        fields: ["code", "error", "requestId", "success"],
        location: undefined,
      })),
    );
  });
});
