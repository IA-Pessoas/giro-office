import {
  createSuccessResponse,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { RequestHandler } from "express";
import { Router } from "express";

import {
  MarketingPermissionLevel,
  requireMarketingPermission,
} from "../middlewares/requireMarketingPermission.js";
import {
  createMarketingPasswordBodySchema,
  importMarketingPasswordsBodySchema,
  marketingPasswordConfirmationSchema,
  marketingPasswordIdParamsSchema,
  updateMarketingPasswordBodySchema,
} from "../schemas/marketingPassword.schemas.js";
import type { MarketingPasswordService } from "../services/marketingPasswordService.js";

export type MarketingPasswordProvider = Pick<
  MarketingPasswordService,
  | "list"
  | "detail"
  | "create"
  | "update"
  | "reveal"
  | "export"
  | "importLegacyRecords"
  | "listImportReconciliation"
>;

export function createMarketingPasswordRoutes(
  passwordService: MarketingPasswordProvider,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  const viewer = requireMarketingPermission(MarketingPermissionLevel.Viewer);
  const editor = requireMarketingPermission(MarketingPermissionLevel.Editor);

  router.get("/passwords/list", authenticate, viewer, async (request, response) => {
    const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
    response.json(createSuccessResponse(await passwordService.list(organizationId)));
  });

  router.get("/passwords/:id", authenticate, viewer, async (request, response) => {
    const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
    const { id } = parseWithZod(marketingPasswordIdParamsSchema, request.params);
    response.json(createSuccessResponse(await passwordService.detail(organizationId, id)));
  });

  router.post("/passwords", authenticate, editor, async (request, response) => {
    const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
    const body = parseWithZod(createMarketingPasswordBodySchema, request.body);
    response
      .status(201)
      .json(createSuccessResponse(await passwordService.create(organizationId, body)));
  });

  router.patch("/passwords/:id", authenticate, editor, async (request, response) => {
    const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
    const { id } = parseWithZod(marketingPasswordIdParamsSchema, request.params);
    const body = parseWithZod(updateMarketingPasswordBodySchema, request.body);
    response.json(createSuccessResponse(await passwordService.update(organizationId, id, body)));
  });

  router.post("/passwords/:id/reveal", authenticate, editor, async (request, response) => {
    const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
    const { id } = parseWithZod(marketingPasswordIdParamsSchema, request.params);
    const body = parseWithZod(marketingPasswordConfirmationSchema, request.body);
    response.json(
      createSuccessResponse(await passwordService.reveal(organizationId, id, body.confirmed)),
    );
  });

  router.post("/passwords/:id/export", authenticate, editor, async (request, response) => {
    const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
    const { id } = parseWithZod(marketingPasswordIdParamsSchema, request.params);
    const body = parseWithZod(marketingPasswordConfirmationSchema, request.body);
    response.json(
      createSuccessResponse(await passwordService.export(organizationId, id, body.confirmed)),
    );
  });

  router.post("/passwords/import", authenticate, editor, async (request, response) => {
    const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
    const body = parseWithZod(importMarketingPasswordsBodySchema, request.body);
    response
      .status(201)
      .json(
        createSuccessResponse(
          await passwordService.importLegacyRecords(organizationId, body.records),
        ),
      );
  });

  router.get(
    "/passwords/import/reconciliation",
    authenticate,
    editor,
    async (request, response) => {
      const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
      response.json(
        createSuccessResponse(await passwordService.listImportReconciliation(organizationId)),
      );
    },
  );

  return router;
}
