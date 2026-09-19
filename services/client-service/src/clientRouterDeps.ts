import type { RequestHandler } from "express";
import type { PrismaClient } from "./generated/prisma/client.js";
import type { IClientService } from "./services/clientService.js";
import type { CnpjLookupProvider } from "./services/cnpjLookupService.js";
import type { HistoryFileStorage } from "./services/historyStorageService.js";

export type ClientRouterDeps = {
  clientService: IClientService;
  prisma: PrismaClient;
  historyStorage: HistoryFileStorage;
  cnpjLookupProvider?: CnpjLookupProvider;
  historyUploadRateLimit?: RequestHandler;
};
