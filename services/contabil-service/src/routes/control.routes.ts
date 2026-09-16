import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated, requireContabilWritePermission } from "../middlewares/isAuthenticated.js";
import {
  controlCompetenceBodySchema,
  controlIdParamsSchema,
  createControlBodySchema,
  createYearControlsBodySchema,
  detailControlQuerySchema,
  listControlQuerySchema,
  updateControlFieldBodySchema,
} from "../schemas/control.schemas.js";
import type { ControlService } from "../services/controlService.js";

export type ControlRouteDeps = Pick<
  ControlService,
  | "archiveCompetence"
  | "completeAll"
  | "create"
  | "createYear"
  | "detail"
  | "list"
  | "restoreCompetence"
  | "updateField"
>;

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
    "/controls/year",
    isAuthenticated,
    requireContabilWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createYearControlsBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);
        res.json(
          createSuccessResponse(
            await service.createYear({
              userId: auth.user_id,
              organizationId: auth.organization_id,
              permission: auth.permission,
              clientId: body.client_id,
              year: body.year,
              confirmed: body.confirmed,
            }),
          ),
        );
      } catch (err) {
        logError("Erro ao criar controles contábeis anuais", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/controls",
    isAuthenticated,
    requireContabilWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(controlCompetenceBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);
        res.json(
          createSuccessResponse(
            await service.archiveCompetence({
              userId: auth.user_id,
              organizationId: auth.organization_id,
              permission: auth.permission,
              clientId: body.client_id,
              competence: body.competence,
            }),
          ),
        );
      } catch (err) {
        logError("Erro ao arquivar competência contábil", { err });
        next(err);
      }
    },
  );

  router.post(
    "/controls/restore",
    isAuthenticated,
    requireContabilWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(controlCompetenceBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);
        res.json(
          createSuccessResponse(
            await service.restoreCompetence({
              userId: auth.user_id,
              organizationId: auth.organization_id,
              permission: auth.permission,
              clientId: body.client_id,
              competence: body.competence,
            }),
          ),
        );
      } catch (err) {
        logError("Erro ao restaurar competência contábil", { err });
        next(err);
      }
    },
  );

  router.post(
    "/controls",
    isAuthenticated,
    requireContabilWritePermission,
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
    "/controls/list",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listControlQuerySchema, {
          competence: firstQueryString(req.query.competence),
        });
        const auth = requireAuthenticatedRequestContext(req);
        const result = await service.list(query.competence, auth.organization_id);

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar carteira operacional contábil", { err });
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
    "/controls/:id/items",
    isAuthenticated,
    requireContabilWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(controlIdParamsSchema, req.params);
        const auth = requireAuthenticatedRequestContext(req);
        res.json(
          createSuccessResponse(
            await service.completeAll(params.id, {
              userId: auth.user_id,
              organizationId: auth.organization_id,
              permission: auth.permission,
            }),
          ),
        );
      } catch (err) {
        logError("Erro ao concluir todos os itens do controle contábil", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/controls/:id",
    isAuthenticated,
    requireContabilWritePermission,
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
