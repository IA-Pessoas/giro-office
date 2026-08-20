import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildAuthenticateMiddleware,
  createUserServiceSessionValidator,
} from "../middlewares/authenticate.js";

function createTestLogger() {
  return createLogger({
    service: "gateway-auth-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });
}

function createProtectedApp(options: {
  bearerAuthCompatibility: boolean;
  sessionValidator?: (token: string) => Promise<void>;
}) {
  const app = express();
  app.use(
    buildAuthenticateMiddleware({
      jwtSecret: "test-secret",
      bearerAuthCompatibility: options.bearerAuthCompatibility,
      authCookieSecure: true,
      logger: createTestLogger(),
      sessionValidator: options.sessionValidator,
    }),
  );
  app.get("/protected", (req, res) => {
    res.json({ transport: req.authTransport });
  });
  app.use(
    (
      error: Error & { statusCode?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(error.statusCode ?? 500).json({ error: error.message });
    },
  );
  return app;
}

describe("createUserServiceSessionValidator", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("valida o token no endpoint de sessão do user-service", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const validate = createUserServiceSessionValidator(
      "http://user-service.test",
      "internal-token",
    );

    await validate("jwt-token");

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/user/session/validate", "http://user-service.test"),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer jwt-token",
          "x-internal-service-token": "internal-token",
        }),
      }),
    );
  });

  it("falha fechado quando o user-service rejeita a sessão", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const validate = createUserServiceSessionValidator(
      "http://user-service.test",
      "internal-token",
    );

    await expect(validate("revoked-token")).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("buildAuthenticateMiddleware", () => {
  const cookieToken = jwt.sign(
    { user_id: "user-1", organization_id: "org-1", session_version: 1 },
    "test-secret",
  );

  it("autentica cookie de sessão antes de Authorization", async () => {
    const validateSession = vi.fn().mockResolvedValue(undefined);
    const app = createProtectedApp({
      bearerAuthCompatibility: true,
      sessionValidator: validateSession,
    });

    const response = await request(app)
      .get("/protected")
      .set("Cookie", `cw.session=${cookieToken}`)
      .set("Authorization", `Bearer ${jwt.sign({ user_id: "header-user" }, "test-secret")}`);

    expect(response.status).toBe(200);
    expect(response.body.transport).toBe("cookie");
    expect(validateSession).toHaveBeenCalledWith(cookieToken);
  });

  it("rejeita Bearer quando a compatibilidade está desligada", async () => {
    const response = await request(createProtectedApp({ bearerAuthCompatibility: false }))
      .get("/protected")
      .set("Authorization", `Bearer ${cookieToken}`);

    expect(response.status).toBe(401);
  });

  it("expira cookies quando a validação da sessão falha", async () => {
    const app = createProtectedApp({
      bearerAuthCompatibility: false,
      sessionValidator: vi.fn().mockRejectedValue(new Error("stale")),
    });

    const response = await request(app)
      .get("/protected")
      .set("Cookie", `cw.session=${cookieToken}`);

    expect(response.status).toBe(401);
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([expect.stringContaining("cw.session=; Max-Age=0")]),
    );
  });
});
