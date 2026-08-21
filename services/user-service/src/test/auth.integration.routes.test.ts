import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const { passwordHashMock, prismaMock } = vi.hoisted(() => ({
  passwordHashMock: { verifyPassword: vi.fn() },
  prismaMock: { user: { findFirst: vi.fn() } },
}));

vi.mock("../prisma/index.js", () => ({ default: prismaMock }));
vi.mock("../security/passwordHashService.js", () => passwordHashMock);

import { createUserApp } from "../app.js";
import { getUserServiceEnv } from "../config/env.js";

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    name: "Usuário ativo",
    login: "account",
    password: "hash-active",
    permission: 1,
    type: "user",
    status: "active",
    session_version: 1,
    department_id: "dep-1",
    organization_id: "org-1",
    organization: { id: "org-1", status: "active" },
    department: {
      organization_id: "org-1",
      organization: { id: "org-1", status: "active" },
    },
    permissions: [{ organization_id: "org-1", ti: 1 }],
    ...overrides,
  };
}

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
    const cases = [
      { user: null, passwordMatches: false },
      { user: activeUser({ password: "hash-wrong" }), passwordMatches: false },
      { user: activeUser({ status: "inactive" }), passwordMatches: true },
      {
        user: activeUser({ organization: { id: "org-1", status: "inactive" } }),
        passwordMatches: true,
      },
      { user: activeUser({ department: { organization_id: "org-2" } }), passwordMatches: true },
    ];
    const app = createTestApp();
    const responses = [];

    for (const testCase of cases) {
      prismaMock.user.findFirst.mockResolvedValueOnce(testCase.user);
      passwordHashMock.verifyPassword.mockResolvedValueOnce({
        valid: testCase.passwordMatches,
        needsRehash: false,
      });

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
