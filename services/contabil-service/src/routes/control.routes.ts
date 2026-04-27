import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  controlIdParamsSchema,
  createControlBodySchema,
  detailControlQuerySchema,
  updateControlFieldBodySchema,
} from "../schemas/control.schemas.js";
import type { ControlService } from "../services/controlService.js";

export type ControlRouteDeps = Pick<ControlService, "create" | "detail" | "updateField">;

/**
 * Express pode entregar query como string ou array (chave repetida). Para Zod, normalizamos a um único string.
 */
function firstQueryString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return firstQueryString(value[0]);
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

export function createControlRoutes(service: ControlRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.post(
    "/controls",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createControlBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);

        const { control, created } = await service.create({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
          clientId: body.client_id,
          competence: body.competence,
        });

        res.status(created ? 201 : 200).json(createSuccessResponse(control));
      } catch (err) {
        logError("Erro ao criar ou obter controle contábil", { err });
        next(err);
      }
    },
  );

  router.get(
    "/controls",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rawObj = {
          client_id: firstQueryString(req.query.client_id),
          competence: firstQueryString(req.query.competence),
        };
        const query = parseWithZod(detailControlQuerySchema, rawObj);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.detail(
          query.client_id,
          query.competence,
          auth.organization_id,
        );

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao buscar controle contábil", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/controls/:id",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(controlIdParamsSchema, req.params);
        const body = parseWithZod(updateControlFieldBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.updateField(params.id, body.field, body.value, {
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao atualizar campo do controle contábil", { err });
        next(err);
      }
    },
  );

  return router;
}
