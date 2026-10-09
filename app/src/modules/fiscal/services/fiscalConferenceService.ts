import { setupAPIClient } from "@shared/services/api";

import { readSpreadsheetText } from "../utils/readSpreadsheetText";
import { fileToBase64 } from "../utils/xmlSelection";
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
  status: string | null;
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

export interface FiscalXmlSelection {
  status: "complete" | "partial";
  file_name: string;
  zip_base64: string | null;
  csv: string;
  selected: { request: string; entry: string; identity: string; access_key: string | null }[];
  ambiguous: { request: string; reason: string; candidates: { entry: string; identity: string }[] }[];
  not_found: { request: string }[];
  invalid_requests: { request: string; reason: string }[];
  repeated_requests: string[];
  archive: {
    file_name: string;
    entries: number;
    nfe_entries: number;
    discarded: { entry: string; reason: string }[];
    errors: { entry: string; message: string }[];
    duplicates: { identity: string; entries: string[]; identical: boolean }[];
  };
}

export interface FiscalXmlNoteRow {
  entry: string;
  identity: string;
  access_key: string | null;
  value: string | null;
  protocol_status: string | null;
}

type SefazXmlPair = {
  identity: string;
  match_key: string;
  sefaz: FiscalConferenceRow;
  xml: FiscalXmlNoteRow;
  notes: string[];
};

type SefazXmlIssue<T> = ({ source: "sefaz"; line: number } | { source: "xml"; entry: string }) & T;

export interface FiscalSefazXmlConference {
  status: "complete" | "partial";
  identity_rule: string;
  sources: {
    sefaz: FiscalDocumentConference["sources"]["sefaz"];
    xml: { file_name: string; entries: number; nfe_entries: number };
  };
  summary: {
    matched: number;
    divergent: number;
    only_sefaz: number;
    only_xml: number;
    duplicates: number;
    not_comparable: number;
    discarded: number;
    errors: number;
  };
  totals: { sefaz: string | null; xml: string | null };
  matched: SefazXmlPair[];
  divergent: (SefazXmlPair & { differences: string[] })[];
  only_sefaz: FiscalConferenceRow[];
  only_xml: FiscalXmlNoteRow[];
  duplicates: { identity: string; sefaz: FiscalConferenceRow[]; xml: FiscalXmlNoteRow[] }[];
  not_comparable: {
    identity: string;
    reason: string;
    sefaz: FiscalConferenceRow[];
    xml: FiscalXmlNoteRow[];
  }[];
  discarded: SefazXmlIssue<{ reason: string }>[];
  errors: SefazXmlIssue<{ message: string }>[];
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

  /** Seleção de XML em ZIP: devolve o ZIP só com as notas pedidas e o relatório. */
  async selectXml({ file, requests }: { file: File; requests: string[] }): Promise<FiscalXmlSelection> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.post("/fiscal/conferences/xml-selection", {
      file_name: file.name,
      zip_base64: await fileToBase64(file),
      requests,
    });
    return unwrapFiscalEnvelope<FiscalXmlSelection>(response.data);
  },

  /** Conferência CSV SEFAZ × XML NF-e: nada é gravado no servidor. */
  async compareSefazXml({ sefaz, xml }: { sefaz: File; xml: File }): Promise<FiscalSefazXmlConference> {
    const [content, zipBase64] = await Promise.all([readSpreadsheetText(sefaz), fileToBase64(xml)]);
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.post("/fiscal/conferences/sefaz-xml", {
      sefaz: { file_name: sefaz.name, content },
      xml: { file_name: xml.name, zip_base64: zipBase64 },
    });
    return unwrapFiscalEnvelope<FiscalSefazXmlConference>(response.data);
  },
};
