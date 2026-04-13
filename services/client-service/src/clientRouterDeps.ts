import type { PrismaClient } from "./generated/prisma/client.js";
import type { IClientService } from "./services/clientService.js";
import type { HistoryFileStorage } from "./services/historyStorageService.js";

export type ClientRouterDeps = {
  clientService: IClientService;
  prisma: PrismaClient;
  historyStorage: HistoryFileStorage;
};
