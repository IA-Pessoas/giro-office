import { clientIntegrationReportingCatalog, ServiceError } from "@workspace/shared";
import { SourceCatalogService } from "../../../services/reports-service/src/catalog/sourceCatalogService.js";
import type {
  ReportCatalogRelation,
  ReportCatalogSource,
  ReportSourceAdapter,
} from "../../../services/reports-service/src/catalog/types.js";

const sources = clientIntegrationReportingCatalog.sources.map(
  ({ keys: _keys, ...source }) => source,
) as readonly ReportCatalogSource[];

const adapter: ReportSourceAdapter = {
  sources,
  relations: [] as readonly ReportCatalogRelation[],
  isEnabled: (scope) => (scope.modules.integracao ?? 0) >= 1,
  preview: async () => {
    throw new ServiceError(501, "A execução de fontes ainda não foi migrada para o Worker.");
  },
};

export function createReportsSourceCatalog(): SourceCatalogService {
  return new SourceCatalogService([adapter]);
}
