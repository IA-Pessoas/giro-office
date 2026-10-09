import { setupAPIClient } from "@shared/services/api";

import { readSpreadsheetText } from "../utils/readSpreadsheetText";
import { unwrapFiscalEnvelope } from "./fiscalService.contract";

export type FiscalConferenceSource = "dominio" | "sefaz";

export interface FiscalConferenceRow {
  line: number;
  identity: string;
  access_key: string | null;
  issuer: string;
  model: string;
  series: string;
  number: string;
  value: string | null;
}

type Pair = { identity: string; dominio: FiscalConferenceRow; sefaz: FiscalConferenceRow };

export interface FiscalDocumentConference {
  status: "complete" | "partial";
  identity_rule: string;
  sources: Record<
    FiscalConferenceSource,
    {
      file_name: string;
      data_rows: number;
      accepted_rows: number;
      identity_columns: string[];
      value_column: boolean;
    }
  >;
  summary: {
    matched: number;
    divergent: number;
    only_dominio: number;
    only_sefaz: number;
    duplicates: number;
    discarded: number;
    errors: number;
  };
  totals: Record<FiscalConferenceSource, string | null>;
  matched: Pair[];
  divergent: (Pair & { differences: string[] })[];
  only_dominio: FiscalConferenceRow[];
  only_sefaz: FiscalConferenceRow[];
  duplicates: { identity: string; dominio: FiscalConferenceRow[]; sefaz: FiscalConferenceRow[] }[];
  discarded: { source: FiscalConferenceSource; line: number; reason: string }[];
  errors: { source: FiscalConferenceSource; line: number; message: string }[];
  file_name: string;
  csv: string;
}

export const fiscalConferenceService = {
  /** Conferência Domínio × SEFAZ: nada é gravado no servidor. */
  async compareDocuments(files: Record<FiscalConferenceSource, File>): Promise<FiscalDocumentConference> {
    const [dominio, sefaz] = await Promise.all([
      readSpreadsheetText(files.dominio),
      readSpreadsheetText(files.sefaz),
    ]);
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.post("/fiscal/conferences/documents", {
      dominio: { file_name: files.dominio.name, content: dominio },
      sefaz: { file_name: files.sefaz.name, content: sefaz },
    });
    return unwrapFiscalEnvelope<FiscalDocumentConference>(response.data);
  },
};
