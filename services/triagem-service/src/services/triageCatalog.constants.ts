export const TRIAGE_CATALOG_KINDS = [
  "JUSTIFICATION",
  "LINK_TYPE",
  "DELIVERY_METHOD",
  "STATE_SITE",
] as const;

export type TriageCatalogKind = (typeof TRIAGE_CATALOG_KINDS)[number];
