import {
  createSuccessResponse,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  parseWithZod,
  REQUEST_ID_HEADER,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import { type Request, Router } from "express";

import {
  createReportModelSchema,
  reportModelIdParamsSchema,
  updateReportModelSchema,
} from "../schemas/reportModel.schemas.js";
import type { ReportAuthorizationService } from "../services/reportAuthorizationService.js";
import type { ReportModelService } from "../services/reportModelService.js";

export function createReportModelRouter(options: {
  modelService: ReportModelService;
  authorizationService: ReportAuthorizationService;
}): ReturnType<typeof Router> {
  const router = Router();

  const getContext = (request: Request) => {
    const userId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
    const organizationId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
    requireAuthenticatedRequestContext({
      user_id: userId,
      organization_id: organizationId,
    });
    return { userId: userId ?? "", organizationId: organizationId ?? "" };
  };

  router.post("/models", async (request, response) => {
    const context = getContext(request);
    const body = parseWithZod(createReportModelSchema, request.body);
    const definition = (
      await options.authorizationService.validateDefinition({
        ...context,
        requestId: request.get(REQUEST_ID_HEADER) ?? "reports-model-create",
        definition: body.definition,
      })
    ).definition;

    response
      .status(201)
      .json(
        createSuccessResponse(
          await options.modelService.create({ ...context, name: body.name, definition }),
        ),
      );
  });

  router.get("/models/list", async (request, response) => {
    const context = getContext(request);
    const models = await options.modelService.list(context);
    const items = await Promise.all(
      models.map(async (model) => {
        try {
          await options.authorizationService.validateDefinition({
            ...context,
            requestId: request.get(REQUEST_ID_HEADER) ?? "reports-model-list",
            definition: model.definition,
          });
          return model;
        } catch (error) {
          if (error instanceof ServiceError && error.statusCode === 403) return null;
          throw error;
        }
      }),
    );

    response.json(createSuccessResponse({ items: items.filter((model) => model !== null) }));
  });

  router.get("/models/:id", async (request, response) => {
    const context = getContext(request);
    const { id } = parseWithZod(reportModelIdParamsSchema, request.params);
    const model = await options.modelService.get({ ...context, id });
    await options.authorizationService.validateDefinition({
      ...context,
      requestId: request.get(REQUEST_ID_HEADER) ?? "reports-model-get",
      definition: model.definition,
    });
    response.json(createSuccessResponse(model));
  });

  router.patch("/models/:id", async (request, response) => {
    const context = getContext(request);
    const { id } = parseWithZod(reportModelIdParamsSchema, request.params);
    const body = parseWithZod(updateReportModelSchema, request.body);
    const existing = await options.modelService.get({ ...context, id });
    const definition = (
      await options.authorizationService.validateDefinition({
        ...context,
        requestId: request.get(REQUEST_ID_HEADER) ?? "reports-model-update",
        definition: body.definition ?? existing.definition,
      })
    ).definition;

    response.json(
      createSuccessResponse(
        await options.modelService.update({ ...context, id, name: body.name, definition }),
      ),
    );
  });

  router.delete("/models/:id", async (request, response) => {
    const context = getContext(request);
    const { id } = parseWithZod(reportModelIdParamsSchema, request.params);
    await options.modelService.delete({ ...context, id });
    response.status(204).send();
  });

  return router;
}
