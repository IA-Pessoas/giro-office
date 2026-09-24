import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const { passwordHashMock, prismaMock } = vi.hoisted(() => ({
  passwordHashMock: { verifyPassword: vi.fn() },
  prismaMock: {
    user: { findFirst: vi.fn() },
    authSession: { findFirst: vi.fn() },
  },
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

function impersonationToken(): string {
  return jwt.sign(
    {
      user_id: "target-1",
      organization_id: "org-1",
      permission: 1,
      type: "user",
      session_version: 1,
      session_id: "session-1",
      csrf_hash: "a".repeat(64),
      modules: {},
      impersonator_platform_user_id: "platform-1",
    },
    getUserServiceEnv().jwtSecret,
  );
}

function impersonationSession(
  overrides: { operator?: Record<string, unknown>; user?: Record<string, unknown> } = {},
) {
  return {
    csrf_hash: "a".repeat(64),
    impersonator_platform_user_id: "platform-1",
    impersonatorPlatformUser: {
      platform_role: "super_admin",
      status: "active",
      can_impersonate: true,
      ...overrides.operator,
    },
    user: activeUser({ id: "target-1", ...overrides.user }),
  };
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

  it("GET /user/session/validate aceita uma personificação ativa", async () => {
    prismaMock.authSession.findFirst.mockResolvedValue(impersonationSession());

    const response = await request(createTestApp())
      .get("/user/session/validate")
      .set("Authorization", `Bearer ${impersonationToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.data.valid).toBe(true);
  });

  it("GET /user/session/validate recusa personificação com operador ou alvo inválido", async () => {
    const invalidSessions = [
      impersonationSession({ operator: { can_impersonate: false } }),
      impersonationSession({ operator: { status: "inactive" } }),
      impersonationSession({ user: { status: "inactive" } }),
      impersonationSession({ user: { session_version: 2 } }),
    ];

    for (const session of invalidSessions) {
      prismaMock.authSession.findFirst.mockResolvedValueOnce(session);
      const response = await request(createTestApp())
        .get("/user/session/validate")
        .set("Authorization", `Bearer ${impersonationToken()}`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    }
  });
});
