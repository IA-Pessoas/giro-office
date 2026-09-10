import {
  createSuccessResponse,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { Request } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createProposalConfigBodySchema,
  proposalConfigIdParamSchema,
  updateProposalConfigBodySchema,
} from "../schemas/proposalConfig.schemas.js";
import type { CommercialProposalConfigService } from "../services/proposalConfigService.js";

export type CommercialProposalConfigRouteDeps = Pick<
  CommercialProposalConfigService,
  "create" | "detail" | "list" | "update"
>;

function authContext(req: Request): { user_id: string; organization_id: string } {
  return requireAuthenticatedRequestContext(req, {
    statusCode: 401,
    userIdMessage: "Contexto de autenticação inválido.",
    organizationIdMessage: "Contexto de autenticação inválido.",
  });
}

export function createProposalConfigRoutes(
  service: CommercialProposalConfigRouteDeps,
): ReturnType<typeof Router> {
  const router = Router();

  router.get("/", isAuthenticated, async (req, res, next) => {
    try {
      const { organization_id } = authContext(req);
      res.json(createSuccessResponse(await service.list(organization_id)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", isAuthenticated, async (req, res, next) => {
    try {
      const { organization_id } = authContext(req);
      const { id } = parseWithZod(proposalConfigIdParamSchema, req.params);
      res.json(createSuccessResponse(await service.detail(id, organization_id)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/", isAuthenticated, async (req, res, next) => {
    try {
      const { user_id, organization_id } = authContext(req);
      const body = parseWithZod(createProposalConfigBodySchema, req.body);
      const result = await service.create({ user_id, organization_id, ...body });
      res.status(201).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", isAuthenticated, async (req, res, next) => {
    try {
      const { user_id, organization_id } = authContext(req);
      const { id } = parseWithZod(proposalConfigIdParamSchema, req.params);
      const body = parseWithZod(updateProposalConfigBodySchema, req.body);
      const result = await service.update({ user_id, organization_id, config_id: id, ...body });
      res.json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
