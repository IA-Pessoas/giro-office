import { SourceCatalogService } from "./catalog/sourceCatalogService.js";
import type { ReportsServiceEnv } from "./config/env.js";
import { ClientIntegrationAdapter } from "./integrations/clientIntegrationAdapter.js";
import { ContabilControlAdapter } from "./integrations/contabilControlAdapter.js";
import { FiscalIcmsAdapter } from "./integrations/fiscalIcmsAdapter.js";
import { FiscalIpiAdapter } from "./integrations/fiscalIpiAdapter.js";
import { FiscalNcmAdapter } from "./integrations/fiscalNcmAdapter.js";
import { ParcelamentoAdapter } from "./integrations/parcelamentoAdapter.js";
import { PessoalLddAdapter } from "./integrations/pessoalLddAdapter.js";
import { PessoalObligationsAdapter } from "./integrations/pessoalObligationsAdapter.js";
import { PessoalPayrollAdapter } from "./integrations/pessoalPayrollAdapter.js";
import { PessoalUnionsAdapter } from "./integrations/pessoalUnionsAdapter.js";
import { ProjectAdapter } from "./integrations/projectAdapter.js";
import { RegularizeLicenseAdapter } from "./integrations/regularizeLicenseAdapter.js";
import { RegularizeMunicipalTaxesAdapter } from "./integrations/regularizeMunicipalTaxesAdapter.js";
import { RegularizeProcessAdapter } from "./integrations/regularizeProcessAdapter.js";
import { RhHolidayAdapter } from "./integrations/rhHolidayAdapter.js";
import { RhRequestAdapter } from "./integrations/rhRequestAdapter.js";
import { TaskAdapter } from "./integrations/taskAdapter.js";
import { TiInventoryAdapter } from "./integrations/tiInventoryAdapter.js";
import { TiRequestsAdapter } from "./integrations/tiRequestsAdapter.js";

export function createWorkerSourceCatalog(env: ReportsServiceEnv): SourceCatalogService {
  return new SourceCatalogService([
    new ParcelamentoAdapter(env),
    new ClientIntegrationAdapter(env),
    new ContabilControlAdapter(env),
    new TaskAdapter(env),
    new ProjectAdapter(env),
    new FiscalIcmsAdapter(env),
    new FiscalNcmAdapter(env),
    new FiscalIpiAdapter(env),
    new PessoalLddAdapter(env),
    new PessoalObligationsAdapter(env),
    new PessoalPayrollAdapter(env),
    new PessoalUnionsAdapter(env),
    new RegularizeLicenseAdapter(env),
    new RegularizeProcessAdapter(env),
    new RhRequestAdapter(env),
    new RhHolidayAdapter(env),
    new TiInventoryAdapter(env),
    new TiRequestsAdapter(env),
    new RegularizeMunicipalTaxesAdapter(env),
  ]);
}
