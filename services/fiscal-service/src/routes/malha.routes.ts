import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import { createMemoryUploadMiddleware } from "@workspace/shared/upload";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated, requireFiscalWritePermission } from "../middlewares/isAuthenticated.js";
import {
  createMalhaBodySchema,
  listMalhasQuerySchema,
  malhaIdParamsSchema,
  updateMalhaBodySchema,
} from "../schemas/malha.schemas.js";
import {
  MALHA_ATTACHMENT_MAX_SIZE_BYTES,
  MALHA_ATTACHMENT_MIME_TYPES,
  type MalhaService,
} from "../services/malhaService.js";

export type MalhaRouteDeps = Pick<
  MalhaService,
  "create" | "update" | "list" | "detail" | "replaceAttachment" | "attachmentAccess"
>;

export function createMalhaRoutes(service: MalhaRouteDeps): ReturnType<typeof Router> {
  const router = Router();
  const upload = createMemoryUploadMiddleware({
    maxSizeBytes: MALHA_ATTACHMENT_MAX_SIZE_BYTES,
    allowedMimeTypes: [...MALHA_ATTACHMENT_MIME_TYPES],
    maxSizeErrorMessage: "Anexo excede o limite de 10 MB.",
    mimeTypeErrorMessage: "Formato do anexo não permitido.",
  });
  const actor = (req: Request) => {
    const auth = requireAuthenticatedRequestContext(req);
    return {
      userId: auth.user_id,
      organizationId: auth.organization_id,
      permission: auth.permission,
    };
  };

  router.post(
    "/malhas",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createMalhaBodySchema, req.body);
        res
          .status(201)
          .json(createSuccessResponse(await service.create({ ...body, ...actor(req) })));
      } catch (err) {
        logError("Erro ao cadastrar malha fiscal", { err });
        next(err);
      }
    },
  );

  router.get("/malhas/list", isAuthenticated, async (req: Request, res: Response, next) => {
    try {
      const query = parseWithZod(listMalhasQuerySchema, req.query);
      res.json(createSuccessResponse(await service.list(query, actor(req).organizationId)));
    } catch (err) {
      logError("Erro ao listar malhas fiscais", { err });
      next(err);
    }
  });

  router.get("/malhas/:id", isAuthenticated, async (req: Request, res: Response, next) => {
    try {
      const { id } = parseWithZod(malhaIdParamsSchema, req.params);
      res.json(createSuccessResponse(await service.detail(id, actor(req).organizationId)));
    } catch (err) {
      logError("Erro ao detalhar malha fiscal", { err });
      next(err);
    }
  });

  router.put(
    "/malhas/:id",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(malhaIdParamsSchema, req.params);
        const body = parseWithZod(updateMalhaBodySchema, req.body);
        res.json(createSuccessResponse(await service.update({ ...body, ...actor(req), id })));
      } catch (err) {
        logError("Erro ao atualizar malha fiscal", { err });
        next(err);
      }
    },
  );

  router.post(
    "/malhas/:id/attachment",
    isAuthenticated,
    requireFiscalWritePermission,
    upload.single("file"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(malhaIdParamsSchema, req.params);
        const file = req.file
          ? {
              bytes: req.file.buffer,
              mimetype: req.file.mimetype,
              originalname: req.file.originalname,
              size: req.file.size,
            }
          : undefined;
        res
          .status(201)
          .json(
            createSuccessResponse(await service.replaceAttachment({ ...actor(req), id, file })),
          );
      } catch (err) {
        logError("Erro ao anexar arquivo à malha fiscal", { err });
        next(err);
      }
    },
  );

  router.get(
    "/malhas/:id/attachment",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(malhaIdParamsSchema, req.params);
        res.setHeader("Cache-Control", "no-store");
        res.json(
          createSuccessResponse(await service.attachmentAccess(id, actor(req).organizationId)),
        );
      } catch (err) {
        logError("Erro ao gerar acesso ao anexo da malha fiscal", { err });
        next(err);
      }
    },
  );

  return router;
}
