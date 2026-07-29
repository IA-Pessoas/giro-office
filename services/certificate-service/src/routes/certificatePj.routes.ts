import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import { type RequestHandler, Router } from "express";
import multer from "multer";

import type { PrismaClient } from "../generated/prisma/client.js";
import {
  CERTIFICATE_ELEVATED_PERMISSION,
  requireCertificateDeletePermission,
  requireCertificatePermission,
  requireCertificateReadPermission,
} from "../middlewares/requireCertificatePermission.js";
import {
  certificatePjIdParamSchema,
  certificatePjListQuerySchema,
  createCertificatePjSchema,
  updateCertificatePjSchema,
} from "../schemas/certificatePj.schemas.js";
import type { createCertificateFileCrypto } from "../services/certificateFileCrypto.js";
import type { CertificateFileStorage } from "../services/certificateFileStorage.js";
import { validateCertificateUploadFile } from "../services/certificateFileValidation.js";
import { CertificatePjService } from "../services/certificatePjService.js";

export interface CreateCertificatePjRoutesOptions {
  prisma: PrismaClient;
  certificateFileStorage?: CertificateFileStorage;
  certificateFileCrypto?: ReturnType<typeof createCertificateFileCrypto>;
  maxFileSizeBytes: number;
  storageProvider: string;
  storageBucket: string;
  uploadRateLimit?: RequestHandler;
}

function createCertificateFileUpload(maxFileSizeBytes: number): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxFileSizeBytes,
      files: 1,
      fields: 0,
      fieldSize: 1024,
    },
  });

  return (request, response, next) => {
    upload.single("file")(request, response, (err: unknown) => {
      if (!err) {
        next();
        return;
      }

      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        next(new ServiceError(400, "Arquivo de certificado excede o limite permitido."));
        return;
      }

      if (err instanceof multer.MulterError) {
        next(new ServiceError(400, "Upload de certificado invalido."));
        return;
      }

      next(err);
    });
  };
}

function attachmentFileName(originalName: string): string {
  return originalName.replace(/["\r\n]/g, "_");
}

export function createCertificatePjRoutes(options: CreateCertificatePjRoutesOptions): Router {
  const router = Router();
  const service = new CertificatePjService(
    options.prisma,
    options.certificateFileStorage && options.certificateFileCrypto
      ? {
          fileStorage: options.certificateFileStorage,
          fileCrypto: options.certificateFileCrypto,
          storageProvider: options.storageProvider,
          storageBucket: options.storageBucket,
        }
      : undefined,
  );
  const uploadCertificateFile = createCertificateFileUpload(options.maxFileSizeBytes);
  const uploadRateLimit = options.uploadRateLimit ?? ((_request, _response, next) => next());

  router.get("/list", requireCertificateReadPermission, async (request, response, next) => {
    try {
      const authContext = requireAuthenticatedRequestContext(request);
      const query = parseWithZod(certificatePjListQuerySchema, request.query);
      const result = await service.listCertificatePj({
        organizationId: authContext.organization_id,
        query,
      });

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao listar certificados PJ", { err });
      next(err);
    }
  });

  router.get("/:id", requireCertificateReadPermission, async (request, response, next) => {
    try {
      const authContext = requireAuthenticatedRequestContext(request);
      const params = parseWithZod(certificatePjIdParamSchema, request.params);
      const result = await service.getCertificatePj({
        id: params.id,
        organizationId: authContext.organization_id,
        canViewPassword: request.permission?.certificado === CERTIFICATE_ELEVATED_PERMISSION,
      });

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao buscar certificado PJ", { err });
      next(err);
    }
  });

  router.post(
    "/:id/file",
    requireCertificatePermission,
    uploadRateLimit,
    uploadCertificateFile,
    async (request, response, next) => {
      try {
        const authContext = requireAuthenticatedRequestContext(request);
        const params = parseWithZod(certificatePjIdParamSchema, request.params);
        const file = validateCertificateUploadFile(request.file, options.maxFileSizeBytes);
        const result = await service.uploadCertificatePjFile({
          id: params.id,
          organizationId: authContext.organization_id,
          userId: authContext.user_id,
          file,
        });

        response.status(201).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao enviar arquivo do certificado PJ", { err });
        next(err);
      }
    },
  );

  router.get("/:id/file", requireCertificatePermission, async (request, response, next) => {
    try {
      const authContext = requireAuthenticatedRequestContext(request);
      const params = parseWithZod(certificatePjIdParamSchema, request.params);
      const result = await service.downloadCertificatePjFile({
        id: params.id,
        organizationId: authContext.organization_id,
      });

      response.setHeader("Cache-Control", "no-store");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${attachmentFileName(result.originalName)}"`,
      );
      response.type(result.mimeType).status(200).send(result.buffer);
    } catch (err: unknown) {
      logError("Erro ao baixar arquivo do certificado PJ", { err });
      next(err);
    }
  });

  router.delete(
    "/:id/file",
    requireCertificateDeletePermission,
    async (request, response, next) => {
      try {
        const authContext = requireAuthenticatedRequestContext(request);
        const params = parseWithZod(certificatePjIdParamSchema, request.params);
        const result = await service.deleteCertificatePjFile({
          id: params.id,
          organizationId: authContext.organization_id,
        });

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao remover arquivo do certificado PJ", { err });
        next(err);
      }
    },
  );

  router.delete("/:id", requireCertificatePermission, async (request, response, next) => {
    try {
      const authContext = requireAuthenticatedRequestContext(request);
      const params = parseWithZod(certificatePjIdParamSchema, request.params);
      const result = await service.deleteCertificatePj({
        id: params.id,
        organizationId: authContext.organization_id,
      });

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao excluir certificado PJ", { err });
      next(err);
    }
  });

  router.post("/", requireCertificatePermission, async (request, response, next) => {
    try {
      const authContext = requireAuthenticatedRequestContext(request);
      const data = parseWithZod(createCertificatePjSchema, request.body);
      const result = await service.createCertificatePj({
        organizationId: authContext.organization_id,
        data,
      });

      response.status(201).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao criar certificado PJ", { err });
      next(err);
    }
  });

  router.patch("/:id", requireCertificatePermission, async (request, response, next) => {
    try {
      const authContext = requireAuthenticatedRequestContext(request);
      const params = parseWithZod(certificatePjIdParamSchema, request.params);
      const data = parseWithZod(updateCertificatePjSchema, request.body);
      const result = await service.updateCertificatePj({
        id: params.id,
        organizationId: authContext.organization_id,
        data,
      });

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao atualizar certificado PJ", { err });
      next(err);
    }
  });

  router.delete("/:id", requireCertificatePermission, async (request, response, next) => {
    try {
      const authContext = requireAuthenticatedRequestContext(request);
      const params = parseWithZod(certificatePjIdParamSchema, request.params);
      const result = await service.deleteCertificatePj({
        id: params.id,
        organizationId: authContext.organization_id,
      });

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao excluir certificado PJ", { err });
      next(err);
    }
  });

  return router;
}
