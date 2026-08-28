import {
  CSRF_HEADER_NAME,
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  hashCsrfToken,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, verifyJwtTokenMock } = vi.hoisted(() => ({
  prismaMock: { platformAuthSession: { findFirst: vi.fn() } },
  verifyJwtTokenMock: vi.fn(),
}));

vi.mock("@workspace/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/shared")>()),
  verifyJwtToken: verifyJwtTokenMock,
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { requirePlatformCsrf, requirePlatformSession } from "../security/platformAuth.js";

const csrfToken = "A".repeat(43);
const csrfHash = hashCsrfToken(csrfToken);

function platformHeaders(
  options: { cookieCsrf?: string; submittedCsrf?: string } = {},
): Record<string, string> {
  const headers = {
    Cookie: `cw.session=platform-session; cw.csrf=${options.cookieCsrf ?? csrfToken}`,
    [FORWARDED_AUTH_USER_ID_HEADER]: "platform-user-1",
    [FORWARDED_AUTH_KIND_HEADER]: "platform",
    [FORWARDED_AUTH_PLATFORM_ROLE_HEADER]: "super_admin",
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    "x-forwarded-user-name": "Nome forjado",
    "x-forwarded-user-email": "forged@example.com",
  };
  return options.submittedCsrf
    ? { ...headers, [CSRF_HEADER_NAME]: options.submittedCsrf }
    : headers;
}

function createIdentityApp(): express.Express {
  const app = express();
  app.get("/identity", requirePlatformSession, (req: Request, res: Response) => {
    res.json({ identity: req.platform_identity, session: req.platform_session });
  });
  return app;
}

function createCsrfApp(): express.Express {
  const app = express();
  app.post(
    "/mutation",
    requirePlatformSession,
    requirePlatformCsrf,
    (_req: Request, res: Response) => {
      res.status(204).end();
    },
  );
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode = err instanceof ServiceError ? err.statusCode : 500;
    res.status(statusCode).json({ error: err instanceof Error ? err.message : "Erro interno." });
  });
  return app;
}

describe("platform auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyJwtTokenMock.mockReturnValue({
      user_id: "platform-user-1",
      auth_kind: "platform",
      platform_role: "super_admin",
      session_version: 3,
      session_id: "platform-session-1",
      csrf_hash: csrfHash,
    });
    prismaMock.platformAuthSession.findFirst.mockResolvedValue({
      csrf_hash: csrfHash,
      platformUser: {
        id: "platform-user-1",
        name: "Administradora Real",
        email: "admin@example.com",
        platform_role: "super_admin",
        status: "active",
        session_version: 3,
      },
    });
  });

  // Break: dados forjados em headers substituem nome ou email validados no banco.
  it("materializa identidade e sessão somente após validar a sessão da plataforma", async () => {
    const response = await request(createIdentityApp()).get("/identity").set(platformHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      identity: {
        id: "platform-user-1",
        name: "Administradora Real",
        email: "admin@example.com",
        auth_kind: "platform",
        platform_role: "super_admin",
      },
      session: {
        user_id: "platform-user-1",
        auth_kind: "platform",
        platform_role: "super_admin",
        session_version: 3,
        session_id: "platform-session-1",
        csrf_hash: csrfHash,
      },
    });
  });

  // Break: uma mutação com cookie, header e hash da sessão equivalentes é bloqueada.
  it("aceita a prova CSRF vinculada à sessão validada", async () => {
    const response = await request(createCsrfApp())
      .post("/mutation")
      .set(platformHeaders({ submittedCsrf: csrfToken }));

    expect(response.status).toBe(204);
  });

  // Break: a ausência do header double-submit deixa de bloquear mutações.
  it("rejeita mutação sem o header CSRF", async () => {
    const response = await request(createCsrfApp()).post("/mutation").set(platformHeaders());

    expect(response.status).toBe(403);
  });

  // Break: validar somente o hash da sessão permite combinar header e cookie diferentes.
  it("rejeita prova CSRF cujo header não corresponde ao cookie", async () => {
    const response = await request(createCsrfApp())
      .post("/mutation")
      .set(platformHeaders({ cookieCsrf: "B".repeat(43), submittedCsrf: csrfToken }));

    expect(response.status).toBe(403);
  });
});
