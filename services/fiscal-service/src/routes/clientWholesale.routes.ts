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
  clientWholesaleParamsSchema,
  updateClientWholesaleBodySchema,
} from "../schemas/clientWholesale.schemas.js";
import type { ClientWholesaleService } from "../services/clientWholesaleService.js";

export type ClientWholesaleRouteDeps = Pick<ClientWholesaleService, "get" | "set">;

export function createClientWholesaleRoutes(
  service: ClientWholesaleRouteDeps,
): ReturnType<typeof Router> {
  const router = Router();

  router.get(
    "/clients/:client_id/wholesale",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { client_id } = parseWithZod(clientWholesaleParamsSchema, req.params);
        const auth = requireAuthenticatedRequestContext(req);
        res.json(createSuccessResponse(await service.get(client_id, auth.organization_id)));
      } catch (err) {
        logError("Erro ao consultar condição de atacadista", { err });
        next(err);
      }
    },
  );

  router.put(
    "/clients/:client_id/wholesale",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { client_id } = parseWithZod(clientWholesaleParamsSchema, req.params);
        const { is_wholesale } = parseWithZod(updateClientWholesaleBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);
        const updated = await service.set({
          clientId: client_id,
          isWholesale: is_wholesale,
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });
        res.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao alterar condição de atacadista", { err });
        next(err);
      }
    },
  );

  return router;
}
