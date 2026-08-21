import type {
  ReportCatalogRelation,
  ReportCatalogScope,
  ReportCatalogSource,
  ReportSourceAdapter,
} from "./types.js";

export interface AuthorizedReportCatalog {
  sources: readonly ReportCatalogSource[];
  relations: readonly ReportCatalogRelation[];
}

export class SourceCatalogService {
  constructor(private readonly adapters: readonly ReportSourceAdapter[]) {}

  getAuthorizedCatalog(scope: ReportCatalogScope): AuthorizedReportCatalog {
    const sources = this.adapters.flatMap((adapter) => {
      if (!adapter.isEnabled(scope)) return [];

      return adapter.sources.flatMap((source) => {
        if ((scope.modules[source.module] ?? 0) < source.minimum_permission) return [];

        const grantedFields = scope.grant?.sources[source.key];
        if (scope.grant && !grantedFields) return [];

        const fields = grantedFields
          ? source.fields.filter((field) => grantedFields.includes(field.key))
          : source.fields;

        return fields.length > 0 ? [{ ...source, fields }] : [];
      });
    });
    const sourceKeys = new Set(sources.map((source) => source.key));
    const relations = this.adapters.flatMap((adapter) => {
      if (!adapter.isEnabled(scope)) return [];

      return adapter.relations.filter(
        (relation) =>
          relation.sources.every((source) => sourceKeys.has(source)) &&
          (!scope.grant || scope.grant.relations.includes(relation.key)),
      );
    });

    return { sources, relations };
  }

  findAdapterForSources(
    sourceKeys: readonly string[],
    scope: ReportCatalogScope,
  ): ReportSourceAdapter | undefined {
    const catalog = this.getAuthorizedCatalog(scope);
    const authorizedKeys = new Set(catalog.sources.map((source) => source.key));
    if (sourceKeys.some((source) => !authorizedKeys.has(source))) return undefined;

    return this.adapters.find(
      (adapter) =>
        adapter.isEnabled(scope) &&
        sourceKeys.every((source) => adapter.sources.some((candidate) => candidate.key === source)),
    );
  }
}
