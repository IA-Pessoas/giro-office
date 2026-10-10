import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
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

function withLoggedError(message: string, handler: RequestHandler): RequestHandler {
  return async (request, response, next) => {
    try {
      await handler(request, response, next);
    } catch (error: unknown) {
      logError(message, { err: error });
      next(error instanceof Error ? error : new ServiceError(500));
    }
  };
}

export function createMarketingPasswordRoutes(
  passwordService: MarketingPasswordProvider,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  const viewer = requireMarketingPermission(MarketingPermissionLevel.Viewer);
  const editor = requireMarketingPermission(MarketingPermissionLevel.Editor);

  router.get(
    "/passwords/list",
    authenticate,
    viewer,
    withLoggedError("Falha ao listar credenciais de Marketing.", async (request, response) => {
      const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
      response.json(createSuccessResponse(await passwordService.list(organizationId)));
    }),
  );

  router.get(
    "/passwords/:id",
    authenticate,
    viewer,
    withLoggedError("Falha ao consultar credencial de Marketing.", async (request, response) => {
      const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
      const { id } = parseWithZod(marketingPasswordIdParamsSchema, request.params);
      response.json(createSuccessResponse(await passwordService.detail(organizationId, id)));
    }),
  );

  router.post(
    "/passwords",
    authenticate,
    editor,
    withLoggedError("Falha ao criar credencial de Marketing.", async (request, response) => {
      const { organization_id: organizationId, user_id: userId } =
        requireAuthenticatedRequestContext(request);
      const body = parseWithZod(createMarketingPasswordBodySchema, request.body);
      response
        .status(201)
        .json(createSuccessResponse(await passwordService.create(organizationId, body, userId)));
    }),
  );

  router.patch(
    "/passwords/:id",
    authenticate,
    editor,
    withLoggedError("Falha ao atualizar credencial de Marketing.", async (request, response) => {
      const { organization_id: organizationId, user_id: userId } =
        requireAuthenticatedRequestContext(request);
      const { id } = parseWithZod(marketingPasswordIdParamsSchema, request.params);
      const body = parseWithZod(updateMarketingPasswordBodySchema, request.body);
      response.json(
        createSuccessResponse(await passwordService.update(organizationId, id, body, userId)),
      );
    }),
  );

  router.post(
    "/passwords/:id/reveal",
    authenticate,
    editor,
    withLoggedError("Falha ao revelar credencial de Marketing.", async (request, response) => {
      const { organization_id: organizationId, user_id: userId } =
        requireAuthenticatedRequestContext(request);
      const { id } = parseWithZod(marketingPasswordIdParamsSchema, request.params);
      const body = parseWithZod(marketingPasswordConfirmationSchema, request.body);
      response.json(
        createSuccessResponse(
          await passwordService.reveal(organizationId, id, body.confirmed, userId),
        ),
      );
    }),
  );

  router.post(
    "/passwords/:id/export",
    authenticate,
    editor,
    withLoggedError("Falha ao exportar credencial de Marketing.", async (request, response) => {
      const { organization_id: organizationId, user_id: userId } =
        requireAuthenticatedRequestContext(request);
      const { id } = parseWithZod(marketingPasswordIdParamsSchema, request.params);
      const body = parseWithZod(marketingPasswordConfirmationSchema, request.body);
      response.json(
        createSuccessResponse(
          await passwordService.export(organizationId, id, body.confirmed, userId),
        ),
      );
    }),
  );

  router.post(
    "/passwords/import",
    authenticate,
    editor,
    withLoggedError(
      "Falha ao importar credenciais legadas de Marketing.",
      async (request, response) => {
        const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
        const body = parseWithZod(importMarketingPasswordsBodySchema, request.body);
        response
          .status(201)
          .json(
            createSuccessResponse(
              await passwordService.importLegacyRecords(organizationId, body.records),
            ),
          );
      },
    ),
  );

  router.get(
    "/passwords/import/reconciliation",
    authenticate,
    editor,
    withLoggedError(
      "Falha ao listar reconciliações de credenciais de Marketing.",
      async (request, response) => {
        const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
        response.json(
          createSuccessResponse(await passwordService.listImportReconciliation(organizationId)),
        );
      },
    ),
  );

  return router;
}
