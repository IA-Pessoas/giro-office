import { AUTH_SESSION_COOKIE_NAME, type AuthContext } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAuthenticateMiddleware } from "./authenticate.js";

const JWT_SECRET = "segredo-de-teste-do-gateway-com-tamanho-suficiente";

afterEach(() => {
  vi.restoreAllMocks();
});

function buildRequest(method: string, token: string): Request {
  return {
    method,
    path: "/user/me",
    headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=${token}` },
  } as unknown as Request;
}

function buildResponse(): Response {
  return { setHeader: vi.fn() } as unknown as Response;
}

/** Token assinado com as claims que a chave de cache usa. */
async function signToken(
  sessionId: string,
  sessionVersion: number,
  impersonatorPlatformUserId?: string,
): Promise<string> {
  const { default: jwt } = await import("jsonwebtoken");
  return jwt.sign(
    {
      user_id: "user-1",
      organization_id: "org-1",
      auth_kind: "organization",
      session_id: sessionId,
      session_version: sessionVersion,
      csrf_hash: "a".repeat(64),
      permission: 3,
      ...(impersonatorPlatformUserId
        ? { impersonator_platform_user_id: impersonatorPlatformUserId }
        : {}),
    },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

async function run(
  middleware: ReturnType<typeof buildAuthenticateMiddleware>,
  method: string,
  token: string,
): Promise<unknown> {
  return new Promise((resolve) => {
    const next: NextFunction = (error?: unknown) => resolve(error);
    void middleware(buildRequest(method, token), buildResponse(), next);
  });
}

function buildMiddleware(validator: (auth: AuthContext) => Promise<void>) {
  return buildAuthenticateMiddleware({
    jwtSecret: JWT_SECRET,
    sessionValidator: validator,
    bearerAuthCompatibility: false,
    authCookieSecure: true,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
  });
}

describe("cache de validação de sessão", () => {
  it("valida uma vez e reaproveita nos GETs seguintes", async () => {
    const validator = vi.fn().mockResolvedValue(undefined);
    const middleware = buildMiddleware(validator);
    const token = await signToken("session-1", 1);

    expect(await run(middleware, "GET", token)).toBeUndefined();
    expect(await run(middleware, "GET", token)).toBeUndefined();

    expect(validator).toHaveBeenCalledTimes(1);
  });

  it("revalida em método que altera estado e derruba a entrada cacheada", async () => {
    const validator = vi.fn().mockResolvedValue(undefined);
    const middleware = buildMiddleware(validator);
    const token = await signToken("session-1", 1);

    await run(middleware, "GET", token);
    await run(middleware, "POST", token);
    await run(middleware, "GET", token);

    // GET inicial, POST (sempre revalida) e o GET seguinte, já sem cache.
    expect(validator).toHaveBeenCalledTimes(3);
  });

  it("não reaproveita entre versões de sessão diferentes", async () => {
    const validator = vi.fn().mockResolvedValue(undefined);
    const middleware = buildMiddleware(validator);

    await run(middleware, "GET", await signToken("session-1", 1));
    await run(middleware, "GET", await signToken("session-1", 2));

    expect(validator).toHaveBeenCalledTimes(2);
  });

  it("revalida cada leitura de uma sessão de personificação", async () => {
    const validator = vi.fn().mockResolvedValue(undefined);
    const middleware = buildMiddleware(validator);
    const token = await signToken("session-1", 1, "platform-1");

    expect(await run(middleware, "GET", token)).toBeUndefined();
    expect(await run(middleware, "GET", token)).toBeUndefined();

    expect(validator).toHaveBeenCalledTimes(2);
  });

  it("não cacheia falha de validação", async () => {
    const validator = vi.fn().mockRejectedValue(new Error("sessão inválida"));
    const middleware = buildMiddleware(validator);
    const token = await signToken("session-1", 1);

    expect(await run(middleware, "GET", token)).toBeDefined();
    expect(await run(middleware, "GET", token)).toBeDefined();

    expect(validator).toHaveBeenCalledTimes(2);
  });
});
