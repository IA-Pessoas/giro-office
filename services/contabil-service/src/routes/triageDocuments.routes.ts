import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  triageDocumentItemBodySchema,
  triageDocumentsBulkBodySchema,
  triageEditabilityRequestSchema,
  triageMonthlyIdParamsSchema,
  triageMonthlyRequestSchema,
  triageStatementArchiveBodySchema,
  triageStatementBodySchema,
} from "../schemas/triageDocuments.schemas.js";
import type {
  TriageDocumentItemUpdate,
  TriageDocumentsService,
} from "../services/triageDocumentsService.js";

export type TriageDocumentsRouteDeps = Pick<
  TriageDocumentsService,
  | "getMonthly"
  | "getEditability"
  | "getOrCreateMonthly"
  | "updateItem"
  | "updateAll"
  | "listStatements"
  | "upsertStatement"
  | "archiveStatement"
>;

function authenticatedContext(request: Request) {
  const auth = requireAuthenticatedRequestContext(request);
  return {
    userId: auth.user_id,
    organizationId: auth.organization_id,
    permission: auth.permission,
    modules: request.modules,
  };
}

export function createTriageDocumentsRoutes(
  service: TriageDocumentsRouteDeps,
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/editability",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(triageEditabilityRequestSchema, req.query);
        res.json(
          createSuccessResponse(
            await service.getEditability(query.client_id, authenticatedContext(req), query.type),
          ),
        );
      } catch (err) {
        logError("Erro ao verificar permissão de edição da Triagem", { err });
        next(err);
      }
    },
  );

  router.get(
    "/monthly",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(triageMonthlyRequestSchema, req.query);
        const auth = authenticatedContext(req);
        res.json(createSuccessResponse(await service.getMonthly(query, auth.organizationId)));
      } catch (err) {
        logError("Erro ao buscar pendência documental mensal", { err });
        next(err);
      }
    },
  );

  router.post(
    "/monthly",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(triageMonthlyRequestSchema, req.body);
        const auth = authenticatedContext(req);
        res.json(createSuccessResponse(await service.getOrCreateMonthly(body, auth)));
      } catch (err) {
        logError("Erro ao criar pendência documental mensal", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/monthly/:id/item",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(triageMonthlyIdParamsSchema, req.params);
        const body = parseWithZod(triageDocumentItemBodySchema, req.body);
        res.json(
          createSuccessResponse(
            await service.updateItem(
              params.id,
              body as TriageDocumentItemUpdate,
              authenticatedContext(req),
            ),
          ),
        );
      } catch (err) {
        logError("Erro ao atualizar documento contábil", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/monthly/:id/items",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(triageMonthlyIdParamsSchema, req.params);
        const body = parseWithZod(triageDocumentsBulkBodySchema, req.body);
        res.json(
          createSuccessResponse(
            await service.updateAll(params.id, body, authenticatedContext(req)),
          ),
        );
      } catch (err) {
        logError("Erro ao atualizar documentos contábeis", { err });
        next(err);
      }
    },
  );

  router.get(
    "/statements",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(triageMonthlyRequestSchema, req.query);
        const auth = authenticatedContext(req);
        res.json(createSuccessResponse(await service.listStatements(query, auth.organizationId)));
      } catch (err) {
        logError("Erro ao listar extratos bancários", { err });
        next(err);
      }
    },
  );

  router.put(
    "/statements",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(triageStatementBodySchema, req.body);
        res.json(
          createSuccessResponse(await service.upsertStatement(body, authenticatedContext(req))),
        );
      } catch (err) {
        logError("Erro ao atualizar extrato bancário", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/statements",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(triageStatementArchiveBodySchema, req.body);
        res.json(
          createSuccessResponse(await service.archiveStatement(body, authenticatedContext(req))),
        );
      } catch (err) {
        logError("Erro ao arquivar marcador de extrato bancário", { err });
        next(err);
      }
    },
  );

  return router;
}
