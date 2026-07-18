import {
  createSuccessResponse,
  getSingleTrimmedQueryValue,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createRequestBodySchema,
  deleteRequestBodySchema,
  listRequestQuerySchema,
  requestIdParamsSchema,
  updateRequestBodySchema,
} from "../schemas/request.schemas.js";
import type {
  RequestCreateInput,
  RequestListOptions,
  RequestUpdateInput,
} from "../services/requestService.js";
import { RequestService } from "../services/requestService.js";

const router: ReturnType<typeof Router> = Router();
const requestService = new RequestService();

router.post("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
      statusCode: 400,
    });
    const body = parseWithZod(createRequestBodySchema, req.body);

    const createInput: RequestCreateInput = {
      organization_id,
      requester_user_id: user_id,
      title: body.title,
      description: body.description,
      category_id: body.category_id,
      urgency: body.urgency,
    };
    if (body.assigned_to_user_id !== undefined) {
      createInput.assigned_to_user_id = body.assigned_to_user_id;
    }

    const result = await requestService.create(createInput);

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao criar solicitacao RH", { err });
    next(err);
  }
});

router.get("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
      statusCode: 400,
    });
    const queryInput = {
      status: getSingleTrimmedQueryValue(req.query.status),
      category_id: getSingleTrimmedQueryValue(req.query.category_id),
      requester_user_id: getSingleTrimmedQueryValue(req.query.requester_user_id),
      assigned_to_user_id: getSingleTrimmedQueryValue(req.query.assigned_to_user_id),
    };
    const parsed = parseWithZod(listRequestQuerySchema, queryInput);

    const listOptions: RequestListOptions = {};
    if (parsed.status !== undefined) {
      listOptions.status = parsed.status;
    }
    if (parsed.category_id !== undefined) {
      listOptions.category_id = parsed.category_id;
    }
    const canManageRequests = await requestService.canManageRequests(organization_id, user_id);
    if (!canManageRequests) {
      listOptions.requester_user_id = user_id;
    } else if (parsed.requester_user_id !== undefined) {
      listOptions.requester_user_id = parsed.requester_user_id;
    }
    if (parsed.assigned_to_user_id !== undefined) {
      listOptions.assigned_to_user_id = parsed.assigned_to_user_id;
    }

    const result = await requestService.list(organization_id, listOptions);

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao listar solicitacoes RH", { err });
    next(err);
  }
});

router.get("/:id", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { organization_id } = requireAuthenticatedRequestContext(req, { statusCode: 400 });
    const params = parseWithZod(requestIdParamsSchema, req.params);

    const result = await requestService.getById(params.id, organization_id);
    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao buscar solicitacao RH", { err });
    next(err);
  }
});

router.put("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { organization_id } = requireAuthenticatedRequestContext(req, { statusCode: 400 });
    const body = parseWithZod(updateRequestBodySchema, req.body);

    const updateInput: RequestUpdateInput = {
      id: body.id,
      organization_id,
    };
    if (body.title !== undefined) {
      updateInput.title = body.title;
    }
    if (body.description !== undefined) {
      updateInput.description = body.description;
    }
    if (body.category_id !== undefined) {
      updateInput.category_id = body.category_id;
    }
    if (body.assigned_to_user_id !== undefined) {
      updateInput.assigned_to_user_id = body.assigned_to_user_id;
    }
    if (body.urgency !== undefined) {
      updateInput.urgency = body.urgency;
    }
    if (body.status !== undefined) {
      updateInput.status = body.status;
    }

    const result = await requestService.update(updateInput);

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao atualizar solicitacao RH", { err });
    next(err);
  }
});

router.delete("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { organization_id } = requireAuthenticatedRequestContext(req, { statusCode: 400 });
    const body = parseWithZod(deleteRequestBodySchema, req.body);

    const result = await requestService.delete({
      id: body.id,
      organization_id,
    });

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao excluir solicitacao RH", { err });
    next(err);
  }
});

export default router;
