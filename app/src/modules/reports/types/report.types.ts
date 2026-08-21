export type ReportsCatalogField = {
  key: string;
  label: string;
};

export type ReportsCatalogSource = {
  key: string;
  label: string;
  module: string;
  fields: ReportsCatalogField[];
};

export type ReportsCatalog = {
  items: ReportsCatalogSource[];
};

export type ReportsServiceError = {
  message: string;
  status?: number;
};
