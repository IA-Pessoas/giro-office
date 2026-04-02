import { ServiceError } from "@workspace/shared";
import type { Request } from "express";
import { z } from "zod";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { IClientService } from "../services/clientService.js";
import type { HistoryFileStorage } from "../services/historyStorage.js";

export type ClientRouterDeps = {
  clientService: IClientService;
  prisma: PrismaClient;
  historyStorage: HistoryFileStorage;
};

export function resolveOrganizationId(
  request: Request,
  queryOrganizationId: string | undefined,
): string {
  const fromQuery = queryOrganizationId;
  const fromToken = request.organization_id?.trim() ? request.organization_id : undefined;
  const resolved = fromQuery ?? fromToken;
  if (!resolved) {
    throw new ServiceError(400, "organization_id é obrigatório (query ou token).");
  }
  if (fromToken && fromQuery && fromToken !== fromQuery) {
    throw new ServiceError(403, "organization_id da query não corresponde ao token.");
  }
  return resolved;
}

export const pendingListQuerySchema = z
  .object({
    user_id: z.string().uuid().optional(),
  })
  .strict();

export const pendingDeleteParamsSchema = z
  .object({
    pendingId: z.string().uuid(),
  })
  .strict();

