import { withWorkerPrisma } from "@workspace/runtime";
import { UserAccessContextClient } from "../../../services/reports-service/src/integrations/userAccessContextClient.js";
import { ReportJobRepository } from "../../../services/reports-service/src/prisma/reportJobRepository.js";
import { ReportDefinitionService } from "../../../services/reports-service/src/services/reportDefinitionService.js";
import { ReportExecutionService } from "../../../services/reports-service/src/services/reportExecutionService.js";
import { ReportLifecycleService } from "../../../services/reports-service/src/services/reportLifecycleService.js";
import { ReportWorkerService } from "../../../services/reports-service/src/services/reportWorkerService.js";
import { createAudit, createReportsWorkerApp } from "./app.js";
import { createReportsSourceCatalog } from "./catalog.js";
import { type ReportsWorkerEnv, toReportsServiceEnv } from "./env.js";
import { drainReportJobs } from "./jobs.js";
import { PrismaClient } from "./prisma.js";
import { routeSourceFetch } from "./sourceFetch.js";

export { createReportsWorkerApp } from "./app.js";

type ScheduledContext = { waitUntil(promise: Promise<unknown>): void };

const app = createReportsWorkerApp();
const networkFetch = globalThis.fetch;

/** Os adapters Node usam o `fetch` global; o env (e seus bindings) é o mesmo no isolate. */
function useSourceBindings(env: ReportsWorkerEnv) {
  globalThis.fetch = routeSourceFetch(env as never, networkFetch);
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Substitui o processo `worker.ts` do Node, que fazia polling da fila de jobs. */
async function processReportJobs(env: ReportsWorkerEnv) {
  await withWorkerPrisma(env, PrismaClient, async (prisma) => {
    const leaseSeconds = positiveInteger(env.REPORTS_WORKER_LEASE_SECONDS, 120);
    const audit = createAudit(prisma as never, env);
    const catalog = createReportsSourceCatalog(env);
    const worker = new ReportWorkerService(
      new ReportJobRepository(prisma as never, leaseSeconds, audit),
      prisma as never,
      new UserAccessContextClient(toReportsServiceEnv(env)),
      new ReportExecutionService(catalog, new ReportDefinitionService(catalog)),
      new ReportLifecycleService(prisma as never, audit),
      Math.max(1_000, Math.floor((leaseSeconds * 1000) / 2)),
    );
    await drainReportJobs(worker, {
      concurrency: positiveInteger(env.REPORTS_WORKER_CONCURRENCY, 2),
      deadlineMs: 50_000,
    });
  });
}

export default {
  fetch(request: Request, env: ReportsWorkerEnv, context?: ScheduledContext) {
    useSourceBindings(env);
    return app.fetch(request, env, context as never);
  },
  scheduled(_event: unknown, env: ReportsWorkerEnv, context: ScheduledContext) {
    if (!env.HYPERDRIVE?.connectionString && !env.DATABASE_URL) {
      throw new Error("Fila de relatórios requer HYPERDRIVE ou DATABASE_URL.");
    }
    useSourceBindings(env);
    context.waitUntil(processReportJobs(env));
  },
};
