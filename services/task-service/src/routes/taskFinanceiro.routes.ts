import {
  createSuccessResponse,
  error as logError,
  normalizeModulePermission,
  parseWithZod,
  requireAuthenticatedRequestContext,
  zNonEmptyText,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  financeiroCollectorsBodySchema,
  financeiroCollectorsQuerySchema,
  financeiroExpressBodySchema,
  financeiroQueueQuerySchema,
  financeiroSettlementBodySchema,
} from "../schemas/financeiroTaskUpdateBody.schema.js";
import { TaskFinanceiroService } from "../services/taskFinanceiroService.js";

const router: ReturnType<typeof Router> = Router();
const taskFinanceiroService = new TaskFinanceiroService();

function requestContext(req: Request) {
  const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
  return {
    user_id,
    organization_id,
    integracao_level: normalizeModulePermission(req.modules?.integracao),
    is_owner: req.user_type === "owner",
  };
}

function idempotencyKey(req: Request): string {
  return parseWithZod(zNonEmptyText("Idempotency-Key").max(255), req.get("Idempotency-Key"));
}

router.get(
  "/financeiro/queue",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(financeiroQueueQuerySchema, req.query);
      const result = await taskFinanceiroService.listQueue({ ...requestContext(req), ...query });
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar fila financeira", { err });
      next(err);
    }
  },
);

router.put(
  "/financeiro/collectors",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(financeiroCollectorsBodySchema, req.body);
      const result = await taskFinanceiroService.setCollectors({ ...requestContext(req), ...body });
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao configurar cobradores financeiros", { err });
      next(err);
    }
  },
);

router.get(
  "/financeiro/collectors",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(financeiroCollectorsQuerySchema, req.query);
      const result = await taskFinanceiroService.listCollectors({
        ...requestContext(req),
        ...query,
      });
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar cobradores financeiros", { err });
      next(err);
    }
  },
);

router.post(
  "/financeiro/settle",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(financeiroSettlementBodySchema, req.body);
      const result = await taskFinanceiroService.settle({
        ...requestContext(req),
        ...body,
        idempotency_key: idempotencyKey(req),
      });
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao executar baixa financeira", { err });
      next(err);
    }
  },
);

router.post(
  "/financeiro/express",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(financeiroExpressBodySchema, req.body);
      const result = await taskFinanceiroService.settleExpress({
        ...requestContext(req),
        ...body,
        idempotency_key: idempotencyKey(req),
      });
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao executar Baixa Express", { err });
      next(err);
    }
  },
);

export { router as taskFinanceiroRoutes };
