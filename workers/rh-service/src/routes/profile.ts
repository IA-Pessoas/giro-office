import {
  contactDeleteBodySchema,
  contactTargetBodySchema,
  contactUpdateBodySchema,
  dossierListQuerySchema,
  dossierTargetQuerySchema,
  dossierUpdateBodySchema,
  replaceAllergiesBodySchema,
} from "@workspace/rh-service/src/schemas/employeeDossier.schemas.js";
import { parseWithZod } from "@workspace/shared";
import { createSuccessResponse } from "@workspace/shared/http";
import { requireRhPermission } from "../auth.js";
import { EmployeeDossierService } from "../services/employeeDossierService.js";
import {
  jsonBody,
  RH_SELF_SERVICE_PERMISSION,
  type RhApp,
  type RhContext,
  type RhRouteDeps,
  rhPermissionLevel,
} from "./shared.js";

/** Contexto do dossiê como `getContext` de `employeeDossier.routes.ts`, após a permissão mínima. */
function dossierContext(c: RhContext) {
  const auth = c.get("auth");
  requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
  return {
    actorUserId: auth.userId,
    organizationId: auth.organizationId,
    rhPermission: rhPermissionLevel(auth),
  };
}

/** `/rh/profile/*` (dossiê do colaborador), paridade com `employeeDossier.routes.ts`. */
export function registerProfileRoutes(app: RhApp, deps: RhRouteDeps): void {
  const run = <T>(c: RhContext, fn: (service: EmployeeDossierService) => Promise<T>) =>
    deps.withDb(c, (db) => fn(new EmployeeDossierService(db)));

  app.get("/rh/profile/colaborator", async (c) => {
    const context = dossierContext(c);
    const query = parseWithZod(dossierTargetQuerySchema, c.req.query());
    const data = await run(c, (service) =>
      service.getDossier({ ...context, targetUserId: query.user_id ?? context.actorUserId }),
    );
    return c.json(createSuccessResponse(data));
  });

  app.get("/rh/profile/colaborator/list", async (c) => {
    const context = dossierContext(c);
    const query = parseWithZod(dossierListQuerySchema, c.req.query());
    const data = await run(c, (service) =>
      service.listDossiers({ ...context, departmentId: query.department_id }),
    );
    return c.json(createSuccessResponse(data));
  });

  app.put("/rh/profile/colaborator", async (c) => {
    const context = dossierContext(c);
    const body = parseWithZod(dossierUpdateBodySchema, await jsonBody(c));
    const { target_user_id: targetUserId, ...changes } = body;
    const data = await run(c, (service) =>
      service.updateDossier({
        ...context,
        targetUserId: targetUserId ?? context.actorUserId,
        changes,
      }),
    );
    return c.json(createSuccessResponse(data));
  });

  app.get("/rh/profile/contact", async (c) => {
    const context = dossierContext(c);
    const query = parseWithZod(dossierTargetQuerySchema, c.req.query());
    const data = await run(c, (service) =>
      service.listContacts({ ...context, targetUserId: query.user_id ?? context.actorUserId }),
    );
    return c.json(createSuccessResponse(data));
  });

  app.post("/rh/profile/contact", async (c) => {
    const context = dossierContext(c);
    const { target_user_id: targetUserId, ...contact } = parseWithZod(
      contactTargetBodySchema,
      await jsonBody(c),
    );
    const data = await run(c, (service) =>
      service.createContact({
        ...context,
        targetUserId: targetUserId ?? context.actorUserId,
        contact,
      }),
    );
    return c.json(createSuccessResponse(data));
  });

  app.put("/rh/profile/contact", async (c) => {
    const context = dossierContext(c);
    const { target_user_id: targetUserId, ...contact } = parseWithZod(
      contactUpdateBodySchema,
      await jsonBody(c),
    );
    const data = await run(c, (service) =>
      service.updateContact({
        ...context,
        targetUserId: targetUserId ?? context.actorUserId,
        contact,
      }),
    );
    return c.json(createSuccessResponse(data));
  });

  app.delete("/rh/profile/contact", async (c) => {
    const context = dossierContext(c);
    const { target_user_id: targetUserId, ...contact } = parseWithZod(
      contactDeleteBodySchema,
      await jsonBody(c),
    );
    const data = await run(c, (service) =>
      service.deleteContact({
        ...context,
        targetUserId: targetUserId ?? context.actorUserId,
        contact,
      }),
    );
    return c.json(createSuccessResponse(data));
  });

  app.get("/rh/profile/allergy", async (c) => {
    const context = dossierContext(c);
    const query = parseWithZod(dossierTargetQuerySchema, c.req.query());
    const data = await run(c, (service) =>
      service.listAllergies({ ...context, targetUserId: query.user_id ?? context.actorUserId }),
    );
    return c.json(createSuccessResponse(data));
  });

  app.put("/rh/profile/allergy", async (c) => {
    const context = dossierContext(c);
    const body = parseWithZod(replaceAllergiesBodySchema, await jsonBody(c));
    const data = await run(c, (service) =>
      service.replaceAllergies({
        ...context,
        targetUserId: body.target_user_id ?? context.actorUserId,
        allergies: body.allergies,
      }),
    );
    return c.json(createSuccessResponse(data));
  });
}
