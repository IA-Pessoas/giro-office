import {
  createSuccessResponse,
  FORWARDED_AUTH_MODULES_HEADER,
  error as logError,
  parseModulePermissions,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  getRhPermissionLevel,
  RH_MANAGEMENT_PERMISSION,
} from "../middlewares/requireRhPermission.js";
import { OperationalUserService } from "../services/operationalUserService.js";

const router: ReturnType<typeof Router> = Router();
const operationalUserService = new OperationalUserService();
const OPERATIONAL_USER_CATALOG_MODULES = ["rh", "contabil"] as const;

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
    (moduleKey) => (modules?.[moduleKey] ?? 0) >= 1,
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

      const result = await operationalUserService.list(organization_id);

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar colaboradores operacionais RH", { err });
      next(err);
    }
  },
);

export default router;
