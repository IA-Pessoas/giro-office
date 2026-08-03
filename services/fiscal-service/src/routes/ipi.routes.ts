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
  createIpiBodySchema,
  deleteIpiQuerySchema,
  detailIpiQuerySchema,
  listIpiQuerySchema,
  updateIpiBodySchema,
} from "../schemas/ipi.schemas.js";
import type { IpiService } from "../services/ipiService.js";

export type IpiRouteDeps = Pick<IpiService, "create" | "update" | "delete" | "detail" | "list">;

function firstQueryValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export function createIpiRoutes(service: IpiRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.post(
    "/ipi",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createIpiBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.create({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
          ...body,
        });

        res.status(201).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao criar IPI", { err });
        next(err);
      }
    },
  );

  router.put(
    "/ipi",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(updateIpiBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.update({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
          ...body,
        });

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao atualizar IPI", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/ipi",
    isAuthenticated,
    requireFiscalAdminPermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rawObj = { ipi_id: firstQueryValue(req.query.ipi_id) };
        const query = parseWithZod(deleteIpiQuerySchema, rawObj);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.delete({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
          ipi_id: query.ipi_id,
        });

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao excluir IPI", { err });
        next(err);
      }
    },
  );

  router.get("/ipi", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawObj = { ipi_id: firstQueryValue(req.query.ipi_id) };
      const query = parseWithZod(detailIpiQuerySchema, rawObj);
      const auth = requireAuthenticatedRequestContext(req);

      const result = await service.detail(query.ipi_id, auth.organization_id);

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao buscar IPI", { err });
      next(err);
    }
  });

  router.get(
    "/ipi/list",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rawObj = {
          ipiCodes: req.query.ipiCodes,
          page: req.query.page,
          page_size: req.query.page_size,
        };
        const query = parseWithZod(listIpiQuerySchema, rawObj);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.list(
          {
            ipiCodes: query.ipiCodes,
            page: query.page,
            page_size: query.page_size,
          },
          auth.organization_id,
        );

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar IPI", { err });
        next(err);
      }
    },
  );

  return router;
}
