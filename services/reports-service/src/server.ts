import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createReportsApp } from "./app.js";
import { getReportsServiceEnv } from "./config/env.js";
import { CertificatePfAdapter } from "./integrations/certificatePfAdapter.js";
import { CertificatePjAdapter } from "./integrations/certificatePjAdapter.js";
import { ClientIntegrationAdapter } from "./integrations/clientIntegrationAdapter.js";
import { ContabilControlAdapter } from "./integrations/contabilControlAdapter.js";
import { ContabilRelationshipAdapter } from "./integrations/contabilRelationshipAdapter.js";
import { ContabilResponsiblesAdapter } from "./integrations/contabilResponsiblesAdapter.js";
import { FiscalIcmsAdapter } from "./integrations/fiscalIcmsAdapter.js";
import { FiscalIpiAdapter } from "./integrations/fiscalIpiAdapter.js";
import { FiscalNcmAdapter } from "./integrations/fiscalNcmAdapter.js";
import { ParcelamentoAdapter } from "./integrations/parcelamentoAdapter.js";
import { PessoalLddAdapter } from "./integrations/pessoalLddAdapter.js";
import { PessoalObligationsAdapter } from "./integrations/pessoalObligationsAdapter.js";
import { PessoalPayrollAdapter } from "./integrations/pessoalPayrollAdapter.js";
import { PessoalSituationsAdapter } from "./integrations/pessoalSituationsAdapter.js";
import { PessoalUnionsAdapter } from "./integrations/pessoalUnionsAdapter.js";
import { ProjectAdapter } from "./integrations/projectAdapter.js";
import { RegularizeLicenseAdapter } from "./integrations/regularizeLicenseAdapter.js";
import { RegularizeMunicipalTaxesAdapter } from "./integrations/regularizeMunicipalTaxesAdapter.js";
import { RegularizeProcessAdapter } from "./integrations/regularizeProcessAdapter.js";
import { RhAttendanceAdapter } from "./integrations/rhAttendanceAdapter.js";
import { RhHolidayAdapter } from "./integrations/rhHolidayAdapter.js";
import { RhRequestAdapter } from "./integrations/rhRequestAdapter.js";
import { TaskAdapter } from "./integrations/taskAdapter.js";
import { TiInventoryAdapter } from "./integrations/tiInventoryAdapter.js";
import { TiRequestsAdapter } from "./integrations/tiRequestsAdapter.js";
import { TiStockAdapter } from "./integrations/tiStockAdapter.js";
import { createReportsPrismaClient } from "./prisma/index.js";

const env = getReportsServiceEnv();
const logger = createLogger({
  service: "reports-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});
const prisma = createReportsPrismaClient(env.databaseUrl);
const app = createReportsApp({
  env,
  logger,
  prisma,
  reporting: {
    adapters: [
      new ParcelamentoAdapter(env),
      new ClientIntegrationAdapter(env),
      new ContabilControlAdapter(env),
      new ContabilRelationshipAdapter(env),
      new ContabilResponsiblesAdapter(env),
      new TaskAdapter(env),
      new ProjectAdapter(env),
      new CertificatePfAdapter(env),
      new FiscalIcmsAdapter(env),
      new CertificatePjAdapter(env),
      new FiscalNcmAdapter(env),
      new FiscalIpiAdapter(env),
      new PessoalLddAdapter(env),
      new PessoalPayrollAdapter(env),
      new PessoalSituationsAdapter(env),
      new PessoalObligationsAdapter(env),
      new PessoalUnionsAdapter(env),
      new RegularizeLicenseAdapter(env),
      new RegularizeProcessAdapter(env),
      new RhRequestAdapter(env),
      new RhAttendanceAdapter(env),
      new RhHolidayAdapter(env),
      new TiInventoryAdapter(env),
      new TiStockAdapter(env),
      new TiRequestsAdapter(env),
      new RegularizeMunicipalTaxesAdapter(env),
    ],
  },
});

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "reports-service rodando");
});
