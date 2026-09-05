import {
  createSuccessResponse,
  FORWARDED_AUTH_MODULES_HEADER,
  error as logError,
  parseModulePermissions,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  getRhPermissionLevel,
  RH_MANAGEMENT_PERMISSION,
  RH_SELF_SERVICE_PERMISSION,
} from "../middlewares/requireRhPermission.js";
import { operationalUserListQuerySchema } from "../schemas/operationalUser.schemas.js";
import { OperationalUserService } from "../services/operationalUserService.js";

const router: ReturnType<typeof Router> = Router();
const operationalUserService = new OperationalUserService();
const OPERATIONAL_USER_CATALOG_MODULES = [
  "rh",
  "contabil",
  "pessoal",
  "regularize",
  "ti",
  "integracao",
] as const;
const OPERATIONAL_USER_CATALOG_MIN_PERMISSION = RH_SELF_SERVICE_PERMISSION;

function getSingleHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requireOperationalUserCatalogPermission(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (getRhPermissionLevel(request) >= RH_MANAGEMENT_PERMISSION) {
    next();
    return;
  }

  const modules = parseModulePermissions(
    getSingleHeaderValue(
      request.headers[FORWARDED_AUTH_MODULES_HEADER] as string | string[] | undefined,
    ),
  );
  const canReadCatalog = OPERATIONAL_USER_CATALOG_MODULES.some(
    (moduleKey) => (modules?.[moduleKey] ?? 0) >= OPERATIONAL_USER_CATALOG_MIN_PERMISSION,
  );

  if (!canReadCatalog) {
    next(new ServiceError(403, "Permissao insuficiente para listar colaboradores operacionais."));
    return;
  }

  next();
}

router.get(
  "/",
  isAuthenticated,
  requireOperationalUserCatalogPermission,
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
