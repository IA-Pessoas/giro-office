import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";
import { SourceCatalogService } from "./catalog/sourceCatalogService.js";
import { getReportsServiceEnv } from "./config/env.js";
import { ClientIntegrationAdapter } from "./integrations/clientIntegrationAdapter.js";
import { ContabilControlAdapter } from "./integrations/contabilControlAdapter.js";
import { FiscalIcmsAdapter } from "./integrations/fiscalIcmsAdapter.js";
import { FiscalIpiAdapter } from "./integrations/fiscalIpiAdapter.js";
import { FiscalNcmAdapter } from "./integrations/fiscalNcmAdapter.js";
import { ParcelamentoAdapter } from "./integrations/parcelamentoAdapter.js";
import { PessoalLddAdapter } from "./integrations/pessoalLddAdapter.js";
import { PessoalPayrollAdapter } from "./integrations/pessoalPayrollAdapter.js";
import { PessoalSituationsAdapter } from "./integrations/pessoalSituationsAdapter.js";
import { ProjectAdapter } from "./integrations/projectAdapter.js";
import { RegularizeLicenseAdapter } from "./integrations/regularizeLicenseAdapter.js";
import { RegularizeProcessAdapter } from "./integrations/regularizeProcessAdapter.js";
import { RhRequestAdapter } from "./integrations/rhRequestAdapter.js";
import { TaskAdapter } from "./integrations/taskAdapter.js";
import { UserAccessContextClient } from "./integrations/userAccessContextClient.js";
import { createReportsPrismaClient } from "./prisma/index.js";
import { ReportJobRepository } from "./prisma/reportJobRepository.js";
import { createReportAuditService } from "./services/reportAuditService.js";
import { ReportDefinitionService } from "./services/reportDefinitionService.js";
import { ReportExecutionService } from "./services/reportExecutionService.js";
import { ReportLifecycleService } from "./services/reportLifecycleService.js";
import { ReportWorkerService } from "./services/reportWorkerService.js";

const env = getReportsServiceEnv();
const logger = createLogger({
  service: "reports-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});
const prisma = createReportsPrismaClient(env.databaseUrl);
const audit = createReportAuditService(prisma as never, {
  enabled: env.auditEnabled,
  serviceUrl: env.auditServiceUrl,
  serviceToken: env.auditServiceToken,
  logger,
});
const catalog = new SourceCatalogService([
  new ParcelamentoAdapter(env),
  new ClientIntegrationAdapter(env),
  new ContabilControlAdapter(env),
  new TaskAdapter(env),
  new ProjectAdapter(env),
  new FiscalIcmsAdapter(env),
  new FiscalNcmAdapter(env),
  new FiscalIpiAdapter(env),
  new PessoalLddAdapter(env),
  new PessoalPayrollAdapter(env),
  new PessoalSituationsAdapter(env),
  new RegularizeLicenseAdapter(env),
  new RegularizeProcessAdapter(env),
  new RhRequestAdapter(env),
]);
const worker = new ReportWorkerService(
  new ReportJobRepository(prisma, env.workerLeaseSeconds, audit),
  prisma,
  new UserAccessContextClient(env),
  new ReportExecutionService(catalog, new ReportDefinitionService(catalog)),
  new ReportLifecycleService(prisma as never, audit),
  Math.max(1_000, Math.floor((env.workerLeaseSeconds * 1000) / 2)),
);

let polling = false;

setInterval(() => {
  if (polling) return;
  polling = true;
  void worker
    .expireDue()
    .then(() =>
      Promise.all(Array.from({ length: env.workerConcurrency }, () => worker.processNext())),
    )
    .then((processed) => {
      if (!processed.some(Boolean)) {
        logger.debug({ event: "worker.idle" }, "reports-service worker sem jobs pendentes");
      }
    })
    .catch((error: unknown) => {
      logger.error({ event: "worker.error", error }, "falha ao processar job de relatório");
    })
    .finally(() => {
      polling = false;
    });
}, env.workerPollIntervalMs);
