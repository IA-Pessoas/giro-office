import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import type { ClientRouterDeps } from "../clientRouterDeps.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { clientCoringaQuerySchema } from "../schemas/clientCoringa.schemas.js";
import { createCoringaPdf } from "../services/clientCoringaPdf.js";
import {
  coringaWhere,
  iterateCoringaClients,
  listCoringaClients,
} from "../services/clientCoringaService.js";
import { hasClientListModuleAccess } from "../utils/moduleAuthorization.js";
import { resolveOrganizationId } from "../utils/organizationContext.js";

export function createClientCoringaRouter({ prisma }: ClientRouterDeps): Router {
  const router = Router();

  function authorizedOrganizationId(
    request: Request,
    queryOrganizationId: string | undefined,
  ): string {
    if (!request.organization_id?.trim()) {
      throw new ServiceError(403, "Organização autenticada obrigatória para a Lista Coringa.");
    }
    const organizationId = resolveOrganizationId(request, queryOrganizationId);
    if (
      request.user_type !== "owner" &&
      (request.permission ?? 0) < 1 &&
      !hasClientListModuleAccess(request.modules)
    ) {
      throw new ServiceError(403, "Usuário não possui permissão para este domínio.");
    }
    return organizationId;
  }

  router.get(
    "/coringa/list",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(clientCoringaQuerySchema, request.query);
        const organizationId = authorizedOrganizationId(request, query.organization_id);
        const page = await listCoringaClients(prisma, organizationId, query);
        response.json(createSuccessResponse(page));
      } catch (err) {
        logError("Erro ao listar clientes da Lista Coringa", { err });
        next(err);
      }
    },
  );

  router.get(
    "/coringa/pdf",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(clientCoringaQuerySchema, request.query);
        const organizationId = authorizedOrganizationId(request, query.organization_id);
        const total = await prisma.client.count({ where: coringaWhere(organizationId, query) });
        const batches = iterateCoringaClients(prisma, organizationId, query);
        const first = await batches.next();
        const pdf = createCoringaPdf(total);
        response.setHeader("Content-Type", "application/pdf");
        response.setHeader("Content-Disposition", 'attachment; filename="clientes-coringa.pdf"');
        pdf.document.pipe(response);
        if (!first.done) {
          for (const row of first.value) pdf.append(row);
        }
        for await (const batch of batches) {
          if (response.destroyed) {
            pdf.document.destroy();
            return;
          }
          for (const row of batch) pdf.append(row);
        }
        pdf.end();
      } catch (err) {
        logError("Erro ao exportar Lista Coringa em PDF", { err });
        if (response.headersSent) {
          response.destroy(err instanceof Error ? err : undefined);
        } else {
          next(err);
        }
      }
    },
  );

  return router;
}
