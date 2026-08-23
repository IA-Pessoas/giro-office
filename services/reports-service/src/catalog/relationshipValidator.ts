import { ServiceError } from "@workspace/shared";

import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";
import type { AuthorizedReportCatalog } from "./sourceCatalogService.js";

export class RelationshipValidator {
  validate(
    joins: ReportDefinition["joins"],
    sourceKeys: ReadonlySet<string>,
    catalog: AuthorizedReportCatalog,
  ): void {
    for (const join of joins) {
      const relation = catalog.relations.find((candidate) => candidate.key === join.relation);
      if (!relation || relation.sources.some((source) => !sourceKeys.has(source))) {
        throw new ServiceError(400, "A relação não está autorizada para as fontes selecionadas.");
      }
    }
  }
}
