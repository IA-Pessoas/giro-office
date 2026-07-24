import {
  createSuccessResponse,
  error as logError,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  RH_MANAGEMENT_PERMISSION,
  requireRhPermission,
} from "../middlewares/requireRhPermission.js";
import { OperationalUserService } from "../services/operationalUserService.js";

const router: ReturnType<typeof Router> = Router();
const operationalUserService = new OperationalUserService();

router.get(
  "/",
  isAuthenticated,
  requireRhPermission(RH_MANAGEMENT_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id } = requireAuthenticatedRequestContext(req, { statusCode: 400 });

      const result = await operationalUserService.list(organization_id);

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar colaboradores operacionais RH", { err });
      next(err);
    }
  },
);

export default router;
