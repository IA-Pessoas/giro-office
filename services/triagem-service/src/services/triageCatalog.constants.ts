export const TRIAGE_CATALOG_KINDS = [
  "JUSTIFICATION",
  "LINK_TYPE",
  "DELIVERY_METHOD",
  "STATE_SITE",
  "REQUEST_CATEGORY",
] as const;

export const TRIAGE_CATALOG_CODE_MAX_LENGTH = 100;

export type TriageCatalogKind = (typeof TRIAGE_CATALOG_KINDS)[number];
