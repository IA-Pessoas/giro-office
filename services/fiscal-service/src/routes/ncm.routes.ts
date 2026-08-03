import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import {
  isAuthenticated,
  requireFiscalAdminPermission,
  requireFiscalWritePermission,
} from "../middlewares/isAuthenticated.js";
import {
  createNcmBodySchema,
  deleteNcmQuerySchema,
  detailNcmQuerySchema,
  listNcmQuerySchema,
  updateNcmBodySchema,
} from "../schemas/ncm.schemas.js";
import type { NcmService } from "../services/ncmService.js";

export type NcmRouteDeps = Pick<NcmService, "create" | "update" | "delete" | "detail" | "list">;

function firstQueryValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export function createNcmRoutes(service: NcmRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.post(
    "/ncm",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createNcmBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.create({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
          ...body,
        });

        res.status(201).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao criar NCM", { err });
        next(err);
      }
    },
  );

  router.put(
    "/ncm",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(updateNcmBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.update({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
          ...body,
        });

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao atualizar NCM", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/ncm",
    isAuthenticated,
    requireFiscalAdminPermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rawObj = { ncm_id: firstQueryValue(req.query.ncm_id) };
        const query = parseWithZod(deleteNcmQuerySchema, rawObj);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.delete({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
          ncm_id: query.ncm_id,
        });

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao excluir NCM", { err });
        next(err);
      }
    },
  );

  router.get("/ncm", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawObj = { ncm_id: firstQueryValue(req.query.ncm_id) };
      const query = parseWithZod(detailNcmQuerySchema, rawObj);
      const auth = requireAuthenticatedRequestContext(req);

      const result = await service.detail(query.ncm_id, auth.organization_id);

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao buscar NCM", { err });
      next(err);
    }
  });

  router.get(
    "/ncm/list",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rawObj = {
          ncmCodes: req.query.ncmCodes,
          page: req.query.page,
          page_size: req.query.page_size,
        };
        const query = parseWithZod(listNcmQuerySchema, rawObj);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.list(
          {
            ncmCodes: query.ncmCodes,
            page: query.page,
            page_size: query.page_size,
          },
          auth.organization_id,
        );

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar NCM", { err });
        next(err);
      }
    },
  );

  return router;
}
