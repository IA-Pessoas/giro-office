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
  RH_MANAGEMENT_PERMISSION,
  requireRhPermission,
} from "../middlewares/requireRhPermission.js";
import { OperationalUserService } from "../services/operationalUserService.js";
import { operationalUserListQuerySchema } from "../schemas/operationalUser.schemas.js";

const router: ReturnType<typeof Router> = Router();
const operationalUserService = new OperationalUserService();

router.get(
  "/",
  isAuthenticated,
  requireRhPermission(RH_MANAGEMENT_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id } = requireAuthenticatedRequestContext(req, { statusCode: 400 });
      const query = parseWithZod(operationalUserListQuerySchema, req.query);
      const context = {
        ...(query.department_id ? { departmentId: query.department_id } : {}),
        ...(query.department_name ? { departmentName: query.department_name } : {}),
        ...(query.module ? { module: query.module } : {}),
      };

      const result = await operationalUserService.list(
        organization_id,
        Object.keys(context).length > 0 ? context : undefined,
      );

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar colaboradores operacionais RH", { err });
      next(err);
    }
  },
);

export default router;
