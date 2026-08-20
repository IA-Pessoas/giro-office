import { CSRF_HEADER_NAME, hashCsrfToken, type ServiceError } from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { buildCsrfProtectionMiddleware } from "../middlewares/csrfProtection.js";

const CSRF_TOKEN = "A".repeat(43);

function createApp(options: { csrfHash?: string; transport?: "cookie" | "bearer" } = {}) {
  const app = express();
  const logger = createLogger({
    service: "gateway-csrf-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });
  app.use((req, _res, next) => {
    req.authTransport = options.transport ?? "cookie";
    req.auth = {
      token: "signed.jwt",
      userId: "user-1",
      organizationId: "org-1",
      claims: {
        user_id: "user-1",
        organization_id: "org-1",
        csrf_hash: options.csrfHash ?? hashCsrfToken(CSRF_TOKEN),
      },
    };
    next();
  });
  app.use(
    buildCsrfProtectionMiddleware({
      allowedOrigins: ["https://useoffice.com.br"],
      logger,
    }),
  );
  app.all("/protected", (_req, res) => res.json({ ok: true }));
  app.use(
    (
      error: ServiceError,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(error.statusCode).json({ code: error.code, error: error.message }),
  );
  return app;
}

function validRequest(app: express.Express, method: "post" | "put" | "patch" | "delete") {
  return request(app)
    [method]("/protected")
    .set("Cookie", `cw.csrf=${CSRF_TOKEN}`)
    .set(CSRF_HEADER_NAME, CSRF_TOKEN)
    .set("Origin", "https://useoffice.com.br");
}

describe("buildCsrfProtectionMiddleware", () => {
  for (const method of ["post", "put", "patch", "delete"] as const) {
    it(`aceita ${method.toUpperCase()} com prova vinculada`, async () => {
      expect((await validRequest(createApp(), method)).status).toBe(200);
    });

    it(`rejeita ${method.toUpperCase()} sem header CSRF`, async () => {
      const response = await request(createApp())
        [method]("/protected")
        .set("Cookie", `cw.csrf=${CSRF_TOKEN}`)
        .set("Origin", "https://useoffice.com.br");

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ code: "FORBIDDEN", error: "Requisição não autorizada." });
    });
  }

  it("rejeita cookie e header diferentes", async () => {
    const response = await request(createApp())
      .post("/protected")
      .set("Cookie", `cw.csrf=${CSRF_TOKEN}`)
      .set(CSRF_HEADER_NAME, "B".repeat(43));

    expect(response.status).toBe(403);
  });

  it("rejeita prova vinculada a outra sessão", async () => {
    const response = await validRequest(
      createApp({ csrfHash: hashCsrfToken("B".repeat(43)) }),
      "post",
    );

    expect(response.status).toBe(403);
  });

  it("rejeita replay depois da rotação", async () => {
    const rotatedHash = hashCsrfToken("C".repeat(43));
    const response = await validRequest(createApp({ csrfHash: rotatedHash }), "delete");

    expect(response.status).toBe(403);
  });

  it("rejeita token superdimensionado", async () => {
    const oversized = "A".repeat(500);
    const response = await request(createApp())
      .patch("/protected")
      .set("Cookie", `cw.csrf=${oversized}`)
      .set(CSRF_HEADER_NAME, oversized);

    expect(response.status).toBe(403);
  });

  it.each(["null", "https://evil.example"])("rejeita Origin %s", async (origin) => {
    const response = await request(createApp())
      .post("/protected")
      .set("Cookie", `cw.csrf=${CSRF_TOKEN}`)
      .set(CSRF_HEADER_NAME, CSRF_TOKEN)
      .set("Origin", origin);

    expect(response.status).toBe(403);
  });

  it("rejeita Referer hostil quando Origin está ausente", async () => {
    const response = await request(createApp())
      .post("/protected")
      .set("Cookie", `cw.csrf=${CSRF_TOKEN}`)
      .set(CSRF_HEADER_NAME, CSRF_TOKEN)
      .set("Referer", "https://evil.example/form");

    expect(response.status).toBe(403);
  });

  it("permite GET sem prova CSRF", async () => {
    expect((await request(createApp()).get("/protected")).status).toBe(200);
  });

  it("permite POST no transporte Bearer de compatibilidade", async () => {
    expect((await request(createApp({ transport: "bearer" })).post("/protected")).status).toBe(200);
  });
});
