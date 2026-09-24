import { operationalUserListQuerySchema } from "@workspace/rh-service/src/schemas/operationalUser.schemas.js";
import { parseWithZod } from "@workspace/shared";
import { createSuccessResponse, ServiceError } from "@workspace/shared/http";
import { OperationalUserService } from "../services/operationalUserService.js";
import { canManageRh, RH_SELF_SERVICE_PERMISSION, type RhApp, type RhRouteDeps } from "./shared.js";

/** Módulos cujo acesso libera o catálogo, como em `operationalUser.routes.ts` do Node. */
const OPERATIONAL_USER_CATALOG_MODULES = [
  "rh",
  "contabil",
  "financeiro",
  "pessoal",
  "regularize",
  "ti",
  "integracao",
  "triagem",
] as const;

export function registerOperationalUserRoutes(app: RhApp, deps: RhRouteDeps): void {
  app.get("/rh/operational-users", async (c) => {
    const auth = c.get("auth");
    const modules = auth.claims.modules as Record<string, number | undefined>;
    const canReadCatalog =
      canManageRh(auth) ||
      OPERATIONAL_USER_CATALOG_MODULES.some(
        (key) => (modules[key] ?? 0) >= RH_SELF_SERVICE_PERMISSION,
      );
    if (!canReadCatalog) {
      throw new ServiceError(403, "Permissao insuficiente para listar colaboradores operacionais.");
    }
    const query = parseWithZod(operationalUserListQuerySchema, c.req.query());
    const context = {
      ...(query.department_id ? { departmentId: query.department_id } : {}),
      ...(query.department_name ? { departmentName: query.department_name } : {}),
      ...(query.module ? { module: query.module } : {}),
    };
    const result = await deps.withDb(c, (db) =>
      new OperationalUserService(db).list(
        auth.organizationId,
        Object.keys(context).length > 0 ? context : undefined,
      ),
    );
    return c.json(createSuccessResponse(result));
  });
}
