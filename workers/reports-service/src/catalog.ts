import type { SourceCatalogService } from "../../../services/reports-service/src/catalog/sourceCatalogService.js";
import { createWorkerSourceCatalog } from "../../../services/reports-service/src/workerCatalog.js";
import { type ReportsWorkerEnv, toReportsServiceEnv } from "./env.js";

export function createReportsSourceCatalog(
  env: Partial<ReportsWorkerEnv> = {},
): SourceCatalogService {
  return createWorkerSourceCatalog(toReportsServiceEnv(env));
}
