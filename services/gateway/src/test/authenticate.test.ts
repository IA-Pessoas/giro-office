import { type AuthContext, authenticateFromToken, ServiceError } from "@workspace/shared";
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
  logger?: ReturnType<typeof createTestLogger>;
  sessionValidator?: (auth: AuthContext, transport: "cookie" | "bearer") => Promise<void>;
}) {
  const app = express();
  app.use(
    buildAuthenticateMiddleware({
      jwtSecret: "test-secret",
      bearerAuthCompatibility: options.bearerAuthCompatibility,
      authCookieSecure: true,
      logger: options.logger ?? createTestLogger(),
      sessionValidator: options.sessionValidator,
    }),
  );
  app.get("/protected", (req, res) => {
    res.json({ transport: req.authTransport });
  });
  app.delete("/user/session", (req, res) => {
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

    const token = jwt.sign({ user_id: "user-1", organization_id: "org-1" }, "test-secret");
    await validate(authenticateFromToken(token, "test-secret"), "bearer");

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/user/session/validate", "http://user-service.test"),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: `Bearer ${token}`,
          "x-auth-session-transport": "bearer",
          "x-internal-service-token": "internal-token",
        }),
      }),
    );
  });

  it("valida identidade de plataforma somente no endpoint interno da plataforma", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const validate = createUserServiceSessionValidator(
      "http://user-service.test",
      "internal-token",
    );
    const token = jwt.sign(
      {
        user_id: "platform-user-1",
        auth_kind: "platform",
        platform_role: "super_admin",
      },
      "test-secret",
    );

    await validate(authenticateFromToken(token, "test-secret"), "cookie");

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/platform/session/validate", "http://user-service.test"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: `Bearer ${token}`,
          "x-auth-session-transport": "cookie",
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

    const token = jwt.sign({ user_id: "user-1", organization_id: "org-1" }, "test-secret");
    await expect(
      validate(authenticateFromToken(token, "test-secret"), "cookie"),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("preserva a resposta de sessão substituída para não derrubar a sessão nova", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 409 })));
    const validate = createUserServiceSessionValidator(
      "http://user-service.test",
      "internal-token",
    );

    const token = jwt.sign({ user_id: "user-1", organization_id: "org-1" }, "test-secret");
    await expect(
      validate(authenticateFromToken(token, "test-secret"), "cookie"),
    ).rejects.toMatchObject({ statusCode: 409 });
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
    expect(validateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        token: cookieToken,
        actorKind: "organization",
        userId: "user-1",
      }),
      "cookie",
    );
  });

  it("registra somente o uso aceito da compatibilidade Bearer no hot path", async () => {
    const cookieLogger = createTestLogger();
    const cookieInfo = vi.spyOn(cookieLogger, "info");

    await request(createProtectedApp({ bearerAuthCompatibility: true, logger: cookieLogger }))
      .get("/protected")
      .set("Cookie", `cw.session=${cookieToken}`);

    expect(cookieInfo).not.toHaveBeenCalled();

    const bearerLogger = createTestLogger();
    const bearerInfo = vi.spyOn(bearerLogger, "info");

    await request(createProtectedApp({ bearerAuthCompatibility: true, logger: bearerLogger }))
      .get("/protected")
      .set("Authorization", `Bearer ${cookieToken}`);

    expect(bearerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ event: "auth.bearer_compat.accepted" }),
    );
  });

  it("rejeita Bearer quando a compatibilidade está desligada", async () => {
    const response = await request(createProtectedApp({ bearerAuthCompatibility: false }))
      .get("/protected")
      .set("Authorization", `Bearer ${cookieToken}`);

    expect(response.status).toBe(401);
  });

  it("rejeita Bearer de plataforma mesmo com a compatibilidade organizacional ligada", async () => {
    const platformToken = jwt.sign(
      {
        user_id: "platform-user-1",
        auth_kind: "platform",
        platform_role: "super_admin",
      },
      "test-secret",
    );
    const validateSession = vi.fn().mockResolvedValue(undefined);

    const response = await request(
      createProtectedApp({ bearerAuthCompatibility: true, sessionValidator: validateSession }),
    )
      .get("/protected")
      .set("Authorization", `Bearer ${platformToken}`);

    expect(response.status).toBe(401);
    expect(validateSession).not.toHaveBeenCalled();
  });

  it("não encerra a UI quando uma validação antiga termina após a rotação", async () => {
    const app = createProtectedApp({
      bearerAuthCompatibility: false,
      sessionValidator: vi.fn().mockRejectedValue(new ServiceError(409, "Sessão substituída.")),
    });

    const response = await request(app)
      .get("/protected")
      .set("Cookie", `cw.session=${cookieToken}`);

    expect(response.status).toBe(409);
    expect(response.headers["x-auth-session-state"]).toBe("superseded");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("preserva indisponibilidade do validador sem convertê-la em logout", async () => {
    const app = createProtectedApp({
      bearerAuthCompatibility: false,
      sessionValidator: vi.fn().mockRejectedValue(new ServiceError(503, "Indisponível.")),
    });

    const response = await request(app)
      .get("/protected")
      .set("Cookie", `cw.session=${cookieToken}`);

    expect(response.status).toBe(503);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("permite que logout válido vença uma rotação concorrente", async () => {
    const app = createProtectedApp({
      bearerAuthCompatibility: false,
      sessionValidator: vi.fn().mockRejectedValue(new ServiceError(409, "Sessão substituída.")),
    });

    const response = await request(app)
      .delete("/user/session")
      .set("Cookie", `cw.session=${cookieToken}`);

    expect(response.status).toBe(200);
    expect(response.body.transport).toBe("cookie");
  });
});
