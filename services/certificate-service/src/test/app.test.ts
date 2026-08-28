import {
  createExpressErrorHandler,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createCertificateApplication } from "../app.js";
import { type CertificateServiceEnv, getCertificateServiceEnv } from "../config/env.js";
import {
  createForwardedAuthContextMiddleware,
  requestContext,
} from "../middlewares/requestContext.js";
import { requireCertificatePermission } from "../middlewares/requireCertificatePermission.js";

const env = getCertificateServiceEnv();
const logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function createPermissionTestApp(testEnv: CertificateServiceEnv = env) {
  const app = express();

  app.use(requestContext);
  app.use("/certificate", createForwardedAuthContextMiddleware(testEnv.internalServiceToken));
  app.get("/certificate/admin", requireCertificatePermission, (_request, response) => {
    response.status(200).json({ ok: true });
  });
  app.use(
    createExpressErrorHandler({
      logger,
      event: "certificate-service.test-error",
      fallbackMessage: "Erro interno no certificate-service.",
    }),
  );

  return app;
}

describe("certificate-service app", () => {
  it("returns health", async () => {
    const app = createCertificateApplication({ env, logger, prisma: {} as never });

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.service).toBe("certificate-service");
  });

  it("returns ready", async () => {
    const app = createCertificateApplication({ env, logger, prisma: {} as never });

    const response = await request(app).get("/ready");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("ready");
  });

  it("preserves forwarded request id", async () => {
    const app = createCertificateApplication({ env, logger, prisma: {} as never });

    const response = await request(app).get("/health").set("x-request-id", "req-cert-1");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("req-cert-1");
  });

  it("documents certificate PJ public routes in OpenAPI", async () => {
    const app = createCertificateApplication({
      env: { ...env, enableApiDocs: true },
      logger,
      prisma: {} as never,
    });

    const response = await request(app).get("/openapi.json");

    expect(response.status).toBe(200);
    expect(response.body.paths).toHaveProperty("/certificate/pj/list");
    expect(response.body.paths["/certificate/pj/list"]).toHaveProperty("get");
    expect(response.body.paths).toHaveProperty("/certificate/pj/{id}");
    expect(response.body.paths["/certificate/pj/{id}"]).toHaveProperty("get");
    expect(response.body.paths["/certificate/pj/{id}"]).toHaveProperty("patch");
    expect(response.body.paths).toHaveProperty("/certificate/pj");
    expect(response.body.paths["/certificate/pj"]).toHaveProperty("post");
  });

  it("documents certificate PF public routes in OpenAPI", async () => {
    const app = createCertificateApplication({
      env: { ...env, enableApiDocs: true },
      logger,
      prisma: {} as never,
    });

    const response = await request(app).get("/openapi.json");

    expect(response.status).toBe(200);
    expect(response.body.paths).toHaveProperty("/certificate/pf/list");
    expect(response.body.paths["/certificate/pf/list"]).toHaveProperty("get");
    expect(response.body.paths).toHaveProperty("/certificate/pf/{id}");
    expect(response.body.paths["/certificate/pf/{id}"]).toHaveProperty("get");
    expect(response.body.paths["/certificate/pf/{id}"]).toHaveProperty("patch");
    expect(response.body.paths).toHaveProperty("/certificate/pf");
    expect(response.body.paths["/certificate/pf"]).toHaveProperty("post");
  });

  it("documents certificate notification routes in OpenAPI", async () => {
    const app = createCertificateApplication({
      env: { ...env, enableApiDocs: true },
      logger,
      prisma: {} as never,
    });

    const response = await request(app).get("/openapi.json");

    expect(response.status).toBe(200);
    expect(response.body.paths).toHaveProperty("/certificate/notifications");
    expect(response.body.paths["/certificate/notifications"]).toHaveProperty("get");
    expect(response.body.paths).toHaveProperty("/internal/notifications/run");
    expect(response.body.paths["/internal/notifications/run"]).toHaveProperty("post");
    expect(response.body.paths["/internal/notifications/run"].post).toMatchObject({
      "x-internal": true,
      security: [{ internalToken: [] }],
    });
  });

  it("monta reporting somente no contexto interno e exige grant", async () => {
    const app = createCertificateApplication({ env, logger, prisma: {} as never });

    const response = await request(app).get("/internal/reporting/catalog");

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });

  it("documents reporting interno sem expor a rota no contrato público", async () => {
    const app = createCertificateApplication({
      env: { ...env, enableApiDocs: true },
      logger,
      prisma: {} as never,
    });

    const response = await request(app).get("/openapi.json").expect(200);

    expect(response.body.paths["/internal/reporting/catalog"].get).toMatchObject({
      "x-internal": true,
      security: [{ internalToken: [] }],
    });
    expect(response.body.paths["/internal/reporting/extract"].post).toMatchObject({
      "x-internal": true,
      security: [{ internalToken: [] }],
    });
  });
});

describe("certificate-service auth context", () => {
  it("rejects forwarded certificate context without internal token", async () => {
    const app = createPermissionTestApp();

    const response = await request(app)
      .get("/certificate/admin")
      .set(FORWARDED_AUTH_USER_ID_HEADER, "user-1")
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, "org-1")
      .set(FORWARDED_AUTH_PERMISSION_HEADER, JSON.stringify({ certificado: 2 }));

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
  });

  it("allows forwarded certificate context with permission certificado 2", async () => {
    const app = createPermissionTestApp();

    const response = await request(app)
      .get("/certificate/admin")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, env.internalServiceToken)
      .set(FORWARDED_AUTH_USER_ID_HEADER, "user-1")
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, "org-1")
      .set(FORWARDED_AUTH_PERMISSION_HEADER, JSON.stringify({ certificado: 2 }));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("rejects forwarded certificate context without permission certificado 2", async () => {
    const app = createPermissionTestApp();

    const response = await request(app)
      .get("/certificate/admin")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, env.internalServiceToken)
      .set(FORWARDED_AUTH_USER_ID_HEADER, "user-1")
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, "org-1")
      .set(FORWARDED_AUTH_PERMISSION_HEADER, JSON.stringify({ certificado: 1 }));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });
});
