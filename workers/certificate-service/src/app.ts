import {
  certificateNotificationListQuerySchema,
  certificateNotificationRunBodySchema,
} from "@workspace/certificate-service/src/schemas/certificateNotification.schemas.js";
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
import { internalReportingExtractBodySchema } from "@workspace/certificate-service/src/schemas/internalReporting.schemas.js";
import { createCertificateFileCrypto } from "@workspace/certificate-service/src/services/certificateFileCrypto.js";
import type { CertificateFileStorage } from "@workspace/certificate-service/src/services/certificateFileStorage.js";
import {
  type CertificateUploadFile,
  validateCertificateUploadFile,
} from "@workspace/certificate-service/src/services/certificateFileValidation.js";
import { CertificateNotificationService } from "@workspace/certificate-service/src/services/certificateNotificationService.js";
import { createCertificatePasswordCrypto } from "@workspace/certificate-service/src/services/certificatePasswordCrypto.js";
import { CertificatePfService } from "@workspace/certificate-service/src/services/certificatePfService.js";
import type { CertificatePjFileDeps } from "@workspace/certificate-service/src/services/certificatePjService.js";
import { CertificatePjService } from "@workspace/certificate-service/src/services/certificatePjService.js";
import {
  createSupabaseStorageClient,
  type WorkerAuthContext,
  withWorkerPrisma,
} from "@workspace/runtime";
import { parseWithZod } from "@workspace/shared";
import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
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
import {
  type CertificateReportingPrisma,
  CertificateReportingService,
  certificatePfReportingCatalog,
  certificatePjReportingCatalog,
  verifyCertificateReportingGrant,
} from "./reporting.js";

type CertificatePjServiceLike = Pick<
  CertificatePjService,
  | "listCertificatePj"
  | "getCertificatePj"
  | "createCertificatePj"
  | "updateCertificatePj"
  | "deleteCertificatePj"
  | "uploadCertificatePjFile"
  | "downloadCertificatePjFile"
  | "deleteCertificatePjFile"
>;
type CertificatePfServiceLike = Pick<
  CertificatePfService,
  | "listCertificatePf"
  | "getCertificatePf"
  | "createCertificatePf"
  | "updateCertificatePf"
  | "deleteCertificatePf"
  | "uploadCertificatePfFile"
  | "downloadCertificatePfFile"
  | "deleteCertificatePfFile"
>;
type CertificateNotificationServiceLike = Pick<
  CertificateNotificationService,
  "listCertificateNotifications" | "runCertificateNotificationReconciliation"
>;
type CertificateReportingServiceLike = Pick<
  CertificateReportingService,
  "consumeGrant" | "extract"
>;

interface CertificateWorkerOptions {
  env: CertificateWorkerEnv;
  service?: CertificatePjServiceLike;
  pfService?: CertificatePfServiceLike;
  notificationService?: CertificateNotificationServiceLike;
  reportingService?: CertificateReportingServiceLike;
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

function createCertificateFileDeps(env: CertificateWorkerEnv): CertificatePjFileDeps | undefined {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.CERTIFICATE_FILE_ENCRYPTION_KEY) {
    return undefined;
  }

  const storage = createSupabaseStorageClient({
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const bucket = env.CERTIFICATE_STORAGE_BUCKET ?? "Certificados";
  const fileStorage: CertificateFileStorage = {
    async putObject(input) {
      try {
        await storage.upload(bucket, input.path, input.buffer, {
          contentType: input.contentType,
          upsert: true,
        });
      } catch (error) {
        throw new ServiceError(500, "Erro ao armazenar arquivo de certificado.", error);
      }
    },
    async getObject(path) {
      try {
        const response = await storage.download(bucket, path);
        return Buffer.from(await response.arrayBuffer());
      } catch (error) {
        throw new ServiceError(404, "Arquivo de certificado não encontrado.", error);
      }
    },
    async deleteObject(path) {
      try {
        await storage.remove(bucket, path);
      } catch (error) {
        throw new ServiceError(500, "Erro ao remover arquivo de certificado.", error);
      }
    },
  };

  return {
    fileStorage,
    fileCrypto: createCertificateFileCrypto({
      keyBase64: env.CERTIFICATE_FILE_ENCRYPTION_KEY,
      keyVersion: env.CERTIFICATE_FILE_ENCRYPTION_KEY_VERSION ?? "v1",
    }),
    storageProvider: "supabase",
    storageBucket: bucket,
  };
}

async function readCertificateUpload(
  c: { req: { parseBody: () => Promise<Record<string, unknown>> } },
  env: CertificateWorkerEnv,
): Promise<CertificateUploadFile> {
  const body = await c.req.parseBody();
  const file = body.file instanceof File ? body.file : undefined;
  return validateCertificateUploadFile(
    file
      ? {
          buffer: Buffer.from(await file.arrayBuffer()),
          mimetype: file.type || "application/octet-stream",
          originalname: file.name,
          size: file.size,
        }
      : undefined,
    env.CERTIFICATE_FILE_MAX_SIZE_BYTES ?? 5 * 1024 * 1024,
  );
}

function attachmentFileName(originalName: string): string {
  return originalName.replace(/[^a-zA-Z0-9._-]/g, "_") || "certificate.p12";
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
      createCertificateFileDeps(options.env),
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
      createCertificateFileDeps(options.env),
      passwordCrypto,
    );
    return callback(service);
  });
}

async function withCertificateNotificationService<T>(
  options: CertificateWorkerOptions,
  callback: (service: CertificateNotificationServiceLike) => Promise<T>,
): Promise<T> {
  if (options.notificationService) return callback(options.notificationService);

  return withWorkerPrisma(options.env, PrismaClient, async (client) => {
    const service = new CertificateNotificationService(
      client as unknown as ConstructorParameters<typeof CertificateNotificationService>[0],
    );
    return callback(service);
  });
}

async function withCertificateReportingService<T>(
  options: CertificateWorkerOptions,
  callback: (service: CertificateReportingServiceLike) => Promise<T>,
): Promise<T> {
  if (options.reportingService) return callback(options.reportingService);
  return withWorkerPrisma(options.env, PrismaClient, (client) =>
    callback(new CertificateReportingService(client as unknown as CertificateReportingPrisma)),
  );
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

  app.get("/certificate/notifications", async (c) => {
    const query = parseWithZod(certificateNotificationListQuerySchema, c.req.query());
    const auth = c.get("auth");
    return c.json(
      createSuccessResponse(
        await withCertificateNotificationService(options, (service) =>
          service.listCertificateNotifications({
            organizationId: auth.organizationId,
            query,
          }),
        ),
      ),
    );
  });

  app.post("/internal/notifications/run", async (c) => {
    if (c.req.header(INTERNAL_SERVICE_TOKEN_HEADER) !== options.env.INTERNAL_SERVICE_TOKEN) {
      throw new ServiceError(401, "Token interno do certificate-service inválido.");
    }
    parseWithZod(certificateNotificationRunBodySchema, await readJson(c));
    return c.json(
      createSuccessResponse(
        await withCertificateNotificationService(options, (service) =>
          service.runCertificateNotificationReconciliation({
            windowDays: options.env.CERTIFICATE_NOTIFICATION_WINDOW_DAYS ?? 30,
          }),
        ),
      ),
    );
  });

  app.get("/internal/reporting/catalog", async (c) => {
    const verified = await verifyCertificateReportingGrant({
      env: options.env,
      request: c.req.raw,
      operation: "catalog",
      source: "certificado.catalog",
      fields: [],
      body: {},
    });
    await withCertificateReportingService(options, (service) =>
      service.consumeGrant(verified.value, verified.grant.expires_at),
    );
    return c.json(
      createSuccessResponse({
        sources: [
          ...certificatePfReportingCatalog.sources,
          ...certificatePjReportingCatalog.sources,
        ],
        relations: [],
      }),
    );
  });

  app.post("/internal/reporting/extract", async (c) => {
    const body = parseWithZod(internalReportingExtractBodySchema, await readJson(c));
    const verified = await verifyCertificateReportingGrant({
      env: options.env,
      request: c.req.raw,
      operation: "extract",
      source: body.source,
      fields: body.fields,
      body,
    });
    return c.json(
      createSuccessResponse(
        await withCertificateReportingService(options, async (service) => {
          await service.consumeGrant(verified.value, verified.grant.expires_at);
          return service.extract({
            organizationId: verified.grant.organization_id,
            source: body.source,
            fields: body.fields,
            limit: body.limit,
            ...(body.query ? { query: body.query } : {}),
          });
        }),
      ),
    );
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

  app.post("/certificate/pj/:id/file", async (c) => {
    const params = parseWithZod(certificatePjIdParamSchema, c.req.param());
    const auth = c.get("auth");
    const file = await readCertificateUpload(c, options.env);
    return c.json(
      createSuccessResponse(
        await withCertificateService(options, (service) =>
          service.uploadCertificatePjFile({
            id: params.id,
            organizationId: auth.organizationId,
            userId: auth.userId,
            file,
          }),
        ),
      ),
      201,
    );
  });

  app.get("/certificate/pj/:id/file", async (c) => {
    const params = parseWithZod(certificatePjIdParamSchema, c.req.param());
    const auth = c.get("auth");
    const result = await withCertificateService(options, (service) =>
      service.downloadCertificatePjFile({
        id: params.id,
        organizationId: auth.organizationId,
      }),
    );
    return new Response(result.buffer, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${attachmentFileName(result.originalName)}"`,
        "Content-Type": result.mimeType,
      },
    });
  });

  app.delete("/certificate/pj/:id/file", async (c) => {
    const params = parseWithZod(certificatePjIdParamSchema, c.req.param());
    const auth = c.get("auth");
    return c.json(
      createSuccessResponse(
        await withCertificateService(options, (service) =>
          service.deleteCertificatePjFile({
            id: params.id,
            organizationId: auth.organizationId,
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

  app.post("/certificate/pf/:id/file", async (c) => {
    const params = parseWithZod(certificatePfIdParamSchema, c.req.param());
    const auth = c.get("auth");
    const file = await readCertificateUpload(c, options.env);
    return c.json(
      createSuccessResponse(
        await withCertificatePfService(options, (service) =>
          service.uploadCertificatePfFile({
            id: params.id,
            organizationId: auth.organizationId,
            userId: auth.userId,
            file,
          }),
        ),
      ),
      201,
    );
  });

  app.get("/certificate/pf/:id/file", async (c) => {
    const params = parseWithZod(certificatePfIdParamSchema, c.req.param());
    const auth = c.get("auth");
    const result = await withCertificatePfService(options, (service) =>
      service.downloadCertificatePfFile({
        id: params.id,
        organizationId: auth.organizationId,
      }),
    );
    return new Response(result.buffer, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${attachmentFileName(result.originalName)}"`,
        "Content-Type": result.mimeType,
      },
    });
  });

  app.delete("/certificate/pf/:id/file", async (c) => {
    const params = parseWithZod(certificatePfIdParamSchema, c.req.param());
    const auth = c.get("auth");
    return c.json(
      createSuccessResponse(
        await withCertificatePfService(options, (service) =>
          service.deleteCertificatePfFile({
            id: params.id,
            organizationId: auth.organizationId,
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
