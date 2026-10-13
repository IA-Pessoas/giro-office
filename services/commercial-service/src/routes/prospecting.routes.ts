import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import { validateUploadFileSignature } from "@workspace/shared/upload";
import { type Request, Router } from "express";
import multer from "multer";
import {
  PROSPECTING_ATTACHMENT_MIME_TYPES,
  type ProspectingAttachmentMimeType,
} from "../integrations/prospectingAttachmentStorage.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createProspectingBodySchema,
  prospectingIdParamSchema,
  updateProspectingBodySchema,
} from "../schemas/prospecting.schemas.js";
import type { CommercialProspectingService } from "../services/prospectingService.js";

export type CommercialProspectingRouteDeps = Pick<
  CommercialProspectingService,
  | "archive"
  | "attachmentAccess"
  | "create"
  | "detail"
  | "history"
  | "list"
  | "listClients"
  | "update"
  | "uploadAttachment"
>;

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(_request, file, callback) {
    if (
      !PROSPECTING_ATTACHMENT_MIME_TYPES.includes(file.mimetype as ProspectingAttachmentMimeType)
    ) {
      callback(new ServiceError(400, "Tipo de arquivo não permitido."));
      return;
    }
    callback(null, true);
  },
});

function parseAttachment(
  request: Request,
  response: Parameters<import("express").RequestHandler>[1],
  next: Parameters<import("express").RequestHandler>[2],
): void {
  attachmentUpload.single("file")(request, response, (err) => {
    if (err instanceof multer.MulterError) {
      next(
        new ServiceError(
          400,
          err.code === "LIMIT_FILE_SIZE" ? "Arquivo excede o limite de 10 MB." : "Upload inválido.",
        ),
      );
      return;
    }
    if (err) {
      next(err);
      return;
    }
    if (!request.file) {
      next(new ServiceError(400, "Arquivo é obrigatório."));
      return;
    }
    try {
      validateUploadFileSignature(request.file);
      next();
    } catch (validationError) {
      next(validationError);
    }
  });
}

function authContext(req: Request): {
  user_id: string;
  organization_id: string;
  audit_correlation_id?: string;
} {
  const context = requireAuthenticatedRequestContext(req, {
    statusCode: 401,
    userIdMessage: "Contexto de autenticação inválido.",
    organizationIdMessage: "Contexto de autenticação inválido.",
  }) as { user_id: string; organization_id: string };
  return {
    ...context,
    ...(req.requestId ? { audit_correlation_id: req.requestId } : {}),
  };
}

export function createProspectingRoutes(
  service: CommercialProspectingRouteDeps,
): ReturnType<typeof Router> {
  const router = Router();

  router.get("/clients", isAuthenticated, async (req, res, next) => {
    try {
      const { organization_id } = authContext(req);
      res.json(createSuccessResponse(await service.listClients(organization_id)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/", isAuthenticated, async (req, res, next) => {
    try {
      const { organization_id } = authContext(req);
      res.json(createSuccessResponse(await service.list(organization_id)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/history", isAuthenticated, async (req, res, next) => {
    try {
      const { organization_id } = authContext(req);
      const { id } = parseWithZod(prospectingIdParamSchema, req.params);
      res.json(createSuccessResponse(await service.history(id, organization_id)));
    } catch (error) {
      logError("Falha ao consultar histórico de prospecção", { err: error });
      next(error);
    }
  });

  router.get("/:id/attachment", isAuthenticated, async (req, res, next) => {
    try {
      const { organization_id } = authContext(req);
      const { id } = parseWithZod(prospectingIdParamSchema, req.params);
      res.json(createSuccessResponse(await service.attachmentAccess(id, organization_id)));
    } catch (error) {
      logError("Falha ao consultar anexo de prospecção", { err: error });
      next(error);
    }
  });

  router.put("/:id/attachment", isAuthenticated, parseAttachment, async (req, res, next) => {
    try {
      const { user_id, organization_id } = authContext(req);
      const { id } = parseWithZod(prospectingIdParamSchema, req.params);
      const file = req.file;
      if (!file) throw new ServiceError(400, "Arquivo é obrigatório.");
      res.json(
        createSuccessResponse(
          await service.uploadAttachment({
            user_id,
            organization_id,
            prospecting_id: id,
            file: {
              buffer: file.buffer,
              mimetype: file.mimetype as ProspectingAttachmentMimeType,
              originalname: file.originalname,
            },
          }),
        ),
      );
    } catch (error) {
      logError("Falha ao enviar anexo de prospecção", { err: error });
      next(error);
    }
  });

  router.get("/:id", isAuthenticated, async (req, res, next) => {
    try {
      const { organization_id } = authContext(req);
      const { id } = parseWithZod(prospectingIdParamSchema, req.params);
      res.json(createSuccessResponse(await service.detail(id, organization_id)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/", isAuthenticated, async (req, res, next) => {
    try {
      const { user_id, organization_id, audit_correlation_id } = authContext(req);
      const body = parseWithZod(createProspectingBodySchema, req.body);
      const result = await service.create({
        user_id,
        organization_id,
        audit_correlation_id,
        ...body,
      });
      res.status(201).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", isAuthenticated, async (req, res, next) => {
    try {
      const { user_id, organization_id, audit_correlation_id } = authContext(req);
      const { id } = parseWithZod(prospectingIdParamSchema, req.params);
      const body = parseWithZod(updateProspectingBodySchema, req.body);
      const result = await service.update({
        user_id,
        organization_id,
        audit_correlation_id,
        prospecting_id: id,
        ...body,
      });
      res.json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", isAuthenticated, async (req, res, next) => {
    try {
      const { user_id, organization_id, audit_correlation_id } = authContext(req);
      const { id } = parseWithZod(prospectingIdParamSchema, req.params);
      const result = await service.archive({
        user_id,
        organization_id,
        audit_correlation_id,
        prospecting_id: id,
      });
      res.json(createSuccessResponse(result));
    } catch (error) {
      logError("Erro na rota de arquivamento de prospecção comercial", { err: error });
      next(error);
    }
  });

  return router;
}
