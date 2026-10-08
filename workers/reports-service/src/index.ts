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
async function processReportJobs(env: ReportsWorkerEnv, deadlineMs = 50_000) {
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
      deadlineMs,
    });
  });
}

const JOB_PATH = /^\/reports\/jobs(\/[^/]+)?$/;
let lastRequestDrain = 0;

/**
 * Os crons desta conta não disparam (2026-09-29): criar o job e o polling do status
 * também drenam a fila. O lease do job evita processamento em dobro entre isolates.
 * ponytail: waitUntil dura ~30 s após a resposta; job mais longo que isso fica para
 * o próximo lease. Remover quando o cron voltar a disparar.
 */
function drainOnJobRequest(request: Request, env: ReportsWorkerEnv, context?: ScheduledContext) {
  const { pathname } = new URL(request.url);
  if (!context || !JOB_PATH.test(pathname) || pathname.endsWith("/list")) return;
  if (!env.HYPERDRIVE?.connectionString && !env.DATABASE_URL) return;
  if (Date.now() - lastRequestDrain < 5_000) return;
  lastRequestDrain = Date.now();
  context.waitUntil(
    processReportJobs(env, 20_000).catch((error) =>
      console.error("[reports-service] drenagem da fila pela request falhou", error),
    ),
  );
}

export default {
  async fetch(request: Request, env: ReportsWorkerEnv, context?: ScheduledContext) {
    useSourceBindings(env);
    const response = await app.fetch(request, env, context as never);
    if (response.ok) drainOnJobRequest(request, env, context);
    return response;
  },
  scheduled(_event: unknown, env: ReportsWorkerEnv, context: ScheduledContext) {
    if (!env.HYPERDRIVE?.connectionString && !env.DATABASE_URL) {
      throw new Error("Fila de relatórios requer HYPERDRIVE ou DATABASE_URL.");
    }
    useSourceBindings(env);
    context.waitUntil(processReportJobs(env));
  },
};
