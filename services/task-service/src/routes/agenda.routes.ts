import {
  createSuccessResponse,
  error as logError,
  normalizeModulePermission,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { nodeDeps } from "../nodeDeps.js";
import {
  agendaCreateBodySchema,
  agendaDeleteBodySchema,
  agendaListQuerySchema,
  agendaUpdateBodySchema,
} from "../schemas/agenda.schemas.js";
import { AGENDA_LEVEL, AgendaService } from "../services/agendaService.js";

type AgendaRouteService = Pick<AgendaService, "list" | "create" | "update" | "remove">;

function scope(req: Request, module: Parameters<AgendaService["list"]>[0]["module"]) {
  const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
  return {
    userId: user_id,
    organizationId: organization_id,
    module,
    level:
      req.user_type === "owner"
        ? AGENDA_LEVEL.OWNER
        : normalizeModulePermission(req.modules?.[module]),
  };
}

export function createAgendaRoutes(service: AgendaRouteService): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/agenda",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { module, month, mine } = parseWithZod(agendaListQuerySchema, req.query);
        res.json(
          createSuccessResponse(await service.list(scope(req, module), month, mine === "true")),
        );
      } catch (err) {
        logError("Erro ao listar agenda", { err });
        next(err);
      }
    },
  );

  router.post(
    "/agenda",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { module, ...event } = parseWithZod(agendaCreateBodySchema, req.body);
        res
          .status(201)
          .json(createSuccessResponse(await service.create(scope(req, module), event)));
      } catch (err) {
        logError("Erro ao criar compromisso da agenda", { err });
        next(err);
      }
    },
  );

  router.put(
    "/agenda",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { module, agenda_id, ...event } = parseWithZod(agendaUpdateBodySchema, req.body);
        res.json(createSuccessResponse(await service.update(scope(req, module), agenda_id, event)));
      } catch (err) {
        logError("Erro ao atualizar compromisso da agenda", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/agenda",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { module, agenda_id } = parseWithZod(agendaDeleteBodySchema, req.body);
        res.json(createSuccessResponse(await service.remove(scope(req, module), agenda_id)));
      } catch (err) {
        logError("Erro ao remover compromisso da agenda", { err });
        next(err);
      }
    },
  );

  return router;
}

export const agendaRoutes: ReturnType<typeof Router> = createAgendaRoutes(
  new AgendaService(nodeDeps.prisma, nodeDeps.audit),
);
