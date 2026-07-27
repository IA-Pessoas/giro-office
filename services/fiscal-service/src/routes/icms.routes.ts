import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated, requireFiscalWritePermission } from "../middlewares/isAuthenticated.js";
import {
  createIcmsBodySchema,
  detailIcmsQuerySchema,
  listIcmsQuerySchema,
  updateIcmsBodySchema,
} from "../schemas/icms.schemas.js";
import type { IcmsService } from "../services/icmsService.js";

export type IcmsRouteDeps = Pick<IcmsService, "create" | "update" | "detail" | "list">;

function firstQueryValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export function createIcmsRoutes(service: IcmsRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.post(
    "/icms",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createIcmsBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.create({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
          ...body,
        });

        res.status(201).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao criar ICMS", { err });
        next(err);
      }
    },
  );

  router.put(
    "/icms",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(updateIcmsBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.update({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
          ...body,
        });

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao atualizar ICMS", { err });
        next(err);
      }
    },
  );

  router.get("/icms", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawObj = { icms_id: firstQueryValue(req.query.icms_id) };
      const query = parseWithZod(detailIcmsQuerySchema, rawObj);
      const auth = requireAuthenticatedRequestContext(req);

      const result = await service.detail(query.icms_id, auth.organization_id);

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao buscar ICMS", { err });
      next(err);
    }
  });

  router.get(
    "/icms/list",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rawObj = {
          icmsCodes: req.query.icmsCodes,
          page: req.query.page,
          page_size: req.query.page_size,
        };
        const query = parseWithZod(listIcmsQuerySchema, rawObj);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.list(
          {
            icmsCodes: query.icmsCodes,
            page: query.page,
            page_size: query.page_size,
          },
          auth.organization_id,
        );

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar ICMS", { err });
        next(err);
      }
    },
  );

  return router;
}
