import type { RegularizeServiceEnv } from "../config/env.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { RegularizeReconciliationService } from "../services/regularizeReconciliationService.js";

export interface RegularizeRouteDeps {
  prisma: PrismaClient;
  env: RegularizeServiceEnv;
  reconciliationService: RegularizeReconciliationService;
}
