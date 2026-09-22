import {
  certificatePfIdParamSchema,
  certificatePfListQuerySchema,
  createCertificatePfSchema,
  updateCertificatePfSchema,
} from "@workspace/certificate-service/src/schemas/certificatePf.schemas.js";
import {
  certificatePjIdParamSchema,
  certificatePjListQuerySchema,
  createCertificatePjSchema,
  updateCertificatePjSchema,
} from "@workspace/certificate-service/src/schemas/certificatePj.schemas.js";
import { createCertificatePasswordCrypto } from "@workspace/certificate-service/src/services/certificatePasswordCrypto.js";
import { CertificatePfService } from "@workspace/certificate-service/src/services/certificatePfService.js";
import { CertificatePjService } from "@workspace/certificate-service/src/services/certificatePjService.js";
import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { parseWithZod } from "@workspace/shared";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  authenticateCertificateRequest,
  authorizeCertificateRequest,
  certificatePermission,
} from "./auth.js";
import type { CertificateWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

type CertificatePjServiceLike = Pick<
  CertificatePjService,
  | "listCertificatePj"
  | "getCertificatePj"
  | "createCertificatePj"
  | "updateCertificatePj"
  | "deleteCertificatePj"
>;
type CertificatePfServiceLike = Pick<
  CertificatePfService,
  | "listCertificatePf"
  | "getCertificatePf"
  | "createCertificatePf"
  | "updateCertificatePf"
  | "deleteCertificatePf"
>;

interface CertificateWorkerOptions {
  env: CertificateWorkerEnv;
  service?: CertificatePjServiceLike;
  pfService?: CertificatePfServiceLike;
}

type CertificateVariables = { auth: WorkerAuthContext };
type CertificateHonoEnv = { Bindings: CertificateWorkerEnv; Variables: CertificateVariables };

async function readJson(c: { req: { json: <T>() => Promise<T> } }): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new ServiceError(400, "Dados inválidos.");
  }
}

async function withCertificateService<T>(
  options: CertificateWorkerOptions,
  callback: (service: CertificatePjServiceLike) => Promise<T>,
): Promise<T> {
  if (options.service) return callback(options.service);

  return withWorkerPrisma(options.env, PrismaClient, async (client) => {
    const passwordCrypto = createCertificatePasswordCrypto({
      keyBase64: options.env.CERTIFICATE_PASSWORD_ENCRYPTION_KEY,
      keyVersion: options.env.CERTIFICATE_PASSWORD_ENCRYPTION_KEY_VERSION ?? "v1",
    });
    const service = new CertificatePjService(
      client as unknown as ConstructorParameters<typeof CertificatePjService>[0],
      undefined,
      passwordCrypto,
    );
    return callback(service);
  });
}

async function withCertificatePfService<T>(
  options: CertificateWorkerOptions,
  callback: (service: CertificatePfServiceLike) => Promise<T>,
): Promise<T> {
  if (options.pfService) return callback(options.pfService);

  return withWorkerPrisma(options.env, PrismaClient, async (client) => {
    const passwordCrypto = createCertificatePasswordCrypto({
      keyBase64: options.env.CERTIFICATE_PASSWORD_ENCRYPTION_KEY,
      keyVersion: options.env.CERTIFICATE_PASSWORD_ENCRYPTION_KEY_VERSION ?? "v1",
    });
    const service = new CertificatePfService(
      client as unknown as ConstructorParameters<typeof CertificatePfService>[0],
      undefined,
      passwordCrypto,
    );
    return callback(service);
  });
}

export function createCertificateWorkerApp(options: CertificateWorkerOptions) {
  const app = new Hono<CertificateHonoEnv>();

  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "certificate-service" })),
  );
  app.get("/ready", (c) =>
    c.json(createSuccessResponse({ status: "ready", service: "certificate-service" })),
  );

  const authenticate = async (request: Request) => {
    const auth = await authenticateCertificateRequest(request, options.env);
    authorizeCertificateRequest(request, auth);
    return auth;
  };

  app.use("/certificate", async (c, next) => {
    c.set("auth", await authenticate(c.req.raw));
    await next();
  });
  app.use("/certificate/*", async (c, next) => {
    c.set("auth", await authenticate(c.req.raw));
    await next();
  });

  app.get("/certificate/pj/list", async (c) => {
    const query = parseWithZod(certificatePjListQuerySchema, c.req.query());
    const auth = c.get("auth");
    return c.json(
      createSuccessResponse(
        await withCertificateService(options, (service) =>
          service.listCertificatePj({ organizationId: auth.organizationId, query }),
        ),
      ),
    );
  });

  app.get("/certificate/pj/:id", async (c) => {
    const params = parseWithZod(certificatePjIdParamSchema, c.req.param());
    const auth = c.get("auth");
    return c.json(
      createSuccessResponse(
        await withCertificateService(options, (service) =>
          service.getCertificatePj({
            id: params.id,
            organizationId: auth.organizationId,
            canViewPassword: certificatePermission(auth) >= 2,
          }),
        ),
      ),
    );
  });

  app.post("/certificate/pj", async (c) => {
    const auth = c.get("auth");
    const data = parseWithZod(createCertificatePjSchema, await readJson(c));
    return c.json(
      createSuccessResponse(
        await withCertificateService(options, (service) =>
          service.createCertificatePj({ organizationId: auth.organizationId, data }),
        ),
      ),
      201,
    );
  });

  app.patch("/certificate/pj/:id", async (c) => {
    const params = parseWithZod(certificatePjIdParamSchema, c.req.param());
    const auth = c.get("auth");
    const data = parseWithZod(updateCertificatePjSchema, await readJson(c));
    return c.json(
      createSuccessResponse(
        await withCertificateService(options, (service) =>
          service.updateCertificatePj({ id: params.id, organizationId: auth.organizationId, data }),
        ),
      ),
    );
  });

  app.delete("/certificate/pj/:id", async (c) => {
    const params = parseWithZod(certificatePjIdParamSchema, c.req.param());
    const auth = c.get("auth");
    return c.json(
      createSuccessResponse(
        await withCertificateService(options, (service) =>
          service.deleteCertificatePj({ id: params.id, organizationId: auth.organizationId }),
        ),
      ),
    );
  });

  app.get("/certificate/pf/list", async (c) => {
    const query = parseWithZod(certificatePfListQuerySchema, c.req.query());
    const auth = c.get("auth");
    return c.json(
      createSuccessResponse(
        await withCertificatePfService(options, (service) =>
          service.listCertificatePf({ organizationId: auth.organizationId, query }),
        ),
      ),
    );
  });

  app.get("/certificate/pf/:id", async (c) => {
    const params = parseWithZod(certificatePfIdParamSchema, c.req.param());
    const auth = c.get("auth");
    return c.json(
      createSuccessResponse(
        await withCertificatePfService(options, (service) =>
          service.getCertificatePf({
            id: params.id,
            organizationId: auth.organizationId,
            canViewPassword: certificatePermission(auth) >= 2,
          }),
        ),
      ),
    );
  });

  app.post("/certificate/pf", async (c) => {
    const auth = c.get("auth");
    const data = parseWithZod(createCertificatePfSchema, await readJson(c));
    return c.json(
      createSuccessResponse(
        await withCertificatePfService(options, (service) =>
          service.createCertificatePf({ organizationId: auth.organizationId, data }),
        ),
      ),
      201,
    );
  });

  app.patch("/certificate/pf/:id", async (c) => {
    const params = parseWithZod(certificatePfIdParamSchema, c.req.param());
    const auth = c.get("auth");
    const data = parseWithZod(updateCertificatePfSchema, await readJson(c));
    return c.json(
      createSuccessResponse(
        await withCertificatePfService(options, (service) =>
          service.updateCertificatePf({ id: params.id, organizationId: auth.organizationId, data }),
        ),
      ),
    );
  });

  app.delete("/certificate/pf/:id", async (c) => {
    const params = parseWithZod(certificatePfIdParamSchema, c.req.param());
    const auth = c.get("auth");
    return c.json(
      createSuccessResponse(
        await withCertificatePfService(options, (service) =>
          service.deleteCertificatePf({ id: params.id, organizationId: auth.organizationId }),
        ),
      ),
    );
  });

  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no certificate-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });

  return app;
}
