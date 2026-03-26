import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
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
import type { RequestListOptions, RequestUpdateInput } from "../services/requestService.js";
import { RequestService } from "../services/requestService.js";

const router: ReturnType<typeof Router> = Router();
const requestService = new RequestService();

function singleQueryString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

router.post("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organization_id;
    const userId = req.user_id;
    if (!organizationId) {
      throw new ServiceError(400, "organization_id é obrigatório.");
    }
    if (!userId) {
      throw new ServiceError(400, "user_id é obrigatório.");
    }

    const body = parseWithZod(createRequestBodySchema, req.body);

    const result = await requestService.create({
      organization_id: organizationId,
      requester_user_id: userId,
      title: body.title,
      description: body.description,
      category_id: body.category_id,
      assigned_to_user_id: body.assigned_to_user_id,
      urgency: body.urgency,
    });

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao criar solicitação RH", { err });
    next(err);
  }
});

router.get("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organization_id;
    const userId = req.user_id;
    if (!organizationId) {
      throw new ServiceError(400, "organization_id é obrigatório.");
    }
    if (!userId) {
      throw new ServiceError(400, "user_id é obrigatório.");
    }

    const queryInput = {
      status: singleQueryString(req.query.status),
      category_id: singleQueryString(req.query.category_id),
      requester_user_id: singleQueryString(req.query.requester_user_id),
      assigned_to_user_id: singleQueryString(req.query.assigned_to_user_id),
    };
    const parsed = parseWithZod(listRequestQuerySchema, queryInput);

    const listOptions: RequestListOptions = {};
    if (parsed.status !== undefined) {
      listOptions.status = parsed.status;
    }
    if (parsed.category_id !== undefined) {
      listOptions.category_id = parsed.category_id;
    }
    if (parsed.requester_user_id !== undefined) {
      listOptions.requester_user_id = parsed.requester_user_id;
    }
    if (parsed.assigned_to_user_id !== undefined) {
      listOptions.assigned_to_user_id = parsed.assigned_to_user_id;
    }

    const result = await requestService.list(organizationId, listOptions);

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao listar solicitações RH", { err });
    next(err);
  }
});

router.get("/:id", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organization_id;
    const userId = req.user_id;
    if (!organizationId) {
      throw new ServiceError(400, "organization_id é obrigatório.");
    }
    if (!userId) {
      throw new ServiceError(400, "user_id é obrigatório.");
    }

    const params = parseWithZod(requestIdParamsSchema, req.params);

    const result = await requestService.getById(params.id, organizationId);
    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao buscar solicitação RH", { err });
    next(err);
  }
});

router.put("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organization_id;
    const userId = req.user_id;
    if (!organizationId) {
      throw new ServiceError(400, "organization_id é obrigatório.");
    }
    if (!userId) {
      throw new ServiceError(400, "user_id é obrigatório.");
    }

    const body = parseWithZod(updateRequestBodySchema, req.body);

    const updateInput: RequestUpdateInput = {
      id: body.id,
      organization_id: organizationId,
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
    logError("Erro ao atualizar solicitação RH", { err });
    next(err);
  }
});

router.delete("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organization_id;
    const userId = req.user_id;
    if (!organizationId) {
      throw new ServiceError(400, "organization_id é obrigatório.");
    }
    if (!userId) {
      throw new ServiceError(400, "user_id é obrigatório.");
    }

    const body = parseWithZod(deleteRequestBodySchema, req.body);

    const result = await requestService.delete({
      id: body.id,
      organization_id: organizationId,
    });

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao excluir solicitação RH", { err });
    next(err);
  }
});

export default router;
