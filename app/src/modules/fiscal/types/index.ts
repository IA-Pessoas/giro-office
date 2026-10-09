import type { PaginatedResult } from "@shared/pagination/pagination";

export type FiscalTabId =
  | "search"
  | "controls"
  | "annual"
  | "ncm"
  | "icms"
  | "ipi"
  | "rates"
  | "revenues";

export interface FiscalNcm {
  id: string;
  tax_regime: string;
  ncm_code: string;
  federal_taxation_type: string;
  description: string;
  ncm_notes: string | null;
  cst_pis_outgoing: string | null;
  cst_cofins_outgoing: string | null;
  product_group: string | null;
  validity_start_date: string;
  information_source: string | null;
  reference_legislation: string | null;
  validity_end_date: string | null;
}

export interface FiscalIcms {
  id: string;
  state: string;
  item_number: string | null;
  cest_code: string | null;
  description: string;
  interstate_agreement: string | null;
  applied_original_mva: string | null;
  adjusted_mva: string | null;
  original_mva: string | null;
}

export interface FiscalIpi {
  id: string;
  ncm: string;
  ex: string | null;
  description: string | null;
  aliquot: string | null;
}

export interface FiscalNcmSearchResult {
  ncm: FiscalNcm | null;
  icms: FiscalIcms[];
  ipi: FiscalIpi[];
}

export interface FiscalNcmListFilters {
  ncmCodes?: string[];
  page?: number;
  page_size?: number;
}

export interface FiscalIcmsListFilters {
  icmsCodes?: string[];
  page?: number;
  page_size?: number;
}

export interface FiscalIpiListFilters {
  ipiCodes?: string[];
  page?: number;
  page_size?: number;
}

export type FiscalNcmListResult = PaginatedResult<FiscalNcm>;
export type FiscalIcmsListResult = PaginatedResult<FiscalIcms>;
export type FiscalIpiListResult = PaginatedResult<FiscalIpi>;

export interface FiscalNcmSearchFilters {
  ncmCode?: string;
}

export interface CreateFiscalNcmPayload {
  tax_regime: string;
  ncm_code: string;
  federal_taxation_type: string;
  description: string;
  ncm_notes?: string | null;
  cst_pis_outgoing?: string | null;
  cst_cofins_outgoing?: string | null;
  product_group?: string | null;
  validity_start_date: string;
  information_source?: string | null;
  reference_legislation?: string | null;
  validity_end_date?: string | null;
}

export interface UpdateFiscalNcmPayload extends CreateFiscalNcmPayload {
  ncm_id: string;
}

export interface CreateFiscalIcmsPayload {
  state: string;
  item_number?: string | null;
  cest_code?: string | null;
  description: string;
  interstate_agreement?: string | null;
  applied_original_mva?: string | null;
  adjusted_mva?: string | null;
  original_mva?: string | null;
}

export interface UpdateFiscalIcmsPayload extends CreateFiscalIcmsPayload {
  icms_id: string;
}

export interface CreateFiscalIpiPayload {
  ncm: string;
  ex?: string | null;
  description?: string | null;
  aliquot?: string | null;
}

export interface UpdateFiscalIpiPayload extends CreateFiscalIpiPayload {
  ipi_id: string;
}
